import jwt from "jsonwebtoken";
import Usuario from "../models/userModel.js";
import { env } from "../../config/env.js";
import { forbidden } from "../utils/httpError.js";

const firmarToken = (user) =>
    jwt.sign({ id: user.id, usuario: user.usuario, rol: user.rol }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

// POST /api/auth/register
// Solo sirve para crear el PRIMER usuario (administrador). Después, los usuarios los crea un ADMIN en /api/usuarios.
export async function registrar(req, res) {
    if ((await Usuario.contar()) > 0) {
        throw forbidden("El registro público está cerrado. Pide al administrador que cree tu usuario");
    }
    const { nombre, email, usuario, password } = req.body ?? {};
    const user = await Usuario.crear({ nombre, email, usuario, password, rol: "ADMIN" });
    res.status(201).json({ message: "Administrador creado correctamente", user });
}

// POST /api/auth/login
export async function login(req, res) {
    const { usuario, password } = req.body ?? {};
    const user = await Usuario.login({ usuario, password });
    res.json({ message: "Login exitoso", token: firmarToken(user), user });
}

// GET /api/auth/me
export async function me(req, res) {
    const user = await Usuario.obtener(req.user.id);
    res.json(user);
}

// PUT /api/auth/password   body: { password_actual, password_nueva }
export async function cambiarPassword(req, res) {
    const { password_actual, password_nueva } = req.body ?? {};
    await Usuario.cambiarPasswordPropia(req.user.id, password_actual, password_nueva);
    res.json({ message: "Contraseña actualizada correctamente" });
}
