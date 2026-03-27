"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  tone?: "primary" | "secondary";
};

export function SubmitButton({
  idleLabel,
  pendingLabel,
  tone = "primary",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  const className = tone === "primary"
    ? "bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 text-slate-950 hover:-translate-y-0.5"
    : "border border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/16";

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`mt-5 flex w-full items-center justify-center rounded-[20px] px-4 py-3 text-base font-semibold transition-colors transition-transform disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
