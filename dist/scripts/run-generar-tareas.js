"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/run-generar-tareas.ts
require("dotenv/config");
const generarTareas_1 = require("../jobs/generarTareas");
(0, generarTareas_1.generarTareasAutomaticas)()
    .then(() => {
    console.log("OK tareas auto generadas");
    process.exit(0);
})
    .catch((e) => {
    console.error(e);
    process.exit(1);
});
