import { Router } from "express";
import * as programacionesController from "../controllers/programacionesController.js";
import { soloPanel } from "../middleware/auth.js";

// Protegidas por authMiddleware en main.js. Todo el módulo es del área administrativa (ADMIN y SUPERVISOR).
const router = Router();
router.use(soloPanel);

// Rutas fijas antes de /:id
router.get("/descargar-plantilla", programacionesController.descargarPlantilla);
router.get("/exportar", programacionesController.exportar);
router.get("/resumen", programacionesController.resumen);
router.get("/reporte", programacionesController.reporte);
router.post("/cargar-excel", programacionesController.uploadExcel);
router.post("/cargar-resultados", programacionesController.cargarResultados);
router.post("/publicar", programacionesController.publicar);
router.post("/eliminar", programacionesController.eliminarVarias);

router.get("/", programacionesController.getAll);
router.post("/", programacionesController.create);
router.get("/:id", programacionesController.obtener);
router.patch("/:id", programacionesController.actualizar);
router.delete("/:id", programacionesController.eliminar);
router.post("/:id/resultado", programacionesController.registrarResultado);

export default router;
