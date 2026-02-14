const express = require("express");
const router = express.Router();
const programacionesController = require("../controllers/programacionesController");

// Descargar plantilla (pública o protegida, según prefieras)
router.get("/descargar-plantilla", programacionesController.descargarPlantilla);

// Subir Excel (protegida)
router.post("/cargar-excel", programacionesController.uploadExcel);

// Rutas normales (ya protegidas por el middleware en main.js)
router.get("/", programacionesController.getAll);
router.post("/", programacionesController.create);

module.exports = router;