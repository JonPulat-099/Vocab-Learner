/**
 * Cache-first word repository. A word costs external calls exactly once —
 * never bypass getOrFetchWord().
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WordSummary } from "@vocab/shared";
import { fetchMwRaw, parseMw } from "./mw.service.js";
import { fetchCambridge, type CambridgeResult } from "./cambridge.service.js";
import { getYouglish, type YouglishData } from "./youglish.service.js";

export interface WordRow {
  id: string;
  word: string;
  mw_data: unknown | null;
  cambridge_data: CambridgeResult | null;
  youglish_data: YouglishData | null;
  summary: WordSummary | null;
  fetched_at: string;
}

export type WordLookup =
  | { kind: "word"; row: WordRow }
  | { kind: "suggestions"; suggestions: string[] }
  | { kind: "not_found" };

export interface WordsRepoDeps {
  supabase: SupabaseClient;
  mwApiKey: string;
  cambridgeBaseUrl: string;
  youglishApiKey?: string;
  sourceTimeoutMs: number;
  cacheTtlDays: number;
  fetchImpl?: typeof fetch;
  logger?: {
    info(obj: Record<string, unknown>, msg?: string): void;
    warn(obj: Record<string, unknown>, msg?: string): void;
  };
}

export function normalizeWord(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function createWordsRepo(deps: WordsRepoDeps) {
  const isFresh = (fetchedAt: string): boolean => {
    if (deps.cacheTtlDays === 0) return true; // 0 = cache forever
    const ageMs = Date.now() - new Date(fetchedAt).getTime();
    return ageMs < deps.cacheTtlDays * 24 * 60 * 60 * 1000;
  };

  async function getOrFetchWord(input: string): Promise<WordLookup> {
    const word = normalizeWord(input);

    const { data: cached, error: lookupError } = await deps.supabase
      .from("words")
      .select("*")
      .eq("word", word)
      .maybeSingle();
    if (lookupError) throw new Error(`words lookup failed: ${lookupError.message}`);
    if (cached && isFresh(cached.fetched_at)) {
      deps.logger?.info({ word }, "cache hit — no external requests");
      return { kind: "word", row: cached as WordRow };
    }

    deps.logger?.info({ word }, "cache miss — fetching sources");
    const [mw, cambridge, youglish] = await Promise.allSettled([
      fetchMwRaw(word, {
        apiKey: deps.mwApiKey,
        timeoutMs: deps.sourceTimeoutMs,
        fetchImpl: deps.fetchImpl,
      }),
      fetchCambridge(word, {
        baseUrl: deps.cambridgeBaseUrl,
        timeoutMs: deps.sourceTimeoutMs,
        fetchImpl: deps.fetchImpl,
      }),
      getYouglish(word, deps.youglishApiKey),
    ]);

    const mwRaw = mw.status === "fulfilled" ? mw.value : null;
    const mwParsed = parseMw(mwRaw);
    const cambridgeData =
      cambridge.status === "fulfilled" && cambridge.value.kind === "found"
        ? cambridge.value
        : null;
    const youglishData = youglish.status === "fulfilled" ? youglish.value : null;

    deps.logger?.info(
      {
        word,
        mw: mw.status === "fulfilled" ? mwParsed.kind : `failed: ${String(mw.reason)}`,
        cambridge:
          cambridge.status === "fulfilled"
            ? cambridge.value.kind
            : `failed: ${String(cambridge.reason)}`,
      },
      "sources fetched",
    );

    const hasContent = mwParsed.kind === "entries" || cambridgeData !== null;
    if (!hasContent) {
      // Don't cache misses/typos as word rows.
      if (mwParsed.kind === "suggestions") {
        return { kind: "suggestions", suggestions: mwParsed.suggestions };
      }
      return { kind: "not_found" };
    }

    const { data: row, error: upsertError } = await deps.supabase
      .from("words")
      .upsert(
        {
          word,
          mw_data: mwParsed.kind === "entries" ? mwRaw : null,
          cambridge_data: cambridgeData,
          youglish_data: youglishData,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "word" },
      )
      .select()
      .single();
    if (upsertError) throw new Error(`words upsert failed: ${upsertError.message}`);
    return { kind: "word", row: row as WordRow };
  }

  async function saveSummary(wordId: string, summary: WordSummary): Promise<void> {
    const { error } = await deps.supabase.from("words").update({ summary }).eq("id", wordId);
    if (error) throw new Error(`summary update failed: ${error.message}`);
  }

  /** Cache-only lookup by id — used to re-open cards from /mywords and /history. */
  async function getWordById(id: string): Promise<WordRow | null> {
    const { data, error } = await deps.supabase.from("words").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`words lookup by id failed: ${error.message}`);
    return (data as WordRow | null) ?? null;
  }

  return { getOrFetchWord, getWordById, saveSummary };
}

export type WordsRepo = ReturnType<typeof createWordsRepo>;
