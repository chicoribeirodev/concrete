// lib/pdm-sources.ts
//
// Per-municipality source config for PDM (Plano Diretor Municipal) "Planta
// de Ordenamento" extracts. Portugal has no single national WMS for this —
// each câmara municipal runs its own geoportal, on its own domain, with its
// own layer names. This table is deliberately small: only municipalities
// with a verified, working public WMS are wired up as "wms"; everything
// else is "unavailable" with the reason, so the route fails with a clear
// message instead of a broken request. Extend as more municipalities are
// confirmed.

export type PdmSource =
  | {
      type: "wms";
      municipality: string;
      planLabel: string;
      baseUrl: string;
      layer: string;
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
  },
  Lisboa: {
    type: "unavailable",
    municipality: "Lisboa",
    reason:
      "O serviço SIG do PDM de Lisboa (MuniSIG_Secure) exige autenticação e não expõe WMS público.",
  },
  Porto: {
    type: "unavailable",
    municipality: "Porto",
    reason:
      "O geoportal do Porto expõe a Planta de Ordenamento via ArcGIS REST, mas sem a extensão WMS ativa.",
  },
  Coimbra: {
    type: "unavailable",
    municipality: "Coimbra",
    reason:
      "O geoportal de Coimbra expõe a Planta de Ordenamento via ArcGIS REST, mas sem a extensão WMS ativa.",
  },
  "Peso da Régua": {
    type: "unavailable",
    municipality: "Peso da Régua",
    reason:
      "O geoportal do município (i3geo) está online, mas não tem a Planta de Ordenamento publicada como camada WMS.",
  },
};

export function findPdmSource(municipality: string): PdmSource | undefined {
  return PDM_SOURCES[municipality];
}
