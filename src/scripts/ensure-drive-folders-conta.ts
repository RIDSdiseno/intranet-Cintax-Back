// src/scripts/ensure-drive-folders-conta-all-agents.ts
/**
 * ✅ Qué hace este script (versión general):
 * - Recorre TODOS los agentes (trabajadores) que tengan cartera (clientes.agenteId)
 *   y/o tareas CONTA asignadas.
 * - Para un rango de fechas (por defecto un mes), busca tareas CONTA:
 *      - driveTareaFolderId = null
 *      - rutCliente != null
 *      - estado != NO_APLICA
 *      - fechaProgramada dentro del rango
 * - Y asegura/crea la carpeta Drive con ensureContaTaskFolderForTareaAsignada(id)
 *
 * ✅ Cómo correr:
 *  - Railway/Local (con DATABASE_URL):
 *    npx ts-node src/scripts/ensure-drive-folders-conta-all-agents.ts
 *
 * ✅ Variables opcionales:
 *  - TARGET_YEAR=2026 TARGET_MONTH=1
 *  - START=2026-01-01 END=2026-02-01   (END es exclusivo)
 *  - TAKE=200
 *  - DRY_RUN=true  (no crea carpetas, solo muestra qué haría)
 *  - ONLY_AGENT_ID=7 (procesa solo un trabajadorId)
 */

import "dotenv/config";
import { PrismaClient, Prisma, Area } from "@prisma/client";
import { ensureContaTaskFolderForTareaAsignada } from "../services/driveContaTasks";

const prisma = new PrismaClient();

// -----------------------------
// Config
// -----------------------------
const ONLY_AGENT_ID = process.env.ONLY_AGENT_ID ? Number(process.env.ONLY_AGENT_ID) : null;
const TAKE = process.env.TAKE ? Math.max(10, Math.min(1000, Number(process.env.TAKE))) : 200;
const DRY_RUN = String(process.env.DRY_RUN ?? "").toLowerCase() === "true";

// Si viene START/END, se usan. Si no, usa TARGET_YEAR/TARGET_MONTH.
const TARGET_YEAR = process.env.TARGET_YEAR ? Number(process.env.TARGET_YEAR) : 2026;
const TARGET_MONTH = process.env.TARGET_MONTH ? Number(process.env.TARGET_MONTH) : 1;

function parseISODate(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${s}`);
  return d;
}

function resolveRange(): { startDate: Date; endDate: Date } {
  const START = process.env.START;
  const END = process.env.END;

  if (START && END) {
    const startDate = parseISODate(START);
    const endDate = parseISODate(END);
    return { startDate, endDate };
  }

  // rango mensual [inicio, fin)
  const startDate = new Date(TARGET_YEAR, TARGET_MONTH - 1, 1);
  const endDate = new Date(TARGET_YEAR, TARGET_MONTH, 1);
  return { startDate, endDate };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// -----------------------------
// Tipos
// -----------------------------
type TareaLite = Prisma.TareaAsignadaGetPayload<{
  select: {
    id_tarea_asignada: true;
    trabajadorId: true;
    rutCliente: true;
    fechaProgramada: true;
    tareaPlantillaId: true;
  };
}>;

type Agente = { id_trabajador: number; nombre: string; email: string };

// -----------------------------
// Helpers
// -----------------------------
async function getAgentes(): Promise<Agente[]> {
  // 1) Agentes que tengan clientes asignados
  const agentesConClientes = await prisma.trabajador.findMany({
    where: ONLY_AGENT_ID ? { id_trabajador: ONLY_AGENT_ID } : undefined,
    select: { id_trabajador: true, nombre: true, email: true },
    orderBy: { id_trabajador: "asc" },
  });

  if (ONLY_AGENT_ID) return agentesConClientes;

  // Si quieres limitar solo a CONTA, descomenta:
  // return agentesConClientes.filter(a => a.areaInterna === Area.CONTA);

  return agentesConClientes;
}

async function getRutsCarteraAgente(agenteId: number): Promise<string[]> {
  const clientes = await prisma.cliente.findMany({
    where: { agenteId, activo: true },
    select: { rut: true },
    orderBy: { rut: "asc" },
  });
  return clientes.map((c) => c.rut).filter(Boolean);
}

async function getRutsFallbackPorTareas(agenteId: number, startDate: Date, endDate: Date): Promise<string[]> {
  const rows = await prisma.tareaAsignada.findMany({
    where: {
      trabajadorId: agenteId,
      rutCliente: { not: null },
      fechaProgramada: { gte: startDate, lt: endDate },
    },
    select: { rutCliente: true },
    distinct: ["rutCliente"],
    orderBy: { rutCliente: "asc" },
  });

  return rows.map((r) => r.rutCliente).filter((x): x is string => !!x);
}

async function procesarAgente(agente: Agente, startDate: Date, endDate: Date) {
  const agenteId = agente.id_trabajador;

  // 1) RUTs por cartera
  let ruts = await getRutsCarteraAgente(agenteId);

  // 2) fallback si no tiene cartera
  if (ruts.length === 0) {
    ruts = await getRutsFallbackPorTareas(agenteId, startDate, endDate);
  }

  if (ruts.length === 0) {
    console.log(`\n👤 Agente ${agenteId} (${agente.nombre}) → sin RUTs (cartera ni tareas en rango).`);
    return;
  }

  console.log(`\n👤 Agente ${agenteId} (${agente.nombre}) → RUTs considerados: ${ruts.length}`);

  // Vamos paginando por id_tarea_asignada para no traer todo de golpe
  let cursorId: number | null = null;
  let totalEncontradas = 0;
  let ok = 0;
  let fail = 0;

  while (true) {
    const tareas: TareaLite[] = await prisma.tareaAsignada.findMany({
      where: {
        driveTareaFolderId: null,
        trabajadorId: agenteId,
        rutCliente: { in: ruts },
        estado: { not: "NO_APLICA" },
        fechaProgramada: { gte: startDate, lt: endDate },

        // ✅ importante: asegurar que sea tarea CONTA por plantilla
        tareaPlantilla: { area: Area.CONTA },
      },
      select: {
        id_tarea_asignada: true,
        trabajadorId: true,
        rutCliente: true,
        fechaProgramada: true,
        tareaPlantillaId: true,
      },
      orderBy: { id_tarea_asignada: "asc" },
      take: TAKE,
      ...(cursorId ? { skip: 1, cursor: { id_tarea_asignada: cursorId } } : {}),
    });

    if (tareas.length === 0) break;

    totalEncontradas += tareas.length;

    for (const t of tareas) {
      const id = t.id_tarea_asignada;
      const rut = t.rutCliente ?? "NULL";
      const fechaISO = t.fechaProgramada?.toISOString?.() ?? String(t.fechaProgramada);

      if (DRY_RUN) {
        console.log(`   🧪 DRY_RUN → Aseguraría carpeta tarea ${id} (rut=${rut}, fecha=${fechaISO})`);
        ok++;
        continue;
      }

      try {
        const folderId = await ensureContaTaskFolderForTareaAsignada(id);
        console.log(`   ✅ tarea ${id} → folder ${folderId} (rut=${rut}, fecha=${fechaISO})`);
        ok++;

        // Delay suave para no golpear Drive API
        await sleep(150);
      } catch (e: any) {
        console.error(`   ❌ tarea ${id} (rut=${rut}, fecha=${fechaISO}) → ${e?.message ?? e}`);
        fail++;
        await sleep(150);
      }
    }

    cursorId = tareas[tareas.length - 1].id_tarea_asignada;
  }

  console.log(
    `📌 Agente ${agenteId} (${agente.nombre}) → tareas sin carpeta en rango: ${totalEncontradas} | ✅ OK ${ok} | ❌ FAIL ${fail}`
  );
}

// -----------------------------
// Main
// -----------------------------
async function main() {
  const { startDate, endDate } = resolveRange();

  console.log("🔹 Ensure Drive folders para tareas CONTA (GENERAL)");
  console.log("📌 Rango:", startDate.toISOString(), "→", endDate.toISOString(), "(END exclusivo)");
  console.log("📌 TAKE:", TAKE, "| DRY_RUN:", DRY_RUN, "| ONLY_AGENT_ID:", ONLY_AGENT_ID ?? "ALL");

  const agentes = await getAgentes();

  if (agentes.length === 0) {
    console.log("⚠️ No hay agentes para procesar.");
    return;
  }

  console.log("👥 Agentes a procesar:", agentes.length);

  for (const a of agentes) {
    try {
      await procesarAgente(a, startDate, endDate);
    } catch (e: any) {
      console.error(`❌ Error procesando agente ${a.id_trabajador}:`, e?.message ?? e);
    }
  }

  console.log("\n🏁 Terminado.");
}

main()
  .catch((e) => {
    console.error("❌ Error general:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
