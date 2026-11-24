# Applus Backend

API REST para la **gestión de programaciones de órdenes de servicio** (visitas técnicas en campo). Permite cargar programaciones de forma individual o masiva desde un archivo Excel, detectar órdenes duplicadas, consultarlas por rango de fechas y publicarlas una vez validadas. El acceso está protegido con usuarios y tokens JWT.

Los registros manejan campos propios de órdenes de servicio de energía (número de OS, NIC, dirección, barrio, municipio, técnico asignado y fecha estimada de resolución). El formulario por defecto es `AFINIA`.

## Stack

| Componente | Tecnología |
| --- | --- |
| Runtime | Node.js 26 (ESM nativo, type stripping) |
| Framework HTTP | Express 5 |
| ORM / migraciones | Prisma 7 (generador `prisma-client`, adaptador `@prisma/adapter-neon`) |
| Base de datos | PostgreSQL en [Neon](https://neon.tech) |
| Autenticación | JWT (`jsonwebtoken`) + hash bcrypt (`bcryptjs`) |
| Excel | ExcelJS (plantilla y carga masiva), Multer (subida en memoria) |
| Despliegue | Vercel Functions (`api/index.js`) |

## Estructura del proyecto

```
applus/
├─ main.js                      # App Express: middlewares, rutas, 404 y manejo de errores
├─ api/index.js                 # Entrada para Vercel (reexporta la app)
├─ vercel.json                  # Reenvía todas las rutas a api/index.js
├─ prisma.config.js             # Config de Prisma CLI (usa DATABASE_URL_UNPOOLED)
├─ prisma/
│  ├─ schema.prisma             # Modelos Usuario y Programacion (esquemas seguridad y programacion)
│  └─ migrations/               # Migraciones SQL versionadas
├─ config/
│  ├─ env.js                    # Carga y valida variables de entorno
│  └─ db.js                     # Cliente Prisma único (adaptador Neon)
└─ src/
   ├─ generated/prisma/         # Cliente Prisma generado (ignorado en git)
   ├─ middleware/
   │  ├─ auth.js                # Verifica el JWT y deja req.user
   │  └─ errorHandler.js        # 404 y errores -> JSON con status correcto
   ├─ controllers/              # Reciben la petición y responden
   ├─ models/                   # Lógica de negocio y acceso a datos con Prisma
   ├─ routes/                   # Definición de rutas Express
   └─ utils/httpError.js        # Errores con código HTTP
```

## Modelo de datos

**`seguridad.usuarios`**: `id`, `nombre`, `email` (único), `usuario` (único), `password` (hash bcrypt), `fecha_creacion`.

**`programacion.programaciones`**:

| Campo | Descripción |
| --- | --- |
| `numero_os` | Número de orden de servicio (`SERVICEORDER`). Obligatorio. |
| `asignado_a` | Técnico o cuadrilla asignada. |
| `fecha_estimada_resolucion` | Fecha estimada (`F_EST_RESOL`). |
| `nic`, `nombre`, `direccion`, `barrio`, `municipio` | Datos del cliente / sitio. |
| `formulario` | Origen del formulario. Por defecto `AFINIA`. |
| `creado_por` | Usuario que cargó el registro (se toma del token). |
| `insertar` | `true` si es la primera vez que llega ese `numero_os`; `false` si ya existía (duplicado / histórico). |
| `validacion` | `PENDIENTE` (por defecto) o `PUBLICADO`. |
| `fecha_creacion`, `fecha_actualizacion` | Auditoría automática. |

### Regla de negocio: duplicados

Al crear programaciones (individual o por Excel) se verifica si el `numero_os` ya existe en la base de datos o apareció antes en el mismo archivo. El registro **se inserta de todas formas**, pero con `insertar = false`. Así se conserva el histórico y el front puede distinguir la carga nueva de la repetida. La carga masiva se hace en **una sola transacción**: si una fila es inválida, no se inserta ninguna.

## Puesta en marcha

### Requisitos

- Node.js **26.13.1 o superior** (las versiones 26.x anteriores tienen vulnerabilidades conocidas). Con nvm: `nvm install 26.13.1 && nvm use 26.13.1`.
- Una base de datos PostgreSQL en Neon.

### Instalación

```bash
npm install            # instala dependencias y genera el cliente Prisma (postinstall)
cp .env.example .env   # y completa los valores
npm run db:migrate     # crea las tablas en Neon (usa la conexión directa)
npm run dev            # http://localhost:8080
```

### Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión **pooled** de Neon (host con `-pooler`). La usa la app. |
| `DATABASE_URL_UNPOOLED` | Conexión **directa** de Neon (sin `-pooler`). La usa Prisma CLI para migraciones. |
| `JWT_SECRET` | Clave para firmar los tokens. Usa un valor largo y aleatorio. |
| `JWT_EXPIRES_IN` | Vigencia del token. Por defecto `1d`. |
| `PORT` | Puerto local. Por defecto `8080`. |
| `NODE_ENV` | `development` o `production`. |

Ambas URLs se copian del botón **Connect** del proyecto en Neon. Nunca subas `.env` al repositorio; solo se versiona `.env.example`.

### Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor local con recarga automática (nodemon). |
| `npm start` | Servidor local sin recarga. |
| `npm run db:generate` | Regenera el cliente Prisma tras cambiar `schema.prisma` y lo convierte a JavaScript puro (`scripts/generate-prisma.mjs`). Vercel no rastrea imports `.ts`, por eso el paso extra. |
| `npm run db:migrate` | Crea y aplica una migración en desarrollo (`prisma migrate dev`). |
| `npm run db:deploy` | Aplica migraciones pendientes en producción (`prisma migrate deploy`). |
| `npm run db:status` | Muestra el estado de las migraciones. |
| `npm run db:studio` | Abre Prisma Studio para ver los datos. |

## API

Base: `/api`. Todas las rutas de programaciones requieren el header `Authorization: Bearer <token>`.

### Salud

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/` | Nombre y estado del servicio. |
| GET | `/api/health` | Verifica conexión con la base de datos. |

### Autenticación

| Método | Ruta | Body | Respuesta |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ nombre, email, usuario, password }` (password mínimo 8 caracteres) | `201 { message, user }` |
| POST | `/api/auth/login` | `{ usuario, password }` | `200 { message, token, user }` |

### Programaciones (requieren token)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/programaciones` | Lista todas. Filtros opcionales `?fecha_inicial=YYYY-MM-DD&fecha_final=YYYY-MM-DD` sobre `fecha_creacion`. |
| POST | `/api/programaciones` | Crea una programación. Body con los campos del modelo; `numero_os` es obligatorio. `creado_por` se toma del token. |
| GET | `/api/programaciones/descargar-plantilla` | Devuelve la plantilla Excel como `{ fileName, mimeType, dataUrl }`. Con `?formato=archivo` descarga el `.xlsx` directamente. |
| POST | `/api/programaciones/cargar-excel` | `multipart/form-data` con el archivo en el campo `file` (máx. 10 MB, solo `.xlsx`). Responde `201 { message, total, nuevas, duplicados, resultados }`. |
| POST | `/api/programaciones/publicar` | Body `{ ids: [1, 2, 3] }`. Cambia `validacion` a `PUBLICADO` y devuelve las filas actualizadas. |

### Plantilla Excel

Encabezados de la fila 1 (el orden no importa, se mapean por nombre; si no coinciden se usa este orden):

`SERVICEORDER` · `ASIGNADO_A` · `F_EST_RESOL` · `NIC` · `NOMBRE` · `DIRECCIÓN` · `BARRIO` · `MUNICIPIO`

La fecha acepta celdas de tipo fecha de Excel, `YYYY-MM-DD` o `DD/MM/YYYY`. Las filas completamente vacías se ignoran.

### Formato de errores

Todas las respuestas de error son JSON: `{ "message": "...", "detalles"?: ... }`. Códigos usados: `400` datos inválidos, `401` sin token o token inválido / credenciales incorrectas, `404` ruta o registro inexistente, `409` usuario o email ya registrado, `500` error interno.

## Despliegue en Vercel

1. Importa el repositorio en Vercel. El `vercel.json` reenvía todas las rutas a `api/index.js`, que exporta la app Express.
2. Configura en el proyecto las variables `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `JWT_SECRET` y `NODE_ENV=production`.
3. La versión de Node la fija `engines.node` (`26.x`) en `package.json`.
4. El cliente Prisma se genera en `npm install` gracias al script `postinstall`. Por eso `prisma` va en `dependencies` y no en `devDependencies`: con `NODE_ENV=production` npm no instala las de desarrollo.
5. Las migraciones **no** se aplican automáticamente. Antes de desplegar cambios de esquema ejecuta `npm run db:deploy` desde tu máquina (o en un paso de build) apuntando a la base de producción.

## Mantenimiento

- Cambios de esquema: edita `prisma/schema.prisma`, corre `npm run db:migrate -- --name descripcion` y confirma la carpeta `prisma/migrations`.
- Dependencias: `npm outdated` y `npm audit`. Mantén Prisma fijado a la versión mayor 7 (`@prisma/client@7`, `prisma@7`, `@prisma/adapter-neon@7`) hasta decidir migrar a la 8.
- Prisma CLI no lee `.env` por sí solo; `prisma.config.js` lo carga con `dotenv`.
