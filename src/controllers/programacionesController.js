import { env } from "../../config/env.js";
import Programacion, { aTexto, hoyLocal, normalizar } from "../models/programacionModel.js";
import Usuario from "../models/userModel.js";
import { ALIAS_ESTADO_EJECUCION, ESTADOS_EJECUCION } from "../utils/constantes.js";
import { celdaFecha, crearLibro, leerFilas, responderXlsx, subirXlsx } from "../utils/excel.js";
import { badRequest } from "../utils/httpError.js";
import { aEnteroPositivo, claveHeader } from "../utils/texto.js";

// Columnas de la plantilla de carga: encabezado visible -> campo en BD
const COLUMNAS_PLANTILLA = [
    { header: "SERVICEORDER", key: "numero_os", width: 20, alias: ["NUMERO_OS", "OS"] },
    { header: "ASIGNADO_A", key: "asignado_a", width: 20, alias: ["TECNICO", "ASIGNADO"] },
    { header: "F_EST_RESOL", key: "fecha_estimada_resolucion", width: 20, alias: ["FECHA_ESTIMADA", "FECHA"] },
    { header: "NIC", key: "nic", width: 15 },
    { header: "NOMBRE", key: "nombre", width: 25, alias: ["CLIENTE"] },
    { header: "DIRECCIÓN", key: "direccion", width: 30 },
    { header: "BARRIO", key: "barrio", width: 20 },
    { header: "MUNICIPIO", key: "municipio", width: 20 },
];

// Columnas del Excel de exportación/resultados. Las primeras son informativas; las últimas las llena el área administrativa.
const COLUMNAS_EXPORT = [
    { header: "ID", key: "id", width: 8 },
    { header: "SERVICEORDER", key: "numero_os", width: 20 },
    { header: "NIC", key: "nic", width: 15 },
    { header: "NOMBRE", key: "nombre", width: 25 },
    { header: "DIRECCIÓN", key: "direccion", width: 30 },
    { header: "BARRIO", key: "barrio", width: 20 },
    { header: "MUNICIPIO", key: "municipio", width: 20 },
    { header: "TECNICO", key: "tecnico", width: 22 },
    { header: "USUARIO_TECNICO", key: "usuario_tecnico", width: 18 },
    { header: "F_EST_RESOL", key: "fecha_estimada_resolucion", width: 14 },
    { header: "FECHA_PUBLICACION", key: "fecha_publicacion", width: 20 },
    { header: "VISTA_POR_TECNICO", key: "vista", width: 18 },
    { header: "ESTADO_EJECUCION", key: "estado_ejecucion", width: 20 },
    { header: "FECHA_EJECUCION", key: "fecha_ejecucion", width: 16 },
    { header: "OBSERVACIONES", key: "observaciones", width: 40 },
];

// Columnas que se leen del Excel de resultados
const COLUMNAS_RESULTADOS = [
    { header: "ID", key: "id" },
    { header: "SERVICEORDER", key: "numero_os", alias: ["NUMERO_OS", "OS"] },
    { header: "ESTADO_EJECUCION", key: "estado_ejecucion", alias: ["ESTADO", "RESULTADO", "EJECUTADA"] },
    { header: "FECHA_EJECUCION", key: "fecha_ejecucion", alias: ["FECHA_EJEC", "FECHA_RESULTADO"] },
    { header: "OBSERVACIONES", key: "observaciones", alias: ["OBSERVACION", "COMENTARIOS", "NOVEDAD"] },
];

const idDeRuta = (req) => {
    const id = aEnteroPositivo(req.params.id);
    if (!id) throw badRequest("id inválido");
    return id;
};

/** Arreglo de ids únicos y válidos a partir de body.ids. */
function idsDelBody(body) {
    const { ids } = body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) throw badRequest("No se enviaron programaciones");
    const idsNum = ids.map(Number);
    if (idsNum.some((n) => !Number.isInteger(n) || n <= 0)) throw badRequest("ids debe ser un arreglo de enteros positivos");
    return [...new Set(idsNum)];
}

// GET /api/programaciones?fecha_inicial&fecha_final&validacion&estado_ejecucion&tecnico_id&municipio&q&page&limit
export async function getAll(req, res) {
    res.json(await Programacion.getAll(req.query));
}

// GET /api/programaciones/:id
export async function obtener(req, res) {
    res.json(await Programacion.obtener(idDeRuta(req)));
}

// GET /api/programaciones/descargar-plantilla
export async function descargarPlantilla(req, res) {
    const workbook = crearLibro("Programaciones", COLUMNAS_PLANTILLA);
    await responderXlsx(req, res, workbook, "plantilla_programaciones.xlsx");
}

// POST /api/programaciones/cargar-excel  (multipart/form-data, campo "file")
export const uploadExcel = [
    subirXlsx.single("file"),
    async (req, res) => {
        if (!req.file) throw badRequest('No se recibió ningún archivo. Envía el .xlsx en el campo "file"');

        const { filas: crudas } = await leerFilas(req.file.buffer, COLUMNAS_PLANTILLA);
        if (!crudas.length) throw badRequest("El archivo no tiene filas con datos");

        // Cruce de ASIGNADO_A con los técnicos activos (usuario, cédula o nombre)
        const tecnicos = await Usuario.indiceTecnicos();
        const creado_por = req.user.usuario;
        const filas = crudas.map((crudo) => {
            const data = normalizar(crudo, creado_por, ` (fila ${crudo._fila})`);
            const tecnico = data.asignado_a ? tecnicos.buscar(data.asignado_a) : null;
            if (tecnico) data.tecnico_id = tecnico.id;
            return data;
        });

        const resultados = await Programacion.createMany(filas);
        const duplicados = resultados.filter((r) => !r.insertar).length;
        const sin_tecnico = resultados.filter((r) => r.insertar && !r.tecnico_id).length;

        res.status(201).json({
            message: "Programaciones cargadas correctamente",
            total: resultados.length,
            nuevas: resultados.length - duplicados,
            duplicados,
            sin_tecnico,
            resultados,
        });
    },
];

// POST /api/programaciones
export async function create(req, res) {
    const data = normalizar(req.body ?? {}, req.user.usuario);
    if (!data.tecnico_id && data.asignado_a) {
        const tecnico = (await Usuario.indiceTecnicos()).buscar(data.asignado_a);
        if (tecnico) data.tecnico_id = tecnico.id;
    }
    const programacion = await Programacion.create(data);
    res.status(201).json({ message: "Programación creada correctamente", programacion });
}

// PATCH /api/programaciones/:id   body: { tecnico_id?, asignado_a?, nombre?, direccion?, barrio?, municipio?, nic?, fecha_estimada_resolucion? }
export async function actualizar(req, res) {
    const programacion = await Programacion.actualizar(idDeRuta(req), req.body ?? {});
    res.json({ message: "Programación actualizada correctamente", programacion });
}

// DELETE /api/programaciones/:id
export async function eliminar(req, res) {
    const { eliminadas, omitidas } = await Programacion.eliminar([idDeRuta(req)]);
    if (!eliminadas.length) throw badRequest(omitidas[0]?.motivo ?? "No se pudo eliminar");
    res.json({ message: "Programación eliminada", eliminadas });
}

// POST /api/programaciones/eliminar   body: { ids: [...] }
export async function eliminarVarias(req, res) {
    const { eliminadas, omitidas } = await Programacion.eliminar(idsDelBody(req.body));
    if (!eliminadas.length) throw badRequest("Ninguna de las programaciones seleccionadas se puede eliminar", omitidas);
    const message = omitidas.length ? `Se eliminaron ${eliminadas.length}; ${omitidas.length} omitida(s)` : `Se eliminaron ${eliminadas.length} programación(es)`;
    res.json({ message, total: eliminadas.length, eliminadas, omitidas });
}

// POST /api/programaciones/publicar   body: { ids: [1, 2, 3] }
export async function publicar(req, res) {
    const { resultados, omitidas } = await Programacion.publicar(idsDelBody(req.body), req.user.usuario);

    if (resultados.length === 0) {
        throw badRequest("Ninguna de las programaciones seleccionadas se puede publicar", omitidas);
    }

    const message =
        omitidas.length === 0
            ? "Programaciones publicadas correctamente"
            : `Se publicaron ${resultados.length}; ${omitidas.length} omitida(s) (duplicadas, sin técnico, inexistentes o ya publicadas)`;

    res.json({ message, total: resultados.length, omitidas, resultados });
}

// GET /api/programaciones/exportar?fecha_inicial&fecha_final&campo_fecha&tecnico_id&municipio&estado_ejecucion&validacion&formato=archivo
// Por defecto exporta las PUBLICADAS. Sirve tanto para el histórico como para el Excel de resultados que luego se vuelve a cargar.
export async function exportar(req, res) {
    const filtros = { validacion: "PUBLICADO", ...req.query };
    const lista = await Programacion.exportar(filtros);

    const filas = lista.map((p) => ({
        id: p.id,
        numero_os: p.numero_os,
        nic: p.nic,
        nombre: p.nombre,
        direccion: p.direccion,
        barrio: p.barrio,
        municipio: p.municipio,
        tecnico: p.tecnico?.nombre ?? p.asignado_a ?? null,
        usuario_tecnico: p.tecnico?.usuario ?? null,
        fecha_estimada_resolucion: celdaFecha(p.fecha_estimada_resolucion),
        // Excel no maneja zonas horarias: se desplaza el instante para que la celda muestre la hora local
        fecha_publicacion: p.fecha_publicacion ? new Date(p.fecha_publicacion.getTime() + env.UTC_OFFSET_MINUTES * 60_000) : null,
        vista: p.fecha_vista ? "SI" : "NO",
        estado_ejecucion: p.estado_ejecucion === "SIN_RESULTADO" ? null : p.estado_ejecucion,
        fecha_ejecucion: celdaFecha(p.fecha_ejecucion),
        observaciones: p.observaciones,
    }));

    const workbook = crearLibro("Programaciones", COLUMNAS_EXPORT, filas);
    const ws = workbook.worksheets[0];
    ws.getColumn("fecha_estimada_resolucion").numFmt = "dd/mm/yyyy";
    ws.getColumn("fecha_ejecucion").numFmt = "dd/mm/yyyy";
    ws.getColumn("fecha_publicacion").numFmt = "dd/mm/yyyy hh:mm";
    // Lista desplegable con los estados válidos en la columna de resultado
    const colEstado = COLUMNAS_EXPORT.findIndex((c) => c.key === "estado_ejecucion") + 1;
    for (let r = 2; r <= Math.max(filas.length + 1, 2); r++) {
        ws.getCell(r, colEstado).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`"${ESTADOS_EJECUCION.filter((e) => e !== "SIN_RESULTADO").join(",")}"`],
        };
    }

    const sufijo = [filtros.fecha_inicial, filtros.fecha_final].filter(Boolean).join("_a_") || hoyLocal();
    await responderXlsx(req, res, workbook, `programaciones_${sufijo}.xlsx`);
}

// POST /api/programaciones/cargar-resultados  (multipart/form-data, campo "file")
// Excel exportado y diligenciado: cruza por ID (o SERVICEORDER) y guarda ESTADO_EJECUCION, FECHA_EJECUCION y OBSERVACIONES.
export const cargarResultados = [
    subirXlsx.single("file"),
    async (req, res) => {
        if (!req.file) throw badRequest('No se recibió ningún archivo. Envía el .xlsx en el campo "file"');

        const { filas: crudas, reconocidas } = await leerFilas(req.file.buffer, COLUMNAS_RESULTADOS);
        if (!reconocidas) throw badRequest("No se reconocieron los encabezados. Usa el Excel exportado desde el sistema (columnas ID, SERVICEORDER, ESTADO_EJECUCION, FECHA_EJECUCION, OBSERVACIONES)");

        const filas = [];
        let sin_resultado = 0;
        for (const c of crudas) {
            const estadoTexto = aTexto(c.estado_ejecucion);
            if (!estadoTexto) {
                sin_resultado++; // fila sin diligenciar: se ignora
                continue;
            }
            const estado = ALIAS_ESTADO_EJECUCION[claveHeader(estadoTexto)] ?? estadoTexto;
            filas.push({
                fila: c._fila,
                id: aEnteroPositivo(aTexto(c.id)),
                numero_os: aTexto(c.numero_os),
                estado_ejecucion: estado,
                fecha_ejecucion: c.fecha_ejecucion,
                observaciones: c.observaciones,
            });
        }
        if (!filas.length) throw badRequest("El archivo no tiene filas con ESTADO_EJECUCION diligenciado");

        const { actualizadas, errores } = await Programacion.cargarResultados(filas, req.user.usuario);
        if (errores.length) {
            throw badRequest(`No se guardó ningún resultado: ${errores.length} fila(s) con error. Corrige el archivo y vuelve a cargarlo`, errores);
        }
        res.json({ message: `Resultados cargados: ${actualizadas} OS actualizada(s)`, actualizadas, sin_resultado, errores: [] });
    },
];

// POST /api/programaciones/:id/resultado   body: { estado_ejecucion, fecha_ejecucion?, observaciones? }
export async function registrarResultado(req, res) {
    const programacion = await Programacion.registrarResultado(idDeRuta(req), req.body ?? {}, req.user.usuario);
    res.json({ message: "Resultado registrado correctamente", programacion });
}

// GET /api/programaciones/resumen?fecha=YYYY-MM-DD
export async function resumen(req, res) {
    res.json(await Programacion.resumen(req.query.fecha));
}

// GET /api/programaciones/reporte?fecha_inicial&fecha_final&agrupar=tecnico|municipio&tecnico_id&municipio&formato=archivo
export async function reporte(req, res) {
    const datos = await Programacion.reporte(req.query);
    if (req.query.formato !== "archivo" && req.query.excel !== "true") return res.json(datos);

    const columnas = [
        { header: datos.agrupar === "tecnico" ? "TECNICO" : "MUNICIPIO", key: "grupo", width: 28 },
        ...(datos.agrupar === "tecnico" ? [{ header: "USUARIO", key: "usuario", width: 16 }] : []),
        { header: "TOTAL", key: "total", width: 10 },
        { header: "EJECUTADAS", key: "EJECUTADA", width: 13 },
        { header: "NO EJECUTADAS", key: "NO_EJECUTADA", width: 15 },
        { header: "REPROGRAMADAS", key: "REPROGRAMADA", width: 15 },
        { header: "SIN RESULTADO", key: "SIN_RESULTADO", width: 15 },
        { header: "CUMPLIMIENTO %", key: "cumplimiento", width: 16 },
    ];
    const filas = [...datos.detalle, { grupo: "TOTAL", usuario: "", ...datos.totales }];
    const workbook = crearLibro("Reporte", columnas, filas);
    workbook.worksheets[0].lastRow.font = { bold: true };
    const sufijo = [datos.fecha_inicial, datos.fecha_final].filter(Boolean).join("_a_") || hoyLocal();
    await responderXlsx(req, res, workbook, `reporte_${datos.agrupar}_${sufijo}.xlsx`);
}
