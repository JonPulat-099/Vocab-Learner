/**
 * Gemini summarization via @google/genai structured output.
 * The response is forced through responseJsonSchema = WordSummary and validated
 * with zod — free-form model text is never parsed.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { WordSummarySchema, type WordSummary } from "@vocab/shared";
import { trimMwForPrompt } from "./mw.service.js";
import type { CambridgeResult } from "./cambridge.service.js";

export class GeminiUnavailable extends Error {
  constructor(cause: unknown) {
    super(`Gemini unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "GeminiUnavailable";
  }
}

/** Minimal surface of ai.models we depend on — injectable for tests. */
export interface GeminiClient {
  generateContent(params: {
    model: string;
    contents: string;
    config: Record<string, unknown>;
  }): Promise<{ text?: string }>;
}

export interface GeminiServiceDeps {
  apiKey: string;
  model: string;
  timeoutMs: number;
  client?: GeminiClient;
  /** Delays before each retry on transient 503/overload errors. */
  retryDelaysMs?: number[];
}

const DEFAULT_RETRY_DELAYS_MS = [1500, 3000];

function isTransientOverload(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('"code":503') || msg.includes("UNAVAILABLE") || msg.includes("overloaded");
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const RESPONSE_JSON_SCHEMA = z.toJSONSchema(WordSummarySchema);

const PROMPT = `You are a trilingual (EN/RU/UZ) lexicographer building one dictionary card.

Merge the Merriam-Webster and Cambridge data below into a single sense-grouped summary:
- Group meanings into distinct senses. Each sense gets a one-word uppercase GUIDEWORD (e.g. EMOTION, PHYSICAL, OPINION). Prefer Cambridge's guidewords when present.
- Merge and deduplicate MW + Cambridge definitions per sense; keep definition_en short and learner-friendly. Cover ALL distinct meanings present in the sources, including verb senses when the word has them.
- At most 3 examples per sense, preferring real corpus examples from the sources.
- EVERY example must have a Russian translation: use Cambridge's translation when available, otherwise translate it yourself.
- translation_ru per sense: Cambridge's Russian translation of the sense when available, otherwise your own.
- translation_uz per sense: your own Uzbek (Latin script) translation of the sense.
- synonyms: up to 6 close synonyms of the headword (MW "syns" section is a good source), or an empty array.
- idioms: common idioms and set phrases built on the headword (MW phrase entries like "sense of humor" and Cambridge idiom blocks are good sources; also add well-known ones like "make sense"). Up to 6, each with a short EN definition plus RU and UZ (Latin) translations. Empty array if none.
- forms: inflected/derived forms worth showing (e.g. plural), possibly empty.
- transcription: IPA like /ˈfiː.lɪŋ/ (use Cambridge IPA when present).
- cefr_guess: single CEFR level A1–C2.
- usage_note: one short line with common collocations or register notes, or an empty string.

Return ONLY the JSON object.`;

export function createGeminiService(deps: GeminiServiceDeps) {
  const client: GeminiClient =
    deps.client ?? new GoogleGenAI({ apiKey: deps.apiKey }).models;

  async function summarizeWord(input: {
    word: string;
    /** Raw MW API payload (words.mw_data) — trimmed of noise before prompting. */
    mwRaw: unknown;
    cambridge: CambridgeResult | null;
  }): Promise<WordSummary> {
    const contents = [
      PROMPT,
      `WORD: ${input.word}`,
      `MERRIAM-WEBSTER DATA (raw API JSON):\n${JSON.stringify(trimMwForPrompt(input.mwRaw))}`,
      `CAMBRIDGE DATA:\n${JSON.stringify(input.cambridge ?? { kind: "not_found" })}`,
    ].join("\n\n");

    const retryDelays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    let text: string | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await client.generateContent({
          model: deps.model,
          contents,
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: RESPONSE_JSON_SCHEMA,
            abortSignal: AbortSignal.timeout(deps.timeoutMs),
            temperature: 0.2,
          },
        });
        text = response.text;
        break;
      } catch (err) {
        // Capacity spikes (503) are usually brief — retry before falling back.
        if (isTransientOverload(err) && attempt < retryDelays.length) {
          await sleep(retryDelays[attempt]!);
          continue;
        }
        throw new GeminiUnavailable(err);
      }
    }
    if (!text) throw new GeminiUnavailable("empty response");

    const parsed = WordSummarySchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new GeminiUnavailable(`schema mismatch: ${parsed.error.message}`);
    return parsed.data;
  }

  return { summarizeWord };
}

export type GeminiService = ReturnType<typeof createGeminiService>;
