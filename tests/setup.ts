/**
 * O motor de execução conversa com o banco. Nos testes, quem responde é este
 * dublê em memória: a suíte precisa provar a regra (como o status é decidido,
 * o que acontece quando o handler explode), não que o Postgres grava.
 */
import { beforeEach, vi } from "vitest";

type Registro = Record<string, unknown>;

export const bancoFake = {
  execucoes: [] as Registro[],
  itens: [] as Registro[],
  artefatos: [] as Registro[],
  agendamentos: [] as Registro[],
  clientes: [] as Registro[],
  situacoes: [] as Registro[],
  tentativas: [] as Registro[],
};

let sequencia = 0;

vi.mock("@/lib/db", () => ({
  prisma: {
    execucao: {
      create: async ({ data, select }: { data: Registro; select?: Registro }) => {
        const registro = { id: `exec-${++sequencia}`, ...data };
        bancoFake.execucoes.push(registro);
        return select ? { id: registro.id } : registro;
      },
      update: async ({ where, data }: { where: { id: string }; data: Registro }) => {
        const registro = bancoFake.execucoes.find((e) => e.id === where.id);
        if (!registro) throw new Error(`execução ${where.id} não existe`);
        Object.assign(registro, data);
        return registro;
      },
    },
    execucaoItem: {
      create: async ({ data }: { data: Registro }) => {
        const registro = { id: `item-${++sequencia}`, ...data };
        bancoFake.itens.push(registro);
        return registro;
      },
      count: async ({ where }: { where: Registro }) =>
        bancoFake.itens.filter((item) =>
          Object.entries(where).every(([campo, valor]) => item[campo] === valor),
        ).length,
    },
    artefato: {
      create: async ({ data }: { data: Registro }) => {
        const registro = { id: `art-${++sequencia}`, ...data };
        bancoFake.artefatos.push(registro);
        return registro;
      },
    },
    cliente: {
      findMany: async () => bancoFake.clientes,
    },
    consultaTentativa: {
      create: async ({ data }: { data: Registro }) => {
        const registro = { id: `tent-${++sequencia}`, ...data };
        bancoFake.tentativas.push(registro);
        return registro;
      },
    },
    situacaoFiscal: {
      findUnique: async ({
        where,
      }: {
        where: { clienteId_orgao: { clienteId: string; orgao: string } };
      }) =>
        bancoFake.situacoes.find(
          (s) =>
            s.clienteId === where.clienteId_orgao.clienteId &&
            s.orgao === where.clienteId_orgao.orgao,
        ) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { clienteId_orgao: { clienteId: string; orgao: string } };
        create: Registro;
        update: Registro;
      }) => {
        const existente = bancoFake.situacoes.find(
          (s) =>
            s.clienteId === where.clienteId_orgao.clienteId &&
            s.orgao === where.clienteId_orgao.orgao,
        );

        if (existente) {
          Object.assign(existente, update);
          return existente;
        }

        const registro = { id: `sit-${++sequencia}`, ...create };
        bancoFake.situacoes.push(registro);
        return registro;
      },
    },
    agendamento: {
      findMany: async () => bancoFake.agendamentos,
      findUnique: async ({ where }: { where: { modulo: string } }) =>
        bancoFake.agendamentos.find((a) => a.modulo === where.modulo) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { modulo: string };
        data: Registro;
      }) => {
        const registro = bancoFake.agendamentos.find((a) => a.modulo === where.modulo);
        if (!registro) throw new Error(`agendamento ${where.modulo} não existe`);
        Object.assign(registro, data);
        return registro;
      },
    },
  },
}));

beforeEach(() => {
  bancoFake.execucoes.length = 0;
  bancoFake.itens.length = 0;
  bancoFake.artefatos.length = 0;
  bancoFake.agendamentos.length = 0;
  bancoFake.clientes.length = 0;
  bancoFake.situacoes.length = 0;
  bancoFake.tentativas.length = 0;
  sequencia = 0;
});
