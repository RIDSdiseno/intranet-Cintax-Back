// src/app.ts
import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import routes from "./routes.js";
import trabajadorRoutes from "./routes/trabajador.routes";
import tareasRoutes from "./routes/tareas.routes";
import dashboardRoutes from "./routes/dashboard.routes";

import { errorHandler } from "./middlewares/error.middleware.js";
import { requestIdMiddleware } from "./middlewares/requestId.middleware";
import "dotenv/config";

import { oauth2Client } from "./services/googleDrive";
import notificacionesRoutes from "./routes/notificaciones.routes";
import { generarNotificacionesDeVencimiento } from "./services/notificaciones.service";

import cron from "node-cron";
import { subDays, addDays } from "date-fns";
import { prisma } from "./lib/prisma";
import {
  Area,
  EstadoTarea,
  FrecuenciaTarea,
  Presentacion,
} from "@prisma/client";
import { syncAreasFromGroupsCore } from "./controllers/auth.controller";

// ✅ NUEVO JOB (día 30 -> genera mes siguiente)
import { generarTareasMesSiguiente } from "./jobs/generarTareasMesSiguiente";

import tareasMasivoRoutes from "./routes/tareas-masivo.routes";
// 👇 SUPER IMPORTANTE: log de versión
console.log("⚙️ [APP] Cargando app.ts **CINTAX TAREAS V5**");

export const app = express();

// (opcional pero recomendado en prod detrás de proxy / render / railway / etc)
app.set("trust proxy", 1);

const ENABLE_TASK_CRON = process.env.ENABLE_TASK_CRON === "true";
const ENABLE_GROUPS_CRON = process.env.ENABLE_GROUPS_CRON === "true";
const ENABLE_NOTI_CRON = process.env.ENABLE_NOTI_CRON !== "false"; // default true

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const corsCredentials =
  String(process.env.CORS_CREDENTIALS ?? process.env.AUTH_COOKIE ?? "false") ===
  "true";
const corsForbiddenError = Object.assign(new Error("Not allowed by CORS"), {
  status: 403,
});

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(corsForbiddenError);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: corsCredentials,
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/^\/api\/.*$/, cors(corsOptions));


app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
app.use(requestIdMiddleware);
app.use(morgan("dev"));

// 🔍 Ruta de debug de versión
app.get("/api/debug-version", (_req, res) => {
  res.json({ ok: true, version: "cintax-tareas-v5" });
});

// =============================
// RUTAS API
// =============================
// ✅ Si tu routes.js tiene /auth, /clientes, etc.
app.use("/api", routes);

// ✅ Trabajadores (incluye GET /trabajadores y PATCH /trabajadores/:id)
//    (internamente el router ya tiene authGuard / requireSupervisorOrAdmin)
app.use("/api", trabajadorRoutes);

// ✅ Tareas
app.use("/api/tareas", tareasRoutes);

// ✅ Dashboard
app.use("/api/dashboard", dashboardRoutes);

// ✅ Notificaciones
app.use("/api/notificaciones", notificacionesRoutes);

app.use("/api/tareas", tareasMasivoRoutes);

// Debug cookies (útil)
app.get("/debug/cookies", (req, res) =>
  res.json({ cookies: (req as any).cookies })
);

// Auth Drive admin (mantener igual)
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

    // 1) OBTENER O CREAR TRABAJADOR DE PRUEBA
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

    // 2) LIMPIAR DATOS DE PRUEBAS ANTERIORES
    const deletedNotis = await prisma.notificacion.deleteMany({
      where: { trabajadorId: trabajador.id_trabajador },
    });
    log(`Limpiadas ${deletedNotis.count} notificaciones antiguas.`);

    const deletedTareas = await prisma.tareaAsignada.deleteMany({
      where: {
        trabajadorId: trabajador.id_trabajador,
        tareaPlantilla: { nombre: { startsWith: "[TEST]" } },
      },
    });
    log(`Limpiadas ${deletedTareas.count} tareas de prueba antiguas.`);

    // 3) CREAR PLANTILLAS DE TAREA
    async function ensureTestPlantilla(nombre: string, detalle: string) {
      let plantilla = await prisma.tareaPlantilla.findFirst({
        where: { nombre },
      });

      if (!plantilla) {
        plantilla = await prisma.tareaPlantilla.create({
          data: {
            nombre,
            detalle,
            area: Area.CONTA,
            frecuencia: FrecuenciaTarea.UNICA,
            presentacion: Presentacion.INTERNO,
          },
        });
      }

      return plantilla;
    }

    const plantillaVencida = await ensureTestPlantilla(
      "[TEST] Tarea Vencida",
      "Vencida"
    );
    const plantillaHoy = await ensureTestPlantilla(
      "[TEST] Tarea para Hoy",
      "Hoy"
    );
    const plantillaFutura = await ensureTestPlantilla(
      "[TEST] Tarea Futura",
      "Futura"
    );

    log("Plantillas de prueba listas.");

    // 4) CREAR TAREAS CON DISTINTAS FECHAS
    const hoy = new Date();

    const tareaVencida = await prisma.tareaAsignada.create({
      data: {
        tareaPlantillaId: plantillaVencida.id_tarea_plantilla,
        trabajadorId: trabajador.id_trabajador,
        estado: EstadoTarea.PENDIENTE,
        fechaProgramada: subDays(hoy, 2),
      },
    });
    log(
      `Creada TAREA VENCIDA (ID: ${
        tareaVencida.id_tarea_asignada
      }) con fecha ${tareaVencida.fechaProgramada.toISOString()}`
    );

    const tareaHoy = await prisma.tareaAsignada.create({
      data: {
        tareaPlantillaId: plantillaHoy.id_tarea_plantilla,
        trabajadorId: trabajador.id_trabajador,
        estado: EstadoTarea.PENDIENTE,
        fechaProgramada: hoy,
      },
    });
    log(
      `Creada TAREA PARA HOY (ID: ${
        tareaHoy.id_tarea_asignada
      }) con fecha ${tareaHoy.fechaProgramada.toISOString()}`
    );

    const tareaFutura = await prisma.tareaAsignada.create({
      data: {
        tareaPlantillaId: plantillaFutura.id_tarea_plantilla,
        trabajadorId: trabajador.id_trabajador,
        estado: EstadoTarea.PENDIENTE,
        fechaProgramada: addDays(hoy, 5),
      },
    });
    log(
      `Creada TAREA FUTURA (ID: ${
        tareaFutura.id_tarea_asignada
      }) con fecha ${tareaFutura.fechaProgramada.toISOString()} (NO debería generar notificación)`
    );

    // 5) EJECUTAR NOTIFICACIONES
    logs.push("\n[TEST-NOTI] ==================================================");
    log("Ejecutando 'generarNotificacionesDeVencimiento'...");
    await generarNotificacionesDeVencimiento();
    log("Servicio de notificaciones finalizado.");
    logs.push("[TEST-NOTI] ==================================================\n");

    // 6) VERIFICAR RESULTADOS
    const notificacionesGeneradas = await prisma.notificacion.findMany({
      where: { trabajadorId: trabajador.id_trabajador },
      orderBy: { createdAt: "asc" },
    });

    log(
      `Se encontraron ${notificacionesGeneradas.length} notificaciones en la BD.`
    );
    if (notificacionesGeneradas.length > 0) {
      logs.push("Notificaciones generadas:");
      notificacionesGeneradas.forEach((n) =>
        logs.push(`  - ID: ${n.id}, Mensaje: "${n.mensaje}"`)
      );
    } else {
      logs.push("ADVERTENCIA: No se generó ninguna notificación.");
    }

    // 7) SEGUNDA EJECUCIÓN PARA DUPLICADOS
    logs.push("\n[TEST-NOTI] ==================================================");
    log("Ejecutando servicio por SEGUNDA VEZ (anti-duplicados)...");
    await generarNotificacionesDeVencimiento();
    log("Segunda ejecución finalizada.");
    logs.push("[TEST-NOTI] ==================================================\n");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(logs.join("\n"));
  } catch (error) {
    const errorMessage = (error as Error).message;
    log(`💥 ERROR: ${errorMessage}`);
    console.error("💥 [TEST-NOTI] Error durante la prueba:", error);

    if (!res.headersSent)
      res.status(500).json({ ok: false, error: errorMessage, logs });
    else res.end(`\n💥 ERROR: ${errorMessage}\n`);
  }
});

// ======================================================
// ✅ ENDPOINT MANUAL: genera tareas MES SIGUIENTE
// - default: solo corre si corresponde (día 30 o último)
// - force=true: forzar ejecución como si fuera día 30
// ======================================================
app.post("/api/tareas/generar-mes-siguiente", async (req, res) => {
  try {
    const force = String(req.query.force ?? "") === "true";

    if (force) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth(); // 0-11
      const lastDay = new Date(y, m + 1, 0).getDate();
      const day = lastDay >= 30 ? 30 : lastDay;
      const fake = new Date(
        y,
        m,
        day,
        now.getHours(),
        now.getMinutes(),
        0,
        0
      );

      const out = await generarTareasMesSiguiente(fake);
      return res.json({ ok: true, forced: true, ...out });
    }

    const out = await generarTareasMesSiguiente(new Date());
    return res.json({ ok: true, forced: false, ...out });
  } catch (e) {
    console.error("Error generando tareas (mes siguiente)", e);
    return res.status(500).json({ ok: false });
  }
});

// ======================================================
// ✅ CRON TAREAS: corre TODOS los días (02:05)
// pero el job decide si corresponde (día 30 / último día)
// ======================================================
if (ENABLE_TASK_CRON) {
  cron.schedule("5 2 * * *", async () => {
    try {
      console.log(
        "[CRON] Tick: generar tareas mes siguiente (si corresponde)..."
      );
      const out = await generarTareasMesSiguiente(new Date());
      console.log("[CRON] OK:", out);
    } catch (e) {
      console.error("[CRON] Error generando tareas mes siguiente:", e);
    }
  });
}

// ======================================================
// ✅ CRON NOTIFICACIONES: cada 5 minutos
// ======================================================
if (ENABLE_NOTI_CRON) {
  cron.schedule("*/5 * * * *", async () => {
    try {
      console.log("[CRON] Generando notificaciones de vencimiento...");
      await generarNotificacionesDeVencimiento();
      console.log("[CRON] OK notificaciones generadas");
    } catch (e) {
      console.error(
        "[CRON] Error generando notificaciones de vencimiento:",
        e
      );
    }
  });
}

// ======================================================
// ✅ CRON SYNC AREAS DESDE GOOGLE
// ======================================================
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

// ⚠️ Error handler SIEMPRE al final
app.use(errorHandler);
