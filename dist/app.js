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
const notificaciones_routes_1 = __importDefault(require("./routes/notificaciones.routes")); // Importar las nuevas rutas de notificaciones
const notificaciones_service_1 = require("./services/notificaciones.service"); // Importar el servicio de notificaciones
const node_cron_1 = __importDefault(require("node-cron"));
const date_fns_1 = require("date-fns");
const prisma_1 = require("./lib/prisma");
const client_1 = require("@prisma/client");
const generarTareas_1 = require("./jobs/generarTareas");
const auth_controller_1 = require("./controllers/auth.controller");
// 👇 SUPER IMPORTANTE: log de versión
console.log("⚙️ [APP] Cargando app.ts **CINTAX TAREAS V5**");
exports.app = (0, express_1.default)();
const ENABLE_TASK_CRON = process.env.ENABLE_TASK_CRON === "true";
const ENABLE_GROUPS_CRON = process.env.ENABLE_GROUPS_CRON === "true";
const corsOptions = {
    origin: [
        "https://intranet-cintax.netlify.app",
        "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
};
exports.app.use((0, cors_1.default)(corsOptions));
exports.app.use((0, cookie_parser_1.default)());
exports.app.use(express_1.default.json());
exports.app.use((0, morgan_1.default)("dev"));
// 🔍 Ruta de debug de versión
exports.app.get("/api/debug-version", (_req, res) => {
    res.json({
        ok: true,
        version: "cintax-tareas-v5",
    });
});
// Rutas API
exports.app.use("/api", routes_js_1.default);
exports.app.use("/api", trabajador_routes_1.default);
exports.app.use("/api/tareas", tareas_routes_1.default);
exports.app.use("/api/dashboard", dashboard_routes_1.default);
// NUEVAS rutas de notificaciones
exports.app.use("/api/notificaciones", notificaciones_routes_1.default);
exports.app.get("/debug/cookies", (req, res) => res.json({ cookies: req.cookies }));
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
        // 1. OBTENER O CREAR TRABAJADOR DE PRUEBA
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
        // 2. LIMPIAR DATOS DE PRUEBAS ANTERIORES
        const deletedNotis = await prisma_1.prisma.notificacion.deleteMany({
            where: { trabajadorId: trabajador.id_trabajador },
        });
        log(`Limpiadas ${deletedNotis.count} notificaciones antiguas.`);
        const deletedTareas = await prisma_1.prisma.tareaAsignada.deleteMany({
            where: {
                trabajadorId: trabajador.id_trabajador,
                tareaPlantilla: { nombre: { startsWith: "[TEST]" } }
            }
        });
        log(`Limpiadas ${deletedTareas.count} tareas de prueba antiguas.`);
        // 3. CREAR PLANTILLAS DE TAREA
        const plantillaVencida = await prisma_1.prisma.tareaPlantilla.upsert({ where: { nombre: "[TEST] Tarea Vencida" }, update: {}, create: { nombre: "[TEST] Tarea Vencida", area: client_1.Area.CONTA, frecuencia: client_1.FrecuenciaTarea.UNICA, presentacion: client_1.Presentacion.INTERNO, detalle: "Vencida" } });
        const plantillaHoy = await prisma_1.prisma.tareaPlantilla.upsert({ where: { nombre: "[TEST] Tarea para Hoy" }, update: {}, create: { nombre: "[TEST] Tarea para Hoy", area: client_1.Area.CONTA, frecuencia: client_1.FrecuenciaTarea.UNICA, presentacion: client_1.Presentacion.INTERNO, detalle: "Hoy" } });
        const plantillaFutura = await prisma_1.prisma.tareaPlantilla.upsert({ where: { nombre: "[TEST] Tarea Futura" }, update: {}, create: { nombre: "[TEST] Tarea Futura", area: client_1.Area.CONTA, frecuencia: client_1.FrecuenciaTarea.UNICA, presentacion: client_1.Presentacion.INTERNO, detalle: "Futura" } });
        log("Plantillas de prueba listas.");
        // 4. CREAR TAREAS CON DISTINTAS FECHAS
        const hoy = new Date();
        const tareaVencida = await prisma_1.prisma.tareaAsignada.create({ data: { tareaPlantillaId: plantillaVencida.id_tarea_plantilla, trabajadorId: trabajador.id_trabajador, estado: client_1.EstadoTarea.PENDIENTE, fechaProgramada: (0, date_fns_1.subDays)(hoy, 2) } });
        log(`Creada TAREA VENCIDA (ID: ${tareaVencida.id_tarea_asignada}) con fecha ${tareaVencida.fechaProgramada.toISOString()}`);
        const tareaHoy = await prisma_1.prisma.tareaAsignada.create({ data: { tareaPlantillaId: plantillaHoy.id_tarea_plantilla, trabajadorId: trabajador.id_trabajador, estado: client_1.EstadoTarea.PENDIENTE, fechaProgramada: hoy } });
        log(`Creada TAREA PARA HOY (ID: ${tareaHoy.id_tarea_asignada}) con fecha ${tareaHoy.fechaProgramada.toISOString()}`);
        const tareaFutura = await prisma_1.prisma.tareaAsignada.create({ data: { tareaPlantillaId: plantillaFutura.id_tarea_plantilla, trabajadorId: trabajador.id_trabajador, estado: client_1.EstadoTarea.PENDIENTE, fechaProgramada: (0, date_fns_1.addDays)(hoy, 5) } });
        log(`Creada TAREA FUTURA (ID: ${tareaFutura.id_tarea_asignada}) con fecha ${tareaFutura.fechaProgramada.toISOString()} (NO debería generar notificación)`);
        // 5. EJECUTAR EL SERVICIO DE NOTIFICACIONES
        logs.push("\n[TEST-NOTI] ==================================================");
        log("Ejecutando 'generarNotificacionesDeVencimiento'...");
        await (0, notificaciones_service_1.generarNotificacionesDeVencimiento)();
        log("Servicio de notificaciones finalizado.");
        logs.push("[TEST-NOTI] ==================================================\n");
        // 6. VERIFICAR RESULTADOS
        const notificacionesGeneradas = await prisma_1.prisma.notificacion.findMany({
            where: { trabajadorId: trabajador.id_trabajador },
            orderBy: { createdAt: 'asc' }
        });
        log(`Se encontraron ${notificacionesGeneradas.length} notificaciones en la BD para el usuario de prueba.`);
        if (notificacionesGeneradas.length > 0) {
            logs.push("Notificaciones generadas:");
            notificacionesGeneradas.forEach(n => {
                logs.push(`  - ID: ${n.id}, Mensaje: "${n.mensaje}"`);
            });
        }
        else {
            logs.push("ADVERTENCIA: No se generó ninguna notificación. Revisa la lógica del servicio y los logs de la consola.");
        }
        // 7. SEGUNDA EJECUCIÓN PARA PROBAR DUPLICADOS
        logs.push("\n[TEST-NOTI] ==================================================");
        log("Ejecutando el servicio por SEGUNDA VEZ para probar la lógica anti-duplicados...");
        await (0, notificaciones_service_1.generarNotificacionesDeVencimiento)();
        log("Segunda ejecución finalizada. La consola del servidor debería indicar 'No se crearon notificaciones nuevas'.");
        logs.push("[TEST-NOTI] ==================================================\n");
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).send(logs.join('\n'));
    }
    catch (error) {
        const errorMessage = error.message;
        log(`💥 ERROR: ${errorMessage}`);
        console.error("💥 [TEST-NOTI] Error durante la prueba:", error);
        if (!res.headersSent) {
            res.status(500).json({ ok: false, error: errorMessage, logs });
        }
        else {
            res.end(`\n💥 ERROR: ${errorMessage}\n`);
        }
    }
});
exports.app.post("/api/tareas/generar", async (_req, res) => {
    try {
        await (0, generarTareas_1.generarTareasAutomaticas)();
        res.json({ ok: true });
    }
    catch (e) {
        console.error("Error generando tareas", e);
        res.status(500).json({ ok: false });
    }
});
exports.app.use(error_middleware_js_1.errorHandler);
if (ENABLE_TASK_CRON) {
    node_cron_1.default.schedule("0 9 * * *", async () => {
        try {
            console.log("[CRON] Generando tareas automáticas...");
            await (0, generarTareas_1.generarTareasAutomaticas)(new Date());
            console.log("[CRON] OK tareas generadas");
        }
        catch (e) {
            console.error("[CRON] Error generando tareas:", e);
        }
    });
}
// Tarea programada para generar notificaciones de vencimiento para ejecutarse cada 5 minutos sin duplicar las ya creadas
node_cron_1.default.schedule('*/5 * * * *', async () => {
    try {
        console.log('[CRON] Generando notificaciones de vencimiento...');
        await (0, notificaciones_service_1.generarNotificacionesDeVencimiento)();
        console.log('[CRON] OK notificaciones generadas');
    }
    catch (e) {
        console.error('[CRON] Error generando notificaciones de vencimiento:', e);
    }
});
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
