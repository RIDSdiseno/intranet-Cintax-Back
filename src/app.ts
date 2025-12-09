// src/app.ts
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import routes from "./routes.js";
import trabajadorRoutes from "./routes/trabajador.routes";
import tareasRoutes from "./routes/tareas.routes";

import { errorHandler } from "./middlewares/error.middleware.js";
import "dotenv/config";

import { oauth2Client } from "./services/googleDrive";
import cron from "node-cron";
import { generarTareasAutomaticas } from "./jobs/generarTareas";
import { syncAreasFromGroupsCore } from "./controllers/auth.controller";

console.log("⚙️ [APP] Cargando app.ts con rutas de tareas v4"); // 👈 DEBUG

export const app = express();

const ENABLE_TASK_CRON = process.env.ENABLE_TASK_CRON === "true";
const ENABLE_GROUPS_CRON = process.env.ENABLE_GROUPS_CRON === "true";

const corsOptions: cors.CorsOptions = {
  origin: [
    "https://intranet-cintax.netlify.app",
    "http://localhost:5173",
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(morgan("dev"));

// =============================
//  DEBUG: versión de la API
// =============================
app.get("/api/debug-version", (_req, res) => {
  res.json({
    ok: true,
    version: "cintax-tareas-v4",   // 👈 cambia esto si quieres
  });
});

// =============================
//  RUTAS PRINCIPALES API
// =============================

app.use("/api", routes);
app.use("/api", trabajadorRoutes);

// 👇 TODAS las rutas de src/routes/tareas.routes.ts
//    quedan bajo /api/tareas/...
app.use("/api/tareas", tareasRoutes);

app.get("/debug/cookies", (req, res) =>
  res.json({ cookies: (req as any).cookies })
);

app.get("/admin/drive/auth-url", (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
    state: "admin",
  });
  res.send(`<a href="${url}">Conectar admin Cintax</a>`);
});

app.post("/api/tareas/generar", async (_req, res) => {
  try {
    await generarTareasAutomaticas();
    res.json({ ok: true });
  } catch (e) {
    console.error("Error generando tareas", e);
    res.status(500).json({ ok: false });
  }
});

app.use(errorHandler);

if (ENABLE_TASK_CRON) {
  cron.schedule("0 9 * * *", async () => {
    try {
      console.log("[CRON] Generando tareas automáticas...");
      await generarTareasAutomaticas(new Date());
      console.log("[CRON] OK tareas generadas");
    } catch (e) {
      console.error("[CRON] Error generando tareas:", e);
    }
  });
}

if (ENABLE_GROUPS_CRON) {
  cron.schedule("0 7 * * *", async () => {
    try {
      console.log("[CRON] Sync áreas desde Google...");
      const result = await syncAreasFromGroupsCore(true);
      console.log("[CRON] Sync OK:", result);
    } catch (e) {
      console.error("[CRON] Error sync áreas:", e);
    }
  });
}
