import type { Feature, MultiPolygon, Polygon } from "geojson";

export type Coordinates = {
  lat: number;
  lng: number;
};

export type BoundarySize = {
  widthKm: number;
  heightKm: number;
  areaKm2: number;
};

export type Project = {
  id: string;
  name: string;
  status: "Draft" | "Active" | "Archived";
  updatedAt: string;
  center: Coordinates;
  boundary: Feature<Polygon | MultiPolygon>;
  municipality: string;
  size: BoundarySize;
};

// Builds a rectangular ring around a center point, in degrees.
function rectangleRing(
  center: Coordinates,
  widthKm: number,
  heightKm: number
): [number, number][] {
  const latDegPerKm = 1 / 111;
  const lngDegPerKm = 1 / (111 * Math.cos((center.lat * Math.PI) / 180));

  const halfLat = (heightKm / 2) * latDegPerKm;
  const halfLng = (widthKm / 2) * lngDegPerKm;
  const { lat, lng } = center;

  return [
    [lng - halfLng, lat - halfLat],
    [lng + halfLng, lat - halfLat],
    [lng + halfLng, lat + halfLat],
    [lng - halfLng, lat + halfLat],
    [lng - halfLng, lat - halfLat],
  ];
}

// Builds a single-parcel boundary around a center point. Real projects will
// eventually get their boundary from an uploaded GeoJSON file (see the
// upload flow in app/projects/create), but the sample projects below need
// something to render on the map in the meantime.
function rectangleBoundary(
  center: Coordinates,
  widthKm: number,
  heightKm: number
): Feature<Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [rectangleRing(center, widthKm, heightKm)],
    },
  };
}

// Builds a multi-parcel boundary, for projects made up of separate,
// non-contiguous plots.
function multiRectangleBoundary(
  parts: { center: Coordinates; widthKm: number; heightKm: number }[]
): Feature<MultiPolygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiPolygon",
      coordinates: parts.map(({ center, widthKm, heightKm }) => [
        rectangleRing(center, widthKm, heightKm),
      ]),
    },
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.sin(deltaLng / 2) ** 2 * Math.cos(lat1Rad) * Math.cos(lat2Rad);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Local equirectangular projection around the ring's own centroid, then a
// shoelace formula — accurate enough for boundaries a few km across, no
// heavy geo library needed.
function ringAreaKm2(ring: [number, number][]) {
  if (ring.length < 4) return 0;

  const earthRadiusM = 6371000;
  const avgLat = ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length;
  const avgLng = ring.reduce((sum, [lng]) => sum + lng, 0) / ring.length;
  const lat0 = toRadians(avgLat);

  const projected = ring.map(([lng, lat]) => [
    earthRadiusM * toRadians(lng - avgLng) * Math.cos(lat0),
    earthRadiusM * toRadians(lat - avgLat),
  ]);

  let area = 0;
  for (let i = 0; i < projected.length - 1; i++) {
    const [x1, y1] = projected[i];
    const [x2, y2] = projected[i + 1];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2 / 1_000_000;
}

function getOuterRings(geometry: Polygon | MultiPolygon): [number, number][][] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon[0] as [number, number][]);
}

// Derives width/height/area straight from a boundary's geometry, so a
// project's size always matches the polygon it was built from — including
// multi-parcel boundaries, where area sums across parcels and width/height
// come from the combined bounding box.
function getBoundarySize(boundary: Feature<Polygon | MultiPolygon>): BoundarySize {
  const outerRings = getOuterRings(boundary.geometry);
  const points = outerRings.flat();

  const lngValues = points.map(([lng]) => lng);
  const latValues = points.map(([, lat]) => lat);
  const minLng = Math.min(...lngValues);
  const maxLng = Math.max(...lngValues);
  const minLat = Math.min(...latValues);
  const maxLat = Math.max(...latValues);
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;

  return {
    widthKm: haversineDistanceKm([minLng, midLat], [maxLng, midLat]),
    heightKm: haversineDistanceKm([midLng, minLat], [midLng, maxLat]),
    areaKm2: outerRings.reduce((total, ring) => total + ringAreaKm2(ring), 0),
  };
}

const riversideCenter = { lat: 38.7223, lng: -9.1393 }; // Lisbon
const harborCenter = { lat: 41.1579, lng: -8.6291 }; // Porto
const greenfieldCenter = { lat: 40.2033, lng: -8.4103 }; // Coimbra
const douroCenter = { lat: 41.1621, lng: -7.7869 }; // Peso da Régua
const douroSecondPlotCenter = { lat: 41.1576, lng: -7.7689 }; // Adjacent vineyard plot
const algarveCenter = { lat: 37.0194, lng: -7.9304 }; // Faro
const algarveSecondPlotCenter = { lat: 37.0221, lng: -7.9169 }; // Adjacent resort plot

const riversideBoundary = rectangleBoundary(riversideCenter, 0.6, 0.4);
const harborBoundary = rectangleBoundary(harborCenter, 0.8, 0.5);
const greenfieldBoundary = rectangleBoundary(greenfieldCenter, 0.5, 0.5);
const douroBoundary = multiRectangleBoundary([
  { center: douroCenter, widthKm: 1.2, heightKm: 0.8 },
  { center: douroSecondPlotCenter, widthKm: 0.6, heightKm: 0.5 },
]);
const algarveBoundary = multiRectangleBoundary([
  { center: algarveCenter, widthKm: 0.9, heightKm: 0.6 },
  { center: algarveSecondPlotCenter, widthKm: 0.5, heightKm: 0.4 },
]);

export const projects: Project[] = [
  {
    id: "1",
    name: "Riverside Development",
    status: "Active",
    updatedAt: "2026-07-10",
    center: riversideCenter,
    boundary: riversideBoundary,
    municipality: "Lisboa",
    size: getBoundarySize(riversideBoundary),
  },
  {
    id: "2",
    name: "Harbor District Rezoning",
    status: "Draft",
    updatedAt: "2026-07-08",
    center: harborCenter,
    boundary: harborBoundary,
    municipality: "Porto",
    size: getBoundarySize(harborBoundary),
  },
  {
    id: "3",
    name: "Greenfield Site Survey",
    status: "Archived",
    updatedAt: "2026-06-22",
    center: greenfieldCenter,
    boundary: greenfieldBoundary,
    municipality: "Coimbra",
    size: getBoundarySize(greenfieldBoundary),
  },
  {
    id: "4",
    name: "Douro Valley Vineyard Expansion",
    status: "Active",
    updatedAt: "2026-07-05",
    center: douroCenter,
    boundary: douroBoundary,
    municipality: "Peso da Régua",
    size: getBoundarySize(douroBoundary),
  },
  {
    id: "5",
    name: "Algarve Coastal Resort",
    status: "Draft",
    updatedAt: "2026-07-01",
    center: algarveCenter,
    boundary: algarveBoundary,
    municipality: "Faro",
    size: getBoundarySize(algarveBoundary),
  },
];
