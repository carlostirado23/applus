import Usuario from "../models/userModel.js";
import { badRequest } from "../utils/httpError.js";
import { aEnteroPositivo } from "../utils/texto.js";

const idDeRuta = (req) => {
    const id = aEnteroPositivo(req.params.id);
    if (!id) throw badRequest("id inválido");
    return id;
};

// GET /api/usuarios?rol=&activo=&q=
export async function listar(req, res) {
    const { rol, activo, q } = req.query;
    res.json(await Usuario.listar({ rol, activo, q }));
}

// GET /api/usuarios/tecnicos?inactivos=true
export async function tecnicos(req, res) {
    res.json(await Usuario.tecnicos({ incluirInactivos: req.query.inactivos === "true" }));
}

// GET /api/usuarios/:id
export async function obtener(req, res) {
    res.json(await Usuario.obtener(idDeRuta(req)));
}

// POST /api/usuarios   body: { nombre, email, usuario, password, rol, cedula?, telefono?, municipio? }
export async function crear(req, res) {
    const user = await Usuario.crear(req.body ?? {});
    res.status(201).json({ message: "Usuario creado correctamente", user });
}

// PUT /api/usuarios/:id   body: campos a cambiar (sin password)
export async function actualizar(req, res) {
    const user = await Usuario.actualizar(idDeRuta(req), req.body ?? {}, req.user);
    res.json({ message: "Usuario actualizado correctamente", user });
}

// PATCH /api/usuarios/:id/activo   body: { activo: true|false }
export async function cambiarActivo(req, res) {
    const user = await Usuario.cambiarActivo(idDeRuta(req), req.body?.activo, req.user);
    res.json({ message: user.activo ? "Usuario activado" : "Usuario desactivado", user });
}

// POST /api/usuarios/:id/password   body: { password }
export async function resetPassword(req, res) {
    await Usuario.cambiarPassword(idDeRuta(req), req.body?.password);
    res.json({ message: "Contraseña restablecida correctamente" });
}
