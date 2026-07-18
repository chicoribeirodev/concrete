// lib/wms-capabilities.ts
//
// Fetches and parses GetCapabilities from a PDM source's WMS, so callers can
// list the layers actually published by that geoportal (name, title,
// abstract, bounding box, legend) instead of only trusting the hardcoded
// `layer` in lib/pdm-sources.ts. Shared by /api/capabilities.

import { XMLParser } from "fast-xml-parser";
import type { PdmSource } from "@/lib/pdm-sources";

export type WmsLayerInfo = {
  name: string;
  title?: string;
  abstract?: string;
  bbox?: { minx: number; miny: number; maxx: number; maxy: number; crs?: string };
  legendUrl?: string;
};

// Mirrors the GetLegendGraphic request built in app/api/pdm-extrato/route.ts —
// most geoportals don't advertise a LegendURL in their capabilities, so we
// construct it directly instead of parsing one out of the XML.
function buildLegendGraphicUrl(baseUrl: string, layerName: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.3.0");
  url.searchParams.set("REQUEST", "GetLegendGraphic");
  url.searchParams.set("FORMAT", "image/png");
  url.searchParams.set("LAYER", layerName);
  return url.toString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectLayers(node: any, out: WmsLayerInfo[]) {
  if (!node || typeof node !== "object") return;

  const layers = Array.isArray(node.Layer) ? node.Layer : node.Layer ? [node.Layer] : [];

  for (const layer of layers) {
    if (layer?.Name) {
      let bbox: WmsLayerInfo["bbox"] | undefined;
      const bboxNode = Array.isArray(layer.BoundingBox) ? layer.BoundingBox[0] : layer.BoundingBox;
      if (bboxNode) {
        bbox = {
          minx: parseFloat(bboxNode["@_minx"]),
          miny: parseFloat(bboxNode["@_miny"]),
          maxx: parseFloat(bboxNode["@_maxx"]),
          maxy: parseFloat(bboxNode["@_maxy"]),
          crs: bboxNode["@_CRS"] ?? bboxNode["@_SRS"],
        };
      }
      out.push({
        name: String(layer.Name),
        title: layer.Title ? String(layer.Title) : undefined,
        abstract: layer.Abstract ? String(layer.Abstract) : undefined,
        bbox,
      });
    }
    // Sub-layers (nested groups) can appear one or more levels deep.
    collectLayers(layer, out);
  }
}

function parseCapabilities(xml: string): WmsLayerInfo[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);

  const capabilitiesRoot =
    parsed.WMT_MS_Capabilities ?? // WMS 1.1.1
    parsed.WMS_Capabilities ?? // WMS 1.3.0
    parsed;

  const layers: WmsLayerInfo[] = [];
  collectLayers(capabilitiesRoot.Capability, layers);
  return layers;
}

// Some DGT/ArcGIS-style servers reject 1.3.0 or return a ServiceExceptionReport;
// fall back to 1.1.1 if we detect an exception.
export async function fetchWmsLayers(baseUrl: string): Promise<WmsLayerInfo[]> {
  const url = new URL(baseUrl);
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("REQUEST", "GetCapabilities");
  url.searchParams.set("VERSION", "1.3.0");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/xml,text/xml,*/*" },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url.toString()}`);
  }

  const xml = await res.text();

  const layers =
    xml.includes("ServiceExceptionReport")
      ? await (async () => {
          url.searchParams.set("VERSION", "1.1.1");
          const retry = await fetch(url.toString(), {
            headers: { Accept: "application/xml,text/xml,*/*" },
          });
          const retryXml = await retry.text();
          return parseCapabilities(retryXml);
        })()
      : parseCapabilities(xml);

  return layers.map((layer) => ({ ...layer, legendUrl: buildLegendGraphicUrl(baseUrl, layer.name) }));
}

export async function fetchPdmSourceCapabilities(source: Extract<PdmSource, { type: "wms" }>) {
  const layers = await fetchWmsLayers(source.baseUrl);
  return {
    layers,
    configuredLayerFound: layers.some((layer) => layer.name === source.layer),
  };
}
