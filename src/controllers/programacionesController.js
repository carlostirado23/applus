const Programacion = require("../models/programacionModel");
const ExcelJS = require("exceljs");
const multer = require("multer");

// Obtener todas las programaciones
exports.getAll = async (req, res) => {
    try {
        const programaciones = await Programacion.getAll();
        res.json(programaciones);
    } catch (error) {
        res.status(400).json({ message: "Error al obtener programaciones", error: error.message });
    }
};

// Descargar plantilla Excel
exports.descargarPlantilla = async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Programaciones");

    worksheet.columns = [
        { header: "SERVICEORDER", key: "numero_os", width: 20 },
        { header: "ASIGNADO_A", key: "asignado_a", width: 20 },
        { header: "F_EST_RESOL", key: "fecha_estimada_resolucion", width: 20 },
        { header: "NIC", key: "nic", width: 15 },
        { header: "NOMBRE", key: "nombre", width: 25 },
        { header: "DIRECCIÓN", key: "direccion", width: 30 },
        { header: "BARRIO", key: "barrio", width: 20 },
        { header: "MUNICIPIO", key: "municipio", width: 20 },
    ];

    worksheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0070C0' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
        "Content-Disposition",
        "attachment; filename=plantilla_programaciones.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
};

// Configuración de multer para archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

// Subir y procesar Excel
exports.uploadExcel = [
    upload.single("file"),
    async (req, res) => {
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(req.file.buffer);
            const worksheet = workbook.worksheets[0];

            const programaciones = [];
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Saltar encabezado
                const [
                    numero_os,
                    asignado_a,
                    fecha_estimada_resolucion,
                    nic,
                    nombre,
                    direccion,
                    barrio,
                    municipio
                ] = row.values.slice(1);

                programaciones.push({
                    numero_os,
                    asignado_a,
                    fecha_estimada_resolucion,
                    nic,
                    nombre,
                    direccion,
                    barrio,
                    municipio
                });
            });

            const creador = req.user.usuario;
            const resultados = [];
            for (const prog of programaciones) {
                const data = { ...prog, creado_por: creador };
                const inserted = await Programacion.create(data);
                resultados.push(inserted);
            }

            res.json({ message: "Programaciones cargadas correctamente", resultados });
        } catch (error) {
            res.status(400).json({ message: "Error al procesar el archivo", error: error.message });
        }
    }
];

// Crear una nueva programación individual
exports.create = async (req, res) => {
    try {
        const creado_por = req.user.usuario;
        const data = { ...req.body, creado_por };
        const programacion = await Programacion.create(data);
        res.status(201).json({ message: "Programación creada correctamente", programacion });
    } catch (error) {
        res.status(400).json({ message: "Error al crear programación", error: error.message });
    }
};