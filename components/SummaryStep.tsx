"use client";

import type { FeatureCollection } from "geojson";
import LeafletMap from "@/components/LeafletMap";

type GeoJsonSummary = {
  fileName: string;
  featureCount: number;
  geometryTypes: string[];
  propertyKeys: string[];
};

type SummaryStepProps = {
  summary: GeoJsonSummary;
  mapPreview: FeatureCollection | null;
  isClient: boolean;
  onContinue: () => void;
};

export default function SummaryStep({
  summary,
  onContinue,
}: SummaryStepProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Summary
          </p>
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700"
        >
          Continue to map
        </button>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <dl className="space-y-3 text-sm text-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <dt className="font-medium text-zinc-500">File</dt>
            <dd className="text-right font-medium text-zinc-900">{summary.fileName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-medium text-zinc-500">Features</dt>
            <dd className="font-medium text-zinc-900">{summary.featureCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-medium text-zinc-500">Geometry types</dt>
            <dd className="text-right font-medium text-zinc-900">
              {summary.geometryTypes.join(", ")}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="font-medium text-zinc-500">Property keys</dt>
            <dd className="text-right font-medium text-zinc-900">
              {summary.propertyKeys.length > 0 ? summary.propertyKeys.join(", ") : "None"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
