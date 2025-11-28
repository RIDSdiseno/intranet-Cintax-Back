import { Request, Response } from "express";
import {
  PrismaClient,
  Area,
  EstadoTarea,
  TipoRelacion,
} from "@prisma/client";

const prisma = new PrismaClient();

// Tipos para el front
type FrontCategoria = "Contabilidad" | "Tributario" | "Entre otros";
type FrontArea = "Clientes" | "Proveedores" | "Interno";
type FrontEstado = "Activo" | "Inactivo";

const mapCategoriaFromArea = (area: Area | null): FrontCategoria => {
  switch (area) {
    case Area.CONTA:
      return "Contabilidad";
    case Area.TRIBUTARIO:
      return "Tributario";
    default:
      return "Entre otros";
  }
};

const mapAreaFromTipoRelacion = (
  tipo: TipoRelacion | null
): FrontArea => {
  switch (tipo) {
    case TipoRelacion.CLIENTES:
      return "Clientes";
    case TipoRelacion.PROVEEDORES:
      return "Proveedores";
    case TipoRelacion.INTERNO:
    default:
      return "Interno";
  }
};

export const listTrabajadores = async (req: Request, res: Response) => {
  try {
    const { search, categoria, area, estado } = req.query as {
      search?: string;
      categoria?: string;
      area?: string;
      estado?: "Activo" | "Inactivo";
    };

    const trabajadores = await prisma.trabajador.findMany({
      select: {
        id_trabajador: true,
        nombre: true,
        email: true,
        tipoRelacion: true,
        areaInterna: true,
        status: true,
        lastActivityAt: true,
        tareasAsignadas: {
          select: {
            estado: true,
          },
        },
      },
      orderBy: { nombre: "asc" },
    });

    let personas = trabajadores.map((t) => {
      const categoriaFront = mapCategoriaFromArea(t.areaInterna ?? null);
      const areaFront = mapAreaFromTipoRelacion(t.tipoRelacion ?? null);
      const estadoFront: FrontEstado = t.status ? "Activo" : "Inactivo";

      const proyectosActivos = t.tareasAsignadas.filter(
        (ta) =>
          ta.estado === EstadoTarea.PENDIENTE ||
          ta.estado === EstadoTarea.EN_PROCESO
      ).length;

      return {
        id: t.id_trabajador,
        nombre: t.nombre,
        email: t.email,
        area: areaFront,
        categoria: categoriaFront,
        estado: estadoFront,
        ultimoLogin: t.lastActivityAt,
        proyectosActivos,
      };
    });

    if (
      categoria === "Contabilidad" ||
      categoria === "Tributario" ||
      categoria === "Entre otros"
    ) {
      personas = personas.filter((p) => p.categoria === categoria);
    }

    if (
      area === "Clientes" ||
      area === "Proveedores" ||
      area === "Interno"
    ) {
      personas = personas.filter((p) => p.area === area);
    }

    if (estado === "Activo" || estado === "Inactivo") {
      personas = personas.filter((p) => p.estado === estado);
    }

    if (search && search.trim() !== "") {
      const q = search.trim().toLowerCase();
      personas = personas.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.area.toLowerCase().includes(q)
      );
    }

    return res.json({ personas });
  } catch (err) {
    console.error("listTrabajadores error:", err);
    return res
      .status(500)
      .json({ error: "Error interno listando trabajadores" });
  }
};
