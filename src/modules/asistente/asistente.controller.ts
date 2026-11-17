// src/modules/asistente/asistente.controller.ts

import type { Request, Response } from "express";
import { mensajeDeErrorIA } from "../../lib/anthropic";
import {
  conversar,
  redactarRespuestaTicket,
  type EventoAsistente,
} from "./asistente.service";

/**
 * Una llamada a la IA en vuelo por usuario.
 *
 * Cada una gasta dinero de la cuenta de Anthropic, asi que un cliente con un
 * bug (o alguien apurado apretando Enter) no deberia poder abrir diez en
 * paralelo.
 *
 * **Lo comparten el chat y el redactor de respuestas**, porque el recurso que
 * protege es la cuenta y es una sola. El efecto visible es que no se puede
 * redactar mientras el chat esta respondiendo; el mensaje de error lo dice, y
 * son dos cosas que nadie hace a la vez a proposito.
 */
const enVuelo = new Set<number>();

/**
 * Tope de llamadas a la IA por persona y por dia.
 *
 * `enVuelo` evita el paralelo pero no el volumen: nada impide mil llamadas
 * seguidas de a una. Esto no esta pensado para la persona que trabaja (nadie
 * le hace cincuenta preguntas al dia a un asistente interno) sino para el
 * caso que si pasa: un bug del front repitiendo el mismo request en loop.
 *
 * **El contador es uno solo para el chat y el redactor**, no uno por cada
 * uno. Lo que hay que cuidar es el credito de la cuenta de Anthropic, que es
 * comun a los dos y se acaba una sola vez: dos contadores de 50 serian en
 * realidad un tope de 100 disfrazado.
 *
 * Se ajusta con ASISTENTE_MAX_DIARIO. Un valor invalido o ausente cae a 50,
 * nunca a "sin limite": si la variable esta mal escrita, el fusible tiene que
 * seguir puesto.
 */
const MAX_MENSAJES_DIARIOS = (() => {
  const crudo = Number(process.env.ASISTENTE_MAX_DIARIO);
  return Number.isFinite(crudo) && crudo > 0 ? Math.floor(crudo) : 50;
})();

/**
 * Contador en memoria, por usuario.
 *
 * **No se guarda en base de datos a proposito.** Esto es un fusible, no
 * contabilidad: que se reinicie con cada deploy de Railway es aceptable, y a
 * cambio no hay tabla nueva, ni escrituras por cada mensaje, ni un contador
 * que limpiar. El gasto de verdad se mira en la consola de Anthropic.
 *
 * El mapa crece como mucho un registro por trabajador y cada uno se
 * sobreescribe al cambiar el dia, asi que no necesita limpieza.
 */
const usoDiario = new Map<number, { dia: string; mensajes: number }>();

/**
 * El dia de hoy en Chile, como "2026-11-12".
 *
 * Con la hora del servidor no sirve: Railway corre en UTC, asi que el
 * contador se reiniciaria a las nueve de la noche y nadie entenderia por que.
 */
function diaDeHoy(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Santiago",
  });
}

/** Cuantas llamadas a la IA lleva hoy esta persona, sumando chat y redactor. */
function usoDeHoy(userId: number): number {
  const registro = usoDiario.get(userId);
  if (!registro || registro.dia !== diaDeHoy()) return 0;
  return registro.mensajes;
}

/** Suma uno al contador de hoy. */
function anotarUso(userId: number): void {
  const hoy = diaDeHoy();
  const registro = usoDiario.get(userId);

  if (!registro || registro.dia !== hoy) {
    usoDiario.set(userId, { dia: hoy, mensajes: 1 });
    return;
  }

  registro.mensajes += 1;
}

/**
 * POST /api/asistente/chat
 *
 * Responde por SSE. El front lo lee con `fetch` + ReadableStream, no con
 * EventSource: EventSource solo hace GET y no permite mandar el header
 * Authorization que exige authGuard.
 */
export const chat = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: "No autenticado" });
  }

  const { mensaje, historial } = req.body as {
    mensaje?: string;
    historial?: unknown;
  };

  if (!mensaje || !String(mensaje).trim()) {
    return res.status(400).json({ ok: false, error: "Mensaje vacio" });
  }

  const userId = req.user.id;
  if (enVuelo.has(userId)) {
    return res.status(429).json({
      ok: false,
      error: "Ya hay una consulta en curso. Espera a que termine.",
    });
  }

  if (usoDeHoy(userId) >= MAX_MENSAJES_DIARIOS) {
    // El front muestra este texto tal cual, asi que tiene que explicarse
    // solo: un "429" a secas se lee como que el asistente esta roto.
    return res.status(429).json({
      ok: false,
      error: `Llegaste al limite de ${MAX_MENSAJES_DIARIOS} consultas por dia. Se reinicia manana.`,
    });
  }

  // Se anota antes de empezar, no al terminar: una respuesta que se corta a
  // la mitad igual se genero y igual se cobro.
  anotarUso(userId);
  enVuelo.add(userId);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const controlador = new AbortController();
  // Si el usuario cierra la pestana o cancela, se corta el request a la API
  // en vez de seguir generando (y cobrando) contra una conexion muerta.
  res.on("close", () => controlador.abort());

  const emitir = (evento: EventoAsistente) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(evento)}\n\n`);
  };

  try {
    await conversar({
      user: req.user,
      mensaje: String(mensaje),
      historial,
      emitir,
      signal: controlador.signal,
    });
    emitir({ tipo: "fin" });
  } catch (err) {
    // El abort se revisa primero: cuando el usuario cierra la pestana, el SDK
    // lanza igual que cualquier otro fallo, pero ya no hay nadie leyendo.
    if (!controlador.signal.aborted) {
      const conocido = mensajeDeErrorIA(err);

      if (conocido) {
        // Se registra igual: quedarse sin credito tiene que verse en los logs
        // del servidor, no solo en la pantalla de quien pregunto.
        console.warn("[asistente] chat:", conocido);
        emitir({ tipo: "error", mensaje: conocido });
      } else {
        console.error("[asistente] chat error:", err);
        emitir({ tipo: "error", mensaje: "Error al consultar el asistente." });
      }
    }
  } finally {
    enVuelo.delete(userId);
    if (!res.writableEnded) res.end();
  }
};

/**
 * POST /api/asistente/redactar-respuesta
 * Body: { ticketId: number, borradorActual?: string, puntos?: string[] }
 *
 * Devuelve el borrador para el editor. No envia nada.
 *
 * Con `borradorActual` y `puntos` integra esos puntos en el texto que ya
 * existe, en vez de redactar de cero. Ambos son opcionales: sin ellos se
 * comporta exactamente como antes. El servicio los valida y recorta, asi que
 * aca no hace falta repetirlo.
 *
 * Lleva el mismo candado y la misma cuota que el chat, y por las mismas
 * razones: tambien llama a la IA y tambien gasta de la cuenta. Un boton que
 * se puede apretar sin limite al lado de un chat que no, deja el fusible a
 * medio poner.
 */
export const redactarRespuesta = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: "No autenticado" });
  }

  const body = (req.body ?? {}) as {
    ticketId?: unknown;
    borradorActual?: unknown;
    puntos?: unknown;
  };

  // Las validaciones van ANTES de tocar el contador: un request mal formado
  // no llega a la IA, no cuesta nada y no tiene por que gastar cuota.
  const ticketId = Number(body.ticketId);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ ok: false, error: "ticketId invalido" });
  }

  const userId = req.user.id;
  if (enVuelo.has(userId)) {
    return res.status(429).json({
      ok: false,
      error: "Ya hay una consulta en curso. Espera a que termine.",
    });
  }

  if (usoDeHoy(userId) >= MAX_MENSAJES_DIARIOS) {
    return res.status(429).json({
      ok: false,
      error: `Llegaste al limite de ${MAX_MENSAJES_DIARIOS} consultas por dia. Se reinicia manana.`,
    });
  }

  // Igual que en el chat: se anota antes de empezar, porque un borrador que
  // falla a mitad de camino igual se genero y igual se cobro.
  anotarUso(userId);
  enVuelo.add(userId);

  try {
    const borrador = await redactarRespuestaTicket({
      ticketId,
      user: req.user,
      borradorActual: body.borradorActual,
      puntos: body.puntos,
    });

    if (borrador === null) {
      return res
        .status(404)
        .json({ ok: false, error: "Ticket no encontrado o sin borrador" });
    }

    return res.json({ ok: true, data: { borrador } });
  } catch (err) {
    // Mismos casos que el chat: sin credito, saturado o mal configurado. Se
    // responde 503 ("ahora no se puede") y no 500, porque ninguno de los tres
    // es un bug del servidor ni se arregla reintentando.
    const conocido = mensajeDeErrorIA(err);
    if (conocido) {
      console.warn("[asistente] redactar:", conocido);
      return res.status(503).json({ ok: false, error: conocido });
    }

    console.error("[asistente] redactar error:", err);
    return res.status(500).json({ ok: false, error: "Error interno" });
  } finally {
    // En `finally` y no al final del `try`: los `return` de arriba salen por
    // aca igual, y si se soltara solo en el camino feliz un error dejaria al
    // usuario con el candado puesto hasta reiniciar el servidor.
    enVuelo.delete(userId);
  }
};
