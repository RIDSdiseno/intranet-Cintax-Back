"use strict";
// src/modules/asistente/asistente.service.ts
//
// Capa de conversacion del asistente: arma el prompt, corre el loop de
// herramientas y emite eventos para que el controlador los mande por SSE.
//
// El historial lo manda el navegador (no se guarda en base de datos), asi
// que se sanea antes de usarlo: ver `sanearHistorial`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsistenteNoConfiguradoError = void 0;
exports.conversar = conversar;
exports.redactarRespuestaTicket = redactarRespuestaTicket;
const anthropic_1 = require("../../lib/anthropic");
Object.defineProperty(exports, "AsistenteNoConfiguradoError", { enumerable: true, get: function () { return anthropic_1.IANoConfiguradaError; } });
const prisma_1 = require("../../lib/prisma");
const ticketRouting_1 = require("../tickets/routing/ticketRouting");
const tickets_service_1 = require("../tickets/tickets.service");
const prompt_1 = require("./prompt");
const definiciones_1 = require("./tools/definiciones");
const ejecutores_1 = require("./tools/ejecutores");
/** Nombre visible de cada area, igual que en la UI. */
const NOMBRE_AREA = {
    contabilidad: "Contabilidad",
    "comercial-y-marketing": "Comercial y Marketing",
    "recursos-humanos": "Recursos Humanos",
    admin: "Admin",
};
/** Tope de vueltas del loop de herramientas, por si el modelo se enreda. */
const MAX_VUELTAS = 6;
/**
 * Tope de botones por respuesta.
 *
 * Dos ya cubren el caso normal ("tus tareas y los tickets del equipo"); mas
 * que eso deja de ser un atajo y pasa a ser un menu al pie de cada mensaje.
 */
const MAX_ACCIONES = 2;
/** Cuantos mensajes del historial se aceptan del cliente. */
const MAX_MENSAJES_HISTORIAL = 20;
/** Tope de caracteres por mensaje del historial. */
const MAX_CARACTERES_MENSAJE = 8000;
/** Contexto del usuario para el prompt, con el area leida de la base. */
async function contextoDe(user) {
    const trabajador = await prisma_1.prisma.trabajador.findUnique({
        where: { id_trabajador: user.id },
        select: { areaInterna: true },
    });
    const slug = (0, ticketRouting_1.areaToSlug)(trabajador?.areaInterna ?? null);
    return {
        nombre: user.nombre || user.email,
        email: user.email,
        rol: user.role,
        area: slug ? NOMBRE_AREA[slug] ?? slug : null,
    };
}
/**
 * Normaliza el historial que manda el navegador.
 *
 * El cliente podria mandar cualquier cosa: un rol "system" para reescribir
 * las instrucciones, o bloques `tool_result` falsos que simulen datos que
 * nunca salieron de la base. Por eso aca solo sobreviven turnos de texto con
 * rol user o assistant, y el historial se recorta a los ultimos N.
 */
function sanearHistorial(entrada) {
    if (!Array.isArray(entrada))
        return [];
    const limpios = [];
    for (const item of entrada) {
        if (!item || typeof item !== "object")
            continue;
        const { rol, texto } = item;
        if (rol !== "user" && rol !== "assistant")
            continue;
        if (typeof texto !== "string")
            continue;
        const recortado = texto.trim().slice(0, MAX_CARACTERES_MENSAJE);
        if (!recortado)
            continue;
        limpios.push({ role: rol, content: recortado });
    }
    const ultimos = limpios.slice(-MAX_MENSAJES_HISTORIAL);
    // La API exige que el primer mensaje sea del usuario.
    while (ultimos.length > 0 && ultimos[0].role !== "user")
        ultimos.shift();
    return ultimos;
}
/**
 * Corre una vuelta de conversacion y va emitiendo eventos.
 *
 * El loop de herramientas pasa por aca: mientras el modelo pida datos, se
 * ejecutan en el servidor con el usuario del JWT y se le devuelven; cuando
 * deja de pedir, lo que escribe se emite como texto.
 */
async function conversar(params) {
    const { user, mensaje, historial, emitir } = params;
    const cliente = (0, anthropic_1.getClienteAnthropic)();
    const ctx = await contextoDe(user);
    const system = (0, prompt_1.promptChat)(ctx);
    // El set de herramientas depende del rol: un agente no recibe las que
    // consultan datos que su pantalla no le muestra.
    const tools = (0, definiciones_1.herramientasPara)(user.role);
    const messages = [
        ...sanearHistorial(historial),
        { role: "user", content: mensaje.trim().slice(0, MAX_CARACTERES_MENSAJE) },
    ];
    // Rutas ya ofrecidas en esta respuesta. El modelo suele pedir la misma
    // herramienta varias veces (una por filtro) y sin esto saldrian tres
    // botones identicos al pie del mismo mensaje.
    const rutasOfrecidas = new Set();
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
        if (params.signal?.aborted)
            return;
        const stream = cliente.messages.stream({
            model: anthropic_1.MODELO_IA,
            max_tokens: 8000,
            // El prompt y las herramientas son identicos en cada turno: cachearlos
            // los deja a ~10% de su costo a partir del segundo mensaje.
            system: [
                { type: "text", text: system, cache_control: { type: "ephemeral" } },
            ],
            // Una conversacion no necesita razonamiento profundo, y el effort
            // alto se nota en la espera.
            output_config: { effort: "low" },
            tools,
            // Sin `tool_choice`: forzarlo devuelve 400 en los modelos actuales.
            messages,
        }, { signal: params.signal });
        stream.on("text", (delta) => emitir({ tipo: "texto", texto: delta }));
        const respuesta = await stream.finalMessage();
        if (respuesta.stop_reason !== "tool_use") {
            // Puede terminar por `refusal` o por `max_tokens`; en ambos casos lo
            // que alcanzo a escribir ya se emitio.
            if (respuesta.stop_reason === "refusal") {
                emitir({
                    tipo: "error",
                    mensaje: "El asistente no puede responder esa consulta.",
                });
            }
            return;
        }
        const pedidos = respuesta.content.filter((b) => b.type === "tool_use");
        for (const pedido of pedidos) {
            emitir({
                tipo: "herramienta",
                etiqueta: definiciones_1.ETIQUETAS_HERRAMIENTA[pedido.name] ?? "Consultando datos",
            });
        }
        // Los resultados de todas las herramientas van en UN solo mensaje de
        // usuario: repartirlos en varios le ensena al modelo a dejar de pedirlas
        // en paralelo.
        const resultados = [];
        for (const pedido of pedidos) {
            try {
                const salida = await (0, ejecutores_1.ejecutarHerramienta)({
                    nombre: pedido.name,
                    input: (pedido.input ?? {}),
                    user,
                });
                // Al modelo va SOLO `datos`. La ruta se le manda al navegador por un
                // canal aparte: si viajara en el tool_result, el modelo la leeria y
                // terminaria escribiendo URLs sueltas en medio de la respuesta.
                if (salida.accion &&
                    !rutasOfrecidas.has(salida.accion.ruta) &&
                    rutasOfrecidas.size < MAX_ACCIONES) {
                    rutasOfrecidas.add(salida.accion.ruta);
                    emitir({
                        tipo: "accion",
                        etiqueta: salida.accion.etiqueta,
                        ruta: salida.accion.ruta,
                    });
                }
                resultados.push({
                    type: "tool_result",
                    tool_use_id: pedido.id,
                    content: JSON.stringify(salida.datos),
                });
            }
            catch (err) {
                console.error(`[asistente] Error en ${pedido.name}:`, err);
                resultados.push({
                    type: "tool_result",
                    tool_use_id: pedido.id,
                    is_error: true,
                    content: "No se pudo completar la consulta.",
                });
            }
        }
        messages.push({ role: "assistant", content: respuesta.content });
        messages.push({ role: "user", content: resultados });
    }
    emitir({
        tipo: "error",
        mensaje: "La consulta dio demasiadas vueltas. Intenta algo mas acotado.",
    });
}
/** Tope de puntos adicionales por llamada. */
const MAX_PUNTOS = 10;
/** Tope de caracteres por punto adicional. */
const MAX_CARACTERES_PUNTO = 1000;
/** Tope del borrador que manda el cliente para que se le integren puntos. */
const MAX_CARACTERES_BORRADOR = 8000;
/** Deja los puntos en algo acotado y sin entradas vacias. */
function sanearPuntos(entrada) {
    if (!Array.isArray(entrada))
        return [];
    return entrada
        .filter((p) => typeof p === "string")
        .map((p) => p.trim().slice(0, MAX_CARACTERES_PUNTO))
        .filter(Boolean)
        .slice(0, MAX_PUNTOS);
}
/**
 * Borrador de respuesta para un ticket.
 *
 * El acceso al ticket se valida con las mismas funciones del modulo de
 * tickets, asi que no sirve para leer un ticket de otra area. El texto se
 * devuelve para el editor: nunca se envia solo.
 *
 * Tiene dos modos, segun lo que llegue:
 *
 *  - Sin `puntos`: redacta desde cero a partir del hilo. Es el comportamiento
 *    de siempre, sin cambios.
 *  - Con `borradorActual` y `puntos`: integra esos puntos en el borrador que
 *    ya existe. El original no se pierde, porque el front lo conserva y esta
 *    funcion no guarda nada en ninguna parte.
 */
async function redactarRespuestaTicket(params) {
    const { ticketId, user } = params;
    const puntos = sanearPuntos(params.puntos);
    const borradorActual = typeof params.borradorActual === "string"
        ? params.borradorActual.trim().slice(0, MAX_CARACTERES_BORRADOR)
        : "";
    // Integrar solo tiene sentido si hay algo que integrar Y donde integrarlo.
    const integrando = puntos.length > 0 && borradorActual.length > 0;
    const detalle = await (0, tickets_service_1.getTicketDetailForUser)(ticketId, user);
    if (!detalle)
        return null;
    const hilo = (await (0, tickets_service_1.getTicketMessagesForUser)(ticketId, user)) ?? [];
    const lineas = [
        `Asunto: ${detalle.ticket.subject}`,
        `Cliente: ${detalle.ticket.requesterEmail}`,
        `Estado: ${detalle.ticket.status}`,
        "",
        "--- Consulta original ---",
        detalle.ticket.description || "(sin contenido)",
    ];
    for (const m of hilo) {
        if (m.type === "INTERNAL_NOTE")
            continue; // las notas no salen al cliente
        const quien = m.isInbound ? "CLIENTE" : "CINTAX";
        const cuerpo = (m.bodyText || m.bodyHtml || "").trim();
        if (!cuerpo)
            continue;
        lineas.push("", `--- ${quien} ---`, cuerpo.slice(0, 4000));
    }
    const cliente = (0, anthropic_1.getClienteAnthropic)();
    const ctx = await contextoDe(user);
    const hiloTexto = lineas.join("\n");
    const respuesta = await cliente.messages.create({
        model: anthropic_1.MODELO_IA,
        max_tokens: 2000,
        system: (0, prompt_1.promptBorradorTicket)(ctx, integrando),
        output_config: { effort: "low" },
        messages: [
            {
                role: "user",
                content: integrando
                    ? (0, prompt_1.mensajeIntegrarPuntos)(hiloTexto, borradorActual, puntos)
                    : (0, prompt_1.mensajeRedactarDesdeCero)(hiloTexto),
            },
        ],
    });
    if (respuesta.stop_reason === "refusal")
        return null;
    return (0, anthropic_1.textoDeRespuesta)(respuesta);
}
//# sourceMappingURL=asistente.service.js.map