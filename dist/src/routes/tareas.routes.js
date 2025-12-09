"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tareas.routes.ts
const express_1 = require("express");
const tareas_Controller_1 = require("../controllers/tareas.Controller"); // 👈 ahora importamos funciones
const requireAuth_1 = require("../middlewares/requireAuth");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)();
// =============================
//  VISTA EJECUTIVO: tareas propias
// =============================
// GET /api/tareas/mis-ruts
router.get("/mis-ruts", requireAuth_1.requireAuth, tareas_Controller_1.getMisRuts);
// GET /api/tareas/por-rut/:rut
router.get("/por-rut/:rut", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorRut);
// GET /api/tareas/plantillas
router.get("/plantillas", requireAuth_1.requireAuth, tareas_Controller_1.getPlantillas);
// GET /api/tareas/por-plantilla/:idPlantilla
router.get("/por-plantilla/:idPlantilla", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorPlantilla);
// POST /api/tareas/bulk-desde-plantilla
router.post("/bulk-desde-plantilla", requireAuth_1.requireAuth, tareas_Controller_1.crearTareasDesdePlantilla);
// PATCH /api/tareas/:id/estado
router.patch("/:id/estado", requireAuth_1.requireAuth, tareas_Controller_1.actualizarEstado);
// =============================
//  VISTA SUPERVISIÓN / ADMIN
// =============================
// GET /api/tareas/supervision/resumen
router.get("/supervision/resumen", requireAuth_1.requireAuth, tareas_Controller_1.getResumenSupervision);
// =============================
//  GESTIÓN DE ARCHIVOS / DRIVE
// =============================
// POST /api/tareas/:id/ensure-drive-folder
router.post("/:id/ensure-drive-folder", requireAuth_1.requireAuth, tareas_Controller_1.ensureDriveFolder);
// POST /api/tareas/:id/archivos  (subida de archivo único)
router.post("/:id/archivos", requireAuth_1.requireAuth, upload.single("archivo"), // campo "archivo" en el form-data
tareas_Controller_1.subirArchivo);
exports.default = router;
