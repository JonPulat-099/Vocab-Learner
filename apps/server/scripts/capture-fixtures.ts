/**
 * One-off dev script: re-capture live fixtures for tests.
 * Usage: pnpm --filter server exec tsx --env-file=.env scripts/capture-fixtures.ts
 * Never runs in CI — tests read the saved files only.
 *
 * NOTE: the mw-*.json fixtures in the repo were hand-modeled on the documented
 * MW v3 response format; run this once with a real MW_API_KEY to replace them
 * with genuine payloads.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const FIXTURES = path.join(import.meta.dirname, "..", "fixtures");
const MW_KEY = process.env.MW_API_KEY;
const CAMBRIDGE_BASE =
  process.env.CAMBRIDGE_BASE_URL ?? "https://dictionary.cambridge.org/dictionary/english-russian";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
};

async function captureMw(word: string): Promise<void> {
  const res = await fetch(
    `https://dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${MW_KEY}`,
  );
  const json = await res.json();
  await writeFile(path.join(FIXTURES, `mw-${word}.json`), JSON.stringify(json, null, 2));
  console.log(`mw-${word}.json saved (${res.status})`);
}

async function captureCambridge(word: string): Promise<void> {
  const res = await fetch(`${CAMBRIDGE_BASE}/${word}`, { headers: HEADERS, redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    console.log(`cambridge ${word}: redirect (${res.status}) — not in this edition, skipped`);
    return;
  }
  await writeFile(path.join(FIXTURES, `cambridge-${word}.html`), await res.text());
  console.log(`cambridge-${word}.html saved (${res.status})`);
}

if (!MW_KEY) {
  console.error("MW_API_KEY not set — skipping MW captures");
} else {
  for (const w of ["feeling", "test", "feelling"]) await captureMw(w);
}
for (const w of ["feeling", "kettle"]) await captureCambridge(w);
