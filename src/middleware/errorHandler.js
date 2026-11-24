import { env } from "../../config/env.js";
import { HttpError } from "../utils/httpError.js";

// 404 para rutas que no existen
export function notFoundHandler(req, res) {
    res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// Manejador central de errores. Express 5 envía aquí cualquier promesa rechazada en un handler.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
    let status = 500;
    let message = "Error interno del servidor";
    let detalles;

    if (err instanceof HttpError) {
        status = err.status;
        message = err.message;
        detalles = err.detalles;
    } else if (err?.code === "P2002") {
        // Prisma: violación de restricción única
        status = 409;
        message = "Ya existe un registro con ese valor único";
        detalles = err.meta?.target;
    } else if (err?.code === "P2025") {
        // Prisma: registro no encontrado
        status = 404;
        message = "Registro no encontrado";
    } else if (err?.name === "MulterError") {
        status = 400;
        message = err.code === "LIMIT_FILE_SIZE" ? "El archivo supera el tamaño máximo permitido (10 MB)" : `Error al recibir el archivo: ${err.message}`;
    } else if (err?.type === "entity.parse.failed") {
        status = 400;
        message = "El cuerpo de la petición no es un JSON válido";
    }

    if (status >= 500) console.error("[error]", err);

    const body = { message };
    if (detalles !== undefined) body.detalles = detalles;
    // En desarrollo exponemos el mensaje real para depurar; en producción no.
    if (status >= 500 && env.NODE_ENV !== "production") body.error = err?.message;

    res.status(status).json(body);
}
