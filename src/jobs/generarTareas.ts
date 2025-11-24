// src/jobs/generarTareas.ts
import { PrismaClient, Area, EstadoTarea } from "@prisma/client";

const prisma = new PrismaClient();

// util: primer día del mes
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

// util: primer día del mes siguiente
function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

// util: lunes de la semana de `date` (asumiendo lunes=1)
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7; // domingo=0 → 7
  d.setHours(0, 0, 0, 0);
  if (day > 1) d.setDate(d.getDate() - (day - 1));
  return d;
}

// util: lunes de la semana siguiente
function startOfNextWeek(date: Date): Date {
  const start = startOfWeek(date);
  start.setDate(start.getDate() + 7);
  return start;
}

// calcula próxima fecha de vencimiento según plantilla
function getNextDueDate(tpl: any, today: Date): Date | null {
  // OJO: tpl.frecuencia viene del enum FrecuenciaTarea,
  // pero Prisma lo expone como string: "MENSUAL" | "SEMANAL" | "UNICA"
  if (tpl.frecuencia === "MENSUAL" && tpl.diaMesVencimiento) {
    const day = tpl.diaMesVencimiento as number;
    const thisMonthDue = new Date(
      today.getFullYear(),
      today.getMonth(),
      day,
      9,
      0,
      0,
      0
    );

    if (thisMonthDue >= today) {
      return thisMonthDue;
    }
    // si ya pasó, siguiente mes
    return new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      day,
      9,
      0,
      0,
      0
    );
  }

  if (tpl.frecuencia === "SEMANAL" && tpl.diaSemanaVencimiento) {
    const targetDow = tpl.diaSemanaVencimiento as number; // 1-7
    const base = new Date(today);
    base.setHours(9, 0, 0, 0);

    // día de la semana actual, 1-7
    const todayDow = base.getDay() || 7;

    const diff = targetDow - todayDow;
    if (diff >= 0) {
      base.setDate(base.getDate() + diff);
      return base;
    } else {
      // semana siguiente
      base.setDate(base.getDate() + 7 + diff);
      return base;
    }
  }

  if (tpl.frecuencia === "UNICA") {
    // En tu lógica actual, UNICA no crea nada automático
    // (si quieres, luego lo cambiamos para que cree una sola vez).
    return null;
  }

  return null;
}

export async function generarTareasAutomaticas(
  fechaReferencia: Date = new Date()
) {
  // 1) traer todas las plantillas activas
  const plantillas = await prisma.tareaPlantilla.findMany({
    where: { activo: true },
  });

  // 2) Agrupar trabajadores activos por áreaInterna (ADMIN, CONTA, RRHH, TRIBUTARIO)
  const workersByArea: Record<Area, { id_trabajador: number }[]> = {
    [Area.ADMIN]: [],
    [Area.CONTA]: [],
    [Area.RRHH]: [],
    [Area.TRIBUTARIO]: [],
  };

  const allWorkers = await prisma.trabajador.findMany({
    where: { status: true, areaInterna: { not: null } },
    select: { id_trabajador: true, areaInterna: true },
  });

  for (const w of allWorkers) {
    if (!w.areaInterna) continue;
    workersByArea[w.areaInterna].push({ id_trabajador: w.id_trabajador });
  }

  // 3) índices para round-robin por área
  const areaIndex: Partial<Record<Area, number>> = {
    [Area.ADMIN]: 0,
    [Area.CONTA]: 0,
    [Area.RRHH]: 0,
    [Area.TRIBUTARIO]: 0,
  };

  // 4) Recorrer plantillas y generar tareas
  for (const tpl of plantillas) {
    const dueDate = getNextDueDate(tpl, fechaReferencia);
    if (!dueDate) continue;

    // 5) Evitar duplicar: ver si ya existe una tarea para esta plantilla
    //    en el mismo "periodo" (mes o semana, según frecuencia)
    let startPeriod: Date;
    let endPeriod: Date;

    if (tpl.frecuencia === "MENSUAL") {
      startPeriod = startOfMonth(dueDate);
      endPeriod = startOfNextMonth(dueDate);
    } else if (tpl.frecuencia === "SEMANAL") {
      startPeriod = startOfWeek(dueDate);
      endPeriod = startOfNextWeek(dueDate);
    } else {
      // UNICA u otra → si ya existe cualquiera en un rango gigante, no crear otra
      startPeriod = new Date(2000, 0, 1);
      endPeriod = new Date(2100, 0, 1);
    }

    const yaExiste = await prisma.tareaAsignada.findFirst({
      where: {
        tareaPlantillaId: tpl.id_tarea_plantilla,
        fechaProgramada: {
          gte: startPeriod,
          lt: endPeriod,
        },
      },
    });

    if (yaExiste) continue;

    // 6) Decidir a quién se asigna
    let trabajadorId: number | null = null;

    if (tpl.responsableDefaultId) {
      // Si la plantilla tiene responsable fijo, usamos ese
      trabajadorId = tpl.responsableDefaultId;
    } else if (tpl.area && workersByArea[tpl.area]?.length) {
      // Si no hay responsable fijo, usamos el área de la plantilla
      const arr = workersByArea[tpl.area];
      const idx = areaIndex[tpl.area] ?? 0;
      trabajadorId = arr[idx % arr.length].id_trabajador;
      areaIndex[tpl.area] = idx + 1;
    }

    // 7) Crear la tarea asignada
    await prisma.tareaAsignada.create({
      data: {
        tareaPlantillaId: tpl.id_tarea_plantilla,
        fechaProgramada: dueDate,
        trabajadorId,
        estado: EstadoTarea.PENDIENTE, // enum
      },
    });

    console.log(
      `Creada tarea para plantilla ${tpl.nombre} con fecha ${dueDate
        .toISOString()
        .slice(0, 10)} asignada a ${
        trabajadorId ? `trabajador ${trabajadorId}` : "SIN asignar"
      }`
    );
  }
}
