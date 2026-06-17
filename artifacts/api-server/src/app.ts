import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";

const app: Express = express();

// Vercel rewrites /api/* → /api; ensure Express still sees the full path
if (process.env.VERCEL) {
  app.use((req, _res, next) => {
    const raw = req.url ?? "/";
    const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
    const path = raw.split("?")[0] ?? "/";
    if (!path.startsWith("/api")) {
      req.url = `/api${path === "/" ? "" : path}${q}`;
    }
    next();
  });
}

// pino-http uses worker threads that hang on Vercel serverless
if (!process.env.VERCEL) {
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
}

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    name: "LoadBoardPro API",
    health: "/api/healthz",
  });
});

app.use("/api", healthRouter);
app.use("/api", router);

export default app;
