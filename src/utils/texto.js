// Helpers de texto compartidos por modelos y controladores.

/** Minúsculas, sin tildes, espacios colapsados. Para comparar nombres/encabezados sin importar cómo se escribieron. */
export function normalizarTexto(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

/** Igual que normalizarTexto pero en mayúsculas y sin espacios. Para encabezados de Excel. */
export const claveHeader = (h) => normalizarTexto(h).toUpperCase().replace(/[\s_-]+/g, "");

/** Convierte "a,b" o ["a","b"] en arreglo de strings limpios. */
export function aLista(valor) {
    if (Array.isArray(valor)) return valor.map((v) => String(v).trim()).filter(Boolean);
    return String(valor ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
}

/** Entero positivo o null. */
export function aEnteroPositivo(valor) {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
}
