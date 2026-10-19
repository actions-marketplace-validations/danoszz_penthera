import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";

const app = Fastify({ logger: true });
app.register(cors, { origin: "*" });
app.register(cookie);

app.post("/api/login", async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) return reply.code(400).send({ error: "Missing credentials" });
  reply.setCookie("token", "opaque-session-id", { path: "/" });
  return { ok: true };
});

app.get("/health", async () => ({ ok: true }));

app.listen({ port: 3000 });
