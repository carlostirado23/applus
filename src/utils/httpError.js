// Error con código HTTP para que el errorHandler responda con el status correcto.
export class HttpError extends Error {
    constructor(status, message, detalles) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        if (detalles !== undefined) this.detalles = detalles;
    }
}

export const badRequest = (msg, detalles) => new HttpError(400, msg, detalles);
export const unauthorized = (msg = "No autorizado") => new HttpError(401, msg);
export const forbidden = (msg = "No tienes permiso para esta acción") => new HttpError(403, msg);
export const notFound = (msg = "Recurso no encontrado") => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);
