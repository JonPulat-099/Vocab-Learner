import type { FastifyInstance } from "fastify";
import type { HistoryItem } from "@vocab/shared";
import type { UsersRepo } from "../db/users.repo.js";

const HISTORY_LIMIT = 100;

export interface HistoryRoutesDeps {
  usersRepo: UsersRepo;
}

export function registerHistoryRoutes(app: FastifyInstance, deps: HistoryRoutesDeps): void {
  app.get("/api/history", { preHandler: app.authenticate }, async (req) => {
    const items: HistoryItem[] = await deps.usersRepo.listHistoryItems(req.user.sub, HISTORY_LIMIT);
    return { items };
  });

  // DB rows only — Telegram chat cleanup stays a bot-side action (needs message ids + Bot API).
  app.delete("/api/history", { preHandler: app.authenticate }, async (req) => {
    await deps.usersRepo.clearSearchHistory(req.user.sub);
    return { ok: true };
  });
}
