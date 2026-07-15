import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { WordListQuerySchema, type WordDetails, type WordListItem } from "@vocab/shared";
import type { UserWordsRepo } from "../db/user-words.repo.js";
import type { WordsRepo } from "../services/words.repo.js";

const IdParamsSchema = z.object({ id: z.string().uuid() });

export interface WordRoutesDeps {
  userWordsRepo: UserWordsRepo;
  wordsRepo: WordsRepo;
}

export function registerWordRoutes(app: FastifyInstance, deps: WordRoutesDeps): void {
  app.get("/api/words", { preHandler: app.authenticate }, async (req, reply) => {
    const query = WordListQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "invalid query" });
    const items: WordListItem[] = await deps.userWordsRepo.listSavedDetailed(
      req.user.sub,
      query.data.q,
    );
    return { items };
  });

  app.get("/api/words/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid word id" });
    const row = await deps.wordsRepo.getWordById(params.data.id);
    if (!row) return reply.code(404).send({ error: "word not found" });
    const details: WordDetails = {
      id: row.id,
      word: row.word,
      summary: row.summary,
      mw_data: row.mw_data,
      cambridge_data: row.cambridge_data,
      youglish_data: row.youglish_data,
      fetched_at: row.fetched_at,
    };
    return details;
  });

  app.delete("/api/words/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const params = IdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid word id" });
    const removed = await deps.userWordsRepo.unsaveWord(req.user.sub, params.data.id);
    if (!removed) return reply.code(404).send({ error: "word not saved" });
    return { ok: true };
  });
}
