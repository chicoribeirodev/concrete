"use client";

import { useEffect, useState } from "react";
import type { WmsLayerInfo } from "@/lib/wms-capabilities";

const LOADING_HTML = `<!doctype html>
<title>A gerar extrato do PDM…</title>
<body style="font-family: system-ui, sans-serif; padding: 3rem; color: #3f3f46;">
  <p>A gerar o extrato do PDM…</p>
  <p>Isto pode demorar vários minutos, dependendo do geoportal do município.</p>
</body>`;

type CapabilitiesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; layers: WmsLayerInfo[] };

export default function PdmExtractModal({
  projectId,
  municipality,
  defaultLayer,
  onClose,
}: {
  projectId: string;
  municipality: string;
  defaultLayer: string;
  onClose: () => void;
}) {
  const [capabilities, setCapabilities] = useState<CapabilitiesState>({ status: "loading" });
  const [selected, setSelected] = useState<Set<string>>(new Set([defaultLayer]));
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/capabilities?municipality=${encodeURIComponent(municipality)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Erro ${res.status}`);
        }
        const data: { layers: WmsLayerInfo[] } = await res.json();
        if (!cancelled) {
          setCapabilities({ status: "success", layers: data.layers });
          setSelected(new Set(data.layers.map((layer) => layer.name)));
        }
      } catch (error) {
        if (!cancelled) {
          setCapabilities({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [municipality]);

  function toggleLayer(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function handleGenerate() {
    if (selected.size === 0) {
      setGenerateError("Seleciona pelo menos uma camada.");
      return;
    }

    // Opened synchronously so it counts as a direct result of the click and
    // isn't blocked by the browser's popup blocker once the fetch below
    // (which can take several minutes) finally resolves.
    const outputWindow = window.open("", "_blank");
    outputWindow?.document.write(LOADING_HTML);

    setGenerating(true);
    setGenerateError(null);
    try {
      const layersParam = Array.from(selected).join(",");
      const res = await fetch(
        `/api/pdm-extrato?projectId=${projectId}&format=pdf&layers=${encodeURIComponent(layersParam)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (outputWindow) {
        outputWindow.location.href = url;
      }
      setGenerating(false);
      onClose();
    } catch (error) {
      console.error("Erro ao gerar extrato do PDM:", error);
      if (outputWindow) {
        outputWindow.document.body.innerHTML =
          "<p>Não foi possível gerar o extrato do PDM. Tenta novamente.</p>";
      }
      setGenerating(false);
      setGenerateError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Select PDM Layers
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 transition hover:text-zinc-900"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 max-h-80 overflow-y-auto">
          {capabilities.status === "loading" ? (
            <p className="text-sm text-zinc-500">A carregar camadas do geoportal…</p>
          ) : null}
          {capabilities.status === "error" ? (
            <p className="text-sm text-red-600">{capabilities.message}</p>
          ) : null}
          {capabilities.status === "success" ? (
            <div className="flex flex-col gap-2">
              {capabilities.layers.map((layer) => (
                <label
                  key={layer.name}
                  className="flex items-start gap-2 rounded-lg border border-zinc-200 p-2 text-sm hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(layer.name)}
                    onChange={() => toggleLayer(layer.name)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-zinc-900">{layer.title ?? layer.name}</span>
                    {layer.title && layer.title !== layer.name ? (
                      <span className="block text-xs text-zinc-400">{layer.name}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        {generateError ? <p className="mt-3 text-sm text-red-600">{generateError}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-600 transition hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || capabilities.status !== "success"}
            className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-60"
          >
            {generating ? "A gerar…" : "Generate PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
