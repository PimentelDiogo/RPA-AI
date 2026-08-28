-- CreateEnum
CREATE TYPE "OrigemLeitura" AS ENUM ('PARSER', 'IA');

-- CreateEnum
CREATE TYPE "ConfiancaLancamento" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');

-- CreateEnum
CREATE TYPE "StatusExtrato" AS ENUM ('RECEBIDO', 'PROCESSADO', 'FALHOU');

-- CreateTable
CREATE TABLE "arquivo_armazenado" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivo_armazenado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extrato_importado" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "execucaoId" TEXT,
    "arquivoNome" TEXT NOT NULL,
    "arquivoChave" TEXT NOT NULL,
    "arquivoHash" TEXT NOT NULL,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "competenciaInicio" DATE,
    "competenciaFim" DATE,
    "saldoInicial" DECIMAL(14,2),
    "saldoFinal" DECIMAL(14,2),
    "origemLeitura" "OrigemLeitura",
    "parserUsado" TEXT,
    "status" "StatusExtrato" NOT NULL DEFAULT 'RECEBIDO',
    "erro" TEXT,
    "diferencaSaldo" DECIMAL(14,2),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extrato_importado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamento" (
    "id" TEXT NOT NULL,
    "extratoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "historico" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "confianca" "ConfiancaLancamento" NOT NULL,
    "motivoConferencia" TEXT,
    "conferido" BOOLEAN NOT NULL DEFAULT false,
    "conferidoPorId" TEXT,
    "conferidoEm" TIMESTAMP(3),

    CONSTRAINT "lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arquivo_armazenado_chave_key" ON "arquivo_armazenado"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "extrato_importado_arquivoHash_key" ON "extrato_importado"("arquivoHash");

-- CreateIndex
CREATE INDEX "extrato_importado_clienteId_criadoEm_idx" ON "extrato_importado"("clienteId", "criadoEm" DESC);

-- CreateIndex
CREATE INDEX "extrato_importado_status_idx" ON "extrato_importado"("status");

-- CreateIndex
CREATE INDEX "lancamento_extratoId_ordem_idx" ON "lancamento"("extratoId", "ordem");

-- CreateIndex
CREATE INDEX "lancamento_confianca_idx" ON "lancamento"("confianca");

-- AddForeignKey
ALTER TABLE "extrato_importado" ADD CONSTRAINT "extrato_importado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_extratoId_fkey" FOREIGN KEY ("extratoId") REFERENCES "extrato_importado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_conferidoPorId_fkey" FOREIGN KEY ("conferidoPorId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
