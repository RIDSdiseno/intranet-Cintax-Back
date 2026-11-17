// src/modules/asistente/asistente.service.ts
//
// Capa de conversacion del asistente: arma el prompt, corre el loop de
// herramientas y emite eventos para que el controlador los mande por SSE.
//
// El historial lo manda el navegador (no se guarda en base de datos), asi
// que se sanea antes de usarlo: ver `sanearHistorial`.

import Anthropic from "@anthropic-ai/sdk";
import type { AuthJwtPayload } from "../../middlewares/auth.middleware";
import {
  getClienteAnthropic,
  IANoConfiguradaError,
  MODELO_IA,
  textoDeRespuesta,
} from "../../lib/anthropic";
import { prisma } from "../../lib/prisma";
import { areaToSlug } from "../tickets/routing/ticketRouting";
import {
  getTicketDetailForUser,
  getTicketMessagesForUser,
} from "../tickets/tickets.service";
import {
  mensajeIntegrarPuntos,
  mensajeRedactarDesdeCero,
  promptBorradorTicket,
  promptChat,
  type ContextoUsuario,
} from "./prompt";
import { ETIQUETAS_HERRAMIENTA, herramientasPara } from "./tools/definiciones";
import { ejecutarHerramienta } from "./tools/ejecutores";

/** Nombre visible de cada area, igual que en la UI. */
const NOMBRE_AREA: Record<string, string> = {
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

/**
 * El cliente y el modelo viven en `lib/anthropic` desde que los informes
 * semanales tambien usan IA. Se mantiene el nombre viejo del error para no
 * romper al controlador: es la misma clase, solo con otro nombre.
 */
export { IANoConfiguradaError as AsistenteNoConfiguradoError };

/** Contexto del usuario para el prompt, con el area leida de la base. */
async function contextoDe(user: AuthJwtPayload): Promise<ContextoUsuario> {
  const trabajador = await prisma.trabajador.findUnique({
    where: { id_trabajador: user.id },
    select: { areaInterna: true },
  });

  const slug = areaToSlug(trabajador?.areaInterna ?? null);

  return {
    nombre: user.nombre || user.email,
    email: user.email,
    rol: user.role,
    area: slug ? NOMBRE_AREA[slug] ?? slug : null,
  };
}

export type MensajeCliente = {
  rol: "user" | "assistant";
  texto: string;
};

/**
 * Normaliza el historial que manda el navegador.
 *
 * El cliente podria mandar cualquier cosa: un rol "system" para reescribir
 * las instrucciones, o bloques `tool_result` falsos que simulen datos que
 * nunca salieron de la base. Por eso aca solo sobreviven turnos de texto con
 * rol user o assistant, y el historial se recorta a los ultimos N.
 */
function sanearHistorial(entrada: unknown): Anthropic.MessageParam[] {
  if (!Array.isArray(entrada)) return [];

  const limpios: Anthropic.MessageParam[] = [];

  for (const item of entrada) {
    if (!item || typeof item !== "object") continue;
    const { rol, texto } = item as Partial<MensajeCliente>;
    if (rol !== "user" && rol !== "assistant") continue;
    if (typeof texto !== "string") continue;

    const recortado = texto.trim().slice(0, MAX_CARACTERES_MENSAJE);
    if (!recortado) continue;

    limpios.push({ role: rol, content: recortado });
  }

  const ultimos = limpios.slice(-MAX_MENSAJES_HISTORIAL);

  // La API exige que el primer mensaje sea del usuario.
  while (ultimos.length > 0 && ultimos[0].role !== "user") ultimos.shift();

  return ultimos;
}

export type EventoAsistente =
  | { tipo: "texto"; texto: string }
  | { tipo: "herramienta"; etiqueta: string }
  // Un boton para ir a la pantalla de lo que se acaba de consultar. La ruta
  // la arma el servidor en `tools/acciones.ts`; el modelo no la ve ni la
  // escribe. Es una sugerencia: navegar lo decide quien pulsa.
  | { tipo: "accion"; etiqueta: string; ruta: string }
  | { tipo: "fin" }
  | { tipo: "error"; mensaje: string };

/**
 * Corre una vuelta de conversacion y va emitiendo eventos.
 *
 * El loop de herramientas pasa por aca: mientras el modelo pida datos, se
 * ejecutan en el servidor con el usuario del JWT y se le devuelven; cuando
 * deja de pedir, lo que escribe se emite como texto.
 */
export async function conversar(params: {
  user: AuthJwtPayload;
  mensaje: string;
  historial: unknown;
  emitir: (evento: EventoAsistente) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { user, mensaje, historial, emitir } = params;

  const cliente = getClienteAnthropic();
  const ctx = await contextoDe(user);
  const system = promptChat(ctx);
  // El set de herramientas depende del rol: un agente no recibe las que
  // consultan datos que su pantalla no le muestra.
  const tools = herramientasPara(user.role);

  const messages: Anthropic.MessageParam[] = [
    ...sanearHistorial(historial),
    { role: "user", content: mensaje.trim().slice(0, MAX_CARACTERES_MENSAJE) },
  ];

  // Rutas ya ofrecidas en esta respuesta. El modelo suele pedir la misma
  // herramienta varias veces (una por filtro) y sin esto saldrian tres
  // botones identicos al pie del mismo mensaje.
  const rutasOfrecidas = new Set<string>();

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    if (params.signal?.aborted) return;

    const stream = cliente.messages.stream(
      {
        model: MODELO_IA,
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
      },
      { signal: params.signal }
    );

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

    const pedidos = respuesta.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    for (const pedido of pedidos) {
      emitir({
        tipo: "herramienta",
        etiqueta: ETIQUETAS_HERRAMIENTA[pedido.name] ?? "Consultando datos",
      });
    }

    // Los resultados de todas las herramientas van en UN solo mensaje de
    // usuario: repartirlos en varios le ensena al modelo a dejar de pedirlas
    // en paralelo.
    const resultados: Anthropic.ToolResultBlockParam[] = [];

    for (const pedido of pedidos) {
      try {
        const salida = await ejecutarHerramienta({
          nombre: pedido.name,
          input: (pedido.input ?? {}) as Record<string, unknown>,
          user,
        });

        // Al modelo va SOLO `datos`. La ruta se le manda al navegador por un
        // canal aparte: si viajara en el tool_result, el modelo la leeria y
        // terminaria escribiendo URLs sueltas en medio de la respuesta.
        if (
          salida.accion &&
          !rutasOfrecidas.has(salida.accion.ruta) &&
          rutasOfrecidas.size < MAX_ACCIONES
        ) {
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
      } catch (err) {
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
function sanearPuntos(entrada: unknown): string[] {
  if (!Array.isArray(entrada)) return [];

  return entrada
    .filter((p): p is string => typeof p === "string")
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
export async function redactarRespuestaTicket(params: {
  ticketId: number;
  user: AuthJwtPayload;
  borradorActual?: unknown;
  puntos?: unknown;
}): Promise<string | null> {
  const { ticketId, user } = params;

  const puntos = sanearPuntos(params.puntos);
  const borradorActual =
    typeof params.borradorActual === "string"
      ? params.borradorActual.trim().slice(0, MAX_CARACTERES_BORRADOR)
      : "";

  // Integrar solo tiene sentido si hay algo que integrar Y donde integrarlo.
  const integrando = puntos.length > 0 && borradorActual.length > 0;

  const detalle = await getTicketDetailForUser(ticketId, user);
  if (!detalle) return null;

  const hilo = (await getTicketMessagesForUser(ticketId, user)) ?? [];

  const lineas: string[] = [
    `Asunto: ${detalle.ticket.subject}`,
    `Cliente: ${detalle.ticket.requesterEmail}`,
    `Estado: ${detalle.ticket.status}`,
    "",
    "--- Consulta original ---",
    detalle.ticket.description || "(sin contenido)",
  ];

  for (const m of hilo) {
    if (m.type === "INTERNAL_NOTE") continue; // las notas no salen al cliente
    const quien = m.isInbound ? "CLIENTE" : "CINTAX";
    const cuerpo = (m.bodyText || m.bodyHtml || "").trim();
    if (!cuerpo) continue;
    lineas.push("", `--- ${quien} ---`, cuerpo.slice(0, 4000));
  }

  const cliente = getClienteAnthropic();
  const ctx = await contextoDe(user);
  const hiloTexto = lineas.join("\n");

  const respuesta = await cliente.messages.create({
    model: MODELO_IA,
    max_tokens: 2000,
    system: promptBorradorTicket(ctx, integrando),
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: integrando
          ? mensajeIntegrarPuntos(hiloTexto, borradorActual, puntos)
          : mensajeRedactarDesdeCero(hiloTexto),
      },
    ],
  });

  if (respuesta.stop_reason === "refusal") return null;

  return textoDeRespuesta(respuesta);
}
