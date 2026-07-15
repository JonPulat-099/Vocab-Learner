/**
 * Bot card renderer (HTML parse mode). Format is locked — see plan §4:
 *
 * 📖 feeling (feelings) /ˈfiː.lɪŋ/ [noun] · B1
 *
 * I. (EMOTION) emotion — чувство, эмоция
 *   1. guilty feelings
 *
 * The card is built sense-by-sense so truncation never splits an HTML tag.
 */
import type { WordSummary } from "@vocab/shared";

export const TELEGRAM_MESSAGE_LIMIT = 4096;
const MAX_SENSES = 5;
const MAX_EXAMPLES = 3;

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

  const senseBlocks = summary.senses.slice(0, MAX_SENSES).map((sense, i) => {
    const gw = sense.guideword ? `(${escapeHtml(sense.guideword.toUpperCase())}) ` : "";
    const ru = sense.translation_ru ? ` — ${escapeHtml(sense.translation_ru)}` : "";
    const lines = [`<b>${ROMAN[i] ?? String(i + 1)}.</b> ${gw}${escapeHtml(sense.definition_en)}${ru}`];
    sense.examples.slice(0, MAX_EXAMPLES).forEach((ex, j) => {
      lines.push(`  ${j + 1}. ${escapeHtml(ex.en)}`);
    });
    return lines.join("\n");
  });

  const footer = summary.usage_note ? `💡 ${escapeHtml(summary.usage_note)}` : null;

  let truncated = summary.senses.length > MAX_SENSES;
  const parts: string[] = [header];
  for (const block of senseBlocks) {
    const candidate = [...parts, block].join("\n\n");
    if (candidate.length > TELEGRAM_MESSAGE_LIMIT) {
      truncated = true;
      break;
    }
    parts.push(block);
  }
  if (footer) {
    const candidate = [...parts, footer].join("\n\n");
    if (candidate.length <= TELEGRAM_MESSAGE_LIMIT) parts.push(footer);
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
