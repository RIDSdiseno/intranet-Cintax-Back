// src/controllers/tareas.masivo.excel.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { EstadoTarea, Area, FrecuenciaTarea, Presentacion } from "@prisma/client";
import * as XLSX from "xlsx";

function cleanRut(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;

  const cleaned = s
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/[^0-9K-]/g, "");

  if (!cleaned) return null;

  if (!cleaned.includes("-")) {
    if (cleaned.length < 2) return null;
    return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
  }

  const [body, dv, ...rest] = cleaned.split("-");
  if (!body || !dv || rest.length) return null;
  return `${body}-${dv}`;
}

function computeRutDV(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  if (mod === 11) return "0";
  if (mod === 10) return "K";
  return String(mod);
}

function isValidRut(cleanedRut: string): boolean {
  const [body, dv] = cleanedRut.split("-");
  if (!body || !dv) return false;
  if (!/^\d+$/.test(body)) return false;
  if (!/^[0-9K]$/.test(dv)) return false;
  return computeRutDV(body) === dv;
}

function formatRutDb(cleanedRut: string): string {
  const [body, dv] = cleanedRut.split("-");
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

function normRut(v: any) {
  const cleaned = cleanRut(v);
  if (!cleaned) return "";
  if (!isValidRut(cleaned)) return "";
  return formatRutDb(cleaned); // "76.001.158-4"
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
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

  const allowed = new Set(Object.values(FrecuenciaTarea) as string[]);
  if (allowed.has(raw)) return raw as FrecuenciaTarea;

  // alias comunes (solo si existen en enum)
  const alias: Record<string, string> = {
    UNICA: "UNICA",
    ÚNICA: "UNICA",
    UNICO: "UNICA",
    "ONE-TIME": "UNICA",
    MENSUAL: "MENSUAL",
    MENSUALMENTE: "MENSUAL",
    SEMANAL: "SEMANAL",
    SEMANALMENTE: "SEMANAL",
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
  frecuencia: FrecuenciaTarea;
  diaMesVencimiento: number | null;
  diaSemanaVencimiento: number | null;
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

// ======== VOLÁTILES (31 días) ========
const VOLATILE_DAYS = 31;

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function makeVolatileNombreNorm(baseNorm: string, expiresAt: Date, seed: string) {
  // mantiene base para debug + asegura uniqueness
  const y = expiresAt.getFullYear();
  const m = String(expiresAt.getMonth() + 1).padStart(2, "0");
  const day = String(expiresAt.getDate()).padStart(2, "0");
  const rnd = Math.random().toString(16).slice(2, 8);
  const safeSeed = (seed || "").replace(/[^a-z0-9]/gi, "").slice(0, 10);
  return `${baseNorm}__v__${y}${m}${day}__${safeSeed || "x"}__${rnd}`;
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

    const now = new Date();
    const volatileExpiresAt = addDays(now, VOLATILE_DAYS);

    // =====================
    // Pre-parse filas Excel
    // =====================
    const parsed = rows.map((r, idx) => {
      const rut = normRut(get(r, "rut", "RUT", "rutCliente", "rut_cliente", "RUT CLIENTE", "rut cliente", "R.U.T"));
      const razonSocial = String(get(r, "razonSocial", "razon social", "empresa", "razon")).trim();

      // Email en fila (o query)
      const agenteEmailRow = normEmail(
        get(r, "agenteEmail", "emailAgente", "correoAgente", "correo", "email")
      );
      const agenteEmail = agenteEmailRow || queryAgenteEmail || "";

      // Compatibilidad: id en fila (o query)
      const agenteIdCellRaw = get(r, "agenteId", "trabajadorId", "responsableId", "agente");
      const agenteIdCell = parseIntOrNull(agenteIdCellRaw);
      const agenteId =
        agenteIdCell != null && agenteIdCell > 0 ? agenteIdCell : (queryAgenteId ?? null);

      const plantillaIds = parsePlantillaIds(get(r, "plantillaIds", "plantillas", "plantillaId"));
      const plantillaNombres = parsePlantillaNombres(
        get(r, "tarea", "tareas", "plantillaNombre", "plantilla", "nombreTarea")
      );

      // ✅ VOLÁTIL por fila (aplica a todas las tareas por nombre de la fila)
      const isVolatileRow =
        parseBool(get(r, "volatile", "volatil", "esVolatil", "tareaVolatil", "volatile31")) ?? false;

      /**
       * Fecha opcional por fila:
       * - vencimiento / fechaProgramada / fecha
       * - si no viene, usa defaultFecha (query fechaProgramada)
       */
      const fechaProgramada =
        parseFecha(get(r, "vencimiento", "fechaProgramada", "fecha")) ?? defaultFecha;

      /**
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
        row: idx + 2,
        rut,
        razonSocial,
        agenteEmail,
        agenteId,
        plantillaIds,
        plantillaNombres,
        fechaProgramada,
        isVolatileRow,

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
    // Validaciones base
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
    // 0) Resolver trabajadores por EMAIL
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
        skipDuplicates: true,
      });

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
    // 3) Plantillas por nombre: resolver o crear
    //    ✅ Soporta VOLÁTILES (31 días)
    //    Requiere en schema TareaPlantilla:
    //    - isVolatile Boolean @default(false)
    //    - expiresAt DateTime?
    //    - nombreBaseNorm String?
    //    - createdAt DateTime @default(now())
    // =====================
    const allNombreNorms = Array.from(
      new Set(
        parsed
          .flatMap((p) => p.plantillaNombres)
          .map((n) => normNombre(n))
          .filter(Boolean)
      )
    );

    // Resolver volatilidad por tarea (si alguna fila la marca volatile, gana true)
    const volatileByNombreNorm = new Map<string, boolean>();
    for (const p of parsed) {
      if (!p.isVolatileRow) continue;
      for (const nombre of p.plantillaNombres) {
        const nn = normNombre(nombre);
        if (!nn) continue;
        volatileByNombreNorm.set(nn, true);
      }
    }

    const plantillasFound =
      allNombreNorms.length === 0
        ? []
        : await prisma.tareaPlantilla.findMany({
            where: {
              OR: [
                { nombreNorm: { in: allNombreNorms } }, // normales
                {
                  // volátiles vigentes por base
                  nombreBaseNorm: { in: allNombreNorms },
                  isVolatile: true,
                  activo: true,
                  expiresAt: { gt: now },
                },
              ],
            },
            select: {
              id_tarea_plantilla: true,
              nombreNorm: true,
              nombreBaseNorm: true,
              isVolatile: true,
              expiresAt: true,
              createdAt: true,
              activo: true,
              frecuencia: true,
              diaMesVencimiento: true,
              diaSemanaVencimiento: true,
            },
            orderBy: [{ createdAt: "desc" }], // para que “gane” la volátil más nueva
          });

    // Mapas separados (para decidir según si la fila pide volatile o no)
    const normalNameMap = new Map<string, any>(); // key: nombreNorm
    const volatileNameMap = new Map<string, any>(); // key: nombreBaseNorm (base)

    for (const pl of plantillasFound) {
      if (!pl.activo) continue;

      if (pl.isVolatile) {
        if (!pl.nombreBaseNorm) continue;
        // por orderBy desc: la primera que entra es la más nueva
        if (!volatileNameMap.has(pl.nombreBaseNorm)) volatileNameMap.set(pl.nombreBaseNorm, pl);
      } else {
        normalNameMap.set(pl.nombreNorm, pl);
      }
    }

    /**
     * ✅ NUEVO:
     * Unificamos configuración "inline" por nombreNorm.
     * Si hay conflictos, 400.
     */
    const inlineConfigMap = new Map<string, { config: PlantillaConfig; fromRow: number }>();
    const inlineConfigConflicts: Array<{ nombreNorm: string; rows: number[]; reason: string }> = [];

    for (const p of parsed) {
      const cfgInline = p.plantillaConfigInline;
      for (const nombre of p.plantillaNombres) {
        const nn = normNombre(nombre);
        if (!nn) continue;

        const hasAnyCfg =
          !!cfgInline.frecuenciaPlantilla ||
          cfgInline.diaMesVencimiento != null ||
          cfgInline.diaSemanaVencimiento != null;

        if (!hasAnyCfg) continue;

        if (!cfgInline.frecuenciaPlantilla) continue;

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
     * ✅ Reglas para nuevas plantillas (normales o volátiles):
     * si NO existe (ni normal, ni volátil vigente cuando la fila pide volátil),
     * exigimos config en la misma hoja.
     */
    const missingConfig: Array<{ tarea: string; nombreNorm: string; sampleRows: number[] }> = [];

    for (const nn of allNombreNorms) {
      const wantsVolatile = volatileByNombreNorm.get(nn) === true;

      // existe normal?
      const existsNormal = normalNameMap.has(nn);

      // existe volátil vigente?
      const existsVolatile = volatileNameMap.has(nn);

      // decisión de existencia según lo que pide excel:
      // - si quiere volátil: sirve volátil vigente, si no hay, sirve normal (fallback)
      // - si NO quiere volátil: solo sirve normal
      const existsForThisRequest = wantsVolatile ? (existsVolatile || existsNormal) : existsNormal;

      if (existsForThisRequest) continue;

      const cfg = inlineConfigMap.get(nn)?.config;

      if (!cfg) {
        const rowsWhere = parsed
          .filter((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
          .slice(0, 5)
          .map((p) => p.row);

        missingConfig.push({
          tarea:
            parsed
              .find((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
              ?.plantillaNombres.find((t) => normNombre(t) === nn) ?? nn,
          nombreNorm: nn,
          sampleRows: rowsWhere,
        });
        continue;
      }

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

    // Crear plantillas que falten (normales o volátiles)
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

      // ✅ Volátiles (requiere schema)
      isVolatile?: boolean;
      expiresAt?: Date | null;
      nombreBaseNorm?: string | null;
    }> = [];

    // Set para evitar duplicar dentro del mismo batch
    const plannedNormal = new Set<string>(); // nn
    const plannedVolatile = new Set<string>(); // nn (base)

    for (const p of parsed) {
      for (const nombre of p.plantillaNombres) {
        const nn = normNombre(nombre);
        if (!nn) continue;

        const wantsVolatile = volatileByNombreNorm.get(nn) === true;

        // ¿ya existe según el tipo pedido?
        const existsNormal = normalNameMap.has(nn);
        const existsVolatile = volatileNameMap.has(nn);

        const existsForThisRequest = wantsVolatile ? (existsVolatile || existsNormal) : existsNormal;
        if (existsForThisRequest) continue;

        // ya planificada en este batch
        if (wantsVolatile) {
          if (plannedVolatile.has(nn)) continue;
        } else {
          if (plannedNormal.has(nn)) continue;
        }

        const cfg = inlineConfigMap.get(nn)!.config;

        if (wantsVolatile) {
          // Crear volátil (31 días), nombreNorm único, base en nombreBaseNorm
          const uniqueNombreNorm = makeVolatileNombreNorm(nn, volatileExpiresAt, `${p.row}_${p.rut}`);

          plantillasToCreate.push({
            area: cfg.area ?? Area.ADMIN,
            nombre,
            nombreNorm: uniqueNombreNorm,
            nombreBaseNorm: nn,
            detalle: cfg.detalle || "Creada desde carga masiva (Excel)",
            frecuencia: cfg.frecuencia,
            diaMesVencimiento: cfg.diaMesVencimiento ?? null,
            diaSemanaVencimiento: cfg.diaSemanaVencimiento ?? null,
            presentacion: cfg.presentacion ?? Presentacion.CLIENTE,
            activo: true,
            requiereDrive: cfg.requiereDrive ?? true,
            codigoDocumento: cfg.codigoDocumento ?? null,

            isVolatile: true,
            expiresAt: volatileExpiresAt,
          });

          plannedVolatile.add(nn);
        } else {
          // Crear normal (nombreNorm = nn único)
          plantillasToCreate.push({
            area: cfg.area ?? Area.ADMIN,
            nombre,
            nombreNorm: nn,
            nombreBaseNorm: null,
            detalle: cfg.detalle || "Creada desde carga masiva (Excel)",
            frecuencia: cfg.frecuencia,
            diaMesVencimiento: cfg.diaMesVencimiento ?? null,
            diaSemanaVencimiento: cfg.diaSemanaVencimiento ?? null,
            presentacion: cfg.presentacion ?? Presentacion.CLIENTE,
            activo: true,
            requiereDrive: cfg.requiereDrive ?? true,
            codigoDocumento: cfg.codigoDocumento ?? null,

            isVolatile: false,
            expiresAt: null,
          });

          plannedNormal.add(nn);
        }
      }
    }

    if (plantillasToCreate.length) {
      await prisma.tareaPlantilla.createMany({
        data: plantillasToCreate as any,
        skipDuplicates: true, // respeta unique nombreNorm
      });

      // re-cargar para mapas finales
      const plantillasReload =
        allNombreNorms.length === 0
          ? []
          : await prisma.tareaPlantilla.findMany({
              where: {
                OR: [
                  { nombreNorm: { in: allNombreNorms } },
                  {
                    nombreBaseNorm: { in: allNombreNorms },
                    isVolatile: true,
                    activo: true,
                    expiresAt: { gt: now },
                  },
                ],
              },
              select: {
                id_tarea_plantilla: true,
                nombreNorm: true,
                nombreBaseNorm: true,
                isVolatile: true,
                expiresAt: true,
                createdAt: true,
                activo: true,
                frecuencia: true,
                diaMesVencimiento: true,
                diaSemanaVencimiento: true,
              },
              orderBy: [{ createdAt: "desc" }],
            });

      normalNameMap.clear();
      volatileNameMap.clear();
      for (const pl of plantillasReload) {
        if (!pl.activo) continue;
        if (pl.isVolatile) {
          if (!pl.nombreBaseNorm) continue;
          if (!volatileNameMap.has(pl.nombreBaseNorm)) volatileNameMap.set(pl.nombreBaseNorm, pl);
        } else {
          normalNameMap.set(pl.nombreNorm, pl);
        }
      }
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

      if (forceUpdateClienteAgente && clienteStatus === "existing") {
        const desired = agenteIdFromEmail ?? p.agenteId ?? null;
        if (desired && c.agenteId !== desired) {
          clienteUpdates.push({ rut: p.rut, agenteId: desired });
        }
      }

      // Plantillas por ID
      const invalidIds = p.plantillaIds.filter((id) => !plantillaIdSet.has(id));
      if (invalidIds.length) errors.push(`Plantillas inválidas por ID: ${invalidIds.join(",")}`);

      // Plantillas por Nombre (resueltas) con regla volátil:
      // - Si fila marca volatile => preferir volátil vigente; fallback a normal
      // - Si NO marca volatile => solo normal
      const resolvedByNameIds: number[] = [];
      for (const nombre of p.plantillaNombres) {
        const nn = normNombre(nombre);
        const wantsVolatile = p.isVolatileRow || volatileByNombreNorm.get(nn) === true;

        const pl = wantsVolatile ? (volatileNameMap.get(nn) ?? normalNameMap.get(nn)) : normalNameMap.get(nn);

        if (!pl) {
          errors.push(
            wantsVolatile
              ? `No se pudo resolver/crear plantilla VOLÁTIL (o normal fallback) para: "${nombre}"`
              : `No se pudo resolver/crear plantilla para: "${nombre}"`
          );
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

      const fecha = p.fechaProgramada!;
      if (!fecha || Number.isNaN(fecha.getTime())) {
        results.push({
          row: p.row,
          rut: p.rut,
          error: "Fecha inválida (usa vencimiento/fechaProgramada/fecha o query fechaProgramada)",
        });
        continue;
      }

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
          created: 0,
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
        "Si la tarea ya existe en el sistema, se ignora la config del Excel y NO se actualiza. " +
        `Si marca volatile=true en la fila, la plantilla se crea como VOLÁTIL y expira en ${VOLATILE_DAYS} días (requiere campos isVolatile/expiresAt/nombreBaseNorm/createdAt en TareaPlantilla).`,
    });
  } catch (e) {
    console.error("[cargarTareasDesdeExcel] error:", e);
    return res.status(500).json({ error: "Error interno cargando tareas desde Excel" });
  }
}