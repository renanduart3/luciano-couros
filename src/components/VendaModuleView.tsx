import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, FileText, History, ShoppingCart, UserRound } from "lucide-react";
import { VendaRapidaView } from "./VendaRapidaView";
import { VendasListaView } from "./VendasListaView";
import { OrcamentoView } from "./OrcamentoView";
import { Cliente, Orcamento, Venda } from "../types";
import { api } from "../lib/api";

interface VendaModuleViewProps {
  onSaleSaved: () => void;
  onRefreshStats?: () => void;
  selectedSaleId?: string | null;
  onClearSelectedSaleId?: () => void;
  onNavigateToView: (view: string) => void;
}

export function VendaModuleView(props: VendaModuleViewProps) {
  const [modo, setModo] = useState<"operacao" | "historico">(
    props.selectedSaleId ? "historico" : "operacao"
  );
  const [orcamentoParaVenda, setOrcamentoParaVenda] = useState<Orcamento | null>(null);
  const [produtosNaVenda, setProdutosNaVenda] = useState<string[]>([]);
  const [orcamentoExpandido, setOrcamentoExpandido] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [vendaEmEdicao, setVendaEmEdicao] = useState<Venda | null>(null);

  useEffect(() => {
    api.getClientes()
      .then((lista) => setClientes(lista.filter((item) => item.ativo === 1)))
      .catch(() => setClientes([]));
  }, []);
  const clientesOrdenados = useMemo(
    () => clientes.filter(Boolean).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [clientes]
  );
  const selecionarCliente = (item: Cliente) => {
    setCliente(item);
    setOrcamentoParaVenda(null);
    setOrcamentoExpandido(false);
  };

  const iniciarEdicaoVenda = (venda: Venda) => {
    const clienteDaVenda = clientes.find((item) => item.id === venda.clienteId);
    if (!clienteDaVenda) return;
    setCliente(clienteDaVenda);
    setOrcamentoParaVenda(null);
    setVendaEmEdicao(venda);
    setModo("operacao");
  };

  return (
    <section className="space-y-2">
      <div className="sticky top-0 z-30 -mx-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur print:hidden">
        {modo === "operacao" ? (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
              <ShoppingCart size={18} className="text-emerald-700" />
              <strong className="text-sm text-slate-900">{vendaEmEdicao ? `Editar venda #${vendaEmEdicao.numeroSequencial}` : "Venda e orçamento"}</strong>
            </div>
        ) : (
          <button type="button" onClick={() => setModo("operacao")} className="module-tab module-tab-active">
            <ShoppingCart size={17} /> Voltar à operação
          </button>
        )}
        <button type="button" aria-label="Histórico" onClick={() => { setVendaEmEdicao(null); setModo("historico"); }} className={`module-tab shrink-0 ${modo === "historico" ? "module-tab-active" : ""}`}>
          <History size={17} /> <span className="hidden sm:inline">Histórico</span>
        </button>
      </div>

      {modo === "historico" ? (
        <VendasListaView
          onRefreshStats={props.onRefreshStats}
          selectedSaleId={props.selectedSaleId}
          onClearSelectedSaleId={props.onClearSelectedSaleId}
          onEditarVenda={iniciarEdicaoVenda}
        />
      ) : (
        <>
        <section className="relative rounded-xl border border-slate-300 bg-white p-2.5 shadow-sm">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-700">
            <UserRound size={17} className="text-emerald-700" /> 1. Selecione o cliente
          </div>
          <select
            autoFocus
            value={cliente?.id || ""}
            disabled={Boolean(vendaEmEdicao)}
            onChange={(event) => {
              const selecionado = clientesOrdenados.find((item) => item.id === event.target.value);
              if (selecionado) selecionarCliente(selecionado);
              else {
                setCliente(null);
                setOrcamentoParaVenda(null);
              }
            }}
            aria-label="Selecionar cliente para venda e orçamento"
            className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-emerald-500 disabled:bg-slate-200"
          >
            <option value="">SELECIONE O CLIENTE...</option>
            {clientesOrdenados.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.telefone ? ` — ${item.telefone}` : ""}</option>)}
          </select>
        </section>
        {cliente && <div className="min-w-0 space-y-2">
          {!vendaEmEdicao && <section className="min-w-0 overflow-hidden rounded-xl bg-slate-50 shadow-sm">
            <div className="flex items-center border-b border-blue-200 bg-blue-800 px-3 py-2 text-white">
              <div className="flex items-center gap-2"><FileText size={18} /><strong className="text-sm uppercase tracking-wide">Orçamento</strong></div>
              <button type="button" onClick={() => setOrcamentoExpandido((atual) => !atual)} className="ml-4 inline-flex items-center gap-1 rounded-md border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase hover:bg-white/20">{orcamentoExpandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{orcamentoExpandido ? "Recolher" : "Expandir"}</button>
            </div>
            {orcamentoExpandido && <div className="p-2">
              <OrcamentoView
                compact
                clienteExterno={cliente}
                ocultarSeletorCliente
                produtosNaVenda={produtosNaVenda}
                onLevarParaVenda={(orcamento) => {
                  setOrcamentoParaVenda(orcamento);
                }}
              />
            </div>}
          </section>}

          <section className="min-w-0 overflow-visible rounded-xl bg-slate-50 shadow-sm">
            <div className="flex items-center justify-between rounded-t-xl border-b border-emerald-200 bg-emerald-800 px-3 py-2 text-white">
              <div className="flex items-center gap-2"><ShoppingCart size={18} /><strong className="text-sm uppercase tracking-wide">Venda</strong></div>
            </div>
            <div className="p-2">
              <VendaRapidaView
                compact
                onSaleSaved={props.onSaleSaved}
                onNavigateToView={props.onNavigateToView}
                orcamentoInicial={orcamentoParaVenda}
                onOrcamentoCarregado={() => setOrcamentoParaVenda(null)}
                clienteExterno={cliente}
                ocultarSeletorCliente
                onItensChange={setProdutosNaVenda}
                vendaEmEdicao={vendaEmEdicao}
                onCancelarEdicao={() => {
                  setVendaEmEdicao(null);
                  setCliente(null);
                  setProdutosNaVenda([]);
                  setModo("historico");
                }}
              />
            </div>
          </section>
        </div>}
        </>
      )}
    </section>
  );
}
