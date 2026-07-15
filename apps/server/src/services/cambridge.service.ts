/**
 * Cambridge Dictionary (english-russian edition) scraper.
 * ALL selectors live in the exported SELECTORS object — never inline them elsewhere.
 * The parsed structure (not the raw HTML) is what gets cached in words.cambridge_data.
 */
import * as cheerio from "cheerio";

export const SELECTORS = {
  entry: ".pr.entry-body__el",
  headword: ".hw.dhw",
  pos: ".pos.dpos",
  ipa: ".ipa.dipa",
  sense: ".dsense",
  guideword: ".dsense_gw",
  definition: ".def.ddef_d",
  translation: ".trans.dtrans",
  exampleBlock: ".examp",
  exampleEn: ".eg",
  exampleRu: ".trans",
} as const;

export const CAMBRIDGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
} as const;

export interface CambridgeSense {
  guideword: string | null;
  definition_en: string;
  translation_ru: string | null;
  examples: Array<{ en: string; ru: string | null }>;
}

export interface CambridgeEntry {
  headword: string;
  pos: string | null;
  ipa: string | null;
  senses: CambridgeSense[];
}

export type CambridgeResult =
  | { kind: "found"; entries: CambridgeEntry[] }
  | { kind: "not_found" };

export interface CambridgeFetchOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export async function fetchCambridge(
  word: string,
  opts: CambridgeFetchOptions,
): Promise<CambridgeResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/${encodeURIComponent(word)}`, {
    headers: CAMBRIDGE_HEADERS,
    // A miss redirects to the dictionary home page — treat any redirect as not found.
    redirect: "manual",
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (res.status >= 300 && res.status < 400) return { kind: "not_found" };
  if (res.status === 404) return { kind: "not_found" };
  if (!res.ok) throw new Error(`Cambridge responded with ${res.status}`);
  return parseCambridge(await res.text());
}

const clean = (text: string): string => text.replace(/\s+/g, " ").trim();

export function parseCambridge(html: string): CambridgeResult {
  const $ = cheerio.load(html);
  const entries: CambridgeEntry[] = [];

  $(SELECTORS.entry).each((_, entryEl) => {
    const entry = $(entryEl);
    const headword = clean(entry.find(SELECTORS.headword).first().text());
    if (!headword) return;

    const senses: CambridgeSense[] = [];
    entry.find(SELECTORS.sense).each((_i, senseEl) => {
      const sense = $(senseEl);
      const definition = clean(sense.find(SELECTORS.definition).first().text());
      if (!definition) return;

      const examples: CambridgeSense["examples"] = [];
      sense.find(SELECTORS.exampleBlock).each((_j, exEl) => {
        const en = clean($(exEl).find(SELECTORS.exampleEn).first().text());
        const ru = clean($(exEl).find(SELECTORS.exampleRu).first().text());
        if (en) examples.push({ en, ru: ru || null });
      });

      const guideword = clean(sense.find(SELECTORS.guideword).first().text()).replace(
        /^\(|\)$/g,
        "",
      );
      senses.push({
        guideword: guideword || null,
        definition_en: definition,
        translation_ru: clean(sense.find(SELECTORS.translation).first().text()) || null,
        examples,
      });
    });

    if (senses.length === 0) return;
    entries.push({
      headword,
      pos: clean(entry.find(SELECTORS.pos).first().text()) || null,
      ipa: clean(entry.find(SELECTORS.ipa).first().text()) || null,
      senses,
    });
  });

  return entries.length > 0 ? { kind: "found", entries } : { kind: "not_found" };
}
