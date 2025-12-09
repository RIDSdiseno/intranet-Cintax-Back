"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const auth_controller_1 = require("../controllers/auth.controller");
const r = (0, express_1.Router)();
// 🔐 Auth
r.post("/register", auth_controller_1.registerTrabajador); // registro manual
r.post("/google", auth_controller_1.googleLoginTrabajador); // login con Google
r.post("/login", auth_controller_1.loginTrabajador);
r.post("/logout", auth_middleware_1.authGuard, auth_controller_1.logoutTrabajador);
// 🎫 Tickets / Freshdesk
r.post("/sync-freshdesk", auth_middleware_1.authGuard, auth_controller_1.syncTickets);
r.get("/getTickets", auth_middleware_1.authGuard, auth_controller_1.listTickets);
r.post("/createTicket", auth_middleware_1.authGuard, auth_controller_1.createTicket);
// 📌 Tareas asignadas (vista tipo analistas)
r.get("/tareas-asignadas", auth_middleware_1.authGuard, auth_controller_1.listTareasAsignadas);
// 📂 Conexión a Google Drive (usa el id del trabajador en el state)
r.get("/drive/connect", auth_middleware_1.authGuard, auth_controller_1.connectDrive);
exports.default = r;
