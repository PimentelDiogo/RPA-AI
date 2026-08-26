-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "Area" AS ENUM ('CONTABIL', 'FISCAL', 'PROCESSOS', 'DEPARTAMENTO_PESSOAL', 'SOCIETARIO', 'TECNOLOGIA', 'ATENDIMENTO', 'BPO_SAUDE');

-- CreateEnum
CREATE TYPE "Disparo" AS ENUM ('MANUAL', 'AGENDADO');

-- CreateEnum
CREATE TYPE "StatusExecucao" AS ENUM ('EM_EXECUCAO', 'SUCESSO', 'SUCESSO_PARCIAL', 'FALHA');

-- CreateEnum
CREATE TYPE "StatusItem" AS ENUM ('SUCESSO', 'FALHA', 'CONFERENCIA', 'IGNORADO');

-- CreateEnum
CREATE TYPE "TipoArtefato" AS ENUM ('ARQUIVO', 'TABELA', 'REGISTRO_DE_ENVIO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'OPERADOR',
    "areas" "Area"[] DEFAULT ARRAY[]::"Area"[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "municipio" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execucao" (
    "id" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "disparo" "Disparo" NOT NULL,
    "status" "StatusExecucao" NOT NULL DEFAULT 'EM_EXECUCAO',
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "duracaoMs" INTEGER,
    "disparadoPorId" TEXT,
    "erro" TEXT,
    "detalheTecnico" TEXT,
    "resumo" TEXT,

    CONSTRAINT "execucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execucao_item" (
    "id" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "status" "StatusItem" NOT NULL,
    "mensagem" TEXT,
    "dados" JSONB,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execucao_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artefato" (
    "id" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "tipo" "TipoArtefato" NOT NULL,
    "nome" TEXT NOT NULL,
    "mimeType" TEXT,
    "caminho" TEXT,
    "conteudo" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artefato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamento" (
    "id" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaExecucaoEm" TIMESTAMP(3),
    "proximaExecucaoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_cnpj_key" ON "cliente"("cnpj");

-- CreateIndex
CREATE INDEX "cliente_razaoSocial_idx" ON "cliente"("razaoSocial");

-- CreateIndex
CREATE INDEX "execucao_modulo_iniciadaEm_idx" ON "execucao"("modulo", "iniciadaEm" DESC);

-- CreateIndex
CREATE INDEX "execucao_status_idx" ON "execucao"("status");

-- CreateIndex
CREATE INDEX "execucao_item_execucaoId_idx" ON "execucao_item"("execucaoId");

-- CreateIndex
CREATE INDEX "artefato_execucaoId_idx" ON "artefato"("execucaoId");

-- CreateIndex
CREATE UNIQUE INDEX "agendamento_modulo_key" ON "agendamento"("modulo");

-- AddForeignKey
ALTER TABLE "execucao" ADD CONSTRAINT "execucao_disparadoPorId_fkey" FOREIGN KEY ("disparadoPorId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_item" ADD CONSTRAINT "execucao_item_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "execucao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
