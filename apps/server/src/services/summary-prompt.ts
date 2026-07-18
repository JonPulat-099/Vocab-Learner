/**
 * Prompt shared by every summarization provider (Gemini and all OpenAI-compatible
 * ones) so the trilingual lexicographer instructions never drift between them.
 */
import { z } from "zod";
import { WordSummarySchema } from "@vocab/shared";
import { trimMwForPrompt } from "./mw.service.js";
import type { SummarizeInput } from "./summarizer.js";

export const RESPONSE_JSON_SCHEMA = z.toJSONSchema(WordSummarySchema);

export const SUMMARY_INSTRUCTIONS = `You are a trilingual (EN/RU/UZ) lexicographer building one dictionary card.

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

/** WORD / MW / Cambridge data block appended after the instructions. */
export function buildSourcesBlock(input: SummarizeInput): string {
  return [
    `WORD: ${input.word}`,
    `MERRIAM-WEBSTER DATA (raw API JSON):\n${JSON.stringify(trimMwForPrompt(input.mwRaw))}`,
    `CAMBRIDGE DATA:\n${JSON.stringify(input.cambridge ?? { kind: "not_found" })}`,
  ].join("\n\n");
}

/**
 * Providers without native structured-output support (anything using plain
 * "json_object" mode) need the schema spelled out in the prompt itself —
 * Gemini doesn't need this since responseJsonSchema enforces it natively.
 */
export function buildJsonSchemaHint(): string {
  return `\n\nRespond with ONLY a single JSON object matching this JSON Schema — no markdown fences, no commentary:\n${JSON.stringify(RESPONSE_JSON_SCHEMA)}`;
}
