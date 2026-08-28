-- CreateEnum
CREATE TYPE "EstadoBloqueio" AS ENUM ('LIVRE', 'BLOQUEADO', 'PARCIAL', 'REVERTENDO');

-- CreateEnum
CREATE TYPE "DirecaoSaga" AS ENUM ('BLOQUEIO', 'DESBLOQUEIO');

-- CreateEnum
CREATE TYPE "StatusPasso" AS ENUM ('PENDENTE', 'APLICADO', 'FALHOU', 'COMPENSADO');

-- CreateTable
CREATE TABLE "bloqueio_cliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "estado" "EstadoBloqueio" NOT NULL DEFAULT 'LIVRE',
    "motivo" TEXT,
    "bloqueadoEm" TIMESTAMP(3),
    "desbloqueadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bloqueio_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saga_bloqueio" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "execucaoId" TEXT,
    "direcao" "DirecaoSaga" NOT NULL,
    "motivo" TEXT NOT NULL,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),

    CONSTRAINT "saga_bloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passo_saga" (
    "id" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "sistema" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "status" "StatusPasso" NOT NULL DEFAULT 'PENDENTE',
    "erro" TEXT,
    "estadoAnterior" JSONB,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "passo_saga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fake_registro_financeiro" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "inadimplente" BOOLEAN NOT NULL DEFAULT false,
    "marcadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fake_registro_financeiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fake_acesso_portal" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "revogadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fake_acesso_portal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fake_tarefa_cliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL,
    "responsavelOriginal" TEXT,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fake_tarefa_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fake_falha_simulada" (
    "id" TEXT NOT NULL,
    "sistema" TEXT NOT NULL,
    "falhar" BOOLEAN NOT NULL DEFAULT false,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fake_falha_simulada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bloqueio_cliente_clienteId_key" ON "bloqueio_cliente"("clienteId");

-- CreateIndex
CREATE INDEX "saga_bloqueio_clienteId_criadaEm_idx" ON "saga_bloqueio"("clienteId", "criadaEm" DESC);

-- CreateIndex
CREATE INDEX "passo_saga_sagaId_ordem_idx" ON "passo_saga"("sagaId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "fake_registro_financeiro_clienteId_key" ON "fake_registro_financeiro"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "fake_acesso_portal_clienteId_key" ON "fake_acesso_portal"("clienteId");

-- CreateIndex
CREATE INDEX "fake_tarefa_cliente_clienteId_idx" ON "fake_tarefa_cliente"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "fake_falha_simulada_sistema_key" ON "fake_falha_simulada"("sistema");

-- AddForeignKey
ALTER TABLE "bloqueio_cliente" ADD CONSTRAINT "bloqueio_cliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saga_bloqueio" ADD CONSTRAINT "saga_bloqueio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passo_saga" ADD CONSTRAINT "passo_saga_sagaId_fkey" FOREIGN KEY ("sagaId") REFERENCES "saga_bloqueio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fake_registro_financeiro" ADD CONSTRAINT "fake_registro_financeiro_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fake_acesso_portal" ADD CONSTRAINT "fake_acesso_portal_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fake_tarefa_cliente" ADD CONSTRAINT "fake_tarefa_cliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
