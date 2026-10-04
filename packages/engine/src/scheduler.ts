import type { Profile } from '@amma/schema';
import type { PackIndex } from './index-pack.ts';

/**
 * Leitner boxes. A sign in box i comes back after boxIntervals[i] sessions.
 * Recalled moves it up one box; missed sends it back to box 0.
 */
export function dueSigns(ix: PackIndex, profile: Profile, signIds: string[]): string[] {
  const boosted = new Set(
    ix.pack.tracks.filter((t) => profile.tracks.includes(t.id)).flatMap((t) => t.boosts),
  );
  return signIds.filter((id) => {
    const b = profile.boxes[id];
    if (!b) return true; // never asked
    if (boosted.has(id)) return true; // a track she is on keeps its signs in every session
    return b.dueAt <= profile.sessionCount;
  });
}

export function gradeSign(ix: PackIndex, profile: Profile, signId: string, recalled: boolean): void {
  const intervals = ix.pack.schedule.boxIntervals;
  const prev = profile.boxes[signId]?.box ?? 0;
  const box = recalled ? Math.min(prev + 1, intervals.length - 1) : 0;
  const wait = intervals[box] ?? 1;
  profile.boxes[signId] = { box, dueAt: profile.sessionCount + wait };
}
