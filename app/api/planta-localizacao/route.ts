// app/api/planta-localizacao/route.ts
//
// GET /api/planta-localizacao?lat=38.7223&lon=-9.1393&scale=2000&format=pdf
//
// Gera uma "planta de localização" (imagem/PDF) a partir de umas coordenadas,
// usando os serviços WMS abertos e oficiais da Direção-Geral do Território (DGT):
//   - Ortofotomapas 2021 (cartografia.dgterritorio.gov.pt/wms/ortos2021)
//   - CAOP 2025 - freguesias/concelhos (geo2.dgterritorio.gov.pt/geoserver/caop_continente/wms)
//
// IMPORTANTE (ler antes de usar em produção):
// A DGT não disponibiliza uma API REST pública que devolva diretamente o PDF
// "oficial" gerado pela ferramenta de georreferenciação do SNIT
// (https://snit-mais.dgterritorio.gov.pt/portalsnit/full.aspx). Essa ferramenta
// é um portal interativo (SIG web), não um endpoint documentado para consumo
// automatizado. Esta rota não faz scraping/proxy dessa ferramenta; em vez
// disso, compõe uma planta equivalente a partir das mesmas fontes de dados
// abertos e oficiais (WMS/OGC API da DGT, licença CC-BY 4.0), o que é o
// caminho suportado para automatizar isto.
//
// Se precisar mesmo do documento carimbado pela DGT (ex.: para instruir um
// processo no Balcão do Empreendedor), essa planta tem de ser obtida através
// do portal SNIT indicado acima — esta rota serve para gerar uma planta de
// localização própria (ex.: para uso interno, apps, relatórios).
//
// Dependências a instalar:
//   npm install sharp pdf-lib proj4
//
// Esta rota tem de correr no runtime Node.js (sharp e pdf-lib não correm em Edge).

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import proj4 from "proj4";

export const runtime = "nodejs";
// Os serviços da DGT podem demorar >1-2s a responder; evita cache da rota.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Configuração dos serviços DGT
// ---------------------------------------------------------------------------

const WMS_ORTOFOTO = "https://cartografia.dgterritorio.gov.pt/wms/ortos2021";
const ORTOFOTO_LAYER = "Ortos2021-RGB";

const WMS_CAOP = "https://geo2.dgterritorio.gov.pt/geoserver/caop_continente/wms";
// Camadas confirmadas no GetCapabilities do serviço CAOP2025:
// cont_freguesias, cont_municipios, cont_distritos, cont_nuts1/2/3, cont_trocos
const CAOP_LAYERS = "cont_freguesias,cont_municipios";

// O estilo por omissão destas camadas (CAOP_Freguesia / CAOP_Concelho) desenha
// os polígonos com um preenchimento sólido, não apenas o contorno. Se
// deixarmos isso, a camada "transparente" fica na prática opaca e tapa por
// completo a ortofoto por baixo (foi o que aconteceu na primeira versão desta
// rota: só se via a linha de fronteira, o resto ficava branco). Este SLD
// substitui o estilo para desenhar só a linha de fronteira, sem preenchimento.
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
              <CssParameter name="stroke">#d32f2f</CssParameter>
              <CssParameter name="stroke-width">5.5</CssParameter>
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
              <CssParameter name="stroke">#d32f2f</CssParameter>
              <CssParameter name="stroke-width">7.0</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>`;

// Bounding box aproximada de Portugal continental (a partir do GetCapabilities
// dos Ortos2021), usada só para validar se o ponto pedido está coberto.
const PT_CONTINENTAL_BBOX = {
  west: -10.1934,
  east: -5.70954,
  south: 36.7643,
  north: 42.2796,
};

// Definição EPSG:3763 (PT-TM06/ETRS89), o sistema de coordenadas oficial
// usado nas plantas de localização em Portugal continental.
proj4.defs(
  "EPSG:3763",
  "+proj=tmerc +lat_0=39.66825833333333 +lon_0=-8.133108333333334 +k=1 " +
  "+x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);

// ---------------------------------------------------------------------------
// Helpers de projeção / geometria
// ---------------------------------------------------------------------------

/** Converte lon/lat (EPSG:4326) para Web Mercator (EPSG:3857), em metros. */
function lonLatToWebMercator(lon: number, lat: number): [number, number] {
  const R = 6378137;
  const x = (lon * Math.PI * R) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x, y];
}

/**
 * Calcula uma bounding box (em EPSG:3857) centrada no ponto, para uma dada
 * escala de impressão (ex.: 2000 = 1:2000) e dimensões de imagem em pixels,
 * assumindo uma resolução de impressão de referência (DPI_REF).
 */
function bboxForScale(
  centerX: number,
  centerY: number,
  widthPx: number,
  heightPx: number,
  scale: number
) {
  const DPI_REF = 90; // aproximação razoável para plantas de localização
  const metersPerPixel = (scale * 0.0254) / DPI_REF;
  const halfWidth = (widthPx * metersPerPixel) / 2;
  const halfHeight = (heightPx * metersPerPixel) / 2;
  return {
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
    metersPerPixel,
  };
}

// ---------------------------------------------------------------------------
// Helpers de acesso aos WMS da DGT
// ---------------------------------------------------------------------------

async function fetchWmsImage(params: {
  baseUrl: string;
  layers: string;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  width: number;
  height: number;
  transparent: boolean;
  format?: "image/png" | "image/jpeg";
  sldBody?: string;
}): Promise<Buffer> {
  const { baseUrl, layers, bbox, width, height, transparent, format, sldBody } =
    params;

  const query = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layers,
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`,
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: format ?? (transparent ? "image/png" : "image/jpeg"),
    TRANSPARENT: transparent ? "TRUE" : "FALSE",
  });

  if (sldBody) {
    query.set("SLD_BODY", sldBody);
    query.set("SLD_VERSION", "1.0.0");
  }

  const url = `${baseUrl}?${query.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Pedido WMS falhou (${res.status}) em ${baseUrl}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      const text = await res.text();
      throw new Error(
        `Serviço WMS devolveu um erro em vez de imagem: ${text.slice(0, 300)}`
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function isMostlyWhiteImage(buffer: Buffer): Promise<boolean> {
  const stats = await sharp(buffer).stats();
  return stats.channels.every((channel) => channel.mean > 245);
}

async function fetchFallbackOrthoImage(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number
): Promise<Buffer> {
  const [minLon, minLat] = proj4("EPSG:3857", "EPSG:4326", [
    bbox.minX,
    bbox.minY,
  ]);
  const [maxLon, maxLat] = proj4("EPSG:3857", "EPSG:4326", [
    bbox.maxX,
    bbox.maxY,
  ]);

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

async function getBaseOrthoBuffer(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number
): Promise<Buffer> {
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

// ---------------------------------------------------------------------------
// Helpers de composição (marcador, escala, caixa de informação)
// ---------------------------------------------------------------------------

function buildOverlaySvg(params: {
  width: number;
  height: number;
  metersPerPixel: number;
  lon: number;
  lat: number;
  xTm06: number;
  yTm06: number;
  scale: number;
}) {
  const { width, height, metersPerPixel, lon, lat, xTm06, yTm06, scale } =
    params;

  const cx = width / 2;
  const cy = height / 2;

  // Barra de escala com um comprimento "redondo" em metros.
  const targetPx = width * 0.2;
  const targetMeters = targetPx * metersPerPixel;
  const magnitude = Math.pow(10, Math.floor(Math.log10(targetMeters)));
  const niceSteps = [1, 2, 5, 10];
  let barMeters = magnitude;
  for (const step of niceSteps) {
    if (step * magnitude <= targetMeters * 1.5) barMeters = step * magnitude;
  }
  const barPx = barMeters / metersPerPixel;
  const barX = 24;
  const barY = height - 90;

  const infoBoxHeight = 92;

  const escapeXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Marcador do ponto localizado -->
  <g stroke="#1565c0" stroke-width="4" fill="#e3f2fd">
    <line x1="${cx - 22}" y1="${cy}" x2="${cx + 22}" y2="${cy}" />
    <line x1="${cx}" y1="${cy - 22}" x2="${cx}" y2="${cy + 22}" />
    <circle cx="${cx}" cy="${cy}" r="11" />
  </g>

  <!-- Barra de escala -->
  <g font-family="sans-serif" font-size="13" fill="#111">
    <rect x="${barX - 8}" y="${barY - 70}" width="188" height="44"
          fill="white" fill-opacity="0.9" rx="6" />
    <line x1="${barX + 12}" y1="${barY - 48}" x2="${barX + 40}" y2="${barY - 48}"
          stroke="#d32f2f" stroke-width="7" />
    <text x="${barX + 48}" y="${barY - 44}" font-size="11" font-weight="600">Limite administrativo</text>

    <rect x="${barX - 8}" y="${barY - 22}" width="${barPx + 16}" height="46"
          fill="white" fill-opacity="0.85" />
    <line x1="${barX}" y1="${barY}" x2="${barX + barPx}" y2="${barY}"
          stroke="#111" stroke-width="2" />
    <line x1="${barX}" y1="${barY - 6}" x2="${barX}" y2="${barY + 6}"
          stroke="#111" stroke-width="2" />
    <line x1="${barX + barPx}" y1="${barY - 6}" x2="${barX + barPx}" y2="${barY + 6}"
          stroke="#111" stroke-width="2" />
    <text x="${barX}" y="${barY - 12}">${barMeters >= 1000 ? `${barMeters / 1000} km` : `${barMeters} m`}</text>
    <text x="${barX}" y="${barY + 20}">Escala aprox. 1:${scale}</text>
  </g>

  <!-- Caixa de informação (coordenadas) -->
  <g font-family="sans-serif" fill="#111">
    <rect x="0" y="0" width="${width}" height="${infoBoxHeight}"
          fill="white" fill-opacity="0.9" />
    <line x1="0" y1="${infoBoxHeight}" x2="${width}" y2="${infoBoxHeight}"
          stroke="#ccc" stroke-width="1" />
    <text x="16" y="24" font-size="16" font-weight="bold">Planta de Localização</text>
    <text x="16" y="44" font-size="12" font-weight="bold">Generated by Concrete</text>
    <text x="16" y="68" font-size="12">
      WGS84: ${escapeXml(lat.toFixed(6))}, ${escapeXml(lon.toFixed(6))}
    </text>
    <text x="16" y="84" font-size="12">
      ETRS89 / PT-TM06 (EPSG:3763): M ${escapeXml(xTm06.toFixed(2))}, P ${escapeXml(yTm06.toFixed(2))}
    </text>
  </g>
</svg>`;
}

async function buildThickRedBoundaryOverlay(
  caopBuffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  const { data } = await sharp(caopBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mask = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    mask[i / 4] = data[i + 3] > 0 ? 1 : 0;
  }

  const rgba = Buffer.alloc(width * height * 4);
  const offsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const baseIndex = index * 4;
      let draw = mask[index] === 1;

      if (!draw) {
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const neighborIndex = ny * width + nx;
            if (mask[neighborIndex] === 1) {
              draw = true;
              break;
            }
          }
        }
      }

      if (draw) {
        rgba[baseIndex] = 211;
        rgba[baseIndex + 1] = 47;
        rgba[baseIndex + 2] = 47;
        rgba[baseIndex + 3] = 255;
      }
    }
  }

  return sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");
  const scaleParam = searchParams.get("scale");
  const formatParam = (searchParams.get("format") ?? "png").toLowerCase();

  if (!latParam || !lonParam) {
    return NextResponse.json(
      { error: "Parâmetros 'lat' e 'lon' são obrigatórios (WGS84, graus decimais)." },
      { status: 400 }
    );
  }

  const lat = Number(latParam);
  const lon = Number(lonParam);
  const scale = scaleParam ? Number(scaleParam) : 2000;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "'lat' e 'lon' têm de ser números válidos." },
      { status: 400 }
    );
  }

  if (!Number.isFinite(scale) || scale < 250 || scale > 25000) {
    return NextResponse.json(
      { error: "'scale' inválida. Usa um valor entre 250 e 25000 (ex.: 2000 para 1:2000)." },
      { status: 400 }
    );
  }

  if (
    lon < PT_CONTINENTAL_BBOX.west ||
    lon > PT_CONTINENTAL_BBOX.east ||
    lat < PT_CONTINENTAL_BBOX.south ||
    lat > PT_CONTINENTAL_BBOX.north
  ) {
    return NextResponse.json(
      {
        error:
          "Coordenadas fora da cobertura de Portugal continental para este serviço.",
      },
      { status: 400 }
    );
  }

  if (formatParam !== "png" && formatParam !== "pdf") {
    return NextResponse.json(
      { error: "'format' tem de ser 'png' ou 'pdf'." },
      { status: 400 }
    );
  }

  // Dimensões da imagem base (retrato, à semelhança de uma planta A4).
  const width = 900;
  const height = 1250;

  try {
    const [centerX, centerY] = lonLatToWebMercator(lon, lat);
    const bbox = bboxForScale(centerX, centerY, width, height, scale);

    const [xTm06, yTm06] = proj4("EPSG:4326", "EPSG:3763", [lon, lat]);

    // Modo de depuração: devolve uma camada isolada (sem composição), útil
    // para confirmar rapidamente se o problema está na ortofoto, no CAOP,
    // ou na composição/overlay em si.
    const debugLayer = searchParams.get("debug");
    if (debugLayer === "orto" || debugLayer === "caop") {
      const debugBuffer =
        debugLayer === "orto"
          ? await getBaseOrthoBuffer(bbox, width, height)
          : await fetchWmsImage({
            baseUrl: WMS_CAOP,
            layers: CAOP_LAYERS,
            bbox,
            width,
            height,
            transparent: true,
            format: "image/png",
            sldBody: CAOP_SLD_BODY,
          });
      return new NextResponse(new Uint8Array(debugBuffer), {
        headers: {
          "Content-Type": debugLayer === "orto" ? "image/jpeg" : "image/png",
        },
      });
    }

    // Pede a ortofoto (base) e os limites administrativos CAOP (sobreposição
    // transparente) em paralelo.
    const [ortoBuffer, caopBuffer] = await Promise.all([
      getBaseOrthoBuffer(bbox, width, height),
      fetchWmsImage({
        baseUrl: WMS_CAOP,
        layers: CAOP_LAYERS,
        bbox,
        width,
        height,
        transparent: true,
        format: "image/png",
        sldBody: CAOP_SLD_BODY,
      }),
    ]);

    const overlaySvg = buildOverlaySvg({
      width,
      height,
      metersPerPixel: bbox.metersPerPixel,
      lon,
      lat,
      xTm06,
      yTm06,
      scale,
    });

    const caopOutline = await buildThickRedBoundaryOverlay(caopBuffer, width, height);

    const composed = await sharp(ortoBuffer)
      .composite([
        { input: caopBuffer, top: 0, left: 0 },
        {
          input: caopOutline,
          top: 0,
          left: 0,
        },
        { input: Buffer.from(overlaySvg), top: 0, left: 0 },
      ])
      .png()
      .toBuffer();

    if (formatParam === "png") {
      return new NextResponse(new Uint8Array(composed), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `inline; filename="planta-localizacao-${lat}-${lon}.png"`,
        },
      });
    }

    // Gera um PDF simples (A4) com a planta embutida, para ficar num formato
    // fácil de anexar a um processo.
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 em pontos
    const pngImage = await pdfDoc.embedPng(composed);

    const margin = 30;
    const availableWidth = page.getWidth() - margin * 2;
    const availableHeight = page.getHeight() - margin * 2;
    const imgRatio = width / height;
    let drawWidth = availableWidth;
    let drawHeight = drawWidth / imgRatio;
    if (drawHeight > availableHeight) {
      drawHeight = availableHeight;
      drawWidth = drawHeight * imgRatio;
    }

    page.drawImage(pngImage, {
      x: (page.getWidth() - drawWidth) / 2,
      y: (page.getHeight() - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="planta-localizacao-${lat}-${lon}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Erro ao gerar planta de localização:", error);
    return NextResponse.json(
      {
        error:
          "Não foi possível gerar a planta de localização. Os serviços WMS da DGT podem estar temporariamente indisponíveis.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
