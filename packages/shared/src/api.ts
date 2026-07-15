import { z } from "zod";
import { WordSummarySchema } from "./word-summary.js";

// ── Practice ────────────────────────────────────────────

export const PracticeReviewSchema = z.object({
  user_word_id: z.string().uuid(),
  grade: z.union([z.literal(0), z.literal(1)]),
  mode: z.literal("flashcard"),
});
export type PracticeReview = z.infer<typeof PracticeReviewSchema>;

export const PracticeQueueRequestSchema = z.object({
  word_ids: z.array(z.string().uuid()).optional(),
  limit: z.number().int().positive().max(100).default(20),
});
export type PracticeQueueRequest = z.infer<typeof PracticeQueueRequestSchema>;

export const PracticeCardSchema = z.object({
  user_word_id: z.string().uuid(),
  word_id: z.string().uuid(),
  word: z.string(),
  summary: WordSummarySchema.nullable(),
});
export type PracticeCard = z.infer<typeof PracticeCardSchema>;

// ── Auth ────────────────────────────────────────────────

export const TelegramLoginPayloadSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});
export type TelegramLoginPayload = z.infer<typeof TelegramLoginPayloadSchema>;

/** Mini App auth: the raw `Telegram.WebApp.initData` query string, verified server-side. */
export const InitDataAuthSchema = z.object({
  initData: z.string().min(1),
});
export type InitDataAuth = z.infer<typeof InitDataAuthSchema>;

export const AuthRequestSchema = z.union([InitDataAuthSchema, TelegramLoginPayloadSchema]);
export type AuthRequest = z.infer<typeof AuthRequestSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const MeResponseSchema = z.object({
  id: z.string().uuid(),
  tg_id: z.number(),
  tg_username: z.string().nullable(),
  first_name: z.string().nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ── Words ───────────────────────────────────────────────

export const WordListItemSchema = z.object({
  id: z.string().uuid(),
  word: z.string(),
  part_of_speech: z.string().nullable(),
  translation_ru: z.string().nullable(),
  cefr_guess: z.string().nullable(),
  saved_at: z.string(),
});
export type WordListItem = z.infer<typeof WordListItemSchema>;

export const WordListQuerySchema = z.object({
  q: z.string().optional(),
});
export type WordListQuery = z.infer<typeof WordListQuerySchema>;

export const WordDetailsSchema = z.object({
  id: z.string().uuid(),
  word: z.string(),
  summary: WordSummarySchema.nullable(),
  mw_data: z.unknown().nullable(),
  cambridge_data: z.unknown().nullable(),
  youglish_data: z.unknown().nullable(),
  fetched_at: z.string(),
});
export type WordDetails = z.infer<typeof WordDetailsSchema>;

// ── History ─────────────────────────────────────────────

export const HistoryItemSchema = z.object({
  id: z.number(),
  word_id: z.string().uuid(),
  word: z.string(),
  created_at: z.string(),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;
