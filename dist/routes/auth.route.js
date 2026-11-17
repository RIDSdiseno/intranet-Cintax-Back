"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/auth.routes.ts
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const auth_controller_1 = require("../controllers/auth.controller");
const r = (0, express_1.Router)();
// Auth
//
// `register` NO es publica. Crear la cuenta es dar acceso a la intranet, asi
// que la pide un supervisor o un admin, igual que cualquier otra alta.
//
// Estuvo abierta: sin guard, sin verificar el correo y sin restringir el
// dominio, creando el trabajador con `status: true`. Cualquiera en internet se
// registraba y con `/login` obtenia un JWT valido de AGENTE, que alcanza todo
// lo que solo exige `requireAuth`. El filtro de dominio de Google no cubria
// esto: solo corre en `/auth/google`, no aca.
//
// Tampoco basta con exigir el dominio aqui. Seguiria siendo publica, y deja
// pasar el secuestro previo: registrar `alguien@cintax.cl` antes de que exista
// y esperar a que la persona real entre por Google, que vincula las dos
// cuentas (ver `googleLoginTrabajador`) dejando viva la clave del atacante
// sobre una cuenta que ya heredo area y rol.
//
// El alta normal no pasa por aqui: la hace el primer login con Google. Esta
// ruta queda como el alta manual, para cuentas con contrasena.
r.post("/register", auth_middleware_1.authGuard, auth_middleware_1.requireSupervisorOrAdmin, auth_controller_1.registerTrabajador);
r.post("/google", auth_controller_1.googleLoginTrabajador);
r.post("/login", auth_controller_1.loginTrabajador);
r.post("/logout", auth_middleware_1.authGuard, auth_controller_1.logoutTrabajador);
// Resumen (para navbar, permisos, etc.)
r.get("/me", auth_middleware_1.authGuard, auth_controller_1.getMe);
// Perfil completo (para Configuración)
r.get("/profile", auth_middleware_1.authGuard, auth_controller_1.getMyProfile);
// Tickets: viven en /api/tickets (src/modules/tickets).
// Las rutas que estaban aqui consultaban la tabla Ticket por su cuenta,
// sin filtro por area y sin consumidores en el front.
// Tareas asignadas
r.get("/tareas-asignadas", auth_middleware_1.authGuard, auth_controller_1.listTareasAsignadas);
//Drive
r.get("/drive/connect", auth_middleware_1.authGuard, auth_controller_1.connectDrive);
exports.default = r;
//# sourceMappingURL=auth.route.js.map