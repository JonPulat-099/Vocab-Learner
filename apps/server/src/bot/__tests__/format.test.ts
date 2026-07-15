import { describe, expect, it } from "vitest";
import type { WordSummary } from "@vocab/shared";
import { escapeHtml, formatCard, TELEGRAM_MESSAGE_LIMIT } from "../format.js";

const feeling: WordSummary = {
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
      examples: [
        { en: "guilty feelings", ru: "чувство вины" },
        { en: "a feeling of joy/sadness", ru: "чувство радости/грусти" },
      ],
    },
    {
      guideword: "PHYSICAL",
      definition_en: "the way something feels physically",
      translation_ru: "ощущение",
      examples: [{ en: "I had a tingling feeling in my fingers.", ru: "У меня покалывало в пальцах." }],
    },
  ],
  usage_note: "strong feelings about · hurt sb's feelings",
};

describe("formatCard", () => {
  it("matches the locked card layout for feeling", () => {
    const { text, truncated } = formatCard(feeling);
    expect(truncated).toBe(false);
    expect(text).toMatchInlineSnapshot(`
      "📖 <b>feeling</b> (feelings) /ˈfiː.lɪŋ/ [noun] · B1

      <b>I.</b> (EMOTION) emotion — чувство, эмоция
        1. guilty feelings
        2. a feeling of joy/sadness

      <b>II.</b> (PHYSICAL) the way something feels physically — ощущение
        1. I had a tingling feeling in my fingers.

      💡 strong feelings about · hurt sb's feelings"
    `);
  });

  it("renders EN examples only (RU pairs are website-only)", () => {
    expect(formatCard(feeling).text).not.toContain("чувство вины");
  });

  it("caps senses at 5 and examples at 3", () => {
    const many: WordSummary = {
      ...feeling,
      senses: Array.from({ length: 8 }, (_, i) => ({
        guideword: `G${i}`,
        definition_en: `definition ${i}`,
        translation_ru: "перевод",
        examples: Array.from({ length: 5 }, (_, j) => ({ en: `example ${i}-${j}`, ru: "" })),
      })),
    };
    const { text, truncated } = formatCard(many);
    expect(truncated).toBe(true);
    expect(text).toContain("<b>V.</b>");
    expect(text).not.toContain("<b>VI.</b>");
    expect(text).toContain("3. example 0-2");
    expect(text).not.toContain("4. example 0-3");
  });

  it("stays under 4096 chars and never breaks HTML tags when truncating", () => {
    const long: WordSummary = {
      ...feeling,
      senses: Array.from({ length: 5 }, () => ({
        guideword: "LONG",
        definition_en: "d".repeat(500),
        translation_ru: "п".repeat(500),
        examples: Array.from({ length: 3 }, () => ({ en: "e".repeat(300), ru: "" })),
      })),
    };
    const { text, truncated } = formatCard(long);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    expect((text.match(/<b>/g) ?? []).length).toBe((text.match(/<\/b>/g) ?? []).length);
  });

  it("escapes HTML in dynamic content", () => {
    const sneaky: WordSummary = {
      ...feeling,
      word: "a<b>&c",
      senses: [
        {
          guideword: "X",
          definition_en: "1 < 2 & 3 > 2",
          translation_ru: "",
          examples: [],
        },
      ],
    };
    const { text } = formatCard(sneaky);
    expect(text).toContain("a&lt;b&gt;&amp;c");
    expect(text).toContain("1 &lt; 2 &amp; 3 &gt; 2");
  });
});

describe("escapeHtml", () => {
  it("escapes &, <, >", () => {
    expect(escapeHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
  });
});
