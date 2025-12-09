// src/routes/tareas.routes.ts
import { Router } from "express";
import {
  getMisRuts,
  getTareasPorRut,
  getPlantillas,
  getTareasPorPlantilla,
  crearTareasDesdePlantilla,
  actualizarEstado,
  getResumenSupervision,
  ensureDriveFolder,
  subirArchivo,
} from "../controllers/tareas.Controller"; // 👈 ahora importamos funciones
import { requireAuth } from "../middlewares/requireAuth";
import multer from "multer";

const router = Router();
const upload = multer();

// =============================
//  VISTA EJECUTIVO: tareas propias
// =============================

// GET /api/tareas/mis-ruts
router.get("/mis-ruts", requireAuth, getMisRuts);

// GET /api/tareas/por-rut/:rut
router.get("/por-rut/:rut", requireAuth, getTareasPorRut);

// GET /api/tareas/plantillas
router.get("/plantillas", requireAuth, getPlantillas);

// GET /api/tareas/por-plantilla/:idPlantilla
router.get(
  "/por-plantilla/:idPlantilla",
  requireAuth,
  getTareasPorPlantilla
);

// POST /api/tareas/bulk-desde-plantilla
router.post(
  "/bulk-desde-plantilla",
  requireAuth,
  crearTareasDesdePlantilla
);

// PATCH /api/tareas/:id/estado
router.patch("/:id/estado", requireAuth, actualizarEstado);

// =============================
//  VISTA SUPERVISIÓN / ADMIN
// =============================

// GET /api/tareas/supervision/resumen
router.get(
  "/supervision/resumen",
  requireAuth,
  getResumenSupervision
);

// =============================
//  GESTIÓN DE ARCHIVOS / DRIVE
// =============================

// POST /api/tareas/:id/ensure-drive-folder
router.post(
  "/:id/ensure-drive-folder",
  requireAuth,
  ensureDriveFolder
);

// POST /api/tareas/:id/archivos  (subida de archivo único)
router.post(
  "/:id/archivos",
  requireAuth,
  upload.single("archivo"), // campo "archivo" en el form-data
  subirArchivo
);

export default router;
