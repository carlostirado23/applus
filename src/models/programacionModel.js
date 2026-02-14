const pool = require("../../config/config");

const Programacion = {
    // Obtener todas las programaciones
    getAll: async () => {
        const result = await pool.query(
            `SELECT id, numero_os, asignado_a, fecha_estimada_resolucion, nic, nombre, direccion, barrio, municipio, formulario, creado_por, insertar, validacion, fecha_creacion, fecha_actualizacion
             FROM programacion.programaciones`,
        );
        return result.rows;
    },

    // Crear una nueva programación
    create: async (data) => {
        const {
            numero_os,
            asignado_a,
            fecha_estimada_resolucion,
            nic,
            nombre,
            direccion,
            barrio,
            municipio,
            formulario,
            creado_por,
            validacion,
        } = data;

        // Verificar si ya existe el numero_os
        const existe = await pool.query("SELECT 1 FROM programacion.programaciones WHERE numero_os = $1", [numero_os]);

        // Si existe, insertar con insertar: false, si no, insertar: true
        const insertar = existe.rows.length > 0 ? false : true;

        const result = await pool.query(
            `INSERT INTO programacion.programaciones
            (numero_os, asignado_a, fecha_estimada_resolucion, nic, nombre, direccion, barrio, municipio, formulario, creado_por, insertar, validacion)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING id, numero_os, asignado_a, fecha_estimada_resolucion, nic, nombre, direccion, barrio, municipio, formulario, creado_por, insertar, validacion, fecha_creacion, fecha_actualizacion`,
            [
                numero_os,
                asignado_a,
                fecha_estimada_resolucion,
                nic,
                nombre,
                direccion,
                barrio,
                municipio,
                formulario || "AFINIA",
                creado_por,
                insertar,
                validacion || "PENDIENTE",
            ],
        );
        return result.rows[0];
    },
};

module.exports = Programacion;
