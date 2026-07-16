"use client";

import { useState } from "react";

const LOADING_HTML = `<!doctype html>
<title>A gerar extrato do PDM…</title>
<body style="font-family: system-ui, sans-serif; padding: 3rem; color: #3f3f46;">
  <p>A gerar o extrato do PDM…</p>
  <p>Isto pode demorar vários minutos, dependendo do geoportal do município.</p>
</body>`;

export default function PdmExtractButton({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleClick() {
    // Opened synchronously so it counts as a direct result of the click and
    // isn't blocked by the browser's popup blocker once the fetch below
    // (which can take several minutes) finally resolves.
    const outputWindow = window.open("", "_blank");
    outputWindow?.document.write(LOADING_HTML);

    setStatus("loading");
    try {
      const res = await fetch(`/api/pdm-extrato?projectId=${projectId}&format=pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (outputWindow) {
        outputWindow.location.href = url;
      }
      setStatus("idle");
    } catch (error) {
      console.error("Erro ao gerar extrato do PDM:", error);
      if (outputWindow) {
        outputWindow.document.body.innerHTML =
          "<p>Não foi possível gerar o extrato do PDM. Tenta novamente.</p>";
      }
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-60"
      >
        {status === "loading" ? "A gerar…" : "Generate PDM Extract"}
      </button>
      {status === "loading" ? (
        <p className="max-w-[220px] text-right text-[11px] text-zinc-500">
          Isto pode demorar vários minutos, dependendo do geoportal do município.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="max-w-[220px] text-right text-[11px] text-red-600">
          Não foi possível gerar o extrato. Tenta novamente.
        </p>
      ) : null}
    </div>
  );
}
