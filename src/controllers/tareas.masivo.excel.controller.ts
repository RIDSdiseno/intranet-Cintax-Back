// src/controllers/tareas.masivo.excel.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { EstadoTarea, Area, FrecuenciaTarea, Presentacion } from "@prisma/client";
import * as XLSX from "xlsx";

/**
 * Normaliza RUT:
 * - quita puntos
 * - mantiene guion si existe
 * - upper para K
 * Ej: "76.001.158-4" => "76001158-4"
 */
function normRut(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const noDots = raw.replace(/\./g, "").replace(/\s+/g, "");
  return noDots.toUpperCase();
}

/**
 * Normaliza nombre para evitar duplicados:
 * - trim
 * - colapsa espacios
 * - lower
 * - quita tildes/diacríticos (Declaración == Declaracion)
 */
function normNombre(v: any) {
  const raw = String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita diacríticos
}

function normEmail(v: any) {
  const raw = String(v ?? "").trim().toLowerCase();
  return raw || "";
}

function parsePlantillaIds(v: any): number[] {
  const raw = String(v ?? "").trim();
  if (!raw) return [];
  const parts = raw.split(/[,; ]+/).map((x) => x.trim()).filter(Boolean);
  const ids = parts.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(ids));
}

/**
 * Para columnas tipo "tarea/tareas/plantillaNombre":
 * soporta:
 * - "Tarea 1"
 * - "Tarea 1, Tarea 2"
 * - "Tarea 1;Tarea 2"
 * - "Tarea 1 / Tarea 2"
 * - líneas
 */
function parsePlantillaNombres(v: any): string[] {
  const raw = String(v ?? "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/[,;\/\n]+/g)
    .map((x) => String(x).trim())
    .filter(Boolean);

  // dedupe por normalizado
  const map = new Map<string, string>();
  for (const p of parts) {
    const k = normNombre(p);
    if (!k) continue;
    if (!map.has(k)) map.set(k, p);
  }
  return Array.from(map.values());
}

function parseFecha(v: any): Date | null {
  if (v == null || v === "") return null;

  if (v instanceof Date && Number.isFinite(v.getTime())) return v;

  // Excel serial
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }

  // Recomendación: usar ISO YYYY-MM-DD en Excel para evitar ambigüedad.
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseBool(v: any): boolean | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "si", "sí", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

function parseIntOrNull(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function parseFrecuencia(v: any): FrecuenciaTarea | null {
  const raw = String(v ?? "").trim().toUpperCase();
  if (!raw) return null;

  // Ajusta aquí si tu enum tiene otros valores.
  // Ej esperados: UNICA, MENSUAL, SEMANAL, ANUAL, etc.
  const allowed = new Set(Object.values(FrecuenciaTarea) as string[]);
  if (allowed.has(raw)) return raw as FrecuenciaTarea;

  // alias comunes
  const alias: Record<string, string> = {
    UNICA: "UNICA",
    ÚNICA: "UNICA",
    UNICO: "UNICA",
    "ONE-TIME": "UNICA",
    MENSUAL: "MENSUAL",
    MENSUALMENTE: "MENSUAL",
    SEMANAL: "SEMANAL",
    SEMANALMENTE: "SEMANAL",
    ANUAL: "ANUAL",
    ANUALMENTE: "ANUAL",
  };

  const mapped = alias[raw];
  if (mapped && allowed.has(mapped)) return mapped as FrecuenciaTarea;

  return null;
}

function parseArea(v: any): Area | null {
  const raw = String(v ?? "").trim().toUpperCase();
  if (!raw) return null;
  const allowed = new Set(Object.values(Area) as string[]);
  return allowed.has(raw) ? (raw as Area) : null;
}

function parsePresentacion(v: any): Presentacion | null {
  const raw = String(v ?? "").trim().toUpperCase();
  if (!raw) return null;
  const allowed = new Set(Object.values(Presentacion) as string[]);
  return allowed.has(raw) ? (raw as Presentacion) : null;
}

type AssignedTo =
  | { by: "cliente.agenteId"; value: string }
  | { by: "email"; value: string }
  | { by: "id"; value: string }
  | { by: "none"; value: string };

type RowResult =
  | {
      row: number;
      rut: string;
      cliente: "existing" | "created";
      plantillas: { by: "id" | "nombre"; requested: number; resolved: number; created: number };
      tareasRequested: number;
      tareasCreatedApprox: number;
      assignedTo: AssignedTo;
      errors: string[];
    }
  | { row: number; rut: string; error: string };

type PlantillaConfig = {
  // “Reglas” para la plantilla (cuando es NUEVA)
  frecuencia: FrecuenciaTarea;
  diaMesVencimiento: number | null;
  diaSemanaVencimiento: number | null;

  // Extras
  detalle: string;
  area: Area;
  presentacion: Presentacion;
  requiereDrive: boolean;
  codigoDocumento: string | null;
};

function isValidDiaMes(n: number | null) {
  return n != null && Number.isInteger(n) && n >= 1 && n <= 31;
}

function isValidDiaSemana(n: number | null) {
  // Convención típica 1..7 (Lunes..Domingo). Ajusta si usas otra.
  return n != null && Number.isInteger(n) && n >= 1 && n <= 7;
}

export async function cargarTareasDesdeExcel(req: Request, res: Response) {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res
        .status(400)
        .json({ error: "Debes enviar un archivo .xlsx en form-data con key=archivo" });
    }

    const skipDuplicates = String(req.query.skipDuplicates ?? "true").toLowerCase() !== "false";

    /**
     * defaultFecha (query) es OPCIONAL.
     * Se usa como fallback si la fila no trae vencimiento/fecha.
     */
    const defaultFecha = req.query.fechaProgramada ? new Date(String(req.query.fechaProgramada)) : null;
    if (req.query.fechaProgramada && (!defaultFecha || Number.isNaN(defaultFecha.getTime()))) {
      return res.status(400).json({ error: "fechaProgramada en query inválida (usa YYYY-MM-DD)" });
    }

    // Compatibilidad: agenteId (opcional)
    const queryAgenteId = req.query.agenteId ? Number(req.query.agenteId) : null;
    if (req.query.agenteId && (!Number.isFinite(queryAgenteId) || (queryAgenteId as number) <= 0)) {
      return res.status(400).json({ error: "agenteId en query inválido (usa número > 0)" });
    }

    // Recomendado: agenteEmail (opcional)
    const queryAgenteEmail = req.query.agenteEmail ? normEmail(req.query.agenteEmail) : "";
    if (req.query.agenteEmail && (!queryAgenteEmail || !queryAgenteEmail.includes("@"))) {
      return res.status(400).json({ error: "agenteEmail en query inválido (usa correo válido)" });
    }

    // Opcional: si viene true, actualiza cliente.agenteId cuando se resuelve por email/id (solo para EXISTENTES)
    const forceUpdateClienteAgente =
      String(req.query.forceUpdateClienteAgente ?? "false").toLowerCase() === "true";

    const wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Array<Record<string, any>>;

    const get = (obj: any, ...keys: string[]) => {
      for (const k of keys) {
        if (obj[k] != null && obj[k] !== "") return obj[k];
        const found = Object.keys(obj).find((kk) => kk.toLowerCase() === k.toLowerCase());
        if (found && obj[found] != null && obj[found] !== "") return obj[found];
      }
      return "";
    };

    // =====================
    // Pre-parse filas Excel
    // =====================
    const parsed = rows.map((r, idx) => {
      const rut = normRut(get(r, "rut", "RUT"));
      const razonSocial = String(get(r, "razonSocial", "razon social", "empresa", "razon")).trim();

      // Email en fila (o query)
      const agenteEmailRow = normEmail(
        get(r, "agenteEmail", "emailAgente", "correoAgente", "correo", "email")
      );
      const agenteEmail = agenteEmailRow || queryAgenteEmail || "";

      // Compatibilidad: id en fila (o query)
      const agenteIdCell = Number(get(r, "agenteId", "trabajadorId", "responsableId", "agente"));
      const agenteId =
        Number.isFinite(agenteIdCell) && agenteIdCell > 0 ? agenteIdCell : (queryAgenteId ?? null);

      const plantillaIds = parsePlantillaIds(get(r, "plantillaIds", "plantillas", "plantillaId"));
      const plantillaNombres = parsePlantillaNombres(
        get(r, "tarea", "tareas", "plantillaNombre", "plantilla", "nombreTarea")
      );

      /**
       * Fecha opcional por fila:
       * - vencimiento / fechaProgramada / fecha
       * - si no viene, usa defaultFecha (query fechaProgramada)
       */
      const fechaProgramada =
        parseFecha(get(r, "vencimiento", "fechaProgramada", "fecha")) ?? defaultFecha;

      /**
       * ✅ NUEVO (MISMA HOJA):
       * Config para PLANTILLA cuando es NUEVA.
       * Si la plantilla ya existe, se IGNORA esta config.
       */
      const frecuenciaRaw = get(r, "frecuencia", "frecuenciaPlantilla", "frecuencia_tarea");
      const diaMesRaw = get(r, "diaMesVencimiento", "diaMes", "dia_mes_vencimiento");
      const diaSemanaRaw = get(r, "diaSemanaVencimiento", "diaSemana", "dia_semana_vencimiento");

      const frecuenciaPlantilla = parseFrecuencia(frecuenciaRaw);
      const diaMesVencimiento = parseIntOrNull(diaMesRaw);
      const diaSemanaVencimiento = parseIntOrNull(diaSemanaRaw);

      const detallePlantilla =
        String(get(r, "detallePlantilla", "detalle", "detalle_tarea")).trim() ||
        "Creada desde carga masiva (Excel)";

      const areaPlantilla = parseArea(get(r, "area", "areaPlantilla")) ?? Area.ADMIN;
      const presentacionPlantilla =
        parsePresentacion(get(r, "presentacion", "presentacionPlantilla")) ?? Presentacion.CLIENTE;

      const requiereDriveParsed = parseBool(get(r, "requiereDrive", "drive", "requiere_drive"));
      const requiereDrivePlantilla = requiereDriveParsed ?? true;

      const codigoDocumento =
        String(get(r, "codigoDocumento", "codigo", "codigo_documento")).trim() || "";

      return {
        row: idx + 2, // 1 = headers, por eso +2
        rut,
        razonSocial,
        agenteEmail,
        agenteId,
        plantillaIds,
        plantillaNombres,
        fechaProgramada, // Date | null

        // config “inline” por fila (si hay tarea nueva)
        plantillaConfigInline: {
          frecuenciaPlantilla,
          diaMesVencimiento,
          diaSemanaVencimiento,
          detallePlantilla,
          areaPlantilla,
          presentacionPlantilla,
          requiereDrivePlantilla,
          codigoDocumento,
        },
      };
    });

    // =====================
    // Validaciones base:
    // - rut
    // - fechaProgramada (en fila o fallback query)
    // - al menos plantillaIds o plantillaNombres
    // =====================
    const bad = parsed.filter(
      (p) =>
        !p.rut ||
        !p.fechaProgramada ||
        (p.plantillaIds.length === 0 && p.plantillaNombres.length === 0)
    );

    if (bad.length) {
      return res.status(400).json({
        error:
          "Hay filas inválidas. Requiere rut + (vencimiento/fechaProgramada/fecha o query fechaProgramada) + (plantillaIds o tareas/plantillaNombre).",
        sample: bad.slice(0, 10).map((b) => ({
          row: b.row,
          rut: b.rut,
          fechaProgramada: b.fechaProgramada,
          plantillaIds: b.plantillaIds,
          plantillaNombres: b.plantillaNombres,
        })),
      });
    }

    // =====================
    // 0) Resolver trabajadores por EMAIL (si se usó)
    // =====================
    const allEmails = Array.from(new Set(parsed.map((p) => p.agenteEmail).filter(Boolean)));

    const trabajadoresByEmail =
      allEmails.length === 0
        ? []
        : await prisma.trabajador.findMany({
            where: { email: { in: allEmails } },
            select: { id_trabajador: true, email: true },
          });

    const trabajadorEmailMap = new Map(
      trabajadoresByEmail.map((t) => [String(t.email).toLowerCase(), t.id_trabajador])
    );

    // Si viene queryAgenteEmail y NO existe, fallamos temprano (mejor UX)
    if (queryAgenteEmail && !trabajadorEmailMap.has(queryAgenteEmail)) {
      return res.status(400).json({ error: `agenteEmail no existe: ${queryAgenteEmail}` });
    }

    // =====================
    // 1) Clientes: traer existentes, crear faltantes
    // =====================
    const ruts = Array.from(new Set(parsed.map((p) => p.rut)));

    const clientes = await prisma.cliente.findMany({
      where: { rut: { in: ruts } },
      select: { rut: true, agenteId: true, activo: true, razonSocial: true },
    });
    const clienteMap = new Map(clientes.map((c) => [c.rut, c]));
    const existingRutSet = new Set(clientes.map((x) => x.rut));

    const clientesToCreate: Array<{
      rut: string;
      razonSocial: string;
      agenteId: number | null;
      activo: boolean;
    }> = [];

    for (const p of parsed) {
      if (clienteMap.has(p.rut)) continue;

      const razon = p.razonSocial || `Cliente ${p.rut}`;

      // asignación default para cliente nuevo:
      const agenteIdFromEmail = p.agenteEmail
        ? (trabajadorEmailMap.get(p.agenteEmail) ?? null)
        : null;

      const agenteIdForCliente = agenteIdFromEmail ?? p.agenteId ?? null;

      clientesToCreate.push({
        rut: p.rut,
        razonSocial: razon,
        agenteId: agenteIdForCliente,
        activo: true,
      });
    }

    if (clientesToCreate.length) {
      await prisma.cliente.createMany({
        data: clientesToCreate,
        skipDuplicates: true, // rut unique
      });

      // re-cargar para map actualizado
      const clientes2 = await prisma.cliente.findMany({
        where: { rut: { in: ruts } },
        select: { rut: true, agenteId: true, activo: true, razonSocial: true },
      });
      clienteMap.clear();
      for (const c of clientes2) clienteMap.set(c.rut, c);
    }

    // =====================
    // 2) Plantillas por ID: validar existen
    // =====================
    const allPlantillaIds = Array.from(new Set(parsed.flatMap((p) => p.plantillaIds)));

    const plantillasById =
      allPlantillaIds.length === 0
        ? []
        : await prisma.tareaPlantilla.findMany({
            where: { id_tarea_plantilla: { in: allPlantillaIds } },
            select: { id_tarea_plantilla: true, activo: true },
          });

    const plantillaIdSet = new Set(plantillasById.map((p) => p.id_tarea_plantilla));

    // =====================
    // 3) Plantillas por nombre: resolver o crear por nombreNorm
    // =====================
    const allNombreNorms = Array.from(
      new Set(
        parsed
          .flatMap((p) => p.plantillaNombres)
          .map((n) => normNombre(n))
          .filter(Boolean)
      )
    );

    const plantillasFoundByName =
      allNombreNorms.length === 0
        ? []
        : await prisma.tareaPlantilla.findMany({
            where: { nombreNorm: { in: allNombreNorms } },
            select: {
              id_tarea_plantilla: true,
              nombreNorm: true,
              activo: true,
              frecuencia: true,
              diaMesVencimiento: true,
              diaSemanaVencimiento: true,
            },
          });

    const plantillaNameMap = new Map(plantillasFoundByName.map((p) => [p.nombreNorm, p]));

    /**
     * ✅ NUEVO:
     * Unificamos configuración "inline" (misma hoja) por nombreNorm.
     * Si una tarea NUEVA aparece en múltiples filas, tomamos la primera config completa.
     * Si hay conflictos evidentes, hacemos fallar con 400 (mejor que crear mal).
     */
    const inlineConfigMap = new Map<string, { config: PlantillaConfig; fromRow: number }>();
    const inlineConfigConflicts: Array<{ nombreNorm: string; rows: number[]; reason: string }> = [];

    for (const p of parsed) {
      const cfgInline = p.plantillaConfigInline;
      for (const nombre of p.plantillaNombres) {
        const nn = normNombre(nombre);
        if (!nn) continue;

        // si no viene ninguna columna de config en esta fila, no aporta
        const hasAnyCfg =
          !!cfgInline.frecuenciaPlantilla ||
          cfgInline.diaMesVencimiento != null ||
          cfgInline.diaSemanaVencimiento != null;

        if (!hasAnyCfg) continue;

        // construir config candidata (solo si frecuencia es válida)
        if (!cfgInline.frecuenciaPlantilla) {
          // frecuencia inválida o vacía: no la usamos como config “completa”
          continue;
        }

        const candidate: PlantillaConfig = {
          frecuencia: cfgInline.frecuenciaPlantilla,
          diaMesVencimiento: cfgInline.diaMesVencimiento,
          diaSemanaVencimiento: cfgInline.diaSemanaVencimiento,
          detalle: cfgInline.detallePlantilla,
          area: cfgInline.areaPlantilla,
          presentacion: cfgInline.presentacionPlantilla,
          requiereDrive: cfgInline.requiereDrivePlantilla,
          codigoDocumento: cfgInline.codigoDocumento || null,
        };

        const prev = inlineConfigMap.get(nn);
        if (!prev) {
          inlineConfigMap.set(nn, { config: candidate, fromRow: p.row });
        } else {
          // detectar conflicto: misma tarea con frecuencia distinta / días distintos
          const a = prev.config;
          const b = candidate;

          const same =
            a.frecuencia === b.frecuencia &&
            (a.diaMesVencimiento ?? null) === (b.diaMesVencimiento ?? null) &&
            (a.diaSemanaVencimiento ?? null) === (b.diaSemanaVencimiento ?? null);

          if (!same) {
            inlineConfigConflicts.push({
              nombreNorm: nn,
              rows: [prev.fromRow, p.row],
              reason: "Configuración distinta para la misma tarea (frecuencia/día)",
            });
          }
        }
      }
    }

    if (inlineConfigConflicts.length) {
      return res.status(400).json({
        error: "Hay conflictos de configuración para tareas nuevas (misma tarea con reglas distintas).",
        conflicts: inlineConfigConflicts.slice(0, 20),
      });
    }

    /**
     * ✅ NUEVO:
     * Para toda plantilla que NO exista en BD, exigimos config en la MISMA hoja.
     * Ej: frecuencia=MENSUAL y diaMesVencimiento=15
     */
    const missingConfig: Array<{ tarea: string; nombreNorm: string; sampleRows: number[] }> = [];
    for (const nn of allNombreNorms) {
      if (plantillaNameMap.has(nn)) continue; // ya existe => se ignora config excel
      const cfg = inlineConfigMap.get(nn)?.config;

      if (!cfg) {
        // buscar filas donde aparece para ayudar al usuario
        const rowsWhere = parsed
          .filter((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
          .slice(0, 5)
          .map((p) => p.row);

        missingConfig.push({
          tarea: parsed.find((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
            ?.plantillaNombres.find((t) => normNombre(t) === nn) ?? nn,
          nombreNorm: nn,
          sampleRows: rowsWhere,
        });
        continue;
      }

      // validar coherencia según frecuencia
      if (cfg.frecuencia === FrecuenciaTarea.MENSUAL) {
        if (!isValidDiaMes(cfg.diaMesVencimiento)) {
          missingConfig.push({
            tarea: nn,
            nombreNorm: nn,
            sampleRows: parsed
              .filter((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
              .slice(0, 5)
              .map((p) => p.row),
          });
        }
      }

      if (cfg.frecuencia === FrecuenciaTarea.SEMANAL) {
        if (!isValidDiaSemana(cfg.diaSemanaVencimiento)) {
          missingConfig.push({
            tarea: nn,
            nombreNorm: nn,
            sampleRows: parsed
              .filter((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
              .slice(0, 5)
              .map((p) => p.row),
          });
        }
      }
    }

    if (missingConfig.length) {
      return res.status(400).json({
        error:
          "Hay tareas NUEVAS en el Excel que requieren configuración en la MISMA hoja. " +
          "Agrega columnas: frecuencia + (diaMesVencimiento si MENSUAL) o (diaSemanaVencimiento si SEMANAL). " +
          "Si la tarea ya existe en el sistema, esta config se ignora.",
        sample: missingConfig.slice(0, 25),
        hint:
          "Ejemplo: para 'prueba 4' => frecuencia=MENSUAL y diaMesVencimiento=15 (en al menos una fila donde aparezca esa tarea).",
      });
    }

    const plantillasToCreate: Array<{
      area: Area;
      nombre: string;
      nombreNorm: string;
      detalle: string;
      frecuencia: FrecuenciaTarea;
      diaMesVencimiento?: number | null;
      diaSemanaVencimiento?: number | null;
      presentacion: Presentacion;
      activo: boolean;
      requiereDrive: boolean;
      codigoDocumento?: string | null;
    }> = [];

    for (const p of parsed) {
      for (const nombre of p.plantillaNombres) {
        const nn = normNombre(nombre);
        if (!nn) continue;

        // ya existe en BD o ya lo reservamos
        if (plantillaNameMap.has(nn)) continue;

        // debe existir config (ya validamos arriba)
        const cfg = inlineConfigMap.get(nn)!.config;

        plantillasToCreate.push({
          area: cfg.area ?? Area.ADMIN,
          nombre,
          nombreNorm: nn,
          detalle: cfg.detalle || "Creada desde carga masiva (Excel)",
          frecuencia: cfg.frecuencia,
          diaMesVencimiento: cfg.diaMesVencimiento ?? null,
          diaSemanaVencimiento: cfg.diaSemanaVencimiento ?? null,
          presentacion: cfg.presentacion ?? Presentacion.CLIENTE,
          activo: true,
          requiereDrive: cfg.requiereDrive ?? true,
          codigoDocumento: cfg.codigoDocumento ?? null,
        });

        // reserva para evitar duplicar en el batch
        plantillaNameMap.set(nn, {
          id_tarea_plantilla: -1,
          nombreNorm: nn,
          activo: true,
          frecuencia: cfg.frecuencia,
          diaMesVencimiento: cfg.diaMesVencimiento ?? null,
          diaSemanaVencimiento: cfg.diaSemanaVencimiento ?? null,
        } as any);
      }
    }

    if (plantillasToCreate.length) {
      await prisma.tareaPlantilla.createMany({
        data: plantillasToCreate,
        skipDuplicates: true, // nombreNorm unique
      });

      // re-cargar para map final
      const plantillas3 = await prisma.tareaPlantilla.findMany({
        where: { nombreNorm: { in: allNombreNorms } },
        select: {
          id_tarea_plantilla: true,
          nombreNorm: true,
          activo: true,
          frecuencia: true,
          diaMesVencimiento: true,
          diaSemanaVencimiento: true,
        },
      });
      plantillaNameMap.clear();
      for (const pl of plantillas3) plantillaNameMap.set(pl.nombreNorm, pl);
    }

    // =====================
    // 4) Armar createData para TareaAsignada
    // =====================
    const results: RowResult[] = [];
    const createData: Array<{
      tareaPlantillaId: number;
      rutCliente: string;
      trabajadorId: number | null;
      estado: EstadoTarea;
      fechaProgramada: Date;
    }> = [];

    // Opcional: preparar updates de cliente (si forceUpdateClienteAgente=true)
    const clienteUpdates: Array<{ rut: string; agenteId: number | null }> = [];

    for (const p of parsed) {
      const errors: string[] = [];
      const c = clienteMap.get(p.rut);

      const clienteStatus: "existing" | "created" = existingRutSet.has(p.rut) ? "existing" : "created";

      if (!c) {
        results.push({ row: p.row, rut: p.rut, error: "Cliente no pudo resolverse/crearse" });
        continue;
      }
      if (c.activo === false) {
        results.push({ row: p.row, rut: p.rut, error: "Cliente está inactivo" });
        continue;
      }

      // Resolver trabajadorId por email/id/cliente:
      const agenteIdFromEmail = p.agenteEmail
        ? (trabajadorEmailMap.get(p.agenteEmail) ?? null)
        : null;

      // Prioridad:
      // 1) email (fila/query)
      // 2) agenteId (fila/query)
      // 3) cliente.agenteId
      // 4) null
      const trabajadorId = agenteIdFromEmail ?? p.agenteId ?? c.agenteId ?? null;

      const assignedTo: AssignedTo = agenteIdFromEmail
        ? { by: "email", value: p.agenteEmail }
        : p.agenteId
        ? { by: "id", value: String(p.agenteId) }
        : c.agenteId
        ? { by: "cliente.agenteId", value: String(c.agenteId) }
        : { by: "none", value: "-" };

      if (!trabajadorId) {
        errors.push(
          "No se pudo asignar responsable (no viene agenteEmail/agenteId y el cliente no tiene agenteId). Se asignará trabajadorId=null"
        );
      }

      // Opcional: actualizar cliente existente si fuerza y viene asignación por email/id
      if (forceUpdateClienteAgente && clienteStatus === "existing") {
        const desired = agenteIdFromEmail ?? p.agenteId ?? null;
        if (desired && c.agenteId !== desired) {
          clienteUpdates.push({ rut: p.rut, agenteId: desired });
        }
      }

      // Plantillas por ID
      const invalidIds = p.plantillaIds.filter((id) => !plantillaIdSet.has(id));
      if (invalidIds.length) errors.push(`Plantillas inválidas por ID: ${invalidIds.join(",")}`);

      // Plantillas por Nombre (resueltas)
      const resolvedByNameIds: number[] = [];
      for (const nombre of p.plantillaNombres) {
        const nn = normNombre(nombre);
        const pl = plantillaNameMap.get(nn);
        if (!pl) {
          errors.push(`No se pudo resolver/crear plantilla para: "${nombre}"`);
          continue;
        }
        resolvedByNameIds.push(pl.id_tarea_plantilla);
      }

      const resolvedIds = Array.from(new Set([...p.plantillaIds, ...resolvedByNameIds])).filter(
        (n) => n > 0
      );

      if (resolvedIds.length === 0) {
        results.push({
          row: p.row,
          rut: p.rut,
          error: errors.join(" | ") || "Sin plantillas válidas",
        });
        continue;
      }

      // Fecha programada (ya validada arriba)
      const fecha = p.fechaProgramada!;
      if (!fecha || Number.isNaN(fecha.getTime())) {
        results.push({
          row: p.row,
          rut: p.rut,
          error: "Fecha inválida (usa vencimiento/fechaProgramada/fecha o query fechaProgramada)",
        });
        continue;
      }

      // Crear N tareas por fila
      for (const pid of resolvedIds) {
        createData.push({
          tareaPlantillaId: pid,
          rutCliente: p.rut,
          trabajadorId,
          estado: EstadoTarea.PENDIENTE,
          fechaProgramada: fecha,
        });
      }

      results.push({
        row: p.row,
        rut: p.rut,
        cliente: clienteStatus,
        plantillas: {
          by: p.plantillaIds.length ? "id" : "nombre",
          requested: p.plantillaIds.length + p.plantillaNombres.length,
          resolved: resolvedIds.length,
          created: 0, // si quieres distinguir "existente vs creada", se puede calcular
        },
        tareasRequested: resolvedIds.length,
        tareasCreatedApprox: resolvedIds.length,
        assignedTo,
        errors,
      });
    }

    if (createData.length === 0) {
      return res.status(200).json({
        ok: false,
        message: "No hay registros válidos para crear.",
        results,
      });
    }

    // =====================
    // 4.5) (opcional) Actualizar agenteId del cliente existente si se pidió
    // =====================
    if (forceUpdateClienteAgente && clienteUpdates.length) {
      // dedupe por rut (último gana)
      const lastByRut = new Map<string, number | null>();
      for (const u of clienteUpdates) lastByRut.set(u.rut, u.agenteId);

      for (const [rut, agenteId] of Array.from(lastByRut.entries())) {
        await prisma.cliente.update({
          where: { rut },
          data: { agenteId },
        });
      }
    }

    // =====================
    // 5) Crear asignaciones sin duplicar
    // =====================
    const created = await prisma.tareaAsignada.createMany({
      data: createData,
      skipDuplicates,
    });

    const requested = createData.length;

    return res.json({
      ok: true,
      sheet: sheetName,
      requested,
      created: created.count,
      skipped: requested - created.count,
      results,
      note: skipDuplicates
        ? "Con skipDuplicates=true, skipped es global. El detalle por fila requiere consultar existentes antes de crear."
        : null,
      rules:
        "Si una tarea (plantilla) NO existe, debes incluir en la MISMA hoja su configuración: frecuencia + día (mensual/semanal). " +
        "Si la tarea ya existe en el sistema, se ignora la config del Excel y NO se actualiza.",
    });
  } catch (e) {
    console.error("[cargarTareasDesdeExcel] error:", e);
    return res.status(500).json({ error: "Error interno cargando tareas desde Excel" });
  }
}
