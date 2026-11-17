// src/modules/informes/informes.service.ts
//
// Genera, guarda y lee los informes semanales.
//
// Reparto de responsabilidades dentro del modulo:
//   datos.ts    -> cuenta las tareas (la verdad numerica)
//   prompt.ts   -> el texto de las instrucciones
//   este        -> orquesta: junta datos, pide el resumen, guarda la fila
//
// Lo unico que escribe en base de datos es la tabla InformeSemanal. Las tareas
// solo se leen.

import type { Prisma } from "@prisma/client";
import { getClienteAnthropic, MODELO_IA, textoDeRespuesta } from "../../lib/anthropic";
import { prisma } from "../../lib/prisma";
import {
  esSemanaExacta,
  recolectarDatos,
  rangoDeClave,
  rangoDeFecha,
  rangoDeFechas,
  type DatosInforme,
  type RangoInforme,
} from "./datos";
import { mensajeConDatos, promptInforme } from "./prompt";

export class SemanaInvalidaError extends Error {
  constructor(clave: string) {
    super(`Semana invalida: ${clave}`);
    this.name = "SemanaInvalidaError";
  }
}

/**
 * Un rango de fechas que no se puede usar.
 *
 * Lleva el motivo en el mensaje porque hay varias formas de equivocarse
 * (fechas al reves, periodo demasiado largo, formato raro) y cada una se
 * arregla distinto. El controlador lo manda tal cual al usuario.
 */
export class RangoInvalidoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "RangoInvalidoError";
  }
}

export class InformeEnCursoError extends Error {
  constructor(semana: string) {
    super(`Ya se esta generando el informe de ${semana}`);
    this.name = "InformeEnCursoError";
  }
}

/**
 * Periodos que se estan generando ahora mismo, por su clave.
 *
 * Generar cuesta dinero y toma varios segundos. Sin esto, dos clics seguidos
 * en "Generar" lanzan dos llamadas a la IA para el mismo periodo y la segunda
 * pisa a la primera.
 */
const enCurso = new Set<string>();

export type InformeResumen = {
  semana: string;
  desde: string;
  hasta: string;
  generadoAuto: boolean;
  generadoEn: string;
  generadoPor: string | null;
};

export type Informe = InformeResumen & {
  resumen: string;
  datos: DatosInforme;
  modelo: string | null;
};

/** Resuelve los nombres de quienes generaron informes, en una sola consulta. */
async function nombresDe(ids: number[]): Promise<Map<number, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();

  const trabajadores = await prisma.trabajador.findMany({
    where: { id_trabajador: { in: unicos } },
    select: { id_trabajador: true, nombre: true },
  });

  return new Map(trabajadores.map((t) => [t.id_trabajador, t.nombre]));
}

/** Los informes ya generados, del periodo mas reciente al mas antiguo. */
export async function listarInformes(): Promise<InformeResumen[]> {
  const filas = await prisma.informeSemanal.findMany({
    // Por `desde` y no por la clave: desde que hay periodos libres conviven
    // dos formatos ("2026-W46" y "2611281205") y ordenarlos como texto no da
    // un orden cronologico. `desde` es una fecha de verdad.
    //
    // El desempate por `createdAt` no es decorativo: el automatico y el manual
    // de un mismo periodo tienen identico `desde`, y con un solo criterio
    // Postgres no garantiza ningun orden entre ellos. La lista cambiaria de
    // orden sola entre una carga y otra.
    orderBy: [{ desde: "desc" }, { createdAt: "desc" }],
    select: {
      semana: true,
      desde: true,
      hasta: true,
      generadoAuto: true,
      generadoPor: true,
      createdAt: true,
    },
  });

  const nombres = await nombresDe(
    filas.map((f) => f.generadoPor).filter((id): id is number => id !== null)
  );

  return filas.map((f) => ({
    semana: f.semana,
    desde: f.desde.toISOString(),
    hasta: f.hasta.toISOString(),
    generadoAuto: f.generadoAuto,
    generadoEn: f.createdAt.toISOString(),
    generadoPor:
      f.generadoPor === null
        ? null
        : nombres.get(f.generadoPor) ?? `Trabajador ${f.generadoPor}`,
  }));
}

/** Un informe completo, o null si ese periodo todavia no se genero. */
export async function obtenerInforme(clave: string): Promise<Informe | null> {
  const fila = await prisma.informeSemanal.findUnique({
    where: { semana: clave.trim() },
  });

  if (!fila) return null;

  const nombres =
    fila.generadoPor === null ? new Map() : await nombresDe([fila.generadoPor]);

  return {
    semana: fila.semana,
    desde: fila.desde.toISOString(),
    hasta: fila.hasta.toISOString(),
    generadoAuto: fila.generadoAuto,
    generadoEn: fila.createdAt.toISOString(),
    generadoPor:
      fila.generadoPor === null
        ? null
        : nombres.get(fila.generadoPor) ?? `Trabajador ${fila.generadoPor}`,
    resumen: fila.resumen,
    datos: fila.datos as unknown as DatosInforme,
    modelo: fila.modelo,
  };
}

/**
 * Genera el informe de un periodo y lo guarda.
 *
 * Si ese periodo ya tenia informe **del mismo origen**, lo reemplaza. Eso es
 * deliberado, porque regenerar sirve justamente para cuando el primero salio
 * con datos incompletos.
 *
 * Del mismo origen, y no a secas: el automatico y el manual de un mismo
 * periodo son dos filas que conviven, porque `claveDeRango` les da claves de
 * formato distinto. Ahi esta explicado por que.
 *
 * Hay tres formas de decirle que periodo, y se resuelven en este orden:
 *
 *   1. `desde` + `hasta` ("2026-11-28")  -> periodo libre, el del calendario
 *   2. `semana` ("2026-W46")             -> semana ISO; es lo que mandaban
 *                                           las versiones anteriores
 *   3. nada                              -> la semana en curso; por aca entra
 *                                           el cron
 *
 * Las dos ultimas se mantienen tal cual a proposito: el cron automatico no
 * cambio, y una peticion vieja tiene que seguir funcionando igual. Las dos
 * dan clave de semana sin mirar el origen, asi que una peticion manual que
 * todavia mande `semana` comparte fila con el cron, como antes. El front ya
 * no manda esa forma: usa `desde`/`hasta`.
 */
export async function generarInforme(params: {
  semana?: string | null;
  desde?: unknown;
  hasta?: unknown;
  /** Id del trabajador que lo pidio. null cuando lo genero el cron. */
  generadoPor?: number | null;
  generadoAuto?: boolean;
  ahora?: Date;
}): Promise<Informe> {
  const ahora = params.ahora ?? new Date();
  const automatico = params.generadoAuto ?? false;

  let rango: RangoInforme;
  if (params.desde || params.hasta) {
    // Si viene una sola de las dos, `rangoDeFechas` lo rechaza con su motivo:
    // adivinar la que falta seria generar un informe de un periodo que nadie
    // pidio.
    const resuelto = rangoDeFechas(params.desde, params.hasta, automatico);
    if (!resuelto.ok) throw new RangoInvalidoError(resuelto.motivo);
    rango = resuelto.rango;
  } else if (params.semana) {
    const resuelto = rangoDeClave(params.semana);
    if (!resuelto) throw new SemanaInvalidaError(params.semana);
    rango = resuelto;
  } else {
    rango = rangoDeFecha(ahora);
  }

  if (enCurso.has(rango.semana)) {
    throw new InformeEnCursoError(rango.semana);
  }
  enCurso.add(rango.semana);

  try {
    const datos = await recolectarDatos(rango, ahora);

    // Se pregunta por las fechas y no por la forma de la clave: un informe
    // manual de lunes a domingo es una semana aunque su clave sea de fechas
    // (ver `claveDeRango`), y hay que redactarlo como tal.
    const esSemana = esSemanaExacta(rango.desde, rango.hasta);

    const cliente = getClienteAnthropic();
    const respuesta = await cliente.messages.create({
      model: MODELO_IA,
      max_tokens: 3000,
      // El prompt cambia segun el tipo de periodo: ver `promptInforme`.
      system: promptInforme(esSemana),
      // Interpretar numeros ya calculados no necesita razonamiento profundo,
      // y el informe se genera mientras alguien espera mirando la pantalla.
      output_config: { effort: "low" },
      messages: [{ role: "user", content: mensajeConDatos(datos, esSemana) }],
    });

    const resumen =
      respuesta.stop_reason === "refusal" ? "" : textoDeRespuesta(respuesta);

    if (!resumen) {
      throw new Error("La IA no devolvio contenido para el informe");
    }

    await prisma.informeSemanal.upsert({
      where: { semana: rango.semana },
      create: {
        semana: rango.semana,
        desde: rango.desde,
        hasta: rango.hasta,
        resumen,
        datos: datos as unknown as Prisma.InputJsonValue,
        generadoPor: params.generadoPor ?? null,
        generadoAuto: params.generadoAuto ?? false,
        modelo: MODELO_IA,
      },
      update: {
        desde: rango.desde,
        hasta: rango.hasta,
        resumen,
        datos: datos as unknown as Prisma.InputJsonValue,
        generadoPor: params.generadoPor ?? null,
        generadoAuto: params.generadoAuto ?? false,
        modelo: MODELO_IA,
      },
    });

    // Se relee en vez de armar la respuesta a mano: asi el informe recien
    // generado y uno consultado despues salen por el mismo camino y no pueden
    // diferir en un campo.
    const informe = await obtenerInforme(rango.semana);
    if (!informe) {
      throw new Error("El informe se guardo pero no se pudo releer");
    }

    return informe;
  } finally {
    enCurso.delete(rango.semana);
  }
}
