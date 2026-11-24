import prisma from "../../config/db.js";
import { badRequest } from "../utils/httpError.js";

// Columnas de texto que acepta una programación (además de fecha_estimada_resolucion)
const CAMPOS_TEXTO = ["numero_os", "asignado_a", "nic", "nombre", "direccion", "barrio", "municipio", "formulario"];

// ───────────────────────── helpers de normalización ─────────────────────────

/** Convierte cualquier valor de celda/body a string limpio o null. */
export function aTexto(valor) {
    if (valor === null || valor === undefined) return null;
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    if (typeof valor === "object") {
        // ExcelJS: { richText: [...] }, { text, hyperlink }, { result } (fórmulas)
        if (Array.isArray(valor.richText)) return aTexto(valor.richText.map((r) => r.text).join(""));
        if ("text" in valor) return aTexto(valor.text);
        if ("result" in valor) return aTexto(valor.result);
        return null;
    }
    const s = String(valor).trim();
    return s === "" ? null : s;
}

/** Acepta Date, serial de Excel, "YYYY-MM-DD", "DD/MM/YYYY" o ISO. Devuelve Date o null. */
export function aFecha(valor) {
    if (valor === null || valor === undefined || valor === "") return null;
    if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
    if (typeof valor === "object") return aFecha(valor.result ?? valor.text ?? null);
    if (typeof valor === "number") {
        // Serial de Excel (días desde 1899-12-30)
        return new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000);
    }
    const s = String(valor).trim();
    const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Deja los datos listos para Prisma. Lanza 400 si falta numero_os o la fecha es inválida. */
export function normalizar(entrada, creado_por, contexto = "") {
    const data = {};
    for (const campo of CAMPOS_TEXTO) {
        const v = aTexto(entrada[campo]);
        if (v !== null) data[campo] = v;
    }
    if (!data.numero_os) throw badRequest(`numero_os (SERVICEORDER) es obligatorio${contexto}`);

    const fechaCruda = entrada.fecha_estimada_resolucion;
    const fecha = aFecha(fechaCruda);
    if (fechaCruda && !fecha) throw badRequest(`fecha_estimada_resolucion inválida: "${aTexto(fechaCruda)}"${contexto}`);
    data.fecha_estimada_resolucion = fecha;

    if (entrada.validacion) {
        const val = String(entrada.validacion).toUpperCase();
        if (!["PENDIENTE", "PUBLICADO"].includes(val)) throw badRequest(`validacion inválida: ${entrada.validacion}${contexto}`);
        data.validacion = val;
    }

    data.creado_por = creado_por;
    return data;
}

// ───────────────────────── acceso a datos ─────────────────────────

const Programacion = {
    /** Lista programaciones, opcionalmente filtradas por rango de fecha_creacion. */
    async getAll({ fecha_inicial, fecha_final } = {}) {
        const where = {};
        if (fecha_inicial || fecha_final) {
            const desde = aFecha(fecha_inicial);
            const hasta = aFecha(fecha_final);
            if ((fecha_inicial && !desde) || (fecha_final && !hasta)) {
                throw badRequest("fecha_inicial y fecha_final deben tener formato YYYY-MM-DD");
            }
            where.fecha_creacion = {};
            if (desde) where.fecha_creacion.gte = desde;
            if (hasta) {
                // Incluir todo el día final
                const fin = new Date(hasta);
                fin.setUTCHours(23, 59, 59, 999);
                where.fecha_creacion.lte = fin;
            }
        }
        return prisma.programacion.findMany({ where, orderBy: { fecha_creacion: "desc" } });
    },

    /** Crea una programación. */
    async create(data) {
        const [creada] = await Programacion.createMany([data]);
        return creada;
    },

    /**
     * Crea varias programaciones en UNA transacción.
     * Regla de negocio: si el numero_os ya existe (en BD o antes en el mismo lote)
     * se inserta igual pero con insertar = false (queda como histórico/duplicado).
     */
    async createMany(items) {
        if (!items.length) return [];
        return prisma.$transaction(async (tx) => {
            const numeros = [...new Set(items.map((i) => i.numero_os))];
            const existentes = await tx.programacion.findMany({
                where: { numero_os: { in: numeros } },
                select: { numero_os: true },
                distinct: ["numero_os"],
            });
            const vistos = new Set(existentes.map((e) => e.numero_os));

            const data = items.map((item) => {
                const insertar = !vistos.has(item.numero_os);
                vistos.add(item.numero_os);
                return { ...item, insertar };
            });

            return tx.programacion.createManyAndReturn({ data });
        });
    },

    /** Marca como PUBLICADO las programaciones indicadas y devuelve las filas actualizadas. */
    async publicar(ids) {
        const [, filas] = await prisma.$transaction([
            prisma.programacion.updateMany({ where: { id: { in: ids } }, data: { validacion: "PUBLICADO" } }),
            prisma.programacion.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } }),
        ]);
        return filas;
    },
};

export default Programacion;
