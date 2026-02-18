// src/routes/tareas.routes.ts
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/requireAuth";
import { CorreoTareasController } from "../controllers/correoTareas.controller";

// ✅ Controlador de tareas
import {
  getMisRuts,
  getTareasPorRut,
  getPlantillas,
  crearPlantilla,
  getTareasPorPlantilla,
  crearTareasDesdePlantilla,
  actualizarEstado,
  getResumenSupervision,
  ensureDriveFolder,
  subirArchivo,
  listPlantillasConAplicaPorCliente,
  upsertClienteTareaExclusion,
  eliminarPlantillaConTareas,
  getTareasAsignadasPorClienteYTrabajador,
  getTareasPorRuts, // POST /por-ruts
} from "../controllers/tareas.Controller";

// ✅ Controlador de métricas
import {
  getMetricasSupervision,
  getMetricasAgente,
} from "../controllers/tareasMetricas.controller";

const router = Router();

// Multer para subir archivos a tareas
const upload = multer();

// Multer para adjuntos en correo
const uploadCorreo = multer({ storage: multer.memoryStorage() });

// =====================
// Rutas base de Tareas
// =====================

// RUTs del trabajador (front: /tareas/mis-ruts?trabajadorId=ID)
router.get("/mis-ruts", requireAuth, getMisRuts);

// Tareas por 1 RUT
router.get("/por-rut/:rut", requireAuth, getTareasPorRut);

// ✅ Bulk tareas por lista de ruts (front: POST /tareas/por-ruts)
router.post("/por-ruts", requireAuth, getTareasPorRuts);

// =====================
// Plantillas
// =====================

// Listar plantillas (dropdown)
router.get("/plantillas", requireAuth, getPlantillas);

// Crear plantilla
router.post("/plantillas", requireAuth, crearPlantilla);

// Tareas por plantilla
router.get("/por-plantilla/:idPlantilla", requireAuth, getTareasPorPlantilla);

// Eliminar plantilla con tareas
router.delete("/plantillas/:id", requireAuth, eliminarPlantillaConTareas);

// =====================
// Asignación masiva desde plantilla
// =====================

router.post("/crear-desde-plantilla", requireAuth, crearTareasDesdePlantilla);

// =====================
// Tareas asignadas (estado / archivos / resumen)
// =====================

// Cambiar estado
router.patch("/:id/estado", requireAuth, actualizarEstado);

// Resumen supervisión (front: /tareas/supervision/resumen)
router.get("/supervision/resumen", requireAuth, getResumenSupervision);

// Asegurar carpeta Drive para tarea (debug/manual)
router.post("/:id/ensure-drive-folder", requireAuth, ensureDriveFolder);

// Subir archivo a carpeta Drive de la tarea
router.post("/:id/archivos", requireAuth, upload.single("archivo"), subirArchivo);

// =====================
// Métricas de supervisión
// =====================

// Métricas globales / por área / por mes
router.get("/supervision/metricas", requireAuth, getMetricasSupervision);

// Métricas detalladas por agente
router.get("/supervision/metricas/agente/:id", requireAuth, getMetricasAgente);

// =====================
// Estado "no aplica" + editor de tareas
// (ANTES estaban sin auth → los dejo protegidos)
// =====================

router.get("/plantillas-con-aplica", requireAuth, listPlantillasConAplicaPorCliente);
router.patch("/exclusion", requireAuth, upsertClienteTareaExclusion);

// =====================
// Tareas asignadas por cliente y trabajador
// (ANTES estaba sin auth; normalmente debe ir protegido)
// =====================

router.get("/asignadas", requireAuth, getTareasAsignadasPorClienteYTrabajador);

// =====================
// Correo (adjuntos)
// =====================

router.post(
  "/:id/enviar-correo",
  requireAuth,
  uploadCorreo.array("adjuntos"),
  CorreoTareasController.enviarCorreo
);

export default router;
