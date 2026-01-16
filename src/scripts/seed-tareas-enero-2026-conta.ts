// src/scripts/seed-tareas-enero-2026-conta.ts
import "dotenv/config";
import { PrismaClient, Area, FrecuenciaTarea, EstadoTarea } from "@prisma/client";

const prisma = new PrismaClient();

// =========================
// Config
// =========================
const TARGET_YEAR = 2026;
const TARGET_MONTH = 1; // 1 = enero

// Si quieres solo una cartera, ejemplo: "CONTA/A07"
// Deja null para todas (CONTA/A01, A06, A07, etc.)
const ONLY_CARTERA: string | null = null;

// Crea tareas solo para clientes activos
const ONLY_ACTIVE_CLIENTS = true;

// Usa el agente del cliente como asignado; fallback a responsableDefaultId
const ASSIGN_TO_CLIENT_AGENT = true;

// Para evitar problemas de zona horaria (Railway/Postgres), ponemos la hora al mediodía
const SAFE_HOUR = 12;

// =========================
// Helpers fechas
// =========================
function monthRange(year: number, month1to12: number) {
  const start = new Date(year, month1to12 - 1, 1, SAFE_HOUR, 0, 0);
  const end = new Date(year, month1to12, 1, SAFE_HOUR, 0, 0);
  return { start, end };
}

// 1=Lun ... 7=Dom (tu schema)
function jsDowToOur(jsDow: number) {
  // JS: 0=Dom..6=Sab  -> Nuestro: 1=Lun..7=Dom
  return jsDow === 0 ? 7 : jsDow;
}

function ourDowToJs(our: number) {
  // Nuestro: 1=Lun..7=Dom -> JS: 0=Dom..6=Sab
  return our === 7 ? 0 : our;
}

function clampDayToMonth(year: number, month1to12: number, day: number) {
  const lastDay = new Date(year, month1to12, 0).getDate(); // día 0 del mes siguiente = último del mes actual
  return Math.max(1, Math.min(day, lastDay));
}

function buildDate(year: number, month1to12: number, day: number) {
  return new Date(year, month1to12 - 1, day, SAFE_HOUR, 0, 0);
}

// Todas las fechas de cierto día de semana dentro del mes
function getWeekdayDatesInMonth(year: number, month1to12: number, ourWeekday1to7: number): Date[] {
  const { start, end } = monthRange(year, month1to12);
  const jsTarget = ourDowToJs(ourWeekday1to7);

  // partir desde el primer día del mes
  const cur = new Date(start);
  const curJs = cur.getDay();
  const diff = (jsTarget - curJs + 7) % 7;
  cur.setDate(cur.getDate() + diff);

  const out: Date[] = [];
  while (cur < end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function normalizeRut(rut: string) {
  return (rut ?? "")
    .toString()
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .replace(/-k$/i, "-K");
}

// =========================
// Main
// =========================
async function main() {
  const { start, end } = monthRange(TARGET_YEAR, TARGET_MONTH);

  console.log("🔹 Seed tareas CONTA para", `${TARGET_MONTH}/${TARGET_YEAR}`);
  console.log("📅 Rango:", start.toISOString(), "->", end.toISOString());
  if (ONLY_CARTERA) console.log("📌 Solo cartera:", ONLY_CARTERA);

  // 1) Plantillas CONTA activas (presentacion CLIENTE)
  const plantillas = await prisma.tareaPlantilla.findMany({
    where: {
      area: Area.CONTA,
      activo: true,
      presentacion: "CLIENTE",
    },
    select: {
      id_tarea_plantilla: true,
      frecuencia: true,
      diaMesVencimiento: true,
      diaSemanaVencimiento: true,
      responsableDefaultId: true,
      requiereDrive: true,
      nombre: true,
    },
    orderBy: { id_tarea_plantilla: "asc" },
  });

  console.log("📌 Plantillas CONTA activas (CLIENTE):", plantillas.length);
  if (!plantillas.length) {
    console.log("⚠️ No hay plantillas CONTA activas. Abort.");
    return;
  }

  // 2) Clientes CONTA por cartera/agent
  const clientes = await prisma.cliente.findMany({
    where: {
      codigoCartera: ONLY_CARTERA
        ? ONLY_CARTERA
        : { startsWith: "CONTA/" },
      ...(ONLY_ACTIVE_CLIENTS ? { activo: true } : {}),
      agenteId: { not: null },
    },
    select: {
      rut: true,
      agenteId: true,
      codigoCartera: true,
      activo: true,
    },
    orderBy: [{ codigoCartera: "asc" }, { rut: "asc" }],
  });

  console.log("📌 Clientes CONTA encontrados:", clientes.length);

  if (!clientes.length) {
    console.log("⚠️ No hay clientes CONTA con agenteId. Abort.");
    return;
  }

  // 3) Exclusiones relevantes para el mes (activa=true = NO aplica)
  //    Traemos todas para esos ruts y plantillas, y filtramos por desdeFecha al momento de crear.
  const rutList = clientes.map((c) => normalizeRut(c.rut));
  const plantillaIds = plantillas.map((p) => p.id_tarea_plantilla);

  const exclusiones = await prisma.clienteTareaExclusion.findMany({
    where: {
      rutCliente: { in: rutList },
      tareaPlantillaId: { in: plantillaIds },
      activa: true, // NO aplica
    },
    select: {
      rutCliente: true,
      tareaPlantillaId: true,
      desdeFecha: true,
    },
  });

  const exclMap = new Map<string, { desdeFecha: Date | null }>();
  for (const e of exclusiones) {
    const key = `${normalizeRut(e.rutCliente)}|${e.tareaPlantillaId}`;
    exclMap.set(key, { desdeFecha: e.desdeFecha ?? null });
  }

  // 4) Construir tareas a crear (con fechas por frecuencia)
  const toCreate: Array<{
    tareaPlantillaId: number;
    rutCliente: string;
    trabajadorId: number | null;
    estado: EstadoTarea;
    fechaProgramada: Date;
    comentarios?: string;
  }> = [];

  for (const cli of clientes) {
    const rut = normalizeRut(cli.rut);
    const agenteId = typeof cli.agenteId === "number" ? cli.agenteId : null;

    for (const p of plantillas) {
      const exKey = `${rut}|${p.id_tarea_plantilla}`;
      const ex = exclMap.get(exKey);

      const assigned =
        ASSIGN_TO_CLIENT_AGENT ? (agenteId ?? p.responsableDefaultId ?? null) : (p.responsableDefaultId ?? agenteId ?? null);

      // MENSUAL
      if (p.frecuencia === FrecuenciaTarea.MENSUAL) {
        const day = clampDayToMonth(TARGET_YEAR, TARGET_MONTH, Number(p.diaMesVencimiento ?? 1));
        const fecha = buildDate(TARGET_YEAR, TARGET_MONTH, day);

        // exclusión: desdeFecha <= fecha => no crea
        if (ex && (!ex.desdeFecha || ex.desdeFecha <= fecha)) continue;

        toCreate.push({
          tareaPlantillaId: p.id_tarea_plantilla,
          rutCliente: rut,
          trabajadorId: assigned,
          estado: EstadoTarea.PENDIENTE,
          fechaProgramada: fecha,
          comentarios: "Tarea generada por seed (enero 2026)",
        });
      }

      // SEMANAL
      if (p.frecuencia === FrecuenciaTarea.SEMANAL) {
        const weekday = Number(p.diaSemanaVencimiento ?? 1);
        const fechas = getWeekdayDatesInMonth(TARGET_YEAR, TARGET_MONTH, weekday);

        for (const fecha of fechas) {
          // exclusión: desdeFecha <= fecha => no crea
          if (ex && (!ex.desdeFecha || ex.desdeFecha <= fecha)) continue;

          toCreate.push({
            tareaPlantillaId: p.id_tarea_plantilla,
            rutCliente: rut,
            trabajadorId: assigned,
            estado: EstadoTarea.PENDIENTE,
            fechaProgramada: fecha,
            comentarios: "Tarea generada por seed (enero 2026)",
          });
        }
      }

      // UNICA -> no crea en seed general (si quieres, lo extendemos)
    }
  }

  console.log("🧾 Candidatas a crear (antes de dedupe BD):", toCreate.length);

  // 5) Crear en bloque, evitando duplicados por tu @@unique + skipDuplicates
  //    (Si ya existe para enero 2026, NO se crea)
  const result = await prisma.tareaAsignada.createMany({
    data: toCreate,
    skipDuplicates: true,
  });

  console.log("✅ Insertadas (no duplicadas):", result.count);

  // 6) Métrica: cuántas ya existían (aprox)
  console.log("ℹ️ Ya existían / duplicadas omitidas:", Math.max(0, toCreate.length - result.count));
}

main()
  .catch((e) => {
    console.error("❌ Error seed tareas enero 2026:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
