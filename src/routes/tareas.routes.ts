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
import { CorreoTareasController } from "../controllers/correoTareas.controller";

// 👇 importa las funciones del controlador de métricas
import {
  getMetricasSupervision,
  getMetricasAgente,
} from "../controllers/tareasMetricas.controller";

const uploadCorreo = multer({
  storage: multer.memoryStorage(),
});

const router = Router();
const upload = multer();

// =====================
// Rutas de tareas base
// =====================
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

// =====================
// Rutas de métricas de supervisión
// =====================

// Métricas globales / por área / por mes
router.get("/supervision/metricas", requireAuth, getMetricasSupervision);

// Métricas detalladas por agente
router.get(
  "/supervision/metricas/agente/:id",
  requireAuth,
  getMetricasAgente
);


router.post(
  "/:id/enviar-correo",
  requireAuth,
  uploadCorreo.array("adjuntos"), // 👈 ahora escucha "adjuntos"
  CorreoTareasController.enviarCorreo
);



export default router;
