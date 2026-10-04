import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { Facility, FacilityLevel, Id, PlacePack, PlaceSource } from '@yaay/schema';
import { haversineKm } from '@yaay/engine';

/**
 * A place pack is built from a small config that names the source files and says how each
 * source's facility types map to levels. A type the config does not list stops the build:
 * nothing is guessed.
 */
const SourceConfig = PlaceSource.extend({
  reader: z.enum(['maina', 'healthsites']),
  /** Path under the data folder. */
  file: z.string(),
  /** For the Maina workbook: the value of its Country column. */
  country: z.string().optional(),
  levels: z.record(z.string(), FacilityLevel),
  /** Source types to leave out entirely, for example pharmacies. */
  skip: z.array(z.string()).default([]),
});
type SourceConfig = z.infer<typeof SourceConfig>;

export const PlaceConfig = z.strictObject({
  id: Id,
  name: z.string(),
  sources: z.array(SourceConfig).min(1),
  /** A facility from a later source within this distance of one already kept is taken to be the same place. */
  dedupeMetres: z.number().min(0),
});
export type PlaceConfig = z.infer<typeof PlaceConfig>;

interface Row {
  name: string;
  sourceType: string;
  ownership?: string;
  region?: string;
  lat?: number;
  lon?: number;
  phone?: string;
  key: string;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const text = (v: unknown): string | undefined => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? undefined : s;
};

async function readMaina(path: string, country: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet('SSA MFL');
  if (!ws) throw new Error(`${path}: no sheet "SSA MFL"`);
  const header = (ws.getRow(1).values as unknown[]).map((v) => text(v));
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${path}: no column "${name}"`);
    return i;
  };
  const c = { country: col('Country'), admin: col('Admin1'), name: col('Facility name'), type: col('Facility type'), own: col('Ownership'), lat: col('Lat'), lon: col('Long') };
  const rows: Row[] = [];
  ws.eachRow((r, n) => {
    if (n === 1 || text(r.getCell(c.country).value) !== country) return;
    rows.push({
      name: text(r.getCell(c.name).value) ?? '',
      sourceType: text(r.getCell(c.type).value) ?? '',
      ownership: text(r.getCell(c.own).value),
      region: text(r.getCell(c.admin).value),
      lat: num(r.getCell(c.lat).value),
      lon: num(r.getCell(c.lon).value),
      key: `row${n}`,
    });
  });
  return rows;
}

function readHealthsites(path: string): Row[] {
  const records = parseCsv(readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  return records.map((r) => ({
    name: text(r.name) ?? '',
    sourceType: text(r.amenity) ?? text(r.healthcare) ?? '',
    ownership: text(r.operator_type),
    lat: num(r.Y),
    lon: num(r.X),
    phone: text(r.contact_number),
    key: `${r.osm_type}${r.osm_id}`,
  }));
}

export async function buildPlacePack(config: PlaceConfig, dataDir: string, today: string): Promise<PlacePack> {
  const facilities: Facility[] = [];
  const read: Record<string, number> = {};
  const noCoordinates: Record<string, number> = {};
  let droppedAsDuplicates = 0;

  for (const src of config.sources) {
    const path = resolve(dataDir, src.file);
    let rows: Row[];
    if (src.reader === 'maina') {
      if (!src.country) throw new Error(`source ${src.id}: the maina reader needs "country"`);
      rows = await readMaina(path, src.country);
    } else {
      rows = readHealthsites(path);
    }
    read[src.id] = rows.length;
    noCoordinates[src.id] = 0;
    // Only facilities kept from earlier sources count as "already have this one".
    const earlier = facilities.slice();

    for (const row of rows) {
      if (src.skip.includes(row.sourceType)) continue;
      const level = src.levels[row.sourceType];
      if (!level) throw new Error(`source ${src.id}: facility type "${row.sourceType}" (${row.name || row.key}) is not in the config's levels or skip list`);
      if (row.lat === undefined || row.lon === undefined) {
        noCoordinates[src.id]! += 1;
        continue;
      }
      if (earlier.some((f) => haversineKm(f.lat, f.lon, row.lat!, row.lon!) * 1000 <= config.dedupeMetres)) {
        droppedAsDuplicates += 1;
        continue;
      }
      facilities.push(
        Facility.parse({
          id: `${src.id}:${row.key}`,
          name: row.name || row.sourceType,
          level,
          sourceType: row.sourceType,
          ownership: row.ownership,
          region: row.region,
          lat: row.lat,
          lon: row.lon,
          phone: row.phone,
          source: src.id,
        }),
      );
    }
  }

  const byLevel: Record<string, number> = Object.fromEntries(FacilityLevel.options.map((l) => [l, 0]));
  for (const f of facilities) byLevel[f.level] = (byLevel[f.level] ?? 0) + 1;
  return PlacePack.parse({
    id: config.id,
    name: config.name,
    built: today,
    sources: config.sources.map(({ id, title, license, url, typedLevels }) => ({ id, title, license, url, typedLevels })),
    facilities,
    report: { read, noCoordinates, droppedAsDuplicates, byLevel },
  });
}

export function readPlaceConfig(path: string): PlaceConfig {
  return PlaceConfig.parse(parseYaml(readFileSync(path, 'utf8')));
}
