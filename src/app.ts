// src/app.ts
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';         
import routes from './routes.js';
import { errorHandler } from './middlewares/error.middleware.js';
export const app = express();
import "dotenv/config";
import { oauth2Client } from "./services/googleDrive"; // el que ya tienes
import cron from "node-cron";
import { generarTareasAutomaticas } from "./jobs/generarTareas";
import { syncAreasFromGroupsCore } from "./controllers/auth.controller";


const ENABLE_TASK_CRON = process.env.ENABLE_TASK_CRON === "true";
const ENABLE_GROUPS_CRON = process.env.ENABLE_GROUPS_CRON === "true";

app.use(cors({
    origin: [
    'https://intranet-cintax.netlify.app',
    'http://localhost:5173'
  ],
    methods: ['GET','POST','PUT','DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type','Authorization']
}));

app.use(cookieParser());                             // 👈 DEBE ir antes de las rutas
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', routes);    
// debug opcional de cookies:
app.get('/debug/cookies', (req, res) => res.json({ cookies: (req as any).cookies }));
app.get("/admin/drive/auth-url", (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
    state: "admin",
  });
  res.send(`<a href="${url}">Conectar admin Cintax</a>`);
});


// ejemplo con un endpoint manual:
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
  // Corre todos los días a las 06:00 UTC
  // OJO: 06:00 UTC son las 03:00 en Chile aprox.
  cron.schedule("0 9 * * *", async () => {
    try {
      console.log("[CRON] Generando tareas automáticas (06:00 Chile)...");
      await generarTareasAutomaticas(new Date());
      console.log("[CRON] OK tareas generadas");
    } catch (e) {
      console.error("[CRON] Error generando tareas:", e);
    }
  });
}

if (ENABLE_GROUPS_CRON) {
  // por ejemplo: todos los días a las 07:00 UTC (~04:00 Chile)
  cron.schedule("0 7 * * *", async () => {
    try {
      console.log("[CRON] Sync de áreas desde grupos de Google...");
      const result = await syncAreasFromGroupsCore(true); // true = limpiar los que ya no están
      console.log("[CRON] Resultado sync áreas:", result);
    } catch (e) {
      console.error("[CRON] Error en sync áreas:", e);
    }
  });
}
