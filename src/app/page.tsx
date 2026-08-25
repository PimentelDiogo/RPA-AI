/**
 * Placeholder de bootstrap. A home real — lista dos módulos implementados,
 * atrás de login — entra junto com o núcleo do portal.
 */
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <section className="w-full max-w-xl rounded-lg border border-border bg-surface p-8 shadow-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
          SheepContabil
        </p>
        <h1 className="mt-2 text-3xl text-brand">Portal de Automações</h1>
        <p className="mt-4 text-sm text-text-muted">
          Ambiente provisionado. A autenticação e os módulos das automações
          <span className="font-mono"> SC-01</span>,
          <span className="font-mono"> SC-02</span>,
          <span className="font-mono"> SC-05</span> e
          <span className="font-mono"> SC-20</span> entram a seguir.
        </p>
      </section>
    </main>
  );
}
