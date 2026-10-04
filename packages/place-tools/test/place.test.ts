import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchFacilities, suggestFacilities } from '@amma/engine';
import { buildPlacePack, PlaceConfig } from '../src/index.ts';

const dir = mkdtempSync(join(tmpdir(), 'place-'));
const csv = (name: string, rows: string[]) =>
  writeFileSync(join(dir, name), ['X,Y,osm_id,osm_type,amenity,healthcare,name,contact_number,operator_type', ...rows].join('\n'));

const config = (over: Record<string, unknown> = {}) =>
  PlaceConfig.parse({
    id: 'test',
    name: 'Test',
    dedupeMetres: 300,
    sources: [
      { id: 'official', title: 'Official', license: 'unknown', url: 'unknown', typedLevels: true, reader: 'healthsites', file: 'a.csv', levels: { hospital: 'hospital', clinic: 'clinic' } },
      { id: 'crowd', title: 'Crowd', license: 'ODbL', url: 'unknown', typedLevels: false, reader: 'healthsites', file: 'b.csv', levels: { hospital: 'hospital', clinic: 'clinic' }, skip: ['pharmacy'], ...over },
    ],
  });

describe('place pack build', () => {
  csv('a.csv', ['-16.60,13.45,1,node,hospital,,Big Hospital,,', '-16.50,13.40,2,node,clinic,,Village Clinic,,', ',,3,way,clinic,,No Coordinates,,']);
  csv('b.csv', ['-16.6001,13.4501,9,node,hospital,,Same hospital again,123,', '-16.40,13.30,10,node,hospital,,Tagged hospital,,', '-16.41,13.31,11,node,pharmacy,,Chemist,,']);

  it('keeps provenance, drops near-duplicates from later sources, and counts what it left out', async () => {
    const pack = await buildPlacePack(config(), dir, '2026-10-04');
    expect(pack.facilities.map((f) => f.name)).toEqual(['Big Hospital', 'Village Clinic', 'Tagged hospital']);
    expect(pack.report).toMatchObject({ read: { official: 3, crowd: 3 }, noCoordinates: { official: 1, crowd: 0 }, droppedAsDuplicates: 1 });
    expect(pack.sources.find((s) => s.id === 'crowd')?.license).toBe('ODbL');
  });

  it('stops on a facility type the config does not know, rather than guessing', async () => {
    await expect(buildPlacePack(config({ skip: [] }), dir, '2026-10-04')).rejects.toThrow(/"pharmacy".*not in the config/);
  });

  it('suggests the nearest of any kind, and separately the nearest hospital from an official list', async () => {
    const pack = await buildPlacePack(config(), dir, '2026-10-04');
    const s = suggestFacilities([pack], 13.305, -16.405, 2, 100);
    expect(s.nearest.map((n) => n.facility.name)).toEqual(['Tagged hospital', 'Village Clinic']);
    expect(s.nearest[0]!.typed).toBe(false);
    // The crowd-tagged "hospital" is closer, but only the official list is trusted for the emergency suggestion.
    expect(s.hospital?.facility.name).toBe('Big Hospital');
    expect(s.hospital!.km).toBeGreaterThan(20);
  });

  it('does not offer an official hospital that is beyond the distance limit', async () => {
    const pack = await buildPlacePack(config(), dir, '2026-10-04');
    const s = suggestFacilities([pack], 13.305, -16.405, 2, 10);
    expect(s.nearest).toHaveLength(2);
    expect(s.hospital).toBeUndefined();
  });

  it('finds a place by part of its name, nearest first when a position is known', async () => {
    const pack = await buildPlacePack(config(), dir, '2026-10-04');
    expect(searchFacilities([pack], 'hospital', 5).map((n) => n.facility.name)).toEqual(['Big Hospital', 'Tagged hospital']);
    expect(searchFacilities([pack], 'HOSPITAL', 5, { lat: 13.3, lon: -16.4 })[0]!.facility.name).toBe('Tagged hospital');
    expect(searchFacilities([pack], 'h', 5)).toEqual([]);
  });

  it('says nothing when no pack covers where she is', async () => {
    const pack = await buildPlacePack(config(), dir, '2026-10-04');
    expect(suggestFacilities([pack], 19.07, 72.87, 3, 100)).toEqual({ nearest: [] });
  });
});
