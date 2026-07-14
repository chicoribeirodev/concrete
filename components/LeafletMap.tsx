"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { FeatureCollection } from "geojson";

type LeafletMapProps = {
  data: FeatureCollection | null;
};

const MapContent = dynamic(
  async () => {
    const mod = await import("react-leaflet");
    const { MapContainer, TileLayer, GeoJSON, useMap } = mod;

    function ResizeHandler() {
      const map = useMap();

      useEffect(() => {
        const handleResize = () => {
          map.invalidateSize();
          window.requestAnimationFrame(() => map.invalidateSize());
        };

        const timeouts = [
          window.setTimeout(handleResize, 0),
          window.setTimeout(handleResize, 150),
          window.setTimeout(handleResize, 400),
        ];

        window.addEventListener("resize", handleResize);

        return () => {
          timeouts.forEach((timeout) => window.clearTimeout(timeout));
          window.removeEventListener("resize", handleResize);
        };
      }, [map]);

      return null;
    }

    function FitBoundsHandler({ data }: LeafletMapProps) {
      const map = useMap();

      useEffect(() => {
        if (!data || data.features.length === 0) {
          return;
        }

        const L = require("leaflet") as typeof import("leaflet");
        const layer = L.geoJSON(data as never);
        const bounds = layer.getBounds();

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
        }
      }, [data, map]);

      return null;
    }

    return function MapContent({ data }: LeafletMapProps) {
      if (!data) {
        return null;
      }

      return (
        <div className="h-full min-h-[480px] w-full">
          <MapContainer
            center={[0, 0]}
            zoom={2}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <GeoJSON data={data as never} />
            <ResizeHandler />
            <FitBoundsHandler data={data} />
          </MapContainer>
        </div>
      );
    };
  },
  { ssr: false }
);

export default function LeafletMap({ data }: LeafletMapProps) {
  if (!data) {
    return null;
  }

  return <MapContent data={data} />;
}
