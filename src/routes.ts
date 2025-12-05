import { Router } from "express";
import authRoutes from "./routes/auth.route.js";
import googleRoutes from "./routes/google.route.js";
import tareasRoutes from "./routes/tareas.route.js";

const router = Router();

router.get("/health", (_req, res) =>
  res.json({ ok: true, service: "API Movil", ts: Date.now() })
);

// Auth (login, registro, etc.)
router.use("/auth", authRoutes);

// Google Drive
router.use("/drive", googleRoutes);

// 🔹 TAREAS → esto hace que queden:
//   GET /api/tareas/rut/:rut/tareas
//   GET /api/tareas/tipos
//   GET /api/tareas/por-tipo
router.use("/tareas", tareasRoutes);

export default router;
