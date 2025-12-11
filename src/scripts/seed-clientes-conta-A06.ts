// src/scripts/seed-clientes-conta-A06.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 👉 Agente titular de la cartera A06 (Andrea)
// Si quieres que el titular sea Jaime (6) o Francisco (11), cambia este ID.
const AGENTE_A06_ID = 13;

const CLIENTES_A06 = [
  { rut: "76.310.535-0", razonSocial: "NOVATRONIC SpA" },
  { rut: "78.125.636-6", razonSocial: "NAW TRAINING LAB SPA" },
  { rut: "76.401.040-K", razonSocial: "Hydrogroup Ingenieria Limitada" },
  { rut: "96.693.430-1", razonSocial: "HIDROGESTION SPA" },
  { rut: "76.991.492-7", razonSocial: "HIDROGESTION CONSTRUCCION SPA" },
  { rut: "76.477.776-K", razonSocial: "ASESORIAS AGUA CALMA LTDA" },
  { rut: "77.270.652-9", razonSocial: "INVERSIONES JPCJ SPA" },
  { rut: "76.174.977-3", razonSocial: "WELKO SPA" },
  {
    rut: "83.575.500-2",
    razonSocial: "LABORATORIO COSMETICO FARMACEUTICO LIMITADA",
  },
  {
    rut: "77.297.870-7",
    razonSocial: "INVERSIONES EDELWEISS CHILE LIMITADA",
  },
  { rut: "81.151.000-9", razonSocial: "VIEIRA AUGUSTO Y CIA LTDA" },
  {
    rut: "76.215.440-4",
    razonSocial: "COSMETICA SECRETOS DEL BOSQUE LIMITADA",
  },
  {
    rut: "76.024.784-7",
    razonSocial:
      "LUIS VIEIRA MARTICORENA INVERSIONES EMP. INDIVIDUAL RESPONSAB. LTDA.",
  },
  { rut: "78.138.990-0", razonSocial: "INVERSIONES SAGARO LIMITADA" },
  {
    rut: "76.356.116-K",
    razonSocial:
      "JOSE VIEIRA INVER. EMPRESA INDIVIDUAL DE RESP. LTDA.",
  },
];

async function main() {
  console.log("🔹 Upsert de clientes CONTA/A06...");

  for (const c of CLIENTES_A06) {
    console.log(`➡️ Procesando ${c.rut} - ${c.razonSocial}`);

    await prisma.cliente.upsert({
      where: {
        rut_razonSocial: {
          rut: c.rut,
          razonSocial: c.razonSocial,
        },
      },
      update: {
        razonSocial: c.razonSocial,
        agenteId: AGENTE_A06_ID,
        codigoCartera: "CONTA/A06",
        activo: true,
      },
      create: {
        rut: c.rut,
        razonSocial: c.razonSocial,
        agenteId: AGENTE_A06_ID,
        codigoCartera: "CONTA/A06",
        activo: true,
      },
    });
  }

  console.log("✅ Clientes A06 listos.");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed clientes A06:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
