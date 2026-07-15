// app/api/pdm-extrato/route.ts
//
// GET /api/pdm-extrato?projectId=1&format=pdf
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
// Esta rota tem de correr no runtime Node.js (sharp e pdf-lib não correm em
// Edge).

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { projects } from "@/data/projects";
import {
  boundaryOverlaySvg,
  canvasForBoundary,
  embedImageAsA4Pdf,
  fetchWmsImage,
  infoOverlaySvg,
} from "@/lib/gis";
import { findPdmSource } from "@/lib/pdm-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  try {
    const canvas = canvasForBoundary(project.boundary);

    const [planBuffer, legendBuffer] = await Promise.all([
      fetchWmsImage({
        baseUrl: source.baseUrl,
        layers: source.layer,
        bbox: canvas.bbox,
        width: canvas.width,
        height: canvas.height,
        transparent: false,
        format: "image/png",
      }),
      fetchLegendGraphic(source.baseUrl, source.layer),
    ]);

    const boundarySvg = boundaryOverlaySvg({
      boundary: project.boundary,
      bbox: canvas.bbox,
      width: canvas.width,
      height: canvas.height,
      stroke: "#1565c0",
      fill: "#1565c026",
    });

    const infoSvg = infoOverlaySvg({
      width: canvas.width,
      height: canvas.height,
      metersPerPixel: canvas.metersPerPixel,
      title: "Extrato do PDM — Planta de Ordenamento",
      lines: [project.name, source.planLabel],
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

    const composed = await sharp(planBuffer)
      .composite(composite)
      .png()
      .toBuffer();

    if (formatParam === "png") {
      return new NextResponse(new Uint8Array(composed), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `inline; filename="pdm-extrato-${project.id}.png"`,
        },
      });
    }

    const pdfBytes = await embedImageAsA4Pdf(composed, canvas.width, canvas.height);
    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="pdm-extrato-${project.id}.pdf"`,
      },
    });
  } catch (error) {
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

async function fetchLegendGraphic(baseUrl: string, layer: string): Promise<Buffer | undefined> {
  const url = new URL(baseUrl);
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.3.0");
  url.searchParams.set("REQUEST", "GetLegendGraphic");
  url.searchParams.set("FORMAT", "image/png");
  url.searchParams.set("LAYER", layer);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return undefined;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return undefined;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return undefined;
  }
}
