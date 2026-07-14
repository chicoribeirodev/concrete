"use client";

import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import MapStep from "@/components/MapStep";
import Navigation from "@/components/Navigation";
import SummaryStep from "@/components/SummaryStep";
import UploadStep from "@/components/UploadStep";

type GeoJsonFeature = {
  type: "Feature";
  geometry?: Record<string, unknown> | null;
  properties?: Record<string, unknown> | null;
};

type GeoJsonSummary = {
  fileName: string;
  featureCount: number;
  geometryTypes: string[];
  propertyKeys: string[];
  previewFeatures: Array<{
    title: string;
    geometryType: string;
  }>;
};

function buildSummary(parsed: unknown, fileName: string): GeoJsonSummary | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const features = Array.isArray(record.features)
    ? (record.features as GeoJsonFeature[])
    : record.type === "Feature"
      ? [record as GeoJsonFeature]
      : [];

  if (record.type !== "FeatureCollection" && record.type !== "Feature") {
    return null;
  }

  const geometryTypes = features
    .map((feature) => feature.geometry?.type)
    .filter((type): type is string => typeof type === "string");

  const propertyKeys = Array.from(
    new Set(
      features.flatMap((feature) =>
        Object.keys((feature.properties as Record<string, unknown>) ?? {})
      )
    )
  );

  return {
    fileName,
    featureCount: features.length,
    geometryTypes: geometryTypes.length > 0 ? geometryTypes : ["No geometry"],
    propertyKeys,
    previewFeatures: features.slice(0, 5).map((feature, index) => ({
      title: `Feature ${index + 1}`,
      geometryType: typeof feature.geometry?.type === "string" ? feature.geometry.type : "Unknown",
    })),
  };
}

function buildMapPreview(parsed: unknown): FeatureCollection | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const features = Array.isArray(record.features)
    ? (record.features as GeoJsonFeature[])
    : record.type === "Feature"
      ? [record as GeoJsonFeature]
      : [];

  if (record.type !== "FeatureCollection" && record.type !== "Feature") {
    return null;
  }

  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      geometry: (feature.geometry as unknown as Feature["geometry"]) ?? null,
      properties: feature.properties ?? {},
    })),
  } as FeatureCollection;
}

export default function ProjectsPage() {
  const [summary, setSummary] = useState<GeoJsonSummary | null>(null);
  const [mapPreview, setMapPreview] = useState<FeatureCollection | null>(null);
  const [currentStep, setCurrentStep] = useState<"upload" | "summary" | "map">("upload");
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const nextSummary = buildSummary(parsed, file.name);

      if (!nextSummary) {
        throw new Error("The selected file is not a valid GeoJSON document.");
      }

      setSummary(nextSummary);
      setMapPreview(buildMapPreview(parsed));
      setCurrentStep("summary");
      setError(null);
    } catch (err) {
      setSummary(null);
      setMapPreview(null);
      setCurrentStep("upload");
      setError(
        err instanceof Error ? err.message : "We could not read that file."
      );
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="flex min-h-screen">
        <Navigation />
        <main className="flex-1 bg-zinc-50 p-8 lg:p-12">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
                Projects
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                Create a new project
              </h1>
              <div className="mt-8 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
                <div className={`rounded-full border px-3 py-1.5 ${currentStep === "upload" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300"}`}>
                  Step 1 • Upload
                </div>
                <div className={`rounded-full border px-3 py-1.5 ${currentStep === "summary" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300"}`}>
                  Step 2 • Summary
                </div>
                <div className={`rounded-full border px-3 py-1.5 ${currentStep === "map" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300"}`}>
                  Step 3 • Confirm on Map
                </div>
              </div>

              {!summary ? (
                <div className="mt-6">
                  <UploadStep onFileSelect={handleFileChange} error={error} />
                </div>
              ) : currentStep === "summary" ? (
                <div className="mt-6">
                  <SummaryStep
                    summary={summary}
                    mapPreview={mapPreview}
                    isClient={isClient}
                    onContinue={() => setCurrentStep("map")}
                  />
                </div>
              ) : (
                <div className="mt-6">
                  <MapStep mapPreview={mapPreview} isClient={isClient} />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
