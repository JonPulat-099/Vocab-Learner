import type { FastifyInstance } from "fastify";
import { AuthRequestSchema, type AuthResponse, type MeResponse } from "@vocab/shared";
import type { UsersRepo } from "../db/users.repo.js";
import { verifyInitData, verifyLoginWidget } from "../auth/verify-telegram.js";

export interface AuthRoutesDeps {
  botToken: string;
  /** Unset = no single-user guard; any verified Telegram user gets a token. */
  ownerTgId?: number;
  allowDevLogin: boolean;
  usersRepo: UsersRepo;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  app.post("/api/auth/telegram", async (req, reply) => {
    const parsed = AuthRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid auth payload" });
    }

    const result =
      "initData" in parsed.data
        ? verifyInitData(parsed.data.initData, deps.botToken)
        : verifyLoginWidget(parsed.data, deps.botToken);

    if (!result.ok) {
      req.log.warn({ reason: result.reason }, "telegram auth rejected");
      return reply.code(401).send({ error: "invalid auth payload" });
    }
    // Single-user guard (only when ownerTgId is configured).
    if (deps.ownerTgId !== undefined && result.user.tg_id !== deps.ownerTgId) {
      req.log.warn({ tg_id: result.user.tg_id }, "auth attempt from non-owner");
      return reply.code(403).send({ error: "forbidden" });
    }

    const user = await deps.usersRepo.upsertUser({
      id: result.user.tg_id,
      username: result.user.username,
      first_name: result.user.first_name,
    });
    const token = await reply.jwtSign({ sub: user.id, tg_id: user.tg_id });
    const response: AuthResponse = { token };
    return response;
  });

  const devLoginTgId = deps.ownerTgId;
  if (deps.allowDevLogin && devLoginTgId !== undefined) {
    // Local dev only: Telegram widgets/Mini Apps can't sign in on localhost.
    // Needs OWNER_TG_ID — the dev token has to impersonate a concrete user.
    app.post("/api/auth/dev", async (_req, reply) => {
      const user = await deps.usersRepo.upsertUser({ id: devLoginTgId });
      const token = await reply.jwtSign({ sub: user.id, tg_id: user.tg_id });
      const response: AuthResponse = { token };
      return response;
    });
  }

  app.get("/api/me", { preHandler: app.authenticate }, async (req, reply) => {
    const user = await deps.usersRepo.getById(req.user.sub);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const response: MeResponse = {
      id: user.id,
      tg_id: user.tg_id,
      tg_username: user.tg_username,
      first_name: user.first_name,
    };
    return response;
  });
}
