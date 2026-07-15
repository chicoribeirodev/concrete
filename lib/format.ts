export function formatDistance(km: number | null): string {
  if (km === null || isNaN(km)) return "—";
  if (km < 1) {
    const meters = km * 1000;
    return `${meters.toFixed(0)} m`;
  }
  return `${km.toFixed(1)} km`;
}

export function formatArea(km2: number | null): string {
  if (km2 === null || isNaN(km2)) return "—";
  const m2 = km2 * 1_000_000;

  if (m2 < 10000) {
    return `${m2.toFixed(0)} m²`;
  }
  if (km2 < 1) {
    const hectares = m2 / 10000;
    return `${hectares.toFixed(1)} ha`;
  }
  return `${km2.toFixed(1)} km²`;
}

export function formatHectares(km2: number | null): string {
  if (km2 === null || isNaN(km2)) return "—";
  return `${(km2 * 100).toFixed(2)} ha`;
}
