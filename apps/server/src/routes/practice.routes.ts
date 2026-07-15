import type { FastifyInstance } from "fastify";
import { PracticeQueueRequestSchema, PracticeReviewSchema, type PracticeCard } from "@vocab/shared";
import type { PracticeRepo } from "../db/practice.repo.js";

export interface PracticeRoutesDeps {
  practiceRepo: PracticeRepo;
}

export function registerPracticeRoutes(app: FastifyInstance, deps: PracticeRoutesDeps): void {
  app.post("/api/practice/queue", { preHandler: app.authenticate }, async (req, reply) => {
    const body = PracticeQueueRequestSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid queue request" });
    const cards: PracticeCard[] = await deps.practiceRepo.getQueue(
      req.user.sub,
      body.data.word_ids,
      body.data.limit,
    );
    return { cards };
  });

  app.post("/api/practice/review", { preHandler: app.authenticate }, async (req, reply) => {
    const body = PracticeReviewSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid review" });
    const recorded = await deps.practiceRepo.recordReview(req.user.sub, body.data);
    if (!recorded) return reply.code(404).send({ error: "card not found" });
    return { ok: true };
  });
}
