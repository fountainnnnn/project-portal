/**
 * Skill-tag suggestion from a project description.
 *
 * DeepSeek today, OpenAI later. That swap is a config change rather than a
 * rewrite because both speak the same `/chat/completions` shape — so this
 * module holds one HTTP call and a table of provider differences, and
 * `AI_PROVIDER` picks a row.
 *
 * The result is always a *suggestion*. The admin can accept it, edit it,
 * delete individual tags, or never press the button and type their own. That
 * is why every failure path here returns an error the form can show and
 * continue from: a provider being down must not stop anyone publishing a
 * project, and a project with hand-typed tags is not a degraded project.
 */

const PROVIDERS = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek',
  },
  openai: {
    baseUrl: 'https://api.openai.com',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
    label: 'OpenAI',
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

/** Model output is untrusted input. Anything that is not a clean list of short
 *  strings is discarded rather than shown to the admin as a tag. */
function parseTags(raw) {
  if (typeof raw !== 'string') return [];

  // Models wrap JSON in fences often enough that stripping them is cheaper
  // than re-prompting for it.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed;
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

  const seen = new Set();
  const tags = [];
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

export function createSkillSuggester(env = process.env) {
  const name = (env.AI_PROVIDER ?? 'deepseek').toLowerCase();
  const provider = PROVIDERS[name] ?? PROVIDERS.deepseek;

  const apiKey = env[provider.envKey] ?? '';
  const model = env.AI_MODEL || provider.model;
  const baseUrl = env.AI_BASE_URL || provider.baseUrl;

  /** What `/api/meta` tells the client, so the Generate button can explain
   *  itself instead of failing mysteriously when no key is configured. */
  function describe() {
    return { provider: provider.label, model, configured: Boolean(apiKey) };
  }

  async function suggest(description, { signal } = {}) {
    const text = String(description ?? '').trim();

    if (!apiKey) {
      return {
        ok: false,
        error: `No ${provider.label} API key configured. Set ${provider.envKey} in .env, or add tags by hand.`,
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

    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text },
          ],
        }),
        signal,
      });
    } catch (cause) {
      return { ok: false, error: `Could not reach ${provider.label}: ${cause.message}`, tags: [] };
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

    let payload;
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

export { parseTags as __parseTagsForTest };
