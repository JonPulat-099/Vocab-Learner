/**
 * Merriam-Webster Collegiate Dictionary API.
 * Raw JSON is cached in words.mw_data; parseMw() is a pure function over it.
 */

const MW_BASE = "https://dictionaryapi.com/api/v3/references/collegiate/json";

export interface MwEntry {
  id: string;
  headword: string;
  fl: string | null;
  shortdef: string[];
  examples: string[];
  /** True for set-phrase/idiom entries like "sense of humor" (MW idioms section). */
  isPhrase: boolean;
}

export type MwParsed =
  | { kind: "entries"; entries: MwEntry[] }
  | { kind: "suggestions"; suggestions: string[] }
  | { kind: "not_found" };

export interface MwFetchOptions {
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export async function fetchMwRaw(word: string, opts: MwFetchOptions): Promise<unknown> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${MW_BASE}/${encodeURIComponent(word)}?key=${opts.apiKey}`;
  const res = await doFetch(url, { signal: AbortSignal.timeout(opts.timeoutMs) });
  if (!res.ok) {
    throw new Error(`MW API responded with ${res.status}`);
  }
  return res.json();
}

/** Strip MW inline formatting tokens like {it}...{/it}, {bc}, {wi}...{/wi}. */
export function stripMwTokens(text: string): string {
  return text
    .replace(/\{(?:it|\/it|wi|\/wi|b|\/b|inf|\/inf|sup|\/sup|bc|ldquo|rdquo)\}/g, "")
    .replace(/\{(?:sx|dxt|a_link|d_link|i_link|et_link|mat|sc|\/sc)\|([^|}]*)[^}]*\}/g, "$1")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Walk def[].sseq collecting `vis` (verbal illustration) example sentences. */
function collectExamples(entry: Record<string, unknown>): string[] {
  const examples: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (node.length === 2 && node[0] === "vis" && Array.isArray(node[1])) {
        for (const vis of node[1] as Array<{ t?: string }>) {
          if (typeof vis?.t === "string") examples.push(stripMwTokens(vis.t));
        }
        return;
      }
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(entry.def);
  return examples;
}

/**
 * Strip bulky keys that add prompt tokens but no lexical value
 * (literary quotes, etymology, audio refs, uuids) before sending raw MW to Gemini.
 */
export function trimMwForPrompt(raw: unknown): unknown {
  const NOISE_KEYS = new Set(["quotes", "et", "sound", "uuid", "sort", "date", "art", "prs2"]);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node)
          .filter(([key]) => !NOISE_KEYS.has(key))
          .map(([key, value]) => [key, walk(value)]),
      );
    }
    return node;
  };
  return walk(raw);
}

export function parseMw(raw: unknown): MwParsed {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { kind: "not_found" };
  }
  // Unknown word: MW returns an array of suggestion strings instead of entry objects.
  if (raw.every((item) => typeof item === "string")) {
    return { kind: "suggestions", suggestions: raw as string[] };
  }
  const entries: MwEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const meta = entry.meta as { id?: string; section?: string } | undefined;
    const hwi = entry.hwi as { hw?: string } | undefined;
    if (!meta?.id) continue;
    const fl = typeof entry.fl === "string" ? entry.fl : null;
    entries.push({
      id: meta.id,
      headword: (hwi?.hw ?? meta.id.split(":")[0] ?? "").replace(/\*/g, ""),
      fl,
      shortdef: Array.isArray(entry.shortdef) ? (entry.shortdef as string[]) : [],
      examples: collectExamples(entry),
      isPhrase: meta.section === "idioms" || (fl?.includes("phrase") ?? false),
    });
  }
  return entries.length > 0 ? { kind: "entries", entries } : { kind: "not_found" };
}
