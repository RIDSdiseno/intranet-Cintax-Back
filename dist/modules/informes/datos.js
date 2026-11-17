"use strict";
// src/modules/informes/datos.ts
//
// Recoleccion de los datos del informe semanal.
//
// Este archivo esta separado del que habla con la IA a proposito: aca se
// CUENTAN las tareas, alla se REDACTA. Los numeros del informe salen siempre
// de estas consultas, nunca del modelo. Si manana alguien discute una cifra,
// se revisa este archivo y se reproduce la consulta.
//
// Solo lee: findMany y nada mas.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DIAS_RANGO = void 0;
exports.claveSemana = claveSemana;
exports.rangoDeFecha = rangoDeFecha;
exports.rangoDeClave = rangoDeClave;
exports.diasDeRango = diasDeRango;
exports.esSemanaIso = esSemanaIso;
exports.esSemanaExacta = esSemanaExacta;
exports.claveDeRango = claveDeRango;
exports.rangoDeFechas = rangoDeFechas;
exports.recolectarDatos = recolectarDatos;
const date_fns_1 = require("date-fns");
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
/** Cuantas tareas atrasadas se listan una por una en el informe. */
const MAX_ATRASADAS_DETALLE = 40;
/** Desde cuantos dias de atraso una tarea se considera critica. */
const DIAS_ATRASO_CRITICO = 15;
/** Nombres de area tal como se ven en la intranet. */
const ETIQUETA_AREA = {
    CONTA: "Contabilidad",
    TRIBUTARIO: "Comercial y Marketing",
    RRHH: "Recursos Humanos",
    ADMIN: "Admin",
};
/**
 * Tope de dias que puede cubrir un informe.
 *
 * No es un capricho de interfaz: la consulta de tareas del periodo no tiene
 * limite de filas, y todas terminan resumidas dentro del prompt. Un rango de
 * dos anios traeria miles de tareas, costaria caro y podria pasarse del
 * contexto del modelo. Tres meses cubre de sobra los informes que se piden.
 *
 * **Si cambias este numero, cambia tambien `MAX_DIAS_INFORME`** en
 * `front/src/modules/informes/pages/InformesPage.tsx`: el calendario lo usa
 * para no dejar marcar un rango imposible. Si quedan distintos no se rompe
 * nada —la regla de verdad se aplica aca—, pero el usuario podria marcar un
 * periodo que el servidor despues rechaza.
 */
exports.MAX_DIAS_RANGO = 92;
/** Clave ISO de la semana a la que pertenece una fecha. */
function claveSemana(fecha) {
    const anio = (0, date_fns_1.getISOWeekYear)(fecha);
    const numero = String((0, date_fns_1.getISOWeek)(fecha)).padStart(2, "0");
    return `${anio}-W${numero}`;
}
/** Rango lunes 00:00 -> domingo 23:59:59 de la semana de esa fecha. */
function rangoDeFecha(fecha) {
    return {
        semana: claveSemana(fecha),
        desde: (0, date_fns_1.startOfISOWeek)(fecha),
        hasta: (0, date_fns_1.endOfISOWeek)(fecha),
    };
}
/**
 * Traduce "2026-W46" al rango de fechas correspondiente.
 *
 * Devuelve null si el texto no tiene esa forma o si la semana no existe en ese
 * anio (un anio ISO tiene 52 o 53 semanas, nunca mas).
 */
function rangoDeClave(clave) {
    const match = /^(\d{4})-W(\d{2})$/.exec(clave.trim());
    if (!match)
        return null;
    const anio = Number(match[1]);
    const numero = Number(match[2]);
    if (numero < 1 || numero > 53)
        return null;
    // El 4 de enero siempre cae en la semana ISO 1, sea cual sea el dia.
    const semanaUno = (0, date_fns_1.startOfISOWeek)(new Date(anio, 0, 4));
    const inicio = new Date(semanaUno);
    inicio.setDate(semanaUno.getDate() + (numero - 1) * 7);
    const rango = rangoDeFecha(inicio);
    // Si el anio tenia 52 semanas, pedir la 53 cae en el anio siguiente.
    if (rango.semana !== clave.trim())
        return null;
    return rango;
}
/** Cuantos dias cubre el rango, contando los dos extremos. */
function diasDeRango(desde, hasta) {
    // Se compara en UTC a proposito: Chile cambia de hora dos veces al anio y
    // ahi un dia dura 23 o 25 horas. Restando milisegundos locales, un rango
    // que cruce ese fin de semana daria un dia de mas o de menos.
    const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
    const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
    return Math.round((b - a) / 86_400_000) + 1;
}
/**
 * Si la clave tiene forma de semana ISO ("2026-W46") y no de periodo libre.
 *
 * **Esto responde "que forma tiene la clave", no "el periodo es una semana".**
 * Desde que la clave depende del origen (ver `claveDeRango`), un informe
 * manual de una semana exacta se guarda con clave de fechas y aqui da `false`
 * aunque cubra de lunes a domingo.
 *
 * Sirve para lo unico que depende de la forma de la clave: decidir si en
 * pantalla se muestra "Semana 2026-W46" o el rango en español. Para preguntar
 * si el periodo es una semana, esta `esSemanaExacta`, que mira las fechas.
 */
function esSemanaIso(clave) {
    return /^\d{4}-W\d{2}$/.test(clave);
}
/**
 * Si el periodo calza exacto con una semana ISO, de lunes 00:00 a domingo
 * 23:59:59.999.
 *
 * Mira las fechas, no la clave. Es la pregunta que importa para redactar: un
 * informe de lunes a domingo se cuenta como "la semana" aunque su clave sea
 * de fechas por haberlo pedido una persona.
 *
 * **Tiene una gemela en el front**, `esSemanaExacta` en
 * `front/src/modules/informes/utils/semanas.ts`, que decide lo mismo para el
 * PDF y el resumen en pantalla. Si cambias la regla aca, cambiala alla: si
 * quedan distintas, el texto que redacta la IA hablara de "la semana" bajo un
 * encabezado que dice "el periodo", o al reves.
 */
function esSemanaExacta(desde, hasta) {
    const semana = rangoDeFecha(desde);
    return (semana.desde.getTime() === desde.getTime() &&
        semana.hasta.getTime() === hasta.getTime());
}
/**
 * La clave con la que se guarda e identifica un informe.
 *
 * Hay DOS formatos, y no por gusto: la columna `semana` de la tabla es
 * `VarChar(10)` y es la clave unica. En diez caracteres no caben dos fechas
 * con separadores, y ampliar la columna seria modificar la base.
 *
 *   Informe automatico de una semana exacta  ->  "2026-W46"
 *   Todo lo demas                            ->  "2611281205"
 *
 * El segundo son las dos fechas pegadas: AAMMDD del inicio + MMDD del
 * termino. Diez justos, sin lugar para separadores. El anio del termino no se
 * guarda porque se deduce: si su mes-dia es menor que el del inicio, el rango
 * cruzo de anio. Eso vale para cualquier rango de menos de un anio, muy por
 * encima del tope de `MAX_DIAS_RANGO`.
 *
 * ## Por que el formato depende del origen
 *
 * Es lo que permite que el informe automatico y el manual **del mismo periodo
 * convivan**, sin tocar la base de datos. Las dos formas no pueden chocar
 * nunca —una lleva una `W` y ocho caracteres, la otra son diez digitos—, asi
 * que son dos filas distintas bajo la misma columna unica.
 *
 * Y el `UNIQUE` sigue cumpliendo su trabajo: regenerar el mismo periodo desde
 * el mismo origen vuelve a dar la misma clave y reemplaza la fila, que es
 * justo lo que se espera al regenerar. No hay forma de acumular diez informes
 * de la misma semana.
 *
 * El cron sigue produciendo exactamente las claves que producia antes, asi que
 * los informes ya guardados siguen funcionando sin migrar ni una fila.
 *
 * **Esta clave no se muestra en pantalla.** La interfaz dibuja el rango en
 * español a partir de `desde` y `hasta`, que son columnas de verdad. Esto es
 * plomeria: sirve para encontrar la fila y para leerla en SQL.
 */
function claveDeRango(desde, hasta, automatico) {
    if (automatico && esSemanaExacta(desde, hasta)) {
        return rangoDeFecha(desde).semana;
    }
    const dd = (d) => String(d.getDate()).padStart(2, "0");
    const mm = (d) => String(d.getMonth() + 1).padStart(2, "0");
    const aa = (d) => String(d.getFullYear() % 100).padStart(2, "0");
    return `${aa(desde)}${mm(desde)}${dd(desde)}${mm(hasta)}${dd(hasta)}`;
}
/**
 * Convierte dos fechas "2026-11-28" en el rango del informe.
 *
 * El dia completo entra entero: el inicio arranca a las 00:00 y el termino
 * cierra a las 23:59:59.999, igual que hacia el rango de semana. Si el
 * termino quedara a las 00:00, las tareas de ese ultimo dia no contarian.
 *
 * `automatico` solo decide el formato de la clave, no el periodo. Va explicito
 * y sin valor por defecto a proposito: de el depende que un informe pise al
 * del otro origen, y esa no es una decision para dejar implicita.
 */
function rangoDeFechas(desdeTexto, hastaTexto, automatico) {
    const desde = fechaDeTexto(desdeTexto, 0, 0, 0, 0);
    const hasta = fechaDeTexto(hastaTexto, 23, 59, 59, 999);
    if (!desde || !hasta) {
        return { ok: false, motivo: "Fechas invalidas. Usa el formato 2026-11-28." };
    }
    if (desde.getTime() > hasta.getTime()) {
        return {
            ok: false,
            motivo: "La fecha de inicio es posterior a la de termino.",
        };
    }
    const dias = diasDeRango(desde, hasta);
    if (dias > exports.MAX_DIAS_RANGO) {
        return {
            ok: false,
            motivo: `El periodo no puede pasar de ${exports.MAX_DIAS_RANGO} dias, y este tiene ${dias}.`,
        };
    }
    return {
        ok: true,
        rango: { semana: claveDeRango(desde, hasta, automatico), desde, hasta },
    };
}
/**
 * Lee "2026-11-28" como una fecha local, a la hora indicada.
 *
 * Se parte el texto a mano en vez de usar `new Date(texto)`: ese constructor
 * interpreta "2026-11-28" como UTC, que en Chile es el dia anterior a las
 * nueve de la noche. El informe saldria corrido un dia.
 */
function fechaDeTexto(texto, hora, minuto, segundo, ms) {
    if (typeof texto !== "string")
        return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
    if (!match)
        return null;
    const anio = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);
    const fecha = new Date(anio, mes - 1, dia, hora, minuto, segundo, ms);
    // `new Date(2026, 1, 31)` no falla: devuelve el 3 de marzo. La unica forma
    // de detectar una fecha que no existe es comprobar que vuelva igual.
    if (fecha.getFullYear() !== anio ||
        fecha.getMonth() !== mes - 1 ||
        fecha.getDate() !== dia) {
        return null;
    }
    return fecha;
}
function conteoVacio() {
    return {
        completadas: 0,
        pendientes: 0,
        enProceso: 0,
        vencidas: 0,
        noAplica: 0,
        total: 0,
    };
}
function sumar(conteo, estado) {
    conteo.total += 1;
    switch (estado) {
        case client_1.EstadoTarea.COMPLETADA:
            conteo.completadas += 1;
            break;
        case client_1.EstadoTarea.PENDIENTE:
            conteo.pendientes += 1;
            break;
        case client_1.EstadoTarea.EN_PROCESO:
            conteo.enProceso += 1;
            break;
        case client_1.EstadoTarea.VENCIDA:
            conteo.vencidas += 1;
            break;
        case client_1.EstadoTarea.NO_APLICA:
            conteo.noAplica += 1;
            break;
    }
}
function diasEntre(desde, hasta) {
    const ms = hasta.getTime() - desde.getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
}
/**
 * Junta todo lo que el informe necesita saber del periodo.
 *
 * Solo usa `rango.desde` y `rango.hasta`, nunca la clave. Por eso un periodo
 * libre funciona igual que una semana: las consultas ya eran de fecha a
 * fecha.
 *
 * Se hacen tres consultas porque responden tres preguntas distintas:
 *
 *  1. Que vencia en el periodo      -> fechaProgramada dentro del rango
 *  2. Que se cerro en el periodo    -> fechaComplecion dentro del rango
 *  3. Que sigue sin cerrarse        -> vencio hasta el fin del periodo y no
 *                                      esta completada ni marcada no aplica
 *
 * La tercera mira el estado de HOY, no el del periodo: una tarea de hace un
 * mes que sigue abierta es justamente lo que el informe tiene que mostrar.
 */
async function recolectarDatos(rango, ahora = new Date()) {
    const seleccion = {
        estado: true,
        fechaProgramada: true,
        rutCliente: true,
        tareaPlantilla: { select: { nombre: true, area: true } },
        asignado: { select: { nombre: true, email: true } },
    };
    const [deLaSemana, cerradas, pendientesAcumuladas] = await Promise.all([
        prisma_1.prisma.tareaAsignada.findMany({
            where: { fechaProgramada: { gte: rango.desde, lte: rango.hasta } },
            select: seleccion,
        }),
        prisma_1.prisma.tareaAsignada.count({
            where: { fechaComplecion: { gte: rango.desde, lte: rango.hasta } },
        }),
        prisma_1.prisma.tareaAsignada.findMany({
            where: {
                fechaProgramada: { lte: rango.hasta },
                estado: {
                    in: [
                        client_1.EstadoTarea.PENDIENTE,
                        client_1.EstadoTarea.EN_PROCESO,
                        client_1.EstadoTarea.VENCIDA,
                    ],
                },
            },
            select: seleccion,
            orderBy: { fechaProgramada: "asc" },
        }),
    ]);
    const totales = conteoVacio();
    const porArea = new Map();
    const porTrabajador = new Map();
    for (const tarea of deLaSemana) {
        sumar(totales, tarea.estado);
        const etiqueta = ETIQUETA_AREA[tarea.tareaPlantilla.area];
        if (!porArea.has(etiqueta))
            porArea.set(etiqueta, conteoVacio());
        sumar(porArea.get(etiqueta), tarea.estado);
        const clave = tarea.asignado?.email ?? "(sin responsable)";
        if (!porTrabajador.has(clave)) {
            porTrabajador.set(clave, {
                nombre: tarea.asignado?.nombre ?? "Sin responsable",
                email: tarea.asignado?.email ?? "",
                conteo: conteoVacio(),
            });
        }
        sumar(porTrabajador.get(clave).conteo, tarea.estado);
    }
    // Atrasadas: vencieron y siguen abiertas al momento de generar el informe.
    const atrasadas = pendientesAcumuladas
        .filter((t) => t.fechaProgramada < ahora)
        .map((t) => ({
        tarea: t.tareaPlantilla.nombre,
        area: ETIQUETA_AREA[t.tareaPlantilla.area],
        responsable: t.asignado?.nombre ?? "Sin responsable",
        cliente: t.rutCliente,
        fechaProgramada: t.fechaProgramada.toISOString(),
        diasAtraso: diasEntre(t.fechaProgramada, ahora),
        _sinResponsable: !t.asignado,
    }))
        .sort((a, b) => b.diasAtraso - a.diasAtraso);
    return {
        semana: rango.semana,
        desde: rango.desde.toISOString(),
        hasta: rango.hasta.toISOString(),
        generadoEn: ahora.toISOString(),
        totales,
        completadasEnLaSemana: cerradas,
        porArea: [...porArea.entries()]
            .map(([area, conteo]) => ({ area, conteo }))
            .sort((a, b) => b.conteo.total - a.conteo.total),
        porTrabajador: [...porTrabajador.values()].sort((a, b) => b.conteo.total - a.conteo.total),
        atrasadas: {
            total: atrasadas.length,
            criticas: atrasadas.filter((t) => t.diasAtraso >= DIAS_ATRASO_CRITICO)
                .length,
            sinResponsable: atrasadas.filter((t) => t._sinResponsable).length,
            detalle: atrasadas.slice(0, MAX_ATRASADAS_DETALLE).map(({ _sinResponsable, ...resto }) => resto),
        },
    };
}
//# sourceMappingURL=datos.js.map