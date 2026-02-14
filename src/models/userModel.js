const pool = require("../../config/config");
const bcrypt = require("bcryptjs");

// Modelo de usuario
const Usuario = {
    registrar: async ({ nombre, email, usuario, password }) => {
        // Verificar si ya existe el usuario
        const existe = await pool.query("SELECT * FROM seguridad.usuarios WHERE usuario = $1 OR email = $2", [
            usuario,
            email,
        ]);
        if (existe.rows.length > 0) throw new Error("El usuario o email ya está registrado");

        // Encriptar password
        const hash = await bcrypt.hash(password, 10);

        // Insertar usuario
        const result = await pool.query(
            "INSERT INTO seguridad.usuarios (nombre, email, usuario, password) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, usuario, fecha_creacion",
            [nombre, email, usuario, hash],
        );
        return result.rows[0];
    },

    login: async ({ usuario, password }) => {
        // Buscar usuario por nombre de usuario
        const result = await pool.query("SELECT * FROM seguridad.usuarios WHERE usuario = $1", [usuario]);
        if (result.rows.length === 0) throw new Error("Usuario o password incorrectos");

        const user = result.rows[0];

        // Comparar contraseñas
        const valido = await bcrypt.compare(password, user.password);
        if (!valido) throw new Error("Usuario o password incorrectos");

        return {
            id: user.id,
            nombre: user.nombre,
            email: user.email,
            usuario: user.usuario,
            fecha_creacion: user.fecha_creacion,
        };
    },
};

module.exports = Usuario;
