"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/seed-clientes-jaime-a03.ts
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// 🔹 id_trabajador de Jaime (CONTA/A03)
const JAIME_TRABAJADOR_ID = 6; // 👈 ya me dijiste que es 6
const clientesJaime = [
    {
        rut: "77.254.393-K",
        razonSocial: "G ALIMENTOS SPA",
    },
    {
        rut: "76.083.591-9",
        razonSocial: "Tierras Rojas, Servicios Informaticos y Geograficos Limitada",
    },
    // Holding 2TH
    {
        rut: "76.392.767-9",
        razonSocial: "CONSTRUTORA 2TH LIMITADA",
        alias: "Holding 2TH",
    },
    {
        rut: "77.586.141-K",
        razonSocial: "INGENIERIA CRUZ DEL SUR SPA",
        alias: "Holding 2TH",
    },
    {
        rut: "77.324.577-0",
        razonSocial: "INGHO FACILITY MANAGEMENT SPA",
    },
    // Holding Meathouse
    {
        rut: "76.724.057-0",
        razonSocial: "MEATHOUSE SPA",
        alias: "Holding Meathouse",
    },
    {
        rut: "76.134.386-6",
        razonSocial: "EDUARDO MONTES DE OCA PUBLICIDAD Y COMUNICACIONES E.I.R.L.",
        alias: "Holding Meathouse",
    },
    {
        rut: "76.788.299-8",
        razonSocial: "INVERSIONES MABA SPA",
    },
    // Holding Maba
    {
        rut: "77.587.546-1",
        razonSocial: "AGRICOLA MABA SPA",
        alias: "Holding Maba",
    },
    {
        rut: "76.979.142-6",
        razonSocial: "INMOBILIARIA ISLA SPA",
        alias: "Holding Maba",
    },
    {
        rut: "77.677.276-3",
        razonSocial: "GRUPO OBO SPA",
        alias: "Holding Maba",
    },
    {
        rut: "77.712.163-4",
        razonSocial: "INVERSIONES DOMINGO SPA",
        alias: "Holding Maba",
    },
    {
        rut: "76.722.104-5",
        razonSocial: "Santa Rosa Inversiones SpA",
        alias: "Holding Maba",
    },
    {
        rut: "76.805.789-3",
        razonSocial: "Asor Inversiones SpA",
    },
    {
        rut: "77.646.876-2",
        razonSocial: "Inversiones Dilore SpA",
    },
    {
        rut: "77.367.574-0",
        razonSocial: "Inmobiliaria Fin del Mundo SpA",
    },
    {
        rut: "77.367.577-5",
        razonSocial: "Inversiones Patagonia Norte SpA",
    },
    {
        rut: "77.289.717-0",
        razonSocial: "BARON SPA",
    },
    {
        rut: "77.316.892-K",
        razonSocial: "Boutin SpA",
    },
    {
        rut: "77.704.303-K",
        razonSocial: "BMA CHILE SPA",
    },
    {
        rut: "76.706.624-4",
        razonSocial: "INVERSIONES CREDOR CHILE SPA",
    },
    {
        rut: "76.708.407-2",
        razonSocial: "INVERSIONES CREDOR UY SPA",
    },
    {
        rut: "78.000.678-1",
        razonSocial: "TU MÓDULO SPA",
    },
    {
        rut: "77.285.331-9",
        razonSocial: "INVERSIONES KMDC SPA",
    },
    // Holding Falc
    {
        rut: "76.029.807-7",
        razonSocial: "Comercial Falc Chile SPA",
        alias: "Holding Falc",
    },
    {
        rut: "77.952.575-9",
        razonSocial: "INVERSIONES E INMOBILIARIA FREDDY ALCARAZ CABEZAS SPA",
        alias: "Holding Falc",
    },
    {
        rut: "78.070.774-7",
        razonSocial: "HOY ES HOY INVERSIONES SPA",
    },
    // Holding Hassi
    {
        rut: "76.447.290-K",
        razonSocial: "IMPORTADORA Y COMERCIALIZADORA HASSI SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "76.281.127-8",
        razonSocial: "IMPORTADORA Y COMERCIALIZADORA FIRSTPACK SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "77.618.912-K",
        razonSocial: "IMPORTADORA Y COMERCIALIZADORA TALPACK SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "76.902.138-8",
        razonSocial: "IMPORTADORA Y COMERCIALIZADORA ALQUIPACK SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "76.190.132-K",
        razonSocial: "TRANSPORTES JHS SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "82.185.300-1",
        razonSocial: "HASSI E HIJOS LTDA",
        alias: "Holding Hassi",
    },
    {
        rut: "76.324.843-7",
        razonSocial: "INVERSIONES RAPELE SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "76.793.616-8",
        razonSocial: "INVERJONIC SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "78.014.384-3",
        razonSocial: "IMPORTADORA Y COMERCIALIZADORA PREGIATA SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "78.003.922-1",
        razonSocial: "IMPORTADORA Y COMERCIALIZADORA PUERTOPACK SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "77.956.388-K",
        razonSocial: "INVERSIONES REFRAMA SPA",
        alias: "Holding Hassi",
    },
    {
        rut: "76.044.062-0",
        razonSocial: "INVERSOL INMOBILIARIA SPA",
        alias: "Holding Hassi",
    },
    // Holding Maxcri
    {
        rut: "76.866.689-K",
        razonSocial: "SERVICIOS GENERALES MAXCRI SPA",
        alias: "Holding Maxcri",
    },
    {
        rut: "77.763.962-5",
        razonSocial: "ELECRIT SPA",
        alias: "Holding Maxcri",
    },
    {
        rut: "77.658.461-4",
        razonSocial: "MAXCRI INTERCOM SPA",
        alias: "Holding Maxcri",
    },
    {
        rut: "76.130.785-1",
        razonSocial: "ASESORIAS VILMA PEREZ LIMITADA",
    },
];
async function main() {
    console.log("🔹 Insertando clientes de Jaime (CONTA/A03)...");
    for (const c of clientesJaime) {
        try {
            // Buscamos por combinación rut + razón social
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
                        agenteId: JAIME_TRABAJADOR_ID,
                        codigoCartera: "CONTA/A03",
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
                        agenteId: JAIME_TRABAJADOR_ID,
                        codigoCartera: "CONTA/A03",
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
    console.log("🏁 Seed de clientes de Jaime A03 terminado.");
}
main()
    .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
})
    .finally(async () => {
    prisma.$disconnect();
});
