import { z } from 'zod';

/** Identifiers are lowercase slugs so they are safe as file names and fact keys. */
export const Id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase slug');
export type Id = z.infer<typeof Id>;

/** A group of danger signs. Which groups are taught and checked depends on the profile's phase. */
export const SignGroup = z.enum(['pregnancy', 'labour', 'mother_after_birth', 'newborn']);
export type SignGroup = z.infer<typeof SignGroup>;

export const Phase = z.enum(['pregnant', 'after_birth']);
export type Phase = z.infer<typeof Phase>;

/** Outcome levels, most urgent first. */
export const LEVELS = ['urgent', 'soon', 'ask_person', 'none_listed'] as const;
export const Level = z.enum(LEVELS);
export type Level = z.infer<typeof Level>;

export const SourceDoc = z.strictObject({
  id: Id,
  title: z.string().min(1),
  publisher: z.string().min(1),
  year: z.number().int(),
  url: z.url(),
  license: z.string().min(1),
});
export type SourceDoc = z.infer<typeof SourceDoc>;

export const SourceRef = z.strictObject({
  doc: Id,
  page: z.string().optional(),
  /** The exact words in the source that this card rests on. */
  quote: z.string().min(1),
});

export const CardKind = z.enum([
  'sign_label', // short name of a danger sign
  'sign_teach', // what the sign is and what to do
  'sign_ask', // "Do you have this today?"
  'outcome',
  'answer',
  'myth',
  'info',
  'label', // option labels, complaint names, plan slot names
  'prompt', // interface wording, no clinical content
]);
export type CardKind = z.infer<typeof CardKind>;

/** Kinds that carry health content and therefore must cite a source. */
export const CLINICAL_KINDS: ReadonlySet<CardKind> = new Set([
  'sign_label',
  'sign_teach',
  'sign_ask',
  'outcome',
  'answer',
  'myth',
  'info',
]);

export const Card = z.strictObject({
  id: Id,
  kind: CardKind,
  /** Reference wording in the pack's reference language. Language packs translate it. */
  ref: z.string().min(1),
  source: SourceRef.optional(),
  status: z.enum(['from_source', 'clinician_approved', 'interface']),
  reviewer: z.strictObject({ name: z.string(), date: z.iso.date() }).optional(),
  picture: z.string().optional(),
});
export type Card = z.infer<typeof Card>;

export const Sign = z.strictObject({
  id: Id,
  group: SignGroup,
  label: Id,
  teach: Id,
  ask: Id,
  /** `urgent`: go now. `soon`: see a health worker as soon as possible. Only urgent signs are in the recall step. */
  urgency: z.enum(['urgent', 'soon']).default('urgent'),
});
export type Sign = z.infer<typeof Sign>;

/** A question she may ask, answered by one card. */
export const Question = z.strictObject({
  id: Id,
  label: Id,
  answer: Id,
  tracks: z.array(Id).default([]),
});
export type Question = z.infer<typeof Question>;

/** Conditions over session facts. Facts are strings keyed like `sign:<id>`. */
export type Cond =
  | { fact: string; is: string }
  | { anySign: { group: SignGroup; is: 'yes' | 'no' | 'unsure'; urgency?: 'urgent' | 'soon' } }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };
export const Cond: z.ZodType<Cond> = z.lazy(() =>
  z.union([
    z.strictObject({ fact: z.string(), is: z.string() }),
    z.strictObject({ anySign: z.strictObject({ group: SignGroup, is: z.enum(['yes', 'no', 'unsure']), urgency: z.enum(['urgent', 'soon']).optional() }) }),
    z.strictObject({ all: z.array(Cond).min(1) }),
    z.strictObject({ any: z.array(Cond).min(1) }),
    z.strictObject({ not: Cond }),
  ]),
);

export const RuleRow = z.strictObject({
  id: Id,
  when: Cond.optional(), // omitted = always matches (the default row)
  level: Level,
  card: Id,
});
export type RuleRow = z.infer<typeof RuleRow>;

/** One decision table per sign group. First matching row wins. */
export const RuleTable = z.strictObject({
  group: SignGroup,
  rows: z.array(RuleRow).min(1),
});
export type RuleTable = z.infer<typeof RuleTable>;

export const AttributeOption = z.strictObject({ id: Id, label: Id, picture: z.string().optional() });
export const Attribute = z.strictObject({
  id: Id,
  ask: Id,
  options: z.array(AttributeOption).min(2),
});
export type Attribute = z.infer<typeof Attribute>;

export const Complaint = z.strictObject({
  id: Id,
  label: Id,
  /** Attributes always collected for the clinic card, after the ones that decide urgency. */
  describe: z.array(Id).default([]),
  /** When she can raise this complaint. Empty means always. */
  phases: z.array(Phase).default([]),
});
export type Complaint = z.infer<typeof Complaint>;

/** If the complaint and these attribute values hold, ask the explicit question for these signs. */
export const ClarifierRow = z.strictObject({
  id: Id,
  complaint: Id,
  when: z.record(Id, z.array(Id).min(1)).default({}),
  raises: z.array(Id),
});
export type ClarifierRow = z.infer<typeof ClarifierRow>;

export const Track = z.strictObject({
  id: Id,
  label: Id,
  phases: z.array(Phase).min(1),
  /** Cards played once, one per session, when the track is on. */
  cards: z.array(Id).default([]),
  /** Signs whose repeat priority rises while the track is on. */
  boosts: z.array(Id).default([]),
});
export type Track = z.infer<typeof Track>;

export const PlanSlot = z.strictObject({
  id: Id,
  ask: Id,
  label: Id,
  kind: z.enum(['contact', 'facility', 'transport', 'yesno']),
  /** Whether a "yes" on a danger sign should offer to call this contact. */
  callOnUrgent: z.boolean().default(false),
  /** Whether a "yes" on a see-a-worker-soon sign should offer to call this contact. */
  callOnSoon: z.boolean().default(false),
});
export type PlanSlot = z.infer<typeof PlanSlot>;

/** Engine vocabulary for interface wording. Each role maps to a card. */
export const PROMPT_ROLES = [
  'recall_ask',
  'recall_more',
  'recall_missed',
  'recall_all',
  'check_intro',
  'open_ask',
  'open_more',
  'did_you_say',
  'not_sure',
  'yes',
  'no',
  'unsure',
  'done',
  'plan_intro',
  'plan_playback',
  'clarify_summary',
  'track_intro',
] as const;
export const PromptRole = z.enum(PROMPT_ROLES);
export type PromptRole = z.infer<typeof PromptRole>;

export const FlowNode = z.enum(['plan', 'track', 'recall', 'check', 'open', 'outcome', 'carry']);
export type FlowNode = z.infer<typeof FlowNode>;

export const PhaseConfig = z.strictObject({
  teach: z.array(SignGroup).min(1),
  check: z.array(SignGroup).min(1),
});

export const Schedule = z.strictObject({
  /** Sessions to wait before a sign in box i is asked again. Box 0 is "every session". */
  boxIntervals: z.array(z.number().int().min(1)).min(2),
  sessionEveryDays: z.number().int().min(1),
  /** Days after birth on which a session is due (home-visit schedule). */
  afterBirthDays: z.array(z.number().int().min(0)).default([]),
});

export const Limits = z.strictObject({
  recallTurns: z.number().int().min(1),
  recallAbstains: z.number().int().min(1),
  openTurns: z.number().int().min(1),
  clarifierQuestions: z.number().int().min(1),
  /** How many signs the weekly SMS names. An SMS that lists everything is not read. */
  smsSigns: z.number().int().min(1),
});

export const SmsTemplate = z.strictObject({
  id: Id,
  slots: z.array(z.string()),
  ref: z.string().min(1),
});

export const ContentPack = z.strictObject({
  id: Id,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string(),
  refLang: z.string(),
  license: z.string(),
  sources: z.array(SourceDoc),
  cards: z.array(Card),
  signs: z.array(Sign),
  questions: z.array(Question).default([]),
  rules: z.array(RuleTable),
  attributes: z.array(Attribute).default([]),
  complaints: z.array(Complaint).default([]),
  clarifier: z.array(ClarifierRow).default([]),
  tracks: z.array(Track).default([]),
  plan: z.array(PlanSlot),
  prompts: z.record(PromptRole, Id),
  phases: z.record(Phase, PhaseConfig),
  flow: z.array(FlowNode).min(1),
  schedule: Schedule,
  limits: Limits,
  templates: z.array(SmsTemplate).default([]),
});
export type ContentPack = z.infer<typeof ContentPack>;
