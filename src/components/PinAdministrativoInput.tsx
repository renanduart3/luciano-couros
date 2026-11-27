import { useState } from "react";

type PinAdministrativoInputProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className: string;
  autoFocus?: boolean;
  required?: boolean;
  onEnter?: () => void;
};

export function PinAdministrativoInput({ value, onChange, label, className, autoFocus, required, onEnter }: PinAdministrativoInputProps) {
  const [usarSenha, setUsarSenha] = useState(false);

  return <span className="inline-flex min-w-0 w-full flex-col items-start gap-1 align-top">
    <input
      type="password"
      inputMode={usarSenha ? undefined : "numeric"}
      autoComplete="off"
      autoFocus={autoFocus}
      maxLength={usarSenha ? 64 : 4}
      pattern={usarSenha ? undefined : "[0-9]{4}"}
      required={required}
      aria-label={usarSenha ? "Senha de operação" : label}
      placeholder={usarSenha ? "Senha" : "PIN"}
      value={value}
      onChange={event => onChange(usarSenha ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 4))}
      onKeyDown={event => {
        if (event.key === "Enter" && onEnter) {
          event.preventDefault();
          onEnter();
        }
      }}
      className={className}
    />
    <button type="button" className="text-[10px] font-bold text-slate-600 underline" onClick={() => {
      onChange("");
      setUsarSenha(!usarSenha);
    }}>{usarSenha ? "Senha só com números" : "Senha com letras"}</button>
  </span>;
}
