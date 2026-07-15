import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WordSummarySchema } from "@vocab/shared";
import { createGeminiService, GeminiUnavailable, type GeminiClient } from "../gemini.service.js";
import { buildRawSummary } from "../raw-summary.js";
import { parseMw } from "../mw.service.js";
import { parseCambridge } from "../cambridge.service.js";

const fixture = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, "../../../fixtures", name), "utf8");

const feelingSummary = {
  word: "feeling",
  forms: ["feelings"],
  part_of_speech: "noun",
  transcription: "/ˈfiː.lɪŋ/",
  cefr_guess: "B1",
  senses: [
    {
      guideword: "EMOTION",
      definition_en: "emotion",
      translation_ru: "чувство, эмоция",
      translation_uz: "his, tuygʻu",
      examples: [{ en: "guilty feelings", ru: "чувство вины" }],
    },
  ],
  synonyms: ["emotion"],
  idioms: [
    {
      phrase: "hurt sb's feelings",
      definition_en: "to upset someone",
      translation_ru: "задеть чувства",
      translation_uz: "koʻngliga tegmoq",
    },
  ],
  usage_note: "",
};

const mwRaw = JSON.parse(fixture("mw-feeling.json"));
const cambridge = parseCambridge(fixture("cambridge-feeling.html"));
const inputs = { word: "feeling", mwRaw, cambridge };

describe("gemini.service", () => {
  it("returns a schema-valid WordSummary and requests structured JSON output", async () => {
    const client: GeminiClient = {
      generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify(feelingSummary) }),
    };
    const service = createGeminiService({ apiKey: "k", model: "m", timeoutMs: 1000, client });

    const summary = await service.summarizeWord(inputs);
    expect(WordSummarySchema.parse(summary)).toEqual(feelingSummary);

    const call = (client.generateContent as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.model).toBe("m");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema).toBeTruthy();
    expect(call.contents).toContain("CAMBRIDGE DATA");
    expect(call.contents).toContain("MERRIAM-WEBSTER DATA");
    // Noise keys are trimmed from the raw MW payload before prompting.
    expect(call.contents).not.toContain('"uuid"');
  });

  it("wraps SDK failures/timeouts in GeminiUnavailable", async () => {
    const client: GeminiClient = {
      generateContent: vi.fn().mockRejectedValue(new Error("deadline exceeded")),
    };
    const service = createGeminiService({ apiKey: "k", model: "m", timeoutMs: 1, client });
    await expect(service.summarizeWord(inputs)).rejects.toBeInstanceOf(GeminiUnavailable);
  });

  it("rejects schema-invalid model output as GeminiUnavailable", async () => {
    const client: GeminiClient = {
      generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify({ nope: true }) }),
    };
    const service = createGeminiService({ apiKey: "k", model: "m", timeoutMs: 1000, client });
    await expect(service.summarizeWord(inputs)).rejects.toBeInstanceOf(GeminiUnavailable);
  });
});

describe("buildRawSummary", () => {
  it("builds a schema-valid summary from Cambridge structure without Gemini", () => {
    const summary = buildRawSummary("feeling", parseMw(mwRaw), cambridge);
    expect(WordSummarySchema.parse(summary)).toBeTruthy();
    expect(summary.part_of_speech).toBe("noun");
    expect(summary.senses.length).toBeGreaterThanOrEqual(3);
    expect(summary.senses[0]!.guideword).toBe("EMOTION");
    expect(summary.senses[0]!.translation_ru).toContain("чувство");
  });

  it("falls back to MW shortdefs when Cambridge is missing", () => {
    const summary = buildRawSummary("feeling", parseMw(mwRaw), null);
    expect(summary.senses.length).toBeGreaterThan(0);
    expect(summary.senses[0]!.definition_en).toBeTruthy();
  });
});
