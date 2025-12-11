"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/seed-clientes-diego-a02.ts
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// 🔹 id_trabajador de Diego (CONTA/A02)
const DIEGO_TRABAJADOR_ID = 8; // 👈 ajusta si Diego tiene otro id
// 🔹 Clientes de la cartera de Diego (CONTA/A02)
const clientesDiego = [
    {
        rut: "76.054.761-1",
        razonSocial: "SCHMIDT, PULIDO Y MUNOZ SPA",
    },
    // Holding M de M
    {
        rut: "76.822.745-4",
        razonSocial: "M DE M SPA",
        alias: "Holding M de M",
    },
    {
        rut: "76.792.496-8",
        razonSocial: "IRMALE SPA",
        alias: "Holding M de M",
    },
    {
        rut: "76.178.353-K",
        razonSocial: "Comercial Mar Futuro SPA",
    },
    {
        rut: "76.515.735-8",
        razonSocial: "Santa Caterina de Siena SpA",
    },
    // Holding CSN
    {
        rut: "76.943.333-3",
        razonSocial: "CSN SHIPPING SPA",
        alias: "Holding CSN",
    },
    {
        rut: "77.312.081-1",
        razonSocial: "SOCIEDAD DE INVERSIONES GRUPO KRONOS SPA",
        alias: "Holding CSN",
    },
    {
        rut: "77.498.192-6",
        razonSocial: "GK CORREDORES DE SEGUROS SPA",
        alias: "Holding CSN",
    },
    {
        rut: "76.790.057-0",
        razonSocial: "BF LOGISTICS SPA",
        alias: "Holding CSN",
    },
    // Holding Aquiles
    {
        rut: "76.510.966-3",
        razonSocial: "AQUILES JULIO REVELLO CAVADA SERVICIOS DE INGENIERIA E.I.R.L.",
        alias: "Holding Aquiles",
    },
    {
        rut: "76.548.117-1",
        razonSocial: "TRANSPORTE REVELAZO LIMITADA",
        alias: "Holding Aquiles",
    },
    {
        rut: "76.617.986-K",
        razonSocial: "PRODUCTORA VODKA SPA",
        alias: "Holding Aquiles",
    },
    {
        rut: "76.708.261-4",
        razonSocial: "CAFÉ AQUILES REVELLO CAVADA EIRL",
        alias: "Holding Aquiles",
    },
    {
        rut: "76.378.141-0",
        razonSocial: "SOCIEDAD MEDICA NEVERIA LIMITADA",
    },
    // Holding Matech
    {
        rut: "76.538.396-K",
        razonSocial: "MATECH SPA",
        alias: "Holding Matech",
    },
    {
        rut: "77.810.328-1",
        razonSocial: "STORACK SPA",
        alias: "Holding Matech",
    },
    {
        rut: "77.092.852-4",
        razonSocial: "MAS DEPORTE SPA",
    },
    // Holding SMI
    {
        rut: "77.572.652-0",
        razonSocial: "SERVICIOS MEDICOS INTEGRALES UTM ARICA NORTE SPA",
        alias: "Holding SMI",
    },
    {
        rut: "77.572.655-5",
        razonSocial: "SERVICIOS MEDICOS INTEGRALES UTM PUNTA ARENAS PIONEROS SPA",
        alias: "Holding SMI",
    },
    {
        rut: "77.572.657-1",
        razonSocial: "SERVICIOS MEDICOS INTEGRALES UTM QUILPUE BELLOTO SPA",
        alias: "Holding SMI",
    },
    {
        rut: "77.470.211-3",
        razonSocial: "SERVICIOS MEDICOS INTEGRALES SPA",
        alias: "Holding SMI",
    },
    {
        rut: "77.579.795-9",
        razonSocial: "INTERNATIONALMEDICAL SERVICE SPA",
        alias: "Holding SMI",
    },
    // Holding Silacor
    {
        rut: "76.881.630-1",
        razonSocial: "ALFOMBRADOS SILACOR LARRAIN LTDA",
        alias: "Holding Silacor",
    },
    {
        rut: "77.257.654-4",
        razonSocial: "MG MATERIALES NATURALES LIMITADA",
        alias: "Holding Silacor",
    },
    {
        rut: "76.289.410-6",
        razonSocial: "AGRICOLA MARIA AMALIA LIMITADA",
        alias: "Holding Silacor",
    },
    {
        rut: "76.719.280-0",
        razonSocial: "SOCIEDAD DE INVERSIONES SAN MANUEL LIMITADA",
        alias: "Holding Silacor",
    },
    {
        rut: "76.252.754-5",
        razonSocial: "GOBIKES SPA",
    },
    {
        rut: "77.026.173-2",
        razonSocial: "COMERCIAL E IMPORTADORA MERIDIAN CORP SPA",
    },
];
async function main() {
    console.log("🔹 Insertando clientes de Diego (CONTA/A02)...");
    for (const c of clientesDiego) {
        try {
            // Buscar si ya existe por rut + razonSocial
            const existente = await prisma.cliente.findFirst({
                where: {
                    rut: c.rut,
                    razonSocial: c.razonSocial,
                },
            });
            if (existente) {
                await prisma.cliente.update({
                    where: { id: existente.id },
                    data: {
                        alias: c.alias ?? null,
                        agenteId: DIEGO_TRABAJADOR_ID,
                        codigoCartera: "CONTA/A02",
                        activo: true,
                    },
                });
                console.log(`🔁 Actualizado: ${c.rut} - ${c.razonSocial}`);
            }
            else {
                await prisma.cliente.create({
                    data: {
                        rut: c.rut,
                        razonSocial: c.razonSocial,
                        alias: c.alias ?? null,
                        agenteId: DIEGO_TRABAJADOR_ID,
                        codigoCartera: "CONTA/A02",
                        activo: true,
                    },
                });
                console.log(`✅ Creado: ${c.rut} - ${c.razonSocial}`);
            }
        }
        catch (e) {
            console.error(`❌ Error con ${c.rut} - ${c.razonSocial}:`, e?.message ?? e);
        }
    }
    console.log("🏁 Seed de clientes de Diego A02 terminado.");
}
main()
    .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
})
    .finally(async () => {
    prisma.$disconnect();
});
