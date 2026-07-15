/**
 * Bot card renderer (HTML parse mode).
 *
 * Hierarchy encodes information, not decoration:
 *   bold      = navigational landmarks only (headword, sense numbers, idiom phrases)
 *   italic    = everything that is *about* the English content (translations, examples)
 *   plain     = the English definitions themselves
 * Idioms live in an expandable blockquote — Telegram collapses it, so rich extra
 * content costs no card height. RU example translations stay website-only.
 *
 * The card is built block-by-block so truncation never splits an HTML tag.
 * Drop order when over the 4096 limit: idioms → synonyms → senses (tail first).
 */
import type { WordSummary, Sense, Idiom } from "@vocab/shared";

export const TELEGRAM_MESSAGE_LIMIT = 4096;
const MAX_SENSES = 5;
const MAX_EXAMPLES = 3;
const MAX_IDIOMS = 6;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface FormattedCard {
  text: string;
  truncated: boolean;
}

export function formatCard(summary: WordSummary): FormattedCard {
  const header = buildHeader(summary);
  const senses = (summary.senses ?? []).slice(0, MAX_SENSES).map(buildSense);
  const synonyms = buildSynonyms(summary.synonyms ?? []);
  const idioms = buildIdioms(summary.idioms ?? []);
  const note = summary.usage_note ? `💡 <i>${escapeHtml(summary.usage_note)}</i>` : null;

  let truncated = (summary.senses ?? []).length > MAX_SENSES;

  // Assemble within the limit; each block is self-contained HTML.
  const parts: string[] = [header];
  const fits = (block: string): boolean =>
    [...parts, block].join("\n\n").length <= TELEGRAM_MESSAGE_LIMIT;

  for (const block of senses) {
    if (!fits(block)) {
      truncated = true;
      break;
    }
    parts.push(block);
  }
  for (const block of [synonyms, idioms, note]) {
    if (!block) continue;
    if (fits(block)) parts.push(block);
    else truncated = true;
  }

  return { text: parts.join("\n\n"), truncated };
}

function buildHeader(summary: WordSummary): string {
  const bits: string[] = [`📖 <b>${escapeHtml(summary.word)}</b>`];
  if (summary.forms.length > 0) bits.push(`(${escapeHtml(summary.forms.join(", "))})`);
  if (summary.transcription) bits.push(escapeHtml(summary.transcription));
  if (summary.part_of_speech) bits.push(`[${escapeHtml(summary.part_of_speech)}]`);
  const head = bits.join(" ");
  return summary.cefr_guess ? `${head} · ${escapeHtml(summary.cefr_guess)}` : head;
}

function buildSense(sense: Sense, i: number): string {
  const gw = sense.guideword ? `(${escapeHtml(sense.guideword.toUpperCase())}) ` : "";
  const lines = [`<b>${ROMAN[i] ?? String(i + 1)}.</b> ${gw}${escapeHtml(sense.definition_en)}`];

  const translations = [sense.translation_ru, sense.translation_uz]
    .filter(Boolean)
    .map((t) => escapeHtml(t!))
    .join(" · ");
  if (translations) lines.push(`— <i>${translations}</i>`);

  sense.examples.slice(0, MAX_EXAMPLES).forEach((ex, j) => {
    lines.push(`  ${j + 1}. <i>${escapeHtml(ex.en)}</i>`);
  });
  return lines.join("\n");
}

function buildSynonyms(synonyms: string[]): string | null {
  if (synonyms.length === 0) return null;
  return `≈ <i>${escapeHtml(synonyms.join(", "))}</i>`;
}

function buildIdioms(idioms: Idiom[]): string | null {
  if (idioms.length === 0) return null;
  const lines = idioms.slice(0, MAX_IDIOMS).map((idiom) => {
    const translations = [idiom.translation_ru, idiom.translation_uz]
      .filter(Boolean)
      .map((t) => escapeHtml(t))
      .join(" · ");
    const def = idiom.definition_en ? ` — ${escapeHtml(idiom.definition_en)}` : "";
    const tail = translations ? `\n   <i>${translations}</i>` : "";
    return `▪ <b>${escapeHtml(idiom.phrase)}</b>${def}${tail}`;
  });
  return `<blockquote expandable><b>Idioms</b>\n${lines.join("\n")}</blockquote>`;
}
