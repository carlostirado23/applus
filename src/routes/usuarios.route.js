import { Router } from "express";
import * as usuariosController from "../controllers/usuariosController.js";
import { soloAdmin, soloPanel } from "../middleware/auth.js";

// Protegido por authMiddleware en main.js. Gestión completa solo para ADMIN;
// la lista de técnicos también la necesita el SUPERVISOR (reasignar, filtrar).
const router = Router();

router.get("/tecnicos", soloPanel, usuariosController.tecnicos);

router.get("/", soloAdmin, usuariosController.listar);
router.post("/", soloAdmin, usuariosController.crear);
router.get("/:id", soloAdmin, usuariosController.obtener);
router.put("/:id", soloAdmin, usuariosController.actualizar);
router.patch("/:id/activo", soloAdmin, usuariosController.cambiarActivo);
router.post("/:id/password", soloAdmin, usuariosController.resetPassword);

export default router;
