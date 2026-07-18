"use client";

import dynamic from "next/dynamic";
import { Fragment, useEffect } from "react";
import type { Feature, MultiPolygon, Polygon } from "geojson";

type MapProject = {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  boundary?: Feature<Polygon | MultiPolygon> | null;
};

type ProjectsMapProps = {
  projects: MapProject[];
};

const PORTUGAL_CENTER: [number, number] = [39.5, -8.0];
const BOUNDARY_STYLE = {
  color: "#2563eb",
  weight: 2,
  fillColor: "#2563eb",
  fillOpacity: 0.12,
};

const MapContent = dynamic(
  async () => {
    const mod = await import("react-leaflet");
    const { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } = mod;
    const L = (await import("leaflet")).default;

    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "/marker-icon-2x.png",
      iconUrl: "/marker-icon.png",
      shadowUrl: "/marker-shadow.png",
    });

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

    function FitBoundsHandler({ projects }: ProjectsMapProps) {
      const map = useMap();

      useEffect(() => {
        if (projects.length === 0) {
          return;
        }

        const L = require("leaflet") as typeof import("leaflet");
        const bounds = L.latLngBounds([]);

        projects.forEach((project) => {
          if (project.boundary) {
            bounds.extend(L.geoJSON(project.boundary as never).getBounds());
          } else {
            bounds.extend([project.center.lat, project.center.lng]);
          }
        });

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
        }
      }, [projects, map]);

      return null;
    }

    return function MapContent({ projects }: ProjectsMapProps) {
      return (
        <div className="relative z-0 h-full min-h-[420px] w-full">
          <MapContainer
            center={PORTUGAL_CENTER}
            zoom={7}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {projects.map((project) => (
              <Fragment key={project.id}>
                {project.boundary ? (
                  <GeoJSON data={project.boundary as never} style={BOUNDARY_STYLE} />
                ) : null}
                <Marker position={[project.center.lat, project.center.lng]}>
                  <Popup>{project.name}</Popup>
                </Marker>
              </Fragment>
            ))}
            <ResizeHandler />
            <FitBoundsHandler projects={projects} />
          </MapContainer>
        </div>
      );
    };
  },
  { ssr: false }
);

export default function ProjectsMap({ projects }: ProjectsMapProps) {
  return <MapContent projects={projects} />;
}
