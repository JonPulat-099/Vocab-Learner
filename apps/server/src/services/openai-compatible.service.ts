/**
 * Generic summarizer for OpenAI-compatible /chat/completions providers
 * (DeepSeek, GLM, Sakana Fugu, Kimi, self-hosted Copilot proxy, ...).
 * These lack Gemini's native responseJsonSchema, so the schema is spelled out
 * in the prompt and enforced by json_object mode + zod validation after.
 */
import { WordSummarySchema, type WordSummary } from "@vocab/shared";
import { SummarizerUnavailable, type SummarizeInput, type SummarizerService } from "./summarizer.js";
import { SUMMARY_INSTRUCTIONS, buildJsonSchemaHint, buildSourcesBlock } from "./summary-prompt.js";

/** Minimal fetch surface we depend on — injectable for tests. */
export interface OpenAiCompatibleFetch {
  (url: string, init: RequestInit): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

export interface OpenAiCompatibleDeps {
  /** e.g. "deepseek" — used in error messages and logs. */
  providerLabel: string;
  /** Base URL without the /chat/completions path, e.g. https://api.deepseek.com */
  baseURL: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: OpenAiCompatibleFetch;
  /** Delays before each retry on 429/5xx responses. */
  retryDelaysMs?: number[];
}

const DEFAULT_RETRY_DELAYS_MS = [1500, 3000];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

export function createOpenAiCompatibleService(deps: OpenAiCompatibleDeps): SummarizerService {
  const fetchImpl: OpenAiCompatibleFetch = deps.fetchImpl ?? fetch;
  const url = `${deps.baseURL.replace(/\/$/, "")}/chat/completions`;

  async function summarizeWord(input: SummarizeInput): Promise<WordSummary> {
    const body = JSON.stringify({
      model: deps.model,
      messages: [
        { role: "system", content: SUMMARY_INSTRUCTIONS + buildJsonSchemaHint() },
        { role: "user", content: buildSourcesBlock(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const retryDelays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    let data: ChatCompletionResponse;
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${deps.apiKey}`,
            "Content-Type": "application/json",
          },
          body,
          signal: AbortSignal.timeout(deps.timeoutMs),
        });
      } catch (err) {
        // Network failure or timeout — no point retrying a dead/slow endpoint.
        throw new SummarizerUnavailable(deps.providerLabel, err);
      }
      if (response.ok) {
        data = (await response.json()) as ChatCompletionResponse;
        break;
      }
      // Rate limits and server errors are usually brief — retry before falling back.
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < retryDelays.length) {
        await sleep(retryDelays[attempt]!);
        continue;
      }
      throw new SummarizerUnavailable(deps.providerLabel, `HTTP ${response.status}`);
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new SummarizerUnavailable(deps.providerLabel, "empty response");

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new SummarizerUnavailable(deps.providerLabel, err);
    }
    const parsed = WordSummarySchema.safeParse(json);
    if (!parsed.success) {
      throw new SummarizerUnavailable(deps.providerLabel, `schema mismatch: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  return { summarizeWord };
}
