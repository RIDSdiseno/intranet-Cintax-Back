"use strict";
// src/modules/informes/prompt.ts
//
// El prompt del informe semanal. Igual que en el modulo del asistente, este
// archivo es texto y no logica: se puede ajustar el tono sin tocar nada mas.
//
// La diferencia con los prompts del asistente es la audiencia: esto lo lee la
// administracion para tomar decisiones. Por eso el enfasis no esta en ser
// amable sino en no afirmar nada que los numeros no respalden.
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptInforme = promptInforme;
exports.mensajeConDatos = mensajeConDatos;
const datos_1 = require("./datos");
/**
 * Formatea una fecha ISO como "lunes 10 de noviembre de 2026".
 *
 * El anio va incluido porque un periodo elegido a mano puede ir del 20 de
 * diciembre al 10 de enero, y sin el anio esas dos fechas parecen estar al
 * reves.
 */
function fechaLarga(iso) {
    return new Date(iso).toLocaleDateString("es-CL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}
/**
 * System prompt del informe.
 *
 * La regla de no inventar va primero porque es la que importa: un informe se
 * usa para decidir, y una cifra inventada con tono seguro hace mas dano que
 * no tener informe.
 *
 * `esSemana` cambia una sola cosa, pero importa: como se llama el periodo a
 * lo largo del texto. Desde que el usuario elige las fechas, un informe puede
 * cubrir dos meses, y si el prompt insiste en "la semana" el modelo escribe
 * "esta semana se completaron 340 tareas" sobre un periodo de sesenta dias.
 * Es falso, y suena igual de seguro que lo verdadero.
 */
function promptInforme(esSemana) {
    const periodo = esSemana ? "la semana" : "el periodo";
    const anterior = esSemana ? "la semana pasada" : "el periodo anterior";
    const anteriores = esSemana ? "semanas anteriores" : "periodos anteriores";
    return `Redactas el informe de tareas de Cintax, una empresa chilena de servicios contables y tributarios. Lo lee la administracion para saber como viene ${periodo} y donde hay que intervenir.

${esSemana
        ? "El informe cubre una semana, de lunes a domingo."
        : "El informe cubre el periodo exacto que se indica en los datos, que NO es una semana. Puede durar unos pocos dias o varios meses. Nunca lo llames 'la semana': di 'el periodo' o nombra las fechas."}

## Regla principal

Los numeros ya vienen calculados desde la base de datos. Tu trabajo es interpretarlos, NO recalcularlos ni completarlos.

- No inventes ninguna cifra. Si un dato no esta en lo que te paso, no existe para ti.
- No estimes porcentajes ni tendencias que no puedas sacar de los numeros entregados. No tienes ${anteriores}: no digas "mejoro respecto de ${anterior}" ni nada parecido.
- Si ${periodo} no tiene tareas, dilo en una linea y termina. No rellenes.
- No propongas sanciones ni evalues personas. Describe hechos: quien tiene cuantas tareas atrasadas es un hecho; "fulano esta rindiendo mal" es un juicio que no te corresponde.

## Estructura

Escribe exactamente estas cuatro secciones, con esos titulos y en ese orden:

RESUMEN
Dos o tres frases con lo esencial de ${periodo}: volumen de tareas, cuanto se cerro, como viene el atraso.

ESTADO POR AREA
Una linea por area, con sus numeros. Si un area concentra el problema, se dice aca.

INCIDENCIAS Y OBSERVACIONES
Lo que merece atencion: atrasos criticos, tareas sin responsable asignado, concentracion de carga en una persona. Si no hay nada que observar, escribe "Sin incidencias relevantes." y sigue.

CONCLUSIONES
Dos o tres puntos accionables, cada uno respaldado por un numero del informe. Si los datos no dan para concluir nada, dilo en vez de inventar recomendaciones genericas.

## Estilo

- Espanol de Chile, formal, impersonal. Es un documento, no un mensaje.
- Frases cortas. Sin adjetivos de relleno ("excelente", "preocupante", "critico" solo si el dato lo justifica).
- Sin emojis. Sin markdown: ni asteriscos, ni almohadillas, ni tablas. Los titulos van en mayusculas, tal como se indicaron arriba.
- Las listas van con "- " al inicio de la linea.
- Nombra las areas como aparecen en los datos. No uses los nombres internos del sistema (CONTA, TRIBUTARIO, RRHH).
- Maximo una pagina. Quien lo lee tiene poco tiempo.`;
}
/**
 * El mensaje con los datos del periodo.
 *
 * Se manda como JSON ademas de la cabecera en texto: el JSON es lo que el
 * modelo lee con precision, y la cabecera le da el contexto de fechas sin que
 * tenga que interpretar los ISO.
 *
 * La cabecera **no muestra la clave cuando no es de semana**. "2026-W46"
 * significa algo; "2611281205" es un identificador interno, y dejarselo al
 * modelo solo abre la puerta a que lo escriba en el informe como si fuera el
 * nombre del periodo.
 *
 * Por eso son dos preguntas distintas y no una. `esSemana` lo manda quien
 * genera, mirando las fechas: dice como llamar al periodo. `esSemanaIso` mira
 * la clave: dice si se puede mostrar. Un informe manual de lunes a domingo
 * responde `true` a la primera y `false` a la segunda —es una semana, pero su
 * clave es de fechas—, y ahi la cabecera dice "Semana" sin numerarla.
 */
function mensajeConDatos(datos, esSemana) {
    const dias = (0, datos_1.diasDeRango)(new Date(datos.desde), new Date(datos.hasta));
    const tramo = `del ${fechaLarga(datos.desde)} al ${fechaLarga(datos.hasta)}`;
    let encabezado;
    if (esSemana && (0, datos_1.esSemanaIso)(datos.semana)) {
        encabezado = `Semana ${datos.semana}: ${tramo} (${dias} dias).`;
    }
    else if (esSemana) {
        encabezado = `Semana completa: ${tramo} (${dias} dias).`;
    }
    else {
        encabezado = `Periodo de ${dias} dias: ${tramo}. No es una semana.`;
    }
    const cabecera = [
        encabezado,
        "",
        "Significado de los campos:",
        "- totales: tareas cuya fecha de vencimiento cae dentro del periodo, agrupadas por estado.",
        "- completadasEnLaSemana: tareas cerradas durante el periodo, sin importar cuando vencian. El nombre del campo dice 'semana' por razones historicas: son las del periodo del informe.",
        "- atrasadas: tareas que ya vencieron y siguen abiertas al momento de generar el informe, incluidas las anteriores al periodo.",
        "- atrasadas.criticas: las que llevan 15 dias o mas de atraso.",
        "- atrasadas.detalle: solo las primeras 40, ordenadas de mayor a menor atraso. Si atrasadas.total es mayor, el resto no viene en la lista.",
        "",
        "Datos:",
    ].join("\n");
    return `${cabecera}\n${JSON.stringify(datos, null, 2)}`;
}
//# sourceMappingURL=prompt.js.map