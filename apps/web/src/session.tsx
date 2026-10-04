import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PlacePack, PlanSlot, PlanValue, Profile } from '@amma/schema';
import { createSession, outcome, parseMeaning, signFact, signsFor, step, type Effect, type Event, type Heard, type Option, type PackIndex, type SessionState } from '@amma/engine';
import { matchText } from '@amma/matcher';
import type { Words } from './pack.ts';
import { alertPhones, PlanView, renderAlert, renderSms, SendText } from './plan.tsx';
import { NearMe } from './near-me.tsx';
import { Speaker } from './speaker.ts';
import { askAbout } from './ask-bus.ts';
import { addExample, embedAudio, loadExamples, matchOnline, onlineChoice, setOnlineChoice, startRecording, transcribeOnline, understand, voiceStatus, warmVoice, wakeSpeechServer, type OnlineChoice, type Recording } from './voice.ts';

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
  /** In `ask` mode: a meaning she already brought up on the screen underneath. It is played back for her to confirm. */
  about?: string;
}

/** Every question and problem the "anything to ask or tell?" step listens for. */
function askMeanings(ix: PackIndex, profile: Profile): string[] {
  const only = { ...ix, pack: { ...ix.pack, flow: ['open' as const] } };
  const r = step(only, createSession(profile, new Date().toISOString().slice(0, 10)), { type: 'start' });
  return r.effects.flatMap((e) => (e.type === 'listen' ? e.expect : []));
}

export function Session({ ix, words, places, profile, onDone, onQuit, mode = 'weekly', about }: Props) {
  // In a weekly session, what she may say that belongs to the assistant instead of the step in front of her.
  const elsewhere = useMemo(() => (mode === 'weekly' ? askMeanings(ix, profile) : []), []);
  const speaker = useMemo(() => new Speaker(), []);
  const state = useRef<SessionState>(createSession(profile, new Date().toISOString().slice(0, 10)));
  const [view, setView] = useState<View>({ say: [], showPlan: false, ended: false });
  const [speaking, setSpeaking] = useState(-1);
  // Her last words, as heard or typed, shown back above AMMA's reply.
  const [said, setSaid] = useState<string>();
  const page = useRef<HTMLElement>(null);
  // Each reply starts at the top; then the screen follows the line being spoken, down to the buttons.
  const show = (v: View, her?: string) => {
    setView(v);
    setSaid(her);
    window.scrollTo({ top: 0 });
    void speaker.play(words, v.say, (i) => {
      setSpeaking(i);
      const lines = page.current?.querySelectorAll('.line');
      (i >= 0 ? lines?.[i] : undefined)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    });
  };

  // The last thing she said that has not yet been tied to a meaning, kept only until she confirms or corrects it.
  // The vector may still be being worked out: the reply does not wait for it.
  const spoken = useRef<{ vector: Promise<Float32Array | undefined>; guess?: string }>();
  const learn = (meaning: string) => {
    void spoken.current?.vector.then((v) => v && addExample(words.lang.id, meaning, v, profile.id));
    spoken.current = undefined;
  };

  const dispatch = (event: Event, her?: string) => {
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
    // Nothing more to say to her: the assistant closes by itself instead of asking for one more tap.
    if (mode === 'ask' && r.state.ended && v.say.length === 0 && !v.calls?.length) {
      speaker.stop();
      return onDone(r.state.profile);
    }
    show(v, her);
  };
  useEffect(() => {
    dispatch({ type: 'start' });
    if (about) dispatch({ type: 'heard', result: { kind: 'confirm', meaning: about } });
    return () => speaker.stop();
  }, []);

  const st = state.current;
  const urgent = view.ended && st.level === 'urgent';
  return (
    <main ref={page} class={urgent ? 'page urgent' : 'page'}>
      <header class="top">
        <button class="ghost" onClick={() => { speaker.stop(); onQuit(); }}>‹ {words.ui('back')}</button>
        {mode === 'ask' && <h3 class="top-title">🎤 {words.ui('assistant')}</h3>}
        <button class="ghost" aria-label="replay" onClick={() => void speaker.play(words, view.say, setSpeaking)}>🔊 {words.ui('replay')}</button>
      </header>

      {said && <p class="heard"><span class="muted small">{words.ui('heard')}</span>“{said}”</p>}

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
          elsewhere={elsewhere}
          onMic={() => { speaker.stop(); setSpeaking(-1); }}
          onHeard={(result, her) => dispatch({ type: 'heard', result }, her)}
          onSpoken={(vector, result, her) => {
            spoken.current = { vector, guess: result.kind === 'confirm' ? result.meaning : undefined };
            // Understood outright (online listening): the meaning is already known, so her vector is stored with it now.
            if (result.kind === 'accept' && result.meanings[0]) learn(result.meanings[0]);
            const r = step(ix, state.current, { type: 'heard', result });
            state.current = r.state;
            show(toView(r.effects), her);
          }}
        >
          {view.options && (
            <div class="row dock-options">
              {view.options.map((o) => (
                <button class={`big opt-${o.id}`} onClick={() => dispatch({ type: 'chose', option: o.id })}>
                  {o.picture && <span class="pic">{o.picture}</span>}
                  {words.card(o.card)}
                </button>
              ))}
            </div>
          )}
        </Listen>
      )}
      {view.input && <SlotInput key={view.input.slot} words={words} places={places} kind={view.input.kind} onFilled={(value) => dispatch({ type: 'filled', value })} />}
      {view.options && !view.listen && (
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
 * How she answers a question in her own words: by speaking, by tapping a picture, or a helper types.
 * The microphone sits in a bar at the bottom of the screen so it is always under her thumb.
 * In the recall step the pictures stay hidden until asked for, because seeing them turns recall into recognition.
 */
function Listen({ ix, words, listen, elsewhere, onHeard, onSpoken, onMic, children }: {
  ix: PackIndex;
  words: Words;
  listen: Extract<Effect, { type: 'listen' }>;
  /** Meanings this step does not listen for but the assistant does. Hearing one opens the assistant with it. */
  elsewhere: string[];
  onHeard: (r: Heard, said?: string) => void;
  onSpoken: (vector: Promise<Float32Array | undefined>, r: Heard, said?: string) => void;
  /** She has started to speak: whatever AMMA was saying must stop, or the phone records itself. */
  onMic: () => void;
  children?: ComponentChildren;
}) {
  // Whether the pictures are showing. The component is re-created when the step changes (see its key), so this starts fresh per step.
  const [open, setOpen] = useState(listen.mode === 'open');
  const [mic, setMic] = useState<'checking' | 'ready' | 'recording' | 'thinking' | 'unsupported' | 'no_model' | 'blocked'>('checking');
  const recording = useRef<Recording>();
  const button = useRef<HTMLButtonElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    void voiceStatus().then(setMic);
    return () => void recording.current?.stop().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (mic !== 'recording') return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [mic]);
  const usable = mic === 'ready' || mic === 'recording' || mic === 'thinking';
  // Typing is tucked away while the microphone works, and open when it is the only way to use words.
  const [typing, setTyping] = useState(false);
  const showType = typing || mic === 'unsupported' || mic === 'no_model' || mic === 'blocked';

  // Whether she has agreed to online listening. She is asked once, the first time she taps the microphone with a connection.
  const [online, setOnline] = useState<OnlineChoice>(onlineChoice());
  const [asking, setAsking] = useState(false);
  const choose = (v: 'yes' | 'no') => {
    setOnlineChoice(v);
    setOnline(v);
    if (v === 'yes') wakeSpeechServer();
  };

  const other = elsewhere.filter((m) => !listen.expect.includes(m));
  /**
   * Words this step's phrase list did not know. They may still be an answer to it, or they may be something else
   * she wants to say: a problem, or a question. The second kind is handed to the assistant rather than ignored.
   * Returns a meaning for this step to play back, or undefined; `true` means the assistant has taken it.
   */
  const beyond = async (text: string): Promise<string | true | undefined> => {
    const known = other.length ? matchText(text, words.lang.lexicon, other) : undefined;
    const meant = known?.kind === 'accept' ? known.meanings[0] : await matchOnline(text, words.lang.id, [...listen.expect, ...other]);
    if (!meant || listen.expect.includes(meant)) return meant;
    askAbout(meant);
    return true;
  };

  const start = async () => {
    onMic();
    setRetry(false);
    warmVoice();
    try {
      recording.current = await startRecording({
        onLevel: (v) => button.current?.style.setProperty('--level', v.toFixed(2)),
        onQuiet: () => void finish(),
      });
      setMic('recording');
    } catch {
      // Permission refused. Say so, and fall back to pictures and typing.
      setMic('blocked');
      setOpen(true);
    }
  };
  const finish = async () => {
    const rec = recording.current;
    if (!rec) return;
    recording.current = undefined;
    setMic('thinking');
    try {
      const { audio, blob } = await rec.stop();
      // Her speech as a vector, worked out on the phone while the online service is being asked. The reply never waits for it
      // when the online answer is enough; it is only what lets the phone learn her voice for when there is no connection.
      const vector = embedAudio(audio);
      const later = vector.catch(() => undefined);
      // Online first, when she has agreed and there is a connection: it understands free speech.
      const text = onlineChoice() === 'yes' ? await transcribeOnline(blob, words.lang.locale ?? words.lang.id) : undefined;
      if (text) {
        const heard = matchText(text, words.lang.lexicon, listen.expect);
        if (heard.kind === 'accept') {
          setMic('ready');
          return onSpoken(later, heard, text);
        }
        // The phrase list did not know her words. The language model may suggest which meaning she meant;
        // the suggestion is played back and only counts if she says yes.
        const suggested = await beyond(text);
        if (suggested) {
          setMic('ready');
          return suggested === true ? undefined : onSpoken(later, { kind: 'confirm', meaning: suggested }, text);
        }
      }
      // No connection, no consent, or words the phrase list does not know: the model on the phone has a go.
      const heard = await understand(await vector, await loadExamples(words.lang.id), listen.expect);
      setMic('ready');
      // With nothing to compare against, show the pictures: her tap teaches the phone what she just said.
      if (heard.kind === 'abstain') setOpen(true);
      onSpoken(later, heard, text);
    } catch {
      // The recording could not be read or the model could not run. The microphone itself is fine: she can try again.
      setMic('ready');
      setRetry(true);
      setOpen(true);
    }
  };
  const tapMic = () => {
    if (mic === 'recording') return void finish();
    if (mic !== 'ready') return;
    if (online === undefined && navigator.onLine) return setAsking(true);
    void start();
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
      {retry && <p class="note mic-retry">{words.ui('mic_retry')}</p>}
      {(mic === 'unsupported' || mic === 'no_model' || mic === 'blocked') && (
        <p class="note mic-off">🎤 {words.ui(mic === 'unsupported' ? 'mic_unsupported' : mic === 'blocked' ? 'mic_blocked' : 'no_voice')}</p>
      )}
      {open && (
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
      )}

      <div class="dock">
        {usable && (
          <div class="dock-main">
            <button type="button" class={`side ${typing ? 'on' : ''}`} aria-label={words.ui('type_here')} title={words.ui('type_here')} aria-pressed={typing} disabled={mic !== 'ready'} onClick={() => setTyping(!typing)}>⌨️</button>
            <button ref={button} type="button" class={`big mic ${mic}`} disabled={mic === 'thinking'} onClick={tapMic}>
              {mic === 'recording' ? (
                <>
                  <span class="mic-dot" aria-hidden="true" />
                  <span class="mic-text">
                    <span class="mic-state">{words.ui('mic_listening')} 0:{String(seconds).padStart(2, '0')}</span>
                    <span class="mic-hint">{words.ui('mic_stop')}</span>
                  </span>
                </>
              ) : mic === 'thinking' ? (
                <>
                  <span class="spinner" aria-hidden="true" />
                  <span>{words.ui('mic_thinking')}</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">🎤</span>
                  <span>{words.ui('mic_start')}</span>
                </>
              )}
            </button>
            <button type="button" class={`side ${open ? 'on' : ''}`} aria-label={words.ui(open ? 'hide_pictures' : 'show_pictures')} title={words.ui(open ? 'hide_pictures' : 'show_pictures')} aria-pressed={open} disabled={mic !== 'ready'} onClick={() => setOpen(!open)}>🖼️</button>
          </div>
        )}
        {showType && (
          <form
            class="row"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem('said') as HTMLInputElement;
              const typed = input.value.trim();
              if (!typed) return;
              input.value = '';
              onMic();
              const byPhrase = matchText(typed, words.lang.lexicon, listen.expect);
              if (byPhrase.kind !== 'abstain') return onHeard(byPhrase, typed);
              // Typed words the phrase list does not know get the same help as spoken ones.
              void beyond(typed).then((m) => m === true || onHeard(m ? { kind: 'confirm', meaning: m } : byPhrase, typed));
            }}
          >
            <input name="said" placeholder={words.ui('type_here')} autocomplete="off" autoFocus={typing} />
            <button>{words.ui('send')}</button>
          </form>
        )}
        {!usable && mic !== 'checking' && !open && (
          <button class="ghost" onClick={() => setOpen(true)}>🖼 {words.ui('show_pictures')}</button>
        )}
        {children}
        {mic === 'ready' && online !== undefined && navigator.onLine && (
          <button type="button" class={`chip online-toggle ${online === 'yes' ? 'on' : ''}`} title={words.ui(online === 'yes' ? 'online_on' : 'online_off')} onClick={() => choose(online === 'yes' ? 'no' : 'yes')}>
            {online === 'yes' ? '🌐' : '📱'} {words.ui(online === 'yes' ? 'chip_online' : 'chip_phone')}
          </button>
        )}
      </div>

      {asking && (
        <div class="sheet-back">
          <div class="sheet-ask online-ask" role="dialog" aria-modal="true">
            <h2>{words.ui('online_title')}</h2>
            <p>{words.ui('online_ask')}</p>
            <button type="button" class="big primary online-yes" onClick={() => { choose('yes'); setAsking(false); void start(); }}>🌐 {words.ui('online_yes')}</button>
            <button type="button" class="big online-no" onClick={() => { choose('no'); setAsking(false); void start(); }}>📱 {words.ui('online_no')}</button>
          </div>
        </div>
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
