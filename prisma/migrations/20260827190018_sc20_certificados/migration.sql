-- CreateEnum
CREATE TYPE "TipoCertificado" AS ENUM ('A1', 'A3');

-- CreateEnum
CREATE TYPE "FaixaVencimento" AS ENUM ('VENCIDO', 'ATE_15', 'ATE_30', 'ATE_60');

-- CreateTable
CREATE TABLE "certificado" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "tipo" "TipoCertificado" NOT NULL,
    "emissor" TEXT NOT NULL,
    "validade" DATE NOT NULL,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contato_aviso" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contato_aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aviso_certificado" (
    "id" TEXT NOT NULL,
    "certificadoId" TEXT NOT NULL,
    "contatoId" TEXT,
    "execucaoId" TEXT,
    "faixa" "FaixaVencimento" NOT NULL,
    "diasRestantes" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suprimido" BOOLEAN NOT NULL DEFAULT false,
    "motivoSupressao" TEXT,

    CONSTRAINT "aviso_certificado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracao_sc20" (
    "id" TEXT NOT NULL DEFAULT 'unica',
    "janelaDias" INTEGER NOT NULL DEFAULT 60,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_sc20_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificado_clienteId_idx" ON "certificado"("clienteId");

-- CreateIndex
CREATE INDEX "certificado_validade_idx" ON "certificado"("validade");

-- CreateIndex
CREATE INDEX "contato_aviso_clienteId_idx" ON "contato_aviso"("clienteId");

-- CreateIndex
CREATE INDEX "aviso_certificado_certificadoId_registradoEm_idx" ON "aviso_certificado"("certificadoId", "registradoEm" DESC);

-- CreateIndex
CREATE INDEX "aviso_certificado_suprimido_idx" ON "aviso_certificado"("suprimido");

-- AddForeignKey
ALTER TABLE "certificado" ADD CONSTRAINT "certificado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contato_aviso" ADD CONSTRAINT "contato_aviso_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_certificado" ADD CONSTRAINT "aviso_certificado_certificadoId_fkey" FOREIGN KEY ("certificadoId") REFERENCES "certificado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_certificado" ADD CONSTRAINT "aviso_certificado_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "contato_aviso"("id") ON DELETE SET NULL ON UPDATE CASCADE;
