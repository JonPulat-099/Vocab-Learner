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
      translation_uz: "his, tuygʻu",
      examples: [
        { en: "guilty feelings", ru: "чувство вины" },
        { en: "a feeling of joy/sadness", ru: "чувство радости/грусти" },
      ],
    },
    {
      guideword: "PHYSICAL",
      definition_en: "the way something feels physically",
      translation_ru: "ощущение",
      translation_uz: "sezgi",
      examples: [{ en: "I had a tingling feeling in my fingers.", ru: "У меня покалывало в пальцах." }],
    },
  ],
  synonyms: ["emotion", "sensation", "sentiment"],
  idioms: [
    {
      phrase: "hurt sb's feelings",
      definition_en: "to upset someone",
      translation_ru: "задеть чьи-либо чувства",
      translation_uz: "birovning koʻngliga tegmoq",
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

      <b>I.</b> (EMOTION) emotion
      — <i>чувство, эмоция · his, tuygʻu</i>
        1. <i>guilty feelings</i>
        2. <i>a feeling of joy/sadness</i>

      <b>II.</b> (PHYSICAL) the way something feels physically
      — <i>ощущение · sezgi</i>
        1. <i>I had a tingling feeling in my fingers.</i>

      ≈ <i>emotion, sensation, sentiment</i>

      <blockquote expandable><b>Idioms</b>
      ▪ <b>hurt sb's feelings</b> — to upset someone
         <i>задеть чьи-либо чувства · birovning koʻngliga tegmoq</i></blockquote>

      💡 <i>strong feelings about · hurt sb's feelings</i>"
    `);
  });

  it("renders EN examples only (RU pairs are website-only)", () => {
    expect(formatCard(feeling).text).not.toContain("чувство вины");
  });

  it("omits synonyms and idioms blocks when empty", () => {
    const bare = { ...feeling, synonyms: [], idioms: [], usage_note: "" };
    const { text } = formatCard(bare);
    expect(text).not.toContain("≈");
    expect(text).not.toContain("blockquote");
    expect(text).not.toContain("💡");
  });

  it("tolerates summaries cached before synonyms/idioms existed", () => {
    const legacy = { ...feeling } as Partial<WordSummary>;
    delete legacy.synonyms;
    delete legacy.idioms;
    const { text } = formatCard(legacy as WordSummary);
    expect(text).toContain("<b>feeling</b>");
  });

  it("caps senses at 5, examples at 3 and idioms at 6", () => {
    const many: WordSummary = {
      ...feeling,
      senses: Array.from({ length: 8 }, (_, i) => ({
        guideword: `G${i}`,
        definition_en: `definition ${i}`,
        translation_ru: "перевод",
        translation_uz: "tarjima",
        examples: Array.from({ length: 5 }, (_, j) => ({ en: `example ${i}-${j}`, ru: "" })),
      })),
      idioms: Array.from({ length: 8 }, (_, i) => ({
        phrase: `idiom ${i}`,
        definition_en: "d",
        translation_ru: "",
        translation_uz: "",
      })),
    };
    const { text, truncated } = formatCard(many);
    expect(truncated).toBe(true);
    expect(text).toContain("<b>V.</b>");
    expect(text).not.toContain("<b>VI.</b>");
    expect(text).toContain("3. <i>example 0-2</i>");
    expect(text).not.toContain("example 0-3");
    expect(text).toContain("idiom 5");
    expect(text).not.toContain("idiom 6");
  });

  it("stays under 4096 chars and never breaks HTML tags when truncating", () => {
    const long: WordSummary = {
      ...feeling,
      senses: Array.from({ length: 5 }, () => ({
        guideword: "LONG",
        definition_en: "d".repeat(500),
        translation_ru: "п".repeat(400),
        translation_uz: "u".repeat(100),
        examples: Array.from({ length: 3 }, () => ({ en: "e".repeat(300), ru: "" })),
      })),
    };
    const { text, truncated } = formatCard(long);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    for (const tag of ["b", "i", "blockquote"]) {
      expect((text.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length).toBe(
        (text.match(new RegExp(`</${tag}>`, "g")) ?? []).length,
      );
    }
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
          translation_uz: "",
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
