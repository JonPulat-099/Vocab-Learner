import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createWordsRepo, normalizeWord, type WordRow } from "../words.repo.js";

const fixture = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, "../../../fixtures", name), "utf8");

/** In-memory fake of the supabase query chains used by words.repo. */
function fakeSupabase(store: Map<string, WordRow>) {
  return {
    from: (table: string) => {
      if (table !== "words") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, word: string) => ({
            maybeSingle: async () => ({ data: store.get(word) ?? null, error: null }),
          }),
        }),
        upsert: (values: Omit<WordRow, "id">) => ({
          select: () => ({
            single: async () => {
              const row: WordRow = { id: `id-${values.word}`, summary: null, ...values };
              store.set(values.word, row);
              return { data: row, error: null };
            },
          }),
        }),
        update: (values: Partial<WordRow>) => ({
          eq: async (_col: string, id: string) => {
            for (const row of store.values()) {
              if (row.id === id) Object.assign(row, values);
            }
            return { error: null };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
}

function makeRepo(store: Map<string, WordRow>, fetchImpl: typeof fetch) {
  return createWordsRepo({
    supabase: fakeSupabase(store),
    mwApiKey: "k",
    cambridgeBaseUrl: "https://example.test/dictionary/english-russian",
    sourceTimeoutMs: 5000,
    cacheTtlDays: 0,
    fetchImpl,
  });
}

const okFetch = () =>
  vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("dictionaryapi.com")) return new Response(fixture("mw-feeling.json"));
    if (u.includes("example.test")) return new Response(fixture("cambridge-feeling.html"));
    throw new Error(`unexpected fetch ${u}`);
  }) as unknown as ReturnType<typeof vi.fn> & typeof fetch;

describe("normalizeWord", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeWord("  Give   Up ")).toBe("give up");
  });
});

describe("getOrFetchWord", () => {
  it("fetches sources on miss and stores raw payloads", async () => {
    const store = new Map<string, WordRow>();
    const fetchImpl = okFetch();
    const repo = makeRepo(store, fetchImpl);

    const result = await repo.getOrFetchWord("Feeling");
    expect(result.kind).toBe("word");
    if (result.kind !== "word") return;
    expect(result.row.word).toBe("feeling");
    expect(result.row.mw_data).toBeTruthy();
    expect(result.row.cambridge_data?.kind).toBe("found");
    expect(result.row.youglish_data?.link).toBe("https://youglish.com/pron/feeling/english");
    expect(fetchImpl).toHaveBeenCalledTimes(2); // MW + Cambridge (youglish is a pure link)
  });

  it("makes zero external requests on the second call for the same word", async () => {
    const store = new Map<string, WordRow>();
    const fetchImpl = okFetch();
    const repo = makeRepo(store, fetchImpl);

    await repo.getOrFetchWord("feeling");
    fetchImpl.mockClear();
    const second = await repo.getOrFetchWord("FEELING");
    expect(second.kind).toBe("word");
    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });

  it("returns suggestions for a typo without caching a row", async () => {
    const store = new Map<string, WordRow>();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("dictionaryapi.com")) return new Response(fixture("mw-feelling.json"));
      return new Response(null, { status: 302, headers: { location: "https://example.test/" } });
    }) as unknown as typeof fetch;
    const repo = makeRepo(store, fetchImpl);

    const result = await repo.getOrFetchWord("feelling");
    expect(result.kind).toBe("suggestions");
    if (result.kind !== "suggestions") return;
    expect(result.suggestions).toContain("feeling");
    expect(store.size).toBe(0);
  });

  it("still stores the word when one source fails (graceful degradation)", async () => {
    const store = new Map<string, WordRow>();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("dictionaryapi.com")) throw new Error("MW down");
      if (u.includes("example.test")) return new Response(fixture("cambridge-feeling.html"));
      throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;
    const repo = makeRepo(store, fetchImpl);

    const result = await repo.getOrFetchWord("feeling");
    expect(result.kind).toBe("word");
    if (result.kind !== "word") return;
    expect(result.row.mw_data).toBeNull();
    expect(result.row.cambridge_data?.kind).toBe("found");
  });

  it("saveSummary persists the summary onto the row", async () => {
    const store = new Map<string, WordRow>();
    const repo = makeRepo(store, okFetch());
    const result = await repo.getOrFetchWord("feeling");
    if (result.kind !== "word") throw new Error("expected word");

    const summary = {
      word: "feeling",
      forms: [],
      part_of_speech: "noun",
      transcription: "",
      cefr_guess: "B1",
      senses: [],
      usage_note: "",
    };
    await repo.saveSummary(result.row.id, summary);
    expect(store.get("feeling")!.summary).toEqual(summary);
  });
});
