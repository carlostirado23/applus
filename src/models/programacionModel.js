import prisma from "../../config/db.js";
import { env } from "../../config/env.js";
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

const SOLO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Límite de un filtro de fechas.
 * - "YYYY-MM-DD": día completo en hora local (UTC_OFFSET_MINUTES). `fin` = true -> 23:59:59.999 de ese día.
 * - Instante ISO (p. ej. "2026-11-24T05:00:00.000Z"): se respeta exacto, sin redondear.
 * Devuelve Date o null si no se puede interpretar.
 */
export function limiteFiltro(valor, fin = false) {
    const s = valor == null ? "" : String(valor).trim();
    if (!s) return null;
    const dia = s.match(SOLO_DIA);
    if (!dia) return aFecha(s);
    const medianocheLocalEnUtc = Date.UTC(+dia[1], +dia[2] - 1, +dia[3]) - env.UTC_OFFSET_MINUTES * 60_000;
    return new Date(fin ? medianocheLocalEnUtc + 86_400_000 - 1 : medianocheLocalEnUtc);
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
    /**
     * Lista programaciones, opcionalmente filtradas por rango de fecha_creacion.
     * fecha_inicial / fecha_final aceptan "YYYY-MM-DD" (día completo en hora local)
     * o un instante ISO exacto. Ver limiteFiltro().
     */
    async getAll({ fecha_inicial, fecha_final } = {}) {
        const where = {};
        if (fecha_inicial || fecha_final) {
            const desde = limiteFiltro(fecha_inicial, false);
            const hasta = limiteFiltro(fecha_final, true);
            if ((fecha_inicial && !desde) || (fecha_final && !hasta)) {
                throw badRequest("fecha_inicial y fecha_final deben ser YYYY-MM-DD o una fecha ISO válida");
            }
            if (desde && hasta && desde > hasta) throw badRequest("fecha_inicial no puede ser mayor que fecha_final");
            where.fecha_creacion = {};
            if (desde) where.fecha_creacion.gte = desde;
            if (hasta) where.fecha_creacion.lte = hasta;
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

    /**
     * Marca como PUBLICADO las programaciones indicadas.
     * Regla de negocio: las OS duplicadas (insertar = false) NO se publican; se devuelven en `omitidas`.
     * También se omiten los ids inexistentes y los ya publicados.
     */
    async publicar(ids) {
        return prisma.$transaction(async (tx) => {
            const filas = await tx.programacion.findMany({
                where: { id: { in: ids } },
                select: { id: true, numero_os: true, insertar: true, validacion: true },
            });
            const porId = new Map(filas.map((f) => [f.id, f]));

            const omitidas = [];
            const publicables = [];
            for (const id of ids) {
                const fila = porId.get(id);
                if (!fila) omitidas.push({ id, numero_os: null, motivo: "No existe" });
                else if (!fila.insertar) omitidas.push({ id, numero_os: fila.numero_os, motivo: "OS duplicada, no se puede publicar" });
                else if (fila.validacion === "PUBLICADO") omitidas.push({ id, numero_os: fila.numero_os, motivo: "Ya estaba publicada" });
                else publicables.push(id);
            }

            let resultados = [];
            if (publicables.length) {
                await tx.programacion.updateMany({ where: { id: { in: publicables } }, data: { validacion: "PUBLICADO" } });
                resultados = await tx.programacion.findMany({ where: { id: { in: publicables } }, orderBy: { id: "asc" } });
            }
            return { resultados, omitidas };
        });
    },
};

export default Programacion;
