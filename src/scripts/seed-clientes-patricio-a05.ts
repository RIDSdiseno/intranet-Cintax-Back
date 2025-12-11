// src/scripts/seed-clientes-patricio-a05.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 🔹 Patricio (CONTA/A05)
const PATRICIO_TRABAJADOR_ID = 10;

type ClienteInput = {
  rut: string;
  razonSocial: string;
  alias?: string | null;
};

const clientesPatricio: ClienteInput[] = [
  {
    rut: "77.998.275-0",
    razonSocial:
      "ASESORIAS, SUSTENTABILIDAD INTEGRAL Y COMUNIDADES SEBASTIAN HERRERA KASIC E.I.R.L.",
  },
  {
    rut: "76.959.873-1",
    razonSocial: "INVERSIONES CHACON MOLER SPA",
  },
  {
    rut: "76.484.811-K",
    razonSocial: "SERVICIOS DE ENFERMERÍA ASISTENCIAL CMCD SPA",
  },
  {
    rut: "12.485.925-5",
    razonSocial: "FERNANDO JAVIER CARDENAS RIBBA",
  },
  {
    rut: "76.912.587-6",
    razonSocial: "SERVICIO AUTOMOTRIZ JM SPA",
  },
  {
    rut: "76.290.398-9",
    razonSocial: "MIDE SERVICIOS DE INGENIERÍA DE TRÁNSITO LIMITADA",
  },
  {
    rut: "76.111.716-5",
    razonSocial: "SOCIEDAD DE INVERSIONES TRIPLE ZETA LIMITADA",
  },
  {
    rut: "76.386.102-3",
    razonSocial: "SOCIEDAD COMERCIALIZADORA Y PUBLICITARIA AYALA SPA",
  },
  {
    rut: "77.414.282-7",
    razonSocial: "INVERSIONES LOS PLAYEROS SPA",
  },
  {
    rut: "77.926.595-1",
    razonSocial: "OPTIFEED SPA",
  },
  {
    rut: "79.505.530-4",
    razonSocial: "PRODUCTORA DE SEGUROS ACONCAGUA SPA",
  },
  {
    rut: "77.782.076-1",
    razonSocial: "KINEPLUS",
  },
  {
    rut: "77.996.996-7",
    razonSocial: "FULLGRAF SPA",
  },
  {
    rut: "21.934.769-3",
    razonSocial: "KELLY MARTINEZ",
  },
  {
    rut: "78.215.394-3",
    razonSocial: "COMERCIAL HOREK SPA",
  },
  {
    rut: "76.623.964-1",
    razonSocial: "INVERSIONES CARMEN FAUNDEZ LINARES EIRL",
  },
  {
    rut: "76.798.252-6",
    razonSocial:
      "CENTRO DE BELLEZA INTEGRAL CECILIA TREJO SALINAS EIRL",
  },
  // Holding Gillbrand
  {
    rut: "76.366.682-4",
    razonSocial: "GILLTAM SPA",
    alias: "Holding Gillbrand",
  },
  {
    rut: "77.597.691-8",
    razonSocial: "GILLIBRAND DIGITAL SPA",
    alias: "Holding Gillbrand",
  },
  {
    rut: "77.750.319-7",
    razonSocial: "GILLIBRAND IMPORTACIONES SPA",
    alias: "Holding Gillbrand",
  },
  {
    rut: "77.203.453-9",
    razonSocial: "SERVICIOS ACUICOLAS RIO ROSSELOT SPA",
  },
  {
    rut: "77.538.963-K",
    razonSocial: "KENTHA SERVICIOS SPA",
  },
  {
    rut: "76.684.645-9",
    razonSocial: "IMPRECORP SPA",
  },
];

async function main() {
  console.log("🔹 Insertando clientes de Patricio (CONTA/A05)...");

  for (const c of clientesPatricio) {
    try {
      // Buscar por combinación rut + razonSocial (soporta esquema con @@unique([rut, razonSocial]))
      const existente = await prisma.cliente.findFirst({
        where: {
          rut: c.rut,
          razonSocial: c.razonSocial,
        },
      });

      if (existente) {
        await prisma.cliente.update({
          where: { id: existente.id },
          data: {
            alias: c.alias ?? null,
            agenteId: PATRICIO_TRABAJADOR_ID,
            codigoCartera: "CONTA/A05",
            activo: true,
          },
        });
        console.log(`🔁 Actualizado: ${c.rut} - ${c.razonSocial}`);
      } else {
        await prisma.cliente.create({
          data: {
            rut: c.rut,
            razonSocial: c.razonSocial,
            alias: c.alias ?? null,
            agenteId: PATRICIO_TRABAJADOR_ID,
            codigoCartera: "CONTA/A05",
            activo: true,
          },
        });
        console.log(`✅ Creado: ${c.rut} - ${c.razonSocial}`);
      }
    } catch (e: any) {
      console.error(
        `❌ Error con ${c.rut} - ${c.razonSocial}:`,
        e?.message ?? e
      );
    }
  }

  console.log("🏁 Seed de clientes de Patricio A05 terminado.");
}

main()
  .catch((e) => {
    console.error("❌ Error general del script:", e);
    process.exit(1);
  })
  .finally(async () => {
    prisma.$disconnect();
  });
