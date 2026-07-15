// app/api/planta-sig/route.ts
//
// GET /api/planta-sig?projectId=1&format=pdf
//
// Gera uma planta de localização (SIG) enquadrada no limite (boundary) real
// de um projeto/prédio, a partir dos serviços WMS abertos da DGT: ortofoto
// (Ortos2021) e limites administrativos (CAOP). Ao contrário de uma planta
// genérica por coordenada + escala, esta rota calcula o enquadramento a
// partir do polígono do prédio e desenha o seu contorno sobre o mapa — ver
// lib/gis.ts para a lógica de enquadramento/overlay partilhada com
// /api/pdm-extrato.
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
  type BBox,
} from "@/lib/gis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WMS_ORTOFOTO = "https://cartografia.dgterritorio.gov.pt/wms/ortos2021";
const ORTOFOTO_LAYER = "Ortos2021-RGB";

const WMS_CAOP = "https://geo2.dgterritorio.gov.pt/geoserver/caop_continente/wms";
const CAOP_LAYERS = "cont_freguesias,cont_municipios";

// Estilo por omissão destas camadas desenha os polígonos com preenchimento
// sólido; este SLD substitui por um contorno fino, para servir de contexto
// administrativo sem tapar a ortofoto nem competir visualmente com o
// contorno do prédio (vermelho, mais grosso — ver boundaryOverlaySvg).
const CAOP_SLD_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>cont_freguesias</Name>
    <UserStyle>
      <FeatureTypeStyle>
        <Rule>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#f57c00</CssParameter>
              <CssParameter name="stroke-width">2.5</CssParameter>
              <CssParameter name="stroke-dasharray">6 4</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
  <NamedLayer>
    <Name>cont_municipios</Name>
    <UserStyle>
      <FeatureTypeStyle>
        <Rule>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#f57c00</CssParameter>
              <CssParameter name="stroke-width">4</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>`;

async function isMostlyWhiteImage(buffer: Buffer): Promise<boolean> {
  const stats = await sharp(buffer).stats();
  return stats.channels.every((channel) => channel.mean > 245);
}

async function fetchFallbackOrthoImage(bbox: BBox, width: number, height: number): Promise<Buffer> {
  // EPSG:3857 -> EPSG:4326, sem depender de proj4 aqui (fórmula inversa da
  // Web Mercator usada em lib/gis.ts).
  const R = 6378137;
  const toLonLat = (x: number, y: number): [number, number] => [
    (x / R) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
  ];
  const [minLon, minLat] = toLonLat(bbox.minX, bbox.minY);
  const [maxLon, maxLat] = toLonLat(bbox.maxX, bbox.maxY);

  const url = new URL(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"
  );
  url.searchParams.set("bbox", `${minLon},${minLat},${maxLon},${maxLat}`);
  url.searchParams.set("bboxSR", "4326");
  url.searchParams.set("size", `${width},${height}`);
  url.searchParams.set("imageSR", "4326");
  url.searchParams.set("format", "jpg");
  url.searchParams.set("transparent", "false");
  url.searchParams.set("f", "image");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Fallback ortho falhou (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function getBaseOrthoBuffer(bbox: BBox, width: number, height: number): Promise<Buffer> {
  const ortoBuffer = await fetchWmsImage({
    baseUrl: WMS_ORTOFOTO,
    layers: ORTOFOTO_LAYER,
    bbox,
    width,
    height,
    transparent: false,
    format: "image/jpeg",
  });

  if (await isMostlyWhiteImage(ortoBuffer)) {
    return fetchFallbackOrthoImage(bbox, width, height);
  }
  return ortoBuffer;
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

  try {
    const canvas = canvasForBoundary(project.boundary);

    const [ortoBuffer, caopBuffer] = await Promise.all([
      getBaseOrthoBuffer(canvas.bbox, canvas.width, canvas.height),
      fetchWmsImage({
        baseUrl: WMS_CAOP,
        layers: CAOP_LAYERS,
        bbox: canvas.bbox,
        width: canvas.width,
        height: canvas.height,
        transparent: true,
        format: "image/png",
        sldBody: CAOP_SLD_BODY,
      }),
    ]);

    const boundarySvg = boundaryOverlaySvg({
      boundary: project.boundary,
      bbox: canvas.bbox,
      width: canvas.width,
      height: canvas.height,
    });

    const infoSvg = infoOverlaySvg({
      width: canvas.width,
      height: canvas.height,
      metersPerPixel: canvas.metersPerPixel,
      title: "Planta de Localização",
      lines: [project.name, project.municipality],
    });

    const composed = await sharp(ortoBuffer)
      .composite([
        { input: caopBuffer, top: 0, left: 0 },
        { input: Buffer.from(boundarySvg), top: 0, left: 0 },
        { input: Buffer.from(infoSvg), top: 0, left: 0 },
      ])
      .png()
      .toBuffer();

    if (formatParam === "png") {
      return new NextResponse(new Uint8Array(composed), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `inline; filename="planta-sig-${project.id}.png"`,
        },
      });
    }

    const pdfBytes = await embedImageAsA4Pdf(composed, canvas.width, canvas.height);
    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="planta-sig-${project.id}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Erro ao gerar planta SIG:", error);
    return NextResponse.json(
      {
        error: "Não foi possível gerar a planta SIG. Os serviços WMS da DGT podem estar temporariamente indisponíveis.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
