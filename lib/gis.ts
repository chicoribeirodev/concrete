// lib/gis.ts
//
// Shared helpers for composing SIG (WMS-based) map images around a project's
// boundary polygon: projection, canvas sizing, WMS fetching, and drawing the
// boundary/scale-bar/title overlays as SVG. Used by both /api/planta-sig and
// /api/pdm-extrato, which each fetch different base imagery but share the
// same "boundary in, framed map out" composition logic.

import type { Feature, MultiPolygon, Polygon } from "geojson";
import { PDFDocument } from "pdf-lib";
import proj4 from "proj4";

// ETRS89 / PT-TM06, the official reference system for Portuguese planning
// plans (kept available for routes that need to report it, e.g. in labels).
proj4.defs(
  "EPSG:3763",
  "+proj=tmerc +lat_0=39.66825833333333 +lon_0=-8.133108333333334 +k=1 " +
    "+x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export function lonLatToWebMercator(lon: number, lat: number): [number, number] {
  const R = 6378137;
  const x = (lon * Math.PI * R) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x, y];
}

function boundaryOuterRings(geometry: Polygon | MultiPolygon): [number, number][][] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon[0] as [number, number][]);
}

export type MapCanvas = {
  bbox: BBox; // EPSG:3857
  width: number;
  height: number;
  metersPerPixel: number;
};

// Computes a padded, aspect-ratio-bounded map canvas (EPSG:3857) around a
// project's boundary, so both small and large/oddly-shaped parcels render as
// a sensible rectangular map instead of an edge-to-edge or sliver crop.
export function canvasForBoundary(boundary: Feature<Polygon | MultiPolygon>): MapCanvas {
  const rings = boundaryOuterRings(boundary.geometry);
  const points = rings.flat().map(([lon, lat]) => lonLatToWebMercator(lon, lat));

  let minX = Math.min(...points.map(([x]) => x));
  let maxX = Math.max(...points.map(([x]) => x));
  let minY = Math.min(...points.map(([, y]) => y));
  let maxY = Math.max(...points.map(([, y]) => y));

  const padding = Math.max(maxX - minX, maxY - minY, 100) * 0.3;
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;

  // Keep elongated/multi-parcel boundaries from producing a sliver-shaped
  // canvas by expanding the shorter axis to a bounded aspect ratio.
  const minRatio = 0.55;
  const maxRatio = 1 / minRatio;
  const ratio = (maxX - minX) / (maxY - minY);
  if (ratio > maxRatio) {
    const targetHeight = (maxX - minX) / maxRatio;
    const extra = (targetHeight - (maxY - minY)) / 2;
    minY -= extra;
    maxY += extra;
  } else if (ratio < minRatio) {
    const targetWidth = (maxY - minY) * minRatio;
    const extra = (targetWidth - (maxX - minX)) / 2;
    minX -= extra;
    maxX += extra;
  }

  const longEdgeMeters = Math.max(maxX - minX, maxY - minY);
  const longEdgePx = 1100;
  const metersPerPixel = longEdgeMeters / longEdgePx;

  return {
    bbox: { minX, minY, maxX, maxY },
    width: Math.round((maxX - minX) / metersPerPixel),
    height: Math.round((maxY - minY) / metersPerPixel),
    metersPerPixel,
  };
}

function ringToPixels(
  ring: [number, number][],
  bbox: BBox,
  width: number,
  height: number
): [number, number][] {
  return ring.map(([lon, lat]) => {
    const [x, y] = lonLatToWebMercator(lon, lat);
    const px = ((x - bbox.minX) / (bbox.maxX - bbox.minX)) * width;
    const py = height - ((y - bbox.minY) / (bbox.maxY - bbox.minY)) * height;
    return [px, py];
  });
}

// Draws the project's actual boundary polygon(s) as an SVG overlay, in
// contrast to any administrative (freguesia/concelho) boundary the base
// imagery might already show.
export function boundaryOverlaySvg(params: {
  boundary: Feature<Polygon | MultiPolygon>;
  bbox: BBox;
  width: number;
  height: number;
  stroke?: string;
  fill?: string;
}): string {
  const { boundary, bbox, width, height, stroke = "#d32f2f", fill = "#d32f2f26" } = params;

  const polygons = boundaryOuterRings(boundary.geometry)
    .map((ring) => {
      const points = ringToPixels(ring, bbox, width, height)
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(" ");
      return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round" />`;
    })
    .join("\n");

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${polygons}</svg>`;
}

// Title/subtitle box plus a scale bar, sized for the canvas' metersPerPixel.
export function infoOverlaySvg(params: {
  width: number;
  height: number;
  metersPerPixel: number;
  title: string;
  lines: string[];
}): string {
  const { width, height, metersPerPixel, title, lines } = params;
  const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  const barY = height - 30;

  const infoBoxHeight = 34 + lines.length * 18;

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <g font-family="sans-serif" fill="#111">
    <rect x="0" y="0" width="${width}" height="${infoBoxHeight}" fill="white" fill-opacity="0.9" />
    <line x1="0" y1="${infoBoxHeight}" x2="${width}" y2="${infoBoxHeight}" stroke="#ccc" stroke-width="1" />
    <text x="16" y="24" font-size="16" font-weight="bold">${escapeXml(title)}</text>
    ${lines
      .map((line, i) => `<text x="16" y="${42 + i * 18}" font-size="12">${escapeXml(line)}</text>`)
      .join("\n    ")}
  </g>
  <g font-family="sans-serif" font-size="11" fill="#111">
    <rect x="${barX - 8}" y="${barY - 22}" width="${barPx + 16}" height="40" fill="white" fill-opacity="0.85" />
    <line x1="${barX}" y1="${barY}" x2="${barX + barPx}" y2="${barY}" stroke="#111" stroke-width="2" />
    <line x1="${barX}" y1="${barY - 6}" x2="${barX}" y2="${barY + 6}" stroke="#111" stroke-width="2" />
    <line x1="${barX + barPx}" y1="${barY - 6}" x2="${barX + barPx}" y2="${barY + 6}" stroke="#111" stroke-width="2" />
    <text x="${barX}" y="${barY - 10}">${barMeters >= 1000 ? `${barMeters / 1000} km` : `${barMeters} m`}</text>
  </g>
</svg>`;
}

export async function fetchWmsImage(params: {
  baseUrl: string;
  layers: string;
  bbox: BBox;
  width: number;
  height: number;
  transparent: boolean;
  format?: "image/png" | "image/jpeg";
  sldBody?: string;
}): Promise<Buffer> {
  const { baseUrl, layers, bbox, width, height, transparent, format, sldBody } = params;

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
      throw new Error(`Serviço WMS devolveu um erro em vez de imagem: ${text.slice(0, 300)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

export async function embedImageAsA4Pdf(
  png: Buffer,
  imageWidth: number,
  imageHeight: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 em pontos
  const pngImage = await pdfDoc.embedPng(png);

  const margin = 30;
  const availableWidth = page.getWidth() - margin * 2;
  const availableHeight = page.getHeight() - margin * 2;
  const imgRatio = imageWidth / imageHeight;
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

  return pdfDoc.save();
}
