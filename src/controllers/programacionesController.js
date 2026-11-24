import ExcelJS from "exceljs";
import multer from "multer";
import Programacion, { aTexto, normalizar } from "../models/programacionModel.js";
import { badRequest } from "../utils/httpError.js";

// Columnas de la plantilla Excel: encabezado visible -> campo en BD
const COLUMNAS = [
    { header: "SERVICEORDER", key: "numero_os", width: 20 },
    { header: "ASIGNADO_A", key: "asignado_a", width: 20 },
    { header: "F_EST_RESOL", key: "fecha_estimada_resolucion", width: 20 },
    { header: "NIC", key: "nic", width: 15 },
    { header: "NOMBRE", key: "nombre", width: 25 },
    { header: "DIRECCIÓN", key: "direccion", width: 30 },
    { header: "BARRIO", key: "barrio", width: 20 },
    { header: "MUNICIPIO", key: "municipio", width: 20 },
];

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Normaliza un encabezado para compararlo: mayúsculas, sin tildes ni espacios
const claveHeader = (h) =>
    String(h ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/\s+/g, "");

// GET /api/programaciones?fecha_inicial=YYYY-MM-DD&fecha_final=YYYY-MM-DD
export async function getAll(req, res) {
    const { fecha_inicial, fecha_final } = req.query;
    const programaciones = await Programacion.getAll({ fecha_inicial, fecha_final });
    res.json(programaciones);
}

// GET /api/programaciones/descargar-plantilla
export async function descargarPlantilla(req, res) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Programaciones");
    worksheet.columns = COLUMNAS;

    worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0070C0" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();

    // ?formato=archivo -> descarga directa del .xlsx; por defecto JSON con dataUrl (compatibilidad con el front)
    if (req.query.formato === "archivo") {
        res.setHeader("Content-Type", MIME_XLSX);
        res.setHeader("Content-Disposition", 'attachment; filename="plantilla_programaciones.xlsx"');
        return res.send(Buffer.from(buffer));
    }

    res.json({
        fileName: "plantilla_programaciones.xlsx",
        mimeType: MIME_XLSX,
        dataUrl: `data:${MIME_XLSX};base64,${Buffer.from(buffer).toString("base64")}`,
    });
}

// Multer: archivo en memoria, máximo 10 MB, solo .xlsx
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const esXlsx = file.mimetype === MIME_XLSX || /\.xlsx$/i.test(file.originalname);
        cb(esXlsx ? null : badRequest("Solo se aceptan archivos .xlsx"), esXlsx);
    },
});

// POST /api/programaciones/cargar-excel  (multipart/form-data, campo "file")
export const uploadExcel = [
    upload.single("file"),
    async (req, res) => {
        if (!req.file) throw badRequest('No se recibió ningún archivo. Envía el .xlsx en el campo "file"');

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw badRequest("El archivo no tiene hojas");

        // Mapear columnas por nombre de encabezado; si no coincide ninguno, usar el orden de la plantilla
        const encabezados = worksheet.getRow(1).values; // índice 1-based
        const indicePorKey = {};
        COLUMNAS.forEach((col, i) => {
            const pos = encabezados.findIndex((h, idx) => idx > 0 && claveHeader(aTexto(h)) === claveHeader(col.header));
            indicePorKey[col.key] = pos > 0 ? pos : i + 1;
        });

        const creado_por = req.user.usuario;
        const filas = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // encabezado
            const crudo = {};
            for (const col of COLUMNAS) crudo[col.key] = row.getCell(indicePorKey[col.key]).value;
            // Saltar filas completamente vacías
            if (Object.values(crudo).every((v) => aTexto(v) === null)) return;
            filas.push(normalizar(crudo, creado_por, ` (fila ${rowNumber})`));
        });

        if (!filas.length) throw badRequest("El archivo no tiene filas con datos");

        const resultados = await Programacion.createMany(filas);
        const duplicados = resultados.filter((r) => !r.insertar).length;

        res.status(201).json({
            message: "Programaciones cargadas correctamente",
            total: resultados.length,
            nuevas: resultados.length - duplicados,
            duplicados,
            resultados,
        });
    },
];

// POST /api/programaciones
export async function create(req, res) {
    const data = normalizar(req.body ?? {}, req.user.usuario);
    const programacion = await Programacion.create(data);
    res.status(201).json({ message: "Programación creada correctamente", programacion });
}

// POST /api/programaciones/publicar   body: { ids: [1, 2, 3] }
export async function publicar(req, res) {
    const { ids } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) throw badRequest("No se enviaron programaciones para publicar");

    const idsNum = ids.map(Number);
    if (idsNum.some((n) => !Number.isInteger(n) || n <= 0)) throw badRequest("ids debe ser un arreglo de enteros positivos");

    const { resultados, omitidas } = await Programacion.publicar([...new Set(idsNum)]);

    if (resultados.length === 0) {
        throw badRequest("Ninguna de las programaciones seleccionadas se puede publicar", omitidas);
    }

    const message =
        omitidas.length === 0
            ? "Programaciones publicadas correctamente"
            : `Se publicaron ${resultados.length}; ${omitidas.length} omitida(s) (duplicadas, inexistentes o ya publicadas)`;

    res.json({ message, total: resultados.length, omitidas, resultados });
}
