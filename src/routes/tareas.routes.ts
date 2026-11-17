// src/routes/tareas.routes.ts
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/requireAuth";
import { requireSupervisorOrAdmin } from "../middlewares/auth.middleware";

// `requireSupervisorOrAdmin` va en las rutas administrativas: plantillas,
// creacion masiva, supervision y metricas. Hasta ahora todas pedian solo
// `requireAuth`, asi que cualquier trabajador con sesion podia llamarlas a
// mano —borrar una plantilla con todas sus tareas, reasignar clientes, leer
// las metricas de la empresa— aunque el front le escondiera la pantalla.
//
// La regla no es nueva: `/supervisor`, `/cierre-tareas` y `/task-assignment`
// ya estan tras `SupervisorRoute` en el front. Lo que faltaba era que el
// servidor la aplicara, porque esconder un boton no impide llamar a la URL.
//
// El guard acepta a los mismos que `SupervisorRoute` (rol ADMIN o SUPERVISOR,
// o el flag `isSupervisorOrAdmin`, que sale de SUPERVISOR_OR_ADMIN_EMAILS),
// asi que nadie que hoy pueda abrir la pantalla recibe un 403.
//
// **No lo llevan las rutas que usa un agente normal** desde `/tareas`:
// `mis-ruts`, `por-rut`, `por-plantilla`, el GET de `plantillas` y el cambio
// de estado. Ahi el problema es otro —que el id o el `trabajadorId` que
// manda el cliente no se comprueba contra el dueno— y se arregla dentro del
// controlador, no con un guard.
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
  getTareasPorRuts,
  desactivarTareasSupervision,
  getTareasDesactivadas,
  reactivarTareasSupervision,
} from "../controllers/tareas.Controller";

// ✅ Supervisor / cierre global por tarea
import {
  completarTareasComoSupervisor,
  getTareasPorPlantillaSupervision,
} from "../controllers/tareas.supervision.controller";

// ✅ Masivo manual (controller aparte, con debug en 400)
import {
  crearDesdePlantillaMasivo,
  crearDesdePlantillaMasivoSafe,
  reasignarClienteYTransferirTareas,
} from "../controllers/tareas.masivo.controller";

// ✅ Carga masiva desde Excel (crea cliente/plantilla si no existe)
import { cargarTareasDesdeExcel } from "../controllers/tareas.masivo.excel.controller";

// ✅ Controlador de métricas
import {
  getMetricasSupervision,
  getMetricasAgente,
} from "../controllers/tareasMetricas.controller";

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
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel";
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
router.post("/plantillas", requireAuth, requireSupervisorOrAdmin, crearPlantilla);

// Ruta original de tareas por plantilla
router.get("/por-plantilla/:idPlantilla", requireAuth, getTareasPorPlantilla);

// ✅ NUEVO: versión supervisión/global por plantilla
// front sugerido: GET /tareas/supervision/por-plantilla/:idPlantilla?anio=2026&mes=3&trabajadorId=...&rutCliente=...
router.get(
  "/supervision/por-plantilla/:idPlantilla",
  requireAuth,
  requireSupervisorOrAdmin,
  getTareasPorPlantillaSupervision
);

// Eliminar plantilla con tareas
// Borra la plantilla y, con ella, todas sus tareas asignadas, notificaciones
// y exclusiones. Es la ruta mas destructiva del modulo.
router.delete(
  "/plantillas/:id",
  requireAuth,
  requireSupervisorOrAdmin,
  eliminarPlantillaConTareas
);

// =====================
// Asignación masiva desde plantilla
// =====================

// ✅ Ruta existente (la que ya usa tu front hoy)
router.post(
  "/crear-desde-plantilla",
  requireAuth,
  requireSupervisorOrAdmin,
  crearTareasDesdePlantilla
);

// ✅ NUEVO: masivo "directo" (tu controller createMany)
router.post(
  "/masivo/crear-desde-plantilla",
  requireAuth,
  requireSupervisorOrAdmin,
  crearDesdePlantillaMasivo
);

// ✅ NUEVO: versión "SAFE" (reprograma si existe + debug en 400)
router.post(
  "/masivo/crear-desde-plantilla-safe",
  requireAuth,
  requireSupervisorOrAdmin,
  crearDesdePlantillaMasivoSafe
);

// =====================
// ✅ NUEVO: reasignar cliente + recalcular codigoCartera + mover tareas
// POST /tareas/masivo/reasignar-cliente
// body: { rutCliente, agenteId, moveAllTasks?, includeVencida? }
// =====================
// La operacion equivalente en clientes (`PATCH /api/clientes/:id/asignar-agente`)
// ya exige supervisor. Sin este guard, esta ruta la rodeaba.
router.post(
  "/masivo/reasignar-cliente",
  requireAuth,
  requireSupervisorOrAdmin,
  reasignarClienteYTransferirTareas
);

// =====================
// ✅ Masivo desde Excel
// POST /tareas/masivo/excel
// form-data: archivo=<xlsx>
//
// Query opcional:
// - ?skipDuplicates=true|false            (default true)
// - ?fechaProgramada=YYYY-MM-DD          (default si la fila no trae fecha)
// - ?agenteId=123                        (default para clientes nuevos o sin agenteId)
// - ?agenteEmail=correo@dominio.cl       (recomendado)
// - ?forceUpdateClienteAgente=true|false (default false)
// =====================

router.post(
  "/masivo/excel",
  requireAuth,
  requireSupervisorOrAdmin,
  uploadExcel.single("archivo"),
  cargarTareasDesdeExcel
);

// =====================
// Tareas asignadas (estado / archivos / resumen)
// =====================

// Cambiar estado
router.patch("/:id/estado", requireAuth, actualizarEstado);

// Resumen supervisión (front: /tareas/supervision/resumen)
router.get(
  "/supervision/resumen",
  requireAuth,
  requireSupervisorOrAdmin,
  getResumenSupervision
);

// ✅ NUEVO: completar/cerrar tareas como supervisor
router.post(
  "/supervision/completar",
  requireAuth,
  requireSupervisorOrAdmin,
  completarTareasComoSupervisor
);

// ✅ NUEVO: desactivar tareas como supervisor
router.patch(
  "/supervision/desactivar",
  requireAuth,
  requireSupervisorOrAdmin,
  desactivarTareasSupervision
);

// Asegurar carpeta Drive para tarea (debug/manual)
router.post("/:id/ensure-drive-folder", requireAuth, ensureDriveFolder);

// Subir archivo a carpeta Drive de la tarea
router.post("/:id/archivos", requireAuth, upload.single("archivo"), subirArchivo);

// =====================
// Métricas de supervisión
// =====================

// Métricas globales / por área / por mes
router.get(
  "/supervision/metricas",
  requireAuth,
  requireSupervisorOrAdmin,
  getMetricasSupervision
);

// Métricas detalladas por agente
router.get(
  "/supervision/metricas/agente/:id",
  requireAuth,
  requireSupervisorOrAdmin,
  getMetricasAgente
);

// =====================
// Estado "no aplica" + editor de tareas
// =====================

router.get(
  "/plantillas-con-aplica",
  requireAuth,
  listPlantillasConAplicaPorCliente
);
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

router.patch(
  "/supervision/reactivar",
  requireAuth,
  requireSupervisorOrAdmin,
  reactivarTareasSupervision
);

router.post(
  "/desactivadas",
  requireAuth,
  requireSupervisorOrAdmin,
  getTareasDesactivadas
);

export default router;