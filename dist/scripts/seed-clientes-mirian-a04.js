"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/seed-clientes-mirian-a04.ts
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// 👇 Cambia este valor por el id_trabajador real de Mirian en la tabla Trabajador
const MIRIAN_TRABAJADOR_ID = 9;
const clientesMirian = [
    {
        rut: "76.580.596-1",
        razonSocial: "MAAN SPA",
    },
    {
        rut: "77.440.021-4",
        razonSocial: "GALINEA SPA",
    },
    {
        rut: "76.014.262-K",
        razonSocial: "EELAW Medio Ambiente y Energia Asesorias Legales Limitada",
    },
    // Holding CHM
    {
        rut: "76.214.406-9",
        razonSocial: "INVERSIONES CHM SPA",
        alias: "Holding CHM",
    },
    {
        rut: "76.136.204-6",
        razonSocial: "HELARTE RESTAURANTE S.A.",
        alias: "Holding CHM",
    },
    {
        rut: "77.563.437-5",
        razonSocial: "HELARTE RESTAURANTE II SPA",
        alias: "Holding CHM",
    },
    {
        rut: "78.010.552-6",
        razonSocial: "RUBILAR HERMANOS SPA",
        alias: "Holding CHM",
    },
    {
        rut: "77.311.300-9",
        razonSocial: "MAESTRANZA Y PROYECTOS INDUSTRIALES LTDA",
    },
    // Holding Doblegiro
    {
        rut: "77.343.990-7",
        razonSocial: "DOBLEGIRO DISENO Y PUBLICIDAD S A",
        alias: "Holding Doblegiro",
    },
    {
        rut: "76.429.650-8",
        razonSocial: "INVERSIONES TRIO LIMITADA",
        alias: "Holding Doblegiro",
    },
    {
        rut: "77.131.249-7",
        razonSocial: "ARROBA",
        alias: "Holding Doblegiro",
    },
    {
        rut: "76.428.850-5",
        razonSocial: "INVERSIONES CELINA LIMITADA",
        alias: "Holding Doblegiro",
    },
    {
        rut: "77.920.002-7",
        razonSocial: "BUEN CAMINO SPA",
        alias: "Holding Doblegiro",
    },
    {
        rut: "77.919.726-3",
        razonSocial: "ASTORIA SPA",
        alias: "Holding Doblegiro",
    },
    {
        rut: "76.327.846-8",
        razonSocial: "SOCIEDAD DISENO Y FABRICACION MUEBLES OFICINA Y CONSTRUCCION MILENIO O",
    },
    {
        rut: "76.489.793-5",
        razonSocial: "AURA COMERCIAL INDUSTRIAL SPA",
    },
    {
        rut: "77.021.940-K",
        razonSocial: "COMERCIAL INDUSTRIAL MARKET LIMITADA",
    },
    {
        rut: "76.081.006-1",
        razonSocial: "STOUT SPA",
    },
    {
        rut: "77.492.640-2",
        razonSocial: "PANDUIT CHILE Y COMPANIA LIMITADA",
    },
    // Holding FTS
    {
        rut: "77.739.980-2",
        razonSocial: "FTS SPA",
        alias: "Holding FTS",
    },
    {
        rut: "76.103.980-6",
        razonSocial: "INVERSIONES GREENWOOD LIMITADA",
        alias: "Holding FTS",
    },
    {
        rut: "76.256.473-4",
        razonSocial: "EYZAGUIRRE FERNANDEZ Y CIA",
        alias: "Holding FTS",
    },
    {
        rut: "77.355.278-9",
        razonSocial: "LIDITEC SPA",
    },
    // Holding Huerto
    {
        rut: "77.242.614-3",
        razonSocial: "HUERTO URBANO SPA",
        alias: "Holding Huerto",
    },
    {
        rut: "77.827.113-3",
        razonSocial: "IMPULSA MKT SPA",
        alias: "Holding Huerto",
    },
    {
        rut: "77.825.655-K",
        razonSocial: "INVERSIONES GRUPO ARACOSIA SPA",
        alias: "Holding Huerto",
    },
    {
        rut: "78.003.938-8",
        razonSocial: "TRANSPORTES S MARTINEZ SPA",
        alias: "Holding Huerto",
    },
    {
        rut: "76.495.214-6",
        razonSocial: "COMERCIAL SAN ISIDRO SPA",
    },
    {
        rut: "77.851.603-9",
        razonSocial: "BGROUP SPA",
    },
    {
        rut: "78.477.490-2",
        razonSocial: "COMERCIAL E INDUSTRIAL DAGOWAY TRADE SPA",
    },
    {
        rut: "76.795.629-0",
        razonSocial: "ISOTECNICA SPA",
    },
];
async function main() {
    if (!MIRIAN_TRABAJADOR_ID) {
        console.error("❌ Debes configurar MIRIAN_TRABAJADOR_ID con el id_trabajador real de Mirian.");
        process.exit(1);
    }
    console.log("🔹 Insertando clientes de Mirian (CONTA/A04)...");
    for (const c of clientesMirian) {
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
                        agenteId: MIRIAN_TRABAJADOR_ID,
                        codigoCartera: "CONTA/A04",
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
                        agenteId: MIRIAN_TRABAJADOR_ID,
                        codigoCartera: "CONTA/A04",
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
    console.log("🏁 Seed de clientes de Mirian A04 terminado.");
}
main()
    .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
})
    .finally(async () => {
    prisma.$disconnect();
});
