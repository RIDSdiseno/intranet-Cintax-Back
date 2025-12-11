"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/seed-clientes-camila-a01.ts
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// 🔹 id_trabajador de Camila (CONTA/A01)
const CAMILA_TRABAJADOR_ID = 7;
// 🔹 Clientes de la cartera de Camila (CONTA/A01)
// alias = Holding cuando aplica
const clientesCamila = [
    {
        rut: "76.511.417-9",
        razonSocial: "PANEXPRESS SOCIEDAD ANONIMA",
    },
    {
        rut: "77.206.636-8",
        razonSocial: "INVERSIONES RPH SPA",
    },
    {
        rut: "77.432.589-1",
        razonSocial: "SOCIEDAD DE INVERSION Y SERVICIOS MEDICOS EMILVAR SPA",
    },
    {
        rut: "76.473.267-7",
        razonSocial: "La Boutique del Luthier SPA",
    },
    {
        rut: "77.113.924-8",
        razonSocial: "Comercial Fenise SPA",
    },
    {
        rut: "76.949.787-0",
        razonSocial: "PIPE FULL SPA",
    },
    {
        rut: "76.366.844-4",
        razonSocial: "AVENDANO COMERCIALIZADORA Y CONSULTORA DE PRODUCTOS LIMITADA",
    },
    // Holding BRAS
    {
        rut: "76.274.504-6",
        razonSocial: "COMERCIAL HC LIMITADA",
        alias: "Holding BRAS",
    },
    {
        rut: "76.972.874-0",
        razonSocial: "COMERCIAL BRAS LIMITADA",
        alias: "Holding BRAS",
    },
    {
        rut: "76.001.158-4",
        razonSocial: "ECOPACTO",
        alias: "Holding BRAS",
    },
    {
        rut: "76.001.158-4",
        razonSocial: "TRATAMIENTO DE RESIDUOS INDUSTRIALES LIMITADA",
        alias: "Holding BRAS",
    },
    {
        rut: "76.661.486-8",
        razonSocial: "SOCIEDAD  IMPORTADORA SOUTHERNKING LIMITADA",
    },
    {
        rut: "65.144.829-8",
        razonSocial: "Corporacion Educacional Rodriguez Cornejo",
    },
    // Holding Sandra
    {
        rut: "77.675.520-6",
        razonSocial: "SOCIEDAD EDUCACIONAL Y DE CAPACITACION RODRIGUEZ CORNEJO SPA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.383.411-5",
        razonSocial: "INVERSIONES SANTA CECILIA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.086.091-3",
        razonSocial: "SAN SALVADOR LTDA SOCIEDAD EDUCACIONALl E INMOBILIARIA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.558.624-0",
        razonSocial: "SOCIEDAD EDUCACIONAL E INMOBILIARIA SAN FERMIN LTDA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.430.373-3",
        razonSocial: "INVERSIONES SAN JAVIER SOCIEDAD POR ACCIONES",
        alias: "Holding Sandra",
    },
    {
        rut: "77.990.400-8",
        razonSocial: "SOCIEDAD EDUCACIONAL E INMOBILIARIA SAN IGNACIO LTDA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.620.801-0",
        razonSocial: "INVERSIONES Y HOTELERA SAN MIGUEL SPA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.340.069-7",
        razonSocial: "SANTA JOSEFINA SPA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.625.301-6",
        razonSocial: "SOCIEDAD SAN FERNANDO LTDA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.159.135-5",
        razonSocial: "SOCIEDAD EDUCACIONAL SAN ALBERTO SPA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.074.071-3",
        razonSocial: "SOCIEDAD EDUCACIONAL ANDRES BELLO SPA",
        alias: "Holding Sandra",
    },
    {
        rut: "76.439.921-8",
        razonSocial: "COMERCIALIZADORA Y ELABORADORA DILICI LIMITADA",
    },
    // Holding GV
    {
        rut: "78.991.080-4",
        razonSocial: "SERVICIOS Y RENTAS G V LIMITADA",
        alias: "Holding GV",
    },
    {
        rut: "76.607.281-K",
        razonSocial: "TRANSPORTES ITALIA SPA",
        alias: "Holding GV",
    },
    {
        rut: "76.567.655-K",
        razonSocial: "VENDING CENTER SPA",
    },
    // Holding Aislacel
    {
        rut: "76.876.439-5",
        razonSocial: "AISLACEL SPA",
        alias: "Holding Aislacel",
    },
    {
        rut: "76.366.289-6",
        razonSocial: "MED ENERGIA SPA",
        alias: "Holding Aislacel",
    },
    {
        rut: "77.092.057-4",
        razonSocial: "EMPRESA DE FABRICACIÓN E IMPORTACIÓN DE AISLANTES TÉRMICOS SPA",
        alias: "Holding Aislacel",
    },
    // Holding Prored
    {
        rut: "76.681.721-1",
        razonSocial: "SERVICIOS Y PROYECTOS DE TECNOLOGIA PRORED ZONA NORTE LIMITADA",
        alias: "Holding Prored",
    },
    {
        rut: "76.315.244-8",
        razonSocial: "ASESO. EN TECNOLOGÍAS DE LA INFO. JORGE PATRICIO HENRÍQUEZ JARA, E.I.R.L.",
        alias: "Holding Prored",
    },
    // Holding Pinto
    {
        rut: "76.189.072-7",
        razonSocial: "ESTRATEGICAMENTE SPA",
        alias: "Holding Pinto",
    },
    {
        rut: "96.788.070-1",
        razonSocial: "INVERSIONES AVALON SPA",
        alias: "Holding Pinto",
    },
    // Holding 2
    {
        rut: "96.788.070-1",
        razonSocial: "INVERSIONES LOURDES SPA",
        alias: "Holding 2",
    },
    // Holding Global
    {
        rut: "76.706.316-4",
        razonSocial: "GLOBAL ADVISORY AND INVESTMENT SPA",
        alias: "Holding Global",
    },
    {
        rut: "76.598.868-3",
        razonSocial: "INMOBILIARIA E INVERSIONES WILSON SPA",
        alias: "Holding Global",
    },
    // Holding Quatrromas
    {
        rut: "76.914.491-9",
        razonSocial: "CONSTRUCTORA E INMOBILIARIA QUATTROMAS SPA",
        alias: "Holding Quatrromas",
    },
    {
        rut: "77.119.688-8",
        razonSocial: "PROYECTOS DE DISENO E INGENIERIA QUATTROMAS SPA",
        alias: "Holding Quatrromas",
    },
];
async function main() {
    console.log("🔹 Insertando clientes de Camila (CONTA/A01)...");
    for (const c of clientesCamila) {
        try {
            // Si tienes @@unique([rut, razonSocial]) puedes usar upsert:
            await prisma.cliente.upsert({
                where: {
                    rut_razonSocial: {
                        rut: c.rut,
                        razonSocial: c.razonSocial,
                    },
                },
                update: {
                    alias: c.alias ?? null,
                    agenteId: CAMILA_TRABAJADOR_ID,
                    codigoCartera: "CONTA/A01",
                    activo: true,
                },
                create: {
                    rut: c.rut,
                    razonSocial: c.razonSocial,
                    alias: c.alias ?? null,
                    agenteId: CAMILA_TRABAJADOR_ID,
                    codigoCartera: "CONTA/A01",
                    activo: true,
                },
            });
            console.log(`✅ OK: ${c.rut} - ${c.razonSocial}`);
        }
        catch (e) {
            console.error(`❌ Error con ${c.rut} - ${c.razonSocial}:`, e?.message ?? e);
        }
    }
    console.log("🏁 Seed de clientes de Camila A01 terminado.");
}
main()
    .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
})
    .finally(async () => {
    prisma.$disconnect();
});
