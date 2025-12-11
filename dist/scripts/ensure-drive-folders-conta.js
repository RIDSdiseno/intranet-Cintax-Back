"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/ensure-drive-folders-conta-A01-enero2025.ts
require("dotenv/config");
const client_1 = require("@prisma/client");
const driveContaTasks_1 = require("../services/driveContaTasks");
const prisma = new client_1.PrismaClient();
// 🔹 Agente A01 (id_trabajador = 7)
const ONLY_WORKER_ID = 7;
// 🔹 Año y mes objetivo (enero)
const TARGET_YEAR = 2025;
const TARGET_MONTH = 1; // 1 = enero
// 🔹 RUTs de la cartera CONTA/A01 (Camila).
//    Se dejan tal cual vienen, aunque algunos se repitan.
const RUTS_AGENTE_A01 = [
    "76.511.417-9", // PANEXPRESS SOCIEDAD ANONIMA
    "77.206.636-8", // INVERSIONES RPH SPA
    "77.432.589-1", // SOCIEDAD DE INVERSION Y SERVICIOS MEDICOS EMILVAR SPA
    "76.473.267-7", // La Boutique del Luthier SPA
    "77.113.924-8", // Comercial Fenise SPA
    "76.949.787-0", // PIPE FULL SPA
    "76.366.844-4", // AVENDANO COMERCIALIZADORA Y CONSULTORA DE PRODUCTOS LIMITADA
    "76.274.504-6", // COMERCIAL HC LIMITADA (Holding BRAS)
    "76.972.874-0", // COMERCIAL BRAS LIMITADA (Holding BRAS)
    "76.001.158-4", // ECOPACTO (Holding BRAS)
    "76.001.158-4", // TRATAMIENTO DE RESIDUOS INDUSTRIALES LIMITADA (Holding BRAS)
    "76.661.486-8", // SOCIEDAD IMPORTADORA SOUTHERNKING LIMITADA
    "65.144.829-8", // Corporacion Educacional Rodriguez Cornejo
    "77.675.520-6", // SOC. EDUCACIONAL Y CAPACITACION RODRIGUEZ CORNEJO SPA (Holding Sandra)
    "76.383.411-5", // INVERSIONES SANTA CECILIA (Holding Sandra)
    "76.086.091-3", // SAN SALVADOR LTDA SOC EDUCACIONAL E INMOBILIARIA (Holding Sandra)
    "76.558.624-0", // SOC EDUCACIONAL E INMOBILIARIA SAN FERMIN LTDA (Holding Sandra)
    "76.430.373-3", // INVERSIONES SAN JAVIER SPA (Holding Sandra)
    "77.990.400-8", // SOC EDUCACIONAL E INMOBILIARIA SAN IGNACIO LTDA (Holding Sandra)
    "76.620.801-0", // INVERSIONES Y HOTELERA SAN MIGUEL SPA (Holding Sandra)
    "76.340.069-7", // SANTA JOSEFINA SPA (Holding Sandra)
    "76.625.301-6", // SOCIEDAD SAN FERNANDO LTDA (Holding Sandra)
    "76.159.135-5", // SOC EDUCACIONAL SAN ALBERTO SPA (Holding Sandra)
    "76.074.071-3", // SOC EDUCACIONAL ANDRES BELLO SPA (Holding Sandra)
    "76.439.921-8", // COMERCIALIZADORA Y ELABORADORA DILICI LIMITADA
    "78.991.080-4", // SERVICIOS Y RENTAS G V LIMITADA (Holding GV)
    "76.607.281-K", // TRANSPORTES ITALIA SPA (Holding GV)
    "76.567.655-K", // VENDING CENTER SPA
    "76.876.439-5", // AISLACEL SPA (Holding Aislacel)
    "76.366.289-6", // MED ENERGIA SPA (Holding Aislacel)
    "77.092.057-4", // EMPRESA FABR E IMPORT DE AISLANTES TERMICOS SPA (Holding Aislacel)
    "76.681.721-1", // SERV Y PROY TECNOLOGIA PRORED ZONA NORTE LTDA (Holding Prored)
    "76.315.244-8", // ASESO. EN TECNOLOGIAS DE LA INFO. J.P. HENRÍQUEZ JARA EIRL (Holding Prored)
    "76.189.072-7", // ESTRATEGICAMENTE SPA (Holding Pinto)
    "96.788.070-1", // INVERSIONES AVALON SPA (Holding Pinto)
    "96.788.070-1", // INVERSIONES LOURDES SPA (Holding 2)
    "76.706.316-4", // GLOBAL ADVISORY AND INVESTMENT SPA (Holding Global)
    "76.598.868-3", // INMOBILIARIA E INVERSIONES WILSON SPA (Holding Global)
    "76.914.491-9", // CONSTRUCTORA E INMOBILIARIA QUATTROMAS SPA (Holding Quattromas)
    "77.119.688-8", // PROYECTOS DE DISENO E INGENIERIA QUATTROMAS SPA (Holding Quattromas)
];
async function main() {
    console.log("🔹 Creación de carpetas Drive para tareas CONTA (Agente A01)...");
    console.log("📌 trabajadorId =", ONLY_WORKER_ID);
    console.log("📌 Mes/Año =", TARGET_MONTH, TARGET_YEAR);
    console.log("📌 RUTs considerados (incluye posibles duplicados):", RUTS_AGENTE_A01.length);
    // 📅 Rango del mes de enero 2025
    const startDate = new Date(TARGET_YEAR, TARGET_MONTH - 1, 1); // 2025-01-01
    const endDate = new Date(TARGET_YEAR, TARGET_MONTH, 1); // 2025-02-01 (exclusivo)
    const where = {
        driveTareaFolderId: null,
        trabajadorId: ONLY_WORKER_ID,
        rutCliente: { in: RUTS_AGENTE_A01 },
        asignado: {
            areaInterna: client_1.Area.CONTA,
        },
        fechaProgramada: {
            gte: startDate,
            lt: endDate,
        },
    };
    const tareas = await prisma.tareaAsignada.findMany({
        where,
        select: {
            id_tarea_asignada: true,
            trabajadorId: true,
            rutCliente: true,
            fechaProgramada: true,
            tareaPlantillaId: true,
        },
        orderBy: {
            id_tarea_asignada: "asc",
        },
    });
    console.log(`📌 Tareas sin carpeta en ${TARGET_MONTH}/${TARGET_YEAR}:`, tareas.length);
    if (tareas.length === 0) {
        console.log("✅ No hay tareas pendientes de carpeta para este filtro.");
        return;
    }
    let ok = 0;
    let fail = 0;
    for (const t of tareas) {
        const id = t.id_tarea_asignada;
        const fechaISO = t.fechaProgramada
            ? t.fechaProgramada.toISOString()
            : "NULL";
        console.log(`\n▶️ Procesando tarea ${id} (trabajadorId=${t.trabajadorId}, rut=${t.rutCliente}, fecha=${fechaISO})`);
        try {
            const folderId = await (0, driveContaTasks_1.ensureContaTaskFolderForTareaAsignada)(id);
            console.log(`   ✅ Carpeta creada/asegurada → ${folderId}`);
            ok++;
            // Pequeño delay para no golpear tanto la API
            await new Promise((r) => setTimeout(r, 200));
        }
        catch (e) {
            console.error(`   ❌ Error creando carpeta para tarea ${id}:`, e?.message ?? e);
            fail++;
        }
    }
    console.log("\n🏁 Proceso terminado.");
    console.log("   ✅ OK:", ok);
    console.log("   ❌ Errores:", fail);
}
main()
    .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
})
    .finally(async () => {
    prisma.$disconnect();
});
