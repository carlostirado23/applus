// Genera el cliente Prisma y lo deja como JavaScript puro en src/generated/prisma.
//
// Pasos:
//   1. Borra src/generated/prisma (Prisma no genera sobre una carpeta con .js).
//   2. Ejecuta `prisma generate` (emite TypeScript, es lo único que soporta el generador prisma-client).
//   3. Convierte cada .ts a .js con node:module.stripTypeScriptTypes (nativo, sin dependencias).
//
// ¿Por qué el paso 3? Vercel empaqueta la función rastreando imports con @vercel/nft,
// que no entiende .ts, y los módulos internos del cliente quedaban fuera del bundle
// (ERR_MODULE_NOT_FOUND en /var/task/src/generated/prisma/...). Con .js se rastrea todo.
//
// Se ejecuta en `npm run db:generate` y en `postinstall` (ver package.json).

import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raizProyecto = join(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raizProyecto, "src", "generated", "prisma");
const require = createRequire(import.meta.url);

// 1. Limpiar
await rm(salida, { recursive: true, force: true });

// 2. prisma generate (mismo binario que `npx prisma`, portable en Windows/Linux)
const prismaCli = require.resolve("prisma/build/index.js");
execFileSync(process.execPath, [prismaCli, "generate"], { cwd: raizProyecto, stdio: "inherit" });

// 3. Convertir .ts -> .js
async function listarTs(dir) {
    const entradas = await readdir(dir, { withFileTypes: true });
    const archivos = [];
    for (const e of entradas) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) archivos.push(...(await listarTs(ruta)));
        else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) archivos.push(ruta);
    }
    return archivos;
}

const archivos = await listarTs(salida);
for (const ruta of archivos) {
    const codigo = await readFile(ruta, "utf8");
    const js = stripTypeScriptTypes(codigo, { mode: "strip" });
    await writeFile(ruta.replace(/\.ts$/, ".js"), js, "utf8");
    await rm(ruta);
}

console.log(`[generate-prisma] ${archivos.length} archivos convertidos a JavaScript en src/generated/prisma`);
