import Programacion from "../models/programacionModel.js";
import { badRequest } from "../utils/httpError.js";
import { aEnteroPositivo } from "../utils/texto.js";

// Endpoints de la app móvil (rol TECNICO). Solo lectura más la marca de "vista".

// GET /api/mis-programaciones?desde=ISO
// Sin `desde`: todas las OS publicadas del técnico. Con `desde`: solo las modificadas después (sincronización).
export async function misProgramaciones(req, res) {
    const lista = await Programacion.misProgramaciones(req.user.id, { desde: req.query.desde });
    res.json({ sincronizado_en: new Date().toISOString(), total: lista.length, programaciones: lista });
}

// POST /api/mis-programaciones/:id/vista
export async function marcarVista(req, res) {
    const id = aEnteroPositivo(req.params.id);
    if (!id) throw badRequest("id inválido");
    const programacion = await Programacion.marcarVista(id, req.user.id);
    res.json({ message: "Programación marcada como vista", programacion });
}
