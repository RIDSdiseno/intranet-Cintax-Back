"use strict";
// src/controllers/tareas.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTareasPorRuts = exports.getTareasAsignadasPorClienteYTrabajador = exports.eliminarPlantillaConTareas = exports.upsertClienteTareaExclusion = exports.listPlantillasConAplicaPorCliente = exports.subirArchivo = exports.ensureDriveFolder = exports.getResumenSupervision = exports.actualizarEstado = exports.crearTareasDesdePlantilla = exports.getTareasPorPlantilla = exports.crearPlantilla = exports.getPlantillas = exports.getTareasPorRut = exports.getMisRuts = void 0;
const prisma_1 = require("../lib/prisma");
const driveContaTasks_1 = require("../services/driveContaTasks");
const client_1 = require("@prisma/client");
const googleDrive_1 = require("../lib/googleDrive");
const stream_1 = require("stream");
const normNombrePlantilla_1 = require("../utils/normNombrePlantilla");
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
        if (!req.user?.id)
            return res.status(401).json({ message: "No autorizado" });
        const { trabajadorId: trabajadorIdQuery } = req.query;
        let trabajadorId;
        if (trabajadorIdQuery) {
            const parsed = Number(trabajadorIdQuery);
            if (Number.isNaN(parsed)) {
                return res.status(400).json({ message: "trabajadorId inválido en la query" });
            }
            trabajadorId = parsed;
        }
        else {
            trabajadorId = req.user.id;
        }
        // 1) Obtener clientes de la cartera del ejecutivo
        const clientesCartera = await prisma_1.prisma.cliente.findMany({
            where: { agenteId: trabajadorId, activo: true },
            select: { rut: true, razonSocial: true },
            orderBy: { rut: "asc" },
        });
        if (clientesCartera.length > 0)
            return res.json(clientesCartera);
        // 2) Fallback: RUTs con tareas asignadas
        const ruts = await prisma_1.prisma.tareaAsignada.findMany({
            where: { trabajadorId, rutCliente: { not: null } },
            select: { rutCliente: true },
            distinct: ["rutCliente"],
            orderBy: { rutCliente: "asc" },
        });
        const rutList = ruts.map((x) => x.rutCliente).filter((r) => !!r);
        if (rutList.length === 0)
            return res.json([]);
        const clientes = await prisma_1.prisma.cliente.findMany({
            where: { rut: { in: rutList } },
            select: { rut: true, razonSocial: true },
        });
        const mapa = new Map(clientes.map((c) => [c.rut, c.razonSocial]));
        const resultado = rutList.map((rut) => ({ rut, razonSocial: mapa.get(rut) ?? null }));
        return res.json(resultado);
    }
    catch (error) {
        console.error("[getMisRuts] error:", error);
        return res.status(500).json({ message: "Error obteniendo RUTs del trabajador" });
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
        if (!req.user?.id)
            return res.status(401).json({ message: "No autorizado" });
        const rutParam = req.params.rut;
        if (!rutParam)
            return res.status(400).json({ message: "RUT es requerido en la URL" });
        const rut = decodeURIComponent(rutParam);
        const { trabajadorId: trabajadorIdQuery, anio, mes } = req.query;
        let trabajadorId;
        if (trabajadorIdQuery) {
            const parsed = Number(trabajadorIdQuery);
            if (Number.isNaN(parsed)) {
                return res.status(400).json({ message: "trabajadorId inválido en la query" });
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
                return res.status(400).json({ message: "anio/mes inválidos. Ej: ?anio=2025&mes=12" });
            }
            const inicio = new Date(year, month - 1, 1);
            const fin = new Date(year, month, 1);
            fechaFiltro = { gte: inicio, lt: fin };
        }
        const where = {
            trabajadorId,
            rutCliente: rut,
            estado: { not: "NO_APLICA" },
        };
        if (fechaFiltro)
            where.fechaProgramada = fechaFiltro;
        const tareas = await prisma_1.prisma.tareaAsignada.findMany({
            where,
            include: {
                tareaPlantilla: true,
                asignado: { select: { id_trabajador: true, nombre: true, email: true } },
            },
            orderBy: { fechaProgramada: "asc" },
        });
        return res.json(tareas);
    }
    catch (error) {
        console.error("[getTareasPorRut] error:", error);
        return res.status(500).json({ message: "Error obteniendo tareas del RUT" });
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
// 3.1) Crear plantilla
//    POST /tareas/plantillas
// ---------------------------------------------------------------------------
const crearPlantilla = async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: "No autorizado" });
        const b = req.body ?? {};
        const area = String(b.area ?? "").trim();
        const nombre = String(b.nombre ?? "").trim();
        const detalle = String(b.detalle ?? "").trim();
        const frecuencia = String(b.frecuencia ?? "").trim(); // "MENSUAL" | "SEMANAL" | "UNICA"
        const presentacion = String(b.presentacion ?? "").trim(); // "CLIENTE" | "INTERNO"
        const frecuenciaTexto = b.frecuenciaTexto != null ? String(b.frecuenciaTexto) : null;
        const plazoMaximoTexto = b.plazoMaximoTexto != null ? String(b.plazoMaximoTexto) : null;
        const diaMesVencimiento = b.diaMesVencimiento === "" || b.diaMesVencimiento == null
            ? null
            : Number(b.diaMesVencimiento);
        const diaSemanaVencimiento = b.diaSemanaVencimiento === "" || b.diaSemanaVencimiento == null
            ? null
            : Number(b.diaSemanaVencimiento);
        const responsableDefaultId = b.responsableDefaultId === "" || b.responsableDefaultId == null
            ? null
            : Number(b.responsableDefaultId);
        const codigoDocumento = b.codigoDocumento != null && String(b.codigoDocumento).trim() !== ""
            ? String(b.codigoDocumento).trim()
            : null;
        const requiereDrive = typeof b.requiereDrive === "boolean"
            ? b.requiereDrive
            : b.requiereDrive == null
                ? true
                : String(b.requiereDrive).toLowerCase() === "true";
        const activo = typeof b.activo === "boolean"
            ? b.activo
            : b.activo == null
                ? true
                : String(b.activo).toLowerCase() === "true";
        // ---- Validaciones duras de enum (evita 500 por Prisma) ----
        const areasValidas = new Set(["CONTA", "RRHH", "FINANZAS", "LOGISTICA"]); // ajusta a TU enum real
        const frecuenciasValidas = new Set(["MENSUAL", "SEMANAL", "UNICA"]);
        const presentacionesValidas = new Set(["CLIENTE", "INTERNO"]);
        if (!areasValidas.has(area))
            return res.status(400).json({ message: "area inválida" });
        if (!nombre)
            return res.status(400).json({ message: "nombre es obligatorio" });
        if (!detalle)
            return res.status(400).json({ message: "detalle es obligatorio" });
        if (!frecuenciasValidas.has(frecuencia))
            return res.status(400).json({ message: "frecuencia inválida" });
        if (!presentacionesValidas.has(presentacion))
            return res.status(400).json({ message: "presentacion inválida" });
        if (frecuencia === "MENSUAL") {
            if (!Number.isFinite(diaMesVencimiento) || diaMesVencimiento < 1 || diaMesVencimiento > 31) {
                return res.status(400).json({ message: "diaMesVencimiento requerido (1-31) cuando frecuencia es MENSUAL" });
            }
        }
        if (frecuencia === "SEMANAL") {
            if (!Number.isFinite(diaSemanaVencimiento) || diaSemanaVencimiento < 1 || diaSemanaVencimiento > 7) {
                return res.status(400).json({ message: "diaSemanaVencimiento requerido (1-7) cuando frecuencia es SEMANAL" });
            }
        }
        if (responsableDefaultId != null && !Number.isFinite(responsableDefaultId)) {
            return res.status(400).json({ message: "responsableDefaultId inválido" });
        }
        const nueva = await prisma_1.prisma.tareaPlantilla.create({
            data: {
                area: area,
                nombre,
                nombreNorm: (0, normNombrePlantilla_1.normNombrePlantilla)(nombre),
                detalle,
                frecuencia: frecuencia,
                presentacion: presentacion,
                frecuenciaTexto,
                plazoMaximoTexto,
                diaMesVencimiento,
                diaSemanaVencimiento,
                responsableDefaultId,
                codigoDocumento,
                requiereDrive,
                activo,
            },
        });
        return res.status(201).json(nueva);
    }
    catch (error) {
        console.error("[crearPlantilla] error:", error);
        return res.status(500).json({ message: "Error creando plantilla" });
    }
};
exports.crearPlantilla = crearPlantilla;
// ---------------------------------------------------------------------------
// 4) Obtener tareas por plantilla
//    GET /tareas/por-plantilla/:idPlantilla
//    soporta ?trabajadorId & ?anio & ?mes
// ---------------------------------------------------------------------------
const getTareasPorPlantilla = async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: "No autorizado" });
        const idPlantilla = Number(req.params.idPlantilla);
        if (!idPlantilla || Number.isNaN(idPlantilla)) {
            return res.status(400).json({ message: "idPlantilla inválido" });
        }
        const { trabajadorId: trabajadorIdQuery, anio, mes } = req.query;
        let trabajadorId;
        if (trabajadorIdQuery) {
            const parsed = Number(trabajadorIdQuery);
            if (Number.isNaN(parsed)) {
                return res.status(400).json({ message: "trabajadorId inválido en la query" });
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
                return res.status(400).json({ message: "anio/mes inválidos. Ejemplo: ?anio=2025&mes=1" });
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
        if (fechaFiltro)
            where.fechaProgramada = fechaFiltro;
        const tareas = await prisma_1.prisma.tareaAsignada.findMany({
            where,
            include: {
                tareaPlantilla: true,
                asignado: { select: { id_trabajador: true, nombre: true, email: true } },
            },
            orderBy: { rutCliente: "asc" },
        });
        const rutList = Array.from(new Set(tareas.map((t) => t.rutCliente).filter((rut) => !!rut)));
        let mapaClientes = new Map();
        if (rutList.length > 0) {
            const clientes = await prisma_1.prisma.cliente.findMany({
                where: { rut: { in: rutList } },
                select: { rut: true, razonSocial: true },
            });
            mapaClientes = new Map(clientes.map((c) => [c.rut, c.razonSocial]));
        }
        const tareasConCliente = tareas.map((t) => ({
            ...t,
            clienteRazonSocial: t.rutCliente ? mapaClientes.get(t.rutCliente) ?? null : null,
        }));
        return res.json(tareasConCliente);
    }
    catch (error) {
        console.error("[getTareasPorPlantilla] error:", error);
        return res.status(500).json({ message: "Error obteniendo tareas por plantilla" });
    }
};
exports.getTareasPorPlantilla = getTareasPorPlantilla;
// ---------------------------------------------------------------------------
// 5) Crear tareas masivas desde plantilla (asignar a 1 o muchas empresas)
//    POST /tareas/bulk-desde-plantilla
// ---------------------------------------------------------------------------
const crearTareasDesdePlantilla = async (req, res) => {
    try {
        const { tareaPlantillaId, rutClientes, fechaProgramada, asignarAId } = req.body;
        if (!tareaPlantillaId || !rutClientes?.length) {
            return res.status(400).json({ message: "tareaPlantillaId y rutClientes son obligatorios" });
        }
        if (!fechaProgramada) {
            return res.status(400).json({ message: "fechaProgramada (vencimiento) es obligatoria" });
        }
        const fecha = new Date(fechaProgramada);
        if (Number.isNaN(fecha.getTime())) {
            return res.status(400).json({ message: "fechaProgramada inválida (debe ser ISO o fecha válida)" });
        }
        const plantilla = await prisma_1.prisma.tareaPlantilla.findUnique({
            where: { id_tarea_plantilla: tareaPlantillaId },
            select: { id_tarea_plantilla: true, responsableDefaultId: true },
        });
        if (!plantilla) {
            return res.status(404).json({ message: "Plantilla no encontrada" });
        }
        const trabajadorAsignadoId = asignarAId ?? plantilla.responsableDefaultId ?? null;
        const rutNormalizados = Array.from(new Set(rutClientes.map((r) => String(r ?? "").trim()).filter((r) => r.length > 0)));
        if (rutNormalizados.length === 0) {
            return res.status(400).json({ message: "rutClientes no contiene RUTs válidos" });
        }
        const exclusiones = await prisma_1.prisma.clienteTareaExclusion.findMany({
            where: {
                tareaPlantillaId,
                rutCliente: { in: rutNormalizados },
                activa: true,
                OR: [{ desdeFecha: null }, { desdeFecha: { lte: fecha } }],
            },
            select: { rutCliente: true, motivo: true, desdeFecha: true },
        });
        const exclSet = new Set(exclusiones.map((e) => String(e.rutCliente).trim()));
        const rutFiltrados = rutNormalizados.filter((r) => !exclSet.has(r));
        const omitidosPorExclusion = rutNormalizados.filter((r) => exclSet.has(r));
        if (rutFiltrados.length === 0) {
            return res.status(201).json({
                message: "No se crearon tareas: todos los RUT estaban excluidos.",
                count: 0,
                excludedCount: omitidosPorExclusion.length,
                excluded: exclusiones,
            });
        }
        const dataToCreate = rutFiltrados.map((rut) => ({
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
        // ✅ VINCULAR CLIENTE -> EJECUTIVO para que aparezca en /clientes?agenteId=...
        // (sin pisar asignaciones previas)
        if (typeof trabajadorAsignadoId === "number" && trabajadorAsignadoId > 0) {
            await prisma_1.prisma.cliente.updateMany({
                where: {
                    rut: { in: rutFiltrados },
                    OR: [{ agenteId: null }, { agenteId: trabajadorAsignadoId }],
                },
                data: { agenteId: trabajadorAsignadoId },
            });
        }
        return res.status(201).json({
            message: "Tareas creadas correctamente",
            count: resultado.count,
            excludedCount: omitidosPorExclusion.length,
            excluded: exclusiones,
        });
    }
    catch (error) {
        console.error("[crearTareasDesdePlantilla] error:", error);
        return res.status(500).json({ message: "Error creando tareas masivas" });
    }
};
exports.crearTareasDesdePlantilla = crearTareasDesdePlantilla;
// ---------------------------------------------------------------------------
// 6) Actualizar estado (SIN crear siguiente período)
//    PATCH /tareas/:id/estado
// ---------------------------------------------------------------------------
const actualizarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, fechaComplecion } = req.body;
        if (!id || !estado) {
            return res.status(400).json({ message: "id de tarea y nuevo estado son obligatorios" });
        }
        const idTarea = Number(id);
        if (Number.isNaN(idTarea))
            return res.status(400).json({ message: "ID inválido" });
        const dataUpdate = { estado };
        // Manejo fechaComplecion
        if (estado === "COMPLETADA") {
            dataUpdate.fechaComplecion = fechaComplecion ? new Date(fechaComplecion) : new Date();
        }
        else if (fechaComplecion) {
            dataUpdate.fechaComplecion = new Date(fechaComplecion);
        }
        else {
            // opcional: si no está completada y no te mandan fecha, podrías limpiar la fecha
            // dataUpdate.fechaComplecion = null;
        }
        const tareaActualizada = await prisma_1.prisma.tareaAsignada.update({
            where: { id_tarea_asignada: idTarea },
            data: dataUpdate,
            include: { tareaPlantilla: true },
        });
        // ✅ Mantener: asegurar carpeta para CONTA
        if (tareaActualizada.tareaPlantilla?.area === client_1.Area.CONTA) {
            try {
                await (0, driveContaTasks_1.ensureContaTaskFolderForTareaAsignada)(tareaActualizada.id_tarea_asignada);
            }
            catch (e) {
                console.error("[actualizarEstado] No se pudo asegurar carpeta de la tarea:", e);
                // NO cortamos la respuesta, porque el estado ya se guardó en BD
            }
        }
        // ❌ Eliminado: creación automática de la siguiente tarea al completar
        return res.json(tareaActualizada);
    }
    catch (error) {
        console.error("[actualizarEstado] error:", error);
        return res.status(500).json({ message: "Error actualizando estado de tarea" });
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
                asignado: { select: { id_trabajador: true, nombre: true, email: true } },
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
        return res.status(500).json({ message: "Error obteniendo resumen supervisión" });
    }
};
exports.getResumenSupervision = getResumenSupervision;
// ---------------------------------------------------------------------------
// 8) Asegurar carpeta de Drive para una tarea de CONTA (manual / debug)
//    POST /tareas/:id/ensure-drive-folder
// ---------------------------------------------------------------------------
const ensureDriveFolder = async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: "No autorizado" });
        const id = Number(req.params.id);
        if (Number.isNaN(id))
            return res.status(400).json({ error: "ID de tarea inválido" });
        const folderId = await (0, driveContaTasks_1.ensureContaTaskFolderForTareaAsignada)(id);
        return res.json({ tareaId: id, driveTareaFolderId: folderId });
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
        if (!req.user?.id)
            return res.status(401).json({ message: "No autorizado" });
        const idTarea = Number(req.params.id);
        if (Number.isNaN(idTarea))
            return res.status(400).json({ message: "ID de tarea inválido" });
        const file = req.file;
        if (!file)
            return res.status(400).json({ message: "No se recibió ningún archivo" });
        const tarea = await prisma_1.prisma.tareaAsignada.findUnique({
            where: { id_tarea_asignada: idTarea },
            include: { tareaPlantilla: true, asignado: true },
        });
        if (!tarea)
            return res.status(404).json({ message: "Tarea no encontrada" });
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
            media: { mimeType: file.mimetype, body: bufferToStream(file.buffer) },
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
        return res.status(500).json({ message: "Error subiendo archivo de tarea" });
    }
};
exports.subirArchivo = subirArchivo;
const listPlantillasConAplicaPorCliente = async (req, res) => {
    try {
        const rut = String(req.query.rut ?? "").trim();
        if (!rut)
            return res.status(400).json({ error: "rut es requerido" });
        // 1) Traer "overrides" del rut (IMPORTANTE: sin filtrar por activa)
        //    Porque ahora activa=false significa "APLICA"
        const overrides = await prisma_1.prisma.clienteTareaExclusion.findMany({
            where: { rutCliente: rut },
            select: { tareaPlantillaId: true, motivo: true, desdeFecha: true, activa: true },
        });
        const map = new Map(overrides.map((e) => [e.tareaPlantillaId, e]));
        // 2) Traer plantillas activas
        const plantillas = await prisma_1.prisma.tareaPlantilla.findMany({
            where: { activo: true },
            orderBy: [{ area: "asc" }, { nombre: "asc" }],
            select: {
                id_tarea_plantilla: true,
                area: true,
                nombre: true,
                codigoDocumento: true,
                frecuencia: true,
                presentacion: true,
                requiereDrive: true,
            },
        });
        // 3) Default: NO aplica si no hay override
        //    - override.activa === false => APLICA
        //    - override.activa === true  => NO aplica
        //    - no existe override        => NO aplica (default)
        const out = plantillas.map((p) => {
            const ov = map.get(p.id_tarea_plantilla);
            const aplica = ov ? ov.activa === false : false;
            return {
                ...p,
                aplica,
                exclusion: ov
                    ? {
                        motivo: ov.motivo ?? null,
                        desdeFecha: ov.desdeFecha ?? null,
                        activa: ov.activa, // ✅ útil para el front (opcional)
                    }
                    : null,
            };
        });
        return res.json(out);
    }
    catch (err) {
        console.error("listPlantillasConAplicaPorCliente error:", err);
        return res.status(500).json({ error: "Error interno listando plantillas con aplica" });
    }
};
exports.listPlantillasConAplicaPorCliente = listPlantillasConAplicaPorCliente;
/**
 * PATCH /api/tareas/exclusion
 * body: { rutCliente, tareaPlantillaId, activa, motivo?, desdeFecha? }
 */
const upsertClienteTareaExclusion = async (req, res) => {
    try {
        const body = req.body;
        const rutCliente = String(body.rutCliente ?? "").trim();
        const tareaPlantillaId = Number(body.tareaPlantillaId);
        if (!rutCliente)
            return res.status(400).json({ error: "rutCliente es requerido" });
        if (!Number.isFinite(tareaPlantillaId)) {
            return res.status(400).json({ error: "tareaPlantillaId inválido" });
        }
        if (typeof body.activa !== "boolean") {
            return res.status(400).json({ error: "activa debe ser boolean (true/false)" });
        }
        const motivoLimpio = typeof body.motivo === "string" ? body.motivo.trim() : body.motivo ?? null;
        let desdeFecha = null;
        if (body.desdeFecha) {
            const parsed = new Date(body.desdeFecha);
            if (Number.isNaN(parsed.getTime())) {
                return res.status(400).json({ error: "desdeFecha inválido (debe ser ISO)" });
            }
            desdeFecha = parsed;
        }
        // ✅ valida que el cliente exista (rut NO es unique en tu schema actual)
        const cliente = await prisma_1.prisma.cliente.findFirst({
            where: { rut: rutCliente },
            select: { rut: true },
        });
        if (!cliente)
            return res.status(404).json({ error: "Cliente no encontrado" });
        // valida que la plantilla exista
        const plantilla = await prisma_1.prisma.tareaPlantilla.findUnique({
            where: { id_tarea_plantilla: tareaPlantillaId },
            select: { id_tarea_plantilla: true, activo: true },
        });
        if (!plantilla)
            return res.status(404).json({ error: "Plantilla no encontrada" });
        const now = new Date();
        const record = await prisma_1.prisma.clienteTareaExclusion.upsert({
            where: {
                rutCliente_tareaPlantillaId: {
                    rutCliente,
                    tareaPlantillaId,
                },
            },
            create: {
                rutCliente,
                tareaPlantillaId,
                activa: body.activa, // true=NO aplica, false=APLICA
                motivo: motivoLimpio,
                desdeFecha,
                // ✅ Prisma te lo exige como required
                updatedAt: now,
            },
            update: {
                activa: body.activa,
                motivo: motivoLimpio,
                desdeFecha,
                // ✅ mantener updatedAt consistente
                updatedAt: now,
            },
            select: {
                id: true,
                rutCliente: true,
                tareaPlantillaId: true,
                activa: true,
                motivo: true,
                desdeFecha: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        // =========================================================
        // ✅ EFECTO EN TAREAS YA CREADAS
        // =========================================================
        // Si queda en "NO aplica" (activa=true) => ocultar tareas existentes
        if (body.activa === true) {
            await prisma_1.prisma.tareaAsignada.updateMany({
                where: {
                    rutCliente,
                    tareaPlantillaId,
                    estado: { not: "NO_APLICA" },
                },
                data: { estado: "NO_APLICA" },
            });
        }
        // Si vuelve a "APLICA" (activa=false) => opcional reactivar tareas NO_APLICA
        // (Si NO quieres reactivarlas, borra este bloque)
        if (body.activa === false) {
            await prisma_1.prisma.tareaAsignada.updateMany({
                where: {
                    rutCliente,
                    tareaPlantillaId,
                    estado: "NO_APLICA",
                },
                data: { estado: "PENDIENTE" }, // ajusta si tu estado inicial real es otro
            });
        }
        return res.json(record);
    }
    catch (err) {
        console.error("upsertClienteTareaExclusion error:", err);
        return res.status(500).json({ error: "Error interno guardando exclusión" });
    }
};
exports.upsertClienteTareaExclusion = upsertClienteTareaExclusion;
// DELETE /tareas/plantillas/:id
const eliminarPlantillaConTareas = async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: "No autorizado" });
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "id inválido" });
        }
        // 1) valida que exista
        const plantilla = await prisma_1.prisma.tareaPlantilla.findUnique({
            where: { id_tarea_plantilla: id },
            select: { id_tarea_plantilla: true, nombre: true, area: true },
        });
        if (!plantilla)
            return res.status(404).json({ message: "Plantilla no encontrada" });
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            // 2) traer IDs de tareas asignadas ligadas a la plantilla
            const tareas = await tx.tareaAsignada.findMany({
                where: { tareaPlantillaId: id },
                select: { id_tarea_asignada: true },
            });
            const tareaIds = tareas.map((t) => t.id_tarea_asignada);
            // 3) borrar notificaciones que referencian esas tareas (FK Notificacion_tareaId_fkey)
            const notifDeleted = tareaIds.length
                ? await tx.notificacion.deleteMany({
                    where: { tareaId: { in: tareaIds } },
                })
                : { count: 0 };
            // 4) borrar tareas asignadas de esa plantilla
            const tareasDeleted = await tx.tareaAsignada.deleteMany({
                where: { tareaPlantillaId: id },
            });
            // 5) borrar exclusiones (si aplica)
            const exclDeleted = await tx.clienteTareaExclusion.deleteMany({
                where: { tareaPlantillaId: id },
            });
            // 6) borrar plantilla
            await tx.tareaPlantilla.delete({
                where: { id_tarea_plantilla: id },
            });
            // 7) validación dura: confirmar que no existe
            const check = await tx.tareaPlantilla.findUnique({
                where: { id_tarea_plantilla: id },
                select: { id_tarea_plantilla: true },
            });
            if (check) {
                throw new Error("No se pudo confirmar eliminación: la plantilla aún existe.");
            }
            return {
                notifDeleted: notifDeleted.count,
                tareasDeleted: tareasDeleted.count,
                exclDeleted: exclDeleted.count,
            };
        });
        return res.json({
            message: "Plantilla eliminada junto a sus tareas asignadas",
            plantillaId: id,
            notificacionesEliminadas: result.notifDeleted,
            tareasEliminadas: result.tareasDeleted,
            exclusionesEliminadas: result.exclDeleted,
        });
    }
    catch (error) {
        console.error("[eliminarPlantillaConTareas] error:", error);
        return res.status(500).json({ message: "Error eliminando plantilla" });
    }
};
exports.eliminarPlantillaConTareas = eliminarPlantillaConTareas;
const getTareasAsignadasPorClienteYTrabajador = async (req, res) => {
    try {
        const rut = String(req.query.rut || "").trim();
        const trabajadorId = Number(req.query.trabajadorId);
        const limit = Math.min(Number(req.query.limit || 200), 1000);
        if (!rut)
            return res.status(400).json({ message: "rut es requerido" });
        if (!Number.isFinite(trabajadorId) || trabajadorId <= 0) {
            return res.status(400).json({ message: "trabajadorId inválido" });
        }
        const rows = await prisma_1.prisma.tareaAsignada.findMany({
            where: {
                rutCliente: rut, // 👈 tu campo real
                trabajadorId: trabajadorId, // 👈 tu campo real
            },
            take: limit,
            orderBy: [{ fechaProgramada: "asc" }, { id_tarea_asignada: "asc" }],
            include: {
                tareaPlantilla: true, // 👈 relación existe en tu schema
            },
        });
        // Respuesta normalizada (para tu front)
        const data = rows.map((r) => ({
            id_tarea_asignada: r.id_tarea_asignada,
            tareaPlantillaId: r.tareaPlantillaId,
            trabajadorId: r.trabajadorId,
            rutCliente: r.rutCliente,
            estado: r.estado,
            fechaProgramada: r.fechaProgramada,
            fechaComplecion: r.fechaComplecion,
            comentarios: r.comentarios ?? null,
            driveTareaFolderId: r.driveTareaFolderId ?? null,
            // desde la plantilla
            plantilla: {
                id_tarea_plantilla: r.tareaPlantilla.id_tarea_plantilla,
                area: r.tareaPlantilla.area ?? null,
                nombre: r.tareaPlantilla.nombre,
                detalle: r.tareaPlantilla.detalle ?? null,
                codigoDocumento: r.tareaPlantilla.codigoDocumento ?? null,
                presentacion: r.tareaPlantilla.presentacion ?? null,
                frecuencia: r.tareaPlantilla.frecuencia ?? null,
                activo: r.tareaPlantilla.activo,
                requiereDrive: r.tareaPlantilla.requiereDrive ?? null,
                diaSemanaVencimiento: r.tareaPlantilla.diaSemanaVencimiento ?? null,
                diaMesVencimiento: r.tareaPlantilla.diaMesVencimiento ?? null,
            },
        }));
        return res.json(data);
    }
    catch (err) {
        console.error("[API] getTareasAsignadasPorClienteYTrabajador", err);
        return res.status(500).json({ message: "Error interno" });
    }
};
exports.getTareasAsignadasPorClienteYTrabajador = getTareasAsignadasPorClienteYTrabajador;
// ---------------------------------------------------------------------------
// 2.B) Obtener tareas por MUCHOS RUTs (BULK)
//    POST /tareas/por-ruts
//    body: { trabajadorId?, ruts: string[], anio?, mes? }
// ---------------------------------------------------------------------------
const getTareasPorRuts = async (req, res) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ message: "No autorizado" });
        const body = (req.body ?? {});
        // trabajadorId: si viene en body úsalo, si no usa el del token
        let trabajadorId;
        if (body.trabajadorId != null) {
            const parsed = Number(body.trabajadorId);
            if (Number.isNaN(parsed)) {
                return res.status(400).json({ message: "trabajadorId inválido" });
            }
            trabajadorId = parsed;
        }
        else {
            trabajadorId = req.user.id;
        }
        const ruts = Array.from(new Set((body.ruts ?? []).map((r) => String(r ?? "").trim()).filter(Boolean)));
        if (ruts.length === 0) {
            return res.json({ tareas: [] });
        }
        // Filtro opcional por año/mes
        let fechaFiltro;
        if (body.anio != null && body.mes != null) {
            const year = Number(body.anio);
            const month = Number(body.mes);
            if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
                return res.status(400).json({ message: "anio/mes inválidos. Ej: { anio: 2025, mes: 12 }" });
            }
            const inicio = new Date(year, month - 1, 1);
            const fin = new Date(year, month, 1);
            fechaFiltro = { gte: inicio, lt: fin };
        }
        const where = {
            trabajadorId,
            rutCliente: { in: ruts },
            estado: { not: "NO_APLICA" },
        };
        if (fechaFiltro)
            where.fechaProgramada = fechaFiltro;
        // ✅ IMPORTANTE: select en vez de include completo (menos payload)
        const tareas = await prisma_1.prisma.tareaAsignada.findMany({
            where,
            orderBy: [{ rutCliente: "asc" }, { fechaProgramada: "asc" }],
            include: {
                tareaPlantilla: true,
                asignado: { select: { id_trabajador: true, nombre: true, email: true } },
            },
        });
        return res.json({ tareas });
    }
    catch (error) {
        console.error("[getTareasPorRuts] error:", error);
        return res.status(500).json({ message: "Error obteniendo tareas por ruts" });
    }
};
exports.getTareasPorRuts = getTareasPorRuts;
