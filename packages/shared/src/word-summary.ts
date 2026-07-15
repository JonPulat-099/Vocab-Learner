import { z } from "zod";

export const ExampleSchema = z.object({
  en: z.string(),
  ru: z.string(),
});

export const SenseSchema = z.object({
  guideword: z.string(),
  definition_en: z.string(),
  translation_ru: z.string(),
  translation_uz: z.string(),
  examples: z.array(ExampleSchema),
});

export const IdiomSchema = z.object({
  phrase: z.string(),
  definition_en: z.string(),
  translation_ru: z.string(),
  translation_uz: z.string(),
});

export const WordSummarySchema = z.object({
  word: z.string(),
  forms: z.array(z.string()),
  part_of_speech: z.string(),
  transcription: z.string(),
  cefr_guess: z.string(),
  senses: z.array(SenseSchema),
  synonyms: z.array(z.string()),
  idioms: z.array(IdiomSchema),
  usage_note: z.string(),
});

export type Example = z.infer<typeof ExampleSchema>;
export type Sense = z.infer<typeof SenseSchema>;
export type Idiom = z.infer<typeof IdiomSchema>;
export type WordSummary = z.infer<typeof WordSummarySchema>;
