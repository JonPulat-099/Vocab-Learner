import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchMwRaw, parseMw, stripMwTokens } from "./mw.service.js";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "../../fixtures", name), "utf8"));

describe("parseMw", () => {
  it("parses a known word into entries with fl, shortdef and examples", () => {
    const result = parseMw(fixture("mw-feeling.json"));
    expect(result.kind).toBe("entries");
    if (result.kind !== "entries") return;
    expect(result.entries[0]).toMatchObject({
      id: "feeling:1",
      headword: "feeling",
      fl: "noun",
    });
    expect(result.entries[0]!.shortdef.length).toBeGreaterThan(0);
    expect(result.entries[0]!.examples).toContain("guilty feelings");
  });

  it("parses a multi-POS word into one entry per part of speech", () => {
    const result = parseMw(fixture("mw-test.json"));
    expect(result.kind).toBe("entries");
    if (result.kind !== "entries") return;
    expect(result.entries.map((e) => e.fl)).toEqual(["noun", "verb"]);
  });

  it("detects the suggestions array for an unknown word", () => {
    const result = parseMw(fixture("mw-feelling.json"));
    expect(result).toEqual(
      expect.objectContaining({ kind: "suggestions", suggestions: expect.arrayContaining(["feeling"]) }),
    );
  });

  it("returns not_found for an empty response", () => {
    expect(parseMw([]).kind).toBe("not_found");
    expect(parseMw(null).kind).toBe("not_found");
  });
});

describe("stripMwTokens", () => {
  it("strips formatting and cross-reference tokens", () => {
    expect(stripMwTokens("lost all {it}feeling{/it} in his fingers")).toBe(
      "lost all feeling in his fingers",
    );
    expect(stripMwTokens("{bc}unreasoned opinion {sx|premonition||}")).toBe(
      "unreasoned opinion premonition",
    );
  });
});

describe("fetchMwRaw", () => {
  it("requests the collegiate endpoint with the api key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixture("mw-feeling.json")), { status: 200 }),
    );
    const raw = await fetchMwRaw("feeling", { apiKey: "k", timeoutMs: 5000, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dictionaryapi.com/api/v3/references/collegiate/json/feeling?key=k",
      expect.anything(),
    );
    expect(Array.isArray(raw)).toBe(true);
  });

  it("throws on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(fetchMwRaw("feeling", { apiKey: "k", timeoutMs: 5000, fetchImpl })).rejects.toThrow(
      "403",
    );
  });
});
