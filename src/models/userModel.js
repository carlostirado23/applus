import bcrypt from "bcryptjs";
import prisma from "../../config/db.js";
import { ROLES } from "../utils/constantes.js";
import { badRequest, conflict, notFound, unauthorized } from "../utils/httpError.js";
import { normalizarTexto } from "../utils/texto.js";

// Campos que se devuelven al cliente (nunca el hash de la contraseña)
export const camposPublicos = {
    id: true,
    nombre: true,
    email: true,
    usuario: true,
    rol: true,
    activo: true,
    cedula: true,
    telefono: true,
    municipio: true,
    fecha_creacion: true,
};

// Campos mínimos de un técnico para listas desplegables y cruces
export const camposTecnico = { id: true, nombre: true, usuario: true, cedula: true, municipio: true, telefono: true, activo: true };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida y limpia los datos de un usuario. `parcial` = true permite omitir campos (edición). */
function validar(entrada = {}, parcial = false) {
    const data = {};
    const texto = (k) => (entrada[k] === undefined ? undefined : String(entrada[k] ?? "").trim());

    const nombre = texto("nombre");
    if (nombre !== undefined) {
        if (!nombre) throw badRequest("nombre es obligatorio");
        data.nombre = nombre;
    }
    const email = texto("email");
    if (email !== undefined) {
        if (!EMAIL.test(email)) throw badRequest("email inválido");
        data.email = email.toLowerCase();
    }
    const usuario = texto("usuario");
    if (usuario !== undefined) {
        if (!/^[a-zA-Z0-9._-]{3,80}$/.test(usuario)) {
            throw badRequest("usuario debe tener entre 3 y 80 caracteres (letras, números, punto, guion o guion bajo)");
        }
        data.usuario = usuario;
    }
    if (entrada.rol !== undefined) {
        const rol = String(entrada.rol).toUpperCase();
        if (!ROLES.includes(rol)) throw badRequest(`rol inválido. Valores: ${ROLES.join(", ")}`);
        data.rol = rol;
    }
    for (const campo of ["cedula", "telefono", "municipio"]) {
        const v = texto(campo);
        if (v !== undefined) data[campo] = v || null;
    }
    if (data.cedula && !/^[0-9A-Za-z-]{4,20}$/.test(data.cedula)) throw badRequest("cedula inválida");

    if (!parcial) {
        for (const k of ["nombre", "email", "usuario"]) {
            if (!data[k]) throw badRequest("nombre, email, usuario y password son obligatorios");
        }
    }
    return data;
}

function validarPassword(password) {
    if (!password || String(password).length < 8) throw badRequest("La contraseña debe tener al menos 8 caracteres");
    return bcrypt.hash(String(password), 10);
}

/** Lanza 409 si otro usuario ya usa el usuario, email o cédula. */
async function verificarUnicos(data, excluirId) {
    const or = [];
    if (data.usuario) or.push({ usuario: data.usuario });
    if (data.email) or.push({ email: data.email });
    if (data.cedula) or.push({ cedula: data.cedula });
    if (!or.length) return;
    const existe = await prisma.usuario.findFirst({
        where: { OR: or, ...(excluirId ? { NOT: { id: excluirId } } : {}) },
        select: { usuario: true, email: true, cedula: true },
    });
    if (!existe) return;
    if (data.usuario && existe.usuario === data.usuario) throw conflict("El usuario ya está registrado");
    if (data.email && existe.email === data.email) throw conflict("El email ya está registrado");
    throw conflict("La cédula ya está registrada");
}

const Usuario = {
    contar: () => prisma.usuario.count(),

    /** Crea un usuario. El rol lo decide quien llama (bootstrap → ADMIN; panel → lo que elija el admin). */
    async crear(entrada) {
        const data = validar(entrada);
        if (!data.rol) throw badRequest("rol es obligatorio");
        const password = await validarPassword(entrada.password);
        await verificarUnicos(data);
        return prisma.usuario.create({ data: { ...data, password }, select: camposPublicos });
    },

    /** Lista usuarios con filtros opcionales: rol, activo ("true"/"false"), q (nombre/usuario/email/cédula). */
    async listar({ rol, activo, q } = {}) {
        const where = {};
        if (rol) where.rol = String(rol).toUpperCase();
        if (activo === "true" || activo === true) where.activo = true;
        if (activo === "false" || activo === false) where.activo = false;
        const texto = String(q ?? "").trim();
        if (texto) {
            where.OR = ["nombre", "usuario", "email", "cedula", "municipio"].map((campo) => ({
                [campo]: { contains: texto, mode: "insensitive" },
            }));
        }
        return prisma.usuario.findMany({ where, select: camposPublicos, orderBy: [{ activo: "desc" }, { nombre: "asc" }] });
    },

    /** Técnicos (activos por defecto) para listas desplegables y cruces del Excel. */
    tecnicos({ incluirInactivos = false } = {}) {
        return prisma.usuario.findMany({
            where: { rol: "TECNICO", ...(incluirInactivos ? {} : { activo: true }) },
            select: camposTecnico,
            orderBy: { nombre: "asc" },
        });
    },

    async obtener(id) {
        const user = await prisma.usuario.findUnique({ where: { id }, select: camposPublicos });
        if (!user) throw notFound("Usuario no encontrado");
        return user;
    },

    /** Edita datos (no la contraseña). `actor` = quien edita; no puede quitarse su propio rol ADMIN. */
    async actualizar(id, entrada, actor) {
        const data = validar(entrada, true);
        if (!Object.keys(data).length) throw badRequest("No se enviaron campos para actualizar");
        if (actor?.id === id && data.rol && data.rol !== "ADMIN") throw badRequest("No puedes quitarte el rol de administrador");
        await Usuario.obtener(id);
        await verificarUnicos(data, id);
        return prisma.usuario.update({ where: { id }, data, select: camposPublicos });
    },

    async cambiarActivo(id, activo, actor) {
        if (typeof activo !== "boolean") throw badRequest("activo debe ser true o false");
        if (actor?.id === id && !activo) throw badRequest("No puedes desactivar tu propio usuario");
        await Usuario.obtener(id);
        return prisma.usuario.update({ where: { id }, data: { activo }, select: camposPublicos });
    },

    /** Reemplaza la contraseña (reset por admin o cambio propio ya verificado). */
    async cambiarPassword(id, password) {
        const hash = await validarPassword(password);
        await Usuario.obtener(id);
        await prisma.usuario.update({ where: { id }, data: { password: hash } });
    },

    /** Cambio de contraseña por el propio usuario: exige la actual. */
    async cambiarPasswordPropia(id, actual, nueva) {
        const user = await prisma.usuario.findUnique({ where: { id }, select: { password: true } });
        if (!user) throw notFound("Usuario no encontrado");
        if (!actual || !(await bcrypt.compare(String(actual), user.password))) throw unauthorized("La contraseña actual no es correcta");
        if (String(actual) === String(nueva)) throw badRequest("La contraseña nueva debe ser distinta a la actual");
        await Usuario.cambiarPassword(id, nueva);
    },

    async login({ usuario, password }) {
        if (!usuario || !password) throw badRequest("usuario y password son obligatorios");

        const user = await prisma.usuario.findUnique({ where: { usuario: String(usuario).trim() } });
        if (!user) throw unauthorized("Usuario o password incorrectos");

        const valido = await bcrypt.compare(String(password), user.password);
        if (!valido) throw unauthorized("Usuario o password incorrectos");
        if (!user.activo) throw unauthorized("Usuario inactivo. Contacta al administrador");

        const { password: _omitido, ...publico } = user;
        return publico;
    },

    /**
     * Mapa para cruzar el texto ASIGNADO_A del Excel con un técnico.
     * Claves normalizadas: usuario, cédula y nombre completo. Devuelve { buscar(texto) -> tecnico | null }.
     */
    async indiceTecnicos() {
        const lista = await Usuario.tecnicos();
        const mapa = new Map();
        for (const t of lista) {
            for (const clave of [t.usuario, t.cedula, t.nombre]) {
                const k = normalizarTexto(clave);
                if (k && !mapa.has(k)) mapa.set(k, t);
            }
        }
        return {
            total: lista.length,
            buscar: (texto) => mapa.get(normalizarTexto(texto)) ?? null,
        };
    },
};

export default Usuario;
