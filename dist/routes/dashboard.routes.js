"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const router = (0, express_1.Router)();
// Paso 2: Proteger todas las rutas del dashboard
router.use(auth_middleware_1.authGuard);
// Paso 3: Definir las rutas
router.get("/my-tasks", dashboard_controller_1.getMyTasks);
router.get("/my-kpis", dashboard_controller_1.getMyKpis);
router.get("/activity", dashboard_controller_1.getRecentActivity);
router.get("/announcements", dashboard_controller_1.getAnnouncements);
exports.default = router;
