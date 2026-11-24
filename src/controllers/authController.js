import jwt from "jsonwebtoken";
import Usuario from "../models/userModel.js";
import { env } from "../../config/env.js";

// POST /api/auth/register
export async function registrar(req, res) {
    const { nombre, email, usuario, password } = req.body ?? {};
    const user = await Usuario.registrar({ nombre, email, usuario, password });
    res.status(201).json({ message: "Usuario registrado correctamente", user });
}

// POST /api/auth/login
export async function login(req, res) {
    const { usuario, password } = req.body ?? {};
    const user = await Usuario.login({ usuario, password });

    const token = jwt.sign({ id: user.id, usuario: user.usuario, email: user.email }, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
    });

    res.json({ message: "Login exitoso", token, user });
}
