"use client";

import type { FeatureCollection } from "geojson";
import LeafletMap from "@/components/LeafletMap";

type MapStepProps = {
  mapPreview: FeatureCollection | null;
  isClient: boolean;
};

export default function MapStep({ mapPreview, isClient }: MapStepProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
          Confirm on map
        </p>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          Confirmed
        </span>
      </div>
      <div className="h-[560px] overflow-hidden rounded-2xl border border-zinc-200">
        {isClient && mapPreview ? <LeafletMap data={mapPreview} /> : null}
      </div>
      <p className="text-sm text-zinc-600">
        The uploaded geometry is shown here for final confirmation.
      </p>
    </div>
  );
}
