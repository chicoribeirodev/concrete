// app/api/pdm-extrato/route.ts
//
// GET /api/pdm-extrato?projectId=1&format=pdf&layers=layerA,layerB
//
// Gera um extrato da Planta de Ordenamento do PDM (Plano Diretor Municipal)
// do município de um projeto, enquadrado no limite do prédio, a partir do
// WMS público do geoportal desse município — ver lib/pdm-sources.ts.
//
// Portugal não tem um WMS nacional único para isto: cada câmara municipal
// publica o seu próprio PDM no seu próprio geoportal. Esta rota só serve
// municípios confirmados em lib/pdm-sources.ts; para os restantes devolve
// 501 com o motivo, em vez de tentar adivinhar um endpoint.
//
// `layers` é opcional e vem do seletor de camadas em PdmExtractModal (lista
// obtida via /api/capabilities): uma lista separada por vírgulas de nomes de
// camada WMS a desenhar no lugar da camada única configurada em
// PDM_SOURCES. Em `format=pdf`, cada camada fica na sua própria página, com
// a sua própria legenda — não sobrepostas na mesma imagem — para que fiquem
// legíveis mesmo quando os estilos das camadas se sobrepõem visualmente. Em
// `format=png` (uma única imagem, não paginável) só a primeira camada
// selecionada é desenhada.
//
// Esta rota tem de correr no runtime Node.js (sharp e pdf-lib não correm em
// Edge).
//
// PDM_EXTRATO_MAX_DURATION (segundos, default 300) controla o tempo limite
// que esta rota se dá a si própria antes de devolver 504 — ver
// ROUTE_TIMEOUT_SECONDS abaixo.

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { projects, type Project } from "@/data/projects";
import {
  boundaryOverlaySvg,
  canvasForBoundary,
  embedImagesAsA4Pdf,
  fetchWmsImage,
  infoOverlaySvg,
  type MapCanvas,
} from "@/lib/gis";
import { findPdmSource, type PdmSource } from "@/lib/pdm-sources";
import { fetchWmsLayers } from "@/lib/wms-capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The DGT/SNIT WMS mirror used for Lisboa can take minutes per attempt and
// fetchWmsImage retries on failure (see lib/gis.ts) — give this route enough
// headroom on platforms that enforce maxDuration. This must stay a literal:
// Next.js extracts it via static analysis at build time, so it can't read
// process.env here — see PDM_EXTRATO_MAX_DURATION below for the runtime
// budget this route actually enforces on itself.
export const maxDuration = 300;

// Runtime budget this route gives itself before giving up and returning a
// 504, independent of the platform-level maxDuration above. Defaults to 300s;
// set PDM_EXTRATO_MAX_DURATION to override (e.g. 1800 locally, to match slow
// geoportals during development).
const ROUTE_TIMEOUT_SECONDS = Number(process.env.PDM_EXTRATO_MAX_DURATION) || 300;

class RouteTimeoutError extends Error { }

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new RouteTimeoutError(`Tempo limite de ${ms / 1000}s excedido.`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const formatParam = (searchParams.get("format") ?? "png").toLowerCase();

  if (!projectId) {
    return NextResponse.json({ error: "O parâmetro 'projectId' é obrigatório." }, { status: 400 });
  }

  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    return NextResponse.json({ error: `Projeto '${projectId}' não encontrado.` }, { status: 404 });
  }

  if (formatParam !== "png" && formatParam !== "pdf") {
    return NextResponse.json({ error: "'format' tem de ser 'png' ou 'pdf'." }, { status: 400 });
  }

  const source = findPdmSource(project.municipality);
  if (!source) {
    return NextResponse.json(
      { error: `Não há fonte de PDM configurada para o município '${project.municipality}'.` },
      { status: 404 }
    );
  }
  if (source.type === "unavailable") {
    return NextResponse.json(
      { error: `Extrato do PDM indisponível para ${source.municipality}.`, reason: source.reason },
      { status: 501 }
    );
  }

  const layersParam = searchParams.get("layers");
  const layerNames = layersParam?.trim()
    ? layersParam.split(",").map((name) => name.trim()).filter(Boolean)
    : [source.layer];

  try {
    return await withTimeout(
      buildExtratoResponse({ project, source, formatParam, layerNames }),
      ROUTE_TIMEOUT_SECONDS * 1000
    );
  } catch (error) {
    if (error instanceof RouteTimeoutError) {
      console.error("Tempo limite ao gerar extrato do PDM:", error);
      return NextResponse.json(
        {
          error: `Não foi possível gerar o extrato do PDM dentro do tempo limite (${ROUTE_TIMEOUT_SECONDS}s). O geoportal de ${source.municipality} pode estar demasiado lento.`,
        },
        { status: 504 }
      );
    }
    console.error("Erro ao gerar extrato do PDM:", error);
    return NextResponse.json(
      {
        error: `Não foi possível gerar o extrato do PDM. O geoportal de ${source.municipality} pode estar temporariamente indisponível.`,
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}

async function buildExtratoResponse(params: {
  project: Project;
  source: Extract<PdmSource, { type: "wms" }>;
  formatParam: string;
  layerNames: string[];
}): Promise<NextResponse> {
  const { project, source, formatParam, layerNames } = params;

  const canvas = canvasForBoundary(project.boundary);
  const layerTitles = await fetchLayerTitles(source.baseUrl, layerNames);

  const boundarySvg = boundaryOverlaySvg({
    boundary: project.boundary,
    bbox: canvas.bbox,
    width: canvas.width,
    height: canvas.height,
    stroke: "#1565c0",
    fill: "#1565c026",
  });

  if (formatParam === "png") {
    const layerName = layerNames[0];
    const composed = await composeLayerImage({
      source,
      layerName,
      layerTitle: layerTitles.get(layerName) ?? layerName,
      canvas,
      boundarySvg,
      project,
    });
    return new NextResponse(new Uint8Array(composed), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="pdm-extrato-${project.id}.png"`,
      },
    });
  }

  const pages = await Promise.all(
    layerNames.map(async (layerName) => ({
      png: await composeLayerImage({
        source,
        layerName,
        layerTitle: layerTitles.get(layerName) ?? layerName,
        canvas,
        boundarySvg,
        project,
      }),
      width: canvas.width,
      height: canvas.height,
    }))
  );

  const pdfBytes = await embedImagesAsA4Pdf(pages);
  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pdm-extrato-${project.id}.pdf"`,
    },
  });
}

// Renders a single WMS layer into the map canvas, with the project boundary
// and its own legend composited on top — one call per page of the PDF.
async function composeLayerImage(params: {
  source: Extract<PdmSource, { type: "wms" }>;
  layerName: string;
  layerTitle: string;
  canvas: MapCanvas;
  boundarySvg: string;
  project: Project;
}): Promise<Buffer> {
  const { source, layerName, layerTitle, canvas, boundarySvg, project } = params;

  const [planBuffer, legendBuffer] = await Promise.all([
    fetchWmsImage({
      baseUrl: source.baseUrl,
      layers: layerName,
      bbox: canvas.bbox,
      width: canvas.width,
      height: canvas.height,
      transparent: false,
      format: "image/png",
    }),
    fetchLegendGraphic(source.baseUrl, layerName),
  ]);

  const infoSvg = infoOverlaySvg({
    width: canvas.width,
    height: canvas.height,
    metersPerPixel: canvas.metersPerPixel,
    title: "Extrato do PDM — Planta de Ordenamento",
    lines: [project.name, source.planLabel, layerTitle],
  });

  const composite = [
    { input: Buffer.from(boundarySvg), top: 0, left: 0 },
    { input: Buffer.from(infoSvg), top: 0, left: 0 },
  ];

  if (legendBuffer) {
    const legendMeta = await sharp(legendBuffer).metadata();
    const legendWidth = Math.min(legendMeta.width ?? 200, 220);
    const resizedLegend = await sharp(legendBuffer).resize({ width: legendWidth }).toBuffer();
    composite.push({
      input: resizedLegend,
      top: 8,
      left: canvas.width - legendWidth - 8,
    });
  }

  return sharp(planBuffer).composite(composite).png().toBuffer();
}

async function fetchLegendGraphic(baseUrl: string, layer: string): Promise<Buffer | undefined> {
  const url = new URL(baseUrl);
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.3.0");
  url.searchParams.set("REQUEST", "GetLegendGraphic");
  url.searchParams.set("FORMAT", "image/png");
  url.searchParams.set("LAYER", layer);

  // Purely cosmetic — never worth waiting minutes on a slow geoportal for
  // this, so it gets a short timeout instead of the retry policy in
  // fetchWmsImage and just gets dropped from the extract on failure.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return undefined;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return undefined;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

// Looks up each requested layer's human-readable title via GetCapabilities,
// so the info box on each page can show e.g. "Solo Urbano" instead of the
// raw technical layer name. Best-effort: falls back to an empty map (and so
// to the raw names) if the geoportal's capabilities can't be fetched.
async function fetchLayerTitles(baseUrl: string, layerNames: string[]): Promise<Map<string, string>> {
  try {
    const layers = await fetchWmsLayers(baseUrl);
    const titles = new Map<string, string>();
    for (const layerName of layerNames) {
      const title = layers.find((layer) => layer.name === layerName)?.title;
      if (title) titles.set(layerName, title);
    }
    return titles;
  } catch {
    return new Map();
  }
}
