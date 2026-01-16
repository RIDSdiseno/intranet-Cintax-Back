// src/scripts/seed-clientes-camila-a01.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 🔹 id_trabajador de Camila (CONTA/A01)
const CAMILA_TRABAJADOR_ID = 7;

// 🔹 Config cartera
const CODIGO_CARTERA = "CONTA/A01";

// ✅ Recomendado: NO borrar, solo desactivar (activo=false)
const HARD_DELETE_MISSING = false;

/**
 * Normaliza RUT:
 * - quita puntos y espacios
 * - deja guion si viene
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

// 🔹 Lista nueva Camila A01
const clientesCamila: { rut: string; razonSocial: string; alias?: string | null }[] = [
  // Holding Aislacel
  { rut: "76876439-5", razonSocial: "AISLACEL SPA", alias: "Holding Aislacel" },
  { rut: "76366289-6", razonSocial: "MED ENERGIA SPA", alias: "Holding Aislacel" },
  {
    rut: "77092057-4",
    razonSocial: "EMPRESA DE FABRICACIÓN E IMPORTACIÓN DE AISLANTES TÉRMICOS SPA",
    alias: "Holding Aislacel",
  },

  // Holding El Trbol
  { rut: "76274504-6", razonSocial: "COMERCIAL HC LIMITADA", alias: "Holding El Trbol" },
  { rut: "76972874-0", razonSocial: "COMERCIAL BRAS LIMITADA", alias: "Holding El Trbol" },
  { rut: "76001158-4", razonSocial: "ECOPACTO", alias: "Holding El Trbol" },
  {
    rut: "76001158-4",
    razonSocial: "TRATAMIENTO DE RESIDUOS INDUSTRIALES LIMITADA",
    alias: "Holding El Trbol",
  },

  // Holding Estrategicamente
  { rut: "76189072-7", razonSocial: "ESTRATEGICAMENTE SPA", alias: "Holding Estrategicamente" },
  { rut: "96788070-1", razonSocial: "INVERSIONES AVALON SPA", alias: "Holding Estrategicamente" },
  { rut: "96788070-1", razonSocial: "INVERSIONES LOURDES SPA", alias: "Holding Estrategicamente" },

  // Holding Global Advisory
  { rut: "76706316-4", razonSocial: "GLOBAL ADVISORY AND INVESTMENT SPA", alias: "Holding Global Advisory" },
  { rut: "76598868-3", razonSocial: "INMOBILIARIA E INVERSIONES WILSON SPA", alias: "Holding Global Advisory" },

  // Holding Inmobiliarias
  { rut: "65144829-8", razonSocial: "CORPORACION EDUCACIONAL RODRIGUEZ CORNEJO", alias: "Holding Inmobiliarias" },
  {
    rut: "77675520-6",
    razonSocial: "SOCIEDAD EDUCACIONAL Y DE CAPACITACION RODRIGUEZ CORNEJO SPA",
    alias: "Holding Inmobiliarias",
  },
  { rut: "76383411-5", razonSocial: "INVERSIONES SANTA CECILIA", alias: "Holding Inmobiliarias" },
  {
    rut: "76086091-3",
    razonSocial: "SAN SALVADOR LTDA SOCIEDAD EDUCACIONALl E INMOBILIARIA",
    alias: "Holding Inmobiliarias",
  },
  {
    rut: "76558624-0",
    razonSocial: "SOCIEDAD EDUCACIONAL E INMOBILIARIA SAN FERMIN LTDA",
    alias: "Holding Inmobiliarias",
  },
  {
    rut: "76430373-3",
    razonSocial: "INVERSIONES SAN JAVIER SOCIEDAD POR ACCIONES",
    alias: "Holding Inmobiliarias",
  },
  {
    rut: "77990400-8",
    razonSocial: "SOCIEDAD EDUCACIONAL E INMOBILIARIA SAN IGNACIO LTDA",
    alias: "Holding Inmobiliarias",
  },
  { rut: "76620801-0", razonSocial: "INVERSIONES Y HOTELERA SAN MIGUEL SPA", alias: "Holding Inmobiliarias" },
  { rut: "76340069-7", razonSocial: "SANTA JOSEFINA SPA", alias: "Holding Inmobiliarias" },
  { rut: "76625301-6", razonSocial: "SOCIEDAD SAN FERNANDO LTDA", alias: "Holding Inmobiliarias" },
  { rut: "76159135-5", razonSocial: "SOCIEDAD EDUCACIONAL SAN ALBERTO SPA", alias: "Holding Inmobiliarias" },
  { rut: "76074071-3", razonSocial: "SOCIEDAD EDUCACIONAL ANDRES BELLO SPA", alias: "Holding Inmobiliarias" },

  // Holding Prored
  {
    rut: "76681721-1",
    razonSocial: "SERVICIOS Y PROYECTOS DE TECNOLOGIA PRORED ZONA NORTE LIMITADA",
    alias: "Holding Prored",
  },
  {
    rut: "76315244-8",
    razonSocial: "ASESO. EN TECNOLOGÍAS DE LA INFO. JORGE PATRICIO HENRÍQUEZ JARA, E.I.R.L.",
    alias: "Holding Prored",
  },

  // Holding Quattromas
  { rut: "76914491-9", razonSocial: "CONSTRUCTORA E INMOBILIARIA QUATTROMAS SPA", alias: "Holding Quattromas" },
  { rut: "77119688-8", razonSocial: "PROYECTOS DE DISENO E INGENIERIA QUATTROMAS SPA", alias: "Holding Quattromas" },

  // Holding Rids
  { rut: "76758352-4", razonSocial: "ECONNET SPA (nuevo)", alias: "Holding Rids" },
  { rut: "77825186-8", razonSocial: "ASESORIAS RIDS LIMITADA (nuevo)", alias: "Holding Rids" },

  // Sin holding
  { rut: "76511417-9", razonSocial: "PANEXPRESS SOCIEDAD ANONIMA" },
  { rut: "77206636-8", razonSocial: "INVERSIONES RPH SPA" },
  { rut: "77432589-1", razonSocial: "SOCIEDAD DE INVERSION Y SERVICIOS MEDICOS EMILVAR SPA" },
  { rut: "76473267-7", razonSocial: "LA BOUTIQUE DEL LUTHIER SPA" },
  { rut: "77113924-8", razonSocial: "COMERCIAL FENISE SPA" },
  { rut: "76949787-0", razonSocial: "PIPE FULL SPA" },
  { rut: "76366844-4", razonSocial: "AVENDANO COMERCIALIZADORA Y CONSULTORA DE PRODUCTOS LIMITADA" },
  { rut: "76661486-8", razonSocial: "SOCIEDAD  IMPORTADORA SOUTHERNKING LIMITADA" },
  { rut: "76439921-8", razonSocial: "COMERCIALIZADORA Y ELABORADORA DILICI LIMITADA" },
  { rut: "76567655-K", razonSocial: "VENDING CENTER SPA" },
];

async function main() {
  console.log("🔹 Sync clientes Camila (CONTA/A01): create/update por rut + limpiar faltantes...");

  // Normaliza
  const normalized = clientesCamila.map((c) => ({
    rut: normalizeRut(c.rut),
    razonSocial: normalizeRS(c.razonSocial),
    alias: normalizeAlias(c.alias),
  }));

  // ✅ Detectar duplicados EN EL EXCEL/ARRAY
  const counts = new Map<string, number>();
  for (const c of normalized) counts.set(c.rut, (counts.get(c.rut) ?? 0) + 1);

  const duplicados = [...counts.entries()].filter(([, n]) => n > 1);
  if (duplicados.length) {
    console.log("⚠️ Duplicados de RUT en la lista (mismo rut repetido):");
    for (const [rut, n] of duplicados) {
      console.log(`  - ${rut} (x${n}) =>`);
      const rows = normalized.filter((x) => x.rut === rut);
      for (const r of rows) console.log(`      • ${r.razonSocial}`);
    }
  } else {
    console.log("✅ No hay duplicados de RUT en la lista.");
  }

  const rutSet = new Set(normalized.map((c) => c.rut));

  // 1) Snapshot actuales de esa cartera/agente (para limpiar)
  const actuales = await prisma.cliente.findMany({
    where: { agenteId: CAMILA_TRABAJADOR_ID, codigoCartera: CODIGO_CARTERA },
    select: { id: true, rut: true, razonSocial: true },
  });

  // Map de ruts existentes dentro de la cartera (si hay duplicados en BD dentro de la misma cartera, tomamos el más nuevo por updatedAt)
  const existentes = await prisma.cliente.findMany({
    where: { agenteId: CAMILA_TRABAJADOR_ID, codigoCartera: CODIGO_CARTERA },
    select: { id: true, rut: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  const mapRutToId = new Map<string, number>();
  for (const e of existentes) {
    const r = normalizeRut(e.rut);
    if (!mapRutToId.has(r)) mapRutToId.set(r, e.id); // el primero es el más nuevo
  }

  // 2) Create/Update por rut (SIN upsert)
  for (const c of normalized) {
    try {
      const existingId = mapRutToId.get(c.rut);

      if (existingId) {
        await prisma.cliente.update({
          where: { id: existingId },
          data: {
            razonSocial: c.razonSocial,
            alias: c.alias,
            agenteId: CAMILA_TRABAJADOR_ID,
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
            agenteId: CAMILA_TRABAJADOR_ID,
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

  // 3) Limpiar faltantes: los que estaban asignados a Camila A01 pero ya no vienen
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

  console.log("🏁 Seed/sync de clientes Camila A01 terminado.");
}

main()
  .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
