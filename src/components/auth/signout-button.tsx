"use client";

import { useState } from "react";

export function SignoutButton({
  action,
  label = "Encerrar sessao",
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="glass-panel w-full max-w-md rounded-[28px] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Confirmacao</p>
            <h3 className="mt-3 text-2xl font-semibold">Deseja encerrar a sessao?</h3>
            <p className="mt-3 text-sm text-slate-300">Voce sera redirecionado para a tela de login.</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200"
              >
                Cancelar
              </button>
              <form action={action} className="flex-1">
                <button className="w-full rounded-[18px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950">
                  Confirmar
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
