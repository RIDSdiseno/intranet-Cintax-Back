// src/routes/tareas.routes.ts
import { Router } from "express";
import { TareasController } from "../controllers/tareas.Controller"; // 👈 ojo en el nombre del archivo
import { requireAuth } from "../middlewares/requireAuth";
import multer from "multer";

const router = Router();
const upload = multer();

// VISTA EJECUTIVO: tareas propias
router.get("/mis-ruts", requireAuth, TareasController.getMisRuts);
router.get("/por-rut/:rut", requireAuth, TareasController.getTareasPorRut);
router.get("/plantillas", requireAuth, TareasController.getPlantillas);
router.get(
  "/por-plantilla/:idPlantilla",
  requireAuth,
  TareasController.getTareasPorPlantilla
);
router.post(
  "/bulk-desde-plantilla",
  requireAuth,
  TareasController.crearTareasDesdePlantilla
);
router.patch("/:id/estado", requireAuth, TareasController.actualizarEstado);

// 🔎 NUEVA VISTA SUPERVISIÓN / ADMIN
// GET /api/tareas/supervision/resumen
router.get(
  "/supervision/resumen",
  requireAuth,
  TareasController.getResumenSupervision
);

router.post(
  "/:id/ensure-drive-folder",
  requireAuth,
  TareasController.ensureDriveFolder
);

router.post(
  "/:id/archivos",
  requireAuth,
  upload.single("archivo"), // campo "archivo" en el form-data
  TareasController.subirArchivo
);

export default router;
