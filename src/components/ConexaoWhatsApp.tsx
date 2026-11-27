import React, { useEffect, useState } from "react";
import { handleResponse } from "../lib/api";

type Situacao = {
  estado: "desconectado" | "conectando" | "qr" | "conectado" | "reiniciando";
  numero?: string;
  qr?: string;
  erro?: string;
  desde: string;
};
const rotulos: Record<Situacao["estado"], string> = {
  desconectado: "Desconectado",
  conectando: "Conectando…",
  qr: "Aguardando leitura do QR",
  conectado: "Conectado",
  reiniciando: "Reiniciando…",
};
const cores: Record<Situacao["estado"], string> = {
  desconectado: "bg-red-100 text-red-900",
  conectando: "bg-amber-100 text-amber-900",
  qr: "bg-amber-100 text-amber-900",
  conectado: "bg-emerald-100 text-emerald-900",
  reiniciando: "bg-amber-100 text-amber-900",
};
const botao = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal disabled:opacity-50";
const chamar = (rota = "", method = "GET") =>
  fetch("/api/automacao/whatsapp" + rota, { method }).then((r) => handleResponse<Situacao>(r));

export function ConexaoWhatsApp() {
  const [situacao, setSituacao] = useState<Situacao>();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const transitorio = !situacao || ["conectando", "qr", "reiniciando"].includes(situacao.estado);

  useEffect(() => {
    let ativo = true;
    const ler = () =>
      chamar()
        .then((s) => ativo && (setSituacao(s), setErro("")))
        .catch((e) => ativo && setErro(e.message));
    void ler();
    // Durante o pareamento o QR muda a cada ~20 s; fora disso, basta conferir de vez em quando.
    const intervalo = setInterval(ler, transitorio ? 3000 : 20000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [transitorio]);

  async function agir(acao: string, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true);
    try {
      setSituacao(await chamar("/" + acao, "POST"));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium">Conexão do WhatsApp</h4>
        {situacao && (
          <span className={`rounded-full px-2 py-0.5 text-xs ${cores[situacao.estado]}`}>
            {rotulos[situacao.estado]}
            {situacao.numero && ` · +${situacao.numero}`}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-600">
        Use um número só para os avisos. O sistema reconecta sozinho após quedas de rede. Se ficar fora por mais de
        30 minutos, o administrador recebe um aviso pelo Telegram.
      </p>
      {situacao?.erro && <p className="text-sm text-amber-900">{situacao.erro}</p>}
      {situacao?.estado === "qr" && situacao.qr && (
        <div className="space-y-1">
          <img src={situacao.qr} alt="QR para conectar o WhatsApp" className="h-56 w-56 rounded border" />
          <p className="text-xs text-slate-600">
            No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho. O QR é renovado automaticamente.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {(situacao?.estado === "desconectado" || !situacao) && (
          <button type="button" className={botao} disabled={ocupado} onClick={() => agir("conectar")}>
            Conectar
          </button>
        )}
        <button
          type="button"
          className={botao}
          disabled={ocupado}
          onClick={() => agir("reconectar")}
          title="Reinicia a conexão sem perder o pareamento"
        >
          Reconectar
        </button>
        <button
          type="button"
          className={botao}
          disabled={ocupado}
          onClick={() =>
            agir("limpar", "Desconectar o celular e apagar a sessão? Será preciso ler o QR novamente.")
          }
        >
          Desconectar e limpar sessão
        </button>
      </div>
      {erro && <p className="text-sm text-red-800">{erro}</p>}
    </div>
  );
}
