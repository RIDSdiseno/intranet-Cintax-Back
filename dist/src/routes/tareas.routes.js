"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tareas.routes.ts
const express_1 = require("express");
const tareas_Controller_1 = require("../controllers/tareas.Controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)();
router.get("/mis-ruts", requireAuth_1.requireAuth, tareas_Controller_1.getMisRuts);
router.get("/por-rut/:rut", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorRut);
router.get("/plantillas", requireAuth_1.requireAuth, tareas_Controller_1.getPlantillas);
router.get("/por-plantilla/:idPlantilla", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorPlantilla);
router.post("/bulk-desde-plantilla", requireAuth_1.requireAuth, tareas_Controller_1.crearTareasDesdePlantilla);
router.patch("/:id/estado", requireAuth_1.requireAuth, tareas_Controller_1.actualizarEstado);
router.get("/supervision/resumen", requireAuth_1.requireAuth, tareas_Controller_1.getResumenSupervision);
router.post("/:id/ensure-drive-folder", requireAuth_1.requireAuth, tareas_Controller_1.ensureDriveFolder);
router.post("/:id/archivos", requireAuth_1.requireAuth, upload.single("archivo"), tareas_Controller_1.subirArchivo);
exports.default = router;
