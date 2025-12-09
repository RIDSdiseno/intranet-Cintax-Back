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
const error_middleware_js_1 = require("./middlewares/error.middleware.js");
require("dotenv/config");
const googleDrive_1 = require("./services/googleDrive");
const node_cron_1 = __importDefault(require("node-cron"));
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
