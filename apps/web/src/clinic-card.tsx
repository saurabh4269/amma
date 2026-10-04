import type { Profile } from '@amma/schema';
import type { PackIndex } from '@amma/engine';
import type { Words } from './pack.ts';
import { PlanView } from './plan.tsx';

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

  return (
    <main class="page card">
      <header class="top"><button class="ghost" onClick={onBack}>‹ {words.ui('back')}</button><h2>{words.ui('clinic_card')}</h2></header>
      <p class="headline">
        {profile.phase === 'pregnant' ? '🤰' : '👶'}{' '}
        {profile.phase === 'pregnant' && profile.anchorDate ? `${weeksPregnant(profile.anchorDate, new Date())} ${words.ui('weeks')}` : (profile.anchorDate ?? '')}
      </p>
      {profile.tracks.length > 0 && <p>{profile.tracks.map((t) => words.card(ix.pack.tracks.find((x) => x.id === t)?.label ?? t)).join(' · ')}</p>}

      <Section title={words.ui('signs_yes')} items={reported('yes').map((r) => `${r.date} — ${signLabel(r.id)}`)} tone="urgent" />
      <Section title={words.ui('signs_unsure')} items={reported('unsure').map((r) => `${r.date} — ${signLabel(r.id)}`)} />
      <Section
        title={words.ui('complaints')}
        items={profile.complaints.map((c) => {
          const name = words.card(ix.pack.complaints.find((x) => x.id === c.complaint)?.label ?? c.complaint);
          return `${c.date} — ${[name, ...Object.entries(c.attrs).map(([a, v]) => optionLabel(a, v))].join(', ')}`;
        })}
      />
      {unanswered > 0 && <p>{words.ui('unanswered')}: {unanswered}</p>}
      {last && <p>{words.ui('recalled')}: {last.recalled.length} / {last.due.length} ({last.date})</p>}
      <h3>{words.ui('plan')}</h3>
      <PlanView ix={ix} words={words} profile={profile} />
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
