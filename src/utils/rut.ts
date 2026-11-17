// src/utils/rut.ts
//
// Normalizacion de RUT. El formato canonico del sistema es xx.xxx.xxx-x,
// que es como lo guarda Cliente.rut y como lo escribe el job de generacion
// de tareas (jobs/generarTareasMesSiguiente.ts).
//
// Existe porque la logica estaba repetida en una docena de archivos y las
// diferencias entre copias ya provocaron duplicados en TareaAsignada (ver
// las tablas TareaAsignada_backup_duplicados_rut_formato_*). El codigo nuevo
// usa este modulo; las copias antiguas pueden migrarse aqui de a poco.

/**
 * Normaliza a xx.xxx.xxx-x (DV en mayuscula).
 * Devuelve "" si la entrada no parece un RUT.
 *
 *   76054761-1    -> 76.054.761-1
 *   76.054.761-1  -> 76.054.761-1
 *   760547611     -> 76.054.761-1
 *   76178353-k    -> 76.178.353-K
 */
export function normalizeRut(rut: string | null | undefined): string {
  if (!rut) return "";

  let clean = rut
    .toString()
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!clean) return "";

  // Sin guion: se asume que el ultimo caracter es el digito verificador.
  if (!clean.includes("-")) {
    if (clean.length < 2) return "";
    clean = `${clean.slice(0, -1)}-${clean.slice(-1)}`;
  }

  let [body, dv] = clean.split("-");

  body = (body ?? "").replace(/\D/g, "");
  dv = (dv ?? "").replace(/[^0-9K]/g, "").toUpperCase();

  if (!body || !dv) return "";

  const bodyFormatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${bodyFormatted}-${dv}`;
}

/** Version sin puntos: 76054761-1. Util para comparar contra datos sucios. */
export function compactRut(rut: string | null | undefined): string {
  const normalized = normalizeRut(rut);
  return normalized ? normalized.replace(/\./g, "") : "";
}

/**
 * Primer RUT que aparezca dentro de un texto libre (cuerpo de correo,
 * descripcion de un ticket). Exige guion y digito verificador para no
 * confundirse con telefonos o montos.
 */
export function findRutInText(text: string | null | undefined): string | null {
  const match = String(text ?? "").match(
    /\b(\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK])\b/
  );
  return match?.[1] ?? null;
}

/**
 * Variantes con las que vale la pena buscar un RUT en la base, porque los
 * datos historicos conviven en mas de un formato.
 */
export function rutCandidates(rut: string | null | undefined): string[] {
  const raw = String(rut ?? "").trim();
  if (!raw) return [];

  const candidates = new Set<string>([raw]);

  const normalized = normalizeRut(raw);
  if (normalized) {
    candidates.add(normalized);
    candidates.add(compactRut(raw));
  }

  return [...candidates];
}
