"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const informes_controller_1 = require("./informes.controller");
const r = (0, express_1.Router)();
// Las tres rutas exigen estar autenticado Y estar en la lista de informes.
// El guard va en cada una, no solo en el front: ocultar el menu no protege
// nada si el endpoint responde igual.
r.use(auth_middleware_1.authGuard, informes_controller_1.soloInformes);
r.get("/", informes_controller_1.listar);
r.post("/generar", informes_controller_1.generar);
r.get("/:semana", informes_controller_1.detalle);
exports.default = r;
//# sourceMappingURL=informes.routes.js.map