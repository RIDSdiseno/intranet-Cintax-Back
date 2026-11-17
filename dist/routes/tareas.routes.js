"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tareas.routes.ts
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const requireAuth_1 = require("../middlewares/requireAuth");
const auth_middleware_1 = require("../middlewares/auth.middleware");
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
const correoTareas_controller_1 = require("../controllers/correoTareas.controller");
// ✅ Controlador de tareas
const tareas_Controller_1 = require("../controllers/tareas.Controller");
// ✅ Supervisor / cierre global por tarea
const tareas_supervision_controller_1 = require("../controllers/tareas.supervision.controller");
// ✅ Masivo manual (controller aparte, con debug en 400)
const tareas_masivo_controller_1 = require("../controllers/tareas.masivo.controller");
// ✅ Carga masiva desde Excel (crea cliente/plantilla si no existe)
const tareas_masivo_excel_controller_1 = require("../controllers/tareas.masivo.excel.controller");
// ✅ Controlador de métricas
const tareasMetricas_controller_1 = require("../controllers/tareasMetricas.controller");
const router = (0, express_1.Router)();
// =====================
// Multer configs
// =====================
const memoryStorage = multer_1.default.memoryStorage();
// Para subir archivos a tareas (Drive)
const upload = (0, multer_1.default)({ storage: memoryStorage });
// Para adjuntos en correo
const uploadCorreo = (0, multer_1.default)({ storage: memoryStorage });
// ✅ Excel masivo
const uploadExcel = (0, multer_1.default)({
    storage: memoryStorage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (_req, file, cb) => {
        const ok = file.mimetype ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            file.mimetype === "application/vnd.ms-excel";
        if (!ok)
            return cb(new Error("Archivo inválido. Debe ser .xlsx (o .xls)."));
        cb(null, true);
    },
});
// =====================
// Rutas base de Tareas
// =====================
// RUTs del trabajador (front: /tareas/mis-ruts?trabajadorId=ID)
router.get("/mis-ruts", requireAuth_1.requireAuth, tareas_Controller_1.getMisRuts);
// Tareas por 1 RUT
router.get("/por-rut/:rut", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorRut);
// ✅ Bulk tareas por lista de ruts (front: POST /tareas/por-ruts)
router.post("/por-ruts", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorRuts);
// =====================
// Plantillas
// =====================
// Listar plantillas (dropdown)
router.get("/plantillas", requireAuth_1.requireAuth, tareas_Controller_1.getPlantillas);
// Crear plantilla
router.post("/plantillas", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_Controller_1.crearPlantilla);
// Ruta original de tareas por plantilla
router.get("/por-plantilla/:idPlantilla", requireAuth_1.requireAuth, tareas_Controller_1.getTareasPorPlantilla);
// ✅ NUEVO: versión supervisión/global por plantilla
// front sugerido: GET /tareas/supervision/por-plantilla/:idPlantilla?anio=2026&mes=3&trabajadorId=...&rutCliente=...
router.get("/supervision/por-plantilla/:idPlantilla", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_supervision_controller_1.getTareasPorPlantillaSupervision);
// Eliminar plantilla con tareas
// Borra la plantilla y, con ella, todas sus tareas asignadas, notificaciones
// y exclusiones. Es la ruta mas destructiva del modulo.
router.delete("/plantillas/:id", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_Controller_1.eliminarPlantillaConTareas);
// =====================
// Asignación masiva desde plantilla
// =====================
// ✅ Ruta existente (la que ya usa tu front hoy)
router.post("/crear-desde-plantilla", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_Controller_1.crearTareasDesdePlantilla);
// ✅ NUEVO: masivo "directo" (tu controller createMany)
router.post("/masivo/crear-desde-plantilla", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_masivo_controller_1.crearDesdePlantillaMasivo);
// ✅ NUEVO: versión "SAFE" (reprograma si existe + debug en 400)
router.post("/masivo/crear-desde-plantilla-safe", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_masivo_controller_1.crearDesdePlantillaMasivoSafe);
// =====================
// ✅ NUEVO: reasignar cliente + recalcular codigoCartera + mover tareas
// POST /tareas/masivo/reasignar-cliente
// body: { rutCliente, agenteId, moveAllTasks?, includeVencida? }
// =====================
// La operacion equivalente en clientes (`PATCH /api/clientes/:id/asignar-agente`)
// ya exige supervisor. Sin este guard, esta ruta la rodeaba.
router.post("/masivo/reasignar-cliente", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_masivo_controller_1.reasignarClienteYTransferirTareas);
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
router.post("/masivo/excel", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, uploadExcel.single("archivo"), tareas_masivo_excel_controller_1.cargarTareasDesdeExcel);
// =====================
// Tareas asignadas (estado / archivos / resumen)
// =====================
// Cambiar estado
router.patch("/:id/estado", requireAuth_1.requireAuth, tareas_Controller_1.actualizarEstado);
// Resumen supervisión (front: /tareas/supervision/resumen)
router.get("/supervision/resumen", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_Controller_1.getResumenSupervision);
// ✅ NUEVO: completar/cerrar tareas como supervisor
router.post("/supervision/completar", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_supervision_controller_1.completarTareasComoSupervisor);
// ✅ NUEVO: desactivar tareas como supervisor
router.patch("/supervision/desactivar", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_Controller_1.desactivarTareasSupervision);
// Asegurar carpeta Drive para tarea (debug/manual)
router.post("/:id/ensure-drive-folder", requireAuth_1.requireAuth, tareas_Controller_1.ensureDriveFolder);
// Subir archivo a carpeta Drive de la tarea
router.post("/:id/archivos", requireAuth_1.requireAuth, upload.single("archivo"), tareas_Controller_1.subirArchivo);
// =====================
// Métricas de supervisión
// =====================
// Métricas globales / por área / por mes
router.get("/supervision/metricas", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareasMetricas_controller_1.getMetricasSupervision);
// Métricas detalladas por agente
router.get("/supervision/metricas/agente/:id", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareasMetricas_controller_1.getMetricasAgente);
// =====================
// Estado "no aplica" + editor de tareas
// =====================
router.get("/plantillas-con-aplica", requireAuth_1.requireAuth, tareas_Controller_1.listPlantillasConAplicaPorCliente);
router.patch("/exclusion", requireAuth_1.requireAuth, tareas_Controller_1.upsertClienteTareaExclusion);
// =====================
// Tareas asignadas por cliente y trabajador
// =====================
router.get("/asignadas", requireAuth_1.requireAuth, tareas_Controller_1.getTareasAsignadasPorClienteYTrabajador);
// =====================
// Correo (adjuntos)
// =====================
router.post("/:id/enviar-correo", requireAuth_1.requireAuth, uploadCorreo.array("adjuntos"), correoTareas_controller_1.CorreoTareasController.enviarCorreo);
router.patch("/supervision/reactivar", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_Controller_1.reactivarTareasSupervision);
router.post("/desactivadas", requireAuth_1.requireAuth, auth_middleware_1.requireSupervisorOrAdmin, tareas_Controller_1.getTareasDesactivadas);
exports.default = router;
//# sourceMappingURL=tareas.routes.js.map