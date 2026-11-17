# Modulo Asistente

Asistente conversacional sobre la intranet, con Claude. Responde preguntas
sobre tickets, tareas y clientes, y redacta borradores de respuesta para la
ticketera.

## Endpoints

Montado en `/api/asistente` (`src/routes.ts`).

- `POST /chat` — conversacion. Responde por **SSE**.
  Body: `{ mensaje: string, historial: [{ rol, texto }] }`.
  Eventos: `{tipo:"texto"}`, `{tipo:"herramienta"}`, `{tipo:"accion"}`,
  `{tipo:"fin"}`, `{tipo:"error"}`.
- `POST /redactar-respuesta` — borrador para un ticket.
  Body: `{ ticketId: number, borradorActual?: string, puntos?: string[] }`
  -> `{ ok, data: { borrador } }`.

  Tiene dos modos. **Sin `puntos`** redacta desde cero a partir del hilo.
  **Con `borradorActual` y `puntos`** integra esos puntos en el texto que ya
  existe y devuelve la respuesta completa — es el "Agregar punto adicional"
  del detalle de ticket. Ambos campos son opcionales: sin ellos el endpoint se
  comporta igual que antes.

  El servidor **no guarda borradores**. Conservar el original para poder
  volver atras es responsabilidad del front (`TicketDetailPage` lo tiene en un
  ref). Y en ningun modo se envia el correo: el texto vuelve al editor y lo
  manda el agente.

Ambos detras de `authGuard`. Cualquier usuario autenticado entra; lo que ve
depende de sus permisos, no de la ruta.

## Permisos: el punto importante

**Ninguna herramienta recibe `area`, `userId` ni nada que diga de quien son
los datos.** Si los recibiera, bastaria con escribir "muestrame los tickets de
RRHH" para que el modelo rellenara ese campo. El alcance se inyecta en el
servidor desde el JWT, despues de que el modelo pidio la herramienta.

**Las herramientas llaman a los servicios que ya existen, no a Prisma.**
`buscar_tickets` usa `getTicketsForUser` y `resumen_tickets` usa
`getSummaryForUser`: las mismas funciones que alimentan la pantalla de
tickets. El asistente pasa por `getUserContext` -> `enforceArea` igual que la
tabla, asi que el modelo de permisos no se puede desincronizar con el de la
UI, porque es el mismo codigo.

Las tareas no se filtran por area sino por persona, y la intranet tiene **dos**
pantallas:

| Pantalla | Quien entra | Que muestra |
|---|---|---|
| `/tareas` | cualquiera | las suyas |
| `/supervisor` | `isSupervisorOrAdminEmail` | las de todos |

`buscar_tareas` replica exactamente eso: un agente recibe solo las suyas, un
supervisor o admin recibe las de toda la empresa. Usa
`isSupervisorOrAdminEmail` de `config/supervision.config.ts`, **la misma
funcion que protege `/supervisor`**, y no `user.role`: son listas distintas, y
usar otra dejaria al asistente mas amplio o mas estrecho que la UI.

Dos parametros acotan dentro de ese alcance, nunca lo abren:

- `solo_mias` (booleano) — "mis tareas pendientes".
- `responsable` (nombre o correo) — "cuantas tiene Diego".

La regla de arriba sigue en pie por el **orden**: el servidor fija primero que
puede ver esta persona, y recien despues aplica el filtro encima. Para un
agente, `responsable` se ignora por completo; su `where` ya quedo cerrado a sus
propias tareas y nada de lo que diga la conversacion lo cambia.

Si el nombre coincide con varias personas, la respuesta trae
`filtrado_por_responsable` con los nombres, para que el modelo no entregue un
numero mezclado como si fuera de una sola.

**Y si no coincide con nadie, la respuesta manda a reintentar.** "Los tickets
de X" casi nunca significa "asignados a X": puede ser una palabra del asunto
("los de test") o el cliente que escribio ("los de Ignacio"). Antes el modelo
contestaba "no encontre a ningun trabajador con ese nombre" y dejaba la
pregunta sin responder. Ahora la `nota` le dice que vuelva a llamar en la
misma vuelta — con `texto` en tickets, con `rut_cliente` en tareas (buscando
antes el RUT con `buscar_clientes`).

El servidor **no** hace esa conversion por su cuenta. Devolver el resultado de
una busqueda distinta a la que se pidio es como nacio el "te mostre las
primeras 50": un numero correcto de otra pregunta. La segunda llamada es
explicita y se ve en las etiquetas de la UI.

`buscar_tickets` tiene el mismo filtro `responsable` (mas `solicitante` y
"sin asignar"), pero por otra razon: ahi **no** se consulta quien supervisa,
porque `getTicketsForUser` aplica el alcance por area por dentro y despues del
filtro. Un agente que pregunte por alguien de otra area recibe cero, no los
tickets de esa area. Como el filtro de tickets admite un solo id, con varias
coincidencias devuelve `coincidencias` y no busca nada: elegir una seria dar un
numero exacto de la persona equivocada.

Los dos traducen el nombre a un id con `trabajadoresQueCoinciden`, que siempre
devuelve la lista completa y nunca decide por su cuenta.

La respuesta trae un campo `alcance` que dice cual de los dos casos fue, para
que el modelo no conteste "no tienes tareas atrasadas" cuando la pregunta era
cuantas hay en total.

Ojo con la asimetria, que es deliberada: `buscar_tareas` se guia por la lista
de correos de supervision y `buscar_clientes` por el rol del JWT. Cada
herramienta copia el gate de **su** pantalla, no hay un criterio unico.

**El set de herramientas depende del rol** (`herramientasPara`). A un AGENTE
no se le ofrece `buscar_clientes`, porque la pantalla de Clientes esta detras
de `SupervisorRoute` en el front. Ojo: el endpoint `/api/clientes` del backend
solo exige `requireAuth`, o sea que esa restriccion hoy vive unicamente en el
front; el asistente igual la respeta, porque promete mostrar solo lo que el
usuario ve en pantalla y eso se mide contra la UI, no contra el guard mas
debil que haya quedado en una ruta.

## Botones de pantalla

Cada herramienta puede devolver, ademas de los datos, **una ruta de la
intranet** (`tools/acciones.ts`). El front la pinta como boton al pie de la
respuesta y navega solo si el usuario lo pulsa: el asistente nunca cambia de
pantalla por su cuenta.

Tres cosas sostienen esto:

1. **La ruta la arma el servidor, con constantes.** Lo unico variable es un id
   numerico. El modelo no puede inventar `/reportes/secreto` ni mandar a nadie
   fuera del sitio.
2. **El modelo no la ve.** `ejecutarHerramienta` devuelve
   `{ datos, accion? }` y al `tool_result` solo va `datos`. Si la ruta viajara
   ahi dentro, el modelo la leeria y escribiria URLs sueltas en el texto.
3. **El boton nunca supera a la pantalla.** Una herramienta puede tener
   permiso para darte un dato sin que tu puedas abrir la pantalla donde vive.
   Pasa con las tareas: el alcance lo decide `isSupervisorOrAdminEmail` (lista
   de correos) y `/supervisor` lo protege `SupervisorRoute` (rol del JWT), que
   son listas distintas. Por eso `accionTareas` exige las dos y, si solo se
   cumple una, ofrece `/tareas`.

Que los datos y el boton salgan de la **misma** funcion es el punto: el boton
no puede contradecir a la cifra, porque quien calculo el alcance es quien
eligio la pantalla. Con cero resultados no hay boton, y se emiten dos como
maximo por respuesta (`MAX_ACCIONES`), sin repetir ruta.

El boton de tareas lleva `estado` y, cuando el nombre buscado coincidio con
**una sola** persona, `agente`. Con varias coincidencias va sin agente: la
pantalla muestra a uno a la vez y abrir la de alguien que quizas no era es
peor que la vista general. `rut_cliente` y `vence_en_dias` todavia no viajan:
`TareasSupervisionPage` solo lee esos dos parametros de la URL, y ampliarlo es
trabajo de esa pantalla, no de aca.

Por eso mismo el boton de tickets **lleva los filtros** que se consultaron
(`/tickets?estado=Abierto&agente=7`). Si abriera la tabla sin filtrar, la
respuesta diria "hay 12" y la pantalla mostraria 300. Los nombres de los
parametros son los de `FiltrosHudTickets` en el front y los valores el mismo
vocabulario que ya usan las herramientas, asi que no hay traduccion entre los
dos lados. Con un unico resultado el boton se salta la tabla y abre ese
ticket.

El front valida igual que la ruta sea interna (`esRutaInterna` en
`useAsistente`). Hoy es redundante; esta porque el boton navega sin preguntar.

**Todo es de solo lectura.** Ninguna herramienta escribe. Si alguna vez se
agrega una que actue, necesita confirmacion del usuario antes de ejecutarse:
es otro diseno, no un parametro mas.

El historial lo manda el navegador, asi que `sanearHistorial` lo filtra: solo
sobreviven turnos de texto con rol `user` o `assistant`. Sin eso, un cliente
modificado podria inyectar un rol `system` o `tool_result` falsos que simulen
datos que nunca salieron de la base.

## Archivos

- `prompt.ts` — los dos prompts (chat interno y borrador al cliente). Es texto,
  no logica: se puede ajustar el tono sin tocar nada mas.
- `tools/definiciones.ts` — que puede pedir el modelo.
- `tools/ejecutores.ts` — que se ejecuta de verdad.
- `tools/acciones.ts` — las rutas que se pueden ofrecer como boton.
- `asistente.service.ts` — loop de herramientas y streaming.
- `asistente.controller.ts` — SSE y validacion de entrada.

El cliente de Anthropic y el nombre del modelo **no viven aqui**: estan en
`src/lib/anthropic.ts`, porque los informes semanales tambien usan IA y los dos
modulos tienen que apuntar al mismo modelo.

## Configuracion

- `ANTHROPIC_API_KEY` — obligatoria. Sin ella los endpoints responden que el
  asistente no esta configurado, en vez de caerse.
- `ANTHROPIC_MODEL` — opcional, por defecto `claude-opus-5-5`. Lo comparte con
  el modulo de informes.
- `ASISTENTE_MAX_DIARIO` — opcional, por defecto 50. Llamadas a la IA por
  persona y por dia, sumando el chat y los borradores de ticket. Un valor
  invalido cae al default, nunca a "sin limite".

Se cachea el prompt de sistema junto con las definiciones de herramientas:
son identicos en cada turno y asi bajan a ~10% de su costo.

## Frenos de gasto

Cada mensaje gasta dinero de la cuenta de Anthropic, y los dos frenos del
controlador tapan casos distintos:

- **Una llamada en vuelo por usuario** (`enVuelo`) — corta el paralelo.
- **Cuota diaria** (`usoDiario`) — corta el volumen. El paralelo bloqueado no
  impide mil llamadas seguidas de a una.

Cuando cualquiera de los dos salta, el front muestra el texto del servidor tal
cual: el chat lo lee en `asistenteApi.ts` y los botones de borrador con
`mensajeDeErrorApi` (`lib/api.ts`). Importa que llegue completo — "llegaste al
limite de 50 consultas por dia" se entiende, "no se pudo generar el borrador"
hace reintentar a ciegas.

El contador vive **en memoria, no en base de datos**, y se reinicia con cada
deploy. Es deliberado: es un fusible contra un front en loop, no contabilidad.
Guardarlo implicaria una tabla nueva y una escritura por mensaje para un dato
que la consola de Anthropic ya muestra mejor. El dia se calcula en hora de
Chile porque el servidor corre en UTC y si no el contador se reiniciaria a las
nueve de la noche.

**Los dos frenos cubren los dos endpoints**, chat y `redactar-respuesta`, con
un unico candado y un unico contador compartidos.

Antes la cuota aplicaba solo al chat, con el argumento de que un boton dentro
de un ticket no puede irse en loop solo. El argumento era malo: un boton se
aprieta desde el mismo front que podria repetir el request, gasta de la misma
cuenta y cuesta lo mismo. Un fusible en una de las dos puertas no es un
fusible.

Y el contador es **uno solo**, no uno por endpoint: lo que hay que cuidar es
el credito de la cuenta, que es comun a los dos y se acaba una sola vez. Dos
contadores de 50 serian en realidad un tope de 100 disfrazado de dos topes
de 50.

El efecto visible del candado compartido es que no se puede pedir un borrador
mientras el chat esta respondiendo. El mensaje de error lo explica, y son dos
cosas que nadie hace a la vez a proposito.

En los dos endpoints se anota **antes** de llamar a la IA: una respuesta que
se corta a la mitad igual se genero y igual se cobro. Y en los dos, las
validaciones de entrada van antes del contador, porque un request mal formado
no llega a la IA y no tiene por que gastar cuota.

Ninguno de los dos es un tope de dinero. El unico tope real de gasto se pone
en la consola de Anthropic (Settings → Limits); estos frenos evitan que un bug
llegue hasta ahi.

## Cuando la API falla

`mensajeDeErrorIA` (en `lib/anthropic.ts`) traduce los errores del SDK a algo
que se pueda leer en pantalla: sin credito, saturado, credencial invalida.
Esta en `lib` y no aca porque los informes semanales usan la misma cuenta y se
quedan sin credito el mismo dia.

El motivo es que "Error al consultar el asistente" es un callejon sin salida:
dos de esos tres casos se arreglan en la consola de Anthropic y no en el
codigo, asi que sin nombrarlos el problema se va a buscar al lugar equivocado.
Lo que no reconoce devuelve `null` y sigue mostrando el mensaje generico.

Ojo: "sin credito" llega como un 400 con el motivo en el texto, no como un
codigo propio, asi que se detecta por contenido. Si Anthropic cambia esa
redaccion, se vuelve al mensaje generico — se pierde la pista, no se rompe
nada.

## Dos cosas que el asistente no garantiza

El prompt le dice que solo hable de la intranet. Eso corta la mayoria de los
desvios, pero **es una instruccion, no un candado**: alguien insistiendo puede
sacarle una respuesta fuera de tema. Lo que si es un candado son las
herramientas: por mucho que lo convenzan, no puede mostrar datos que el
usuario no podria ver en pantalla.

Y puede equivocarse al interpretar lo que le devuelven. El prompt le prohibe
inventar cifras y le pide citar la fuente, pero los datos importantes se
verifican en la pantalla que corresponde.
