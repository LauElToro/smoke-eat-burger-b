import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { logRequests, logErrors } from "./middleware/logRequests.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import rewardsRoutes from "./routes/rewards.js";

const app = express();

// Requerido en Render/Cloudflare para IP real
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "img-src": ["'self'", "data:"],
      "style-src": ["'self'", "https:", "'unsafe-inline'"],
      "script-src-attr": ["'none'"],
    },
  },
}));

app.use(cors({ origin: "*" }));
app.use(express.json());

// En test, subimos el límite para evitar falsos positivos
const isTest = process.env.NODE_ENV === "test";
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10_000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: true },
}));

app.use(logRequests);

app.get("/", (_req, res) => res.send("API ok"));

app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/rewards", rewardsRoutes);

// Siempre al final
app.use(logErrors);

export default app;
