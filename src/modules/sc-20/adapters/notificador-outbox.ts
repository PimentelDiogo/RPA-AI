import type { Mensagem, Notificador, Recibo } from "@/modules/sc-20/ports/notificador";

/**
 * Adapter de saída em modo outbox.
 *
 * Nenhuma mensagem deixa a aplicação: o enunciado não concede acesso real, e
 * um portal de demonstração que dispara e-mail de verdade para endereço
 * inventado é problema, não funcionalidade. O conteúdo é devolvido ao handler,
 * que o grava em `aviso_certificado` — essa tabela **é** o outbox, e é o que o
 * portal exibe no histórico.
 *
 * Onde entraria o real:
 *
 *   const cliente = new SESClient({ credentials: … });   ← credencial aqui
 *   await cliente.send(new SendEmailCommand({ … }));
 *   return { canal: "email", enviadaEm: new Date() };
 *
 * A interface não mudaria, e o resto do módulo não saberia da diferença.
 */
export class NotificadorOutbox implements Notificador {
  async enviar(mensagem: Mensagem): Promise<Recibo> {
    if (!mensagem.destinatario.email.includes("@")) {
      throw new Error(
        `Destinatário sem e-mail válido: ${mensagem.destinatario.nome}`,
      );
    }

    return { canal: "outbox", enviadaEm: new Date() };
  }
}
