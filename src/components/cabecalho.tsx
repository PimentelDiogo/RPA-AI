import Link from "next/link";
import type { Session } from "next-auth";

import { Marca } from "@/components/marca";
import { ROTULO_AREA } from "@/modules/catalogo";
import { sair } from "@/app/acoes-sessao";

export function Cabecalho({ sessao }: { sessao: Session }) {
  const { user } = sessao;
  const descricaoPerfil =
    user.perfil === "ADMIN"
      ? "Administrador"
      : user.areas.map((area) => ROTULO_AREA[area]).join(", ") || "Operador";

  return (
    <header className="bg-petroleo text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="shrink-0">
          <Marca fundo="tinta" />
        </Link>

        <div className="flex items-center gap-4">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="font-mono text-[11px] text-white/70 uppercase">
              {descricaoPerfil}
            </p>
          </div>

          <form action={sair}>
            <button
              type="submit"
              className="rounded border border-white/25 px-3 py-1.5 text-sm transition-colors hover:border-turquesa hover:bg-turquesa"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
