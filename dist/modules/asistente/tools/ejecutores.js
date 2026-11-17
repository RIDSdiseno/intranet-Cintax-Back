"use strict";
// src/modules/asistente/tools/ejecutores.ts
//
// Lo que se ejecuta de verdad cuando el modelo pide una herramienta.
//
// ====================================================================
// POR QUE ESTE ARCHIVO LLAMA A LOS SERVICIOS Y NO A PRISMA
// ====================================================================
// `buscar_tickets` y `resumen_tickets` usan `getTicketsForUser` y
// `getSummaryForUser`, las mismas funciones que alimentan la pantalla de
// tickets. Eso significa que el asistente pasa por getUserContext ->
// enforceArea -> el filtro por area, exactamente igual que la tabla.
//
// No se reimplementa el modelo de permisos: es el mismo codigo. Si manana
// cambia la regla de visibilidad, el asistente la hereda sola. Consultar
// Prisma directamente aca seria crear una segunda puerta que se puede
// desincronizar en silencio con la primera.
//
// Las tareas no tienen filtro por area en este proyecto (el modulo de
// tareas filtra por trabajadorId), asi que aca se replica ese criterio:
// cada quien ve SUS tareas. No se inventa un criterio nuevo.
//
// Todo es de solo lectura. Ninguna herramienta escribe.
// ====================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ejecutarHerramienta = ejecutarHerramienta;
const client_1 = require("@prisma/client");
const supervision_config_1 = require("../../../config/supervision.config");
const prisma_1 = require("../../../lib/prisma");
const tickets_service_1 = require("../../tickets/tickets.service");
const rut_1 = require("../../../utils/rut");
const acciones_1 = require("./acciones");
/** Recorta un entero a un rango, con valor por defecto cuando viene null. */
function limiteSeguro(valor, porDefecto, maximo) {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0)
        return porDefecto;
    return Math.min(Math.floor(n), maximo);
}
function textoOpcional(valor) {
    if (typeof valor !== "string")
        return undefined;
    const limpio = valor.trim();
    return limpio ? limpio : undefined;
}
/**
 * Trabajadores cuyo nombre o correo contiene el texto, sin distinguir
 * mayusculas.
 *
 * La usan `buscarTickets` y `buscarTareas` para traducir "Diego" a un id.
 * Devolver siempre la lista completa, y no el primero que calce, es a
 * proposito: quien llama decide que hacer si hay varios, y ninguna de las dos
 * debe elegir una persona al azar y entregar un numero que parezca exacto.
 */
async function trabajadoresQueCoinciden(texto) {
    return prisma_1.prisma.trabajador.findMany({
        where: {
            OR: [
                { nombre: { contains: texto, mode: "insensitive" } },
                { email: { contains: texto, mode: "insensitive" } },
            ],
        },
        select: { id_trabajador: true, nombre: true },
    });
}
async function buscarTickets(input, user) {
    const limite = limiteSeguro(input.limite, 20, 50);
    /**
     * Filtro por agente asignado.
     *
     * `getTicketsForUser` espera un id, asi que el nombre se resuelve antes.
     *
     * A diferencia de las tareas, aca no hace falta preguntar si la persona
     * supervisa: el alcance por area lo aplica `getTicketsForUser` por dentro,
     * despues de este filtro. Un agente que pregunte por un companero de otra
     * area recibe cero, no los tickets de esa area.
     */
    const responsable = textoOpcional(input.responsable);
    let asignado;
    let responsableResuelto = null;
    if (responsable) {
        const sinAsignar = /^(sin asignar|no asignado|nadie|ninguno)$/i;
        if (sinAsignar.test(responsable)) {
            asignado = "none";
            responsableResuelto = "sin asignar";
        }
        else {
            const personas = await trabajadoresQueCoinciden(responsable);
            if (personas.length === 0) {
                // Sin boton: no hay nada que ir a ver.
                //
                // La nota le dice al modelo que REINTENTE, no que pregunte. "de X"
                // casi nunca significa "asignado a X": puede ser una palabra del
                // asunto ("los tickets de test") o el cliente que escribio ("los de
                // Ignacio"), que no es trabajador. Sin esta instruccion el modelo
                // devolvia "no encontre a nadie con ese nombre" y dejaba la pregunta
                // sin responder, cuando bastaba una segunda busqueda por texto.
                return {
                    datos: {
                        total_encontrados: 0,
                        recibidos_por_el_asistente: 0,
                        tickets: [],
                        nota: `"${responsable}" no es ningun trabajador, asi que no se filtro por agente asignado. Vuelve a llamar la herramienta AHORA con texto="${responsable}" en vez de responsable: eso busca en el asunto, la descripcion y el correo del solicitante. Recien si eso tampoco devuelve nada, dile al usuario que no hay resultados.`,
                    },
                };
            }
            // El filtro admite un solo id. Con varias coincidencias se devuelve la
            // lista en vez de elegir una al azar y entregar un numero equivocado.
            if (personas.length > 1) {
                return {
                    datos: {
                        total_encontrados: 0,
                        recibidos_por_el_asistente: 0,
                        tickets: [],
                        coincidencias: personas.map((p) => p.nombre),
                        nota: `"${responsable}" coincide con varias personas. Pregunta a cual se refiere y vuelve a consultar con el nombre completo.`,
                    },
                };
            }
            asignado = String(personas[0].id_trabajador);
            responsableResuelto = personas[0].nombre;
        }
    }
    // El alcance (area, rol, usuario) sale del JWT, NO del input del modelo.
    const pagina = await (0, tickets_service_1.getTicketsForUser)({
        user,
        status: textoOpcional(input.estado),
        priority: textoOpcional(input.prioridad),
        q: textoOpcional(input.texto),
        solicitante: textoOpcional(input.solicitante),
        asignado,
        page: 1,
        pageSize: limite,
    });
    // Los nombres de los asignados, en una consulta y no una por ticket.
    const idsAsignados = Array.from(new Set(pagina.items
        .map((t) => t.trabajadorId)
        .filter((id) => typeof id === "number")));
    const asignados = idsAsignados.length > 0
        ? await prisma_1.prisma.trabajador.findMany({
            where: { id_trabajador: { in: idsAsignados } },
            select: { id_trabajador: true, nombre: true },
        })
        : [];
    const nombrePorId = new Map(asignados.map((a) => [a.id_trabajador, a.nombre]));
    // Un solo resultado es el caso en que el boton sirve de verdad: lleva
    // directo a ese ticket en vez de dejarte buscandolo en la tabla. Con cero
    // no hay nada que abrir. Con varios, la pantalla se abre con los MISMOS
    // filtros que se acaban de consultar, no en la vista sin filtrar: el
    // numero que dice la respuesta y lo que muestra la tabla tienen que
    // coincidir, o el boton desmiente a la cifra.
    const accion = pagina.total === 0
        ? undefined
        : pagina.total === 1 && pagina.items.length === 1
            ? (0, acciones_1.accionTicket)(pagina.items[0].id, pagina.items[0].number)
            : (0, acciones_1.accionTickets)({
                busqueda: textoOpcional(input.texto),
                estado: textoOpcional(input.estado),
                prioridad: textoOpcional(input.prioridad),
                solicitante: textoOpcional(input.solicitante),
                // Ya resuelto a id (o "none"): es el valor que espera el selector
                // de agente, no el nombre que escribio el usuario.
                agente: asignado,
            }, pagina.total);
    return {
        accion,
        datos: {
            ...(responsableResuelto
                ? { filtrado_por_asignado: responsableResuelto }
                : {}),
            total_encontrados: pagina.total,
            // "recibidos", no "mostrados": son las filas que le llegan al modelo, no
            // lo que el usuario ve. Llamarlo "mostrados" hacia que el modelo dijera
            // "te mostre los primeros 50" sin haber listado ninguno.
            recibidos_por_el_asistente: pagina.items.length,
            tickets: pagina.items.map((t) => ({
                numero: t.number,
                asunto: t.subject,
                solicitante: t.requesterEmail,
                estado: t.status,
                prioridad: t.priority,
                // `areaLabel` ya trae el nombre visible que usa la UI.
                area: t.areaLabel ?? "Sin clasificar",
                asignado: (t.trabajadorId ? nombrePorId.get(t.trabajadorId) : null) ??
                    "sin asignar",
                creado: t.createdAt,
            })),
        },
    };
}
async function resumenTickets(input, user) {
    const soloMios = input.solo_mios === true;
    const resumen = await (0, tickets_service_1.getSummaryForUser)({
        user,
        view: soloMios ? "mine" : undefined,
    });
    return {
        // Mismo criterio que en `buscarTickets`: la pantalla se abre con el
        // alcance del numero que se acaba de dar. Si el resumen fue "tus
        // tickets", el boton va a la vista propia y no a la tabla completa.
        accion: resumen.total === 0
            ? undefined
            : soloMios
                ? (0, acciones_1.accionTickets)({ vista: "mine" }, resumen.total)
                : acciones_1.ACCION_TICKETS,
        datos: {
            alcance: soloMios
                ? "solo los tickets asignados al usuario"
                : "todos los tickets que el usuario puede ver",
            total: resumen.total,
            abiertos: resumen.abiertos,
            pendientes: resumen.pendientes,
            cerrados: resumen.cerrados,
            urgentes_sin_cerrar: resumen.urgentes,
            sla_primera_respuesta: {
                cumplimiento_pct: resumen.slaFirstResponse.percent,
                plazo_horas: resumen.slaFirstResponse.targetHours,
                vencidos: resumen.slaFirstResponse.breached,
                sin_responder: resumen.slaFirstResponse.pending,
            },
            sla_resolucion: {
                cumplimiento_pct: resumen.slaResolution.percent,
                plazo_horas: resumen.slaResolution.targetHours,
                vencidos: resumen.slaResolution.breached,
                sin_cerrar: resumen.slaResolution.pending,
            },
        },
    };
}
async function buscarTareas(input, user) {
    const limite = limiteSeguro(input.limite, 20, 50);
    /**
     * Mismo criterio que la intranet, que tiene DOS pantallas de tareas:
     *
     *   /tareas      -> cada quien ve las suyas
     *   /supervisor  -> supervisores y admin ven las de todos
     *
     * Se usa `isSupervisorOrAdminEmail`, la misma funcion que protege esa
     * segunda pantalla, y no `user.role`: son listas distintas y si el
     * asistente usara otra podria quedar mas amplio o mas estrecho que la UI.
     */
    const supervisa = (0, supervision_config_1.isSupervisorOrAdminEmail)(user.email);
    // `solo_mias` solo puede ACHICAR el alcance hasta el propio usuario, nunca
    // ampliarlo: por eso es un booleano y no un id. Sigue valiendo la regla de
    // que ninguna herramienta recibe de quien son los datos.
    const soloMias = input.solo_mias === true;
    const where = supervisa && !soloMias ? {} : { trabajadorId: user.id };
    // Se guarda el estado YA validado, no el que llego: es el que se uso para
    // consultar y por lo tanto el unico que puede ir en el enlace sin que el
    // boton muestre algo distinto de lo que dice la cifra.
    const estadoCrudo = textoOpcional(input.estado);
    const estado = estadoCrudo && estadoCrudo in client_1.EstadoTarea
        ? estadoCrudo
        : undefined;
    if (estado)
        where.estado = estado;
    const dias = Number(input.vence_en_dias);
    if (Number.isFinite(dias) && dias > 0) {
        const desde = new Date();
        desde.setHours(0, 0, 0, 0);
        const hasta = new Date(desde);
        hasta.setDate(hasta.getDate() + Math.floor(dias));
        where.fechaProgramada = { gte: desde, lte: hasta };
    }
    const rut = textoOpcional(input.rut_cliente);
    if (rut) {
        const candidatos = (0, rut_1.rutCandidates)(rut);
        if (candidatos.length > 0)
            where.rutCliente = { in: candidatos };
    }
    /**
     * Filtro por responsable.
     *
     * Solo se aplica si el usuario YA tiene alcance de empresa. El orden
     * importa: primero el servidor decide que puede ver esta persona, y recien
     * despues se acota dentro de eso. Asi este parametro solo puede ACHICAR el
     * resultado, nunca abrirlo. Para un agente se ignora por completo: su
     * `where` ya quedo fijado a sus propias tareas mas arriba y nada de lo que
     * diga la conversacion lo cambia.
     */
    let responsablesEncontrados = null;
    let agenteParaEnlace;
    const responsable = textoOpcional(input.responsable);
    if (responsable && supervisa && !soloMias) {
        const personas = await trabajadoresQueCoinciden(responsable);
        if (personas.length === 0) {
            // Mismo problema que en `buscarTickets`: "las tareas de X" no siempre
            // significa "a cargo de X". Aca no hay busqueda por texto libre, pero
            // si hay filtro por cliente, asi que el camino alternativo es resolver
            // el RUT primero. Se nombra para que el modelo lo intente en vez de
            // contestar "no encontre a nadie" y dejar la pregunta sin responder.
            return {
                datos: {
                    alcance: "todas las tareas de la empresa",
                    total_encontradas: 0,
                    recibidas_por_el_asistente: 0,
                    tareas: [],
                    nota: `"${responsable}" no es ningun trabajador, asi que no se filtro por responsable. Si puede ser un CLIENTE, busca su RUT con buscar_clientes y vuelve a llamar esta herramienta con rut_cliente. Si no, dile al usuario que no hay ninguna persona con ese nombre.`,
                },
            };
        }
        where.trabajadorId = { in: personas.map((p) => p.id_trabajador) };
        responsablesEncontrados = personas.map((p) => p.nombre);
        // La pantalla de supervision muestra un agente a la vez, asi que el
        // enlace solo puede apuntar a una persona. Con varias coincidencias se
        // deja sin agente: mejor la vista general que abrir la de alguien que
        // quizas no era.
        if (personas.length === 1) {
            agenteParaEnlace = String(personas[0].id_trabajador);
        }
    }
    const filas = await prisma_1.prisma.tareaAsignada.findMany({
        where,
        take: limite,
        orderBy: { fechaProgramada: "asc" },
        select: {
            id_tarea_asignada: true,
            estado: true,
            fechaProgramada: true,
            rutCliente: true,
            tareaPlantilla: { select: { nombre: true, area: true } },
            asignado: { select: { nombre: true } },
        },
    });
    const total = await prisma_1.prisma.tareaAsignada.count({ where });
    // Las razones sociales se resuelven en una consulta, no una por tarea.
    const ruts = Array.from(new Set(filas.map((f) => f.rutCliente).filter((r) => Boolean(r))));
    const clientes = ruts.length > 0
        ? await prisma_1.prisma.cliente.findMany({
            where: { rut: { in: ruts } },
            select: { rut: true, razonSocial: true },
        })
        : [];
    const razonPorRut = new Map(clientes.map((c) => [c.rut, c.razonSocial]));
    const alcanceEmpresa = supervisa && !soloMias;
    return {
        // La pantalla la elige el MISMO calculo que fijo el alcance de los datos,
        // no una suposicion aparte: si el numero es de toda la empresa el boton
        // va a supervision, y si es solo del usuario va a sus tareas.
        accion: total === 0
            ? undefined
            : (0, acciones_1.accionTareas)(alcanceEmpresa, user.role, {
                // `estado` ya quedo validado contra el enum de Prisma mas arriba;
                // es el mismo vocabulario que lee la pantalla.
                estado,
                agente: agenteParaEnlace,
            }),
        datos: {
            // El modelo redacta a partir de esto, asi que tiene que quedar explicito
            // si el numero es de toda la empresa o solo del usuario.
            alcance: alcanceEmpresa
                ? "todas las tareas de la empresa"
                : "solo las tareas asignadas a este usuario",
            // Si el nombre buscado coincidio con mas de una persona, el modelo tiene
            // que poder decirlo en vez de dar un numero mezclado como si fuera de una.
            ...(responsablesEncontrados
                ? { filtrado_por_responsable: responsablesEncontrados }
                : {}),
            total_encontradas: total,
            // Ver la nota en buscarTickets: esto NO es lo que el usuario alcanza a ver.
            recibidas_por_el_asistente: filas.length,
            tareas: filas.map((f) => ({
                numero: f.id_tarea_asignada,
                tarea: f.tareaPlantilla.nombre,
                estado: f.estado,
                fecha_programada: f.fechaProgramada.toISOString().slice(0, 10),
                responsable: f.asignado?.nombre ?? null,
                rut_cliente: f.rutCliente,
                cliente: f.rutCliente ? razonPorRut.get(f.rutCliente) ?? null : null,
            })),
        },
    };
}
async function buscarClientes(input, user) {
    // Segunda barrera: `herramientasPara` ya no se la ofrece a un agente, pero
    // el modelo podria pedirla igual arrastrando el nombre de un turno viejo.
    //
    // Sin boton, obviamente: `/clientes` esta detras de `SupervisorRoute` y
    // ofrecerlo seria mandarlo a rebotar contra el guard.
    if (user.role !== "ADMIN" && user.role !== "SUPERVISOR") {
        return {
            datos: {
                sin_permiso: true,
                nota: "Este usuario no tiene acceso al listado de clientes en la intranet.",
            },
        };
    }
    const texto = textoOpcional(input.texto);
    if (!texto) {
        return {
            datos: {
                total_encontrados: 0,
                clientes: [],
                nota: "Falta el texto a buscar.",
            },
        };
    }
    const limite = limiteSeguro(input.limite, 10, 25);
    const candidatos = (0, rut_1.rutCandidates)(texto);
    const where = {
        OR: [
            ...(candidatos.length > 0 ? [{ rut: { in: candidatos } }] : []),
            { rut: { contains: texto, mode: "insensitive" } },
            { razonSocial: { contains: texto, mode: "insensitive" } },
            { alias: { contains: texto, mode: "insensitive" } },
        ],
    };
    const [filas, total] = await Promise.all([
        prisma_1.prisma.cliente.findMany({
            where,
            take: limite,
            orderBy: { razonSocial: "asc" },
            // Solo lo necesario: nada de agenteId ni codigoCartera.
            select: { rut: true, razonSocial: true, alias: true, activo: true },
        }),
        // Se cuenta aparte: antes se devolvia `filas.length` como total, que con
        // el `take` puesto es el tamano de la pagina y no cuantos hay. El modelo
        // llegaba a decir "encontre 10 clientes" habiendo cien.
        prisma_1.prisma.cliente.count({ where }),
    ]);
    return {
        // El rol ya se verifico arriba, y es el mismo que exige `SupervisorRoute`
        // en el front, asi que la pantalla abre.
        accion: total > 0 ? acciones_1.ACCION_CLIENTES : undefined,
        datos: {
            total_encontrados: total,
            recibidos_por_el_asistente: filas.length,
            clientes: filas.map((c) => ({
                rut: c.rut,
                razon_social: c.razonSocial,
                alias: c.alias,
                activo: c.activo,
            })),
        },
    };
}
/**
 * Ejecuta la herramienta que pidio el modelo.
 *
 * `user` viene del JWT verificado por authGuard. El modelo no puede influir
 * en el: los nombres de parametro de `definiciones.ts` son QUE buscar, nunca
 * DE QUIEN.
 */
async function ejecutarHerramienta(params) {
    const { nombre, input, user } = params;
    switch (nombre) {
        case "buscar_tickets":
            return buscarTickets(input, user);
        case "resumen_tickets":
            return resumenTickets(input, user);
        case "buscar_tareas":
            return buscarTareas(input, user);
        case "buscar_clientes":
            return buscarClientes(input, user);
        default:
            return { datos: { error: `Herramienta desconocida: ${nombre}` } };
    }
}
//# sourceMappingURL=ejecutores.js.map