// src/scripts/seed-clientes-conta-A06.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 👉 Agente titular de la cartera A06 (Andrea)
const AGENTE_A06_ID = 13;
const CODIGO_CARTERA = "CONTA/A06";

// ✅ Recomendado: NO borrar, solo desactivar
const HARD_DELETE_MISSING = false;

function normalizeRut(rut: string) {
  const s = (rut ?? "").toString().trim().replace(/\./g, "").replace(/\s+/g, "");
  return s.replace(/-k$/i, "-K");
}

function normalizeRS(rs: string) {
  return (rs ?? "").toString().trim();
}

function normalizeAlias(a?: string | null) {
  const s = (a ?? "").toString().trim();
  return s.length ? s : null;
}

type ClienteInput = { rut: string; razonSocial: string; alias?: string | null };

// 🔹 Lista nueva Andrea A06 (según excel)
const CLIENTES_A06: ClienteInput[] = [
  // Holding Hydro
  { rut: "76401040-K", razonSocial: "HYDROGROUP INGENIERIA LIMITADA", alias: "Holding Hydro" },
  { rut: "96693430-1", razonSocial: "HIDROGESTION SPA", alias: "Holding Hydro" },
  { rut: "76991492-7", razonSocial: "HIDROGESTION CONSTRUCCION SPA", alias: "Holding Hydro" },
  { rut: "76477776-K", razonSocial: "ASESORIAS AGUA CALMA LTDA", alias: "Holding Hydro" },
  { rut: "77270652-9", razonSocial: "INVERSIONES JPCJ SPA", alias: "Holding Hydro" },
  { rut: "76174977-3", razonSocial: "WELKO SPA", alias: "Holding Hydro" },

  // Holding Lacofar
  { rut: "76130785-1", razonSocial: "ASESORIAS VILMA PEREZ LIMITADA", alias: "Holding Lacofar" },
  { rut: "83575500-2", razonSocial: "LABORATORIO COSMETICO FARMACEUTICO LIMITADA", alias: "Holding Lacofar" },
  { rut: "77297870-7", razonSocial: "INVERSIONES EDELWEISS CHILE LIMITADA", alias: "Holding Lacofar" },
  { rut: "81151000-9", razonSocial: "VIEIRA AUGUSTO Y CIA LTDA", alias: "Holding Lacofar" },
  { rut: "76215440-4", razonSocial: "COSMETICA SECRETOS DEL BOSQUE LIMITADA", alias: "Holding Lacofar" },
  {
    rut: "76024784-7",
    razonSocial: "LUIS VIEIRA MARTICORENA INVERSIONES EMP.INDIVIDUAL RESPONSAB.LTDA.",
    alias: "Holding Lacofar",
  },
  { rut: "78138990-0", razonSocial: "INVERSIONES SAGARO LIMITADA", alias: "Holding Lacofar" },
  { rut: "76356116-K", razonSocial: "JOSE VIEIRA INVER. EMPRESA INDIVIDUAL DE RESP. LTDA.", alias: "Holding Lacofar" },

  // Holding Las Parcelas
  { rut: "76722104-5", razonSocial: "SANTA ROSA INVERSIONES SPA", alias: "Holding Las Parcelas" },
  { rut: "76805789-3", razonSocial: "ASOR INVERSIONES SPA", alias: "Holding Las Parcelas" },
  { rut: "77285331-9", razonSocial: "INVERSIONES KMDC SPA", alias: "Holding Las Parcelas" },

  // Holding Meathouse
  { rut: "76724057-0", razonSocial: "MEATHOUSE SPA", alias: "Holding Meathouse" },
  { rut: "76516697-7", razonSocial: "MR. GREEN SPA", alias: "Holding Meathouse" },
  {
    rut: "76134386-6",
    razonSocial: "EDUARDO MONTES DE OCA PUBLICIDAD Y COMUNICACIONES E.I.R.L.",
    alias: "Holding Meathouse",
  },

  // Sin holding
  { rut: "77254393-K", razonSocial: "G ALIMENTOS SPA" },
  { rut: "76083591-9", razonSocial: "TIERRAS ROJAS, SERVICIOS INFORMATICOS Y GEOGRAFICOS LTDA" },
  { rut: "76515735-8", razonSocial: "SANTA CATERINA DE SIENA SPA" },
  { rut: "77324577-0", razonSocial: "INGHO FACILITY MANAGEMENT SPA" },
  { rut: "78070774-7", razonSocial: "HOY ES HOY INVERSIONES SPA" },
  { rut: "76310535-0", razonSocial: "NOVATRONIC SPA" },
  { rut: "78125636-6", razonSocial: "NAW TRAINING LAB SPA" },
  {
    rut: "77998275-0",
    razonSocial: "ASESORIAS, SUSTENTABILIDAD INTEGRAL Y COMUNIDADES SEBASTIAN HERRERA KASIC E.I.R.L.",
  },
  { rut: "12485925-5", razonSocial: "FERNANDO JAVIER CARDENAS RIBBA" },
  { rut: "77414282-7", razonSocial: "INVERSIONES LOS PLAYEROS SPA" },
  { rut: "77926595-1", razonSocial: "OPTIFEED SPA" },
  { rut: "77782076-1", razonSocial: "KINEPLUS" },
  { rut: "21934769-3", razonSocial: "KELLY MARTINEZ" },
  { rut: "77839996-2", razonSocial: "COMERCIALIZADORA SUSTINEO SPA" },
];

async function main() {
  console.log(`🔹 Sync clientes Andrea (${CODIGO_CARTERA}): create/update por rut + limpiar faltantes...`);

  const normalized = CLIENTES_A06.map((c) => ({
    rut: normalizeRut(c.rut),
    razonSocial: normalizeRS(c.razonSocial),
    alias: normalizeAlias(c.alias),
  }));

  // Detectar duplicados en la lista
  const counts = new Map<string, number>();
  for (const c of normalized) counts.set(c.rut, (counts.get(c.rut) ?? 0) + 1);
  const duplicados = [...counts.entries()].filter(([, n]) => n > 1);

  if (duplicados.length) {
    console.log("⚠️ Duplicados de RUT en la lista:");
    for (const [rut, n] of duplicados) {
      console.log(`  - ${rut} (x${n})`);
      for (const row of normalized.filter((x) => x.rut === rut)) {
        console.log(`      • ${row.razonSocial}`);
      }
    }
  } else {
    console.log("✅ No hay duplicados de RUT en la lista.");
  }

  const rutSet = new Set(normalized.map((c) => c.rut));

  // Snapshot actuales de esa cartera/agente
  const actuales = await prisma.cliente.findMany({
    where: { agenteId: AGENTE_A06_ID, codigoCartera: CODIGO_CARTERA },
    select: { id: true, rut: true, razonSocial: true },
  });

  // Map rut->id dentro de esta cartera (si hay duplicados en BD, toma el más nuevo)
  const existentes = await prisma.cliente.findMany({
    where: { agenteId: AGENTE_A06_ID, codigoCartera: CODIGO_CARTERA },
    select: { id: true, rut: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const mapRutToId = new Map<string, number>();
  for (const e of existentes) {
    const r = normalizeRut(e.rut);
    if (!mapRutToId.has(r)) mapRutToId.set(r, e.id);
  }

  // Create/Update por rut (sin upsert)
  for (const c of normalized) {
    try {
      const existingId = mapRutToId.get(c.rut);

      if (existingId) {
        await prisma.cliente.update({
          where: { id: existingId },
          data: {
            razonSocial: c.razonSocial,
            alias: c.alias,
            agenteId: AGENTE_A06_ID,
            codigoCartera: CODIGO_CARTERA,
            activo: true,
          },
        });
        console.log(`🔁 Update: ${c.rut} - ${c.razonSocial}`);
      } else {
        const created = await prisma.cliente.create({
          data: {
            rut: c.rut,
            razonSocial: c.razonSocial,
            alias: c.alias,
            agenteId: AGENTE_A06_ID,
            codigoCartera: CODIGO_CARTERA,
            activo: true,
          },
        });
        mapRutToId.set(c.rut, created.id);
        console.log(`✅ Create: ${c.rut} - ${c.razonSocial}`);
      }
    } catch (e: any) {
      console.error(`❌ Error con ${c.rut} - ${c.razonSocial}:`, e?.message ?? e);
    }
  }

  // Limpiar faltantes (soft delete o hard delete)
  const faltantes = actuales.filter((a) => !rutSet.has(normalizeRut(a.rut)));

  console.log(`🧹 Faltantes (en BD y no en lista nueva): ${faltantes.length}`);

  if (faltantes.length) {
    if (HARD_DELETE_MISSING) {
      console.log("⚠️ HARD_DELETE_MISSING=true -> Eliminando faltantes...");
      for (const f of faltantes) {
        await prisma.cliente.delete({ where: { id: f.id } });
        console.log(`🗑️ DELETE: ${f.rut} - ${f.razonSocial}`);
      }
    } else {
      console.log("✅ Soft delete -> activo=false para faltantes...");
      await prisma.cliente.updateMany({
        where: { id: { in: faltantes.map((f) => f.id) } },
        data: { activo: false },
      });
    }
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
