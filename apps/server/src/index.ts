import Fastify from "fastify";
import { config } from "./config.js";

const app = Fastify({ logger: { level: config.LOG_LEVEL } });

app.get("/healthz", async () => ({ ok: true }));

app.listen({ port: config.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
