"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
// src/app.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const routes_js_1 = __importDefault(require("./routes.js"));
const trabajador_routes_1 = __importDefault(require("./routes/trabajador.routes"));
const tareas_routes_1 = __importDefault(require("./routes/tareas.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const error_middleware_js_1 = require("./middlewares/error.middleware.js");
require("dotenv/config");
const googleDrive_1 = require("./services/googleDrive");
const notificaciones_routes_1 = __importDefault(require("./routes/notificaciones.routes"));
const notificaciones_service_1 = require("./services/notificaciones.service");
const node_cron_1 = __importDefault(require("node-cron"));
const date_fns_1 = require("date-fns");
const prisma_1 = require("./lib/prisma");
const client_1 = require("@prisma/client");
const auth_controller_1 = require("./controllers/auth.controller");
// ✅ NUEVO JOB (día 30 -> genera mes siguiente)
const generarTareasMesSiguiente_1 = require("./jobs/generarTareasMesSiguiente");
const tareas_masivo_routes_1 = __importDefault(require("./routes/tareas-masivo.routes"));
// 👇 SUPER IMPORTANTE: log de versión
console.log("⚙️ [APP] Cargando app.ts **CINTAX TAREAS V5**");
exports.app = (0, express_1.default)();
// (opcional pero recomendado en prod detrás de proxy / render / railway / etc)
exports.app.set("trust proxy", 1);
const ENABLE_TASK_CRON = process.env.ENABLE_TASK_CRON === "true";
const ENABLE_GROUPS_CRON = process.env.ENABLE_GROUPS_CRON === "true";
const ENABLE_NOTI_CRON = process.env.ENABLE_NOTI_CRON !== "false"; // default true
const allowedOrigins = new Set((process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean));
const corsCredentials = String(process.env.CORS_CREDENTIALS ?? process.env.AUTH_COOKIE ?? "false") ===
    "true";
const corsForbiddenError = Object.assign(new Error("Not allowed by CORS"), {
    status: 403,
});
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.has(origin))
            return callback(null, true);
        return callback(corsForbiddenError);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: corsCredentials,
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
};
exports.app.use((0, cors_1.default)(corsOptions));
exports.app.options(/^\/api\/.*$/, (0, cors_1.default)(corsOptions));
exports.app.use((0, cookie_parser_1.default)());
exports.app.use(express_1.default.json({ limit: "20mb" }));
exports.app.use((0, morgan_1.default)("dev"));
// 🔍 Ruta de debug de versión
exports.app.get("/api/debug-version", (_req, res) => {
    res.json({ ok: true, version: "cintax-tareas-v5" });
});
// =============================
// RUTAS API
// =============================
// ✅ Si tu routes.js tiene /auth, /clientes, etc.
exports.app.use("/api", routes_js_1.default);
// ✅ Trabajadores (incluye GET /trabajadores y PATCH /trabajadores/:id)
//    (internamente el router ya tiene authGuard / requireSupervisorOrAdmin)
exports.app.use("/api", trabajador_routes_1.default);
// ✅ Tareas
exports.app.use("/api/tareas", tareas_routes_1.default);
// ✅ Dashboard
exports.app.use("/api/dashboard", dashboard_routes_1.default);
// ✅ Notificaciones
exports.app.use("/api/notificaciones", notificaciones_routes_1.default);
exports.app.use("/api/tareas", tareas_masivo_routes_1.default);
// Debug cookies (útil)
exports.app.get("/debug/cookies", (req, res) => res.json({ cookies: req.cookies }));
// Auth Drive admin (mantener igual)
exports.app.get("/admin/drive/auth-url", (_req, res) => {
    const url = googleDrive_1.oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/drive"],
        state: "admin",
    });
    res.send(`<a href="${url}">Conectar admin Cintax</a>`);
});
// =============================
//  ENDPOINT DE PRUEBA AVANZADO
// =============================
exports.app.get("/debug/test-notificaciones", async (_req, res) => {
    const TEST_EMAIL = "test-notificaciones@cintax.cl";
    const logs = [];
    const log = (message) => {
        console.log(`[TEST-NOTI] ${message}`);
        logs.push(`[TEST-NOTI] ${message}`);
    };
    try {
        log("🧪 Iniciando prueba avanzada de notificaciones...");
        // 1) OBTENER O CREAR TRABAJADOR DE PRUEBA
        const trabajador = await prisma_1.prisma.trabajador.upsert({
            where: { email: TEST_EMAIL },
            update: {},
            create: {
                nombre: "Trabajador Prueba Notificaciones",
                email: TEST_EMAIL,
                status: true,
            },
        });
        log(`Trabajador de prueba (ID: ${trabajador.id_trabajador}) listo.`);
        // 2) LIMPIAR DATOS DE PRUEBAS ANTERIORES
        const deletedNotis = await prisma_1.prisma.notificacion.deleteMany({
            where: { trabajadorId: trabajador.id_trabajador },
        });
        log(`Limpiadas ${deletedNotis.count} notificaciones antiguas.`);
        const deletedTareas = await prisma_1.prisma.tareaAsignada.deleteMany({
            where: {
                trabajadorId: trabajador.id_trabajador,
                tareaPlantilla: { nombre: { startsWith: "[TEST]" } },
            },
        });
        log(`Limpiadas ${deletedTareas.count} tareas de prueba antiguas.`);
        // 3) CREAR PLANTILLAS DE TAREA
        async function ensureTestPlantilla(nombre, detalle) {
            let plantilla = await prisma_1.prisma.tareaPlantilla.findFirst({
                where: { nombre },
            });
            if (!plantilla) {
                plantilla = await prisma_1.prisma.tareaPlantilla.create({
                    data: {
                        nombre,
                        detalle,
                        area: client_1.Area.CONTA,
                        frecuencia: client_1.FrecuenciaTarea.UNICA,
                        presentacion: client_1.Presentacion.INTERNO,
                    },
                });
            }
            return plantilla;
        }
        const plantillaVencida = await ensureTestPlantilla("[TEST] Tarea Vencida", "Vencida");
        const plantillaHoy = await ensureTestPlantilla("[TEST] Tarea para Hoy", "Hoy");
        const plantillaFutura = await ensureTestPlantilla("[TEST] Tarea Futura", "Futura");
        log("Plantillas de prueba listas.");
        // 4) CREAR TAREAS CON DISTINTAS FECHAS
        const hoy = new Date();
        const tareaVencida = await prisma_1.prisma.tareaAsignada.create({
            data: {
                tareaPlantillaId: plantillaVencida.id_tarea_plantilla,
                trabajadorId: trabajador.id_trabajador,
                estado: client_1.EstadoTarea.PENDIENTE,
                fechaProgramada: (0, date_fns_1.subDays)(hoy, 2),
            },
        });
        log(`Creada TAREA VENCIDA (ID: ${tareaVencida.id_tarea_asignada}) con fecha ${tareaVencida.fechaProgramada.toISOString()}`);
        const tareaHoy = await prisma_1.prisma.tareaAsignada.create({
            data: {
                tareaPlantillaId: plantillaHoy.id_tarea_plantilla,
                trabajadorId: trabajador.id_trabajador,
                estado: client_1.EstadoTarea.PENDIENTE,
                fechaProgramada: hoy,
            },
        });
        log(`Creada TAREA PARA HOY (ID: ${tareaHoy.id_tarea_asignada}) con fecha ${tareaHoy.fechaProgramada.toISOString()}`);
        const tareaFutura = await prisma_1.prisma.tareaAsignada.create({
            data: {
                tareaPlantillaId: plantillaFutura.id_tarea_plantilla,
                trabajadorId: trabajador.id_trabajador,
                estado: client_1.EstadoTarea.PENDIENTE,
                fechaProgramada: (0, date_fns_1.addDays)(hoy, 5),
            },
        });
        log(`Creada TAREA FUTURA (ID: ${tareaFutura.id_tarea_asignada}) con fecha ${tareaFutura.fechaProgramada.toISOString()} (NO debería generar notificación)`);
        // 5) EJECUTAR NOTIFICACIONES
        logs.push("\n[TEST-NOTI] ==================================================");
        log("Ejecutando 'generarNotificacionesDeVencimiento'...");
        await (0, notificaciones_service_1.generarNotificacionesDeVencimiento)();
        log("Servicio de notificaciones finalizado.");
        logs.push("[TEST-NOTI] ==================================================\n");
        // 6) VERIFICAR RESULTADOS
        const notificacionesGeneradas = await prisma_1.prisma.notificacion.findMany({
            where: { trabajadorId: trabajador.id_trabajador },
            orderBy: { createdAt: "asc" },
        });
        log(`Se encontraron ${notificacionesGeneradas.length} notificaciones en la BD.`);
        if (notificacionesGeneradas.length > 0) {
            logs.push("Notificaciones generadas:");
            notificacionesGeneradas.forEach((n) => logs.push(`  - ID: ${n.id}, Mensaje: "${n.mensaje}"`));
        }
        else {
            logs.push("ADVERTENCIA: No se generó ninguna notificación.");
        }
        // 7) SEGUNDA EJECUCIÓN PARA DUPLICADOS
        logs.push("\n[TEST-NOTI] ==================================================");
        log("Ejecutando servicio por SEGUNDA VEZ (anti-duplicados)...");
        await (0, notificaciones_service_1.generarNotificacionesDeVencimiento)();
        log("Segunda ejecución finalizada.");
        logs.push("[TEST-NOTI] ==================================================\n");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.status(200).send(logs.join("\n"));
    }
    catch (error) {
        const errorMessage = error.message;
        log(`💥 ERROR: ${errorMessage}`);
        console.error("💥 [TEST-NOTI] Error durante la prueba:", error);
        if (!res.headersSent)
            res.status(500).json({ ok: false, error: errorMessage, logs });
        else
            res.end(`\n💥 ERROR: ${errorMessage}\n`);
    }
});
// ======================================================
// ✅ ENDPOINT MANUAL: genera tareas MES SIGUIENTE
// - default: solo corre si corresponde (día 30 o último)
// - force=true: forzar ejecución como si fuera día 30
// ======================================================
exports.app.post("/api/tareas/generar-mes-siguiente", async (req, res) => {
    try {
        const force = String(req.query.force ?? "") === "true";
        if (force) {
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth(); // 0-11
            const lastDay = new Date(y, m + 1, 0).getDate();
            const day = lastDay >= 30 ? 30 : lastDay;
            const fake = new Date(y, m, day, now.getHours(), now.getMinutes(), 0, 0);
            const out = await (0, generarTareasMesSiguiente_1.generarTareasMesSiguiente)(fake);
            return res.json({ ok: true, forced: true, ...out });
        }
        const out = await (0, generarTareasMesSiguiente_1.generarTareasMesSiguiente)(new Date());
        return res.json({ ok: true, forced: false, ...out });
    }
    catch (e) {
        console.error("Error generando tareas (mes siguiente)", e);
        return res.status(500).json({ ok: false });
    }
});
// ======================================================
// ✅ CRON TAREAS: corre TODOS los días (02:05)
// pero el job decide si corresponde (día 30 / último día)
// ======================================================
if (ENABLE_TASK_CRON) {
    node_cron_1.default.schedule("5 2 * * *", async () => {
        try {
            console.log("[CRON] Tick: generar tareas mes siguiente (si corresponde)...");
            const out = await (0, generarTareasMesSiguiente_1.generarTareasMesSiguiente)(new Date());
            console.log("[CRON] OK:", out);
        }
        catch (e) {
            console.error("[CRON] Error generando tareas mes siguiente:", e);
        }
    });
}
// ======================================================
// ✅ CRON NOTIFICACIONES: cada 5 minutos
// ======================================================
if (ENABLE_NOTI_CRON) {
    node_cron_1.default.schedule("*/5 * * * *", async () => {
        try {
            console.log("[CRON] Generando notificaciones de vencimiento...");
            await (0, notificaciones_service_1.generarNotificacionesDeVencimiento)();
            console.log("[CRON] OK notificaciones generadas");
        }
        catch (e) {
            console.error("[CRON] Error generando notificaciones de vencimiento:", e);
        }
    });
}
// ======================================================
// ✅ CRON SYNC AREAS DESDE GOOGLE
// ======================================================
if (ENABLE_GROUPS_CRON) {
    node_cron_1.default.schedule("0 7 * * *", async () => {
        try {
            console.log("[CRON] Sync áreas desde Google...");
            const result = await (0, auth_controller_1.syncAreasFromGroupsCore)(true);
            console.log("[CRON] Sync OK:", result);
        }
        catch (e) {
            console.error("[CRON] Error sync áreas:", e);
        }
    });
}
// ⚠️ Error handler SIEMPRE al final
exports.app.use(error_middleware_js_1.errorHandler);
