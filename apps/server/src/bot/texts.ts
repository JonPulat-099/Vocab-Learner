/** All bot user-facing strings live here (future i18n). */
export const texts = {
  start:
    "👋 Hi! Send me any English word and I'll build a card with definitions, " +
    "Russian translations and examples.\n\n" +
    "Commands:\n" +
    "/search <word> — look a word up\n" +
    "/help — how to use the bot\n" +
    "/mywords — your saved words\n" +
    "/history — recent searches\n" +
    "/clear — clear search history",
  help:
    "📖 Vocab Learner bot\n\n" +
    "Send me any English word and I'll reply with a card: definitions grouped by sense, " +
    "Russian/Uzbek translations, examples, synonyms and idioms.\n\n" +
    "Commands:\n" +
    "/search <word> — look a word up\n" +
    "/help — this message\n" +
    "/mywords — your saved words\n" +
    "/history — recent searches\n" +
    "/clear — clear search history\n\n" +
    "Tip: you don't need /search — just type the word.",
  searching: "⏳ Searching…",
  notFound: (word: string) => `😕 Couldn't find “${word}” in any source.`,
  didYouMean: (word: string) => `🤔 No entry for “${word}”. Did you mean:`,
  searchError: "⚠️ Something went wrong while searching. Please try again.",
  emptySearch: "Send a word to search, e.g. /search feeling",
  savedToast: "✅ Saved to your words",
  alreadySaved: "Already saved ✅",
  wordGone: "😕 That word is no longer in the cache. Try searching it again.",
  mywordsEmpty: "You haven't saved any words yet. Search a word and tap 💾 Save.",
  mywordsHeader: (total: number, page: number, pages: number) =>
    `💾 Your saved words — ${total} total (page ${page + 1}/${pages}). Tap one to open the card:`,
  historyEmpty: "No searches yet. Send me a word!",
  historyHeader: "🕘 Recent searches — tap to re-open:",
  clearConfirm:
    "🗑 Clear your search history?\n\n" +
    "This also deletes the search messages from this chat. Telegram only lets me delete " +
    "messages younger than 48 hours — older ones will stay in the chat, but all history " +
    "records will be wiped.",
  clearing: "🧹 Clearing history…",
  clearCancelled: "Okay, history kept.",
  clearDone: (deleted: number, skipped: number) =>
    skipped > 0
      ? `🧹 History cleared. Deleted ${deleted} messages; ${skipped} were too old (48h+) or already gone.`
      : `🧹 History cleared. Deleted ${deleted} messages.`,
  buttons: {
    save: "💾 Save",
    saved: "✅ Saved",
    youglish: "🎧 YouGlish",
    clearHistory: "🗑 Clear history",
    fullEntry: "🌐 Full entry on site",
    confirmClear: "🗑 Yes, clear",
    cancel: "Cancel",
    prevPage: "⬅️",
    nextPage: "➡️",
  },
} as const;
