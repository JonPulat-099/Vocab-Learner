/**
 * Gemini-free fallback: build a best-effort WordSummary directly from
 * MW + Cambridge so a search never hard-fails because the AI step is down.
 */
import type { WordSummary, Sense, Idiom } from "@vocab/shared";
import type { MwParsed } from "./mw.service.js";
import type { CambridgeResult } from "./cambridge.service.js";

const MAX_EXAMPLES_PER_SENSE = 3;

export function buildRawSummary(
  word: string,
  mw: MwParsed,
  cambridge: CambridgeResult | null,
): WordSummary {
  const senses: Sense[] = [];
  let partOfSpeech = "";
  let transcription = "";

  if (cambridge?.kind === "found") {
    const entry = cambridge.entries[0];
    if (entry) {
      partOfSpeech = entry.pos ?? "";
      transcription = entry.ipa ? `/${entry.ipa}/` : "";
    }
    for (const e of cambridge.entries) {
      for (const s of e.senses) {
        senses.push({
          guideword: s.guideword ?? "",
          definition_en: s.definition_en,
          translation_ru: s.translation_ru ?? "",
          translation_uz: "",
          examples: s.examples
            .slice(0, MAX_EXAMPLES_PER_SENSE)
            .map((ex) => ({ en: ex.en, ru: ex.ru ?? "" })),
        });
      }
    }
  }

  if (senses.length === 0 && mw.kind === "entries") {
    for (const entry of mw.entries) {
      if (entry.isPhrase) continue;
      partOfSpeech ||= entry.fl ?? "";
      for (const def of entry.shortdef) {
        senses.push({
          guideword: "",
          definition_en: def,
          translation_ru: "",
          translation_uz: "",
          examples: entry.examples
            .slice(0, MAX_EXAMPLES_PER_SENSE)
            .map((en) => ({ en, ru: "" })),
        });
      }
    }
  }

  // MW set-phrase entries ("sense of humor", …) become idioms — EN only, no AI.
  const idioms: Idiom[] =
    mw.kind === "entries"
      ? mw.entries
          .filter((e) => e.isPhrase && e.shortdef.length > 0)
          .map((e) => ({
            phrase: e.headword,
            definition_en: e.shortdef[0]!,
            translation_ru: "",
            translation_uz: "",
          }))
      : [];

  return {
    word,
    forms: [],
    part_of_speech: partOfSpeech,
    transcription,
    cefr_guess: "",
    senses,
    synonyms: [],
    idioms,
    usage_note: "",
  };
}
