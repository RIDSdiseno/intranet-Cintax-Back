// src/routes.ts
import { Router } from "express";

// Rutas hijas
import authRoutes from "./routes/auth.route";
import googleRoutes from "./routes/google.route";

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

// 👇 OJO: aquí YA NO montamos /tareas
// router.use("/tareas", tareasRoutes);

export default router;
