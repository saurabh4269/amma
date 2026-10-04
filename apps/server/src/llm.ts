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
