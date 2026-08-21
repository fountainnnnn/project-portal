import type { Env } from './env';

/**
 * Skill-tag suggestion from a project description, ported from server/ai.mjs.
 *
 * DeepSeek today, OpenAI later. That swap stays a config change rather than a
 * rewrite because both speak the same `/chat/completions` shape — so this
 * module is one HTTP call and a table of provider differences, and
 * `AI_PROVIDER` picks a row.
 *
 * The result is always a *suggestion*. The admin can accept it, edit it, delete
 * individual tags, or never press the button and type their own. That is why
 * every failure path returns an error the form can show and continue from: a
 * provider being down must not stop anyone publishing a project, and a project
 * with hand-typed tags is not a degraded project.
 *
 * The only difference from the original is where the key comes from. There is
 * no `process.env` on Workers, so the suggester is built per request from the
 * `Env` binding — cheap, since building it is reading four strings, and it
 * means a `wrangler secret put` takes effect on the next request rather than
 * needing a redeploy.
 */

interface Provider {
  baseUrl: string;
  model: string;
  envKey: 'DEEPSEEK_API_KEY' | 'OPENAI_API_KEY';
  label: string;
  /** OpenAI renamed this; every current OpenAI chat model accepts the new
   *  name, DeepSeek accepts only the old one. */
  tokenParam: 'max_tokens' | 'max_completion_tokens';
}

const PROVIDERS: Record<string, Provider> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek',
    tokenParam: 'max_tokens',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
    label: 'OpenAI',
    tokenParam: 'max_completion_tokens',
  },
};

const SYSTEM_PROMPT = `You extract the technical and professional skills a project team would need.

Rules:
- Reply with a JSON array of strings and nothing else. No prose, no code fences.
- Between 4 and 10 tags.
- Each tag is a skill, tool, or domain — "Computer Vision", "Power BI", "Stakeholder Management".
- Title Case. No sentences, no duplicates, no generic filler like "Teamwork" or "Hard Work".
- Prefer skills a polytechnic lecturer would recognise as something they teach or practise.
- If the description is too vague to infer skills, reply with [].`;

/** The request body, minus the provider differences.
 *
 *  gpt-5 models reason before answering, and those reasoning tokens are spent
 *  from the same ceiling as the reply — so a tag list can be truncated by
 *  thinking it never needed to do. Turning reasoning off also unlocks
 *  `temperature`, which gpt-5 otherwise pins to 1. Both matter here: this call
 *  wants a short, repeatable list, not deliberation.
 *
 *  `reasoning_effort` is rejected outright by pre-gpt-5 models, so it is sent
 *  only where it exists. */
function buildBody(model: string, provider: Provider, text: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    [provider.tokenParam]: 300,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
  };
  if (/^gpt-5/.test(model)) body.reasoning_effort = 'none';
  return body;
}

export interface SuggestResult {
  ok: boolean;
  tags: string[];
  error?: string;
  provider?: string;
  model?: string;
}

export interface AiDescription {
  provider: string;
  model: string;
  configured: boolean;
}

/** Model output is untrusted input. Anything that is not a clean list of short
 *  strings is discarded rather than shown to the admin as a tag. */
export function parseTags(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];

  // Models wrap JSON in fences often enough that stripping them is cheaper
  // than re-prompting for it.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Last resort: find the first bracketed run and try that.
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start < 0 || end <= start) return [];
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().replace(/\s+/g, ' ');
    if (!tag || tag.length > 40) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === 10) break;
  }
  return tags;
}

export function createSkillSuggester(env: Env) {
  const name = (env.AI_PROVIDER ?? 'deepseek').toLowerCase();
  const provider = PROVIDERS[name] ?? PROVIDERS.deepseek;

  const apiKey = env[provider.envKey] ?? '';
  const model = env.AI_MODEL || provider.model;
  const baseUrl = env.AI_BASE_URL || provider.baseUrl;

  /** What `/api/meta` tells the client, so the Generate button can explain
   *  itself instead of failing mysteriously when no key is configured. */
  function describe(): AiDescription {
    return { provider: provider.label, model, configured: Boolean(apiKey) };
  }

  async function suggest(description: unknown, { signal }: { signal?: AbortSignal } = {}): Promise<SuggestResult> {
    const text = String(description ?? '').trim();

    if (!apiKey) {
      // The wording differs from the Express build by one clause, because the
      // fix differs: there is no .env to edit on a deployed Worker.
      return {
        ok: false,
        error: `No ${provider.label} API key configured. Set ${provider.envKey} with \`wrangler secret put\`, or add tags by hand.`,
        tags: [],
      };
    }

    if (text.length < 30) {
      return {
        ok: false,
        error: 'Write a fuller description first — there is not enough here to infer skills from.',
        tags: [],
      };
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildBody(model, provider, text)),
        signal,
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, error: `Could not reach ${provider.label}: ${detail}`, tags: [] };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const detail = body.slice(0, 200);
      return {
        ok: false,
        error: `${provider.label} refused the request (${response.status}).${detail ? ` ${detail}` : ''}`,
        tags: [],
      };
    }

    let payload: { choices?: { message?: { content?: unknown } }[] };
    try {
      payload = await response.json();
    } catch {
      return { ok: false, error: `${provider.label} returned a malformed response.`, tags: [] };
    }

    const tags = parseTags(payload?.choices?.[0]?.message?.content);
    if (tags.length === 0) {
      return {
        ok: false,
        error: 'No usable skills came back. Try a more specific description, or add tags by hand.',
        tags: [],
      };
    }

    return { ok: true, tags, provider: provider.label, model };
  }

  return { suggest, describe };
}
