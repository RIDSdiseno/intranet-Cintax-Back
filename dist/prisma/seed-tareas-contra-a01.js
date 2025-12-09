"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/seed-tareas-conta-all.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// 🧩 IMPORTANTE: pon aquí el id_trabajador real de A01
// Puedes verlo en la tabla Trabajador (Prisma Studio o DB).
const FALLBACK_TRABAJADOR_ID = 1; // TODO: cambiar por el id real de A01
// 👉 Filtrado de clientes que quieres que entren en el seed
// Por ahora: todos los clientes activos.
// Si quieres solo los de A01, puedes usar: { activo: true, agenteId: FALLBACK_TRABAJADOR_ID }
const CLIENTES_WHERE = {
    activo: true,
    // agenteId: FALLBACK_TRABAJADOR_ID ?? undefined,
};
// Año que quieres usar para la fechaProgramada (para que caiga en CINTAX/2025/CONTA)
const SEED_YEAR = 2025;
// 📌 TAREAS CONTA (sin tildes, segun tabla real)
const TAREAS_CONTA_BASE = [
    {
        area: client_1.Area.CONTA,
        nombre: "Confeccion y envio de F29",
        detalle: "Confeccion y envio de F29 al SII para clientes asignados.",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "15 de cada mes",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: 15,
        diaSemanaVencimiento: null,
        codigoDocumento: "F29",
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Estado de Resultado",
        detalle: "Emitir informe en sistema, limpiar en excel",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Simulacion Impuesto Renta aplicado directo",
        detalle: "Aplicar tasa del regimen sobre Resultado antes de impuesto",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes / sobre acumulado mes anterior",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Conciliacion Bancaria",
        detalle: "Conciliar",
        frecuencia: client_1.FrecuenciaTarea.SEMANAL,
        frecuenciaTexto: "Semanal",
        plazoMaximoTexto: "Viernes de cada semana",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: null,
        diaSemanaVencimiento: 5, // viernes
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Analisis cuentas por cobrar",
        detalle: "Cuentas por cobrar y antiguedad de las mismas",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Analisis cuentas por pagar",
        detalle: "Cuentas por pagar y antiguedad de las mismas",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Amortizaciones de creditos",
        detalle: "Tener a la vista tabla de amortizaciones para creditos vigentes",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "30 de cada mes, para el mes en curso",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: 30,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Centralizacion F29",
        detalle: "Contabilizar las partidas involucradas en el F29",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "30 de cada mes, para el mes en curso",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: 30,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Centralizacion cuotas creditos / Leasing",
        detalle: "Contabilizar pagos de cuotas en pasivo y resultado",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "30 de cada mes, para el mes en curso",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: 30,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Centralizacion remuneraciones",
        detalle: "Centralizar las partidas asociadas",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "5 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: 5,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Cierre contabilizacion libro compra",
        detalle: "Contabilizacion de todas las facturas RCV en ERP",
        frecuencia: client_1.FrecuenciaTarea.SEMANAL,
        frecuenciaTexto: "Semanal",
        plazoMaximoTexto: "5 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: null,
        diaSemanaVencimiento: 5,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Cierre contabilizacion libro Venta",
        detalle: "Contabilizacion de todas las facturas RCV en ERP",
        frecuencia: client_1.FrecuenciaTarea.SEMANAL,
        frecuenciaTexto: "Semanal",
        plazoMaximoTexto: "5 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: null,
        diaSemanaVencimiento: 5,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Cierre contabilizacion libro Honorario",
        detalle: "Contabilizacion de todos los honorarios segun SII",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "5 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: 5,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Conciliacion RCV - ERP",
        detalle: "Informe de diferencias entre RCV y ERP",
        frecuencia: client_1.FrecuenciaTarea.SEMANAL,
        frecuenciaTexto: "Semanal",
        plazoMaximoTexto: "5 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: null,
        diaSemanaVencimiento: 5,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Analisis cuenta retiro socios",
        detalle: "Detalle de los retiros efectuados por cada socio",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Informe de cuentas de activo y pasivo con saldos invertidos",
        detalle: "Cuentas de activo con saldo acreedor y pasivos con saldo deudor",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Envio Pre-IVA",
        detalle: "Enviar pre-iva (solo debitos - Credito) segun RCV",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 del mes en curso",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Envio semanal correo a cliente",
        detalle: "Comunicacion para envio o solicitud de informacion",
        frecuencia: client_1.FrecuenciaTarea.SEMANAL,
        frecuenciaTexto: "Semanal",
        plazoMaximoTexto: "Semanal",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: null,
        diaSemanaVencimiento: 5,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Informe observaciones SII",
        detalle: "Todos los meses informe para revision interna (IVAS)",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Informe Deuda TGR",
        detalle: "Certificado deuda fiscal TGR para envio al cliente",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Convenios y/o postergaciones TGR",
        detalle: "Informe con pantallazos con cuotas por vencer de convenios y/o postergaciones de impuestos.",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes",
        presentacion: client_1.Presentacion.CLIENTE,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
    {
        area: client_1.Area.CONTA,
        nombre: "Control de Activo Fijo",
        detalle: "Mensual con detalle de activos años anteriores y en curso, revision interna",
        frecuencia: client_1.FrecuenciaTarea.MENSUAL,
        frecuenciaTexto: "Mensual",
        plazoMaximoTexto: "25 de cada mes / sobre el mes anterior",
        presentacion: client_1.Presentacion.INTERNO,
        diaMesVencimiento: 25,
        diaSemanaVencimiento: null,
    },
];
async function main() {
    console.log("🔹 Iniciando seed de tareas CONTA para clientes...");
    console.log("📅 Año para fechaProgramada:", SEED_YEAR);
    console.log("🧑‍💼 FALLBACK_TRABAJADOR_ID (A01):", FALLBACK_TRABAJADOR_ID);
    // 1) Clientes según filtro
    const clientes = await prisma.cliente.findMany({
        where: CLIENTES_WHERE,
    });
    console.log(`📌 Clientes encontrados: ${clientes.length}`);
    if (clientes.length === 0) {
        console.log("⚠️ No hay clientes que cumplan el filtro, nada que hacer.");
        return;
    }
    // Puedes ajustar este día/mes, pero el año será SEED_YEAR
    const fechaProgramada = new Date(SEED_YEAR, 0, 10); // 10 enero SEED_YEAR
    console.log("📅 fechaProgramada usada:", fechaProgramada.toISOString());
    // 2) Por cada tarea base, asegurar plantilla y asignar a todos los clientes
    for (const tareaBase of TAREAS_CONTA_BASE) {
        console.log(`\n▶️ Procesando plantilla: ${tareaBase.nombre}`);
        // Buscar plantilla por area + nombre
        let plantilla = await prisma.tareaPlantilla.findFirst({
            where: {
                area: tareaBase.area,
                nombre: tareaBase.nombre,
            },
        });
        if (!plantilla) {
            console.log("  📌 No existe, creando plantilla...");
            plantilla = await prisma.tareaPlantilla.create({
                data: {
                    area: tareaBase.area,
                    nombre: tareaBase.nombre,
                    detalle: tareaBase.detalle,
                    frecuencia: tareaBase.frecuencia,
                    frecuenciaTexto: tareaBase.frecuenciaTexto,
                    plazoMaximoTexto: tareaBase.plazoMaximoTexto,
                    presentacion: tareaBase.presentacion,
                    diaMesVencimiento: tareaBase.diaMesVencimiento ?? null,
                    diaSemanaVencimiento: tareaBase.diaSemanaVencimiento ?? null,
                    codigoDocumento: tareaBase.codigoDocumento ?? null,
                    activo: true,
                },
            });
            console.log("  ✅ Plantilla creada con id:", plantilla.id_tarea_plantilla);
        }
        else {
            console.log("  ℹ️ Plantilla ya existe con id:", plantilla.id_tarea_plantilla, "→ actualizando metadatos...");
            // Sincronizar campos importantes por si el seed cambio algo
            plantilla = await prisma.tareaPlantilla.update({
                where: { id_tarea_plantilla: plantilla.id_tarea_plantilla },
                data: {
                    detalle: tareaBase.detalle,
                    frecuencia: tareaBase.frecuencia,
                    frecuenciaTexto: tareaBase.frecuenciaTexto,
                    plazoMaximoTexto: tareaBase.plazoMaximoTexto,
                    presentacion: tareaBase.presentacion,
                    diaMesVencimiento: tareaBase.diaMesVencimiento ?? null,
                    diaSemanaVencimiento: tareaBase.diaSemanaVencimiento ?? null,
                    codigoDocumento: tareaBase.codigoDocumento ?? null,
                    activo: true,
                },
            });
        }
        // Asignar tarea a cada cliente
        for (const cliente of clientes) {
            const rut = cliente.rut;
            // Evitar duplicados por plantilla + rut
            const yaExiste = await prisma.tareaAsignada.findFirst({
                where: {
                    tareaPlantillaId: plantilla.id_tarea_plantilla,
                    rutCliente: rut,
                },
            });
            if (yaExiste) {
                console.log(`  ↩️ Ya existe tarea para RUT ${rut} (${cliente.razonSocial}), se omite.`);
                continue;
            }
            // Si el cliente tiene agenteId se usa, si no, se usa el fallback (A01)
            const trabajadorId = cliente.agenteId ?? FALLBACK_TRABAJADOR_ID ?? undefined;
            console.log(`  ➕ Creando tarea para RUT ${rut} (${cliente.razonSocial}) → trabajadorId: ${trabajadorId ?? "null"}`);
            await prisma.tareaAsignada.create({
                data: {
                    tareaPlantillaId: plantilla.id_tarea_plantilla,
                    rutCliente: rut,
                    trabajadorId,
                    estado: client_1.EstadoTarea.PENDIENTE,
                    fechaProgramada,
                    comentarios: `Tarea ${tareaBase.nombre} para ${cliente.razonSocial}`,
                },
            });
        }
    }
    console.log("\n✅ Seed de tareas CONTA completado.");
}
main()
    .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
