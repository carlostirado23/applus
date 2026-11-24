import { Router } from "express";
import * as tecnicoController from "../controllers/tecnicoController.js";
import { soloTecnico } from "../middleware/auth.js";

// Protegidas por authMiddleware en main.js. Solo rol TECNICO (app móvil).
const router = Router();
router.use(soloTecnico);

router.get("/", tecnicoController.misProgramaciones);
router.post("/:id/vista", tecnicoController.marcarVista);

export default router;
