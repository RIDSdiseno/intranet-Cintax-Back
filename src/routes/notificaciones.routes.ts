// src/routes/notificaciones.routes.ts
import { Router } from "express";
import {
  getNotificaciones,
  getNotificacionesResumen,
  marcarComoLeida,
  marcarTodasComoLeidas,
} from "../controllers/notificaciones.controller";
import { authGuard } from "../middlewares/auth.middleware";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authGuard);

// Obtener notificaciones (con filtros)
router.get("/", getNotificaciones);

// Resumen estadístico
router.get("/resumen", getNotificacionesResumen);

// Marcar una notificación como leída
router.patch("/:id/leida", marcarComoLeida);

// Marcar todas como leídas
router.post("/marcar-todas-leidas", marcarTodasComoLeidas);

export default router;
