"use client";

import type { ChangeEvent } from "react";

type UploadStepProps = {
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
};

export default function UploadStep({ onFileSelect, error }: UploadStepProps) {
  return (
    <div className="space-y-6">
      <label className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 transition hover:border-zinc-400 hover:bg-zinc-100">
        <span className="text-sm font-medium text-zinc-700">Select GeoJSON file</span>
        <input
          type="file"
          accept=".geojson,application/geo+json,application/json"
          onChange={onFileSelect}
          className="sr-only"
        />
        <span className="text-sm text-zinc-500">
          Supported formats: .geojson, .json, and GeoJSON content.
        </span>
      </label>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
