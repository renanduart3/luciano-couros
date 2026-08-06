import React, { useEffect, useRef, useState } from "react";
import { Check, KeyRound, LockKeyhole, X } from "lucide-react";
import { api } from "../lib/api";
import { parseBrazilianNumber } from "../lib/utils";

interface PrecoAutorizadoInputProps {
  clienteId: string;
  produtoId: string;
  fornecedorId?: string | null;
  value: string;
  precoAutorizado: number;
  origem: "venda" | "orcamento" | "cadastro_cliente" | "vale";
  documentoId?: string;
  ariaLabel: string;
  className?: string;
  onAuthorized: (valorFormatado: string, valor: number) => void;
}

export function PrecoAutorizadoInput({
  clienteId,
  produtoId,
  fornecedorId,
  value,
  precoAutorizado,
  origem,
  documentoId,
  ariaLabel,
  className = "",
  onAuthorized,
}: PrecoAutorizadoInputProps) {
  const [rascunho, setRascunho] = useState(value);
  const [pin, setPin] = useState("");
  const [pinAutorizado, setPinAutorizado] = useState("");
  const [etapa, setEtapa] = useState<"bloqueado" | "pin" | "editando">("bloqueado");
  const [erro, setErro] = useState("");
  const [validando, setValidando] = useState(false);
  const inputPrecoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (etapa === "bloqueado") setRascunho(value);
  }, [value, etapa]);

  useEffect(() => {
    if (etapa === "editando") {
      inputPrecoRef.current?.focus();
      inputPrecoRef.current?.select();
    }
  }, [etapa]);

  const valorRascunho = parseBrazilianNumber(rascunho);
  const valorValido = rascunho.trim() !== "" && Number.isFinite(valorRascunho) && valorRascunho >= 0;
  const alterado = valorValido && Math.abs(valorRascunho - precoAutorizado) > 0.005;

  const handleChange = (novoValor: string) => {
    if (etapa !== "editando") return;
    setRascunho(novoValor);
    setErro("");
  };

  const fecharEdicao = () => {
    setEtapa("bloqueado");
    setRascunho(value);
    setPin("");
    setPinAutorizado("");
    setErro("");
  };

  const validarPin = async () => {
    if (pin.length < 4 || pin.length > 64) {
      setErro("Informe a senha do gerente.");
      return;
    }
    setValidando(true);
    setErro("");
    try {
      await api.verificarPinAdministrador(pin, "alterar_preco");
      setPinAutorizado(pin);
      setPin("");
      setEtapa("editando");
    } catch (error: any) {
      setPin("");
      setPinAutorizado("");
      setEtapa("pin");
      setErro(error.message || "PIN inválido. O preço continua bloqueado.");
    } finally {
      setValidando(false);
    }
  };

  const salvarPreco = async () => {
    if (!valorValido) {
      setErro("Informe um preço válido.");
      return;
    }
    if (!alterado) {
      onAuthorized(Number(precoAutorizado).toFixed(2).replace(".", ","), precoAutorizado);
      fecharEdicao();
      return;
    }
    setValidando(true);
    setErro("");
    try {
      const resultado = await api.updateClienteProdutoPreco(
        clienteId,
        produtoId,
        valorRascunho,
        pinAutorizado,
        origem,
        documentoId,
        fornecedorId
      );
      const formatado = Number(resultado.precoAutorizado).toFixed(2).replace(".", ",");
      setRascunho(formatado);
      onAuthorized(formatado, Number(resultado.precoAutorizado));
      setEtapa("bloqueado");
      setPinAutorizado("");
    } catch (error: any) {
      setRascunho(Number(precoAutorizado).toFixed(2).replace(".", ","));
      setPin("");
      setPinAutorizado("");
      setEtapa("bloqueado");
      setErro(error.message || "A autorização expirou. O preço não foi alterado.");
    } finally {
      setValidando(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center justify-end gap-1">
        <input
          ref={inputPrecoRef}
          type="text"
          inputMode="decimal"
          value={rascunho}
          onChange={(event) => handleChange(event.target.value)}
          readOnly={etapa !== "editando"}
          aria-readonly={etapa !== "editando"}
          placeholder="0,00"
          aria-label={ariaLabel}
          className={`${className} ${etapa !== "editando" ? "cursor-not-allowed bg-slate-100 text-slate-600" : ""}`}
        />
        {etapa === "bloqueado" && (
          <button type="button" onClick={() => { setEtapa("pin"); setErro(""); setPin(""); }} title="Alterar preço com PIN" aria-label={`Alterar ${ariaLabel}`} className="shrink-0 rounded-md border border-slate-300 bg-white p-1.5 text-slate-700 hover:border-amber-500 hover:text-amber-700">
            <LockKeyhole size={13} />
          </button>
        )}
        {etapa === "pin" && (
          <>
            <span className="shrink-0 text-amber-700" title="PIN necessário"><KeyRound size={13} /></span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value.slice(0, 64))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  validarPin();
                }
              }}
              placeholder="PIN"
              aria-label={`PIN para autorizar preço de ${ariaLabel}`}
              className="w-16 shrink-0 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-center text-xs font-black outline-none focus:border-amber-600"
            />
            <button type="button" disabled={validando} onClick={validarPin} title="Validar PIN" className="shrink-0 rounded-md bg-amber-600 p-1.5 text-white disabled:opacity-50">
              <Check size={13} />
            </button>
            <button type="button" onClick={fecharEdicao} title="Cancelar alteração" className="shrink-0 rounded-md border border-slate-300 bg-white p-1.5 text-slate-600"><X size={13} /></button>
          </>
        )}
        {etapa === "editando" && <>
          <button type="button" disabled={validando} onClick={salvarPreco} title="Salvar novo preço" className="shrink-0 rounded-md bg-emerald-700 p-1.5 text-white disabled:opacity-50"><Check size={13} /></button>
          <button type="button" onClick={fecharEdicao} title="Cancelar alteração" className="shrink-0 rounded-md border border-slate-300 bg-white p-1.5 text-slate-600"><X size={13} /></button>
        </>}
      </div>
      {erro && <p className="mt-1 text-right text-[9px] font-bold text-red-700">{erro}</p>}
    </div>
  );
}
