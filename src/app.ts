// src/app.ts
import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import routes from "./routes.js";
import trabajadorRoutes from "./routes/trabajador.routes";
import tareasRoutes from "./routes/tareas.routes";

import { errorHandler } from "./middlewares/error.middleware.js";
import "dotenv/config";

import { oauth2Client } from "./services/googleDrive";
import notificacionesRoutes from './routes/notificaciones.routes'; // Importar las nuevas rutas de notificaciones
import { generarNotificacionesDeVencimiento } from './services/notificaciones.service'; // Importar el servicio de notificaciones
import cron from "node-cron";
import { subDays, addDays } from "date-fns";
import { prisma } from "./lib/prisma";
import { Area, EstadoTarea, FrecuenciaTarea, Presentacion } from "@prisma/client";
import { generarTareasAutomaticas } from "./jobs/generarTareas";
import { syncAreasFromGroupsCore } from "./controllers/auth.controller";

// 👇 SUPER IMPORTANTE: log de versión
console.log("⚙️ [APP] Cargando app.ts **CINTAX TAREAS V5**");

export const app = express();

const ENABLE_TASK_CRON = process.env.ENABLE_TASK_CRON === "true";
const ENABLE_GROUPS_CRON = process.env.ENABLE_GROUPS_CRON === "true";

const corsOptions: cors.CorsOptions = {
  origin: [
    "https://intranet-cintax.netlify.app",
    "http://localhost:5173",
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(morgan("dev"));

// 🔍 Ruta de debug de versión
app.get("/api/debug-version", (_req, res) => {
  res.json({
    ok: true,
    version: "cintax-tareas-v5",
  });
});

// Rutas API
app.use("/api", routes);
app.use("/api", trabajadorRoutes);
app.use("/api/tareas", tareasRoutes);

// NUEVAS rutas de notificaciones
app.use("/api/notificaciones", notificacionesRoutes);

app.get("/debug/cookies", (req, res) =>
  res.json({ cookies: (req as any).cookies })
);

app.get("/admin/drive/auth-url", (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
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
app.get("/debug/test-notificaciones", async (_req: Request, res: Response) => {
  const TEST_EMAIL = "test-notificaciones@cintax.cl";
  const logs: string[] = [];
  const log = (message: string) => {
    console.log(`[TEST-NOTI] ${message}`);
    logs.push(`[TEST-NOTI] ${message}`);
  };

  try {
    log("🧪 Iniciando prueba avanzada de notificaciones...");

    // 1. OBTENER O CREAR TRABAJADOR DE PRUEBA
    const trabajador = await prisma.trabajador.upsert({
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
    const deletedNotis = await prisma.notificacion.deleteMany({
      where: { trabajadorId: trabajador.id_trabajador },
    });
    log(`Limpiadas ${deletedNotis.count} notificaciones antiguas.`);

    const deletedTareas = await prisma.tareaAsignada.deleteMany({
        where: {
            trabajadorId: trabajador.id_trabajador,
            tareaPlantilla: { nombre: { startsWith: "[TEST]" } }
        }
    });
    log(`Limpiadas ${deletedTareas.count} tareas de prueba antiguas.`);

    // 3. CREAR PLANTILLAS DE TAREA
    const plantillaVencida = await prisma.tareaPlantilla.upsert({ where: { nombre: "[TEST] Tarea Vencida" }, update: {}, create: { nombre: "[TEST] Tarea Vencida", area: Area.CONTA, frecuencia: FrecuenciaTarea.UNICA, presentacion: Presentacion.INTERNO, detalle: "Vencida" } });
    const plantillaHoy = await prisma.tareaPlantilla.upsert({ where: { nombre: "[TEST] Tarea para Hoy" }, update: {}, create: { nombre: "[TEST] Tarea para Hoy", area: Area.CONTA, frecuencia: FrecuenciaTarea.UNICA, presentacion: Presentacion.INTERNO, detalle: "Hoy" } });
    const plantillaFutura = await prisma.tareaPlantilla.upsert({ where: { nombre: "[TEST] Tarea Futura" }, update: {}, create: { nombre: "[TEST] Tarea Futura", area: Area.CONTA, frecuencia: FrecuenciaTarea.UNICA, presentacion: Presentacion.INTERNO, detalle: "Futura" } });
    log("Plantillas de prueba listas.");

    // 4. CREAR TAREAS CON DISTINTAS FECHAS
    const hoy = new Date();
    const tareaVencida = await prisma.tareaAsignada.create({ data: { tareaPlantillaId: plantillaVencida.id_tarea_plantilla, trabajadorId: trabajador.id_trabajador, estado: EstadoTarea.PENDIENTE, fechaProgramada: subDays(hoy, 2) } });
    log(`Creada TAREA VENCIDA (ID: ${tareaVencida.id_tarea_asignada}) con fecha ${tareaVencida.fechaProgramada.toISOString()}`);

    const tareaHoy = await prisma.tareaAsignada.create({ data: { tareaPlantillaId: plantillaHoy.id_tarea_plantilla, trabajadorId: trabajador.id_trabajador, estado: EstadoTarea.PENDIENTE, fechaProgramada: hoy } });
    log(`Creada TAREA PARA HOY (ID: ${tareaHoy.id_tarea_asignada}) con fecha ${tareaHoy.fechaProgramada.toISOString()}`);

    const tareaFutura = await prisma.tareaAsignada.create({ data: { tareaPlantillaId: plantillaFutura.id_tarea_plantilla, trabajadorId: trabajador.id_trabajador, estado: EstadoTarea.PENDIENTE, fechaProgramada: addDays(hoy, 5) } });
    log(`Creada TAREA FUTURA (ID: ${tareaFutura.id_tarea_asignada}) con fecha ${tareaFutura.fechaProgramada.toISOString()} (NO debería generar notificación)`);

    // 5. EJECUTAR EL SERVICIO DE NOTIFICACIONES
    logs.push("\n[TEST-NOTI] ==================================================");
    log("Ejecutando 'generarNotificacionesDeVencimiento'...");
    await generarNotificacionesDeVencimiento();
    log("Servicio de notificaciones finalizado.");
    logs.push("[TEST-NOTI] ==================================================\n");

    // 6. VERIFICAR RESULTADOS
    const notificacionesGeneradas = await prisma.notificacion.findMany({
        where: { trabajadorId: trabajador.id_trabajador },
        orderBy: { createdAt: 'asc' }
    });

    log(`Se encontraron ${notificacionesGeneradas.length} notificaciones en la BD para el usuario de prueba.`);
    if (notificacionesGeneradas.length > 0) {
        logs.push("Notificaciones generadas:");
        notificacionesGeneradas.forEach(n => {
            logs.push(`  - ID: ${n.id}, Mensaje: "${n.mensaje}"`);
        });
    } else {
        logs.push("ADVERTENCIA: No se generó ninguna notificación. Revisa la lógica del servicio y los logs de la consola.");
    }

    // 7. SEGUNDA EJECUCIÓN PARA PROBAR DUPLICADOS
    logs.push("\n[TEST-NOTI] ==================================================");
    log("Ejecutando el servicio por SEGUNDA VEZ para probar la lógica anti-duplicados...");
    await generarNotificacionesDeVencimiento();
    log("Segunda ejecución finalizada. La consola del servidor debería indicar 'No se crearon notificaciones nuevas'.");
    logs.push("[TEST-NOTI] ==================================================\n");

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(logs.join('\n'));

  } catch (error) {
    const errorMessage = (error as Error).message;
    log(`💥 ERROR: ${errorMessage}`);
    console.error("💥 [TEST-NOTI] Error durante la prueba:", error);
    if (!res.headersSent) {
        res.status(500).json({ ok: false, error: errorMessage, logs });
    } else {
        res.end(`\n💥 ERROR: ${errorMessage}\n`);
    }
  }
});

app.post("/api/tareas/generar", async (_req, res) => {
  try {
    await generarTareasAutomaticas();
    res.json({ ok: true });
  } catch (e) {
    console.error("Error generando tareas", e);
    res.status(500).json({ ok: false });
  }
});

app.use(errorHandler);

if (ENABLE_TASK_CRON) {
  cron.schedule("0 9 * * *", async () => {
    try {
      console.log("[CRON] Generando tareas automáticas...");
      await generarTareasAutomaticas(new Date());
      console.log("[CRON] OK tareas generadas");
    } catch (e) {
      console.error("[CRON] Error generando tareas:", e);
    }
  });
}

// Tarea programada para generar notificaciones de vencimiento para ejecutarse cada 5 minutos sin duplicar las ya creadas
cron.schedule('*/5 * * * *', async () => {
  try {
    console.log('[CRON] Generando notificaciones de vencimiento...');
    await generarNotificacionesDeVencimiento();
    console.log('[CRON] OK notificaciones generadas');
  } catch (e) {
    console.error('[CRON] Error generando notificaciones de vencimiento:', e);
  }
});

if (ENABLE_GROUPS_CRON) {
  cron.schedule("0 7 * * *", async () => {
    try {
      console.log("[CRON] Sync áreas desde Google...");
      const result = await syncAreasFromGroupsCore(true);
      console.log("[CRON] Sync OK:", result);
    } catch (e) {
      console.error("[CRON] Error sync áreas:", e);
    }
  });
}
