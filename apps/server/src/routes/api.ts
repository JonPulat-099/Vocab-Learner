/**
 * REST API plugin: CORS + JWT + all /api/* routes.
 * Registered on the same Fastify instance that hosts the bot webhook.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import type { UsersRepo } from "../db/users.repo.js";
import type { UserWordsRepo } from "../db/user-words.repo.js";
import type { PracticeRepo } from "../db/practice.repo.js";
import type { WordsRepo } from "../services/words.repo.js";
import { registerAuthRoutes } from "./auth.routes.js";
import { registerWordRoutes } from "./words.routes.js";
import { registerHistoryRoutes } from "./history.routes.js";
import { registerPracticeRoutes } from "./practice.routes.js";

export interface JwtClaims {
  sub: string; // users.id
  tg_id: number;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtClaims;
    user: JwtClaims;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface ApiDeps {
  botToken: string;
  /** Unset = no single-user guard. */
  ownerTgId?: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  webOrigin: string;
  /** Registers POST /api/auth/dev (owner JWT without Telegram) — never in production. */
  allowDevLogin: boolean;
  usersRepo: UsersRepo;
  userWordsRepo: UserWordsRepo;
  wordsRepo: WordsRepo;
  practiceRepo: PracticeRepo;
}

export async function registerApi(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  await app.register(fastifyCors, { origin: deps.webOrigin });
  await app.register(fastifyJwt, {
    secret: deps.jwtSecret,
    sign: { expiresIn: deps.jwtExpiresIn },
  });

  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      await reply.code(401).send({ error: "unauthorized" });
    }
  });

  registerAuthRoutes(app, deps);
  registerWordRoutes(app, deps);
  registerHistoryRoutes(app, deps);
  registerPracticeRoutes(app, deps);
}
