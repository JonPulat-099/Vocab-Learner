/**
 * Gemini summarization via @google/genai structured output.
 * The response is forced through responseJsonSchema = WordSummary and validated
 * with zod — free-form model text is never parsed.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { WordSummarySchema, type WordSummary } from "@vocab/shared";
import type { MwParsed } from "./mw.service.js";
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
}

const RESPONSE_JSON_SCHEMA = z.toJSONSchema(WordSummarySchema);

const PROMPT = `You are a bilingual (EN/RU) lexicographer building one dictionary card.

Merge the Merriam-Webster and Cambridge data below into a single sense-grouped summary:
- Group meanings into distinct senses. Each sense gets a one-word uppercase GUIDEWORD (e.g. EMOTION, PHYSICAL, OPINION). Prefer Cambridge's guidewords when present.
- Merge and deduplicate MW + Cambridge definitions per sense; keep definition_en short and learner-friendly.
- At most 3 examples per sense, preferring real corpus examples from the sources.
- EVERY example must have a Russian translation: use Cambridge's translation when available, otherwise translate it yourself.
- translation_ru per sense: Cambridge's Russian translation of the sense when available, otherwise your own.
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
    mw: MwParsed;
    cambridge: CambridgeResult | null;
  }): Promise<WordSummary> {
    const contents = [
      PROMPT,
      `WORD: ${input.word}`,
      `MERRIAM-WEBSTER DATA:\n${JSON.stringify(input.mw)}`,
      `CAMBRIDGE DATA:\n${JSON.stringify(input.cambridge ?? { kind: "not_found" })}`,
    ].join("\n\n");

    let text: string | undefined;
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
    } catch (err) {
      throw new GeminiUnavailable(err);
    }
    if (!text) throw new GeminiUnavailable("empty response");

    const parsed = WordSummarySchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new GeminiUnavailable(`schema mismatch: ${parsed.error.message}`);
    return parsed.data;
  }

  return { summarizeWord };
}

export type GeminiService = ReturnType<typeof createGeminiService>;
