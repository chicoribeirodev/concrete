// app/api/capabilities/route.ts
//
// GET /api/capabilities?municipality=Faro
//
// Lists the WMS layers actually published by a município's PDM geoportal
// (name/title/abstract/bbox), by querying its GetCapabilities — see
// lib/wms-capabilities.ts. Useful to confirm the `layer` hardcoded in
// lib/pdm-sources.ts still matches what the geoportal serves, or to explore
// what else is available there. Only serves municípios configured in
// PDM_SOURCES; for the rest returns 404/501 like /api/pdm-extrato does.

import { NextRequest, NextResponse } from "next/server";
import { findPdmSource } from "@/lib/pdm-sources";
import { fetchPdmSourceCapabilities } from "@/lib/wms-capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const municipality = searchParams.get("municipality");

  if (!municipality) {
    return NextResponse.json({ error: "O parâmetro 'municipality' é obrigatório." }, { status: 400 });
  }

  const source = findPdmSource(municipality);
  if (!source) {
    return NextResponse.json(
      { error: `Não há fonte de PDM configurada para o município '${municipality}'.` },
      { status: 404 }
    );
  }
  if (source.type === "unavailable") {
    return NextResponse.json(
      { error: `Capacidades do PDM indisponíveis para ${source.municipality}.`, reason: source.reason },
      { status: 501 }
    );
  }

  try {
    const { layers, configuredLayerFound } = await fetchPdmSourceCapabilities(source);
    return NextResponse.json({
      municipality: source.municipality,
      planLabel: source.planLabel,
      baseUrl: source.baseUrl,
      configuredLayer: source.layer,
      configuredLayerFound,
      layers,
    });
  } catch (error) {
    console.error("Erro ao obter capacidades do WMS:", error);
    return NextResponse.json(
      {
        error: `Não foi possível obter as capacidades do PDM. O geoportal de ${source.municipality} pode estar temporariamente indisponível.`,
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
