import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import dev from './routes/dev';
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import orderRoutes from "./routes/orders";
import rewardRoutes from "./routes/rewards";

const app = express();
// Render está detrás de proxy → confiá en el primer proxy
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // (opcional) silencia la validación si querés
  validate: { trustProxy: true },
});
app.use(limiter);

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 200 }));
app.use('/dev', dev);
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/orders", orderRoutes);
app.use("/rewards", rewardRoutes);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(config.port, () => {
  console.log(`API ready on :${config.port}`);
});
