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
