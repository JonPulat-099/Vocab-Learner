/** All bot user-facing strings live here (future i18n). */
export const texts = {
  start:
    "👋 Hi! Send me any English word and I'll build a card with definitions, " +
    "Russian translations and examples.\n\n" +
    "Commands:\n" +
    "/search <word> — look a word up\n" +
    "/help — how to use the bot\n" +
    "/mywords — your saved words (soon)\n" +
    "/history — recent searches (soon)",
  help:
    "📖 Vocab Learner bot\n\n" +
    "Send me any English word and I'll reply with a card: definitions grouped by sense, " +
    "Russian/Uzbek translations, examples, synonyms and idioms.\n\n" +
    "Commands:\n" +
    "/search <word> — look a word up\n" +
    "/help — this message\n" +
    "/mywords — your saved words (soon)\n" +
    "/history — recent searches (soon)\n\n" +
    "Tip: you don't need /search — just type the word.",
  searching: "⏳ Searching…",
  notFound: (word: string) => `😕 Couldn't find “${word}” in any source.`,
  didYouMean: (word: string) => `🤔 No entry for “${word}”. Did you mean:`,
  searchError: "⚠️ Something went wrong while searching. Please try again.",
  comingSoon: "🚧 Coming soon!",
  emptySearch: "Send a word to search, e.g. /search feeling",
  buttons: {
    save: "💾 Save",
    saved: "✅ Saved",
    youglish: "🎧 YouGlish",
    clearHistory: "🗑 Clear history",
    fullEntry: "🌐 Full entry on site",
  },
} as const;
