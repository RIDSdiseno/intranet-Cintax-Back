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

// ✅ NUEVO: carga masiva desde Excel (crea cliente/plantilla si no existe)
import { cargarTareasDesdeExcel } from "../controllers/tareas.masivo.excel.controller";

// ✅ Controlador de métricas
import { getMetricasSupervision, getMetricasAgente } from "../controllers/tareasMetricas.controller";

const router = Router();

// =====================
// Multer configs
// =====================

const memoryStorage = multer.memoryStorage();

// Para subir archivos a tareas (Drive)
const upload = multer({ storage: memoryStorage });

// Para adjuntos en correo
const uploadCorreo = multer({ storage: memoryStorage });

// ✅ Excel masivo
const uploadExcel = multer({
  storage: memoryStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || // .xlsx
      file.mimetype === "application/vnd.ms-excel"; // .xls (por si acaso)
    if (!ok) return cb(new Error("Archivo inválido. Debe ser .xlsx (o .xls)."));
    cb(null, true);
  },
});

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
// Asignación masiva desde plantilla (manual, 1 trabajador para todos)
// =====================

router.post("/crear-desde-plantilla", requireAuth, crearTareasDesdePlantilla);

// =====================
// ✅ Masivo desde Excel
// POST /tareas/masivo/excel
// form-data: archivo=<xlsx>
//
// Query opcional:
// - ?skipDuplicates=true|false            (default true)
// - ?fechaProgramada=YYYY-MM-DD          (default si la fila no trae fecha)
// - ?agenteId=123                        (default para clientes nuevos o sin agenteId)
//
// Columnas Excel aceptadas (case-insensitive):
// - rut / RUT
// - fechaProgramada / fecha / vencimiento   (o usar query fechaProgramada)
// - plantillaIds / plantillas / plantillaId (IDs: "81,82,83")
//   o
// - tarea / tareas / plantillaNombre / plantilla (nombres: "Declaración IVA; Libro compras")
// - razonSocial / empresa (recomendado para crear cliente)
// - agenteId / trabajadorId (opcional)
// =====================

router.post("/masivo/excel", requireAuth, uploadExcel.single("archivo"), cargarTareasDesdeExcel);

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
// =====================

router.get("/plantillas-con-aplica", requireAuth, listPlantillasConAplicaPorCliente);
router.patch("/exclusion", requireAuth, upsertClienteTareaExclusion);

// =====================
// Tareas asignadas por cliente y trabajador
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
