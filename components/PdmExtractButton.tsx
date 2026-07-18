"use client";

import { useState } from "react";
import PdmExtractModal from "@/components/PdmExtractModal";

export default function PdmExtractButton({
  projectId,
  municipality,
  defaultLayer,
}: {
  projectId: string;
  municipality: string;
  defaultLayer: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-zinc-700"
      >
        Generate PDM Extract
      </button>
      {open ? (
        <PdmExtractModal
          projectId={projectId}
          municipality={municipality}
          defaultLayer={defaultLayer}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
