import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../lib/api";

type SituacaoConsulta = "incompleto" | "consultando" | "encontrado" | "nao_encontrado" | "erro";
type ResultadoConsulta = string | null;

const cacheConsultas = new Map<string, { resultado: ResultadoConsulta; expiraEm: number }>();
const consultasPendentes = new Map<string, Promise<ResultadoConsulta>>();

function buscarCliente(documento: string): Promise<ResultadoConsulta> {
  const cache = cacheConsultas.get(documento);
  if (cache && cache.expiraEm > Date.now()) return Promise.resolve(cache.resultado);
  if (cache) cacheConsultas.delete(documento);

  const pendente = consultasPendentes.get(documento);
  if (pendente) return pendente;

  const consulta = api.getClientePorDocumento(documento)
    .then(({ cliente }) => {
      const resultado = cliente?.nome || null;
      cacheConsultas.set(documento, {
        resultado,
        expiraEm: Date.now() + (resultado ? 5 * 60_000 : 30_000),
      });
      return resultado;
    })
    .finally(() => consultasPendentes.delete(documento));

  consultasPendentes.set(documento, consulta);
  return consulta;
}

interface Props {
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  onClienteEncontrado: (nome: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  labelClassName?: string;
  inputClassName?: string;
}

export function ClienteDocumentoLookupInput({
  label,
  hideLabel = false,
  value,
  onChange,
  onClienteEncontrado,
  placeholder,
  disabled = false,
  required = false,
  labelClassName = "",
  inputClassName = "",
}: Props) {
  const [situacao, setSituacao] = useState<SituacaoConsulta>("incompleto");
  const [emFoco, setEmFoco] = useState(false);
  const feedbackId = useId();
  const aoEncontrarRef = useRef(onClienteEncontrado);
  const timerRef = useRef<number | null>(null);
  const sequenciaRef = useRef(0);

  useEffect(() => {
    aoEncontrarRef.current = onClienteEncontrado;
  }, [onClienteEncontrado]);

  const consultar = useCallback((documento: string, exibirAusencia: boolean) => {
    const sequencia = ++sequenciaRef.current;
    setSituacao("consultando");
    buscarCliente(documento)
      .then((nome) => {
        if (sequencia !== sequenciaRef.current) return;
        if (nome) {
          setSituacao("encontrado");
          aoEncontrarRef.current(nome);
          return;
        }
        setSituacao(exibirAusencia ? "nao_encontrado" : "incompleto");
      })
      .catch(() => {
        if (sequencia === sequenciaRef.current) setSituacao("erro");
      });
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    sequenciaRef.current += 1;
    const documento = value.replace(/\D/g, "");
    if (disabled || ![11, 14].includes(documento.length)) {
      setSituacao("incompleto");
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      consultar(documento, true);
    }, 350);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      sequenciaRef.current += 1;
    };
  }, [consultar, disabled, value]);

  const consultarAoSair = () => {
    const documento = value.replace(/\D/g, "");
    if (disabled || ![11, 14].includes(documento.length)) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    consultar(documento, true);
  };

  const naoEncontrado = situacao === "nao_encontrado";
  const descricao = naoEncontrado
    ? "Cliente não encontrado"
    : situacao === "erro"
      ? "Não foi possível consultar agora"
      : situacao === "consultando"
        ? "Consultando cliente..."
        : hideLabel && emFoco && situacao === "encontrado"
          ? "Nome preenchido"
          : null;

  return <label className={labelClassName}>
    <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
    <input
      required={required}
      disabled={disabled}
      value={value}
      onChange={(event) => {
        // Invalida imediatamente a resposta do documento anterior.
        sequenciaRef.current += 1;
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        setSituacao("incompleto");
        onChange(event.target.value.slice(0, 24));
      }}
      onFocus={() => setEmFoco(true)}
      onBlur={() => { setEmFoco(false); consultarAoSair(); }}
      placeholder={placeholder}
      aria-invalid={naoEncontrado || undefined}
      aria-describedby={feedbackId}
      className={`${inputClassName} ${naoEncontrado ? "border-amber-500 bg-amber-50" : ""}`}
    />
    <span id={feedbackId} aria-live="polite" className={`mt-0.5 block ${hideLabel && !descricao ? "hidden" : "min-h-[12px]"} text-[9px] font-bold leading-3 normal-case ${naoEncontrado ? "text-amber-700" : "text-slate-500"}`}>{descricao || ""}</span>
  </label>;
}
