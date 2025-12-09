"use strict";
// src/controllers/tareas.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.subirArchivo = exports.ensureDriveFolder = exports.getResumenSupervision = exports.actualizarEstado = exports.crearTareasDesdePlantilla = exports.getTareasPorPlantilla = exports.getPlantillas = exports.getTareasPorRut = exports.getMisRuts = void 0;
const prisma_1 = require("../lib/prisma");
const driveContaTasks_1 = require("../services/driveContaTasks");
const client_1 = require("@prisma/client");
const googleDrive_1 = require("../lib/googleDrive");
const stream_1 = require("stream");
// Helper para convertir Buffer → ReadableStream
function bufferToStream(buffer) {
    const readable = new stream_1.Readable();
    readable.push(buffer);
    readable.push(null);
    return readable;
}
// ---------------------------------------------------------------------------
// 1) Vista 1 – Obtener los RUT que tiene a su cargo el trabajador
//    GET /tareas/mis-ruts
// ---------------------------------------------------------------------------
const getMisRuts = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: "No autorizado" });
        }
        const { trabajadorId: trabajadorIdQuery } = req.query;
        let trabajadorId;
        if (trabajadorIdQuery) {
            const parsed = Number(trabajadorIdQuery);
            if (Number.isNaN(parsed)) {
                return res
                    .status(400)
                    .json({ message: "trabajadorId inválido en la query" });
            }
            trabajadorId = parsed;
        }
        else {
            trabajadorId = req.user.id;
        }
        // 1) Obtener clientes de la cartera del ejecutivo
        const clientesCartera = await prisma_1.prisma.cliente.findMany({
            where: {
                agenteId: trabajadorId,
                activo: true,
            },
            select: {
                rut: true,
                razonSocial: true,
            },
            orderBy: { rut: "asc" },
        });
        if (clientesCartera.length > 0) {
            return res.json(clientesCartera);
        }
        // 2) Fallback: RUTs con tareas asignadas
        const ruts = await prisma_1.prisma.tareaAsignada.findMany({
            where: {
                trabajadorId,
                rutCliente: { not: null },
            },
            select: { rutCliente: true },
            distinct: ["rutCliente"],
            orderBy: { rutCliente: "asc" },
        });
        const rutList = ruts
            .map((x) => x.rutCliente)
            .filter((r) => !!r);
        if (rutList.length === 0)
            return res.json([]);
        const clientes = await prisma_1.prisma.cliente.findMany({
            where: { rut: { in: rutList } },
            select: { rut: true, razonSocial: true },
        });
        const mapa = new Map(clientes.map((c) => [c.rut, c.razonSocial]));
        const resultado = rutList.map((rut) => ({
            rut,
            razonSocial: mapa.get(rut) ?? null,
        }));
        return res.json(resultado);
    }
    catch (error) {
        console.error("[getMisRuts] error:", error);
        return res
            .status(500)
            .json({ message: "Error obteniendo RUTs del trabajador" });
    }
};
exports.getMisRuts = getMisRuts;
// ---------------------------------------------------------------------------
// 2) Obtener tareas por RUT
//    GET /tareas/por-rut/:rut
//    soporta ?trabajadorId & ?anio & ?mes
// ---------------------------------------------------------------------------
const getTareasPorRut = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: "No autorizado" });
        }
        const rutParam = req.params.rut;
        if (!rutParam) {
            return res.status(400).json({ message: "RUT es requerido en la URL" });
        }
        const rut = decodeURIComponent(rutParam);
        const { trabajadorId: trabajadorIdQuery, anio, mes } = req.query;
        let trabajadorId;
        if (trabajadorIdQuery) {
            const parsed = Number(trabajadorIdQuery);
            if (Number.isNaN(parsed)) {
                return res
                    .status(400)
                    .json({ message: "trabajadorId inválido en la query" });
            }
            trabajadorId = parsed;
        }
        else {
            trabajadorId = req.user.id;
        }
        // Filtro por año/mes
        let fechaFiltro;
        if (anio && mes) {
            const year = Number(anio);
            const month = Number(mes);
            if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
                return res.status(400).json({
                    message: "anio/mes inválidos. Ej: ?anio=2025&mes=12",
                });
            }
            const inicio = new Date(year, month - 1, 1);
            const fin = new Date(year, month, 1);
            fechaFiltro = { gte: inicio, lt: fin };
        }
        const where = {
            trabajadorId,
            rutCliente: rut,
        };
        if (fechaFiltro) {
            where.fechaProgramada = fechaFiltro;
        }
        const tareas = await prisma_1.prisma.tareaAsignada.findMany({
            where,
            include: {
                tareaPlantilla: true,
                asignado: {
                    select: { id_trabajador: true, nombre: true, email: true },
                },
            },
            orderBy: { fechaProgramada: "asc" },
        });
        return res.json(tareas);
    }
    catch (error) {
        console.error("[getTareasPorRut] error:", error);
        return res
            .status(500)
            .json({ message: "Error obteniendo tareas del RUT" });
    }
};
exports.getTareasPorRut = getTareasPorRut;
// ---------------------------------------------------------------------------
// 3) Listar plantillas
//    GET /tareas/plantillas
// ---------------------------------------------------------------------------
const getPlantillas = async (req, res) => {
    try {
        const { area, soloActivas } = req.query;
        const where = {};
        if (area)
            where.area = area;
        if (soloActivas === "true")
            where.activo = true;
        const plantillas = await prisma_1.prisma.tareaPlantilla.findMany({
            where,
            orderBy: [{ area: "asc" }, { nombre: "asc" }],
        });
        return res.json(plantillas);
    }
    catch (error) {
        console.error("[getPlantillas] error:", error);
        return res.status(500).json({ message: "Error obteniendo plantillas" });
    }
};
exports.getPlantillas = getPlantillas;
// ---------------------------------------------------------------------------
// 4) Obtener tareas por plantilla
//    GET /tareas/por-plantilla/:idPlantilla
//    soporta ?trabajadorId & ?anio & ?mes
// ---------------------------------------------------------------------------
const getTareasPorPlantilla = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: "No autorizado" });
        }
        const idPlantilla = Number(req.params.idPlantilla);
        if (!idPlantilla || Number.isNaN(idPlantilla)) {
            return res.status(400).json({ message: "idPlantilla inválido" });
        }
        const { trabajadorId: trabajadorIdQuery, anio, mes } = req.query;
        let trabajadorId;
        if (trabajadorIdQuery) {
            const parsed = Number(trabajadorIdQuery);
            if (Number.isNaN(parsed)) {
                return res
                    .status(400)
                    .json({ message: "trabajadorId inválido en la query" });
            }
            trabajadorId = parsed;
        }
        else {
            trabajadorId = req.user.id;
        }
        let fechaFiltro;
        if (anio && mes) {
            const year = Number(anio);
            const month = Number(mes);
            if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
                return res.status(400).json({
                    message: "anio/mes inválidos. Ejemplo: ?anio=2025&mes=1",
                });
            }
            const inicio = new Date(year, month - 1, 1);
            const fin = new Date(year, month, 1);
            fechaFiltro = { gte: inicio, lt: fin };
        }
        const where = {
            trabajadorId,
            tareaPlantillaId: idPlantilla,
            rutCliente: { not: null },
        };
        if (fechaFiltro) {
            where.fechaProgramada = fechaFiltro;
        }
        const tareas = await prisma_1.prisma.tareaAsignada.findMany({
            where,
            include: {
                tareaPlantilla: true,
                asignado: {
                    select: {
                        id_trabajador: true,
                        nombre: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                rutCliente: "asc",
            },
        });
        const rutList = Array.from(new Set(tareas.map((t) => t.rutCliente).filter((rut) => !!rut)));
        let mapaClientes = new Map();
        if (rutList.length > 0) {
            const clientes = await prisma_1.prisma.cliente.findMany({
                where: {
                    rut: { in: rutList },
                },
                select: {
                    rut: true,
                    razonSocial: true,
                },
            });
            mapaClientes = new Map(clientes.map((c) => [c.rut, c.razonSocial]));
        }
        const tareasConCliente = tareas.map((t) => ({
            ...t,
            clienteRazonSocial: t.rutCliente
                ? mapaClientes.get(t.rutCliente) ?? null
                : null,
        }));
        return res.json(tareasConCliente);
    }
    catch (error) {
        console.error("[getTareasPorPlantilla] error:", error);
        return res.status(500).json({
            message: "Error obteniendo tareas por plantilla",
        });
    }
};
exports.getTareasPorPlantilla = getTareasPorPlantilla;
// ---------------------------------------------------------------------------
// 5) Crear tareas masivas desde plantilla
//    POST /tareas/bulk-desde-plantilla
// ---------------------------------------------------------------------------
const crearTareasDesdePlantilla = async (req, res) => {
    try {
        const { tareaPlantillaId, rutClientes, fechaProgramada, asignarAId } = req.body;
        if (!tareaPlantillaId || !rutClientes?.length) {
            return res.status(400).json({
                message: "tareaPlantillaId y rutClientes son obligatorios",
            });
        }
        const plantilla = await prisma_1.prisma.tareaPlantilla.findUnique({
            where: { id_tarea_plantilla: tareaPlantillaId },
        });
        if (!plantilla) {
            return res.status(404).json({ message: "Plantilla no encontrada" });
        }
        const fecha = fechaProgramada ? new Date(fechaProgramada) : new Date();
        const trabajadorAsignadoId = asignarAId ?? plantilla.responsableDefaultId ?? null;
        const dataToCreate = rutClientes.map((rut) => ({
            tareaPlantillaId,
            rutCliente: rut,
            trabajadorId: trabajadorAsignadoId,
            estado: "PENDIENTE",
            fechaProgramada: fecha,
        }));
        const resultado = await prisma_1.prisma.tareaAsignada.createMany({
            data: dataToCreate,
            skipDuplicates: true,
        });
        return res.status(201).json({
            message: "Tareas creadas correctamente",
            count: resultado.count,
        });
    }
    catch (error) {
        console.error("[crearTareasDesdePlantilla] error:", error);
        return res
            .status(500)
            .json({ message: "Error creando tareas masivas" });
    }
};
exports.crearTareasDesdePlantilla = crearTareasDesdePlantilla;
// ---------------------------------------------------------------------------
// 6) Actualizar estado (COMPLETADA → crear siguiente período)
//    PATCH /tareas/:id/estado
// ---------------------------------------------------------------------------
const actualizarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, fechaComplecion } = req.body;
        if (!id || !estado) {
            return res.status(400).json({
                message: "id de tarea y nuevo estado son obligatorios",
            });
        }
        const idTarea = Number(id);
        if (Number.isNaN(idTarea)) {
            return res.status(400).json({ message: "ID inválido" });
        }
        const dataUpdate = { estado };
        if (estado === "COMPLETADA") {
            dataUpdate.fechaComplecion = fechaComplecion
                ? new Date(fechaComplecion)
                : new Date();
        }
        else if (fechaComplecion) {
            dataUpdate.fechaComplecion = new Date(fechaComplecion);
        }
        const tareaActualizada = await prisma_1.prisma.tareaAsignada.update({
            where: { id_tarea_asignada: idTarea },
            data: dataUpdate,
            include: { tareaPlantilla: true },
        });
        if (tareaActualizada.tareaPlantilla?.area === client_1.Area.CONTA) {
            try {
                await (0, driveContaTasks_1.ensureContaTaskFolderForTareaAsignada)(tareaActualizada.id_tarea_asignada);
            }
            catch (e) {
                console.error("[actualizarEstado] No se pudo asegurar carpeta de la tarea actual:", e);
            }
        }
        if (tareaActualizada.estado === "COMPLETADA" &&
            tareaActualizada.tareaPlantilla &&
            tareaActualizada.rutCliente) {
            const plantilla = tareaActualizada.tareaPlantilla;
            const fechaBase = tareaActualizada.fechaProgramada ?? new Date();
            let siguienteFecha = null;
            if (plantilla.frecuencia === "MENSUAL") {
                siguienteFecha = new Date(fechaBase);
                siguienteFecha.setMonth(fechaBase.getMonth() + 1);
            }
            else if (plantilla.frecuencia === "SEMANAL") {
                siguienteFecha = new Date(fechaBase);
                siguienteFecha.setDate(fechaBase.getDate() + 7);
            }
            if (siguienteFecha) {
                const existe = await prisma_1.prisma.tareaAsignada.findFirst({
                    where: {
                        tareaPlantillaId: plantilla.id_tarea_plantilla,
                        rutCliente: tareaActualizada.rutCliente,
                        fechaProgramada: siguienteFecha,
                    },
                });
                if (!existe) {
                    const nueva = await prisma_1.prisma.tareaAsignada.create({
                        data: {
                            tareaPlantillaId: plantilla.id_tarea_plantilla,
                            rutCliente: tareaActualizada.rutCliente,
                            trabajadorId: tareaActualizada.trabajadorId,
                            estado: "PENDIENTE",
                            fechaProgramada: siguienteFecha,
                            comentarios: "Tarea generada automáticamente para el siguiente período",
                        },
                    });
                    try {
                        if (plantilla.area === client_1.Area.CONTA) {
                            await (0, driveContaTasks_1.ensureContaTaskFolderForTareaAsignada)(nueva.id_tarea_asignada);
                        }
                    }
                    catch (e) {
                        console.error("[actualizarEstado] No se pudo crear carpeta Drive para tarea nueva:", e);
                    }
                }
            }
        }
        return res.json(tareaActualizada);
    }
    catch (error) {
        console.error("[actualizarEstado] error:", error);
        return res
            .status(500)
            .json({ message: "Error actualizando estado de tarea" });
    }
};
exports.actualizarEstado = actualizarEstado;
// ---------------------------------------------------------------------------
// 7) Resumen de supervisión
//    GET /tareas/supervision/resumen
// ---------------------------------------------------------------------------
const getResumenSupervision = async (_req, res) => {
    try {
        const tareas = await prisma_1.prisma.tareaAsignada.findMany({
            where: { rutCliente: { not: null } },
            select: {
                trabajadorId: true,
                estado: true,
                asignado: {
                    select: {
                        id_trabajador: true,
                        nombre: true,
                        email: true,
                    },
                },
            },
        });
        const mapa = new Map();
        for (const t of tareas) {
            if (!t.trabajadorId || !t.asignado)
                continue;
            if (!mapa.has(t.trabajadorId)) {
                mapa.set(t.trabajadorId, {
                    trabajadorId: t.trabajadorId,
                    nombre: t.asignado.nombre,
                    email: t.asignado.email,
                    pendientes: 0,
                    enProceso: 0,
                    vencidas: 0,
                    completadas: 0,
                });
            }
            const item = mapa.get(t.trabajadorId);
            switch (t.estado) {
                case "PENDIENTE":
                    item.pendientes++;
                    break;
                case "EN_PROCESO":
                    item.enProceso++;
                    break;
                case "VENCIDA":
                    item.vencidas++;
                    break;
                case "COMPLETADA":
                    item.completadas++;
                    break;
            }
        }
        return res.json(Array.from(mapa.values()));
    }
    catch (error) {
        console.error("[getResumenSupervision] error:", error);
        return res
            .status(500)
            .json({ message: "Error obteniendo resumen supervisión" });
    }
};
exports.getResumenSupervision = getResumenSupervision;
// ---------------------------------------------------------------------------
// 8) Asegurar carpeta de Drive para una tarea de CONTA (manual / debug)
//    POST /tareas/:id/ensure-drive-folder
// ---------------------------------------------------------------------------
const ensureDriveFolder = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: "No autorizado" });
        }
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: "ID de tarea inválido" });
        }
        const folderId = await (0, driveContaTasks_1.ensureContaTaskFolderForTareaAsignada)(id);
        return res.json({
            tareaId: id,
            driveTareaFolderId: folderId,
        });
    }
    catch (error) {
        console.error("[ensureDriveFolder] error:", error);
        return res.status(500).json({
            error: "Error asegurando carpeta de tarea en Drive",
            detail: error?.message ?? "unknown",
        });
    }
};
exports.ensureDriveFolder = ensureDriveFolder;
// ---------------------------------------------------------------------------
// 9) Subir archivo a la carpeta Drive de la tarea (CONTA)
//    POST /tareas/:id/archivos
// ---------------------------------------------------------------------------
const subirArchivo = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: "No autorizado" });
        }
        const idTarea = Number(req.params.id);
        if (Number.isNaN(idTarea)) {
            return res.status(400).json({ message: "ID de tarea inválido" });
        }
        const file = req.file;
        if (!file) {
            return res
                .status(400)
                .json({ message: "No se recibió ningún archivo" });
        }
        console.log("[subirArchivo] file recibido:", {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            hasBuffer: !!file.buffer,
        });
        const tarea = await prisma_1.prisma.tareaAsignada.findUnique({
            where: { id_tarea_asignada: idTarea },
            include: { tareaPlantilla: true, asignado: true },
        });
        if (!tarea) {
            return res.status(404).json({ message: "Tarea no encontrada" });
        }
        if (tarea.tareaPlantilla?.area !== client_1.Area.CONTA) {
            return res.status(400).json({
                message: "Solo se soporta subida de archivos para tareas del área CONTA",
            });
        }
        const folderId = await (0, driveContaTasks_1.ensureContaTaskFolderForTareaAsignada)(idTarea);
        const drive = (0, googleDrive_1.getAdminDriveClient)();
        const uploadRes = await drive.files.create({
            requestBody: {
                name: file.originalname,
                mimeType: file.mimetype,
                parents: [folderId],
            },
            media: {
                mimeType: file.mimetype,
                body: bufferToStream(file.buffer),
            },
            fields: "id, webViewLink, webContentLink, name",
        });
        return res.status(201).json({
            message: "Archivo subido correctamente",
            tareaId: idTarea,
            driveFolderId: folderId,
            driveFileId: uploadRes.data.id,
            webViewLink: uploadRes.data.webViewLink,
            webContentLink: uploadRes.data.webContentLink,
        });
    }
    catch (error) {
        console.error("[subirArchivo] error:", error);
        return res
            .status(500)
            .json({ message: "Error subiendo archivo de tarea" });
    }
};
exports.subirArchivo = subirArchivo;
