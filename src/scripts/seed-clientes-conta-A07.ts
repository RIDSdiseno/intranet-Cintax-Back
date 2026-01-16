// src/scripts/seed-clientes-conta-A07.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 👉 Agente titular de la cartera A07 (Lucas)
// ⚠️ CAMBIA ESTE ID por el id_trabajador real de Lucas
const AGENTE_A07_ID = 16;

const CODIGO_CARTERA = "CONTA/A07";

// ✅ Recomendado: NO borrar, solo desactivar
const HARD_DELETE_MISSING = false;

function normalizeRut(rut: string) {
  const s = (rut ?? "")
    .toString()
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .replace(/–/g, "-")
    .replace(/—/g, "-");
  // normaliza k/K
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

// 🔹 Lista Lucas A07 (según tu excel)
const CLIENTES_A07: ClienteInput[] = [
  // Holding Inv. CyC
  { rut: "77987786-8", razonSocial: "INVERSIONES CYC SpA", alias: "Holding Inv. CyC" },
  { rut: "77929879-5", razonSocial: "INVERSIONES BARCRUJIENTES SPA", alias: "Holding Inv. CyC" },

  // Holding Lacaze
  { rut: "76019167-1", razonSocial: "RAYNAUD-LACAZE LIMITADA", alias: "Holding Lacaze" },
  { rut: "76049454-2", razonSocial: "SOCIEDAD CRAZY WINE LTDA.", alias: "Holding Lacaze" },

  // Holding Prominco
  { rut: "76916167-8", razonSocial: "INGENIERIA E INVERSIONES PROMINCO LTDA.", alias: "Holding Prominco" },
  { rut: "77835208-7", razonSocial: "TRANSPORTES LOGISTICS EXPRESS SPA", alias: "Holding Prominco" },
  { rut: "77638049-0", razonSocial: "HARDMAN", alias: "Holding Prominco" },
  { rut: "77638061-K", razonSocial: "INGENIERIA E INVERSIONES PEARSON SPA.", alias: "Holding Prominco" },
  { rut: "76848603-4", razonSocial: "COMERCIALIZADORA B&L LIMITADA", alias: "Holding Prominco" },
  { rut: "77813403-9", razonSocial: "PROMINCO CHILE LIMITADA", alias: "Holding Prominco" },

  // Holding Trasglobal
  { rut: "76293170-2", razonSocial: "TRASGLOBAL ALIMENTOS S.P.A", alias: "Holding Trasglobal" },
  { rut: "77697681-4", razonSocial: "TRANSGLOBAL CALAMA SPA", alias: "Holding Trasglobal" },
  { rut: "76890610-6", razonSocial: "TRANSGLOBAL LTDA", alias: "Holding Trasglobal" },
  { rut: "76475837-4", razonSocial: "INVERSIONES EL KAKTUS SPA", alias: "Holding Trasglobal" },

  // Holding Trebol
  { rut: "76447053-2", razonSocial: "TREBOL SERVICE SPA", alias: "Holding Trebol" },
  { rut: "77183908-8", razonSocial: "WORKCLEAN SERVICE SPA", alias: "Holding Trebol" },

  // Sin holding
  { rut: "77631408-0", razonSocial: "MOS-IT SERVICIOS INTEGRALES DE TECNOLOGÍA SPA" },
  { rut: "78266168-K", razonSocial: "OCTOPUS BRASIL SPA" },
  { rut: "18105837-4", razonSocial: "MARIO ELIAS PENALOZA PONCE" },
  { rut: "77344938-4", razonSocial: "DISTRIBUIDORA HUEVOS DEL SUR" },
  { rut: "77573169-9", razonSocial: "SIIFE SPA" },
  { rut: "77437581-3", razonSocial: "RIZONDULADA SPA" },

  // Holding Las Parcelas
  { rut: "77677276-3", razonSocial: "GRUPO OBO SPA", alias: "Holding Las Parcelas" },
  { rut: "77712163-4", razonSocial: "INVERSIONES DOMINGO SPA", alias: "Holding Las Parcelas" },
  { rut: "77646876-2", razonSocial: "Inversiones Dilore SpA", alias: "Holding Las Parcelas" },
  { rut: "77367574-0", razonSocial: "Inmobiliaria Fin del Mundo SpA", alias: "Holding Las Parcelas" },
  { rut: "77367577-5", razonSocial: "Inversiones Patagonia Norte SpA", alias: "Holding Las Parcelas" },
  { rut: "77289717-0", razonSocial: "BARON SPA", alias: "Holding Las Parcelas" },
  { rut: "77316892-K", razonSocial: "Boutin SpA", alias: "Holding Las Parcelas" },
  { rut: "77704303-K", razonSocial: "BMA CHILE SPA", alias: "Holding Las Parcelas" },
  { rut: "76706624-4", razonSocial: "INVERSIONES CREDOR CHILE SPA", alias: "Holding Las Parcelas" },
  { rut: "76708407-2", razonSocial: "INVERSIONES CREDOR UY SPA", alias: "Holding Las Parcelas" },

  // Holding Maxcri
  { rut: "76866689-K", razonSocial: "SERVICIOS GENERALES MAXCRI SPA", alias: "Holding Maxcri" },
  { rut: "77763962-5", razonSocial: "ELECRIT SPA", alias: "Holding Maxcri" },
  { rut: "77658461-4", razonSocial: "MAXCRI INTERCOM SPA", alias: "Holding Maxcri" },

  // Holding Shipping
  { rut: "76943333-3", razonSocial: "CSN SHIPPING SPA", alias: "Holding Shipping" },
  { rut: "77312081-1", razonSocial: "SOCIEDAD DE INVERSIONES GRUPO KRONOS SPA", alias: "Holding Shipping" },
  { rut: "77498192-6", razonSocial: "GK CORREDORES DE SEGUROS SPA", alias: "Holding Shipping" },
  { rut: "76790057-0", razonSocial: "BF LOGISTICS SPA", alias: "Holding Shipping" },

  // Sin holding
  { rut: "7583459-4", razonSocial: "PEDRO ALONSO GOMEZ CARTAGENA EIRL" },
];

async function main() {
  if (!AGENTE_A07_ID || AGENTE_A07_ID <= 0) {
    console.log("❌ Debes configurar AGENTE_A07_ID con el id_trabajador real de Lucas.");
    process.exit(1);
  }

  console.log(`🔹 Sync clientes Lucas (${CODIGO_CARTERA}): create/update por rut + limpiar faltantes...`);

  const normalized = CLIENTES_A07.map((c) => ({
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
    where: { agenteId: AGENTE_A07_ID, codigoCartera: CODIGO_CARTERA },
    select: { id: true, rut: true, razonSocial: true },
  });

  // Map rut->id dentro de esta cartera (si hay duplicados en BD, toma el más nuevo)
  const existentes = await prisma.cliente.findMany({
    where: { agenteId: AGENTE_A07_ID, codigoCartera: CODIGO_CARTERA },
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
            rut: c.rut, // deja normalizado
            razonSocial: c.razonSocial,
            alias: c.alias,
            agenteId: AGENTE_A07_ID,
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
            agenteId: AGENTE_A07_ID,
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

  console.log("✅ Clientes A07 listos.");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed clientes A07:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
