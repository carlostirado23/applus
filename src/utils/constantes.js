// Valores de los enums de Prisma, para validar entradas sin importar el cliente generado.

export const ROLES = ["ADMIN", "SUPERVISOR", "TECNICO"];

export const ESTADOS_VALIDACION = ["PENDIENTE", "PUBLICADO"];

export const ESTADOS_EJECUCION = ["SIN_RESULTADO", "EJECUTADA", "NO_EJECUTADA", "REPROGRAMADA"];

// Textos aceptados en el Excel de resultados -> estado. Claves normalizadas (ver claveHeader).
export const ALIAS_ESTADO_EJECUCION = {
    EJECUTADA: "EJECUTADA",
    EJECUTADO: "EJECUTADA",
    REALIZADA: "EJECUTADA",
    OK: "EJECUTADA",
    SI: "EJECUTADA",
    NOEJECUTADA: "NO_EJECUTADA",
    NOEJECUTADO: "NO_EJECUTADA",
    NOREALIZADA: "NO_EJECUTADA",
    FALLIDA: "NO_EJECUTADA",
    NO: "NO_EJECUTADA",
    REPROGRAMADA: "REPROGRAMADA",
    REPROGRAMADO: "REPROGRAMADA",
    REPROGRAMAR: "REPROGRAMADA",
    SINRESULTADO: "SIN_RESULTADO",
    PENDIENTE: "SIN_RESULTADO",
};
