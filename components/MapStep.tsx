"use client";

import type { FeatureCollection, Geometry } from "geojson";
import LeafletMap from "@/components/LeafletMap";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import portugalMunicipalitiesGeoJSON from "../data/portugal_municipalities.json";
import { formatDistance, formatHectares } from "@/lib/format";

type MapStepProps = {
  mapPreview: FeatureCollection | null;
  isClient: boolean;
};

type BoundaryStats = {
  center: [number, number] | null;
  widthKm: number | null;
  heightKm: number | null;
  areaKm2: number | null;
  municipality: string | null;
};

function collectCoordinatePairs(value: unknown): [number, number][] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const first = value[0];
  if (Array.isArray(first) && first.length >= 2 && typeof first[0] === "number" && typeof first[1] === "number") {
    if (value.every((item) => Array.isArray(item) && item.length >= 2 && typeof item[0] === "number" && typeof item[1] === "number")) {
      return value as [number, number][];
    }
  }

  return value.flatMap((item) => collectCoordinatePairs(item));
}

function flattenCoordinates(
  geometry: Geometry | null | undefined,
  coordinates: [number, number][] = []
): [number, number][] {
  if (!geometry) {
    return coordinates;
  }

  switch (geometry.type) {
    case "Point":
      return [...coordinates, [geometry.coordinates[0], geometry.coordinates[1]]];
    case "MultiPoint":
    case "LineString":
      return [...coordinates, ...collectCoordinatePairs(geometry.coordinates)];
    case "MultiLineString":
    case "Polygon":
      return [...coordinates, ...geometry.coordinates.flatMap((ring) => collectCoordinatePairs(ring))];
    case "MultiPolygon":
      return [
        ...coordinates,
        ...geometry.coordinates.flatMap((polygon) => polygon.flatMap((ring) => collectCoordinatePairs(ring))),
      ];
    case "GeometryCollection":
      return geometry.geometries.reduce<[number, number][]>(
        (acc, childGeometry) => flattenCoordinates(childGeometry, acc),
        coordinates
      );
    default:
      return coordinates;
  }
}

function getPolygonBounds(geometry: Geometry | null | undefined) {
  if (!geometry) {
    return null;
  }

  const points = collectCoordinatePairs((geometry as { coordinates?: unknown }).coordinates as unknown);
  if (points.length === 0) {
    return null;
  }

  const lngValues = points.map(([lng]) => lng);
  const latValues = points.map(([, lat]) => lat);

  return {
    minLng: Math.min(...lngValues),
    maxLng: Math.max(...lngValues),
    minLat: Math.min(...latValues),
    maxLat: Math.max(...latValues),
  };
}

function getCenterPoint(coordinates: [number, number][]) {
  if (coordinates.length === 0) {
    return null;
  }

  const [lngSum, latSum] = coordinates.reduce(
    (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat],
    [0, 0]
  );

  return [lngSum / coordinates.length, latSum / coordinates.length] as [number, number];
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistance([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function getAreaKm2(geometry: Geometry | null | undefined) {
  if (!geometry) return null;

  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  if (!polygons.length) return null;

  const R = 6371000; // Earth's radius in meters

  let totalAreaM2 = 0;

  for (const polygon of polygons) {
    const outerRing = polygon[0];

    if (outerRing.length < 4) continue;

    // Local origin
    const avgLat =
      outerRing.reduce((s, [, lat]) => s + lat, 0) / outerRing.length;

    const avgLng =
      outerRing.reduce((s, [lng]) => s + lng, 0) / outerRing.length;

    const lat0 = toRadians(avgLat);

    const projected = outerRing.map(([lng, lat]) => {
      const x =
        R *
        toRadians(lng - avgLng) *
        Math.cos(lat0);

      const y =
        R *
        toRadians(lat - avgLat);

      return [x, y] as [number, number];
    });

    let area = 0;

    for (let i = 0; i < projected.length - 1; i++) {
      const [x1, y1] = projected[i];
      const [x2, y2] = projected[i + 1];

      area += x1 * y2 - x2 * y1;
    }

    totalAreaM2 += Math.abs(area) / 2;
  }

  return totalAreaM2 / 1_000_000;
}

function findLocalMunicipality(center: [number, number] | null): string | null {
  if (!center) return null;

  // Turf expects [lng, lat]
  const pt = point(center);

  for (const feature of portugalMunicipalitiesGeoJSON.features) {
    // Ensure the feature geometry is a Polygon or MultiPolygon
    if (feature.geometry && (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")) {
      if (booleanPointInPolygon(pt, feature as any)) {
        // Standard CAOP files use 'Concelho' or 'con_name' for the municipality name
        const municipalityName = feature.properties?.Concelho;
        if (typeof municipalityName === "string") {
          const formatted = String(municipalityName).charAt(0).toUpperCase() + String(municipalityName).slice(1).toLowerCase();
          return formatted;
        }
        return null;
      }
    }
  }

  return null;
}

function getCoordinatesFromMapPreview(mapPreview: FeatureCollection | null) {
  if (!mapPreview) {
    return [] as [number, number][];
  }

  const coordinates = mapPreview.features.flatMap((feature) =>
    flattenCoordinates(feature.geometry)
  );

  if (coordinates.length > 0) {
    return coordinates;
  }

  const fallbackGeometry = (mapPreview as FeatureCollection & { geometry?: Geometry | null }).geometry ?? null;
  return flattenCoordinates(fallbackGeometry);
}

function getBoundaryStats(mapPreview: FeatureCollection | null): BoundaryStats {
  if (!mapPreview) {
    return {
      center: null,
      widthKm: null,
      heightKm: null,
      areaKm2: null,
      municipality: null,
    };
  }

  const coordinates = getCoordinatesFromMapPreview(mapPreview);

  if (coordinates.length === 0) {
    return {
      center: null,
      widthKm: null,
      heightKm: null,
      areaKm2: null,
      municipality: null,
    };
  }

  const bounds = mapPreview.features.reduce<ReturnType<typeof getPolygonBounds>>((current, feature) => {
    const featureBounds = getPolygonBounds(feature.geometry);

    if (!featureBounds) {
      return current;
    }

    if (!current) {
      return featureBounds;
    }

    return {
      minLng: Math.min(current.minLng, featureBounds.minLng),
      maxLng: Math.max(current.maxLng, featureBounds.maxLng),
      minLat: Math.min(current.minLat, featureBounds.minLat),
      maxLat: Math.max(current.maxLat, featureBounds.maxLat),
    };
  }, null);

  const center = bounds
    ? [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2]
    : getCenterPoint(coordinates);

  const widthKm = bounds
    ? haversineDistance([bounds.minLng, (bounds.minLat + bounds.maxLat) / 2], [bounds.maxLng, (bounds.minLat + bounds.maxLat) / 2])
    : null;
  const heightKm = bounds
    ? haversineDistance([(bounds.minLng + bounds.maxLng) / 2, bounds.minLat], [(bounds.minLng + bounds.maxLng) / 2, bounds.maxLat])
    : null;

  const areaKm2 = mapPreview.features.reduce((total, feature) => {
    const area = getAreaKm2(feature.geometry);
    return total + (area ?? 0);
  }, 0);

  const municipality = center ? findLocalMunicipality(center as [number, number]) : "test";

  return {
    center: center ? ([center[0], center[1]] as [number, number]) : null,
    widthKm,
    heightKm,
    areaKm2: areaKm2 > 0 ? areaKm2 : null,
    municipality,
  };
}

export default function MapStep({ mapPreview, isClient }: MapStepProps) {
  const stats = getBoundaryStats(mapPreview);

  const sizeText = stats.widthKm && stats.heightKm
    ? `${formatDistance(stats.widthKm)} × ${formatDistance(stats.heightKm)}`
    : "—";

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
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-900">Boundary Details</p>
          <span className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
            Overview
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
              Center point
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-900">
              {stats.center ? `${stats.center[1].toFixed(4)}°, ${stats.center[0].toFixed(4)}°` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
              Size
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-900">
              {sizeText}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
              Area
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-900">
              {formatHectares(stats.areaKm2)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
              Municipality
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-900">
              {stats.municipality ?? "Not detected"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}