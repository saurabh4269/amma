import type { Facility, FacilityLevel, PlacePack } from '@yaay/schema';

const R_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometres. This is distance as the crow flies, not along roads. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

export interface Near {
  facility: Facility;
  km: number;
  /** True when the level comes from an official facility list rather than a crowd-sourced tag. */
  typed: boolean;
}

export interface Suggestions {
  /** The closest facilities of any level. */
  nearest: Near[];
  /** The closest facility an official list calls a hospital, if any. For bleeding or fits the nearest clinic may be the wrong first stop. */
  hospital?: Near;
}

/**
 * Facilities near a point, across every installed place pack.
 * Returns nothing when the closest one is further than `maxKm`: that means no pack covers where she is.
 */
export function suggestFacilities(packs: PlacePack[], lat: number, lon: number, count: number, maxKm: number): Suggestions {
  const all: Near[] = [];
  for (const p of packs) {
    const typed = new Set(p.sources.filter((s) => s.typedLevels).map((s) => s.id));
    for (const f of p.facilities) all.push({ facility: f, km: haversineKm(lat, lon, f.lat, f.lon), typed: typed.has(f.source) });
  }
  all.sort((a, b) => a.km - b.km);
  if (!all[0] || all[0].km > maxKm) return { nearest: [] };
  const isHospital = (l: FacilityLevel) => l === 'hospital';
  // The list is sorted by distance, so a hospital beyond the limit means there is none within reach on any official list.
  const hospital = all.find((n) => n.typed && isHospital(n.facility.level));
  return { nearest: all.slice(0, count), hospital: hospital && hospital.km <= maxKm ? hospital : undefined };
}
