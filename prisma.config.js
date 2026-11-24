// Configuración de Prisma CLI (migraciones, generate, studio).
// Prisma 7 no carga .env por sí solo, por eso importamos dotenv primero.
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Para migraciones se usa la conexión DIRECTA de Neon (sin -pooler).
// El pooler (PgBouncer en modo transacción) deja advisory locks colgados
// y Prisma Migrate falla con P1002.
//
// `prisma generate` (postinstall, build de Vercel) no necesita conectarse,
// así que si falta la variable no rompemos la instalación: avisamos y seguimos.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgresql://sin-configurar";

if (!process.env.DATABASE_URL_UNPOOLED) {
    console.warn("[prisma.config] DATABASE_URL_UNPOOLED no está definida. 'prisma generate' funciona, pero para migraciones define la URL directa de Neon en .env.");
}

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: { url },
});
