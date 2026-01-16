// src/scripts/seed-clientes-patricio-a05.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 🔹 Patricio (CONTA/A05)
const PATRICIO_TRABAJADOR_ID = 10;

// 🔹 Config cartera
const CODIGO_CARTERA = "CONTA/A05";

// ✅ Recomendado: NO borrar, solo desactivar (activo=false)
const HARD_DELETE_MISSING = false;

/**
 * Normaliza RUT:
 * - quita puntos y espacios
 * - deja guion
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

type ClienteInput = {
  rut: string;
  razonSocial: string;
  alias?: string | null;
};

// 🔹 Lista nueva Patricio A05 (según Excel)
const clientesPatricio: ClienteInput[] = [
  // Holding Gilltam (alias según excel: "Holding Gilltam")
  { rut: "76366682-4", razonSocial: "GILLTAM SPA", alias: "Holding Gilltam" },
  { rut: "77597691-8", razonSocial: "GILLIBRAND DIGITAL SPA", alias: "Holding Gilltam" },
  { rut: "77750319-7", razonSocial: "GILLIBRAND IMPORTACIONES SPA", alias: "Holding Gilltam" },

  // Sin holding
  { rut: "76959873-1", razonSocial: "INVERSIONES CHACON MOLER SPA" },
  { rut: "76484811-K", razonSocial: "SERVICIOS DE ENFERMERÍA ASISTENCIAL CMCD SPA" },
  { rut: "77226952-8", razonSocial: "INGENIERIA, CONSTRUCCION Y SERVICIOS MINEL SPA" },
  { rut: "76912587-6", razonSocial: "SERVICIO AUTOMOTRIZ JM SPA" },
  { rut: "76290398-9", razonSocial: "MIDE SERVICIOS DE INGENIERÍA DE TRÁNSITO LIMITADA" },
  { rut: "76111716-5", razonSocial: "SOCIEDAD DE INVERSIONES TRIPLE ZETA LIMITADA" },
  { rut: "76386102-3", razonSocial: "SOCIEDAD COMERCIALIZADORA Y PUBLICITARIA AYALA SPA" },
  { rut: "79505530-4", razonSocial: "PRODUCTORA DE SEGUROS ACONCAGUA SPA" },
  { rut: "77996996-7", razonSocial: "FULLGRAF SPA" },
  { rut: "77203453-9", razonSocial: "SERVICIOS ACUICOLAS RIO ROSSELOT SPA" },

  // Holding Hassi
  { rut: "76447290-K", razonSocial: "IMPORTADORA Y COMERCIALIZADORA HASSI SPA", alias: "Holding Hassi" },
  { rut: "76281127-8", razonSocial: "IMPORTADORA Y COMERCIALIZADORA FIRSTPACK SPA", alias: "Holding Hassi" },
  { rut: "77618912-K", razonSocial: "IMPORTADORA Y COMERCIALIZADORA TALPACK SPA", alias: "Holding Hassi" },
  { rut: "76902138-8", razonSocial: "IMPORTADORA Y COMERCIALIZADORA ALQUIPACK SPA", alias: "Holding Hassi" },
  { rut: "76190132-K", razonSocial: "TRANSPORTES JHS SPA", alias: "Holding Hassi" },
  { rut: "82185300-1", razonSocial: "HASSI E HIJOS LTDA", alias: "Holding Hassi" },
  { rut: "76324843-7", razonSocial: "INVERSIONES RAPELE SPA", alias: "Holding Hassi" },
  { rut: "76793616-8", razonSocial: "INVERJONIC SPA", alias: "Holding Hassi" },
  { rut: "78014384-3", razonSocial: "IMPORTADORA Y COMERCIALIZADORA PREGIATA SPA", alias: "Holding Hassi" },
  { rut: "78003922-1", razonSocial: "IMPORTADORA Y COMERCIALIZADORA PUERTOPACK SPA", alias: "Holding Hassi" },
  { rut: "77956388-K", razonSocial: "INVERSIONES REFRAMA SPA", alias: "Holding Hassi" },
  { rut: "76623094-6", razonSocial: "INVERSOL INMOBILIARIA SPA", alias: "Holding Hassi" },

  // Holding Las Parcelas
  { rut: "76788299-8", razonSocial: "INVERSIONES MABA SPA", alias: "Holding Las Parcelas" },
  { rut: "77587546-1", razonSocial: "AGRICOLA MABA SPA", alias: "Holding Las Parcelas" },
  { rut: "76979142-6", razonSocial: "INMOBILIARIA ISLA SPA", alias: "Holding Las Parcelas" },

  // Sin holding
  { rut: "77492640-2", razonSocial: "PANDUIT CHILE Y COMPANIA LIMITADA" },
];

async function main() {
  console.log(`🔹 Sync clientes Patricio (${CODIGO_CARTERA}): create/update por rut + limpiar faltantes...`);

  const normalized = clientesPatricio.map((c) => ({
    rut: normalizeRut(c.rut),
    razonSocial: normalizeRS(c.razonSocial),
    alias: normalizeAlias(c.alias),
  }));

  // Detectar duplicados dentro de la lista (por rut)
  const counts = new Map<string, number>();
  for (const c of normalized) counts.set(c.rut, (counts.get(c.rut) ?? 0) + 1);
  const duplicados = [...counts.entries()].filter(([, n]) => n > 1);

  if (duplicados.length) {
    console.log("⚠️ Duplicados de RUT en la lista A05:");
    for (const [rut, n] of duplicados) {
      console.log(`  - ${rut} (x${n})`);
      for (const row of normalized.filter((x) => x.rut === rut)) {
        console.log(`      • ${row.razonSocial}`);
      }
    }
  } else {
    console.log("✅ No hay duplicados de RUT en la lista A05.");
  }

  const rutSet = new Set(normalized.map((c) => c.rut));

  // 1) Snapshot actuales de esa cartera/agente (para limpiar)
  const actuales = await prisma.cliente.findMany({
    where: { agenteId: PATRICIO_TRABAJADOR_ID, codigoCartera: CODIGO_CARTERA },
    select: { id: true, rut: true, razonSocial: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  // Map rut->id dentro de esta cartera (si hay duplicados en BD, toma el más nuevo)
  const mapRutToId = new Map<string, number>();
  for (const a of actuales) {
    const r = normalizeRut(a.rut);
    if (!mapRutToId.has(r)) mapRutToId.set(r, a.id);
  }

  // 2) Create/Update por rut (sin upsert)
  for (const c of normalized) {
    try {
      const existingId = mapRutToId.get(c.rut);

      if (existingId) {
        await prisma.cliente.update({
          where: { id: existingId },
          data: {
            razonSocial: c.razonSocial,
            alias: c.alias,
            agenteId: PATRICIO_TRABAJADOR_ID,
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
            agenteId: PATRICIO_TRABAJADOR_ID,
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

  // 3) Limpiar faltantes: estaban asignados a Patricio A05 pero ya no vienen
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

  console.log("🏁 Seed/sync de clientes Patricio A05 terminado.");
}

main()
  .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
