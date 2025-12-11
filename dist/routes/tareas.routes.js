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
const correoTareas_controller_1 = require("../controllers/correoTareas.controller");
// 👇 importa las funciones del controlador de métricas
const tareasMetricas_controller_1 = require("../controllers/tareasMetricas.controller");
const uploadCorreo = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
});
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)();
// =====================
// Rutas de tareas base
// =====================
router.get("/mis-ruts", requireAuth_1.requireAuth, tareas_Controller_1.getMisRuts);
router.get("/por-rut/:rut", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorRut);
router.get("/plantillas", requireAuth_1.requireAuth, tareas_Controller_1.getPlantillas);
router.get("/por-plantilla/:idPlantilla", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorPlantilla);
router.post("/bulk-desde-plantilla", requireAuth_1.requireAuth, tareas_Controller_1.crearTareasDesdePlantilla);
router.patch("/:id/estado", requireAuth_1.requireAuth, tareas_Controller_1.actualizarEstado);
router.get("/supervision/resumen", requireAuth_1.requireAuth, tareas_Controller_1.getResumenSupervision);
router.post("/:id/ensure-drive-folder", requireAuth_1.requireAuth, tareas_Controller_1.ensureDriveFolder);
router.post("/:id/archivos", requireAuth_1.requireAuth, upload.single("archivo"), tareas_Controller_1.subirArchivo);
// =====================
// Rutas de métricas de supervisión
// =====================
// Métricas globales / por área / por mes
router.get("/supervision/metricas", requireAuth_1.requireAuth, tareasMetricas_controller_1.getMetricasSupervision);
// Métricas detalladas por agente
router.get("/supervision/metricas/agente/:id", requireAuth_1.requireAuth, tareasMetricas_controller_1.getMetricasAgente);
router.post("/:id/enviar-correo", requireAuth_1.requireAuth, uploadCorreo.array("adjuntos"), // 👈 ahora escucha "adjuntos"
correoTareas_controller_1.CorreoTareasController.enviarCorreo);
exports.default = router;
