"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normNombrePlantilla = normNombrePlantilla;
function normNombrePlantilla(nombre) {
    return String(nombre ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // quita tildes
}
