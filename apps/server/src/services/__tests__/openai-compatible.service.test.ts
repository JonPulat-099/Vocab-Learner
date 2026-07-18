import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WordSummarySchema } from "@vocab/shared";
import {
  createOpenAiCompatibleService,
  type OpenAiCompatibleFetch,
} from "../openai-compatible.service.js";
import { SummarizerUnavailable } from "../summarizer.js";
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
  idioms: [],
  usage_note: "",
};

const mwRaw = JSON.parse(fixture("mw-feeling.json"));
const cambridge = parseCambridge(fixture("cambridge-feeling.html"));
const inputs = { word: "feeling", mwRaw, cambridge };

const okResponse = (summary: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(summary) } }] }),
});

const errorResponse = (status: number) => ({
  ok: false,
  status,
  json: async () => ({}),
});

const makeService = (fetchImpl: OpenAiCompatibleFetch) =>
  createOpenAiCompatibleService({
    providerLabel: "deepseek",
    baseURL: "https://api.example.com",
    apiKey: "k",
    model: "m",
    timeoutMs: 1000,
    fetchImpl,
    retryDelaysMs: [1, 1],
  });

describe("openai-compatible.service", () => {
  it("returns a schema-valid WordSummary and sends the right request shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(feelingSummary));
    const service = makeService(fetchImpl);

    const summary = await service.summarizeWord(inputs);
    expect(WordSummarySchema.parse(summary)).toEqual(feelingSummary);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer k");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("m");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("JSON Schema");
    expect(body.messages[1].content).toContain("CAMBRIDGE DATA");
    expect(body.messages[1].content).toContain("MERRIAM-WEBSTER DATA");
    // Noise keys are trimmed from the raw MW payload before prompting.
    expect(body.messages[1].content).not.toContain('"uuid"');
  });

  it("strips a trailing slash from the base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(feelingSummary));
    const service = createOpenAiCompatibleService({
      providerLabel: "glm",
      baseURL: "https://api.example.com/v1/",
      apiKey: "k",
      model: "m",
      timeoutMs: 1000,
      fetchImpl,
    });
    await service.summarizeWord(inputs);
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.example.com/v1/chat/completions");
  });

  it("retries transient 503 responses before succeeding", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValue(okResponse(feelingSummary));
    const service = makeService(fetchImpl);
    await expect(service.summarizeWord(inputs)).resolves.toMatchObject({ word: "feeling" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries 429 rate limits", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValue(okResponse(feelingSummary));
    const service = makeService(fetchImpl);
    await expect(service.summarizeWord(inputs)).resolves.toMatchObject({ word: "feeling" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up on persistent 500 after exhausting retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(500));
    const service = makeService(fetchImpl);
    await expect(service.summarizeWord(inputs)).rejects.toBeInstanceOf(SummarizerUnavailable);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient HTTP failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(401));
    const service = makeService(fetchImpl);
    await expect(service.summarizeWord(inputs)).rejects.toBeInstanceOf(SummarizerUnavailable);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry network-level failures", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("The operation was aborted"));
    const service = makeService(fetchImpl);
    await expect(service.summarizeWord(inputs)).rejects.toBeInstanceOf(SummarizerUnavailable);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty response body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    });
    const service = makeService(fetchImpl);
    await expect(service.summarizeWord(inputs)).rejects.toBeInstanceOf(SummarizerUnavailable);
  });

  it("rejects invalid JSON in the model output", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "not json {" } }] }),
    });
    const service = makeService(fetchImpl);
    await expect(service.summarizeWord(inputs)).rejects.toBeInstanceOf(SummarizerUnavailable);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects schema-invalid model output", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ nope: true }));
    const service = makeService(fetchImpl);
    await expect(service.summarizeWord(inputs)).rejects.toBeInstanceOf(SummarizerUnavailable);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
