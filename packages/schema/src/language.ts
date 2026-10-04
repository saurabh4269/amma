import { z } from 'zod';
import { Id } from './content.ts';

export const Translation = z.strictObject({
  text: z.string().min(1),
  /** Where the wording comes from. Only `official_edition` and `speaker_reviewed` may reach users. */
  status: z.enum(['official_edition', 'speaker_reviewed', 'team_draft', 'machine_draft']),
});

export const AudioClip = z.strictObject({
  file: z.string(),
  voice: z.strictObject({ kind: z.enum(['human', 'synthetic']), by: z.string() }),
  approvedBy: z.string().optional(),
  sha256: z.string().optional(),
});

export const Example = z.strictObject({
  meaning: z.string(),
  file: z.string(),
  speaker: z.string(),
  sex: z.enum(['f', 'm', 'x']),
  synthetic: z.boolean().default(false),
  consent: z.string(),
});

export const Thresholds = z.strictObject({
  accept: z.number(),
  confirm: z.number(),
  /** Measured when the thresholds were computed, so a reader can judge them. */
  measured: z.strictObject({
    speakers: z.number().int(),
    examples: z.number().int(),
    coverage: z.number(),
    wrongAccepts: z.number().int(),
    dangerAcceptedAsOther: z.number().int(),
  }),
});

export const LanguagePack = z.strictObject({
  id: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/, 'BCP 47 tag'),
  name: z.string(),
  content: z.strictObject({ id: Id, version: z.string() }),
  translations: z.record(Id, Translation),
  templates: z.record(Id, Translation).default({}),
  audio: z.record(Id, AudioClip).default({}),
  examples: z.array(Example).default([]),
  /** Typed phrases per meaning, for text channels and development. */
  lexicon: z.record(z.string(), z.array(z.string())).default({}),
  /** App chrome wording (buttons, headings). Not health content. */
  ui: z.record(z.string(), z.string()).default({}),
  encoder: z.strictObject({ id: z.string(), sha256: z.string() }).optional(),
  thresholds: Thresholds.optional(),
});
export type LanguagePack = z.infer<typeof LanguagePack>;
