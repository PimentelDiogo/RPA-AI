import { defineConfig } from "vitest/config";

/**
 * Testes de regra de negócio.
 *
 * O que é mockado (banco, portal de órgão, sistema de terceiro) não precisa de
 * teste; o que não pode ser falso — motor de execução, parser, régua de aviso,
 * classificação de erro — precisa. É por isso que a suíte roda em Node, sem
 * navegador: ela cobre o miolo, não a tela.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
