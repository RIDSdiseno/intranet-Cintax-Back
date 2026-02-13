# Manual checklist - Ticketera seed

## Precondiciones
- Backend levantado con base de datos accesible.
- Seed ejecutado al menos una vez (`npm run seed` o `npx prisma db seed`).

## 1) Perfil Admin
- Ir a `/tickets` y validar que aparecen chips: `Todos` + areas (`Contabilidad`, `Recursos Humanos`, `Comercial y Marketing`).
- Abrir un ticket con asunto que comience por `[SEED]`.
- Validar que el hilo muestra 4 mensajes cronologicos (PUBLIC_REPLY, INTERNAL_NOTE, FORWARD, PUBLIC_REPLY).
- Validar badges/indicadores de mensaje privado y reenviado en el detalle.
- Ejecutar accion de cierre de ticket y comprobar que el estado cambia a `CERRADO` y persiste al recargar.

## 2) Perfil Agente CONTA
- Iniciar sesion como agente de CONTA.
- Ir a `/tickets` y validar que solo aparecen tickets de CONTA.
- Confirmar que no aparecen tickets RRHH ni TRIBUTARIO.
- Abrir un ticket seed de CONTA y responder.
- Verificar que la nueva respuesta aparece en el hilo cronologico.

## 3) Validaciones en DB
```sql
-- Conteo de mensajes para tickets seed
SELECT count(*)
FROM "TicketMessage"
WHERE "ticketId" IN (
  SELECT "id_ticket"
  FROM "Ticket"
  WHERE "subject" LIKE '[SEED]%'
);
```

```sql
-- Muestra de adjuntos seed
SELECT *
FROM "TicketAttachment"
WHERE "url" = 'https://example.com/comprobante.pdf'
LIMIT 5;
```

## 4) Comprobacion rapida de coverage seed
```sql
-- Tickets seed por categoria
SELECT "categoria", count(*)
FROM "Ticket"
WHERE "subject" LIKE '[SEED]%'
GROUP BY "categoria"
ORDER BY "categoria";
```

```sql
-- Tickets seed sin asignacion
SELECT count(*)
FROM "Ticket"
WHERE "subject" LIKE '[SEED]%'
  AND "trabajadorId" IS NULL;
```
