import cron from "node-cron";
import { generarTareasMesSiguiente } from "./generarTareasMesSiguiente";

// Corre todos los días a las 02:05
// (y adentro decide si hoy es 30 o último día si no existe 30)
export function startSchedulers() {
  cron.schedule("5 2 * * *", async () => {
    try {
      console.log("[SCHED] Tick generarTareasMesSiguiente");
      await generarTareasMesSiguiente(new Date());
    } catch (e) {
      console.error("[SCHED] Error generarTareasMesSiguiente:", e);
    }
  });

  console.log("[SCHED] Schedulers iniciados.");
}
