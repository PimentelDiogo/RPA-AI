import { beforeEach, describe, expect, it } from "vitest";

import {
  OrgaoConsultado,
  OrigemConsulta,
  SituacaoApurada,
  StatusItem,
} from "@/generated/prisma/enums";
import type { ContextoExecucao, ItemRegistrado } from "@/lib/execucao/motor";
import { handlerSc02 } from "@/modules/sc-02/handler";
import type {
  ConsultaOrgao,
  ResultadoConsulta,
} from "@/modules/sc-02/ports/consulta-orgao";
import { bancoFake } from "./setup";

/**
 * A armadilha do SC-02: "consulta que falhou não pode sumir. Guarde a
 * tentativa, o erro e a hora, senão ninguém sabe se o cliente está regular ou
 * se o robô não conseguiu perguntar."
 *
 * Estes testes exercitam o handler com o port dublado — nenhum portal envolvido.
 */

const POLITICA = { tentativas: 3, esperaBaseMs: 0, concorrencia: 4 };

/** Só um órgão de cada vez, para os números do teste serem legíveis. */
function apenasReceita() {
  bancoFake.clientes.push({
    id: "cli-1",
    cnpj: "41688555000155",
    razaoSocial: "Padaria Trigo de Ouro Ltda",
    nomeFantasia: "Trigo de Ouro",
  });
}

const itens: ItemRegistrado[] = [];

const contexto: ContextoExecucao = {
  execucaoId: "exec-teste",
  async registrarItem(item) {
    itens.push(item);
  },
  async registrarArtefato() {},
};

/**
 * Dublê do port. A sequência de respostas é contada **por par cliente × órgão**:
 * a fila processa vários pares ao mesmo tempo, e um contador único faria as
 * respostas vazarem de um par para o outro.
 */
function adapterQue(...respostas: ResultadoConsulta[]): ConsultaOrgao {
  const chamadas = new Map<string, number>();

  return {
    origem: OrigemConsulta.HTTP,
    async consultar(cnpj, orgao) {
      const chave = `${cnpj}:${orgao}`;
      const indice = chamadas.get(chave) ?? 0;
      chamadas.set(chave, indice + 1);
      return respostas[Math.min(indice, respostas.length - 1)];
    },
  };
}

const leituraBoa = (situacao: SituacaoApurada): ResultadoConsulta => ({
  sucesso: true,
  situacao,
  detalhe: situacao === "IRREGULAR" ? "Débito em cobrança" : undefined,
  respostaBruta: "<html/>",
  origem: OrigemConsulta.HTTP,
  duracaoMs: 12,
});

const falha = (erro: string): ResultadoConsulta => ({
  sucesso: false,
  erro,
  origem: OrigemConsulta.HTTP,
  duracaoMs: 2500,
});

beforeEach(() => {
  itens.length = 0;
});

describe("leitura bem-sucedida", () => {
  it("grava a situação apurada e registra a tentativa", async () => {
    apenasReceita();

    await handlerSc02(contexto, adapterQue(leituraBoa(SituacaoApurada.IRREGULAR)), POLITICA);

    const daReceita = bancoFake.situacoes.filter(
      (s) => s.orgao === OrgaoConsultado.RECEITA_FEDERAL,
    );
    expect(daReceita).toHaveLength(1);
    expect(daReceita[0]).toMatchObject({ situacao: SituacaoApurada.IRREGULAR });

    // Uma tentativa por órgão, todas bem-sucedidas.
    expect(bancoFake.tentativas.every((t) => t.sucesso === true)).toBe(true);
  });
});

describe("consulta que falhou", () => {
  it("registra TODAS as tentativas, não só a última", async () => {
    apenasReceita();

    await handlerSc02(contexto, adapterQue(falha("O portal não respondeu.")), POLITICA);

    const daReceita = bancoFake.tentativas.filter(
      (t) => t.orgao === OrgaoConsultado.RECEITA_FEDERAL,
    );

    expect(daReceita.map((t) => t.tentativa)).toEqual([1, 2, 3]);
    expect(daReceita.every((t) => t.sucesso === false)).toBe(true);
    expect(daReceita.every((t) => typeof t.erro === "string")).toBe(true);
  });

  it("NÃO sobrescreve nem apaga a última leitura bem-sucedida", async () => {
    // É o coração da armadilha: um cliente regular cuja consulta falhou hoje
    // continua regular no painel, com a idade do dado à vista — e nunca
    // aparece como irregular.
    apenasReceita();

    await handlerSc02(contexto, adapterQue(leituraBoa(SituacaoApurada.REGULAR)), POLITICA);

    const antes = bancoFake.situacoes.map((s) => ({ ...s }));
    expect(antes.every((s) => s.situacao === SituacaoApurada.REGULAR)).toBe(true);

    itens.length = 0;
    await handlerSc02(contexto, adapterQue(falha("O portal está fora do ar.")), POLITICA);

    const depois = bancoFake.situacoes;
    expect(depois).toHaveLength(antes.length);
    expect(depois.every((s) => s.situacao === SituacaoApurada.REGULAR)).toBe(true);
    expect(depois.map((s) => s.apuradaEm)).toEqual(antes.map((s) => s.apuradaEm));
  });

  it("diz ao operador o que ainda se sabe, em vez de deixá-lo no escuro", async () => {
    apenasReceita();

    await handlerSc02(contexto, adapterQue(leituraBoa(SituacaoApurada.REGULAR)), POLITICA);

    itens.length = 0;
    await handlerSc02(contexto, adapterQue(falha("O portal está fora do ar.")), POLITICA);

    const falhas = itens.filter((item) => item.status === StatusItem.FALHA);
    expect(falhas.length).toBeGreaterThan(0);
    expect(falhas[0].mensagem).toContain("fora do ar");
    expect(falhas[0].mensagem).toContain("última situação conhecida");
  });

  it("avisa quando nunca houve leitura boa daquele par", async () => {
    apenasReceita();

    await handlerSc02(contexto, adapterQue(falha("A sessão expirou.")), POLITICA);

    const falhas = itens.filter((item) => item.status === StatusItem.FALHA);
    expect(falhas[0].mensagem).toContain("Nunca houve leitura bem-sucedida");
  });
});

describe("portal que volta a funcionar", () => {
  it("aproveita a tentativa que deu certo e guarda as que falharam", async () => {
    apenasReceita();

    // Falha, falha, sucesso — o retry salva a rodada, e as duas falhas ficam
    // registradas para quem for auditar depois.
    await handlerSc02(
      contexto,
      adapterQue(
        falha("O portal não respondeu."),
        falha("O portal não respondeu."),
        leituraBoa(SituacaoApurada.REGULAR),
      ),
      POLITICA,
    );

    const daReceita = bancoFake.tentativas.filter(
      (t) => t.orgao === OrgaoConsultado.RECEITA_FEDERAL,
    );

    expect(daReceita.map((t) => t.sucesso)).toEqual([false, false, true]);
    expect(
      bancoFake.situacoes.find((s) => s.orgao === OrgaoConsultado.RECEITA_FEDERAL),
    ).toMatchObject({ situacao: SituacaoApurada.REGULAR });

    const falhasNoHistorico = itens.filter(
      (item) => item.status === StatusItem.FALHA,
    );
    expect(falhasNoHistorico).toHaveLength(0);
  });
});
