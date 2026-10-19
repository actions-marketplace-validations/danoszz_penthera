import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";

const app = express();
app.use(cors());
app.use(cookieParser());
app.use(express.json());

const mailer = { apiKey: "h3J9sK2dLq8Wm4Zx" };

app.get("/health", (req, res) => res.json({ ok: true, mailer: Boolean(mailer.apiKey) }));
app.use("/auth", authRouter);

app.listen(3000);
