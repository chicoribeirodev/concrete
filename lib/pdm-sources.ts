// lib/pdm-sources.ts
//
// Per-municipality source config for PDM (Plano Diretor Municipal) "Planta
// de Ordenamento" extracts. Each câmara municipal runs its own geoportal, on
// its own domain, with its own layer names — but every PDM is also filed
// with DGT (Direção-Geral do Território) and mirrored on their national
// SNIT WMS (servicos.dgterritorio.pt/SDISNITWMSPDM1_<município>_<plano>_<rev>),
// which is what several entries below use instead of the municipal source.
// That DGT service is a shared, overloaded legacy map-server pool — expect
// GetMap requests to take from seconds up to a few minutes, and occasionally
// fail with a transient capacity error; fetchWmsImage (lib/gis.ts) retries
// with a generous timeout to absorb that. This table is deliberately small:
// only municipalities with a verified, working public WMS are wired up as
// "wms"; everything else is "unavailable" with the reason, so the route
// fails with a clear message instead of a broken request. Extend as more
// municipalities are confirmed.

export type PdmSource =
  | {
      type: "wms";
      municipality: string;
      planLabel: string;
      baseUrl: string;
      layer: string;
      // True only for GeoServer-backed vector services where GetLegendGraphic
      // returns a real per-category legend, as opposed to a generic
      // placeholder swatch.
      hasLegend: boolean;
      // Fallback static legend document(s) to reference instead, for
      // services where the WMS legend is just a generic placeholder (all
      // DGT/SNIT raster PDM services).
      staticLegendUrls?: string[];
    }
  | {
      type: "unavailable";
      municipality: string;
      reason: string;
    };

export const PDM_SOURCES: Record<string, PdmSource> = {
  Faro: {
    type: "wms",
    municipality: "Faro",
    planLabel: "PDM Faro 2024 — Planta de Ordenamento (Modelo de Ordenamento do Território)",
    baseUrl: "http://mapas.cm-faro.pt/geoserver/pdm2024/wms",
    layer: "1_1_P_Ordenamento_MOT",
    hasLegend: true,
  },
  Lisboa: {
    type: "wms",
    municipality: "Lisboa",
    planLabel: "PDM Lisboa — Planta de Ordenamento (Qualificação do Espaço Urbano)",
    baseUrl: "https://servicos.dgterritorio.pt/SDISNITWMSPDM1_1106_1815_2/wmservice.aspx",
    layer: "Planta_de_Ordenamento_-_1_-_Qualificacao_do_Espaco_Urbano",
    hasLegend: false, // Raster "Formato Matricial" service; every layer shares one generic "Default" style.
    staticLegendUrls: ["https://websig.cm-lisboa.pt/MuniSIG/Anexos/anexolegPDM_vigor.pdf"],
  },
  Porto: {
    type: "wms",
    municipality: "Porto",
    planLabel: "PDM Porto — Planta de Ordenamento (Qualificação do Solo)",
    baseUrl: "https://servicos.dgterritorio.pt/SDISNITWMSPDM1_1312_3027_3/wmservice.aspx",
    layer: "Planta_de_Ordenamento_-_1A_-_Qualificacao_do_Solo",
    hasLegend: false,
    // Full published sheet; legend is embedded in the sheet corner, not a standalone doc.
    staticLegendUrls: ["https://pdm.cm-porto.pt/documents/84/i_02A_PO_CQS_Pub.pdf"],
  },
  Coimbra: {
    type: "wms",
    municipality: "Coimbra",
    planLabel: "PDM Coimbra — Planta de Ordenamento (Classificação e Qualificação do Solo)",
    baseUrl: "https://servicos.dgterritorio.pt/SDISNITWMSPDM1_0603_2672_2/wmservice.aspx",
    layer: "Planta_de_Ordenamento_-_01_01_-_Classificacao_e_Qualificacao_do_Solo",
    hasLegend: false,
    staticLegendUrls: ["https://www.cm-coimbra.pt/wp-content/uploads/2022/02/1_1_Classificacao_qualificacao_solo.pdf"],
  },
  "Peso da Régua": {
    type: "wms",
    municipality: "Peso da Régua",
    planLabel: "PDM Peso da Régua — Planta de Ordenamento",
    baseUrl: "https://servicos.dgterritorio.pt/sdisnitWMSPDM1_1708_257_2/wmservice.aspx",
    layer: "Planta_de_Ordenamento",
    hasLegend: false,
    // Large-scale plan split into tiled sheets; legend embedded in each sheet corner.
    staticLegendUrls: [
      "https://www.cm-pesoregua.pt/cmpesodaregua/uploads/document/file/82/02_ordenamentoa.PDF",
      "https://www.cm-pesoregua.pt/cmpesodaregua/uploads/document/file/84/02_ordenamentob.PDF",
      "https://www.cm-pesoregua.pt/cmpesodaregua/uploads/document/file/83/02_ordenamentoc.PDF",
    ],
  },
};

export function findPdmSource(municipality: string): PdmSource | undefined {
  if (PDM_SOURCES[municipality]) return PDM_SOURCES[municipality];

  const normalized = municipality.trim().toLowerCase();
  const key = Object.keys(PDM_SOURCES).find((candidate) => candidate.toLowerCase() === normalized);
  return key ? PDM_SOURCES[key] : undefined;
}
