"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/notificaciones.routes.ts
const express_1 = require("express");
const notificaciones_controller_1 = require("../controllers/notificaciones.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Todas las rutas requieren autenticación
router.use(auth_middleware_1.authGuard);
// Obtener notificaciones (con filtros)
router.get("/", notificaciones_controller_1.getNotificaciones);
// Resumen estadístico
router.get("/resumen", notificaciones_controller_1.getNotificacionesResumen);
// Marcar una notificación como leída
router.patch("/:id/leida", notificaciones_controller_1.marcarComoLeida);
// Marcar todas como leídas
router.post("/marcar-todas-leidas", notificaciones_controller_1.marcarTodasComoLeidas);
exports.default = router;
