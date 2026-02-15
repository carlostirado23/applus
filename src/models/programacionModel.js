const pool = require("../../config/config");

const Programacion = {
    // Obtener todas las programaciones
    getAll: async (fecha_inicial, fecha_final) => {
        let query = `
        SELECT id, numero_os, asignado_a, fecha_estimada_resolucion, nic, nombre, direccion, barrio, municipio, formulario, creado_por, insertar, validacion, fecha_creacion, fecha_actualizacion, estado
        FROM programacion.programaciones
    `;
        const params = [];
        if (fecha_inicial && fecha_final) {
            query += " WHERE fecha_creacion BETWEEN $1 AND $2";
            params.push(fecha_inicial, fecha_final);
        }
        const result = await pool.query(query, params);
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

    publicar: async function (id) {
        const result = await pool.query(
            "UPDATE programacion.programaciones SET validacion = 'publicado' WHERE id = $1 RETURNING *",
            [id],
        );
        return result.rows[0];
    },
};

module.exports = Programacion;
