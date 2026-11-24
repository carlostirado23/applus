-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "programacion";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "seguridad";

-- CreateEnum
CREATE TYPE "programacion"."EstadoValidacion" AS ENUM ('PENDIENTE', 'PUBLICADO');

-- CreateTable
CREATE TABLE "seguridad"."usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "usuario" VARCHAR(80) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacion"."programaciones" (
    "id" SERIAL NOT NULL,
    "numero_os" VARCHAR(50) NOT NULL,
    "asignado_a" VARCHAR(150),
    "fecha_estimada_resolucion" DATE,
    "nic" VARCHAR(50),
    "nombre" VARCHAR(200),
    "direccion" VARCHAR(250),
    "barrio" VARCHAR(150),
    "municipio" VARCHAR(150),
    "formulario" VARCHAR(50) NOT NULL DEFAULT 'AFINIA',
    "creado_por" VARCHAR(80) NOT NULL,
    "insertar" BOOLEAN NOT NULL DEFAULT true,
    "validacion" "programacion"."EstadoValidacion" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "programaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "seguridad"."usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_usuario_key" ON "seguridad"."usuarios"("usuario");

-- CreateIndex
CREATE INDEX "programaciones_numero_os_idx" ON "programacion"."programaciones"("numero_os");

-- CreateIndex
CREATE INDEX "programaciones_fecha_creacion_idx" ON "programacion"."programaciones"("fecha_creacion");

-- CreateIndex
CREATE INDEX "programaciones_validacion_idx" ON "programacion"."programaciones"("validacion");
