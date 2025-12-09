// src/routes.ts
import { Router } from "express";
import authRoutes from "./routes/auth.route";
import googleRoutes from "./routes/google.route";
import tareasRoutes from "./routes/tareas.routes"; // 👈 se alinea con src/routes/tareas.routes.ts

const router = Router();

// Healthcheck general
router.get("/health", (_req, res) =>
  res.json({ ok: true, service: "API Movil", ts: Date.now() })
);

// Auth (login, registro, refresh, etc.)
router.use("/auth", authRoutes);

// Google Drive (pruebas / utilidades)
router.use("/drive", googleRoutes);

// TAREAS
router.use("/tareas", tareasRoutes);

export default router;
