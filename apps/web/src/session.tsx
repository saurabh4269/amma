import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PlacePack, PlanSlot, PlanValue, Profile } from '@amma/schema';
import { createSession, outcome, parseMeaning, signFact, signsFor, step, type Effect, type Event, type Heard, type Option, type PackIndex, type SessionState } from '@amma/engine';
import { matchText } from '@amma/matcher';
import type { Words } from './pack.ts';
import { alertPhones, PlanView, renderAlert, renderSms, SendText } from './plan.tsx';
import { NearMe } from './near-me.tsx';
import { Speaker } from './speaker.ts';
import { addExample, loadExamples, startRecording, understand, voiceStatus, type Recording } from './voice.ts';

/** What one engine step asks the screen to show. */
interface View {
  say: string[];
  listen?: Extract<Effect, { type: 'listen' }>;
  options?: Option[];
  input?: Extract<Effect, { type: 'input' }>;
  showPlan: boolean;
  calls?: Extract<Effect, { type: 'offer_call' }>['contacts'];
  sms?: Extract<Effect, { type: 'compose_sms' }>;
  ended: boolean;
}

function toView(effects: Effect[]): View {
  const v: View = { say: [], showPlan: false, ended: false };
  for (const e of effects) {
    if (e.type === 'say') v.say.push(...e.cards);
    else if (e.type === 'listen') v.listen = e;
    else if (e.type === 'choice') v.options = e.options;
    else if (e.type === 'input') v.input = e;
    else if (e.type === 'show_plan') v.showPlan = true;
    else if (e.type === 'offer_call') v.calls = e.contacts;
    else if (e.type === 'compose_sms') v.sms = e;
    else v.ended = true;
  }
  return v;
}

interface Props {
  ix: PackIndex;
  words: Words;
  places: PlacePack[];
  profile: Profile;
  onDone: (updated: Profile) => void;
  onQuit: () => void;
  /**
   * `ask` is the assistant: only the "anything to ask or tell?" step, opened from any screen.
   * It is not a weekly session and is not recorded as one.
   */
  mode?: 'weekly' | 'ask';
}

export function Session({ ix, words, places, profile, onDone, onQuit, mode = 'weekly' }: Props) {
  const speaker = useMemo(() => new Speaker(), []);
  const state = useRef<SessionState>(createSession(profile, new Date().toISOString().slice(0, 10)));
  const [view, setView] = useState<View>({ say: [], showPlan: false, ended: false });
  const [speaking, setSpeaking] = useState(-1);

  // The last thing she said that has not yet been tied to a meaning, kept only until she confirms or corrects it.
  const spoken = useRef<{ vector: Float32Array; guess?: string }>();
  const learn = (meaning: string) => {
    if (spoken.current) void addExample(words.lang.id, meaning, spoken.current.vector, profile.id);
    spoken.current = undefined;
  };

  const dispatch = (event: Event) => {
    // Her "yes" to a played-back guess, or her tap on a picture after speaking, is what labels the recording.
    if (event.type === 'chose' && spoken.current?.guess) {
      if (event.option === 'yes') learn(spoken.current.guess);
      else spoken.current.guess = undefined;
    } else if (event.type === 'heard' && event.result.kind === 'accept' && event.result.meanings[0]) {
      learn(event.result.meanings[0]);
    }
    const r = step(ix, state.current, event);
    state.current = r.state;
    const v = toView(r.effects);
    if (mode === 'ask' && r.state.ended) {
      // The assistant has no check step. If what she described led to a danger-sign question, the same rule
      // tables decide what to say about her answers. With nothing flagged it says nothing: it has not checked her.
      const answered = signsFor(ix, r.state.phase, 'check').filter((s) => r.state.facts[signFact(s.id)] !== undefined);
      const groups = [...new Set(answered.map((s) => s.group))];
      const o = groups.length ? outcome(ix, groups, r.state.facts) : undefined;
      if (o && o.level !== 'none_listed') {
        r.state.level = o.level;
        v.say.push(...o.cards);
        if (o.level === 'urgent') {
          v.calls = ix.pack.plan.flatMap((slot) => {
            const p = r.state.profile.plan[slot.id];
            return slot.callOnUrgent && p && 'contact' in p ? [{ slot: slot.id, name: p.contact.name, phone: p.contact.phone }] : [];
          });
        }
      }
    }
    setView(v);
    void speaker.play(words, v.say, setSpeaking);
  };
  useEffect(() => {
    dispatch({ type: 'start' });
    return () => speaker.stop();
  }, []);

  const st = state.current;
  const urgent = view.ended && st.level === 'urgent';
  return (
    <main class={urgent ? 'page urgent' : 'page'}>
      <header class="top">
        <button class="ghost" onClick={() => { speaker.stop(); onQuit(); }}>‹ {words.ui('back')}</button>
        <button class="ghost" aria-label="replay" onClick={() => void speaker.play(words, view.say, setSpeaking)}>{words.ui('replay')}</button>
      </header>

      <section class="said" aria-live="polite">
        {view.say.map((id, i) => (
          <p class={i === speaking ? 'line now' : 'line'}>
            {words.picture(id) && <span class="pic">{words.picture(id)}</span>}
            {words.card(id)}
          </p>
        ))}
      </section>
      {speaker.usesDeviceVoice(words, view.say) && view.say.length > 0 && <p class="muted small">{words.ui('device_voice')}</p>}
      {speaker.usesUnapprovedVoice(words, view.say) && <p class="muted small">{words.ui('synthetic_voice')}</p>}

      {(view.showPlan || urgent) && <PlanView ix={ix} words={words} profile={st.profile} />}
      {view.calls?.map((c) => <a class="big call" href={`tel:${c.phone}`}>📞 {words.ui('call')} {c.name}</a>)}
      {urgent && (() => {
        const alert = renderAlert(ix, words, st.profile, st.facts);
        return alert ? (
          <section class="alert">
            <h3>{words.ui('tell_them')}</h3>
            <SendText words={words} text={alert} phones={alertPhones(ix, st.profile)} label={words.ui('send_sms')} />
          </section>
        ) : null;
      })()}

      {view.listen && (
        <Listen
          key={`${st.nodeIndex}:${view.listen.mode}`}
          ix={ix}
          words={words}
          listen={view.listen}
          onHeard={(result) => dispatch({ type: 'heard', result })}
          onSpoken={(vector, result) => {
            spoken.current = { vector, guess: result.kind === 'confirm' ? result.meaning : undefined };
            const r = step(ix, state.current, { type: 'heard', result });
            state.current = r.state;
            const v = toView(r.effects);
            setView(v);
            void speaker.play(words, v.say, setSpeaking);
          }}
        />
      )}
      {view.input && <SlotInput key={view.input.slot} words={words} places={places} kind={view.input.kind} onFilled={(value) => dispatch({ type: 'filled', value })} />}
      {view.options && (
        <div class={view.options.length <= 3 ? 'row answers' : 'grid'}>
          {view.options.map((o) => (
            <button class={`big opt-${o.id}`} onClick={() => dispatch({ type: 'chose', option: o.id })}>
              {o.picture && <span class="pic">{o.picture}</span>}
              {words.card(o.card)}
            </button>
          ))}
        </div>
      )}

      {view.ended && (
        <div class="list">
          {view.sms && <SmsButton ix={ix} words={words} profile={st.profile} sms={view.sms} />}
          <button class="big primary" onClick={() => { speaker.stop(); onDone(st.profile); }}>✓ {words.ui('finish')}</button>
        </div>
      )}
    </main>
  );
}

/**
 * Until the on-device speech model is installed, she answers by tapping a picture
 * or a helper types what she said. In the recall step the pictures stay hidden
 * until asked for, because seeing them turns recall into recognition.
 */
function Listen({ ix, words, listen, onHeard, onSpoken }: { ix: PackIndex; words: Words; listen: Extract<Effect, { type: 'listen' }>; onHeard: (r: Heard) => void; onSpoken: (vector: Float32Array, r: Heard) => void }) {
  // Whether the pictures are showing. The component is re-created when the step changes (see its key), so this starts fresh per step.
  const [open, setOpen] = useState(listen.mode === 'open');
  const [mic, setMic] = useState<'checking' | 'ready' | 'recording' | 'thinking' | 'unsupported' | 'no_model' | 'blocked'>('checking');
  const recording = useRef<Recording>();
  useEffect(() => {
    void voiceStatus().then(setMic);
  }, []);
  const toggleMic = async () => {
    try {
      if (mic === 'ready') {
        recording.current = await startRecording();
        setMic('recording');
      } else if (mic === 'recording' && recording.current) {
        setMic('thinking');
        const audio = await recording.current.stop();
        const { vector, heard } = await understand(audio, await loadExamples(words.lang.id), listen.expect);
        setMic('ready');
        // With no example to compare against yet, show the pictures: her tap teaches the phone what she just said.
        if (heard.kind === 'abstain') setOpen(true);
        onSpoken(vector, heard);
      }
    } catch {
      // Permission refused, or the model could not load. Say so, and fall back to pictures and typing.
      setMic('blocked');
      setOpen(true);
    }
  };
  const label = (m: string): { text: string; pic?: string } => {
    const p = parseMeaning(m);
    const id =
      p?.kind === 'sign' ? ix.sign.get(p.id)?.label
      : p?.kind === 'question' ? ix.pack.questions.find((q) => q.id === p.id)?.label
      : ix.pack.complaints.find((c) => c.id === p?.id)?.label;
    return id ? { text: words.card(id), pic: words.picture(id) } : { text: m };
  };
  return (
    <section class="listen">
      {(mic === 'ready' || mic === 'recording' || mic === 'thinking') && (
        <button type="button" class={`big mic ${mic}`} disabled={mic === 'thinking'} onClick={() => void toggleMic()}>
          {mic === 'recording' ? '⏹' : mic === 'thinking' ? '…' : '🎤'} {words.ui(mic === 'recording' ? 'mic_stop' : 'mic_start')}
        </button>
      )}
      {(mic === 'unsupported' || mic === 'no_model' || mic === 'blocked') && (
        <p class="note mic-off">🎤 {words.ui(mic === 'unsupported' ? 'mic_unsupported' : mic === 'blocked' ? 'mic_blocked' : 'no_voice')}</p>
      )}
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('said') as HTMLInputElement;
          onHeard(matchText(input.value, words.lang.lexicon, listen.expect));
          input.value = '';
        }}
      >
        <input name="said" placeholder={words.ui('type_here')} autocomplete="off" />
        <button>{words.ui('send')}</button>
      </form>
      {open ? (
        <div class="grid">
          {listen.expect.map((m) => {
            const l = label(m);
            return (
              <button class="tile" onClick={() => onHeard({ kind: 'accept', meanings: [m] })}>
                {l.pic && <span class="pic">{l.pic}</span>}
                {l.text}
              </button>
            );
          })}
        </div>
      ) : (
        <button class="ghost" onClick={() => setOpen(true)}>🖼 {words.ui('show_pictures')}</button>
      )}
    </section>
  );
}

function SlotInput({ words, places, kind, onFilled }: { words: Words; places: PlacePack[]; kind: PlanSlot['kind']; onFilled: (v: PlanValue | null) => void }) {
  if (kind === 'yesno') {
    return (
      <div class="row answers">
        <button class="big opt-yes" onClick={() => onFilled({ kind: 'yesno', value: true })}>✓</button>
        <button class="big opt-no" onClick={() => onFilled({ kind: 'yesno', value: false })}>✕</button>
        <button class="ghost" onClick={() => onFilled(null)}>{words.ui('skip')}</button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const name = f.get('name')?.toString().trim() ?? '';
        const phone = f.get('phone')?.toString().trim() ?? '';
        if (!name) return onFilled(null);
        if (kind === 'facility') onFilled({ kind, name, phone: phone || undefined });
        else onFilled({ kind, contact: { name, phone } });
      }}
    >
      {kind === 'facility' && (
        <NearMe
          words={words}
          places={places}
          onPick={(n) => onFilled({ kind: 'facility', name: n.facility.name, phone: n.facility.phone, km: Number.isFinite(n.km) ? Math.round(n.km * 10) / 10 : undefined, lat: n.facility.lat, lon: n.facility.lon })}
        />
      )}
      <label>{words.ui(kind === 'facility' ? 'place' : 'name')}<input name="name" autoFocus /></label>
      <label>{words.ui('phone')}<input name="phone" type="tel" inputMode="tel" /></label>
      <div class="row">
        <button type="button" class="ghost" onClick={() => onFilled(null)}>{words.ui('skip')}</button>
        <button class="primary">{words.ui('next')}</button>
      </div>
    </form>
  );
}

function SmsButton({ ix, words, profile, sms }: { ix: PackIndex; words: Words; profile: Profile; sms: Extract<Effect, { type: 'compose_sms' }> }) {
  return <SendText words={words} text={renderSms(ix, words, profile, sms)} phones={profile.phone ? [profile.phone] : []} label={words.ui('send_sms')} />;
}
