"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tareas.routes.ts
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const tareas_masivo_controller_1 = require("../controllers/tareas.masivo.controller");
const router = (0, express_1.Router)();
router.post("/crear-desde-plantilla-masivo", auth_middleware_1.authGuard, auth_middleware_1.requireSupervisorOrAdmin, tareas_masivo_controller_1.crearDesdePlantillaMasivo);
exports.default = router;
