// src/scripts/seed-clientes-mirian-a04.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 🔹 id_trabajador de Mirian (CONTA/A04)
const MIRIAN_TRABAJADOR_ID = 9;

// 🔹 Config cartera
const CODIGO_CARTERA = "CONTA/A04";

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

// 🔹 Lista nueva Mirian A04 (según Excel)
const clientesMirian: ClienteInput[] = [
  // Holding Doblegiro
  { rut: "77343990-7", razonSocial: "DOBLEGIRO DISENO Y PUBLICIDAD S A", alias: "Holding Doblegiro" },
  { rut: "76429650-8", razonSocial: "INVERSIONES TRIO LIMITADA", alias: "Holding Doblegiro" },
  { rut: "77131249-7", razonSocial: "ARROBA", alias: "Holding Doblegiro" },
  { rut: "76428850-5", razonSocial: "INVERSIONES CELINA LIMITADA", alias: "Holding Doblegiro" },
  { rut: "77920002-7", razonSocial: "BUEN CAMINO SPA", alias: "Holding Doblegiro" },
  { rut: "77919726-3", razonSocial: "ASTORIA SPA", alias: "Holding Doblegiro" },

  // ✅ RUT único (evitamos duplicado con otra variante de texto)
  {
    rut: "76014262-K",
    razonSocial: "EELAW MEDIO AMBIENTE Y ENERGIA ASESORIAS LEGALES LIMITADA",
    alias: "Holding Doblegiro",
  },

  // Holding FTS
  { rut: "77739980-2", razonSocial: "FTS SPA", alias: "Holding FTS" },
  { rut: "76103980-6", razonSocial: "INVERSIONES GREENWOOD LIMITADA", alias: "Holding FTS" },
  { rut: "76256473-4", razonSocial: "EYZAGUIRRE FERNANDEZ Y CIA", alias: "Holding FTS" },

  // Holding Huerto Urbano
  { rut: "77242614-3", razonSocial: "HUERTO URBANO SPA", alias: "Holding Huerto Urbano" },
  { rut: "77827113-3", razonSocial: "IMPULSA MKT SPA", alias: "Holding Huerto Urbano" },
  { rut: "77825655-K", razonSocial: "INVERSIONES GRUPO ARACOSIA SPA", alias: "Holding Huerto Urbano" },
  { rut: "78003938-8", razonSocial: "TRANSPORTES S MARTINEZ SPA", alias: "Holding Huerto Urbano" },

  // Sin holding
  { rut: "76580596-1", razonSocial: "MAAN SPA" },
  { rut: "77440021-4", razonSocial: "GALINEA SPA" },
  { rut: "77311300-9", razonSocial: "MAESTRANZA Y PROYECTOS INDUSTRIALES LTDA" },
  {
    rut: "76327846-8",
    razonSocial: "SOCIEDAD DISENO Y FABRICACION MUEBLES OFICINA Y CONSTRUCCION MILENIO O",
  },
  { rut: "76489793-5", razonSocial: "AURA COMERCIAL INDUSTRIAL SPA" },
  { rut: "77021940-K", razonSocial: "COMERCIAL INDUSTRIAL MARKET LIMITADA" },
  { rut: "76081006-1", razonSocial: "STOUT SPA" },
  { rut: "76495214-6", razonSocial: "COMERCIAL SAN ISIDRO SPA" },
  { rut: "77851603-9", razonSocial: "BGROUP SPA" },
  { rut: "78477490-2", razonSocial: "COMERCIAL E INDUSTRIAL DAGOWAY TRADE SPA" },
  { rut: "76795629-0", razonSocial: "ISOTECNICA SPA" },
];

async function main() {
  console.log(`🔹 Sync clientes Mirian (${CODIGO_CARTERA}): create/update por rut + limpiar faltantes...`);

  const normalized = clientesMirian.map((c) => ({
    rut: normalizeRut(c.rut),
    razonSocial: normalizeRS(c.razonSocial),
    alias: normalizeAlias(c.alias),
  }));

  // Detectar duplicados dentro de la lista (por rut)
  const counts = new Map<string, number>();
  for (const c of normalized) counts.set(c.rut, (counts.get(c.rut) ?? 0) + 1);
  const duplicados = [...counts.entries()].filter(([, n]) => n > 1);

  if (duplicados.length) {
    console.log("⚠️ Duplicados de RUT en la lista A04:");
    for (const [rut, n] of duplicados) {
      console.log(`  - ${rut} (x${n})`);
      for (const row of normalized.filter((x) => x.rut === rut)) {
        console.log(`      • ${row.razonSocial}`);
      }
    }
  } else {
    console.log("✅ No hay duplicados de RUT en la lista A04.");
  }

  const rutSet = new Set(normalized.map((c) => c.rut));

  // 1) Snapshot actuales de esa cartera/agente
  const actuales = await prisma.cliente.findMany({
    where: { agenteId: MIRIAN_TRABAJADOR_ID, codigoCartera: CODIGO_CARTERA },
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
            agenteId: MIRIAN_TRABAJADOR_ID,
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
            agenteId: MIRIAN_TRABAJADOR_ID,
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

  // 3) Limpiar faltantes: estaban asignados a Mirian A04 pero ya no vienen
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

  console.log("🏁 Seed/sync de clientes Mirian A04 terminado.");
}

main()
  .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
