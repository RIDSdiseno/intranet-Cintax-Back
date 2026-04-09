// src/jobs/generarTareasMesSiguiente.ts
import { prisma } from "../lib/prisma";
import {
  Area,
  EstadoTarea,
  FrecuenciaTarea,
  Presentacion,
} from "@prisma/client";

const SAFE_HOUR = 12; // evita dramas TZ
const GENERATION_DAY = 30;

/**
 * Solo estas plantillas mensuales CLIENTE deben generarse con este job.
 * Basado en las plantillas que compartiste.
 */
const ALLOWED_TEMPLATE_IDS = [
  81,  // Confeccion y envio de F29
  82,  // Estado de Resultado
  83,  // Simulacion Impuesto Renta aplicado directo
  85,  // Analisis cuentas por cobrar
  86,  // Analisis cuentas por pagar
  95,  // Analisis cuenta retiro socios
  97,  // Envio Pre-IVA
  100, // Informe Deuda TGR
  101, // Convenios y/o postergaciones TGR
  118, // Declaración IVA
  123, // Pago Cotizaciones
] as const;

function atSafeHour(d: Date) {
  const x = new Date(d);
  x.setHours(SAFE_HOUR, 0, 0, 0);
  return x;
}

function startOfMonth(y: number, m0: number) {
  return new Date(y, m0, 1, SAFE_HOUR, 0, 0, 0);
}

function startOfNextMonth(y: number, m0: number) {
  return new Date(y, m0 + 1, 1, SAFE_HOUR, 0, 0, 0);
}

function clampDayToMonth(year: number, month1to12: number, day: number) {
  const lastDay = new Date(year, month1to12, 0).getDate();
  return Math.max(1, Math.min(day, lastDay));
}

function buildDate(year: number, month1to12: number, day: number) {
  return new Date(year, month1to12 - 1, day, SAFE_HOUR, 0, 0, 0);
}

/**
 * Normaliza a formato:
 * xx.xxx.xxx-x
 * xx.xxx.xxx-K
 *
 * Ej:
 * 76054761-1   -> 76.054.761-1
 * 76.054.761-1 -> 76.054.761-1
 * 760547611    -> 76.054.761-1
 * 76178353-k   -> 76.178.353-K
 */
function normalizeRut(rut: string | null | undefined): string {
  if (!rut) return "";

  let clean = rut
    .toString()
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!clean) return "";

  // Si no trae guion, asumir último carácter como DV
  if (!clean.includes("-")) {
    if (clean.length < 2) return "";
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    clean = `${body}-${dv}`;
  }

  let [body, dv] = clean.split("-");

  body = (body ?? "").replace(/\D/g, "");
  dv = (dv ?? "").replace(/[^0-9K]/g, "").toUpperCase();

  if (!body || !dv) return "";

  // Formato con puntos de miles
  const bodyFormatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${bodyFormatted}-${dv}`;
}

function isLastDayOfFebruary(today: Date) {
  const month = today.getMonth(); // febrero = 1
  if (month !== 1) return false;

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return tomorrow.getMonth() !== 1;
}

function shouldRunToday(today: Date) {
  const day = today.getDate();
  return day === GENERATION_DAY || isLastDayOfFebruary(today);
}

// calcula (año, mes) del mes siguiente
function nextMonth(today: Date) {
  const y = today.getFullYear();
  const m0 = today.getMonth(); // 0-11
  const next = new Date(y, m0 + 1, 1, SAFE_HOUR, 0, 0, 0);
  return { year: next.getFullYear(), month1to12: next.getMonth() + 1 };
}

type GenerarTareasOpts = {
  force?: boolean;
  dryRun?: boolean;
  onlyArea?: Area;
};

export async function generarTareasMesSiguiente(
  fechaReferencia: Date = new Date(),
  opts?: GenerarTareasOpts
) {
  const force = opts?.force === true;
  const dryRun = opts?.dryRun === true;
  const onlyArea = opts?.onlyArea ?? Area.CONTA;

  if (!force && !shouldRunToday(fechaReferencia)) {
    return {
      ran: false,
      reason: "Hoy no corresponde ejecutar el job",
      today: fechaReferencia.toISOString(),
      acceptedDays: ["30", "último día de febrero"],
    };
  }

  const { year, month1to12 } = nextMonth(fechaReferencia);
  const start = startOfMonth(year, month1to12 - 1);
  const end = startOfNextMonth(year, month1to12 - 1);

  // 1) Plantillas activas CLIENTE, MENSUAL, no volátiles y explícitamente permitidas
  const plantillas = await prisma.tareaPlantilla.findMany({
    where: {
      id_tarea_plantilla: { in: [...ALLOWED_TEMPLATE_IDS] },
      activo: true,
      presentacion: Presentacion.CLIENTE,
      area: onlyArea,
      frecuencia: FrecuenciaTarea.MENSUAL,
      isVolatile: false,
      diaMesVencimiento: { not: null },
    },
    select: {
      id_tarea_plantilla: true,
      frecuencia: true,
      diaMesVencimiento: true,
      responsableDefaultId: true,
      nombre: true,
    },
    orderBy: { id_tarea_plantilla: "asc" },
  });

  // 2) Clientes activos de esa área
  const clientes = await prisma.cliente.findMany({
    where: {
      activo: true,
      codigoCartera: { startsWith: `${onlyArea}/` },
      agenteId: { not: null },
    },
    select: {
      rut: true,
      agenteId: true,
    },
    orderBy: [{ rut: "asc" }],
  });

  const clientesNormalizados = clientes
    .map((c) => ({
      rut: normalizeRut(c.rut),
      agenteId: typeof c.agenteId === "number" ? c.agenteId : null,
    }))
    .filter((c) => c.rut);

  const rutList = clientesNormalizados.map((c) => c.rut);
  const plantillaIds = plantillas.map((p) => p.id_tarea_plantilla);

  // 3) Exclusiones activas
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

  const exclMap = new Map<string, Date | null>();
  for (const e of exclusiones) {
    exclMap.set(
      `${normalizeRut(e.rutCliente)}|${e.tareaPlantillaId}`,
      e.desdeFecha ?? null
    );
  }

  // 4) Cargamos tareas existentes del mes objetivo para deduplicar antes del createMany
  const existentes = await prisma.tareaAsignada.findMany({
    where: {
      tareaPlantillaId: { in: plantillaIds },
      fechaProgramada: {
        gte: start,
        lt: end,
      },
      rutCliente: { in: rutList },
    },
    select: {
      tareaPlantillaId: true,
      rutCliente: true,
      fechaProgramada: true,
    },
  });

  const existentesSet = new Set(
    existentes.map((e) => {
      const rut = normalizeRut(e.rutCliente);
      const fechaIso = atSafeHour(e.fechaProgramada).toISOString();
      return `${rut}|${e.tareaPlantillaId}|${fechaIso}`;
    })
  );

  const toCreate: {
    tareaPlantillaId: number;
    rutCliente: string;
    trabajadorId: number | null;
    estado: EstadoTarea;
    fechaProgramada: Date;
    comentarios?: string | null;
  }[] = [];

  for (const cli of clientesNormalizados) {
    for (const p of plantillas) {
      const day = clampDayToMonth(
        year,
        month1to12,
        Number(p.diaMesVencimiento ?? 1)
      );

      const fecha = buildDate(year, month1to12, day);
      const exKey = `${cli.rut}|${p.id_tarea_plantilla}`;
      const desdeFecha = exclMap.get(exKey) ?? null;

      // Si la exclusión aplica desde una fecha <= fechaProgramada, no crear
      if (desdeFecha && atSafeHour(desdeFecha) <= atSafeHour(fecha)) {
        continue;
      }

      const dedupeKey = `${cli.rut}|${p.id_tarea_plantilla}|${atSafeHour(
        fecha
      ).toISOString()}`;

      if (existentesSet.has(dedupeKey)) {
        continue;
      }

      existentesSet.add(dedupeKey);

      toCreate.push({
        tareaPlantillaId: p.id_tarea_plantilla,
        rutCliente: cli.rut,
        trabajadorId: cli.agenteId ?? p.responsableDefaultId ?? null,
        estado: EstadoTarea.PENDIENTE,
        fechaProgramada: fecha,
        comentarios: "Generada automáticamente (día 30 → mes siguiente)",
      });
    }
  }

  if (dryRun) {
    return {
      ran: true,
      dryRun: true,
      area: onlyArea,
      forMonth: `${month1to12}/${year}`,
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      templateIds: plantillaIds,
      totalPlantillas: plantillas.length,
      totalClientes: clientesNormalizados.length,
      candidates: toCreate.length,
      sample: toCreate.slice(0, 20),
    };
  }

  if (toCreate.length === 0) {
    return {
      ran: true,
      area: onlyArea,
      forMonth: `${month1to12}/${year}`,
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      templateIds: plantillaIds,
      totalPlantillas: plantillas.length,
      totalClientes: clientesNormalizados.length,
      candidates: 0,
      inserted: 0,
      skippedApprox: 0,
      message: "No había tareas nuevas por insertar",
    };
  }

  const result = await prisma.tareaAsignada.createMany({
    data: toCreate,
    skipDuplicates: true,
  });

  return {
    ran: true,
    area: onlyArea,
    forMonth: `${month1to12}/${year}`,
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    templateIds: plantillaIds,
    totalPlantillas: plantillas.length,
    totalClientes: clientesNormalizados.length,
    candidates: toCreate.length,
    inserted: result.count,
    skippedApprox: Math.max(0, toCreate.length - result.count),
  };
}