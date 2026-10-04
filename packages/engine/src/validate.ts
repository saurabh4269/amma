import { CLINICAL_KINDS, PROMPT_ROLES, type CardKind, type ContentPack } from '@amma/schema';
import { liveRows, nextAttribute, raisedSigns, type Attrs } from './clarifier.ts';
import { indexPack, type PackIndex } from './index-pack.ts';
import { checkTable } from './rules.ts';

export interface Problem {
  where: string;
  message: string;
}

/**
 * Everything that must hold before a content pack may be built or shipped.
 * Returns problems rather than throwing so a tool can list them all at once.
 */
export function validatePack(pack: ContentPack): Problem[] {
  const ix = indexPack(pack);
  const problems: Problem[] = [];
  const bad = (where: string, message: string) => problems.push({ where, message });

  const dup = (name: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) bad(`${name}.${id}`, 'duplicate id');
      seen.add(id);
    }
  };
  dup('cards', pack.cards.map((c) => c.id));
  dup('signs', pack.signs.map((s) => s.id));
  dup('sources', pack.sources.map((s) => s.id));
  dup('questions', pack.questions.map((q) => q.id));
  dup('complaints', pack.complaints.map((c) => c.id));
  dup('attributes', pack.attributes.map((a) => a.id));

  const sources = new Set(pack.sources.map((s) => s.id));
  for (const c of pack.cards) {
    const clinical = CLINICAL_KINDS.has(c.kind);
    if (clinical && !c.source) bad(`cards.${c.id}`, `a ${c.kind} card carries health content and must cite a source`);
    if (clinical && c.status === 'interface') bad(`cards.${c.id}`, 'health content cannot have status "interface"');
    if (c.source && !sources.has(c.source.doc)) bad(`cards.${c.id}`, `unknown source document ${c.source.doc}`);
    if (c.status === 'clinician_approved' && !c.reviewer) bad(`cards.${c.id}`, 'approved cards must name the reviewer');
  }

  const need = (where: string, id: string, ...kinds: CardKind[]) => {
    const c = ix.card.get(id);
    if (!c) return bad(where, `card ${id} does not exist`);
    if (kinds.length && !kinds.includes(c.kind)) bad(where, `card ${id} is a ${c.kind}, expected ${kinds.join(' or ')}`);
  };

  for (const s of pack.signs) {
    need(`signs.${s.id}.label`, s.label, 'sign_label');
    need(`signs.${s.id}.teach`, s.teach, 'sign_teach');
    need(`signs.${s.id}.ask`, s.ask, 'sign_ask');
  }
  for (const q of pack.questions) {
    need(`questions.${q.id}.label`, q.label, 'label');
    need(`questions.${q.id}.answer`, q.answer, 'answer', 'myth', 'info');
  }
  for (const role of PROMPT_ROLES) {
    const id = pack.prompts[role];
    if (!id) bad(`prompts.${role}`, 'missing');
    else need(`prompts.${role}`, id, 'prompt');
  }
  for (const s of pack.plan) {
    need(`plan.${s.id}.ask`, s.ask, 'prompt');
    need(`plan.${s.id}.label`, s.label, 'label');
  }
  const trackIds = new Set(pack.tracks.map((t) => t.id));
  for (const t of pack.tracks) {
    need(`tracks.${t.id}.label`, t.label, 'label');
    for (const c of t.cards) need(`tracks.${t.id}.cards`, c, 'info', 'myth', 'answer');
    for (const s of t.boosts) if (!ix.sign.has(s)) bad(`tracks.${t.id}.boosts`, `unknown sign ${s}`);
  }
  for (const q of pack.questions) for (const t of q.tracks) if (!trackIds.has(t)) bad(`questions.${q.id}`, `unknown track ${t}`);

  // Rules: a table for every checked group, and each table proven by exhaustion.
  for (const [phase, cfg] of Object.entries(pack.phases)) {
    for (const g of cfg.check) {
      if (!pack.rules.some((t) => t.group === g)) bad(`phases.${phase}.check`, `no rule table for group ${g}`);
    }
  }
  for (const t of pack.rules) {
    for (const r of t.rows) need(`rules.${t.group}.${r.id}`, r.card, 'outcome');
    for (const p of checkTable(ix, t)) {
      bad(`rules.${t.group}`, `${p.problem}${p.facts ? ` for answers ${JSON.stringify(p.facts)}` : ''}`);
    }
  }

  // Flow: an outcome without the check before it would report "none listed" from no answers at all.
  const iCheck = pack.flow.indexOf('check');
  const iOutcome = pack.flow.indexOf('outcome');
  if (iOutcome < 0) bad('flow', 'must contain an outcome node');
  if (iCheck < 0 || iCheck > iOutcome) bad('flow', 'check must come before outcome');
  if (pack.flow.includes('carry') && pack.templates.length === 0) bad('flow', 'carry needs at least one template');

  validateClarifier(ix, bad);
  return problems;
}

function validateClarifier(ix: PackIndex, bad: (where: string, message: string) => void) {
  const { pack } = ix;
  const attr = new Map(pack.attributes.map((a) => [a.id, a]));
  for (const a of pack.attributes) {
    if (!ix.card.has(a.ask)) bad(`attributes.${a.id}.ask`, `card ${a.ask} does not exist`);
    for (const o of a.options) if (!ix.card.has(o.label)) bad(`attributes.${a.id}.${o.id}`, `card ${o.label} does not exist`);
  }
  for (const c of pack.complaints) {
    if (!ix.card.has(c.label)) bad(`complaints.${c.id}.label`, `card ${c.label} does not exist`);
    for (const d of c.describe) if (!attr.has(d)) bad(`complaints.${c.id}.describe`, `unknown attribute ${d}`);
  }
  const complaints = new Set(pack.complaints.map((c) => c.id));
  for (const r of pack.clarifier) {
    if (!complaints.has(r.complaint)) bad(`clarifier.${r.id}`, `unknown complaint ${r.complaint}`);
    for (const s of r.raises) if (!ix.sign.has(s)) bad(`clarifier.${r.id}`, `unknown sign ${s}`);
    for (const [a, values] of Object.entries(r.when)) {
      const def = attr.get(a);
      if (!def) bad(`clarifier.${r.id}`, `unknown attribute ${a}`);
      else for (const v of values) if (!def.options.some((o) => o.id === v)) bad(`clarifier.${r.id}`, `${a} has no option ${v}`);
    }
  }

  // Walk every path she could take. When the questions stop, nothing that could still raise a sign may be left unasked.
  for (const c of pack.complaints) {
    const walk = (attrs: Attrs) => {
      const next = nextAttribute(ix, c.id, attrs);
      if (next === undefined) {
        const raised = new Set(raisedSigns(ix, c.id, attrs));
        const pending = liveRows(ix, c.id, attrs).filter(
          (r) => Object.keys(r.when).some((a) => attrs[a] === undefined) && r.raises.some((s) => !raised.has(s)),
        );
        if (pending.length) {
          bad(`clarifier.${c.id}`, `questions stop before row ${pending[0]!.id} is settled (answers ${JSON.stringify(attrs)}); raise limits.clarifierQuestions or simplify`);
        }
        return;
      }
      for (const o of attr.get(next)?.options ?? []) walk({ ...attrs, [next]: o.id });
    };
    walk({});
  }
}
