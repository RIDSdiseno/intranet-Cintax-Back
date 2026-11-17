"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCION_CLIENTES = exports.ACCION_SUPERVISION = exports.ACCION_MIS_TAREAS = exports.ACCION_TICKETS = void 0;
exports.accionTickets = accionTickets;
exports.accionTicket = accionTicket;
exports.accionTareas = accionTareas;
exports.ACCION_TICKETS = {
    etiqueta: "Ver tickets",
    ruta: "/tickets",
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
function accionTickets(filtros, total) {
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(filtros)) {
        const limpio = String(valor ?? "").trim();
        // "all" es el valor por defecto del selector de agente: ponerlo en la URL
        // seria escribir "sin filtrar" como si fuera un filtro.
        if (!limpio || limpio === "all")
            continue;
        params.set(clave, limpio);
    }
    const query = params.toString();
    return {
        etiqueta: query ? `Ver estos ${total} tickets` : "Ver tickets",
        ruta: query ? `/tickets?${query}` : "/tickets",
    };
}
exports.ACCION_MIS_TAREAS = {
    etiqueta: "Ver mis tareas",
    ruta: "/tareas",
};
exports.ACCION_SUPERVISION = {
    etiqueta: "Ver tareas del equipo",
    ruta: "/supervisor",
};
exports.ACCION_CLIENTES = {
    etiqueta: "Ver clientes",
    ruta: "/clientes",
};
/**
 * Boton a un ticket puntual.
 *
 * `id` es la clave de la fila (lo que espera `/tickets/:id`) y `numero` es lo
 * que ve el usuario. No son lo mismo: mezclarlos abre el ticket equivocado.
 */
function accionTicket(id, numero) {
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
function accionTareas(alcanceEmpresa, rol, filtros = {}) {
    const abreSupervision = rol === "ADMIN" || rol === "SUPERVISOR";
    if (!alcanceEmpresa || !abreSupervision)
        return exports.ACCION_MIS_TAREAS;
    const params = new URLSearchParams();
    if (filtros.estado)
        params.set("estado", filtros.estado);
    if (filtros.agente) {
        params.set("agente", filtros.agente);
        // La pantalla deduce el modo cuando hay agente, pero dejarlo explicito
        // hace que el enlace se entienda solo al leerlo.
        params.set("modo", "agente");
    }
    const query = params.toString();
    if (!query)
        return exports.ACCION_SUPERVISION;
    return {
        etiqueta: filtros.agente
            ? exports.ACCION_SUPERVISION.etiqueta
            : "Ver estas tareas",
        ruta: `${exports.ACCION_SUPERVISION.ruta}?${query}`,
    };
}
//# sourceMappingURL=acciones.js.map