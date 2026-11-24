import { Router } from "express";
import * as programacionesController from "../controllers/programacionesController.js";

// Todas estas rutas quedan protegidas por authMiddleware (ver main.js)
const router = Router();

router.get("/descargar-plantilla", programacionesController.descargarPlantilla);
router.post("/cargar-excel", programacionesController.uploadExcel);
router.post("/publicar", programacionesController.publicar);

router.get("/", programacionesController.getAll);
router.post("/", programacionesController.create);

export default router;
