// Carga y valida las variables de entorno una sola vez.
// Si falta algo crítico la app falla al arrancar, no a mitad de una petición.
import "dotenv/config";

const requeridas = ["DATABASE_URL", "JWT_SECRET"];
const faltantes = requeridas.filter((k) => !process.env[k]);
if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias: ${faltantes.join(", ")}. Revisa tu archivo .env (ver .env.example).`);
}

export const env = {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: Number(process.env.PORT) || 8080,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
    // Vercel define VERCEL=1 en sus funciones; ahí no debemos hacer app.listen()
    IS_VERCEL: Boolean(process.env.VERCEL),
};
