"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureContaTaskTareaFolder = ensureContaTaskTareaFolder;
exports.ensureContaTaskFolderForTareaAsignada = ensureContaTaskFolderForTareaAsignada;
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const googleDrive_1 = require("../lib/googleDrive");
const googleDrivePath_1 = require("./googleDrivePath");
/**
 * Helpers
 */
function formatYMD(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
/**
 * Crea una carpeta dentro de parentId si no existe y devuelve su id.
 */
async function ensureFolderInParent(drive, parentId, name) {
    const folderName = String(name ?? "").trim();
    if (!folderName) {
        throw new Error("No se puede crear/buscar una carpeta con nombre vacío");
    }
    const existingId = await (0, googleDrivePath_1.findFolderByName)(drive, parentId, folderName);
    if (existingId)
        return existingId;
    const res = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId],
        },
        fields: "id",
    });
    if (!res.data.id) {
        throw new Error(`No se pudo crear la carpeta "${folderName}"`);
    }
    return res.data.id;
}
/**
 * Devuelve el id de CINTAX / YEAR / CONTA
 * El YEAR lo tomamos desde la fecha programada de la tarea.
 */
async function getContaBaseFolderId(drive, year) {
    const yearStr = String(year);
    const path = ["CINTAX", yearStr, "CONTA"];
    return (0, googleDrivePath_1.resolveFolderPath)(drive, path);
}
/**
 * CINTAX / YEAR / CONTA / {A01}
 */
async function ensureContaWorkerFolder(opts) {
    const workerFolderCode = String(opts.workerFolderCode ?? "").trim();
    if (!workerFolderCode) {
        throw new Error("workerFolderCode es obligatorio");
    }
    const baseId = await getContaBaseFolderId(opts.drive, opts.year);
    return ensureFolderInParent(opts.drive, baseId, workerFolderCode);
}
/**
 * Crea TODA la ruta:
 * CINTAX / YEAR / CONTA / {A0X} / {RUT} / {MES} / {NOMBRE_TAREA} / TAREA
 * y devuelve el id de la carpeta final "TAREA".
 *
 * Si se pasa `taskFolderSuffix`, se agrega al nombre de la carpeta de la tarea:
 *  - "Conciliación Bancaria - 2025-12-06"
 */
async function ensureContaTaskTareaFolder(opts) {
    const drive = (0, googleDrive_1.getAdminDriveClient)();
    if (!(opts.fechaProgramada instanceof Date) || Number.isNaN(opts.fechaProgramada.getTime())) {
        throw new Error("fechaProgramada inválida");
    }
    const year = opts.fechaProgramada.getFullYear();
    // 1) Carpeta del trabajador: CINTAX/YEAR/CONTA/A0X
    const workerFolderId = await ensureContaWorkerFolder({
        drive,
        year,
        workerFolderCode: opts.workerFolderCode,
    });
    // 2) / RUT
    const rutName = String(opts.rutCliente ?? "").trim() || "SIN_RUT";
    const rutFolderId = await ensureFolderInParent(drive, workerFolderId, rutName);
    // 3) / MES (01..12) desde fechaProgramada
    const mes = opts.fechaProgramada.getMonth() + 1;
    const mesName = String(mes).padStart(2, "0");
    const mesFolderId = await ensureFolderInParent(drive, rutFolderId, mesName);
    // 4) / NOMBRE_TAREA (+ sufijo opcional)
    const baseTaskName = String(opts.nombreTarea ?? "").trim();
    if (!baseTaskName) {
        throw new Error("Nombre de tarea vacío");
    }
    const suffix = String(opts.taskFolderSuffix ?? "").trim();
    const taskName = suffix ? `${baseTaskName} - ${suffix}` : baseTaskName;
    const taskFolderId = await ensureFolderInParent(drive, mesFolderId, taskName);
    // 5) / TAREA
    const tareaFolderId = await ensureFolderInParent(drive, taskFolderId, "TAREA");
    return tareaFolderId;
}
/**
 * Dado el id de una TareaAsignada, asegura su carpeta:
 * CINTAX / YEAR / CONTA / A0X / RUT / MES / NOMBRE_TAREA / TAREA
 *
 * Para SEMANAL, usamos un sufijo por fecha (YYYY-MM-DD) para evitar colisiones:
 *  .../12/Conciliación Bancaria - 2025-12-06/TAREA
 *
 * Guarda el id en driveTareaFolderId y lo devuelve.
 *
 * Regla:
 * - Si la tarea existe
 * - Si la plantilla de la tarea es CONTA
 * - Si la tarea tiene trabajador asignado con carpetaDriveCodigo
 * entonces se asegura la carpeta.
 *
 * NO se bloquea por areaInterna del trabajador.
 */
async function ensureContaTaskFolderForTareaAsignada(tareaId) {
    const tareaIdNum = Number(tareaId);
    if (!Number.isFinite(tareaIdNum) || tareaIdNum <= 0) {
        throw new Error("tareaId inválido");
    }
    const tarea = await prisma_1.prisma.tareaAsignada.findUnique({
        where: { id_tarea_asignada: tareaIdNum },
        include: {
            tareaPlantilla: true,
            asignado: true,
        },
    });
    if (!tarea) {
        throw new Error("Tarea no encontrada");
    }
    if (tarea.driveTareaFolderId) {
        return tarea.driveTareaFolderId;
    }
    if (!tarea.asignado) {
        throw new Error("Tarea sin trabajador asignado");
    }
    if (tarea.tareaPlantilla?.area !== client_1.Area.CONTA) {
        throw new Error("Esta función está pensada solo para tareas del área CONTA");
    }
    const workerCode = String(tarea.asignado.carpetaDriveCodigo ?? "").trim();
    if (!workerCode) {
        throw new Error(`Trabajador ${tarea.asignado.id_trabajador} no tiene carpetaDriveCodigo (ej: "A01")`);
    }
    const rutCliente = String(tarea.rutCliente ?? "").trim();
    if (!rutCliente) {
        throw new Error("Tarea sin rutCliente");
    }
    const tareaPlantillaNombre = String(tarea.tareaPlantilla?.nombre ?? "").trim();
    if (!tareaPlantillaNombre) {
        throw new Error("Tarea sin nombre de plantilla");
    }
    if (!(tarea.fechaProgramada instanceof Date) || Number.isNaN(tarea.fechaProgramada.getTime())) {
        throw new Error("Tarea sin fechaProgramada válida");
    }
    const frecuencia = tarea.tareaPlantilla?.frecuencia;
    const suffix = frecuencia === "SEMANAL" ? formatYMD(tarea.fechaProgramada) : undefined;
    const folderId = await ensureContaTaskTareaFolder({
        workerFolderCode: workerCode,
        rutCliente,
        fechaProgramada: tarea.fechaProgramada,
        nombreTarea: tareaPlantillaNombre,
        taskFolderSuffix: suffix,
    });
    await prisma_1.prisma.tareaAsignada.update({
        where: { id_tarea_asignada: tareaIdNum },
        data: { driveTareaFolderId: folderId },
    });
    return folderId;
}
//# sourceMappingURL=driveContaTasks.js.map