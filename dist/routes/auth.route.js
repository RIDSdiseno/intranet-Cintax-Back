"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/auth.routes.ts
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const auth_controller_1 = require("../controllers/auth.controller");
const r = (0, express_1.Router)();
// 🔐 Auth
r.post("/register", auth_controller_1.registerTrabajador);
r.post("/google", auth_controller_1.googleLoginTrabajador);
r.post("/login", auth_controller_1.loginTrabajador);
r.post("/logout", auth_middleware_1.authGuard, auth_controller_1.logoutTrabajador);
// 👇 Resumen (para navbar, permisos, etc.)
r.get("/me", auth_middleware_1.authGuard, auth_controller_1.getMe);
// 👇 Perfil completo (para Configuración)
r.get("/profile", auth_middleware_1.authGuard, auth_controller_1.getMyProfile);
// 🎫 Tickets
r.post("/sync-freshdesk", auth_middleware_1.authGuard, auth_controller_1.syncTickets);
r.get("/getTickets", auth_middleware_1.authGuard, auth_controller_1.listTickets);
r.post("/createTicket", auth_middleware_1.authGuard, auth_controller_1.createTicket);
// 📌 Tareas asignadas
r.get("/tareas-asignadas", auth_middleware_1.authGuard, auth_controller_1.listTareasAsignadas);
// 📂 Drive
r.get("/drive/connect", auth_middleware_1.authGuard, auth_controller_1.connectDrive);
exports.default = r;
