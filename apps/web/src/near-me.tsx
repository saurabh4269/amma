import { useState } from 'preact/hooks';
import type { Facility, PlacePack } from '@amma/schema';
import { haversineKm, searchFacilities, suggestFacilities, type Near } from '@amma/engine';
import { loadPlaces, type Words } from './pack.ts';

/** How many places to offer, and how far the closest may be before the installed lists are taken not to cover her. */
const NEARBY = { count: 4, maxKm: 150 };
/** The public map is asked for facilities within this distance when no installed list covers her. */
const ONLINE_RADIUS_M = 30_000;
/** Public Overpass servers come and go, so each is tried in turn. */
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export const mapsLink = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

/** One reading of the phone's position. A quick, coarse fix is tried first; if that fails, a slower precise one. */
function position(): Promise<GeolocationPosition> {
  const ask = (opts: PositionOptions) => new Promise<GeolocationPosition>((ok, fail) => navigator.geolocation.getCurrentPosition(ok, fail, opts));
  return ask({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 }).catch((e: GeolocationPositionError) => {
    if (e.code === e.PERMISSION_DENIED) throw e;
    return ask({ enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 });
  });
}

/** Facilities near a point from OpenStreetMap, for places no installed list covers. Needs a connection. */
async function lookupOnline(lat: number, lon: number): Promise<Near[]> {
  const query = `[out:json][timeout:20];(nwr["amenity"~"^(hospital|clinic|doctors|health_post)$"](around:${ONLINE_RADIUS_M},${lat},${lon}););out center tags 200;`;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const { elements } = (await res.json()) as { elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
      return elements
        .flatMap((e): Near[] => {
          const la = e.lat ?? e.center?.lat;
          const lo = e.lon ?? e.center?.lon;
          const t = e.tags ?? {};
          const name = t.name ?? t['name:en'];
          if (la === undefined || lo === undefined || !name) return [];
          const facility: Facility = {
            id: `osm:${e.type}${e.id}`,
            name,
            level: t.amenity === 'hospital' ? 'hospital' : t.amenity === 'health_post' ? 'post' : 'clinic',
            sourceType: t.amenity ?? '',
            lat: la,
            lon: lo,
            phone: t.phone ?? t['contact:phone'],
            source: 'osm',
          };
          return [{ facility, km: haversineKm(lat, lon, la, lo), typed: false }];
        })
        .sort((a, b) => a.km - b.km);
    } catch {
      // try the next server
    }
  }
  throw new Error('no public map server answered');
}

type State =
  | { at: 'idle' | 'locating' | 'online' | 'none' | 'denied' | 'unavailable' }
  | { at: 'found'; nearest: Near[]; hospital?: Near };

/**
 * Suggest where to go. Three routes, so that one of them works on any phone:
 * the phone's location against the installed lists; the public map when no list covers her and she is online;
 * and a search by name when the phone will not give its location at all.
 */
export function NearMe({ words, places, onPick }: { words: Words; places: PlacePack[]; onPick: (n: Near) => void }) {
  const [state, setState] = useState<State>({ at: 'idle' });
  const [packs, setPacks] = useState(places);
  const [here, setHere] = useState<{ lat: number; lon: number }>();
  const [typed, setTyped] = useState('');

  /** The lists load after the first screen and a phone on a weak connection may not have them yet: fetch on demand. */
  const lists = async () => {
    if (packs.length) return packs;
    if (places.length) return places;
    const loaded = await loadPlaces();
    setPacks(loaded);
    return loaded;
  };

  const find = async () => {
    setState({ at: 'locating' });
    let pos: GeolocationPosition;
    try {
      if (!('geolocation' in navigator)) throw new Error('no geolocation');
      pos = await position();
    } catch (e) {
      const denied = typeof GeolocationPositionError !== 'undefined' && e instanceof GeolocationPositionError && e.code === e.PERMISSION_DENIED;
      setState({ at: denied ? 'denied' : 'unavailable' });
      return;
    }
    const { latitude: lat, longitude: lon } = pos.coords;
    setHere({ lat, lon });
    const local = suggestFacilities(await lists(), lat, lon, NEARBY.count, NEARBY.maxKm);
    if (local.nearest.length) return setState({ at: 'found', ...local });
    if (!navigator.onLine) return setState({ at: 'none' });
    setState({ at: 'online' });
    try {
      const found = await lookupOnline(lat, lon);
      if (found.length === 0) return setState({ at: 'none' });
      // From the public map a "hospital" tag is not reliable enough to call one the official nearest hospital,
      // but the nearest place tagged as one is still worth showing first.
      const hospital = found.find((n) => n.facility.level === 'hospital');
      const nearest = found.slice(0, NEARBY.count);
      setState({ at: 'found', nearest: hospital && !nearest.includes(hospital) ? [hospital, ...nearest] : nearest });
    } catch {
      setState({ at: 'none' });
    }
  };

  const matches = typed.trim().length >= 2 ? searchFacilities(packs.length ? packs : places, typed, 6, here) : [];
  const row = (n: Near, note?: string) => (
    <div class="place-row">
      <button type="button" class="place" onClick={() => onPick(n)}>
        <strong>{n.facility.name}</strong>
        <span>
          {n.facility.sourceType}
          {Number.isFinite(n.km) && ` · ${n.km.toFixed(n.km < 10 ? 1 : 0)} ${words.ui('straight_line')}`}
        </span>
        {note && <span class="muted">{note}</span>}
        {!n.typed && <span class="muted">{words.ui('unconfirmed')}</span>}
      </button>
      <a class="map-link" href={mapsLink(n.facility.lat, n.facility.lon)} target="_blank" rel="noreferrer" aria-label={words.ui('directions')}>🧭</a>
    </div>
  );
  const busy = state.at === 'locating' || state.at === 'online';
  return (
    <div class="list near">
      <button type="button" class="find" disabled={busy} onClick={() => void find()}>
        📍 {state.at === 'locating' ? words.ui('locating') : state.at === 'online' ? words.ui('searching_map') : words.ui('find_near')}
      </button>
      {state.at === 'none' && <p class="note">{words.ui('no_coverage')}</p>}
      {state.at === 'denied' && <p class="note">{words.ui('location_denied')}</p>}
      {state.at === 'unavailable' && <p class="note">{words.ui('no_location')}</p>}
      {state.at === 'found' && (
        <>
          {state.hospital && !state.nearest.includes(state.hospital) && row(state.hospital, words.ui('nearest_hospital'))}
          {state.nearest.map((n) => row(n, n === state.hospital ? words.ui('nearest_hospital') : undefined))}
        </>
      )}
      <input
        class="place-search"
        value={typed}
        placeholder={words.ui('search_place')}
        onFocus={() => void lists()}
        onInput={(e) => setTyped(e.currentTarget.value)}
        autocomplete="off"
      />
      {matches.map((n) => row(n))}
    </div>
  );
}
