"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearDesdePlantillaMasivo = crearDesdePlantillaMasivo;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function asISODate(v) {
    const d = new Date(String(v ?? ""));
    return Number.isFinite(d.getTime()) ? d : null;
}
async function crearDesdePlantillaMasivo(req, res) {
    try {
        const { rutClientes, plantillaIds, trabajadorId, fechaProgramada, skipDuplicates = true } = req.body ?? {};
        const ruts = Array.isArray(rutClientes)
            ? rutClientes.map((x) => String(x).trim()).filter(Boolean)
            : [];
        const plantillas = Array.isArray(plantillaIds)
            ? plantillaIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
            : [];
        const tId = Number(trabajadorId);
        const fecha = asISODate(fechaProgramada);
        if (!ruts.length)
            return res.status(400).json({ error: "rutClientes requerido" });
        if (!plantillas.length)
            return res.status(400).json({ error: "plantillaIds requerido" });
        if (!Number.isFinite(tId) || tId <= 0)
            return res.status(400).json({ error: "trabajadorId inválido" });
        if (!fecha)
            return res.status(400).json({ error: "fechaProgramada inválida" });
        const trabajador = await prisma.trabajador.findUnique({
            where: { id_trabajador: tId },
            select: { id_trabajador: true, nombre: true, email: true },
        });
        if (!trabajador)
            return res.status(404).json({ error: "Trabajador no existe" });
        const plantillasFound = await prisma.tareaPlantilla.findMany({
            where: { id_tarea_plantilla: { in: plantillas } },
            select: { id_tarea_plantilla: true, nombre: true },
        });
        const validPlantillaIds = new Set(plantillasFound.map((p) => p.id_tarea_plantilla));
        const missing = plantillas.filter((id) => !validPlantillaIds.has(id));
        if (missing.length)
            return res.status(400).json({ error: "Hay plantillas inválidas", missing });
        const data = [];
        for (const rut of ruts) {
            for (const pid of plantillas) {
                data.push({
                    tareaPlantillaId: pid,
                    rutCliente: rut,
                    trabajadorId: tId,
                    estado: client_1.EstadoTarea.PENDIENTE,
                    fechaProgramada: fecha,
                });
            }
        }
        const created = await prisma.tareaAsignada.createMany({
            data,
            skipDuplicates: Boolean(skipDuplicates),
        });
        return res.json({
            ok: true,
            requested: data.length,
            created: created.count,
            skipped: data.length - created.count,
            trabajador,
            fechaProgramada: fecha.toISOString(),
        });
    }
    catch (e) {
        console.error("crearDesdePlantillaMasivo error:", e);
        return res.status(500).json({ error: "Error interno creando tareas masivas" });
    }
}
