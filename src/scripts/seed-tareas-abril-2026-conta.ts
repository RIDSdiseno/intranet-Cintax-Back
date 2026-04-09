import "dotenv/config";
import { PrismaClient, Area, FrecuenciaTarea, EstadoTarea, Presentacion } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_YEAR = 2026;
const TARGET_MONTH = 4; // abril
const ONLY_CARTERA: string | null = null;
const ONLY_ACTIVE_CLIENTS = true;
const ASSIGN_TO_CLIENT_AGENT = true;
const SAFE_HOUR = 12;

const TEMPLATE_IDS = [
  81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92,
  93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 118,
];

function monthRange(year: number, month1to12: number) {
  const start = new Date(year, month1to12 - 1, 1, SAFE_HOUR, 0, 0);
  const end = new Date(year, month1to12, 1, SAFE_HOUR, 0, 0);
  return { start, end };
}

function ourDowToJs(our: number) {
  return our === 7 ? 0 : our;
}

function clampDayToMonth(year: number, month1to12: number, day: number) {
  const lastDay = new Date(year, month1to12, 0).getDate();
  return Math.max(1, Math.min(day, lastDay));
}

function buildDate(year: number, month1to12: number, day: number) {
  return new Date(year, month1to12 - 1, day, SAFE_HOUR, 0, 0);
}

function getWeekdayDatesInMonth(year: number, month1to12: number, ourWeekday1to7: number): Date[] {
  const { start, end } = monthRange(year, month1to12);
  const jsTarget = ourDowToJs(ourWeekday1to7);

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

async function main() {
  console.log(`🔹 Seed tareas abril ${TARGET_YEAR}`);
  console.log("📌 Plantillas objetivo:", TEMPLATE_IDS.join(", "));

  const plantillas = await prisma.tareaPlantilla.findMany({
    where: {
      id_tarea_plantilla: { in: TEMPLATE_IDS },
      area: Area.CONTA,
      activo: true,
    },
    select: {
      id_tarea_plantilla: true,
      frecuencia: true,
      diaMesVencimiento: true,
      diaSemanaVencimiento: true,
      responsableDefaultId: true,
      requiereDrive: true,
      nombre: true,
      presentacion: true,
    },
    orderBy: { id_tarea_plantilla: "asc" },
  });

  console.log("📌 Plantillas encontradas:", plantillas.length);

  if (!plantillas.length) {
    console.log("⚠️ No se encontraron plantillas objetivo activas.");
    return;
  }

  const clientes = await prisma.cliente.findMany({
    where: {
      codigoCartera: ONLY_CARTERA ? ONLY_CARTERA : { startsWith: "CONTA/" },
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

  console.log("📌 Clientes encontrados:", clientes.length);

  const rutList = clientes.map((c) => normalizeRut(c.rut));
  const plantillaIds = plantillas.map((p) => p.id_tarea_plantilla);

  const exclusiones = await prisma.clienteTareaExclusion.findMany({
    where: {
      rutCliente: { in: rutList },
      tareaPlantillaId: { in: plantillaIds },
      activa: true,
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

  const toCreate: Array<{
    tareaPlantillaId: number;
    rutCliente: string | null;
    trabajadorId: number | null;
    estado: EstadoTarea;
    fechaProgramada: Date;
    comentarios?: string;
  }> = [];

  for (const p of plantillas) {
    if (p.presentacion === Presentacion.CLIENTE) {
      for (const cli of clientes) {
        const rut = normalizeRut(cli.rut);
        const agenteId = typeof cli.agenteId === "number" ? cli.agenteId : null;
        const exKey = `${rut}|${p.id_tarea_plantilla}`;
        const ex = exclMap.get(exKey);

        const assigned = ASSIGN_TO_CLIENT_AGENT
          ? (agenteId ?? p.responsableDefaultId ?? null)
          : (p.responsableDefaultId ?? agenteId ?? null);

        if (p.frecuencia === FrecuenciaTarea.MENSUAL) {
          const day = clampDayToMonth(TARGET_YEAR, TARGET_MONTH, Number(p.diaMesVencimiento ?? 1));
          const fecha = buildDate(TARGET_YEAR, TARGET_MONTH, day);

          if (ex && (!ex.desdeFecha || ex.desdeFecha <= fecha)) continue;

          toCreate.push({
            tareaPlantillaId: p.id_tarea_plantilla,
            rutCliente: rut,
            trabajadorId: assigned,
            estado: EstadoTarea.PENDIENTE,
            fechaProgramada: fecha,
            comentarios: "Tarea generada por seed (abril 2026)",
          });
        }

        if (p.frecuencia === FrecuenciaTarea.SEMANAL) {
          const weekday = Number(p.diaSemanaVencimiento ?? 1);
          const fechas = getWeekdayDatesInMonth(TARGET_YEAR, TARGET_MONTH, weekday);

          for (const fecha of fechas) {
            if (ex && (!ex.desdeFecha || ex.desdeFecha <= fecha)) continue;

            toCreate.push({
              tareaPlantillaId: p.id_tarea_plantilla,
              rutCliente: rut,
              trabajadorId: assigned,
              estado: EstadoTarea.PENDIENTE,
              fechaProgramada: fecha,
              comentarios: "Tarea generada por seed (abril 2026)",
            });
          }
        }
      }
    }

    if (p.presentacion === Presentacion.INTERNO) {
      const assigned = p.responsableDefaultId ?? null;

      if (p.frecuencia === FrecuenciaTarea.MENSUAL) {
        const day = clampDayToMonth(TARGET_YEAR, TARGET_MONTH, Number(p.diaMesVencimiento ?? 1));
        const fecha = buildDate(TARGET_YEAR, TARGET_MONTH, day);

        toCreate.push({
          tareaPlantillaId: p.id_tarea_plantilla,
          rutCliente: null,
          trabajadorId: assigned,
          estado: EstadoTarea.PENDIENTE,
          fechaProgramada: fecha,
          comentarios: "Tarea interna generada por seed (abril 2026)",
        });
      }

      if (p.frecuencia === FrecuenciaTarea.SEMANAL) {
        const weekday = Number(p.diaSemanaVencimiento ?? 1);
        const fechas = getWeekdayDatesInMonth(TARGET_YEAR, TARGET_MONTH, weekday);

        for (const fecha of fechas) {
          toCreate.push({
            tareaPlantillaId: p.id_tarea_plantilla,
            rutCliente: null,
            trabajadorId: assigned,
            estado: EstadoTarea.PENDIENTE,
            fechaProgramada: fecha,
            comentarios: "Tarea interna generada por seed (abril 2026)",
          });
        }
      }
    }
  }

  console.log("🧾 Candidatas a crear:", toCreate.length);

  const result = await prisma.tareaAsignada.createMany({
    data: toCreate,
    skipDuplicates: true,
  });

  console.log("✅ Insertadas:", result.count);
  console.log("ℹ️ Omitidas por duplicado:", Math.max(0, toCreate.length - result.count));
}

main()
  .catch((e) => {
    console.error("❌ Error seed tareas abril 2026:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });