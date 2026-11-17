// src/modules/asistente/tools/definiciones.ts
//
// Lo que el modelo puede PEDIR. La ejecucion real vive en ejecutores.ts.
//
// ====================================================================
// REGLA DE SEGURIDAD DE ESTE ARCHIVO
// ====================================================================
// Ninguna herramienta recibe `area`, `userId`, `trabajadorId` ni nada que
// identifique de quien son los datos. Si los recibiera, bastaria con que
// alguien escribiera "muestrame los tickets de RRHH" para que el modelo
// rellenara ese campo y se saltara el filtro por area.
//
// El alcance se inyecta en el servidor, desde el JWT, DESPUES de que el
// modelo pidio la herramienta. Al agregar una herramienta nueva, mantener
// esto: los parametros son QUE buscar, nunca DE QUIEN.
// ====================================================================
//
// Sobre `strict: true`: no se usa. Exige que todas las propiedades esten en
// `required`, lo que obliga a declarar los filtros opcionales como tipos
// nullable, y eso no entra en el tipo `input_schema` del SDK sin un cast que
// apaga al compilador justo donde hay dudas. Como `ejecutores.ts` ya sanea
// cada parametro (rangos, enums, strings vacios), la validacion estricta no
// aportaba garantias nuevas: solo riesgo de un 400 en cada llamada.

import type Anthropic from "@anthropic-ai/sdk";

/** Estados de ticket tal como los entiende el backend de tickets. */
const ESTADOS_TICKET = ["Abierto", "Pendiente", "Resuelto", "Cerrado"];

/** Prioridades de ticket. */
const PRIORIDADES_TICKET = ["Baja", "Media", "Alta", "Urgente"];

/** Estados de TareaAsignada (enum EstadoTarea de Prisma). */
const ESTADOS_TAREA = ["PENDIENTE", "EN_PROCESO", "VENCIDA", "COMPLETADA"];

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "buscar_tickets",
    description:
      "Busca tickets de soporte visibles para el usuario actual. Devuelve numero, asunto, solicitante, agente asignado, estado, prioridad, area y fecha. Usala para responder cuantos tickets hay, cuales estan abiertos, que hay pendiente, cuantos tiene un agente, o para encontrar un ticket por asunto o correo del solicitante. IMPORTANTE: para contar por agente, estado o prioridad, vuelve a llamar la herramienta con ese filtro en vez de contar a mano sobre los resultados que ya tienes; `total_encontrados` es el total real y lo que recibiste es solo una pagina. Todos los filtros son opcionales: omitelos para traer todo.",
    input_schema: {
      type: "object",
      properties: {
        estado: {
          type: "string",
          enum: ESTADOS_TICKET,
          description:
            "Filtra por estado. Omitir trae todos. Pendiente incluye 'pendiente de cliente' y 'pendiente de tercero'.",
        },
        prioridad: {
          type: "string",
          enum: PRIORIDADES_TICKET,
          description: "Filtra por prioridad. Omitir trae todas.",
        },
        texto: {
          type: "string",
          description:
            "Busca en asunto, descripcion y correo del solicitante. Tambien acepta un numero de ticket. Es el filtro POR DEFECTO para cualquier 'tickets de X' cuando X no es claramente un companero de trabajo: 'los tickets de test', 'los de facturacion', 'los de Ignacio' si Ignacio es un cliente.",
        },
        responsable: {
          type: "string",
          description:
            "Nombre o correo del AGENTE DE CINTAX que tiene el ticket asignado, completo o parcial. Tambien acepta 'sin asignar'. Solo para 'cuantos tickets tiene Jaime', 'que hay sin asignar'. OJO: 'de X' no significa 'asignado a X'; si X podria ser una palabra del asunto o el cliente que escribio, usa `texto`. Si no coincide con ningun trabajador la respuesta te lo dice y hay que reintentar con `texto` en la misma vuelta, sin preguntarle al usuario. Si coincide con varias personas trae `coincidencias`: ahi si pregunta a cual se refiere, no elijas tu.",
        },
        solicitante: {
          type: "string",
          description:
            "Correo del cliente que abrio el ticket, completo o parcial.",
        },
        limite: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximo de tickets a devolver. Por defecto 20.",
        },
      },
      required: [],
    },
  },
  {
    name: "resumen_tickets",
    description:
      "Entrega el panorama de los tickets visibles para el usuario: total, abiertos, pendientes, cerrados, urgentes, y el cumplimiento de SLA de primera respuesta y de resolucion. Usala para preguntas de panorama ('como vamos', 'cuantos hay en total', 'como esta el SLA') en vez de contar tickets uno por uno.",
    input_schema: {
      type: "object",
      properties: {
        solo_mios: {
          type: "boolean",
          description:
            "true limita el resumen a los tickets asignados al usuario. Omitir abarca todo lo que puede ver.",
        },
      },
      required: [],
    },
  },
  {
    name: "buscar_tareas",
    description:
      "Busca tareas (obligaciones contables y tributarias de clientes: F29, renta, remuneraciones, etc.). Devuelve nombre de la tarea, responsable, cliente, estado y fecha programada. Usala para 'que tengo pendiente', 'cuantas tareas atrasadas hay', 'que vence esta semana', 'que tareas hay del cliente X', 'cuantas tiene fulano'. IMPORTANTE: para contar por persona, cliente o estado, vuelve a llamar la herramienta con ese filtro en vez de contar a mano sobre los resultados que ya tienes; `total_encontradas` es el total real y lo que recibiste es solo una pagina. El servidor decide el alcance segun quien pregunta: un agente recibe solo las suyas, un supervisor o admin recibe las de toda la empresa. El campo `alcance` de la respuesta dice cual de los dos fue, y la respuesta al usuario tiene que reflejarlo. Todos los filtros son opcionales.",
    input_schema: {
      type: "object",
      properties: {
        estado: {
          type: "string",
          enum: ESTADOS_TAREA,
          description: "Filtra por estado de la tarea. Omitir trae todos.",
        },
        vence_en_dias: {
          type: "integer",
          minimum: 1,
          description:
            "Solo tareas cuya fecha programada cae dentro de los proximos N dias. Usa 7 para 'esta semana'.",
        },
        rut_cliente: {
          type: "string",
          description: "RUT del cliente, en cualquier formato.",
        },
        solo_mias: {
          type: "boolean",
          description:
            "true para traer unicamente las tareas del usuario que pregunta. Usalo cuando diga 'mis tareas', 'que tengo yo pendiente' o similar. Omitelo para cualquier pregunta general. Para un agente no cambia nada: siempre ve solo las suyas.",
        },
        responsable: {
          type: "string",
          description:
            "Nombre o correo del TRABAJADOR a cargo, completo o parcial. Usalo para 'cuantas tiene Diego', 'las tareas de bgarrido'. OJO: 'las tareas de X' puede referirse a un cliente y no a un companero; si X suena a empresa, usa `rut_cliente` (o busca el RUT con buscar_clientes primero). Solo tiene efecto para quien ya ve las tareas de toda la empresa; a un agente se le ignora y sigue viendo solo las suyas. Si el nombre coincide con varias personas, la respuesta trae `filtrado_por_responsable` con los nombres: dilo en vez de dar el numero como si fuera de una sola.",
        },
        limite: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximo de tareas a devolver. Por defecto 20.",
        },
      },
      required: [],
    },
  },
  {
    name: "buscar_clientes",
    description:
      "Busca clientes de Cintax por RUT, razon social o alias. Devuelve RUT, razon social y si esta activo. Usala cuando necesites el RUT de un cliente para otra busqueda, o para confirmar como se llama formalmente.",
    input_schema: {
      type: "object",
      properties: {
        texto: {
          type: "string",
          description:
            "RUT (en cualquier formato), razon social o alias, completo o parcial.",
        },
        limite: {
          type: "integer",
          minimum: 1,
          maximum: 25,
          description: "Maximo de clientes a devolver. Por defecto 10.",
        },
      },
      required: ["texto"],
    },
  },
];

/**
 * Herramientas disponibles segun el rol.
 *
 * `buscar_clientes` queda fuera para los agentes: la pantalla de Clientes
 * esta detras de `SupervisorRoute` en el front, asi que un agente no ve el
 * listado de clientes en la intranet y el asistente tampoco debe mostrarselo.
 *
 * El endpoint `/api/clientes` del backend hoy solo exige `requireAuth`, o
 * sea que la restriccion existe unicamente en el front. Igual se respeta
 * aca: el asistente promete mostrar solo lo que el usuario ve en pantalla, y
 * esa promesa se mide contra lo que la UI permite, no contra el guard mas
 * debil que haya quedado en una ruta.
 *
 * No ofrecerle la herramienta es mejor que dejarlo pedirla y negarsela: el
 * modelo no intenta lo que no existe. El chequeo en `ejecutores.ts` queda
 * igual como segunda barrera.
 */
export function herramientasPara(rol: string): Anthropic.Tool[] {
  if (rol === "ADMIN" || rol === "SUPERVISOR") return HERRAMIENTAS;
  return HERRAMIENTAS.filter((h) => h.name !== "buscar_clientes");
}

/** Etiqueta que la UI muestra mientras corre cada herramienta. */
export const ETIQUETAS_HERRAMIENTA: Record<string, string> = {
  buscar_tickets: "Buscando tickets",
  resumen_tickets: "Revisando el panorama de tickets",
  buscar_tareas: "Buscando tareas",
  buscar_clientes: "Buscando clientes",
};
