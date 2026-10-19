import { Router } from "express";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing credentials" });
  res.cookie("sid", `${email}:session`);
  res.json({ ok: true });
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie("sid");
  res.json({ ok: true });
});
