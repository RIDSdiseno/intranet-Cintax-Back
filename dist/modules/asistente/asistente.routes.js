"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const asistente_controller_1 = require("./asistente.controller");
const r = (0, express_1.Router)();
// Cualquier usuario autenticado puede usar el asistente. El alcance de los
// datos lo decide cada herramienta a partir del JWT, no esta ruta.
r.post("/chat", auth_middleware_1.authGuard, asistente_controller_1.chat);
r.post("/redactar-respuesta", auth_middleware_1.authGuard, asistente_controller_1.redactarRespuesta);
exports.default = r;
//# sourceMappingURL=asistente.routes.js.map