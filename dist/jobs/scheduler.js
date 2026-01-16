"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSchedulers = startSchedulers;
const node_cron_1 = __importDefault(require("node-cron"));
const generarTareasMesSiguiente_1 = require("./generarTareasMesSiguiente");
// Corre todos los días a las 02:05
// (y adentro decide si hoy es 30 o último día si no existe 30)
function startSchedulers() {
    node_cron_1.default.schedule("5 2 * * *", async () => {
        try {
            console.log("[SCHED] Tick generarTareasMesSiguiente");
            await (0, generarTareasMesSiguiente_1.generarTareasMesSiguiente)(new Date());
        }
        catch (e) {
            console.error("[SCHED] Error generarTareasMesSiguiente:", e);
        }
    });
    console.log("[SCHED] Schedulers iniciados.");
}
