// src/routes/tareas.routes.ts
import { Router } from "express";
import { TareasController } from "../controllers/tareas.Controller"; // 👈 respeta el nombre real del archivo
import { requireAuth } from "../middlewares/requireAuth";
import multer from "multer";

const router = Router();
const upload = multer();

// =============================
//  VISTA EJECUTIVO: tareas propias
// =============================

// GET /api/tareas/mis-ruts
router.get("/mis-ruts", requireAuth, TareasController.getMisRuts);

// GET /api/tareas/por-rut/:rut
router.get("/por-rut/:rut", requireAuth, TareasController.getTareasPorRut);

// GET /api/tareas/plantillas
router.get("/plantillas", requireAuth, TareasController.getPlantillas);

// GET /api/tareas/por-plantilla/:idPlantilla
router.get(
  "/por-plantilla/:idPlantilla",
  requireAuth,
  TareasController.getTareasPorPlantilla
);

// POST /api/tareas/bulk-desde-plantilla
router.post(
  "/bulk-desde-plantilla",
  requireAuth,
  TareasController.crearTareasDesdePlantilla
);

// PATCH /api/tareas/:id/estado
router.patch("/:id/estado", requireAuth, TareasController.actualizarEstado);

// =============================
//  VISTA SUPERVISIÓN / ADMIN
// =============================

// GET /api/tareas/supervision/resumen
router.get(
  "/supervision/resumen",
  requireAuth,
  TareasController.getResumenSupervision
);

// =============================
//  GESTIÓN DE ARCHIVOS / DRIVE
// =============================

// POST /api/tareas/:id/ensure-drive-folder
router.post(
  "/:id/ensure-drive-folder",
  requireAuth,
  TareasController.ensureDriveFolder
);

// POST /api/tareas/:id/archivos  (subida de archivo único)
router.post(
  "/:id/archivos",
  requireAuth,
  upload.single("archivo"), // campo "archivo" en el form-data
  TareasController.subirArchivo
);

export default router;
