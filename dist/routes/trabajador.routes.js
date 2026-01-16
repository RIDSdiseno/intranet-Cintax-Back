"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const trabajador_controller_1 = require("../controllers/trabajador.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// 🔒 Listado protegido (recomendado)
router.get("/trabajadores", auth_middleware_1.authGuard, trabajador_controller_1.listTrabajadores);
// 🔒 Update: solo supervisor/admin (doble seguro: middleware + controller)
router.patch("/trabajadores/:id", auth_middleware_1.authGuard, auth_middleware_1.requireSupervisorOrAdmin, trabajador_controller_1.updateTrabajador);
exports.default = router;
