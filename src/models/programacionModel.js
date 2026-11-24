import prisma from "../../config/db.js";
import { env } from "../../config/env.js";
import { ESTADOS_EJECUCION, ESTADOS_VALIDACION } from "../utils/constantes.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { aEnteroPositivo, aLista } from "../utils/texto.js";

// Columnas de texto que acepta una programación (además de fecha_estimada_resolucion y tecnico_id)
const CAMPOS_TEXTO = ["numero_os", "asignado_a", "nic", "nombre", "direccion", "barrio", "municipio", "formulario"];

// Campos editables desde el panel después de cargada
const CAMPOS_EDITABLES = ["asignado_a", "nic", "nombre", "direccion", "barrio", "municipio"];

// Relación que se incluye al listar/consultar
const INCLUIR_TECNICO = { tecnico: { select: { id: true, nombre: true, usuario: true, cedula: true, telefono: true } } };

const LIMITE_MAXIMO = 500;

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

/** "YYYY-MM-DD" del día de hoy en hora local de la operación. */
export function hoyLocal() {
    return new Date(Date.now() + env.UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** Fecha de calendario (columna DATE) a partir de "YYYY-MM-DD" o cualquier valor aceptado por aFecha. */
function aFechaCalendario(valor, nombre, contexto = "") {
    if (valor === null || valor === undefined || valor === "") return null;
    const s = typeof valor === "string" ? valor.trim() : valor;
    const dia = typeof s === "string" && s.match(SOLO_DIA);
    const fecha = dia ? new Date(Date.UTC(+dia[1], +dia[2] - 1, +dia[3])) : aFecha(s);
    if (!fecha) throw badRequest(`${nombre} inválida: "${aTexto(valor)}"${contexto}`);
    return fecha;
}

/** Construye el `where` de rango sobre una columna de fecha. Lanza 400 si los valores no se entienden. */
function rangoFecha(columna, desdeCrudo, hastaCrudo) {
    if (!desdeCrudo && !hastaCrudo) return {};
    const desde = limiteFiltro(desdeCrudo, false);
    const hasta = limiteFiltro(hastaCrudo, true);
    if ((desdeCrudo && !desde) || (hastaCrudo && !hasta)) {
        throw badRequest("fecha_inicial y fecha_final deben ser YYYY-MM-DD o una fecha ISO válida");
    }
    if (desde && hasta && desde > hasta) throw badRequest("fecha_inicial no puede ser mayor que fecha_final");
    const filtro = {};
    if (desde) filtro.gte = desde;
    if (hasta) filtro.lte = hasta;
    return { [columna]: filtro };
}

function validarEnum(valor, permitidos, nombre, contexto = "") {
    const v = String(valor).trim().toUpperCase().replace(/\s+/g, "_");
    if (!permitidos.includes(v)) throw badRequest(`${nombre} inválido: ${valor}. Valores: ${permitidos.join(", ")}${contexto}`);
    return v;
}

/** Deja los datos listos para Prisma. Lanza 400 si falta numero_os o la fecha es inválida. */
export function normalizar(entrada, creado_por, contexto = "") {
    const data = {};
    for (const campo of CAMPOS_TEXTO) {
        const v = aTexto(entrada[campo]);
        if (v !== null) data[campo] = v;
    }
    if (!data.numero_os) throw badRequest(`numero_os (SERVICEORDER) es obligatorio${contexto}`);

    data.fecha_estimada_resolucion = aFechaCalendario(entrada.fecha_estimada_resolucion, "fecha_estimada_resolucion", contexto);

    if (entrada.validacion) data.validacion = validarEnum(entrada.validacion, ESTADOS_VALIDACION, "validacion", contexto);
    if (entrada.tecnico_id !== undefined && entrada.tecnico_id !== null && entrada.tecnico_id !== "") {
        const id = aEnteroPositivo(entrada.tecnico_id);
        if (!id) throw badRequest(`tecnico_id inválido${contexto}`);
        data.tecnico_id = id;
    }

    data.creado_por = creado_por;
    return data;
}

/**
 * Arma el `where` de Prisma a partir de los filtros de la API.
 * Filtros: fecha_inicial/fecha_final (sobre `campo_fecha`, por defecto fecha_creacion),
 * validacion, estado_ejecucion, tecnico_id, municipio, insertar, q (texto libre).
 */
export function construirWhere(filtros = {}) {
    const where = {};
    const campoFecha = filtros.campo_fecha || "fecha_creacion";
    if (!["fecha_creacion", "fecha_publicacion", "fecha_estimada_resolucion", "fecha_actualizacion"].includes(campoFecha)) {
        throw badRequest("campo_fecha inválido");
    }
    Object.assign(where, rangoFecha(campoFecha, filtros.fecha_inicial, filtros.fecha_final));

    if (filtros.validacion) {
        const lista = aLista(filtros.validacion).map((v) => validarEnum(v, ESTADOS_VALIDACION, "validacion"));
        where.validacion = lista.length === 1 ? lista[0] : { in: lista };
    }
    if (filtros.estado_ejecucion) {
        const lista = aLista(filtros.estado_ejecucion).map((v) => validarEnum(v, ESTADOS_EJECUCION, "estado_ejecucion"));
        where.estado_ejecucion = lista.length === 1 ? lista[0] : { in: lista };
    }
    if (filtros.tecnico_id !== undefined && filtros.tecnico_id !== "") {
        if (filtros.tecnico_id === "null" || filtros.tecnico_id === "sin") where.tecnico_id = null;
        else {
            const id = aEnteroPositivo(filtros.tecnico_id);
            if (!id) throw badRequest("tecnico_id inválido");
            where.tecnico_id = id;
        }
    }
    if (filtros.municipio) where.municipio = { equals: String(filtros.municipio).trim(), mode: "insensitive" };
    if (filtros.insertar === "true") where.insertar = true;
    if (filtros.insertar === "false") where.insertar = false;

    const q = String(filtros.q ?? "").trim();
    if (q) {
        where.OR = [
            ...["numero_os", "nic", "nombre", "direccion", "barrio", "municipio", "asignado_a", "creado_por"].map((campo) => ({
                [campo]: { contains: q, mode: "insensitive" },
            })),
            { tecnico: { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { usuario: { contains: q, mode: "insensitive" } }] } },
        ];
    }
    return where;
}

// ───────────────────────── acceso a datos ─────────────────────────

const Programacion = {
    /**
     * Lista programaciones con filtros (ver construirWhere).
     * Sin `page` devuelve un arreglo (máximo LIMITE_MAXIMO). Con `page` devuelve { data, total, page, limit, paginas }.
     */
    async getAll(filtros = {}) {
        const where = construirWhere(filtros);
        const orden = filtros.orden === "fecha_estimada" ? [{ fecha_estimada_resolucion: "asc" }, { id: "asc" }] : [{ fecha_creacion: "desc" }, { id: "desc" }];
        const limit = Math.min(aEnteroPositivo(filtros.limit) ?? LIMITE_MAXIMO, LIMITE_MAXIMO);

        if (!filtros.page) {
            return prisma.programacion.findMany({ where, include: INCLUIR_TECNICO, orderBy: orden, take: limit });
        }

        const page = aEnteroPositivo(filtros.page);
        if (!page) throw badRequest("page debe ser un entero positivo");
        const [total, data] = await Promise.all([
            prisma.programacion.count({ where }),
            prisma.programacion.findMany({ where, include: INCLUIR_TECNICO, orderBy: orden, skip: (page - 1) * limit, take: limit }),
        ]);
        return { data, total, page, limit, paginas: Math.max(1, Math.ceil(total / limit)) };
    },

    /** Lista completa para exportar (sin paginar, sin tope). */
    exportar(filtros = {}) {
        const where = construirWhere(filtros);
        return prisma.programacion.findMany({
            where,
            include: INCLUIR_TECNICO,
            orderBy: [{ fecha_estimada_resolucion: "asc" }, { tecnico_id: "asc" }, { id: "asc" }],
        });
    },

    async obtener(id) {
        const p = await prisma.programacion.findUnique({ where: { id }, include: INCLUIR_TECNICO });
        if (!p) throw notFound("Programación no encontrada");
        return p;
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
                // Una duplicada es histórico: no se asigna a ningún técnico ni se publica
                return { ...item, insertar, tecnico_id: insertar ? item.tecnico_id : null };
            });

            const creadas = await tx.programacion.createManyAndReturn({ data, select: { id: true } });
            return tx.programacion.findMany({ where: { id: { in: creadas.map((c) => c.id) } }, include: INCLUIR_TECNICO, orderBy: { id: "asc" } });
        });
    },

    /**
     * Edita datos de una programación (cliente, dirección, técnico, fecha estimada).
     * `tecnico_id: null` quita el técnico. Si se asigna técnico y no viene asignado_a, se toma el nombre del técnico.
     */
    async actualizar(id, entrada = {}) {
        const actual = await Programacion.obtener(id);
        const data = {};
        for (const campo of CAMPOS_EDITABLES) {
            if (entrada[campo] !== undefined) data[campo] = aTexto(entrada[campo]);
        }
        if (entrada.fecha_estimada_resolucion !== undefined) {
            data.fecha_estimada_resolucion = aFechaCalendario(entrada.fecha_estimada_resolucion, "fecha_estimada_resolucion");
        }
        if (entrada.tecnico_id !== undefined) {
            if (entrada.tecnico_id === null || entrada.tecnico_id === "") data.tecnico_id = null;
            else {
                const tecnicoId = aEnteroPositivo(entrada.tecnico_id);
                if (!tecnicoId) throw badRequest("tecnico_id inválido");
                const tecnico = await prisma.usuario.findFirst({ where: { id: tecnicoId, rol: "TECNICO", activo: true }, select: { id: true, nombre: true } });
                if (!tecnico) throw badRequest("El técnico no existe o está inactivo");
                data.tecnico_id = tecnico.id;
                if (entrada.asignado_a === undefined) data.asignado_a = tecnico.nombre;
            }
        }
        if (!Object.keys(data).length) throw badRequest("No se enviaron campos para actualizar");
        if (!actual.insertar && data.tecnico_id) throw badRequest("Una OS duplicada no se puede asignar: queda como histórico");
        return prisma.programacion.update({ where: { id }, data, include: INCLUIR_TECNICO });
    },

    /**
     * Elimina programaciones PENDIENTES. Las publicadas no se borran (son histórico para Afinia).
     * Devuelve { eliminadas: [ids], omitidas: [{ id, numero_os, motivo }] }.
     */
    async eliminar(ids) {
        return prisma.$transaction(async (tx) => {
            const filas = await tx.programacion.findMany({ where: { id: { in: ids } }, select: { id: true, numero_os: true, validacion: true } });
            const porId = new Map(filas.map((f) => [f.id, f]));
            const omitidas = [];
            const borrables = [];
            for (const id of ids) {
                const fila = porId.get(id);
                if (!fila) omitidas.push({ id, numero_os: null, motivo: "No existe" });
                else if (fila.validacion === "PUBLICADO") omitidas.push({ id, numero_os: fila.numero_os, motivo: "Ya está publicada, no se puede eliminar" });
                else borrables.push(id);
            }
            if (borrables.length) await tx.programacion.deleteMany({ where: { id: { in: borrables } } });
            return { eliminadas: borrables, omitidas };
        });
    },

    /**
     * Marca como PUBLICADO las programaciones indicadas y registra quién y cuándo.
     * Se omiten (y se informan en `omitidas`): ids inexistentes, OS duplicadas (insertar = false),
     * las ya publicadas y las que no tienen técnico asignado (la app móvil no sabría a quién mostrarlas).
     */
    async publicar(ids, publicado_por) {
        return prisma.$transaction(async (tx) => {
            const filas = await tx.programacion.findMany({
                where: { id: { in: ids } },
                select: { id: true, numero_os: true, insertar: true, validacion: true, tecnico_id: true },
            });
            const porId = new Map(filas.map((f) => [f.id, f]));

            const omitidas = [];
            const publicables = [];
            for (const id of ids) {
                const fila = porId.get(id);
                if (!fila) omitidas.push({ id, numero_os: null, motivo: "No existe" });
                else if (!fila.insertar) omitidas.push({ id, numero_os: fila.numero_os, motivo: "OS duplicada, no se puede publicar" });
                else if (fila.validacion === "PUBLICADO") omitidas.push({ id, numero_os: fila.numero_os, motivo: "Ya estaba publicada" });
                else if (!fila.tecnico_id) omitidas.push({ id, numero_os: fila.numero_os, motivo: "Sin técnico asignado" });
                else publicables.push(id);
            }

            let resultados = [];
            if (publicables.length) {
                await tx.programacion.updateMany({
                    where: { id: { in: publicables } },
                    data: { validacion: "PUBLICADO", fecha_publicacion: new Date(), publicado_por },
                });
                resultados = await tx.programacion.findMany({ where: { id: { in: publicables } }, include: INCLUIR_TECNICO, orderBy: { id: "asc" } });
            }
            return { resultados, omitidas };
        });
    },

    /**
     * Registra el resultado de una visita. `entrada`: { estado_ejecucion, fecha_ejecucion?, observaciones? }.
     * Solo para OS publicadas.
     */
    async registrarResultado(id, entrada = {}, resultado_por) {
        const actual = await Programacion.obtener(id);
        if (actual.validacion !== "PUBLICADO") throw badRequest("Solo se registran resultados de OS publicadas");
        const data = Programacion.normalizarResultado(entrada);
        return prisma.programacion.update({
            where: { id },
            data: { ...data, resultado_por, fecha_resultado: new Date() },
            include: INCLUIR_TECNICO,
        });
    },

    /** Valida los campos de resultado. Lanza 400 con `contexto` (p. ej. " (fila 7)") si algo no cuadra. */
    normalizarResultado(entrada, contexto = "") {
        if (!entrada.estado_ejecucion) throw badRequest(`estado_ejecucion es obligatorio${contexto}`);
        const data = { estado_ejecucion: validarEnum(entrada.estado_ejecucion, ESTADOS_EJECUCION, "estado_ejecucion", contexto) };
        data.fecha_ejecucion = aFechaCalendario(entrada.fecha_ejecucion, "fecha_ejecucion", contexto);
        if (entrada.observaciones !== undefined) {
            const obs = aTexto(entrada.observaciones);
            data.observaciones = obs ? obs.slice(0, 1000) : null;
        }
        return data;
    },

    /**
     * Carga masiva de resultados (Excel). `filas`: [{ fila, id?, numero_os?, estado_ejecucion, fecha_ejecucion?, observaciones? }].
     * Cruce por id; si no viene, por numero_os (la OS original, insertar = true). Solo OS publicadas.
     * Todo o nada: si alguna fila es inválida no se guarda ninguna. Devuelve { actualizadas, errores }.
     */
    async cargarResultados(filas, resultado_por) {
        const errores = [];
        const cambios = [];
        for (const f of filas) {
            try {
                cambios.push({ fila: f.fila, id: f.id, numero_os: f.numero_os, data: Programacion.normalizarResultado(f, ` (fila ${f.fila})`) });
            } catch (e) {
                errores.push({ fila: f.fila, motivo: e.message });
            }
        }
        if (errores.length) return { actualizadas: 0, errores };

        return prisma.$transaction(async (tx) => {
            const ids = cambios.map((c) => c.id).filter(Boolean);
            const numeros = cambios.filter((c) => !c.id).map((c) => c.numero_os).filter(Boolean);
            const existentes = await tx.programacion.findMany({
                where: { OR: [...(ids.length ? [{ id: { in: ids } }] : []), ...(numeros.length ? [{ numero_os: { in: numeros }, insertar: true }] : [])] },
                select: { id: true, numero_os: true, validacion: true, insertar: true },
            });
            const porId = new Map(existentes.map((e) => [e.id, e]));
            const porOs = new Map(existentes.filter((e) => e.insertar).map((e) => [e.numero_os, e]));

            const aplicar = [];
            for (const c of cambios) {
                const fila = c.id ? porId.get(c.id) : porOs.get(c.numero_os);
                if (!fila) errores.push({ fila: c.fila, motivo: `No existe la OS ${c.id ? `con ID ${c.id}` : c.numero_os}` });
                else if (fila.validacion !== "PUBLICADO") errores.push({ fila: c.fila, motivo: `La OS ${fila.numero_os} no está publicada` });
                else aplicar.push({ id: fila.id, data: c.data });
            }
            if (errores.length) return { actualizadas: 0, errores };

            const ahora = new Date();
            for (const a of aplicar) {
                await tx.programacion.update({ where: { id: a.id }, data: { ...a.data, resultado_por, fecha_resultado: ahora } });
            }
            return { actualizadas: aplicar.length, errores: [] };
        });
    },

    /** Resumen para el dashboard. `fecha` = "YYYY-MM-DD" (por defecto hoy) para los conteos "del día". */
    async resumen(fecha) {
        const dia = fecha || hoyLocal();
        if (!SOLO_DIA.test(dia)) throw badRequest("fecha debe ser YYYY-MM-DD");
        const diaFecha = new Date(`${dia}T00:00:00.000Z`); // columna DATE: se compara en UTC
        const inicioDia = limiteFiltro(dia, false);
        const finDia = limiteFiltro(dia, true);

        const [total, pendientes, publicadas, duplicadas, sinTecnico, vencidas, porEstado, publicadasHoy, delDia, tecnicosActivos] = await Promise.all([
            prisma.programacion.count(),
            prisma.programacion.count({ where: { validacion: "PENDIENTE", insertar: true } }),
            prisma.programacion.count({ where: { validacion: "PUBLICADO" } }),
            prisma.programacion.count({ where: { insertar: false } }),
            prisma.programacion.count({ where: { validacion: "PENDIENTE", insertar: true, tecnico_id: null } }),
            prisma.programacion.count({ where: { validacion: "PUBLICADO", estado_ejecucion: "SIN_RESULTADO", fecha_estimada_resolucion: { lt: diaFecha } } }),
            prisma.programacion.groupBy({ by: ["estado_ejecucion"], where: { validacion: "PUBLICADO" }, _count: { _all: true } }),
            prisma.programacion.count({ where: { fecha_publicacion: { gte: inicioDia, lte: finDia } } }),
            prisma.programacion.findMany({
                where: { validacion: "PUBLICADO", fecha_estimada_resolucion: diaFecha },
                select: { tecnico_id: true, estado_ejecucion: true, fecha_vista: true, tecnico: { select: { nombre: true, usuario: true } } },
            }),
            prisma.usuario.count({ where: { rol: "TECNICO", activo: true } }),
        ]);

        const ejecucion = Object.fromEntries(ESTADOS_EJECUCION.map((e) => [e, 0]));
        for (const g of porEstado) ejecucion[g.estado_ejecucion] = g._count._all;

        const porTecnico = new Map();
        for (const p of delDia) {
            const clave = p.tecnico_id ?? 0;
            if (!porTecnico.has(clave)) {
                porTecnico.set(clave, { tecnico_id: p.tecnico_id, nombre: p.tecnico?.nombre ?? "Sin técnico", usuario: p.tecnico?.usuario ?? null, total: 0, vistas: 0, ...Object.fromEntries(ESTADOS_EJECUCION.map((e) => [e, 0])) });
            }
            const t = porTecnico.get(clave);
            t.total++;
            if (p.fecha_vista) t.vistas++;
            t[p.estado_ejecucion]++;
        }

        return {
            fecha: dia,
            total,
            pendientes,
            publicadas,
            duplicadas,
            sin_tecnico: sinTecnico,
            vencidas,
            publicadas_hoy: publicadasHoy,
            ejecucion,
            tecnicos_activos: tecnicosActivos,
            del_dia: { total: delDia.length, por_tecnico: [...porTecnico.values()].sort((a, b) => b.total - a.total) },
        };
    },

    /**
     * Reporte de cumplimiento agrupado por técnico o municipio.
     * Filtra OS publicadas por fecha_estimada_resolucion (fecha_inicial/fecha_final, YYYY-MM-DD).
     */
    async reporte({ fecha_inicial, fecha_final, agrupar = "tecnico", tecnico_id, municipio } = {}) {
        if (!["tecnico", "municipio"].includes(agrupar)) throw badRequest("agrupar debe ser tecnico o municipio");
        const where = construirWhere({ fecha_inicial, fecha_final, campo_fecha: "fecha_estimada_resolucion", validacion: "PUBLICADO", tecnico_id, municipio });
        const filas = await prisma.programacion.findMany({
            where,
            select: { tecnico_id: true, municipio: true, estado_ejecucion: true, tecnico: { select: { nombre: true, usuario: true } } },
        });

        const grupos = new Map();
        for (const f of filas) {
            const clave = agrupar === "tecnico" ? (f.tecnico_id ?? 0) : (f.municipio ?? "").trim().toUpperCase() || "SIN MUNICIPIO";
            if (!grupos.has(clave)) {
                grupos.set(clave, {
                    grupo: agrupar === "tecnico" ? (f.tecnico?.nombre ?? "Sin técnico") : clave,
                    tecnico_id: agrupar === "tecnico" ? f.tecnico_id : undefined,
                    usuario: agrupar === "tecnico" ? (f.tecnico?.usuario ?? null) : undefined,
                    total: 0,
                    ...Object.fromEntries(ESTADOS_EJECUCION.map((e) => [e, 0])),
                });
            }
            const g = grupos.get(clave);
            g.total++;
            g[f.estado_ejecucion]++;
        }
        const detalle = [...grupos.values()]
            .map((g) => ({ ...g, cumplimiento: g.total ? Math.round((g.EJECUTADA / g.total) * 1000) / 10 : 0 }))
            .sort((a, b) => b.total - a.total || a.grupo.localeCompare(b.grupo));

        const totales = { total: filas.length, ...Object.fromEntries(ESTADOS_EJECUCION.map((e) => [e, 0])) };
        for (const f of filas) totales[f.estado_ejecucion]++;
        totales.cumplimiento = totales.total ? Math.round((totales.EJECUTADA / totales.total) * 1000) / 10 : 0;

        return { agrupar, fecha_inicial: fecha_inicial || null, fecha_final: fecha_final || null, totales, detalle };
    },

    // ───────── técnico (app móvil) ─────────

    /** OS publicadas del técnico. `desde` (ISO) devuelve solo las modificadas después de esa fecha. */
    misProgramaciones(tecnico_id, { desde } = {}) {
        const where = { tecnico_id, validacion: "PUBLICADO" };
        if (desde) {
            const d = aFecha(desde);
            if (!d) throw badRequest("desde debe ser una fecha ISO válida");
            where.fecha_actualizacion = { gt: d };
        }
        return prisma.programacion.findMany({ where, orderBy: [{ fecha_estimada_resolucion: "asc" }, { id: "asc" }] });
    },

    /** Marca la OS como vista por su técnico (solo la primera vez). */
    async marcarVista(id, tecnico_id) {
        const p = await prisma.programacion.findFirst({ where: { id, tecnico_id, validacion: "PUBLICADO" }, select: { id: true, fecha_vista: true } });
        if (!p) throw notFound("Programación no encontrada");
        if (p.fecha_vista) return prisma.programacion.findUnique({ where: { id } });
        return prisma.programacion.update({ where: { id }, data: { fecha_vista: new Date() } });
    },
};

export default Programacion;
