import { z } from 'zod';
import { Id, Level, Phase } from './content.ts';

export const Contact = z.strictObject({ name: z.string(), phone: z.string() });

export const PlanValue = z.union([
  z.strictObject({ kind: z.literal('contact'), contact: Contact }),
  z.strictObject({ kind: z.literal('facility'), name: z.string(), phone: z.string().optional(), minutes: z.number().optional() }),
  z.strictObject({ kind: z.literal('transport'), contact: Contact }),
  z.strictObject({ kind: z.literal('yesno'), value: z.boolean() }),
]);
export type PlanValue = z.infer<typeof PlanValue>;

export const BoxState = z.strictObject({ box: z.number().int().min(0), dueAt: z.number().int().min(0) });

export const ComplaintRecord = z.strictObject({
  date: z.iso.date(),
  complaint: Id,
  attrs: z.record(Id, Id),
});

export const SessionRecord = z.strictObject({
  date: z.iso.date(),
  phase: Phase,
  due: z.array(Id),
  recalled: z.array(Id),
  answers: z.record(Id, z.enum(['yes', 'no', 'unsure'])),
  level: Level,
  unanswered: z.number().int().min(0),
});
export type SessionRecord = z.infer<typeof SessionRecord>;

/** Everything kept about one woman. No name: the profile is addressed by a label she chooses. */
export const Profile = z.strictObject({
  id: z.string(),
  label: z.string(),
  lang: z.string(),
  phase: Phase,
  /** Expected date of delivery while pregnant; date of birth after. */
  anchorDate: z.iso.date().optional(),
  tracks: z.array(Id).default([]),
  trackProgress: z.record(Id, z.number().int().min(0)).default({}),
  plan: z.record(Id, PlanValue).default({}),
  boxes: z.record(Id, BoxState).default({}),
  sessionCount: z.number().int().min(0).default(0),
  sessions: z.array(SessionRecord).default([]),
  complaints: z.array(ComplaintRecord).default([]),
  nextVisit: z.iso.date().optional(),
  /** Her own basic phone, for the weekly SMS. */
  phone: z.string().optional(),
});
export type Profile = z.infer<typeof Profile>;
