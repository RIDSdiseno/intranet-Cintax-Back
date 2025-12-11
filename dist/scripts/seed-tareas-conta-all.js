"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/seed-tareas-conta-A01-test.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// 🔹 Cartera objetivo (A01)
const CARTERA_CONTA_A01 = "CONTA/A01";
// 🔹 Agente objetivo (A01 → id 7)
const AGENTE_A01_ID = 7;
// 👉 Filtrado de clientes que quieres que entren en el seed
// Solo clientes activos de la cartera CONTA/A01 y del agente 7
const CLIENTES_WHERE = {
    activo: true,
    codigoCartera: CARTERA_CONTA_A01,
    agenteId: AGENTE_A01_ID,
};
// 🔹 Períodos que queremos sembrar
//  - diciembre 2025  (produ)
//  - enero 2025      (entorno pruebas)
const PERIODOS = [
    { year: 2025, monthIndex: 11, label: "diciembre 2025" }, // 11 = diciembre
    { year: 2025, monthIndex: 0, label: "enero 2025 (pruebas)" }, // 0 = enero
];
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
        diaSemanaVencimiento: 5, // viernes (getDay() = 5)
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
// Helper: primer día de semana X (0–6) de un mes
const getFirstWeekdayOfMonth = (year, monthIndex, weekday) => {
    const d = new Date(year, monthIndex, 1);
    while (d.getDay() !== weekday) {
        d.setDate(d.getDate() + 1);
    }
    return d;
};
// Calcula la fechaProgramada según la configuración de la tarea y el período dado
const getFechaProgramada = (year, monthIndex, tareaBase) => {
    // Si hay día del mes definido → ese día de ese mes
    if (tareaBase.diaMesVencimiento && tareaBase.diaMesVencimiento > 0) {
        return new Date(year, monthIndex, tareaBase.diaMesVencimiento);
    }
    // Si hay día de la semana definido → primer día de ese tipo en el mes
    if (typeof tareaBase.diaSemanaVencimiento === "number" &&
        tareaBase.diaSemanaVencimiento >= 0 &&
        tareaBase.diaSemanaVencimiento <= 6) {
        return getFirstWeekdayOfMonth(year, monthIndex, tareaBase.diaSemanaVencimiento);
    }
    // Fallback: día 10 del mes
    return new Date(year, monthIndex, 10);
};
async function main() {
    console.log("🔹 Iniciando seed de tareas CONTA para cartera A01 (A01 = agente 7)...");
    console.log("🧾 Cartera:", CARTERA_CONTA_A01);
    console.log("👤 Agente (A01):", AGENTE_A01_ID);
    // 1) Clientes según filtro (solo cartera CONTA/A01 y agente 7)
    const clientes = await prisma.cliente.findMany({
        where: CLIENTES_WHERE,
    });
    console.log(`📌 Clientes encontrados (CONTA/A01, agente 7): ${clientes.length}`);
    if (clientes.length === 0) {
        console.log("⚠️ No hay clientes que cumplan el filtro, nada que hacer.");
        return;
    }
    // 2) Recorremos cada período (diciembre 2025, enero 2025 pruebas)
    for (const periodo of PERIODOS) {
        const { year, monthIndex, label } = periodo;
        console.log(`\n=============================`);
        console.log(`📅 Procesando período: ${label} (year=${year}, monthIndex=${monthIndex})`);
        console.log(`=============================\n`);
        const startMonth = new Date(year, monthIndex, 1);
        const endMonth = new Date(year, monthIndex + 1, 1);
        for (const tareaBase of TAREAS_CONTA_BASE) {
            console.log(`\n▶️ Plantilla: ${tareaBase.nombre}`);
            const fechaProgramada = getFechaProgramada(year, monthIndex, tareaBase);
            console.log("  📅 fechaProgramada:", fechaProgramada.toISOString());
            // 2.1) Asegurar plantilla
            let plantilla = await prisma.tareaPlantilla.findFirst({
                where: {
                    area: tareaBase.area,
                    nombre: tareaBase.nombre,
                },
            });
            if (!plantilla) {
                console.log("  📌 No existe plantilla, creando...");
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
                await prisma.tareaPlantilla.update({
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
            // 2.2) Asignar tarea para cada cliente en ESTE MES (sin duplicar por mes)
            for (const cliente of clientes) {
                const rut = cliente.rut;
                const trabajadorId = cliente.agenteId;
                if (!trabajadorId) {
                    console.log(`  ⚠️ Cliente RUT ${rut} (${cliente.razonSocial}) no tiene agenteId, se omite.`);
                    continue;
                }
                // 👇 Evitar duplicados SOLO dentro de este mes
                const yaExisteEnMes = await prisma.tareaAsignada.findFirst({
                    where: {
                        tareaPlantillaId: plantilla.id_tarea_plantilla,
                        rutCliente: rut,
                        fechaProgramada: {
                            gte: startMonth,
                            lt: endMonth,
                        },
                    },
                });
                if (yaExisteEnMes) {
                    console.log(`  ↩️ Ya existe tarea en ${label} para RUT ${rut} (${cliente.razonSocial}), se omite.`);
                    continue;
                }
                console.log(`  ➕ Creando tarea (${label}) para RUT ${rut} (${cliente.razonSocial}) → trabajadorId: ${trabajadorId}`);
                await prisma.tareaAsignada.create({
                    data: {
                        tareaPlantillaId: plantilla.id_tarea_plantilla,
                        rutCliente: rut,
                        trabajadorId,
                        estado: client_1.EstadoTarea.PENDIENTE,
                        fechaProgramada,
                        comentarios: `Tarea ${tareaBase.nombre} para ${cliente.razonSocial} (${label}, seed A01)`,
                    },
                });
            }
        }
    }
    console.log("\n✅ Seed de tareas CONTA para cartera A01 (agente 7, dic 2025 + ene 2025 pruebas) completado.");
}
main()
    .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
