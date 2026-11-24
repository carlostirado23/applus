import bcrypt from "bcryptjs";
import prisma from "../../config/db.js";
import { badRequest, conflict, unauthorized } from "../utils/httpError.js";

// Campos que se devuelven al cliente (nunca el hash de la contraseña)
const camposPublicos = { id: true, nombre: true, email: true, usuario: true, fecha_creacion: true };

const Usuario = {
    async registrar({ nombre, email, usuario, password }) {
        if (!nombre || !email || !usuario || !password) {
            throw badRequest("nombre, email, usuario y password son obligatorios");
        }
        if (String(password).length < 8) {
            throw badRequest("La contraseña debe tener al menos 8 caracteres");
        }

        const existe = await prisma.usuario.findFirst({
            where: { OR: [{ usuario }, { email }] },
            select: { id: true },
        });
        if (existe) throw conflict("El usuario o email ya está registrado");

        const hash = await bcrypt.hash(password, 10);

        return prisma.usuario.create({
            data: { nombre, email: email.toLowerCase().trim(), usuario: usuario.trim(), password: hash },
            select: camposPublicos,
        });
    },

    async login({ usuario, password }) {
        if (!usuario || !password) throw badRequest("usuario y password son obligatorios");

        const user = await prisma.usuario.findUnique({ where: { usuario } });
        if (!user) throw unauthorized("Usuario o password incorrectos");

        const valido = await bcrypt.compare(password, user.password);
        if (!valido) throw unauthorized("Usuario o password incorrectos");

        const { password: _omitido, ...publico } = user;
        return publico;
    },
};

export default Usuario;
