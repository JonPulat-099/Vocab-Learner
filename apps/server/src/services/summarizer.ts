import type { WordSummary } from "@vocab/shared";
import type { CambridgeResult } from "./cambridge.service.js";

export interface SummarizeInput {
  word: string;
  /** Raw MW API payload (words.mw_data) — trimmed of noise before prompting. */
  mwRaw: unknown;
  cambridge: CambridgeResult | null;
}

export interface SummarizerService {
  summarizeWord(input: SummarizeInput): Promise<WordSummary>;
}

export class SummarizerUnavailable extends Error {
  constructor(providerLabel: string, cause: unknown) {
    super(`${providerLabel} unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "SummarizerUnavailable";
  }
}
