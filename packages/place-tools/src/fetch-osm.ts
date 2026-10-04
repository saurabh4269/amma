import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Fetch health facility points for one named area from OpenStreetMap (Overpass API) and write them
 * in the same columns as a healthsites.io CSV, so the place-pack build reads both the same way.
 * OpenStreetMap data is ODbL: attribute it and share changes alike.
 *
 * usage: tsx fetch-osm.ts "<area name as in OpenStreetMap>" <admin_level> <out.csv>
 */
const [area, adminLevel, out] = process.argv.slice(2);
if (!area || !adminLevel || !out) {
  console.error('usage: "<area name>" <admin_level> <out.csv>');
  process.exit(2);
}
const query = `[out:json][timeout:180];
area["name:en"="${area}"]["admin_level"="${adminLevel}"]->.a;
( nwr["amenity"~"^(hospital|clinic|doctors|health_post)$"](area.a); );
out center tags;`;

// Public Overpass servers come and go; set OVERPASS_URL to use another.
const res = await fetch(process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }) });
if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
const { elements } = (await res.json()) as { elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const header = ['X', 'Y', 'osm_id', 'osm_type', 'amenity', 'healthcare', 'name', 'contact_number', 'operator_type'];
const rows = elements.map((e) => {
  const t = e.tags ?? {};
  return [e.lon ?? e.center?.lon ?? '', e.lat ?? e.center?.lat ?? '', e.id, e.type, t.amenity, t.healthcare, t.name ?? t['name:en'], t.phone ?? t['contact:phone'], t['operator:type']].map(cell).join(',');
});
const path = resolve(process.env.INIT_CWD ?? process.cwd(), out);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, [header.join(','), ...rows].join('\n'));
console.log(`${elements.length} facilities for ${area} written to ${out} (fetched ${new Date().toISOString().slice(0, 10)})`);
