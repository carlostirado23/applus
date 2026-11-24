// Cliente Prisma único para toda la app.
// Usa el adaptador de Neon (HTTP/WebSocket) sobre la conexión POOLED de DATABASE_URL.
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { env } from "./env.js";

const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });

// En desarrollo nodemon reinicia el proceso, así que no hace falta cachear en globalThis.
// En Vercel cada instancia de la función reutiliza este módulo mientras esté "caliente".
const prisma = new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export default prisma;
