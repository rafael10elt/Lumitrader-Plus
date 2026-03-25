import Link from "next/link";

export default function ErrorPage() {
  return (
    <main className="min-h-screen px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl items-center">
        <section className="glass-panel w-full rounded-[32px] p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-red-200/80">
            Fluxo interrompido
          </p>
          <h1 className="mt-4 text-4xl font-semibold">Nao foi possivel concluir a autenticacao.</h1>
          <p className="mt-4 text-slate-300">
            Confira o email de confirmacao, tente novamente ou retorne para a tela de acesso.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex rounded-[20px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-5 py-3 font-semibold text-slate-950"
          >
            Voltar para login
          </Link>
        </section>
      </div>
    </main>
  );
}
