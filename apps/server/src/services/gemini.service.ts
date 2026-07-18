/**
 * Gemini summarization via @google/genai structured output.
 * The response is forced through responseJsonSchema = WordSummary and validated
 * with zod — free-form model text is never parsed.
 */
import { GoogleGenAI } from "@google/genai";
import { WordSummarySchema, type WordSummary } from "@vocab/shared";
import { SummarizerUnavailable, type SummarizeInput } from "./summarizer.js";
import { RESPONSE_JSON_SCHEMA, SUMMARY_INSTRUCTIONS, buildSourcesBlock } from "./summary-prompt.js";

export class GeminiUnavailable extends SummarizerUnavailable {
  constructor(cause: unknown) {
    super("gemini", cause);
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
  /** Delays before each retry on transient 503/overload errors. */
  retryDelaysMs?: number[];
}

const DEFAULT_RETRY_DELAYS_MS = [1500, 3000];

function isTransientOverload(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('"code":503') || msg.includes("UNAVAILABLE") || msg.includes("overloaded");
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createGeminiService(deps: GeminiServiceDeps) {
  const client: GeminiClient =
    deps.client ?? new GoogleGenAI({ apiKey: deps.apiKey }).models;

  async function summarizeWord(input: SummarizeInput): Promise<WordSummary> {
    const contents = [SUMMARY_INSTRUCTIONS, buildSourcesBlock(input)].join("\n\n");

    const retryDelays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    let text: string | undefined;
    for (let attempt = 0; ; attempt++) {
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
        break;
      } catch (err) {
        // Capacity spikes (503) are usually brief — retry before falling back.
        if (isTransientOverload(err) && attempt < retryDelays.length) {
          await sleep(retryDelays[attempt]!);
          continue;
        }
        throw new GeminiUnavailable(err);
      }
    }
    if (!text) throw new GeminiUnavailable("empty response");

    const parsed = WordSummarySchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new GeminiUnavailable(`schema mismatch: ${parsed.error.message}`);
    return parsed.data;
  }

  return { summarizeWord };
}

export type GeminiService = ReturnType<typeof createGeminiService>;
