import ExcelJS from "exceljs";
import multer from "multer";
import { aTexto } from "../models/programacionModel.js";
import { badRequest } from "./httpError.js";
import { claveHeader } from "./texto.js";

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Multer: archivo en memoria, máximo 10 MB, solo .xlsx. Uso: subirXlsx.single("file"). */
export const subirXlsx = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const esXlsx = file.mimetype === MIME_XLSX || /\.xlsx$/i.test(file.originalname);
        cb(esXlsx ? null : badRequest("Solo se aceptan archivos .xlsx"), esXlsx);
    },
});

/**
 * Lee la primera hoja de un .xlsx y devuelve las filas como objetos { key: valorCrudo }.
 * `columnas`: [{ header, key, alias?: [] }]. Se mapean por nombre de encabezado (sin tildes, mayúsculas,
 * sin espacios); si ningún encabezado coincide se usa el orden de `columnas`.
 * Las filas completamente vacías se ignoran. Cada fila trae `_fila` (número en el Excel).
 */
export async function leerFilas(buffer, columnas) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw badRequest("El archivo no tiene hojas");

    const encabezados = worksheet.getRow(1).values; // índice 1-based
    const claves = encabezados.map((h) => claveHeader(aTexto(h)));
    const indicePorKey = {};
    let coincidencias = 0;
    columnas.forEach((col, i) => {
        const nombres = [col.header, ...(col.alias ?? [])].map(claveHeader);
        const pos = claves.findIndex((c, idx) => idx > 0 && c && nombres.includes(c));
        if (pos > 0) coincidencias++;
        indicePorKey[col.key] = pos > 0 ? pos : -1;
    });
    // Sin ningún encabezado reconocido: posicional, como en la plantilla
    if (coincidencias === 0) columnas.forEach((col, i) => (indicePorKey[col.key] = i + 1));

    const filas = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const crudo = { _fila: rowNumber };
        for (const col of columnas) {
            const idx = indicePorKey[col.key];
            crudo[col.key] = idx > 0 ? row.getCell(idx).value : null;
        }
        if (columnas.every((col) => aTexto(crudo[col.key]) === null)) return;
        filas.push(crudo);
    });
    return { filas, reconocidas: coincidencias };
}

/** Crea un libro con una hoja, encabezados con estilo y filas. `columnas`: [{ header, key, width }]. */
export function crearLibro(nombreHoja, columnas, filas = []) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Applus";
    const ws = workbook.addWorksheet(nombreHoja);
    ws.columns = columnas.map(({ header, key, width }) => ({ header, key, width: width ?? 18 }));
    ws.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0070C0" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (filas.length) ws.addRows(filas);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
    return workbook;
}

/**
 * Responde un libro Excel. Con ?formato=archivo descarga el .xlsx directo;
 * por defecto JSON { fileName, mimeType, dataUrl } (compatibilidad con el front).
 */
export async function responderXlsx(req, res, workbook, fileName) {
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    if (req.query.formato === "archivo") {
        res.setHeader("Content-Type", MIME_XLSX);
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        return res.send(buffer);
    }
    res.json({ fileName, mimeType: MIME_XLSX, dataUrl: `data:${MIME_XLSX};base64,${buffer.toString("base64")}` });
}

/** Fecha para celda Excel: Date (medianoche UTC) o null. Las columnas DATE de Prisma ya llegan así. */
export const celdaFecha = (valor) => (valor instanceof Date ? valor : null);
