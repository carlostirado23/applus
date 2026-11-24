import jwt from "jsonwebtoken";
import prisma from "../../config/db.js";
import { env } from "../../config/env.js";
import { forbidden, unauthorized } from "../utils/httpError.js";

/**
 * Exige "Authorization: Bearer <token>" y deja en req.user los datos del usuario.
 * El rol y el estado activo se leen de la BD en cada petición: desactivar un usuario
 * o cambiarle el rol aplica de inmediato, sin esperar a que expire el token.
 */
export default async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const [esquema, token] = authHeader.split(" ");

    if (esquema !== "Bearer" || !token) {
        return next(unauthorized("Token requerido. Usa el header Authorization: Bearer <token>"));
    }

    let payload;
    try {
        payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
        return next(unauthorized("Token inválido o expirado"));
    }

    const user = await prisma.usuario.findUnique({
        where: { id: Number(payload.id) || 0 },
        select: { id: true, nombre: true, email: true, usuario: true, rol: true, activo: true },
    });
    if (!user) return next(unauthorized("El usuario del token ya no existe"));
    if (!user.activo) return next(unauthorized("Usuario inactivo. Contacta al administrador"));

    req.user = user;
    next();
}

/** Permite el paso solo a los roles indicados. Usar después de authMiddleware. */
export function requireRol(...roles) {
    return (req, res, next) => {
        if (!req.user) return next(unauthorized());
        if (!roles.includes(req.user.rol)) return next(forbidden(`Acción reservada para: ${roles.join(", ")}`));
        next();
    };
}

// Atajos de uso frecuente
export const soloAdmin = requireRol("ADMIN");
export const soloPanel = requireRol("ADMIN", "SUPERVISOR"); // área administrativa
export const soloTecnico = requireRol("TECNICO");
