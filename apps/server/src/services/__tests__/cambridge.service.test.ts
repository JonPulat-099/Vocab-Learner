import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchCambridge, parseCambridge } from "../cambridge.service.js";

const fixture = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, "../../../fixtures", name), "utf8");

describe("parseCambridge", () => {
  it("parses feeling: multi-sense entry with guidewords, defs, RU translations", () => {
    const result = parseCambridge(fixture("cambridge-feeling.html"));
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;

    const entry = result.entries[0]!;
    expect(entry.headword).toBe("feeling");
    expect(entry.pos).toBe("noun");
    expect(entry.ipa).toBe("ˈfiːlɪŋ");
    expect(entry.senses.length).toBeGreaterThanOrEqual(3);

    const emotion = entry.senses[0]!;
    expect(emotion.guideword).toBe("EMOTION");
    expect(emotion.definition_en).toBe("emotion");
    expect(emotion.translation_ru).toContain("чувство");
    expect(emotion.examples.map((e) => e.en)).toContain("guilty feelings");
  });

  it("parses kettle: single sense without a guideword", () => {
    const result = parseCambridge(fixture("cambridge-kettle.html"));
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;

    const entry = result.entries[0]!;
    expect(entry.headword).toBe("kettle");
    expect(entry.senses).toHaveLength(1);
    expect(entry.senses[0]!.guideword).toBeNull();
    expect(entry.senses[0]!.translation_ru).toBeTruthy();
  });

  it("returns not_found for a page with no entries", () => {
    expect(parseCambridge("<html><body>nothing here</body></html>").kind).toBe("not_found");
  });
});

describe("fetchCambridge", () => {
  const opts = { baseUrl: "https://example.test/dictionary/english-russian", timeoutMs: 5000 };

  it("sends realistic User-Agent and Accept-Language headers", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(fixture("cambridge-kettle.html"), { status: 200 }));
    await fetchCambridge("kettle", { ...opts, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://example.test/dictionary/english-russian/kettle");
    expect(init.headers["User-Agent"]).toContain("Mozilla/5.0");
    expect(init.headers["Accept-Language"]).toContain("ru");
  });

  it("treats a redirect (miss → home page) as not_found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://example.test/" } }),
    );
    const result = await fetchCambridge("zzzznotaword", { ...opts, fetchImpl });
    expect(result.kind).toBe("not_found");
  });
});
