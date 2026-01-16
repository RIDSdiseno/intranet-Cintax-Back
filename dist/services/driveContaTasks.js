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
    const existingId = await (0, googleDrivePath_1.findFolderByName)(drive, parentId, name);
    if (existingId)
        return existingId;
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
async function getContaBaseFolderId(drive, year) {
    const yearStr = String(year);
    const path = ["CINTAX", yearStr, "CONTA"];
    return (0, googleDrivePath_1.resolveFolderPath)(drive, path);
}
/**
 * CINTAX / YEAR / CONTA / {A01}
 */
async function ensureContaWorkerFolder(opts) {
    const baseId = await getContaBaseFolderId(opts.drive, opts.year);
    return ensureFolderInParent(opts.drive, baseId, opts.workerFolderCode.trim());
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
    const year = opts.fechaProgramada.getFullYear();
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
    const mes = opts.fechaProgramada.getMonth() + 1; // 1..12
    const mesName = String(mes).padStart(2, "0");
    const mesFolderId = await ensureFolderInParent(drive, rutFolderId, mesName);
    // 4) / NOMBRE_TAREA (+ sufijo opcional)
    const baseTaskName = opts.nombreTarea.trim();
    if (!baseTaskName)
        throw new Error("Nombre de tarea vacío");
    const taskName = opts.taskFolderSuffix
        ? `${baseTaskName} - ${opts.taskFolderSuffix}`
        : baseTaskName;
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
 */
async function ensureContaTaskFolderForTareaAsignada(tareaId) {
    const tarea = await prisma_1.prisma.tareaAsignada.findUnique({
        where: { id_tarea_asignada: tareaId },
        include: {
            tareaPlantilla: true,
            asignado: true,
        },
    });
    if (!tarea)
        throw new Error("Tarea no encontrada");
    // si ya está vinculada a una carpeta TAREA, no hacemos nada
    if (tarea.driveTareaFolderId)
        return tarea.driveTareaFolderId;
    if (!tarea.asignado)
        throw new Error("Tarea sin trabajador asignado");
    if (tarea.asignado.areaInterna !== client_1.Area.CONTA) {
        throw new Error("Esta función está pensada solo para tareas del área CONTA");
    }
    const workerCode = tarea.asignado.carpetaDriveCodigo;
    if (!workerCode) {
        throw new Error(`Trabajador ${tarea.asignado.id_trabajador} no tiene carpetaDriveCodigo (ej: "A01")`);
    }
    if (!tarea.rutCliente)
        throw new Error("Tarea sin rutCliente");
    const tareaPlantillaNombre = tarea.tareaPlantilla?.nombre;
    if (!tareaPlantillaNombre)
        throw new Error("Tarea sin nombre de plantilla");
    // ✅ si es semanal, carpeta única por ocurrencia
    const frecuencia = tarea.tareaPlantilla?.frecuencia;
    const suffix = frecuencia === "SEMANAL" ? formatYMD(tarea.fechaProgramada) : undefined;
    const folderId = await ensureContaTaskTareaFolder({
        workerFolderCode: workerCode,
        rutCliente: tarea.rutCliente,
        fechaProgramada: tarea.fechaProgramada,
        nombreTarea: tareaPlantillaNombre,
        taskFolderSuffix: suffix,
    });
    await prisma_1.prisma.tareaAsignada.update({
        where: { id_tarea_asignada: tareaId },
        data: { driveTareaFolderId: folderId },
    });
    return folderId;
}
