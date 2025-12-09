// src/routes.ts
import { Router } from "express";

// Rutas hijas
import authRoutes from "./routes/auth.route";
import googleRoutes from "./routes/google.route";
import tareasRoutes from "./routes/tareas.routes"; // 👈 aquí se montan TODAS las rutas de tareas

const router = Router();

// =============================
//  HEALTHCHECK
// =============================
router.get("/health", (_req, res) =>
  res.json({ ok: true, service: "API Movil", ts: Date.now() })
);

// =============================
//  AUTH
// =============================
router.use("/auth", authRoutes);

// =============================
//  GOOGLE DRIVE
// =============================
router.use("/drive", googleRoutes);

// =============================
//  TAREAS
//  → todo lo que esté en src/routes/tareas.routes.ts
//     queda bajo /api/tareas/...
// =============================
router.use("/tareas", tareasRoutes);

export default router;
