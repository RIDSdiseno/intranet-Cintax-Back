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
const error_middleware_js_1 = require("./middlewares/error.middleware.js");
exports.app = (0, express_1.default)();
require("dotenv/config");
const googleDrive_1 = require("./services/googleDrive"); // el que ya tienes
const node_cron_1 = __importDefault(require("node-cron"));
const generarTareas_1 = require("./jobs/generarTareas");
const ENABLE_TASK_CRON = process.env.ENABLE_TASK_CRON === "true";
exports.app.use((0, cors_1.default)({
    origin: [
        'https://intranet-cintax.netlify.app',
        'http://localhost:5173'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
exports.app.use((0, cookie_parser_1.default)()); // 👈 DEBE ir antes de las rutas
exports.app.use(express_1.default.json());
exports.app.use((0, morgan_1.default)('dev'));
exports.app.use('/api', routes_js_1.default);
// debug opcional de cookies:
exports.app.get('/debug/cookies', (req, res) => res.json({ cookies: req.cookies }));
exports.app.get("/admin/drive/auth-url", (_req, res) => {
    const url = googleDrive_1.oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/drive"],
        state: "admin",
    });
    res.send(`<a href="${url}">Conectar admin Cintax</a>`);
});
exports.app.use(error_middleware_js_1.errorHandler);
if (ENABLE_TASK_CRON) {
    // Corre todos los días a las 06:00 UTC
    // OJO: 06:00 UTC son las 03:00 en Chile aprox.
    node_cron_1.default.schedule("0 9 * * *", async () => {
        try {
            console.log("[CRON] Generando tareas automáticas (06:00 Chile)...");
            await (0, generarTareas_1.generarTareasAutomaticas)(new Date());
            console.log("[CRON] OK tareas generadas");
        }
        catch (e) {
            console.error("[CRON] Error generando tareas:", e);
        }
    });
}
