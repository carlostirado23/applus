-- CreateEnum
CREATE TYPE "seguridad"."Rol" AS ENUM ('ADMIN', 'SUPERVISOR', 'TECNICO');

-- CreateEnum
CREATE TYPE "programacion"."EstadoEjecucion" AS ENUM ('SIN_RESULTADO', 'EJECUTADA', 'NO_EJECUTADA', 'REPROGRAMADA');

-- AlterTable
ALTER TABLE "programacion"."programaciones" ADD COLUMN     "estado_ejecucion" "programacion"."EstadoEjecucion" NOT NULL DEFAULT 'SIN_RESULTADO',
ADD COLUMN     "fecha_ejecucion" DATE,
ADD COLUMN     "fecha_publicacion" TIMESTAMPTZ(6),
ADD COLUMN     "fecha_resultado" TIMESTAMPTZ(6),
ADD COLUMN     "fecha_vista" TIMESTAMPTZ(6),
ADD COLUMN     "observaciones" VARCHAR(1000),
ADD COLUMN     "publicado_por" VARCHAR(80),
ADD COLUMN     "resultado_por" VARCHAR(80),
ADD COLUMN     "tecnico_id" INTEGER;

-- AlterTable
ALTER TABLE "seguridad"."usuarios" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cedula" VARCHAR(20),
ADD COLUMN     "municipio" VARCHAR(150),
ADD COLUMN     "rol" "seguridad"."Rol" NOT NULL DEFAULT 'TECNICO',
ADD COLUMN     "telefono" VARCHAR(30);

-- CreateIndex
CREATE INDEX "programaciones_tecnico_id_validacion_idx" ON "programacion"."programaciones"("tecnico_id", "validacion");

-- CreateIndex
CREATE INDEX "programaciones_estado_ejecucion_idx" ON "programacion"."programaciones"("estado_ejecucion");

-- CreateIndex
CREATE INDEX "programaciones_fecha_estimada_resolucion_idx" ON "programacion"."programaciones"("fecha_estimada_resolucion");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cedula_key" ON "seguridad"."usuarios"("cedula");

-- CreateIndex
CREATE INDEX "usuarios_rol_activo_idx" ON "seguridad"."usuarios"("rol", "activo");

-- AddForeignKey
ALTER TABLE "programacion"."programaciones" ADD CONSTRAINT "programaciones_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "seguridad"."usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Los usuarios creados antes de existir roles eran administradores del panel.
UPDATE "seguridad"."usuarios" SET "rol" = 'ADMIN';
