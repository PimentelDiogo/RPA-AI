/**
 * Seed do portal — massa de dados 100% sintética.
 *
 * O enunciado exige que o portal chegue com dado dentro, não vazio: nenhum
 * acesso real é concedido, então clientes, extratos, certificados e situações
 * fiscais são gerados aqui. Nomes são inventados e o CNPJ é fictício, válido
 * apenas em formato — inclusive nos dígitos verificadores, que são calculados.
 *
 * O seed é determinístico: rodar duas vezes produz a mesma base, porque tudo é
 * declarado ou derivado de um gerador com semente fixa. Isso vale tanto para a
 * demonstração quanto para os testes.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { Area, Perfil } from "../src/generated/prisma/enums";
import { gerarHashDeSenha } from "../src/lib/auth/senha";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env antes de rodar o seed.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/**
 * Senha única das contas de demonstração. Não é segredo: o enunciado pede que
 * as credenciais sejam entregues junto com a URL pública.
 */
const SENHA_DEMO = "sheep2026";

const USUARIOS = [
  {
    email: "admin@sheepcontabil.com.br",
    nome: "Marina Alencar",
    perfil: Perfil.ADMIN,
    areas: [] as Area[],
  },
  {
    email: "processos@sheepcontabil.com.br",
    nome: "Rafael Queiroz",
    perfil: Perfil.OPERADOR,
    areas: [Area.PROCESSOS],
  },
  {
    email: "contabil@sheepcontabil.com.br",
    nome: "Beatriz Nakamura",
    perfil: Perfil.OPERADOR,
    areas: [Area.CONTABIL],
  },
] as const;

/** Clientes fictícios. Municípios e UFs reais, empresas não. */
const CLIENTES = [
  ["Padaria Trigo de Ouro Ltda", "Trigo de Ouro", "Campinas", "SP"],
  ["Transportadora Rota Sul Ltda", "Rota Sul", "Curitiba", "PR"],
  ["Clínica Vida Plena S/S", "Vida Plena", "Belo Horizonte", "MG"],
  ["Metalúrgica Ferro Forte Ltda", "Ferro Forte", "Joinville", "SC"],
  ["Comercial Bom Preço Ltda", "Bom Preço", "Ribeirão Preto", "SP"],
  ["Agropecuária Campo Verde Ltda", "Campo Verde", "Rio Verde", "GO"],
  ["Construtora Alicerce Ltda", "Alicerce", "Fortaleza", "CE"],
  ["Consultoria Norte Digital ME", "Norte Digital", "Manaus", "AM"],
  ["Restaurante Sabor da Serra Ltda", "Sabor da Serra", "Gramado", "RS"],
  ["Auto Peças Giro Rápido Ltda", "Giro Rápido", "Goiânia", "GO"],
  ["Laboratório Analisa Ltda", "Analisa", "Recife", "PE"],
  ["Escola Semear Educação Ltda", "Semear", "Niterói", "RJ"],
] as const;

/**
 * Calcula os dois dígitos verificadores de um CNPJ. Os doze primeiros dígitos
 * são inventados; os dois últimos precisam fechar, senão o dado sintético não
 * passaria por nenhuma validação de formato — e passar é justamente o ponto.
 */
function completarCnpj(base12: string): string {
  const digito = (numeros: number[]): number => {
    const pesos =
      numeros.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = numeros.reduce((total, n, i) => total + n * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const numeros = base12.split("").map(Number);
  const primeiro = digito(numeros);
  const segundo = digito([...numeros, primeiro]);
  return `${base12}${primeiro}${segundo}`;
}

async function semearUsuarios() {
  const senhaHash = await gerarHashDeSenha(SENHA_DEMO);

  for (const usuario of USUARIOS) {
    await prisma.usuario.upsert({
      where: { email: usuario.email },
      create: { ...usuario, areas: [...usuario.areas], senhaHash },
      update: { ...usuario, areas: [...usuario.areas], senhaHash },
    });
  }

  console.log(`[seed] ${USUARIOS.length} usuários (senha: ${SENHA_DEMO})`);
}

async function semearClientes() {
  for (const [indice, [razaoSocial, nomeFantasia, municipio, uf]] of CLIENTES.entries()) {
    // Base fixa por índice: o mesmo cliente recebe sempre o mesmo CNPJ.
    const cnpj = completarCnpj(`${(41_000_000 + indice * 137_711).toString().padStart(8, "0")}0001`);

    await prisma.cliente.upsert({
      where: { cnpj },
      create: { cnpj, razaoSocial, nomeFantasia, municipio, uf },
      update: { razaoSocial, nomeFantasia, municipio, uf },
    });
  }

  console.log(`[seed] ${CLIENTES.length} clientes`);
}

/**
 * Agendamento de cada módulo. A frequência sai do SDD do módulo, não do
 * catálogo: o catálogo descreve a rotina manual de hoje ("mensal"), e o que se
 * automatiza costuma valer a pena rodar mais vezes.
 */
const AGENDAMENTOS = [
  { modulo: "SC-01", cron: "0 9 * * *" },
  { modulo: "SC-02", cron: "0 6 * * *" },
  { modulo: "SC-05", cron: "0 7 * * *" },
  { modulo: "SC-20", cron: "0 8 * * *" },
] as const;

async function semearAgendamentos() {
  for (const agendamento of AGENDAMENTOS) {
    await prisma.agendamento.upsert({
      where: { modulo: agendamento.modulo },
      create: agendamento,
      // Não sobrescreve proximaExecucaoEm: rodar o seed de novo não pode
      // reprogramar o que o agendador já calculou.
      update: { cron: agendamento.cron },
    });
  }

  console.log(`[seed] ${AGENDAMENTOS.length} agendamentos`);
}

async function main() {
  await semearUsuarios();
  await semearClientes();
  await semearAgendamentos();
}

main()
  .catch((error) => {
    console.error("[seed] falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
