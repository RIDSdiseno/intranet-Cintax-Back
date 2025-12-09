// src/app.ts
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import routes from "./routes.js";              // entry de rutas principales (auth, drive, etc.)
import trabajadorRoutes from "./routes/trabajador.routes";
import tareasRoutes from "./routes/tareas.routes"; // 👈 RUTAS DE TAREAS

import { errorHandler } from "./middlewares/error.middleware.js";
import "dotenv/config";

import { oauth2Client } from "./services/googleDrive";
import cron from "node-cron";
import { generarTareasAutomaticas } from "./jobs/generarTareas";
import { syncAreasFromGroupsCore } from "./controllers/auth.controller";

export const app = express();

const ENABLE_TASK_CRON = process.env.ENABLE_TASK_CRON === "true";
const ENABLE_GROUPS_CRON = process.env.ENABLE_GROUPS_CRON === "true";

// =============================
//  CORS CONFIG
// =============================
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

// ✅ CORS global
app.use(cors(corsOptions));

// =============================
//  MIDDLEWARES
// =============================
app.use(cookieParser());
app.use(express.json());
app.use(morgan("dev"));

// =============================
//  RUTAS PRINCIPALES API
// =============================

// /api/health, /api/auth/*, /api/drive/*
app.use("/api", routes);

// /api/trabajadores/*
app.use("/api", trabajadorRoutes);

// /api/tareas/*  → vienen desde src/routes/tareas.routes.ts
app.use("/api/tareas", tareasRoutes);

// =============================
//  DEBUG ENDPOINTS (Opcionales)
// =============================
app.get("/debug/cookies", (req, res) =>
  res.json({ cookies: (req as any).cookies })
);

// =============================
//  GOOGLE DRIVE CONNECTOR
// =============================
app.get("/admin/drive/auth-url", (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
    state: "admin",
  });
  res.send(`<a href="${url}">Conectar admin Cintax</a>`);
});

// =============================
//  ENDPOINT MANUAL (TEMPORAL)
// =============================
// POST /api/tareas/generar  → genera tareas automáticas a mano
app.post("/api/tareas/generar", async (_req, res) => {
  try {
    await generarTareasAutomaticas();
    res.json({ ok: true });
  } catch (e) {
    console.error("Error generando tareas", e);
    res.status(500).json({ ok: false });
  }
});

// =============================
//  MANEJADOR GLOBAL DE ERRORES
// =============================
app.use(errorHandler);

// =============================
//  CRON JOBS
// =============================
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
