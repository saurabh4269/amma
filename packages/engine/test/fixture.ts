import { ContentPack } from '@amma/schema';

/**
 * A synthetic pack for engine tests. The wording is placeholder text and the
 * source is fictional: nothing here is health content.
 */
const src = { doc: 'fixture', quote: 'fixture' };
const card = (id: string, kind: string, status = 'from_source') => ({
  id,
  kind,
  ref: id,
  status,
  ...(status === 'interface' ? {} : { source: src }),
});
const sign = (id: string, group: string, urgency = 'urgent') => ({ id, group, urgency, label: `${id}_l`, teach: `${id}_t`, ask: `${id}_a` });
const signCards = (id: string) => [card(`${id}_l`, 'sign_label'), card(`${id}_t`, 'sign_teach'), card(`${id}_a`, 'sign_ask')];
const prompts = [
  'recall_ask', 'recall_more', 'recall_missed', 'recall_all', 'check_intro', 'open_ask', 'open_more',
  'did_you_say', 'noted', 'not_sure', 'yes', 'no', 'unsure', 'done', 'plan_intro', 'plan_playback', 'clarify_summary', 'track_intro',
];
const table = (group: string) => ({
  group,
  rows: [
    { id: 'urgent_yes', when: { anySign: { group, is: 'yes', urgency: 'urgent' } }, level: 'urgent', card: 'out_urgent' },
    { id: 'soon_yes', when: { anySign: { group, is: 'yes', urgency: 'soon' } }, level: 'soon', card: 'out_soon' },
    { id: 'any_unsure', when: { anySign: { group, is: 'unsure' } }, level: 'ask_person', card: 'out_ask' },
    { id: 'default', level: 'none_listed', card: 'out_none' },
  ],
});

export const fixtureInput = {
  id: 'fixture',
  version: '0.0.1',
  title: 'Engine test fixture',
  refLang: 'en',
  license: 'none',
  sources: [{ id: 'fixture', title: 'Fixture', publisher: 'tests', year: 2026, url: 'https://example.org/fixture', license: 'none' }],
  cards: [
    ...['bleed', 'head', 'fever'].flatMap(signCards),
    ...['pp_bleed', 'pp_breast', 'nb_feed'].flatMap(signCards),
    ...prompts.map((p) => card(`p_${p}`, 'prompt', 'interface')),
    card('out_urgent', 'outcome'), card('out_soon', 'outcome'), card('out_ask', 'outcome'), card('out_none', 'outcome'),
    card('q_food_l', 'label', 'interface'), card('q_food_a', 'answer'),
    card('q_iron_l', 'label', 'interface'), card('q_iron_a', 'answer'),
    card('c_pain', 'label', 'interface'),
    card('a_site', 'prompt', 'interface'), card('a_onset', 'prompt', 'interface'), card('a_with', 'prompt', 'interface'),
    ...['upper', 'lower', 'today', 'days', 'headache', 'nothing'].map((o) => card(`o_${o}`, 'label', 'interface')),
    card('t_anaemia', 'label', 'interface'), card('t_anaemia_1', 'info'), card('t_anaemia_2', 'info'),
    card('s_decider_ask', 'prompt', 'interface'), card('s_decider', 'label', 'interface'),
    card('s_facility_ask', 'prompt', 'interface'), card('s_facility', 'label', 'interface'),
  ],
  signs: [sign('bleed', 'pregnancy'), sign('head', 'pregnancy'), sign('fever', 'pregnancy'), sign('pp_bleed', 'mother_after_birth'), sign('pp_breast', 'mother_after_birth', 'soon'), sign('nb_feed', 'newborn')],
  questions: [
    { id: 'food', label: 'q_food_l', answer: 'q_food_a' },
    { id: 'iron', label: 'q_iron_l', answer: 'q_iron_a', tracks: ['anaemia'] },
  ],
  rules: [table('pregnancy'), table('mother_after_birth'), table('newborn')],
  attributes: [
    { id: 'site', ask: 'a_site', options: [{ id: 'upper', label: 'o_upper' }, { id: 'lower', label: 'o_lower' }] },
    { id: 'onset', ask: 'a_onset', options: [{ id: 'today', label: 'o_today' }, { id: 'days', label: 'o_days' }] },
    { id: 'with', ask: 'a_with', options: [{ id: 'headache', label: 'o_headache' }, { id: 'nothing', label: 'o_nothing' }] },
  ],
  complaints: [{ id: 'pain', label: 'c_pain', describe: ['onset'] }],
  clarifier: [
    { id: 'upper_head', complaint: 'pain', when: { site: ['upper'], with: ['headache'] }, raises: ['head'] },
    { id: 'lower', complaint: 'pain', when: { site: ['lower'] }, raises: ['bleed'] },
  ],
  tracks: [{ id: 'anaemia', label: 't_anaemia', phases: ['pregnant'], cards: ['t_anaemia_1', 't_anaemia_2'], boosts: ['bleed'] }],
  plan: [
    { id: 'decider', ask: 's_decider_ask', label: 's_decider', kind: 'contact', callOnUrgent: true, callOnSoon: true },
    { id: 'facility', ask: 's_facility_ask', label: 's_facility', kind: 'facility' },
  ],
  prompts: Object.fromEntries(prompts.map((p) => [p, `p_${p}`])),
  phases: {
    pregnant: { teach: ['pregnancy'], check: ['pregnancy'] },
    after_birth: { teach: ['mother_after_birth', 'newborn'], check: ['mother_after_birth', 'newborn'] },
  },
  flow: ['plan', 'track', 'recall', 'check', 'open', 'outcome', 'carry'],
  schedule: { boxIntervals: [1, 2, 4], sessionEveryDays: 7, afterBirthDays: [3, 7, 14, 21, 28, 42] },
  limits: { recallTurns: 6, recallAbstains: 2, openTurns: 2, clarifierQuestions: 4, smsSigns: 2 },
  templates: [{ id: 'carry_over', slots: ['next_visit', 'signs', 'contact'], ref: 'Next visit {next_visit}. Watch for: {signs}. Call {contact}.' }],
};

export const fixture = ContentPack.parse(fixtureInput);
