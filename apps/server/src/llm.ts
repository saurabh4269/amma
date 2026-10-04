/**
 * A language model used for one thing only: choosing which of a short list of known meanings
 * her words are closest to, or none. It never writes a reply. Its answer is constrained to the
 * list by a schema, checked again here, and then only ever offered back to her to confirm.
 */
export interface Candidate {
  id: string;
  /** What the meaning is, in the reference language and in hers. */
  label: string;
}

export type Pick = (text: string, candidates: Candidate[], language: string, asked?: string) => Promise<string | undefined>;

const SYSTEM = [
  'You help a health information tool understand what a pregnant woman or a new mother said.',
  'You are given her words, what she was just asked (if anything), and a list of meanings, each with an id.',
  'Work out what she intends and reply with the id of the one meaning that fits.',
  'If her words answer what she was asked, choose that answer. If instead she is describing a health problem or asking a question, choose that problem or question, even though it is not what was asked.',
  'She may speak informally, mix languages, or use Latin letters for another language.',
  'If nothing in the list fits, or you are unsure, reply "none". Never guess a health problem she did not mention.',
  'You never give advice, never diagnose, and never reply with anything except one id from the list or "none".',
].join(' ');

export function openAiPick(opts: { apiKey: string; model: string; fetch?: typeof fetch; timeoutMs?: number; reasoningEffort?: string }): Pick {
  const doFetch = opts.fetch ?? fetch;
  return async (text, candidates, language, asked) => {
    if (candidates.length === 0 || !text.trim()) return undefined;
    const ids = candidates.map((c) => c.id);
    const res = await doFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 6_000),
      body: JSON.stringify({
        model: opts.model,
        // Choosing from a short list needs no deliberation, and thinking time is most of the wait.
        reasoning_effort: opts.reasoningEffort ?? 'none',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Language: ${language}\n${asked ? `She was asked: ${asked.slice(0, 300)}\n` : ''}She said: ${text.slice(0, 600)}\nMeanings:\n${candidates.map((c) => `${c.id}: ${c.label}`).join('\n')}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'pick',
            strict: true,
            schema: { type: 'object', properties: { meaning: { type: 'string', enum: [...ids, 'none'] } }, required: ['meaning'], additionalProperties: false },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`model answered ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let meaning: unknown;
    try {
      meaning = (JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as { meaning?: unknown }).meaning;
    } catch {
      return undefined;
    }
    // The schema already limits the answer; this is the second lock.
    return typeof meaning === 'string' && ids.includes(meaning) ? meaning : undefined;
  };
}

/** One thing that can be known about a complaint, with the fixed answers it can have. */
export interface Detail {
  id: string;
  question: string;
  options: { id: string; label: string }[];
}

/**
 * Reads, from words she has already said, the details she already gave ("back pain since yesterday" names where
 * and since when), so she is not asked for them again. Each answer is one of the fixed options or "not_said".
 * What it returns is shown back to her in a summary she confirms before anything is done with it.
 */
export type Details = (text: string, topic: string, details: Detail[], language: string) => Promise<Record<string, string>>;

const DETAILS_SYSTEM = [
  'A pregnant woman or new mother described a health problem to a health information tool.',
  'For each listed question, say which of its fixed options her own words already answer.',
  'Use an option only when her words clearly give it. An option such as "somewhere else" applies when she named something that is none of the other options.',
  'If her words do not answer a question, reply "not_said" for it. Never infer what she did not say.',
].join(' ');

export function openAiDetails(opts: { apiKey: string; model: string; fetch?: typeof fetch; timeoutMs?: number; reasoningEffort?: string }): Details {
  const doFetch = opts.fetch ?? fetch;
  return async (text, topic, details, language) => {
    if (details.length === 0 || !text.trim()) return {};
    const res = await doFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 6_000),
      body: JSON.stringify({
        model: opts.model,
        reasoning_effort: opts.reasoningEffort ?? 'none',
        messages: [
          { role: 'system', content: DETAILS_SYSTEM },
          { role: 'user', content: `Language: ${language}\nProblem: ${topic}\nShe said: ${text.slice(0, 600)}\nQuestions:\n${details.map((d) => `${d.id}: ${d.question} Options: ${d.options.map((o) => `${o.id} (${o.label})`).join(', ')}`).join('\n')}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'details',
            strict: true,
            schema: {
              type: 'object',
              properties: Object.fromEntries(details.map((d) => [d.id, { type: 'string', enum: [...d.options.map((o) => o.id), 'not_said'] }])),
              required: details.map((d) => d.id),
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`model answered ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let got: Record<string, unknown> = {};
    try {
      got = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
    // Only real options of real questions are kept.
    const out: Record<string, string> = {};
    for (const d of details) {
      const v = got[d.id];
      if (typeof v === 'string' && d.options.some((o) => o.id === v)) out[d.id] = v;
    }
    return out;
  };
}

/**
 * The one place a model writes words she will read: when the booklet has no card for what she raised.
 * It is never used for a danger sign, never replaces a card, and is always shown under a caution that says
 * it was written by an AI, is not from the booklet, and has not been checked by a doctor.
 */
export type Advise = (about: { said?: string; summary?: string; phase: string; language: string }) => Promise<string | undefined>;

const ADVISE_SYSTEM = [
  'You write a short piece of general information for a pregnant woman or a new mother who is using a health information tool, often with little schooling and far from a clinic.',
  'The official booklet has nothing on what she raised, so you are filling that gap, carefully.',
  'Write in the language named, in simple everyday words, at most four short sentences, with no lists and no headings.',
  'Give only general, widely accepted, low-risk comfort and self-care information, such as rest, posture, fluids, food, warmth and hygiene.',
  'Never name or suggest any medicine, herb, supplement, home remedy to swallow, or dose.',
  'Never diagnose or say what the cause is. Never say it is normal, common, harmless or nothing to worry about. Never tell her she does not need to see anyone.',
  'Always end by telling her to tell her health worker (ASHA, ANM, midwife or doctor) about it, and to go sooner if it gets worse.',
  'If what she says could be an emergency or a danger sign (bleeding, fits, severe headache, blurred vision, high fever, waters breaking, strong belly pain, the baby moving less, trouble breathing, swelling of the face or hands, thoughts of harming herself, or a newborn not feeding, breathing fast, or feeling hot or cold), set kind to "emergency" and only tell her to go to the hospital or contact her health worker now.',
  'If it is not about her health, her pregnancy, the birth or her baby, set kind to "not_health" and leave text empty.',
].join(' ');

export function openAiAdvise(opts: { apiKey: string; model: string; fetch?: typeof fetch; timeoutMs?: number; reasoningEffort?: string }): Advise {
  const doFetch = opts.fetch ?? fetch;
  return async ({ said, summary, phase, language }) => {
    if (!said?.trim() && !summary?.trim()) return undefined;
    const res = await doFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 9_000),
      body: JSON.stringify({
        model: opts.model,
        reasoning_effort: opts.reasoningEffort ?? 'low',
        messages: [
          { role: 'system', content: ADVISE_SYSTEM },
          { role: 'user', content: `Language: ${language}\nShe is: ${phase === 'after_birth' ? 'a mother whose baby has been born' : 'pregnant'}\n${summary ? `What she described: ${summary.slice(0, 300)}\n` : ''}${said ? `Her words: ${said.slice(0, 600)}` : ''}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'advice',
            strict: true,
            schema: { type: 'object', properties: { kind: { type: 'string', enum: ['answer', 'emergency', 'not_health'] }, text: { type: 'string' } }, required: ['kind', 'text'], additionalProperties: false },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`model answered ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    try {
      const got = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as { kind?: string; text?: string };
      const text = got.text?.trim();
      return got.kind !== 'not_health' && text ? text.slice(0, 700) : undefined;
    } catch {
      return undefined;
    }
  };
}
