// src/routes/tareas.routes.ts
import { Router } from "express";
import { authGuard, requireSupervisorOrAdmin } from "../middlewares/auth.middleware";
import { crearDesdePlantillaMasivo } from "../controllers/tareas.masivo.controller";

const router = Router();

router.post(
  "/crear-desde-plantilla-masivo",
  authGuard,
  requireSupervisorOrAdmin,
  crearDesdePlantillaMasivo
);

export default router;
