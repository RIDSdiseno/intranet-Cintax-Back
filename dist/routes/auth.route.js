"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const auth_controller_1 = require("../controllers/auth.controller");
const r = (0, express_1.Router)();
r.post("/register", auth_controller_1.registerTrabajador); // si quieres registro manual
r.post("/google", auth_controller_1.googleLoginTrabajador); // login con Google
r.post("/login", auth_controller_1.loginTrabajador);
r.post("/logout", auth_middleware_1.authGuard, auth_controller_1.logoutTrabajador);
r.post("/sync-freshdesk", auth_middleware_1.authGuard, auth_controller_1.syncTickets);
r.get("/getTickets", auth_middleware_1.authGuard, auth_controller_1.listTickets);
r.post("/createTicket", auth_middleware_1.authGuard, auth_controller_1.createTicket);
exports.default = r;
