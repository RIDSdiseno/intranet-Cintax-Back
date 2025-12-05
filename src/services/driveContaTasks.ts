// src/services/driveContaTasks.ts
import type { drive_v3 } from "googleapis";
import { Area } from "@prisma/client";
import { prisma } from "../lib/prisma"; // usa el mismo prisma que ya tienes
import { getAdminDriveClient } from "../lib/googleDrive"; // ajusta la ruta si es distinta
import { resolveFolderPath, findFolderByName } from "./googleDrivePath";

type Drive = drive_v3.Drive;

/**
 * Crea una carpeta dentro de parentId si no existe y devuelve su id.
 */
async function ensureFolderInParent(
  drive: Drive,
  parentId: string,
  name: string
): Promise<string> {
  const existingId = await findFolderByName(drive, parentId, name);
  if (existingId) return existingId;

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  if (!res.data.id) {
    throw new Error(`No se pudo crear la carpeta "${name}"`);
  }
  return res.data.id;
}

/**
 * Devuelve el id de CINTAX / YEAR / CONTA
 * El YEAR lo tomamos desde la fecha programada de la tarea.
 */
async function getContaBaseFolderId(
  drive: Drive,
  year: number
): Promise<string> {
  const yearStr = String(year);
  const path = ["CINTAX", yearStr, "CONTA"];
  return resolveFolderPath(drive, path); // usas tu helper existente
}

/**
 * CINTAX / YEAR / CONTA / {A01}
 */
async function ensureContaWorkerFolder(opts: {
  drive: Drive;
  year: number;
  workerFolderCode: string; // "A01", "A02", etc.
}): Promise<string> {
  const baseId = await getContaBaseFolderId(opts.drive, opts.year);
  return ensureFolderInParent(opts.drive, baseId, opts.workerFolderCode.trim());
}

/**
 * Crea TODA la ruta:
 * CINTAX / YEAR / CONTA / {A0X} / {RUT} / {MES} / {NOMBRE_TAREA} / TAREA
 * y devuelve el id de la carpeta final "TAREA".
 */
export async function ensureContaTaskTareaFolder(opts: {
  workerFolderCode: string; // "A01"
  rutCliente: string;
  fechaProgramada: Date;
  nombreTarea: string;
}): Promise<string> {
  const drive = getAdminDriveClient();

  const year = opts.fechaProgramada.getFullYear(); // ej: 2025

  // 1) Carpeta del trabajador: CINTAX/YEAR/CONTA/A0X
  const workerFolderId = await ensureContaWorkerFolder({
    drive,
    year,
    workerFolderCode: opts.workerFolderCode,
  });

  // 2) / RUT
  const rutName = (opts.rutCliente || "").trim() || "SIN_RUT";
  const rutFolderId = await ensureFolderInParent(drive, workerFolderId, rutName);

  // 3) / MES (01..12) desde fechaProgramada
  const mes = opts.fechaProgramada.getMonth() + 1; // 0-based → 1..12
  const mesName = String(mes).padStart(2, "0");
  const mesFolderId = await ensureFolderInParent(drive, rutFolderId, mesName);

  // 4) / NOMBRE_TAREA
  const taskName = opts.nombreTarea.trim();
  if (!taskName) throw new Error("Nombre de tarea vacío");
  const taskFolderId = await ensureFolderInParent(drive, mesFolderId, taskName);

  // 5) / TAREA
  const tareaFolderId = await ensureFolderInParent(drive, taskFolderId, "TAREA");

  return tareaFolderId;
}

/**
 * Dado el id de una TareaAsignada, asegura su carpeta:
 * CINTAX / YEAR / CONTA / A0X / RUT / MES / NOMBRE_TAREA / TAREA
 * Guarda el id en driveTareaFolderId y lo devuelve.
 */
export async function ensureContaTaskFolderForTareaAsignada(
  tareaId: number
): Promise<string> {
  const tarea = await prisma.tareaAsignada.findUnique({
    where: { id_tarea_asignada: tareaId },
    include: {
      tareaPlantilla: true,
      asignado: true,
    },
  });

  if (!tarea) {
    throw new Error("Tarea no encontrada");
  }

  // si ya está vinculada a una carpeta TAREA, no hacemos nada
  if (tarea.driveTareaFolderId) {
    return tarea.driveTareaFolderId;
  }

  if (!tarea.asignado) {
    throw new Error("Tarea sin trabajador asignado");
  }

  if (tarea.asignado.areaInterna !== Area.CONTA) {
    throw new Error("Esta función está pensada solo para tareas del área CONTA");
  }

  const workerCode = tarea.asignado.carpetaDriveCodigo;
  if (!workerCode) {
    throw new Error(
      `Trabajador ${tarea.asignado.id_trabajador} no tiene carpetaDriveCodigo (ej: "A01")`
    );
  }

  if (!tarea.rutCliente) {
    throw new Error("Tarea sin rutCliente");
  }

  const tareaPlantillaNombre = tarea.tareaPlantilla?.nombre;
  if (!tareaPlantillaNombre) {
    throw new Error("Tarea sin nombre de plantilla");
  }

  const folderId = await ensureContaTaskTareaFolder({
    workerFolderCode: workerCode,
    rutCliente: tarea.rutCliente,
    fechaProgramada: tarea.fechaProgramada,
    nombreTarea: tareaPlantillaNombre,
  });

  await prisma.tareaAsignada.update({
    where: { id_tarea_asignada: tareaId },
    data: { driveTareaFolderId: folderId },
  });

  return folderId;
}
