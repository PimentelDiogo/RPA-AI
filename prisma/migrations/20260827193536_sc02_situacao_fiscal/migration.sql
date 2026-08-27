-- CreateEnum
CREATE TYPE "OrgaoConsultado" AS ENUM ('RECEITA_FEDERAL', 'FGTS', 'PREVIDENCIA', 'FAZENDA_ESTADUAL');

-- CreateEnum
CREATE TYPE "SituacaoApurada" AS ENUM ('REGULAR', 'IRREGULAR', 'INDISPONIVEL');

-- CreateEnum
CREATE TYPE "OrigemConsulta" AS ENUM ('HTTP', 'PLAYWRIGHT');

-- CreateTable
CREATE TABLE "situacao_fiscal" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "orgao" "OrgaoConsultado" NOT NULL,
    "situacao" "SituacaoApurada" NOT NULL,
    "detalhe" TEXT,
    "apuradaEm" TIMESTAMP(3) NOT NULL,
    "origem" "OrigemConsulta" NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "situacao_fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consulta_tentativa" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "orgao" "OrgaoConsultado" NOT NULL,
    "execucaoId" TEXT,
    "tentativa" INTEGER NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "situacao" "SituacaoApurada",
    "erro" TEXT,
    "respostaBruta" TEXT,
    "origem" "OrigemConsulta" NOT NULL,
    "duracaoMs" INTEGER NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consulta_tentativa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "situacao_fiscal_situacao_idx" ON "situacao_fiscal"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "situacao_fiscal_clienteId_orgao_key" ON "situacao_fiscal"("clienteId", "orgao");

-- CreateIndex
CREATE INDEX "consulta_tentativa_clienteId_orgao_iniciadaEm_idx" ON "consulta_tentativa"("clienteId", "orgao", "iniciadaEm" DESC);

-- CreateIndex
CREATE INDEX "consulta_tentativa_sucesso_idx" ON "consulta_tentativa"("sucesso");

-- AddForeignKey
ALTER TABLE "situacao_fiscal" ADD CONSTRAINT "situacao_fiscal_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consulta_tentativa" ADD CONSTRAINT "consulta_tentativa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
