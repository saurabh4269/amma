import { del, get, set } from 'idb-keyval';
import type { Profile } from '@amma/schema';

/** What is visible without the PIN: enough to list records, nothing about her health. */
export interface ProfileMeta {
  id: string;
  label: string;
  locked: boolean;
}
type Stored = { meta: ProfileMeta; plain?: Profile; sealed?: { salt: number[]; iv: number[]; data: number[] } };

const INDEX = 'profiles';
const key = (id: string) => `profile:${id}`;
const ITERATIONS = 310_000;

async function aesKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function listProfiles(): Promise<ProfileMeta[]> {
  return (await get<ProfileMeta[]>(INDEX)) ?? [];
}

export async function saveProfile(profile: Profile, pin?: string): Promise<void> {
  const meta: ProfileMeta = { id: profile.id, label: profile.label, locked: Boolean(pin) };
  let stored: Stored;
  if (pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(pin, salt), new TextEncoder().encode(JSON.stringify(profile)));
    stored = { meta, sealed: { salt: [...salt], iv: [...iv], data: [...new Uint8Array(data)] } };
  } else {
    stored = { meta, plain: profile };
  }
  await set(key(profile.id), stored);
  const all = (await listProfiles()).filter((m) => m.id !== profile.id);
  await set(INDEX, [...all, meta]);
}

/** Returns undefined when the PIN is wrong. */
export async function openProfile(id: string, pin?: string): Promise<Profile | undefined> {
  const stored = await get<Stored>(key(id));
  if (!stored) return undefined;
  if (stored.plain) return stored.plain;
  if (!stored.sealed || !pin) return undefined;
  try {
    const { salt, iv, data } = stored.sealed;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      await aesKey(pin, new Uint8Array(salt)),
      new Uint8Array(data),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as Profile;
  } catch {
    return undefined;
  }
}

export async function deleteProfile(id: string): Promise<void> {
  await del(key(id));
  await set(INDEX, (await listProfiles()).filter((m) => m.id !== id));
}

/** Ask the browser not to evict our data when storage runs low. */
export async function requestPersistence(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}
