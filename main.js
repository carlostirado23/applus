const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authMiddleware = require("./src/middleware/auth");
const authRoutes = require("./src/routes/auth.route");
const programacionesRoutes = require("./src/routes/programaciones.route");

const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/programaciones", authMiddleware, programacionesRoutes);

// Ruta raíz
app.get("/", (req, res) => {
    res.send("Applus Backend funcionando 🚀");
});

// Levantar servidor SOLO en local
if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
}

// 🔹 Export necesario para Vercel
module.exports = app;
