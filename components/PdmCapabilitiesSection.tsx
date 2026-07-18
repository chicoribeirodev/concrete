"use client";

import { useEffect, useState } from "react";

type WmsLayerInfo = {
  name: string;
  title?: string;
  abstract?: string;
};

type CapabilitiesResponse = {
  planLabel: string;
  configuredLayer: string;
  configuredLayerFound: boolean;
  layers: WmsLayerInfo[];
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: CapabilitiesResponse };

export default function PdmCapabilitiesSection({ municipality }: { municipality: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const res = await fetch(`/api/capabilities?municipality=${encodeURIComponent(municipality)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Erro ${res.status}`);
        }
        const data: CapabilitiesResponse = await res.json();
        if (!cancelled) setState({ status: "success", data });
      } catch (error) {
        if (!cancelled) {
          setState({
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

  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
        PDM WMS Layers
      </p>

      {state.status === "loading" ? (
        <p className="mt-4 text-sm text-zinc-500">A carregar camadas do geoportal…</p>
      ) : null}

      {state.status === "error" ? (
        <p className="mt-4 text-sm text-red-600">{state.message}</p>
      ) : null}

      {state.status === "success" ? (
        <>
          <p className="mt-3 text-sm text-zinc-600">{state.data.planLabel}</p>
          <p className="mt-1 text-xs text-zinc-400">
            Configured layer: {state.data.configuredLayer}{" "}
            {state.data.configuredLayerFound ? (
              <span className="text-emerald-600">(found)</span>
            ) : (
              <span className="text-red-600">(not found in capabilities)</span>
            )}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {state.data.layers.map((layer) => (
              <div
                key={layer.name}
                className={`rounded-xl border p-4 ${
                  layer.name === state.data.configuredLayer
                    ? "border-zinc-900 bg-zinc-50"
                    : "border-zinc-200 bg-zinc-50"
                }`}
              >
                <p className="break-words text-sm font-medium text-zinc-900">{layer.name}</p>
                {layer.title && layer.title !== layer.name ? (
                  <p className="mt-1 text-xs text-zinc-500">{layer.title}</p>
                ) : null}
                {layer.abstract ? (
                  <p className="mt-1 text-[11px] text-zinc-400">{layer.abstract}</p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
