import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import * as XLSX from "xlsx";

/** ========= RUT helpers (valida DV y formatea xx.xxx.xxx-x) ========= */

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

  // si viene sin guión, asume último char es DV
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

function normRutDb(v: unknown): string {
  const cleaned = cleanRut(v);
  if (!cleaned) return "";
  if (!isValidRut(cleaned)) return "";
  return formatRutDb(cleaned); // xx.xxx.xxx-x
}

/** ========= string helpers ========= */

function asTrimmed(v: unknown): string {
  return String(v ?? "").trim();
}

function asNullableTrimmed(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/** ========= header helpers ========= */

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin tildes
    .replace(/\s+/g, "");
}

const RUT_HEADERS = new Set(["rut", "r.u.t", "rutcliente", "rutcliente", "taxid", "id"]);
const RS_HEADERS = new Set([
  "razonsocial",
  "razonsoc",
  "razon",
  "empresa",
  "nombreempresa",
  "nombre",
]);
const ALIAS_HEADERS = new Set(["alias", "fantasia", "nombrecorto", "nombrec"]);

type ParsedRow = {
  row: number; // fila excel (2 = primera data)
  rut: string; // formateado db
  rutNorm: string; // "12345678-5" (sin puntos) solo para dedupe interno
  razonSocial: string;
  alias: string | null;
};

type RowError = { row: number; rutRaw: any; razonRaw: any; error: string };

function getCell(row: Record<string, any>, ...keys: string[]) {
  for (const k of keys) {
    if (row[k] != null && row[k] !== "") return row[k];
    const found = Object.keys(row).find((kk) => kk.toLowerCase() === k.toLowerCase());
    if (found && row[found] != null && row[found] !== "") return row[found];
  }
  return "";
}

function pickColumn(headers: string[], allowed: Set<string>) {
  for (const h of headers) {
    const nh = normalizeHeader(h);
    if (allowed.has(nh)) return h;
  }
  return null;
}

/**
 * POST /api/clientes/masivo-excel
 * form-data: archivo (.xlsx)
 *
 * Query:
 *  - dryRun=true            => solo valida/preview, NO escribe
 *  - updateExisting=true    => si existe rut, actualiza razonSocial/alias (si vienen)
 *  - defaultActivo=true|false => para clientes nuevos (default true)
 */
export async function cargarClientesDesdeExcel(req: Request, res: Response) {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res
        .status(400)
        .json({ error: "Debes enviar un archivo .xlsx en form-data con key=archivo" });
    }

    const dryRun = String(req.query.dryRun ?? "false").toLowerCase() === "true";
    const updateExisting = String(req.query.updateExisting ?? "false").toLowerCase() === "true";
    const defaultActivo =
      String(req.query.defaultActivo ?? "true").toLowerCase() !== "false";

    // leer excel
    const wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return res.status(400).json({ error: "Excel sin hojas" });

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Array<Record<string, any>>;
    if (!rows.length) return res.status(400).json({ error: "Excel vacío" });

    const headers = Object.keys(rows[0] ?? {});
    const rutKey = pickColumn(headers, RUT_HEADERS);
    const rsKey = pickColumn(headers, RS_HEADERS);
    const aliasKey = pickColumn(headers, ALIAS_HEADERS);

    if (!rutKey || !rsKey) {
      return res.status(400).json({
        error: "No se encontraron columnas requeridas",
        required: ["rut", "razonSocial"],
        headersDetectados: headers,
        hint:
          "Asegúrate de tener columnas 'rut' y 'razonSocial' (o equivalentes como 'empresa', 'razon').",
      });
    }

    const parsed: ParsedRow[] = [];
    const invalid: RowError[] = [];
    const seenRutNorm = new Set<string>();
    const duplicatesInFile: Array<{ row: number; rut: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // header es fila 1
      const r = rows[i];

      const rutRaw = getCell(r, rutKey);
      const razonRaw = getCell(r, rsKey);
      const aliasRaw = aliasKey ? getCell(r, aliasKey) : "";

      const cleaned = cleanRut(rutRaw);
      if (!cleaned || !isValidRut(cleaned)) {
        invalid.push({ row: rowNumber, rutRaw, razonRaw, error: "RUT inválido (DV)" });
        continue;
      }

      const rutDb = formatRutDb(cleaned);
      const razon = asTrimmed(razonRaw);
      if (!razon) {
        invalid.push({ row: rowNumber, rutRaw, razonRaw, error: "razonSocial vacía" });
        continue;
      }

      // dedupe por rutNorm (sin puntos)
      if (seenRutNorm.has(cleaned)) {
        duplicatesInFile.push({ row: rowNumber, rut: rutDb });
        continue;
      }
      seenRutNorm.add(cleaned);

      parsed.push({
        row: rowNumber,
        rut: rutDb,
        rutNorm: cleaned,
        razonSocial: razon,
        alias: asNullableTrimmed(aliasRaw),
      });
    }

    if (!parsed.length) {
      return res.status(400).json({
        error: "No hay filas válidas para procesar",
        invalid: invalid.slice(0, 50),
        duplicatesInFile: duplicatesInFile.slice(0, 50),
      });
    }

    // buscar existentes por rut (formato db)
    const ruts = parsed.map((p) => p.rut);
    const existing = await prisma.cliente.findMany({
      where: { rut: { in: ruts } },
      select: { id: true, rut: true, razonSocial: true, alias: true, activo: true },
    });

    const existingMap = new Map(existing.map((c) => [c.rut, c]));
    const toCreate = parsed
      .filter((p) => !existingMap.has(p.rut))
      .map((p) => ({
        rut: p.rut,
        razonSocial: p.razonSocial,
        alias: p.alias,
        activo: defaultActivo,
      }));

    // updates (si updateExisting)
    const toUpdate = updateExisting
      ? parsed
          .filter((p) => existingMap.has(p.rut))
          .map((p) => ({
            rut: p.rut,
            data: {
              razonSocial: p.razonSocial,
              alias: p.alias,
            },
          }))
      : [];

    const summary = {
      sheet: sheetName,
      totalRows: rows.length,
      validRows: parsed.length,
      invalidCount: invalid.length,
      duplicatesInFileCount: duplicatesInFile.length,

      existingCount: existing.length,
      toCreateCount: toCreate.length,
      toUpdateCount: toUpdate.length,
      dryRun,
      updateExisting,
    };

    if (dryRun) {
      return res.json({
        ok: true,
        mode: "DRY_RUN",
        summary,
        invalid: invalid.slice(0, 200),
        duplicatesInFile: duplicatesInFile.slice(0, 200),
        previewCreate: toCreate.slice(0, 200),
        previewUpdate: toUpdate.slice(0, 200).map((u) => ({ rut: u.rut })),
      });
    }

    // escribir en BD
    let createdCount = 0;
    let updatedCount = 0;

    if (toCreate.length) {
      const created = await prisma.cliente.createMany({
        data: toCreate,
        skipDuplicates: true, // por si hubo carrera
      });
      createdCount = created.count;
    }

    if (toUpdate.length) {
      // updates uno a uno para no pisar todo sin querer (puedes optimizar después)
      for (const u of toUpdate) {
        await prisma.cliente.update({
          where: { rut: u.rut },
          data: u.data,
        });
        updatedCount++;
      }
    }

    return res.json({
      ok: true,
      mode: "COMMIT",
      summary: { ...summary, createdCount, updatedCount },
      invalid: invalid.slice(0, 200),
      duplicatesInFile: duplicatesInFile.slice(0, 200),
    });
  } catch (e: any) {
    console.error("[cargarClientesDesdeExcel] error:", e);
    // Prisma unique
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "RUT duplicado (unique constraint)" });
    }
    return res.status(500).json({ error: "Error interno cargando clientes desde Excel" });
  }
}