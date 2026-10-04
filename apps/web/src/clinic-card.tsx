import type { Profile } from '@amma/schema';
import type { PackIndex } from '@amma/engine';
import type { Words } from './pack.ts';
import { planText, PlanView, SendText } from './plan.tsx';

const DAY = 86_400_000;

/** Weeks of pregnancy from the expected date of birth, assuming 40 weeks. */
export function weeksPregnant(dueDate: string, today: Date): number {
  return Math.floor(40 - (new Date(dueDate).getTime() - today.getTime()) / (7 * DAY));
}

/** One screen for the midwife: what happened since the last visit, in the order she needs it. */
export function ClinicCard({ ix, words, profile, onBack }: { ix: PackIndex; words: Words; profile: Profile; onBack: () => void }) {
  const signLabel = (id: string) => words.card(ix.sign.get(id)?.label ?? id);
  const reported = (answer: 'yes' | 'unsure') =>
    profile.sessions.flatMap((s) => Object.entries(s.answers).filter(([, a]) => a === answer).map(([id]) => ({ date: s.date, id })));
  const last = profile.sessions.at(-1);
  const unanswered = profile.sessions.reduce((n, s) => n + s.unanswered, 0);
  const optionLabel = (attr: string, value: string) =>
    words.card(ix.pack.attributes.find((a) => a.id === attr)?.options.find((o) => o.id === value)?.label ?? value);

  const yes = reported('yes').map((r) => `${r.date} — ${signLabel(r.id)}`);
  const unsure = reported('unsure').map((r) => `${r.date} — ${signLabel(r.id)}`);
  const complaints = profile.complaints.map((c) => {
    const name = words.card(ix.pack.complaints.find((x) => x.id === c.complaint)?.label ?? c.complaint);
    return `${c.date} — ${[name, ...Object.entries(c.attrs).map(([a, v]) => optionLabel(a, v))].join(', ')}`;
  });
  const stage =
    profile.phase === 'pregnant'
      ? `${words.ui('pregnant')}${profile.anchorDate ? `, ${weeksPregnant(profile.anchorDate, new Date())} ${words.ui('weeks')}` : ''}`
      : `${words.ui('after_birth')}${profile.anchorDate ? `, ${profile.anchorDate}` : ''}`;
  const outcomeCard = (level: string) => ix.pack.rules.flatMap((t) => t.rows).find((r) => r.level === level)?.card;
  const lastResult = last && outcomeCard(last.level);
  const worker = ix.pack.plan.flatMap((s) => {
    const v = profile.plan[s.id];
    return s.callOnSoon && v && 'contact' in v && v.contact.phone ? [v.contact.phone] : [];
  });
  // The same card as plain text, for sending to the health worker or the clinic.
  const text = [
    `${words.ui('clinic_card')}: ${profile.label}`,
    stage,
    profile.nextVisit ? `${words.ui('next_visit')}: ${profile.nextVisit}` : '',
    yes.length ? `${words.ui('signs_yes')}:\n${yes.map((x) => `- ${x}`).join('\n')}` : '',
    unsure.length ? `${words.ui('signs_unsure')}:\n${unsure.map((x) => `- ${x}`).join('\n')}` : '',
    complaints.length ? `${words.ui('complaints')}:\n${complaints.map((x) => `- ${x}`).join('\n')}` : '',
    unanswered > 0 ? `${words.ui('unanswered')}: ${unanswered}` : '',
    last ? `${words.ui('recalled')}: ${last.recalled.length} / ${last.due.length} (${last.date})` : words.ui('none_yet'),
    ...ix.pack.plan.flatMap((s) => (profile.plan[s.id] ? [`${words.card(s.label)}: ${planText(profile.plan[s.id]!)}`] : [])),
  ].filter(Boolean).join('\n');

  return (
    <main class="page card">
      <header class="top"><button class="ghost" onClick={onBack}>‹ {words.ui('back')}</button><h2>{words.ui('clinic_card')}</h2></header>
      <p class="headline">{profile.phase === 'pregnant' ? '🤰' : '👶'} {stage}</p>
      {profile.nextVisit && <p>{words.ui('next_visit')}: {profile.nextVisit}</p>}
      {profile.tracks.length > 0 && <p>{profile.tracks.map((t) => words.card(ix.pack.tracks.find((x) => x.id === t)?.label ?? t)).join(' · ')}</p>}
      {!last && <p class="note">{words.ui('no_sessions')}</p>}

      <Section title={words.ui('signs_yes')} items={yes} tone="urgent" />
      <Section title={words.ui('signs_unsure')} items={unsure} />
      <Section title={words.ui('complaints')} items={complaints} />
      {unanswered > 0 && <p>{words.ui('unanswered')}: {unanswered}</p>}
      {last && lastResult && <p>{words.ui('last_result')} ({last.date}): {words.card(lastResult)}</p>}
      {last && <p>{words.ui('recalled')}: {last.recalled.length} / {last.due.length} ({last.date})</p>}
      <h3>{words.ui('plan')}</h3>
      <PlanView ix={ix} words={words} profile={profile} />

      <section class="no-print">
        <h3>{words.ui('share_card')}</h3>
        <SendText words={words} text={text} phones={worker} label={words.ui('send_sms')} />
        <button class="action" onClick={() => print()}>🖨 {words.ui('print')}</button>
      </section>
    </main>
  );
}

function Section({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (items.length === 0) return null;
  return (
    <section class={tone ? `sheet ${tone}` : 'sheet'}>
      <h3>{title}</h3>
      <ul>{items.map((i) => <li>{i}</li>)}</ul>
    </section>
  );
}
