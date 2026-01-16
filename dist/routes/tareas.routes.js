"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tareas.routes.ts
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const requireAuth_1 = require("../middlewares/requireAuth");
const correoTareas_controller_1 = require("../controllers/correoTareas.controller");
// ✅ Controlador de tareas
const tareas_Controller_1 = require("../controllers/tareas.Controller");
// ✅ Controlador de métricas
const tareasMetricas_controller_1 = require("../controllers/tareasMetricas.controller");
const router = (0, express_1.Router)();
// Multer para subir archivos a tareas
const upload = (0, multer_1.default)();
// Multer para adjuntos en correo
const uploadCorreo = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
});
// =====================
// Rutas de tareas base
// =====================
// RUTs del trabajador
router.get("/mis-ruts", requireAuth_1.requireAuth, tareas_Controller_1.getMisRuts);
// Tareas por RUT
router.get("/por-rut/:rut", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorRut);
// =====================
// Plantillas
// =====================
// Listar plantillas (para el dropdown)
router.get("/plantillas", requireAuth_1.requireAuth, tareas_Controller_1.getPlantillas);
// ✅ Crear plantilla (lo que hace tu botón "Guardar Tarea Plantilla")
router.post("/plantillas", requireAuth_1.requireAuth, tareas_Controller_1.crearPlantilla);
// Tareas por plantilla
router.get("/por-plantilla/:idPlantilla", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorPlantilla);
// =====================
// Asignación masiva desde plantilla
// =====================
// ✅ Crear tareas asignadas (1 o muchas empresas) desde una plantilla existente
router.post("/crear-desde-plantilla", requireAuth_1.requireAuth, tareas_Controller_1.crearTareasDesdePlantilla);
// =====================
// Tareas asignadas (estado / resumen)
// =====================
// Cambiar estado
router.patch("/:id/estado", requireAuth_1.requireAuth, tareas_Controller_1.actualizarEstado);
// Resumen supervisión
router.get("/supervision/resumen", requireAuth_1.requireAuth, tareas_Controller_1.getResumenSupervision);
// Asegurar carpeta Drive para tarea (debug/manual)
router.post("/:id/ensure-drive-folder", requireAuth_1.requireAuth, tareas_Controller_1.ensureDriveFolder);
// Subir archivo a carpeta Drive de la tarea
router.post("/:id/archivos", requireAuth_1.requireAuth, upload.single("archivo"), tareas_Controller_1.subirArchivo);
// =====================
// Métricas de supervisión
// =====================
// Métricas globales / por área / por mes
router.get("/supervision/metricas", requireAuth_1.requireAuth, tareasMetricas_controller_1.getMetricasSupervision);
// Métricas detalladas por agente
router.get("/supervision/metricas/agente/:id", requireAuth_1.requireAuth, tareasMetricas_controller_1.getMetricasAgente);
//estado de tareas "no aplica y editor de ateras"
router.get("/plantillas-con-aplica", tareas_Controller_1.listPlantillasConAplicaPorCliente);
router.patch("/exclusion", tareas_Controller_1.upsertClienteTareaExclusion);
// =====================
// Correo (adjuntos)
// =====================
router.post("/:id/enviar-correo", requireAuth_1.requireAuth, uploadCorreo.array("adjuntos"), correoTareas_controller_1.CorreoTareasController.enviarCorreo);
router.delete("/plantillas/:id", requireAuth_1.requireAuth, tareas_Controller_1.eliminarPlantillaConTareas);
router.get("/asignadas", tareas_Controller_1.getTareasAsignadasPorClienteYTrabajador);
exports.default = router;
