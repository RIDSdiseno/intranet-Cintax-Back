"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const trabajador_controller_1 = require("../controllers/trabajador.controller");
// import { authMiddleware } from "../middlewares/auth";
const router = (0, express_1.Router)();
router.get("/trabajadores", trabajador_controller_1.listTrabajadores);
exports.default = router;
