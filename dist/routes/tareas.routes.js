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
const uploadCorreo = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// =====================
// Rutas base de Tareas
// =====================
// RUTs del trabajador (front: /tareas/mis-ruts?trabajadorId=ID)
router.get("/mis-ruts", requireAuth_1.requireAuth, tareas_Controller_1.getMisRuts);
// Tareas por 1 RUT
router.get("/por-rut/:rut", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorRut);
// ✅ Bulk tareas por lista de ruts (front: POST /tareas/por-ruts)
router.post("/por-ruts", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorRuts);
// =====================
// Plantillas
// =====================
// Listar plantillas (dropdown)
router.get("/plantillas", requireAuth_1.requireAuth, tareas_Controller_1.getPlantillas);
// Crear plantilla
router.post("/plantillas", requireAuth_1.requireAuth, tareas_Controller_1.crearPlantilla);
// Tareas por plantilla
router.get("/por-plantilla/:idPlantilla", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorPlantilla);
// Eliminar plantilla con tareas
router.delete("/plantillas/:id", requireAuth_1.requireAuth, tareas_Controller_1.eliminarPlantillaConTareas);
// =====================
// Asignación masiva desde plantilla
// =====================
router.post("/crear-desde-plantilla", requireAuth_1.requireAuth, tareas_Controller_1.crearTareasDesdePlantilla);
// =====================
// Tareas asignadas (estado / archivos / resumen)
// =====================
// Cambiar estado
router.patch("/:id/estado", requireAuth_1.requireAuth, tareas_Controller_1.actualizarEstado);
// Resumen supervisión (front: /tareas/supervision/resumen)
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
// =====================
// Estado "no aplica" + editor de tareas
// (ANTES estaban sin auth → los dejo protegidos)
// =====================
router.get("/plantillas-con-aplica", requireAuth_1.requireAuth, tareas_Controller_1.listPlantillasConAplicaPorCliente);
router.patch("/exclusion", requireAuth_1.requireAuth, tareas_Controller_1.upsertClienteTareaExclusion);
// =====================
// Tareas asignadas por cliente y trabajador
// (ANTES estaba sin auth; normalmente debe ir protegido)
// =====================
router.get("/asignadas", requireAuth_1.requireAuth, tareas_Controller_1.getTareasAsignadasPorClienteYTrabajador);
// =====================
// Correo (adjuntos)
// =====================
router.post("/:id/enviar-correo", requireAuth_1.requireAuth, uploadCorreo.array("adjuntos"), correoTareas_controller_1.CorreoTareasController.enviarCorreo);
exports.default = router;
