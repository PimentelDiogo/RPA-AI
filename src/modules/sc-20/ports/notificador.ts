/**
 * Fronteira de notificação do SC-20.
 *
 * **Aqui entra o provedor de verdade.** Hoje existe um único adapter, o
 * outbox: a mensagem é gravada e mostrada no portal, e não sai para lugar
 * nenhum. Um adapter real (SES, Resend, API de WhatsApp) implementa esta mesma
 * interface e recebe a credencial por variável de ambiente — nenhuma outra
 * parte do módulo muda.
 */

export type Destinatario = {
  nome: string;
  email: string;
};

export type Mensagem = {
  destinatario: Destinatario;
  assunto: string;
  corpo: string;
};

export type Recibo = {
  /** Por onde a mensagem saiu. Vai para o histórico, para não haver dúvida. */
  canal: string;
  enviadaEm: Date;
};

export interface Notificador {
  enviar(mensagem: Mensagem): Promise<Recibo>;
}
