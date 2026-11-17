# Informes

Informe de tareas de un periodo, con el resumen redactado por IA. Lo ven el
administrador y una segunda persona autorizada, nadie más.

El periodo lo elige quien genera el informe: un calendario de "desde" y
"hasta", con atajos para los casos de siempre. El cron automático sigue
generando semanas de lunes a domingo.

## Archivos

| Archivo | Qué hace |
|---|---|
| `datos.ts` | Cuenta las tareas. Aquí viven los números. |
| `prompt.ts` | El texto de las instrucciones para la IA. |
| `informes.service.ts` | Orquesta: junta datos, pide el resumen, guarda la fila. |
| `informes.controller.ts` | Endpoints y el guard de permisos. |
| `informes.routes.ts` | Monta las rutas en `/api/informes`. |

## Endpoints

| Método | Ruta | Qué devuelve |
|---|---|---|
| `GET` | `/api/informes` | Los informes ya generados, del más reciente al más antiguo. |
| `GET` | `/api/informes/:clave` | Un informe completo. |
| `POST` | `/api/informes/generar` | Genera y guarda. |

Las tres exigen `authGuard` **y** `soloInformes`.

`POST /generar` acepta tres formas, en este orden de prioridad:

```jsonc
{ "desde": "2026-11-28", "hasta": "2026-12-05" }  // periodo libre
{ "semana": "2026-W46" }                          // semana ISO
{ }                                               // la semana en curso
```

Las dos últimas se mantienen porque son las que usa el cron y las que mandaban
las versiones anteriores del front.

## La clave del informe

**La arma el servidor** (`claveDeRango` en `datos.ts`), nunca el navegador.
Antes se calculaba en los dos lados y tenían que coincidir carácter por
carácter; ahora el front manda las dos fechas y recibe la clave hecha.

Hay dos formatos, y no por gusto: la columna `semana` es `VarChar(10)` y es la
clave única. En diez caracteres no caben dos fechas con separadores, y
ampliar la columna sería modificar la base.

| Informe | Clave | Ejemplo |
|---|---|---|
| Automático de una semana exacta (lunes 00:00 → domingo 23:59) | `AAAA-Wss` | `2026-W46` |
| Todo lo demás | `AAMMDD` + `MMDD` | `2611281205` |

El segundo son las dos fechas pegadas: la de inicio completa y el mes-día del
término. Diez justos, sin lugar para separadores. El año del término no se
guarda porque se deduce: si su mes-día es menor que el del inicio, el rango
cruzó de año. Eso vale para cualquier periodo de menos de un año, muy por
encima del tope de 92 días.

### Por qué el formato depende del origen

Es lo que permite que **el informe automático y el manual del mismo periodo
convivan**, sin tocar la base de datos. Las dos formas no pueden chocar nunca
—una lleva una `W` y ocho caracteres, la otra son diez dígitos—, así que son
dos filas distintas bajo la misma columna única.

Y el `UNIQUE` sigue haciendo su trabajo: regenerar el mismo periodo desde el
mismo origen vuelve a dar la misma clave y reemplaza la fila, que es justo lo
que se espera al regenerar. No hay forma de acumular diez informes de la misma
semana.

El cron sigue produciendo exactamente las claves de antes, así que los
informes ya guardados funcionan sin migrar ni una fila. Lo que **no** se
migra son los manuales viejos que quedaron con clave de semana: el cron los va
a seguir pisando. De ahí en adelante, no.

> Ojo: las formas `{ "semana": "2026-W46" }` y `{ }` de `POST /generar` dan
> clave de semana sin mirar el origen. El front ya no las usa —manda
> `desde`/`hasta`—, pero una petición vieja que mande `semana` sigue
> compartiendo fila con el cron, igual que antes.

### Dos preguntas que parecen una

- `esSemanaIso(clave)` mira **la forma de la clave**: dice si se puede mostrar
  "Semana 2026-W46" en pantalla.
- `esSemanaExacta(desde, hasta)` mira **las fechas**: dice si el periodo va de
  lunes a domingo, y con eso se decide si la IA escribe "la semana" o "el
  periodo".

Un informe manual de lunes a domingo responde `true` a la segunda y `false` a
la primera. Confundirlas hace que un informe de siete días se redacte como si
fuera un periodo cualquiera, o que la pantalla muestre un identificador
interno como si fuera un nombre.

**La clave no se muestra en pantalla, y a la IA solo se le pasa cuando es de
semana.** La interfaz dibuja el rango en español a partir de `desde` y
`hasta`, que son columnas de verdad. Es plomería: sirve para encontrar la fila
y para leerla en SQL.

Ojo con `listarInformes`: ordena por `desde` y **no** por la clave. Con los dos
formatos conviviendo, ordenar como texto no da un orden cronológico.

## Tope de 92 días

`MAX_DIAS_RANGO` en `datos.ts`. No es un capricho de interfaz: la consulta de
tareas del periodo no tiene límite de filas y todas terminan resumidas dentro
del prompt. Un rango de dos años traería miles de tareas, costaría caro y
podría pasarse del contexto del modelo.

El mensaje de error dice cuántos días tiene el periodo pedido, para que se
corrija sin adivinar.

## Permisos

Se configuran con `INFORMES_EMAILS` en el `.env`:

```
INFORMES_EMAILS=administrador@cintax.cl,otra-persona@cintax.cl
```

Sin la variable queda solo `administrador@cintax.cl`.

Es una lista aparte de `SUPERVISOR_OR_ADMIN_EMAILS` a propósito: ese set tiene
seis correos y da acceso a media intranet. Los informes son para dos personas.

**El backend no se fía del JWT.** El token trae un flag `puedeVerInformes`,
pero existe solo para que el front decida si dibuja el menú. `soloInformes`
recalcula el permiso desde el correo en cada request, porque si alguien sale de
la lista su token viejo seguiría diciendo que sí hasta que expire.

## Por qué el informe se guarda

Un informe es un hecho histórico: se generó un viernes con los datos de esa
semana. Si se regenerara en enero daría otro texto, porque las tareas siguieron
cambiando de estado. Por eso vive en la tabla `InformeSemanal` y no se
reconstruye al vuelo.

Un periodo y un origen, un informe: la columna `semana` es única y regenerar
reemplaza. Eso es deliberado — regenerar sirve justamente para cuando el
primero salió con datos incompletos. Dos periodos distintos que empiecen el
mismo día son informes distintos, porque la clave lleva las dos fechas.

Y el origen cuenta: el automático y el manual del mismo periodo son dos filas
que conviven, porque reciben claves de formato distinto. Ver *La clave del
informe*, más arriba.

## De dónde salen los números

`recolectarDatos` solo usa `desde` y `hasta`, nunca la clave. Por eso un
periodo libre funcionó desde el primer día sin tocar las consultas: ya eran de
fecha a fecha.

Tres consultas, que responden tres preguntas distintas:

1. **Qué vencía en el periodo** — `fechaProgramada` dentro del rango.
2. **Qué se cerró en el periodo** — `fechaComplecion` dentro del rango.
3. **Qué sigue sin cerrarse** — venció hasta el fin del periodo y no está
   `COMPLETADA` ni `NO_APLICA`.

La tercera mira el estado de **hoy**, no el del periodo: una tarea de hace un
mes que sigue abierta es justamente lo que el informe tiene que mostrar. Por eso
`atrasadas` puede incluir tareas anteriores al periodo, y el informe lo dice.

La IA recibe esos números ya calculados y solo los interpreta. El prompt le
prohíbe inventar cifras y le prohíbe comparar con periodos anteriores, porque
no los tiene.

**El prompt cambia según el periodo** (`promptInforme(esSemana)`). Con un
rango libre se le dice explícitamente que no es una semana y que no la llame
así. Sin eso, el modelo escribe "esta semana se completaron 340 tareas" sobre
un periodo de sesenta días: falso, y con el mismo tono seguro que lo
verdadero.

Por lo mismo, la cabecera de datos **no le muestra la clave** cuando es un
periodo libre. Para una semana, `2026-W46` significa algo; `2611281205` es un
identificador interno, y dárselo solo abre la puerta a que lo escriba en el
informe como si fuera el nombre del periodo.

## Cron

Viernes 18:00, detrás de `ENABLE_INFORMES_CRON=true`. Apagado por defecto:
cada corrida gasta una llamada a la IA.

Genera el informe de la semana que está cerrando (la del propio viernes), no la
anterior — a esa hora ya está todo el trabajo de la semana adentro.

## Base de datos

Solo escribe en `InformeSemanal`. Las tareas únicamente se leen.

**Los periodos libres no necesitaron ningún cambio de esquema.** Las columnas
`desde` y `hasta` ya existían: antes guardaban el lunes y el domingo de la
semana, ahora guardan lo que el usuario eligió. Lo único que hubo que resolver
fue meter la identidad del periodo en los diez caracteres de `semana`, que es
de donde sale el formato de clave de más arriba.

El campo se sigue llamando `semana` aunque ya no siempre lo sea. Renombrarlo
obligaría a migrar la columna, el JSON de la columna `datos` de los informes
ya guardados y la respuesta de la API. El tipo en el código sí cambió de
nombre (`RangoInforme`), que es gratis porque lo revisa el compilador.

La tabla se creó con `src/scripts/crear-tabla-informes.ts`, no con `migrate`:
este proyecto no tiene historial de migraciones usable. `generadoPor` guarda el
id del trabajador **sin FOREIGN KEY**, para que esta tabla no agregue ninguna
dependencia sobre `Trabajador`.

## Límites conocidos

- **No compara periodos.** El prompt se lo prohíbe explícitamente porque solo
  recibe uno. Si algún día se quiere "mejoró respecto del periodo anterior",
  hay que pasarle también los datos del anterior.
- **Máximo 92 días por informe.** Ver el apartado del tope, más arriba.
- **`atrasadas.detalle` trae como máximo 40 tareas**, ordenadas por días de
  atraso. El total real va en `atrasadas.total`, y el prompt avisa de la
  diferencia para que la IA no diga "son 40" cuando son 300.
- **El prompt es una instrucción, no un candado.** La IA podría equivocarse al
  interpretar un número. Los datos crudos quedan en la columna `datos`, así que
  siempre se puede contrastar el texto contra ellos.
