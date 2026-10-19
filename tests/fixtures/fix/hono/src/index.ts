import { Hono } from "hono";
import { cors } from "hono/cors";
import { setCookie } from "hono/cookie";

const app = new Hono();
app.use("/api/*", cors());

app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ error: "Missing credentials" }, 400);
  setCookie(c, "session", crypto.randomUUID(), { path: "/" });
  return c.json({ ok: true });
});

app.get("/health", (c) => c.json({ ok: true }));

export default app;
