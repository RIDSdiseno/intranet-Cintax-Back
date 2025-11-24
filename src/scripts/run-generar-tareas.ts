// src/scripts/run-generar-tareas.ts
import "dotenv/config";
import { generarTareasAutomaticas } from "../jobs/generarTareas";

generarTareasAutomaticas()
  .then(() => {
    console.log("OK tareas auto generadas");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
