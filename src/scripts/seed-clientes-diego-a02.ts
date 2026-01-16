// src/scripts/seed-clientes-diego-a02.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 🔹 id_trabajador de Diego (CONTA/A02)
const DIEGO_TRABAJADOR_ID = 8;

// 🔹 Config cartera
const CODIGO_CARTERA = "CONTA/A02";

// ✅ Recomendado: NO borrar, solo desactivar (activo=false)
const HARD_DELETE_MISSING = false;

/**
 * Normaliza RUT:
 * - quita puntos y espacios
 * - K mayúscula
 */
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

// 🔹 Lista nueva Diego A02 (rut + razón social + holding opcional en alias)
const clientesDiego: { rut: string; razonSocial: string; alias?: string | null }[] = [
  // Holding Aquiles Revello
  {
    rut: "76510966-3",
    razonSocial: "AQUILES JULIO REVELLO CAVADA SERVICIOS DE INGENIERIA E.I.R.L.",
    alias: "Holding Aquiles Revello",
  },
  { rut: "76548117-1", razonSocial: "TRANSPORTE REVELAZO LIMITADA", alias: "Holding Aquiles Revello" },
  { rut: "76617986-K", razonSocial: "PRODUCTORA VODKA SPA", alias: "Holding Aquiles Revello" },
  { rut: "76708261-4", razonSocial: "CAFÉ AQUILES REVELLO CAVADA EIRL", alias: "Holding Aquiles Revello" },

  // Holding CHM
  { rut: "76214406-9", razonSocial: "INVERSIONES CHM SPA", alias: "Holding CHM" },
  { rut: "76136204-6", razonSocial: "HELARTE RESTAURANTE S.A.", alias: "Holding CHM" },
  { rut: "77563437-5", razonSocial: "HELARTE RESTAURANTE II SPA", alias: "Holding CHM" },
  { rut: "78010552-6", razonSocial: "RUBILAR HERMANOS SPA", alias: "Holding CHM" },

  // Holding M de M
  { rut: "76822745-4", razonSocial: "M DE M SPA", alias: "Holding M de M" },
  { rut: "76792496-8", razonSocial: "IRMALE SPA", alias: "Holding M de M" },

  // Holding Matech
  { rut: "76538396-K", razonSocial: "MATECH SPA", alias: "Holding Matech" },
  { rut: "77810328-1", razonSocial: "STORACK SPA", alias: "Holding Matech" },

  // Holding Serv. Medicos
  {
    rut: "77572652-0",
    razonSocial: "SERVICIOS MEDICOS INTEGRALES UTM ARICA NORTE SPA",
    alias: "Holding Serv. Medicos",
  },
  {
    rut: "77572655-5",
    razonSocial: "SERVICIOS MEDICOS INTEGRALES UTM PUNTA ARENAS PIONEROS SPA",
    alias: "Holding Serv. Medicos",
  },
  {
    rut: "77572657-1",
    razonSocial: "SERVICIOS MEDICOS INTEGRALES UTM QUILPUE BELLOTO SPA",
    alias: "Holding Serv. Medicos",
  },
  { rut: "77470211-3", razonSocial: "SERVICIOS MEDICOS INTEGRALES SPA", alias: "Holding Serv. Medicos" },
  { rut: "77579795-9", razonSocial: "INTERNATIONALMEDICAL SERVICE SPA", alias: "Holding Serv. Medicos" },

  // Holding Silacor
  { rut: "76881630-1", razonSocial: "ALFOMBRADOS SILACOR LARRAIN LTDA", alias: "Holding Silacor" },
  { rut: "77257654-4", razonSocial: "MG MATERIALES NATURALES LIMITADA", alias: "Holding Silacor" },
  { rut: "76289410-6", razonSocial: "AGRICOLA MARIA AMALIA LIMITADA", alias: "Holding Silacor" },
  { rut: "76719280-0", razonSocial: "SOCIEDAD DE INVERSIONES SAN MANUEL LIMITADA", alias: "Holding Silacor" },

  // Sin holding
  { rut: "76054761-1", razonSocial: "SCHMIDT, PULIDO Y MUNOZ SPA" },
  { rut: "76178353-K", razonSocial: "COMERCIAL MAR FUTURO SPA" },
  { rut: "76378141-0", razonSocial: "SOCIEDAD MEDICA NEVERIA LIMITADA" },
  { rut: "77092852-4", razonSocial: "MAS DEPORTE SPA" },
  { rut: "76252754-5", razonSocial: "GOBIKES SPA" },
  { rut: "77026173-2", razonSocial: "COMERCIAL E IMPORTADORA MERIDIAN CORP SPA" },
  { rut: "77538963-K", razonSocial: "KENTHA SERVICIOS SPA" },
  { rut: "76684645-9", razonSocial: "IMPRECORP SPA" },
];

async function main() {
  console.log("🔹 Sync clientes Diego (CONTA/A02): create/update por rut + limpiar faltantes...");

  const normalized = clientesDiego.map((c) => ({
    rut: normalizeRut(c.rut),
    razonSocial: normalizeRS(c.razonSocial),
    alias: normalizeAlias(c.alias),
  }));

  // ✅ Detectar duplicados de RUT en la lista (por si el excel trae rut repetido)
  const counts = new Map<string, number>();
  for (const c of normalized) counts.set(c.rut, (counts.get(c.rut) ?? 0) + 1);

  const duplicados = [...counts.entries()].filter(([, n]) => n > 1);
  if (duplicados.length) {
    console.log("⚠️ Duplicados de RUT en la lista:");
    for (const [rut, n] of duplicados) {
      console.log(`  - ${rut} (x${n}) =>`);
      for (const row of normalized.filter((x) => x.rut === rut)) {
        console.log(`      • ${row.razonSocial}`);
      }
    }
  } else {
    console.log("✅ No hay duplicados de RUT en la lista.");
  }

  const rutSet = new Set(normalized.map((c) => c.rut));

  // 1) Snapshot actuales de esa cartera/agente (para limpiar)
  const actuales = await prisma.cliente.findMany({
    where: { agenteId: DIEGO_TRABAJADOR_ID, codigoCartera: CODIGO_CARTERA },
    select: { id: true, rut: true, razonSocial: true },
  });

  // 2) Map rut->id dentro de esta cartera (si hay duplicados en BD, tomamos el más nuevo)
  const existentes = await prisma.cliente.findMany({
    where: { agenteId: DIEGO_TRABAJADOR_ID, codigoCartera: CODIGO_CARTERA },
    select: { id: true, rut: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const mapRutToId = new Map<string, number>();
  for (const e of existentes) {
    const r = normalizeRut(e.rut);
    if (!mapRutToId.has(r)) mapRutToId.set(r, e.id); // primero = más nuevo
  }

  // 3) Create/Update por rut (SIN upsert)
  for (const c of normalized) {
    try {
      const existingId = mapRutToId.get(c.rut);

      if (existingId) {
        await prisma.cliente.update({
          where: { id: existingId },
          data: {
            razonSocial: c.razonSocial,
            alias: c.alias,
            agenteId: DIEGO_TRABAJADOR_ID,
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
            agenteId: DIEGO_TRABAJADOR_ID,
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

  // 4) Limpiar faltantes
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

  console.log("🏁 Seed/sync de clientes Diego A02 terminado.");
}

main()
  .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
