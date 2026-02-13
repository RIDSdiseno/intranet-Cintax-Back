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
  crearPlantilla, // ✅ NUEVO: crea plantilla real
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
  getTareasPorRuts,
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
const uploadCorreo = multer({
  storage: multer.memoryStorage(),
});

// =====================
// Rutas de tareas base
// =====================

// RUTs del trabajador
router.get("/mis-ruts", requireAuth, getMisRuts);

// Tareas por RUT
router.get("/por-rut/:rut", requireAuth, getTareasPorRut);

router.post("/por-ruts", requireAuth, getTareasPorRuts);


// =====================
// Plantillas
// =====================

// Listar plantillas (para el dropdown)
router.get("/plantillas", requireAuth, getPlantillas);

// ✅ Crear plantilla (lo que hace tu botón "Guardar Tarea Plantilla")
router.post("/plantillas", requireAuth, crearPlantilla);

// Tareas por plantilla
router.get("/por-plantilla/:idPlantilla", requireAuth, getTareasPorPlantilla);

// =====================
// Asignación masiva desde plantilla
// =====================

// ✅ Crear tareas asignadas (1 o muchas empresas) desde una plantilla existente
router.post("/crear-desde-plantilla", requireAuth, crearTareasDesdePlantilla);

// =====================
// Tareas asignadas (estado / resumen)
// =====================

// Cambiar estado
router.patch("/:id/estado", requireAuth, actualizarEstado);

// Resumen supervisión
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
//estado de tareas "no aplica y editor de ateras"
router.get("/plantillas-con-aplica", listPlantillasConAplicaPorCliente);
router.patch("/exclusion", upsertClienteTareaExclusion);

// =====================
// Correo (adjuntos)
// =====================

router.post(
  "/:id/enviar-correo",
  requireAuth,
  uploadCorreo.array("adjuntos"),
  CorreoTareasController.enviarCorreo
);

router.delete("/plantillas/:id", requireAuth, eliminarPlantillaConTareas);

router.get("/asignadas", getTareasAsignadasPorClienteYTrabajador);

export default router;
