/**
 * YouGlish. Tier 1 (default): deep link only.
 * Tier 2 (stub): with YOUGLISH_API_KEY, fetch caption snippets — not implemented yet.
 */

export interface YouglishData {
  link: string;
}

export async function getYouglish(word: string, apiKey?: string): Promise<YouglishData> {
  if (apiKey) {
    // Tier 2 stub: API-backed caption snippets will slot in here (youglish.com/api).
    return { link: deepLink(word) };
  }
  return { link: deepLink(word) };
}

function deepLink(word: string): string {
  return `https://youglish.com/pron/${encodeURIComponent(word)}/english`;
}
