import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { unauthorized } from "../utils/httpError.js";

// Exige un header "Authorization: Bearer <token>" y deja el payload en req.user
export default function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const [esquema, token] = authHeader.split(" ");

    if (esquema !== "Bearer" || !token) {
        return next(unauthorized("Token requerido. Usa el header Authorization: Bearer <token>"));
    }

    try {
        req.user = jwt.verify(token, env.JWT_SECRET);
        next();
    } catch {
        next(unauthorized("Token inválido o expirado"));
    }
}
