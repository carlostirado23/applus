import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import prisma from "./config/db.js";
import authMiddleware from "./src/middleware/auth.js";
import { errorHandler, notFoundHandler } from "./src/middleware/errorHandler.js";
import authRoutes from "./src/routes/auth.route.js";
import programacionesRoutes from "./src/routes/programaciones.route.js";
import tecnicoRoutes from "./src/routes/tecnico.route.js";
import usuariosRoutes from "./src/routes/usuarios.route.js";

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Rutas informativas
app.get("/", (req, res) => {
    res.json({ name: "Applus Backend", status: "ok", docs: "ver README.md" });
});

app.get("/api/health", async (req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "ok", timestamp: new Date().toISOString() });
});

// Rutas de negocio
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", authMiddleware, usuariosRoutes);
app.use("/api/programaciones", authMiddleware, programacionesRoutes);
app.use("/api/mis-programaciones", authMiddleware, tecnicoRoutes);

// 404 y errores (siempre al final)
app.use(notFoundHandler);
app.use(errorHandler);

// Servidor local. En Vercel la función importa `app` y no se escucha en un puerto.
if (!env.IS_VERCEL) {
    app.listen(env.PORT, () => {
        console.log(`Applus Backend corriendo en http://localhost:${env.PORT} (${env.NODE_ENV})`);
    });
}

export default app;
