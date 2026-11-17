"use strict";
// src/lib/anthropic.ts
//
// Cliente compartido de Anthropic.
//
// Vive aca y no dentro de un modulo porque ya son dos los que llaman a la IA:
// el asistente (chat y borradores de ticket) y los informes semanales. Tener
// el cliente y el nombre del modelo en un solo lugar evita que uno quede
// apuntando a un modelo distinto del otro sin que nadie se entere.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IANoConfiguradaError = exports.MODELO_IA = void 0;
exports.getClienteAnthropic = getClienteAnthropic;
exports.mensajeDeErrorIA = mensajeDeErrorIA;
exports.textoDeRespuesta = textoDeRespuesta;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
/** Modelo para todo lo que use IA. Se cambia con ANTHROPIC_MODEL en el .env. */
exports.MODELO_IA = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
class IANoConfiguradaError extends Error {
    constructor() {
        super("Falta ANTHROPIC_API_KEY en el entorno");
        this.name = "IANoConfiguradaError";
    }
}
exports.IANoConfiguradaError = IANoConfiguradaError;
let cliente = null;
/**
 * Devuelve el cliente, creandolo la primera vez.
 *
 * `new Anthropic()` sin argumentos lee ANTHROPIC_API_KEY del entorno. Se
 * comprueba antes para dar un error entendible en vez del que lanza el SDK.
 */
function getClienteAnthropic() {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new IANoConfiguradaError();
    }
    if (!cliente) {
        cliente = new sdk_1.default();
    }
    return cliente;
}
/**
 * Errores de la API que significan "se acabo la plata".
 *
 * Anthropic no tiene un codigo propio para esto: llega como un 400 con el
 * motivo en el texto. Por eso se busca por contenido y no por status, y por
 * eso el patron es amplio: si el texto cambia y deja de calzar, el usuario
 * vuelve a ver el mensaje generico, que es lo que veia antes. No se rompe
 * nada, solo se pierde la pista.
 */
const SIN_CREDITO = /credit balance|insufficient (funds|credit)|billing/i;
/**
 * Traduce un error del SDK a algo que se pueda mostrar en pantalla.
 *
 * Devuelve `null` si el error no es uno de los conocidos: quien llama decide
 * que hacer con eso (normalmente registrarlo y mostrar un mensaje generico).
 *
 * Existe porque "Error al consultar el asistente" es un callejon sin salida.
 * De los casos de abajo, dos se arreglan en la consola de Anthropic y no en
 * el codigo, asi que si no se nombran, el problema se va a buscar al lugar
 * equivocado.
 *
 * Esta en `lib` y no en el modulo del asistente porque los informes
 * semanales llaman a la misma API y se quedan sin credito el mismo dia.
 */
function mensajeDeErrorIA(err) {
    // "La IA" y no "el asistente": este mismo texto lo muestra la pantalla de
    // informes semanales, donde hablar del asistente confundiria.
    if (err instanceof IANoConfiguradaError) {
        return "La IA no esta configurada en el servidor.";
    }
    // Del mas especifico al mas general: RateLimitError y BadRequestError son
    // los dos subclases de APIError, asi que el orden importa.
    if (err instanceof sdk_1.default.AuthenticationError) {
        return "La credencial del asistente no es valida. Avisa a soporte.";
    }
    if (err instanceof sdk_1.default.RateLimitError) {
        return "El asistente esta recibiendo muchas consultas. Intenta en unos minutos.";
    }
    if (err instanceof sdk_1.default.APIError && SIN_CREDITO.test(err.message)) {
        return "El asistente se quedo sin credito. Hay que recargar la cuenta de Anthropic.";
    }
    return null;
}
/** Junta los bloques de texto de una respuesta en un solo string. */
function textoDeRespuesta(respuesta) {
    return respuesta.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
}
//# sourceMappingURL=anthropic.js.map