# Applus Backend

API REST para la **gestión de programaciones de órdenes de servicio** (visitas técnicas en campo) de un contratista de Afinia. El área administrativa carga las OS desde el Excel de Afinia, las cruza con los técnicos, las publica (quedan visibles para cada técnico en la app móvil), exporta un Excel para registrar resultados, lo vuelve a cargar diligenciado y genera reportes de cumplimiento. El acceso está protegido con usuarios, roles y tokens JWT.

Los registros manejan campos propios de órdenes de servicio de energía (número de OS, NIC, dirección, barrio, municipio, técnico asignado y fecha estimada de resolución). El formulario por defecto es `AFINIA`.

## Stack

| Componente | Tecnología |
| --- | --- |
| Runtime | Node.js 26 (ESM nativo, type stripping) |
| Framework HTTP | Express 5 |
| ORM / migraciones | Prisma 7 (generador `prisma-client`, adaptador `@prisma/adapter-neon`) |
| Base de datos | PostgreSQL en [Neon](https://neon.tech) |
| Autenticación | JWT (`jsonwebtoken`) + hash bcrypt (`bcryptjs`) |
| Excel | ExcelJS (plantilla, exportación, carga masiva y resultados), Multer (subida en memoria) |
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
   │  ├─ auth.js                # Verifica el JWT, lee rol/activo de BD y expone requireRol
   │  └─ errorHandler.js        # 404 y errores -> JSON con status correcto
   ├─ controllers/              # auth, usuarios, programaciones, tecnico (app móvil)
   ├─ models/                   # Lógica de negocio y acceso a datos con Prisma
   ├─ routes/                   # Definición de rutas Express
   └─ utils/                    # httpError, excel (lectura/escritura), texto, constantes
```

## Roles

| Rol | Qué puede hacer |
| --- | --- |
| `ADMIN` | Todo: gestionar usuarios y técnicos, programaciones, resultados y reportes. |
| `SUPERVISOR` | Programaciones, resultados y reportes. Ve la lista de técnicos, no edita usuarios. |
| `TECNICO` | Solo la app móvil: ve sus OS publicadas y marca que las vio. No entra al panel. |

El rol y el estado `activo` se leen de la base de datos en **cada petición**, así que desactivar un usuario o cambiarle el rol aplica de inmediato aunque su token siga vigente.

## Modelo de datos

**`seguridad.usuarios`**: `id`, `nombre`, `email` (único), `usuario` (único), `password` (hash bcrypt), `rol`, `activo`, `cedula` (única, opcional), `telefono`, `municipio` (zona del técnico), `fecha_creacion`.

**`programacion.programaciones`**:

| Campo | Descripción |
| --- | --- |
| `numero_os` | Número de orden de servicio (`SERVICEORDER`). Obligatorio. |
| `asignado_a` | Texto tal como llega en la columna `ASIGNADO_A` del Excel. |
| `tecnico_id` | Técnico (usuario con rol `TECNICO`) al que se cruzó `asignado_a`. Obligatorio para publicar. |
| `fecha_estimada_resolucion` | Fecha estimada (`F_EST_RESOL`). |
| `nic`, `nombre`, `direccion`, `barrio`, `municipio` | Datos del cliente / sitio. |
| `formulario` | Origen del formulario. Por defecto `AFINIA`. |
| `creado_por` | Usuario que cargó el registro (se toma del token). |
| `insertar` | `true` si es la primera vez que llega ese `numero_os`; `false` si ya existía (duplicado / histórico). |
| `validacion` | `PENDIENTE` (por defecto) o `PUBLICADO`. |
| `fecha_publicacion`, `publicado_por` | Quién publicó y cuándo. |
| `fecha_vista` | Cuándo la vio el técnico en la app. |
| `estado_ejecucion` | `SIN_RESULTADO` (por defecto), `EJECUTADA`, `NO_EJECUTADA` o `REPROGRAMADA`. |
| `fecha_ejecucion`, `observaciones`, `resultado_por`, `fecha_resultado` | Resultado de la visita y quién lo registró. |
| `fecha_creacion`, `fecha_actualizacion` | Auditoría automática. |

### Reglas de negocio

- **Duplicados.** Al crear programaciones (individual o por Excel) se verifica si el `numero_os` ya existe en la base de datos o apareció antes en el mismo archivo. El registro **se inserta de todas formas**, pero con `insertar = false` y sin técnico. Así se conserva el histórico. Las duplicadas **no se publican ni se asignan**. La carga masiva se hace en **una sola transacción**: si una fila es inválida, no se inserta ninguna.
- **Cruce de técnico.** Al cargar el Excel, `ASIGNADO_A` se compara (sin tildes, sin mayúsculas) con el `usuario`, la `cedula` y el `nombre` de los técnicos activos. Si coincide se guarda `tecnico_id`; si no, la OS queda "sin técnico" y hay que asignarlo desde el panel antes de publicar.
- **Publicar** exige: no duplicada, no publicada antes y con técnico. Registra `fecha_publicacion` y `publicado_por`. Desde ese momento la OS aparece en la app del técnico.
- **Eliminar** solo aplica a OS `PENDIENTE`. Las publicadas son histórico.
- **Resultados** solo se registran sobre OS publicadas. La carga del Excel de resultados es todo o nada: si una fila falla, no se guarda ninguna y se devuelven los errores por fila.

## Puesta en marcha

### Requisitos

- Node.js **26.13.1 o superior** (las versiones 26.x anteriores tienen vulnerabilidades conocidas). Con nvm: `nvm install 26.13.1 && nvm use 26.13.1`.
- Una base de datos PostgreSQL en Neon.

### Instalación

```bash
npm install            # instala dependencias y genera el cliente Prisma (postinstall)
cp .env.example .env   # y completa los valores
npm run db:deploy      # aplica las migraciones en Neon (usa la conexión directa)
npm run dev            # http://localhost:8080
```

### Primer usuario

`POST /api/auth/register` solo funciona cuando la tabla de usuarios está vacía y crea un `ADMIN`. Después responde `403`: los demás usuarios (supervisores y técnicos) los crea el administrador en `/api/usuarios` (o desde la vista Usuarios del panel).

### Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión **pooled** de Neon (host con `-pooler`). La usa la app. |
| `DATABASE_URL_UNPOOLED` | Conexión **directa** de Neon (sin `-pooler`). La usa Prisma CLI para migraciones. |
| `JWT_SECRET` | Clave para firmar los tokens. Usa un valor largo y aleatorio. |
| `JWT_EXPIRES_IN` | Vigencia del token. Por defecto `1d`. |
| `PORT` | Puerto local. Por defecto `8080`. |
| `UTC_OFFSET_MINUTES` | Desfase horario de la operación. Por defecto `-300` (Colombia). |
| `NODE_ENV` | `development` o `production`. |

Ambas URLs se copian del botón **Connect** del proyecto en Neon. Nunca subas `.env` al repositorio; solo se versiona `.env.example`.

### Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor local con recarga automática (nodemon). |
| `npm start` | Servidor local sin recarga. |
| `npm run db:generate` | Regenera el cliente Prisma tras cambiar `schema.prisma` y lo convierte a JavaScript puro (`scripts/generate-prisma.mjs`). Vercel no rastrea imports `.ts`, por eso el paso extra. |
| `npm run db:migrate` | Crea y aplica una migración en desarrollo (`prisma migrate dev`). Necesita terminal interactiva. |
| `npm run db:deploy` | Aplica migraciones pendientes (`prisma migrate deploy`). |
| `npm run db:status` | Muestra el estado de las migraciones. |
| `npm run db:studio` | Abre Prisma Studio para ver los datos. |

## API

Base: `/api`. Salvo `register` y `login`, todas las rutas requieren `Authorization: Bearer <token>`. Entre paréntesis, los roles permitidos.

### Salud

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/` | Nombre y estado del servicio. |
| GET | `/api/health` | Verifica conexión con la base de datos. |

### Autenticación

| Método | Ruta | Body | Respuesta |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ nombre, email, usuario, password }` | `201 { message, user }`. Solo si no hay usuarios; crea un `ADMIN`. |
| POST | `/api/auth/login` | `{ usuario, password }` | `200 { message, token, user }`. `user` incluye `rol`. Usuarios inactivos: `401`. |
| GET | `/api/auth/me` | | Datos del usuario en sesión. |
| PUT | `/api/auth/password` | `{ password_actual, password_nueva }` | Cambia la contraseña propia. |

### Usuarios (ADMIN)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/usuarios?rol=&activo=true|false&q=` | Lista usuarios. `q` busca en nombre, usuario, email, cédula y municipio. |
| GET | `/api/usuarios/tecnicos?inactivos=true` | Técnicos activos (ADMIN y SUPERVISOR). |
| GET | `/api/usuarios/:id` | Detalle. |
| POST | `/api/usuarios` | `{ nombre, email, usuario, password, rol, cedula?, telefono?, municipio? }`. |
| PUT | `/api/usuarios/:id` | Edita datos (no la contraseña). Un admin no puede quitarse su propio rol. |
| PATCH | `/api/usuarios/:id/activo` | `{ activo }`. Un admin no puede desactivarse a sí mismo. |
| POST | `/api/usuarios/:id/password` | `{ password }`. Restablece la contraseña. |

### Programaciones (ADMIN y SUPERVISOR)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/programaciones` | Lista con filtros (ver abajo). Sin `page` devuelve un arreglo (máx. 500); con `page` devuelve `{ data, total, page, limit, paginas }`. Cada fila incluye `tecnico { id, nombre, usuario, cedula, telefono }`. |
| GET | `/api/programaciones/:id` | Detalle con técnico. |
| POST | `/api/programaciones` | Crea una programación. `numero_os` obligatorio; `asignado_a` se cruza con los técnicos. |
| PATCH | `/api/programaciones/:id` | Edita `tecnico_id`, `asignado_a`, `nic`, `nombre`, `direccion`, `barrio`, `municipio`, `fecha_estimada_resolucion`. Al asignar técnico sin enviar `asignado_a`, se toma su nombre. |
| DELETE | `/api/programaciones/:id` | Elimina una OS pendiente. |
| POST | `/api/programaciones/eliminar` | `{ ids }`. Elimina pendientes; responde `{ message, total, eliminadas, omitidas }`. |
| GET | `/api/programaciones/descargar-plantilla` | Plantilla Excel como `{ fileName, mimeType, dataUrl }`. Con `?formato=archivo` descarga el `.xlsx`. |
| POST | `/api/programaciones/cargar-excel` | `multipart/form-data`, campo `file` (máx. 10 MB, `.xlsx`). Responde `201 { message, total, nuevas, duplicados, sin_tecnico, resultados }`. |
| POST | `/api/programaciones/publicar` | `{ ids }`. Responde `{ message, total, omitidas, resultados }`. Omitidas con motivo: duplicada, sin técnico, inexistente o ya publicada. Si no se pudo publicar ninguna, `400` con `detalles`. |
| GET | `/api/programaciones/exportar` | Excel de OS (por defecto `validacion=PUBLICADO`) con los mismos filtros del listado. Incluye columna `ID` y las columnas de resultado vacías (`ESTADO_EJECUCION` con lista desplegable, `FECHA_EJECUCION`, `OBSERVACIONES`). `?formato=archivo` descarga directo. |
| POST | `/api/programaciones/cargar-resultados` | `multipart/form-data`, campo `file`: el Excel exportado y diligenciado. Cruza por `ID` (o `SERVICEORDER`). Responde `{ message, actualizadas, sin_resultado }` o `400 { message, detalles: [{ fila, motivo }] }`. |
| POST | `/api/programaciones/:id/resultado` | `{ estado_ejecucion, fecha_ejecucion?, observaciones? }`. Resultado individual desde el panel. |
| GET | `/api/programaciones/resumen?fecha=YYYY-MM-DD` | Números del dashboard: totales, pendientes, sin técnico, vencidas, conteo por estado de ejecución, publicadas hoy, técnicos activos y el trabajo del día por técnico. |
| GET | `/api/programaciones/reporte` | Cumplimiento. `fecha_inicial`/`fecha_final` (YYYY-MM-DD, sobre fecha estimada), `agrupar=tecnico|municipio`, `tecnico_id`, `municipio`. `?formato=archivo` descarga Excel. |

**Filtros del listado y la exportación:** `fecha_inicial`, `fecha_final` (aceptan `YYYY-MM-DD` como día completo en hora Colombia, ver `UTC_OFFSET_MINUTES`, o un instante ISO exacto), `campo_fecha` (`fecha_creacion` por defecto, `fecha_publicacion`, `fecha_estimada_resolucion`, `fecha_actualizacion`), `validacion`, `estado_ejecucion` (uno o varios separados por coma), `tecnico_id` (número, o `sin` para las que no tienen), `municipio`, `insertar`, `q` (busca en OS, NIC, nombre, dirección, barrio, municipio, asignado_a, creado_por y nombre/usuario del técnico), `page`, `limit` (máx. 500), `orden=fecha_estimada`.

### App móvil (TECNICO)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/mis-programaciones?desde=ISO` | OS publicadas del técnico en sesión, ordenadas por fecha estimada. Con `desde` solo las modificadas después de esa fecha (sincronización incremental). Responde `{ sincronizado_en, total, programaciones }`. |
| POST | `/api/mis-programaciones/:id/vista` | Marca la OS como vista (guarda `fecha_vista` la primera vez). |

### Plantilla Excel de carga

Encabezados de la fila 1 (el orden no importa, se mapean por nombre; si ninguno coincide se usa este orden):

`SERVICEORDER` · `ASIGNADO_A` · `F_EST_RESOL` · `NIC` · `NOMBRE` · `DIRECCIÓN` · `BARRIO` · `MUNICIPIO`

La fecha acepta celdas de tipo fecha de Excel, `YYYY-MM-DD` o `DD/MM/YYYY`. Las filas completamente vacías se ignoran. `ASIGNADO_A` debe traer el usuario, la cédula o el nombre completo del técnico.

### Excel de resultados

Se obtiene con `exportar`, se diligencian `ESTADO_EJECUCION` (`EJECUTADA`, `NO EJECUTADA`, `REPROGRAMADA`; también se aceptan variantes como `SI`/`NO`), `FECHA_EJECUCION` y `OBSERVACIONES`, y se sube a `cargar-resultados`. La columna `ID` no debe modificarse. Las filas con `ESTADO_EJECUCION` vacío se ignoran.

### Formato de errores

Todas las respuestas de error son JSON: `{ "message": "...", "detalles"?: ... }`. Códigos usados: `400` datos inválidos, `401` sin token, token inválido, credenciales incorrectas o usuario inactivo, `403` rol sin permiso, `404` ruta o registro inexistente, `409` usuario, email o cédula ya registrados, `500` error interno.

## Despliegue en Vercel

1. Importa el repositorio en Vercel. El `vercel.json` reenvía todas las rutas a `api/index.js`, que exporta la app Express.
2. Configura en el proyecto las variables `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `JWT_SECRET` y `NODE_ENV=production`.
3. La versión de Node la fija `engines.node` (`26.x`) en `package.json`.
4. El cliente Prisma se genera en `npm install` gracias al script `postinstall`. Por eso `prisma` va en `dependencies` y no en `devDependencies`: con `NODE_ENV=production` npm no instala las de desarrollo.
5. Las migraciones **no** se aplican automáticamente. Antes de desplegar cambios de esquema ejecuta `npm run db:deploy` desde tu máquina apuntando a la base de producción.

## Mantenimiento

- Cambios de esquema: edita `prisma/schema.prisma`, corre `npm run db:migrate -- --name descripcion` (o, sin terminal interactiva, genera el SQL con `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` en una carpeta nueva de `prisma/migrations` y aplica con `npm run db:deploy`) y confirma la carpeta `prisma/migrations`.
- Dependencias: `npm outdated` y `npm audit`. Mantén Prisma fijado a la versión mayor 7 (`@prisma/client@7`, `prisma@7`, `@prisma/adapter-neon@7`) hasta decidir migrar a la 8.
- Prisma CLI no lee `.env` por sí solo; `prisma.config.js` lo carga con `dotenv`.
