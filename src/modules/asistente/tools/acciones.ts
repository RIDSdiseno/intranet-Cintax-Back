// src/modules/asistente/tools/acciones.ts
//
// Las rutas que el asistente puede ofrecer como boton debajo de su respuesta.
//
// ====================================================================
// POR QUE LAS RUTAS SE ARMAN ACA Y NO LAS ESCRIBE EL MODELO
// ====================================================================
// Si el modelo escribiera la URL, podria inventar pantallas que no existen
// ("/reportes/general") o apuntar a una que el usuario no puede abrir. Aca
// las rutas son constantes del servidor y lo unico variable es un id
// numerico, asi que el boton siempre lleva a una pantalla real.
//
// El modelo tampoco las ve: la accion viaja aparte del `tool_result`, por
// fuera de lo que se le devuelve. Ver `SalidaHerramienta` en ejecutores.ts.
// ====================================================================
//
// ====================================================================
// LA REGLA QUE NO SE PUEDE ROMPER: BOTON <= PANTALLA
// ====================================================================
// Una herramienta puede tener permiso para DARTE un dato sin que tu tengas
// permiso para abrir la pantalla donde ese dato vive. Pasa de verdad con las
// tareas: `buscar_tareas` decide el alcance con `isSupervisorOrAdminEmail`
// (lista de correos) y el front protege `/supervisor` con `SupervisorRoute`
// (rol del JWT). Son dos listas distintas, a proposito.
//
// Quien este en la lista de correos pero tenga rol AGENTE recibe los datos de
// toda la empresa en el chat y rebotaria en el guard al pulsar el boton. Por
// eso `accionTareas` exige las DOS condiciones. Un boton que lleva a una
// pantalla en blanco es peor que no tener boton.
// ====================================================================

/** Un boton bajo la respuesta: a donde lleva y como se llama. */
export type AccionSugerida = {
  etiqueta: string;
  ruta: string;
};

export const ACCION_TICKETS: AccionSugerida = {
  etiqueta: "Ver tickets",
  ruta: "/tickets",
};

/**
 * Filtros de la pantalla de tickets que se pueden poner en la URL.
 *
 * Los nombres son los de `FiltrosHudTickets` en el front, y los valores el
 * mismo vocabulario que ya usan las herramientas ("Abierto", "Media", el id
 * del agente o "none"). No hay traduccion entre los dos lados: si alguna vez
 * la hubiera, este es el punto donde se notaria.
 */
export type FiltrosTickets = {
  busqueda?: string;
  estado?: string;
  prioridad?: string;
  solicitante?: string;
  agente?: string;
  /** "mine" para la vista de tickets propios. */
  vista?: string;
};

/**
 * Boton a la pantalla de tickets con los mismos filtros que se consultaron.
 *
 * El front valida cada valor al leer la URL, asi que un filtro que no
 * reconozca cae a "Todos" en vez de romper la pantalla. Aca igual se omite lo
 * vacio, para no mandar `?busqueda=` colgando.
 *
 * `total` solo entra en la etiqueta: el numero sale de la consulta que ya se
 * hizo, no de una cuenta aparte.
 */
export function accionTickets(
  filtros: FiltrosTickets,
  total: number
): AccionSugerida {
  const params = new URLSearchParams();

  for (const [clave, valor] of Object.entries(filtros)) {
    const limpio = String(valor ?? "").trim();
    // "all" es el valor por defecto del selector de agente: ponerlo en la URL
    // seria escribir "sin filtrar" como si fuera un filtro.
    if (!limpio || limpio === "all") continue;
    params.set(clave, limpio);
  }

  const query = params.toString();

  return {
    etiqueta: query ? `Ver estos ${total} tickets` : "Ver tickets",
    ruta: query ? `/tickets?${query}` : "/tickets",
  };
}

export const ACCION_MIS_TAREAS: AccionSugerida = {
  etiqueta: "Ver mis tareas",
  ruta: "/tareas",
};

export const ACCION_SUPERVISION: AccionSugerida = {
  etiqueta: "Ver tareas del equipo",
  ruta: "/supervisor",
};

export const ACCION_CLIENTES: AccionSugerida = {
  etiqueta: "Ver clientes",
  ruta: "/clientes",
};

/**
 * Boton a un ticket puntual.
 *
 * `id` es la clave de la fila (lo que espera `/tickets/:id`) y `numero` es lo
 * que ve el usuario. No son lo mismo: mezclarlos abre el ticket equivocado.
 */
export function accionTicket(id: number, numero: number): AccionSugerida {
  return {
    etiqueta: `Abrir ticket #${numero}`,
    ruta: `/tickets/${id}`,
  };
}

/**
 * Pantalla de tareas que corresponde, o ninguna.
 *
 * `alcanceEmpresa` es el criterio con el que se trajeron los datos; `rol` es
 * lo que mira el guard del front. Ver la nota de arriba sobre por que se
 * exigen los dos.
 */
export function accionTareas(
  alcanceEmpresa: boolean,
  rol: string,
  filtros: FiltrosTareas = {}
): AccionSugerida {
  const abreSupervision = rol === "ADMIN" || rol === "SUPERVISOR";
  if (!alcanceEmpresa || !abreSupervision) return ACCION_MIS_TAREAS;

  const params = new URLSearchParams();
  if (filtros.estado) params.set("estado", filtros.estado);
  if (filtros.agente) {
    params.set("agente", filtros.agente);
    // La pantalla deduce el modo cuando hay agente, pero dejarlo explicito
    // hace que el enlace se entienda solo al leerlo.
    params.set("modo", "agente");
  }

  const query = params.toString();
  if (!query) return ACCION_SUPERVISION;

  return {
    etiqueta: filtros.agente
      ? ACCION_SUPERVISION.etiqueta
      : "Ver estas tareas",
    ruta: `${ACCION_SUPERVISION.ruta}?${query}`,
  };
}

/**
 * Lo que la pantalla de supervision sabe recibir por URL.
 *
 * Es menos de lo que filtra la herramienta, a proposito: `rut_cliente` y
 * `vence_en_dias` se consultan bien en el chat pero esa pantalla todavia no
 * los lee de la URL. Agregarlos es ampliar `TareasSupervisionPage`, no este
 * archivo.
 */
export type FiltrosTareas = {
  /** PENDIENTE | EN_PROCESO | VENCIDA | COMPLETADA */
  estado?: string;
  /** Id del trabajador, ya resuelto. */
  agente?: string;
};
