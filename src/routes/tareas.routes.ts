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
} from "../controllers/tareas.Controller";
import { requireAuth } from "../middlewares/requireAuth";
import multer from "multer";

const router = Router();
const upload = multer();

router.get("/mis-ruts", requireAuth, getMisRuts);
router.get("/por-rut/:rut", requireAuth, getTareasPorRut);
router.get("/plantillas", requireAuth, getPlantillas);
router.get("/por-plantilla/:idPlantilla", requireAuth, getTareasPorPlantilla);
router.post("/bulk-desde-plantilla", requireAuth, crearTareasDesdePlantilla);
router.patch("/:id/estado", requireAuth, actualizarEstado);
router.get("/supervision/resumen", requireAuth, getResumenSupervision);
router.post("/:id/ensure-drive-folder", requireAuth, ensureDriveFolder);
router.post(
  "/:id/archivos",
  requireAuth,
  upload.single("archivo"),
  subirArchivo
);

export default router;
