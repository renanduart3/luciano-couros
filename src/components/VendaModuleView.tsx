import React, { useEffect, useMemo, useState } from "react";
import { FileText, History, Search, ShoppingCart, UserRound, X } from "lucide-react";
import { VendaRapidaView } from "./VendaRapidaView";
import { VendasListaView } from "./VendasListaView";
import { OrcamentoView } from "./OrcamentoView";
import { Cliente, Orcamento } from "../types";
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
  const [painelMobile, setPainelMobile] = useState<"venda" | "orcamento">("venda");
  const [orcamentoParaVenda, setOrcamentoParaVenda] = useState<Orcamento | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteDropdown, setClienteDropdown] = useState(false);

  useEffect(() => {
    api.getClientes()
      .then((lista) => setClientes(lista.filter((item) => item.ativo === 1)))
      .catch(() => setClientes([]));
  }, []);
  const clientesFiltrados = useMemo(() => clientes.filter((item) =>
    item.nome.toLowerCase().includes(clienteBusca.toLowerCase()) ||
    (item.telefone || "").includes(clienteBusca)
  ).slice(0, 10), [clientes, clienteBusca]);

  return (
    <section className="space-y-4">
      <div className="sticky top-0 z-30 -mx-1 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur print:hidden">
        {modo === "operacao" ? (
          <>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 xl:hidden">
              <button type="button" onClick={() => setPainelMobile("venda")} className={`module-tab justify-center ${painelMobile === "venda" ? "module-tab-active" : ""}`}>
                <ShoppingCart size={17} /> Venda
              </button>
              <button type="button" onClick={() => setPainelMobile("orcamento")} className={`module-tab justify-center ${painelMobile === "orcamento" ? "module-tab-active" : ""}`}>
                <FileText size={17} /> Orçamento
              </button>
            </div>
            <div className="hidden min-w-0 flex-1 items-center gap-3 px-2 xl:flex">
              <ShoppingCart size={18} className="text-emerald-700" />
              <strong className="text-sm text-slate-900">Venda e orçamento</strong>
              <span className="text-xs font-bold text-slate-400">operação lado a lado</span>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setModo("operacao")} className="module-tab module-tab-active">
            <ShoppingCart size={17} /> Voltar à operação
          </button>
        )}
        <button type="button" aria-label="Histórico" onClick={() => setModo("historico")} className={`module-tab shrink-0 ${modo === "historico" ? "module-tab-active" : ""}`}>
          <History size={17} /> <span className="hidden sm:inline">Histórico</span>
        </button>
      </div>

      {modo === "historico" ? (
        <VendasListaView
          onRefreshStats={props.onRefreshStats}
          selectedSaleId={props.selectedSaleId}
          onClearSelectedSaleId={props.onClearSelectedSaleId}
        />
      ) : (
        <>
        <section className="relative rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
            <UserRound size={17} className="text-emerald-700" /> 1. Selecione o cliente
          </div>
          {cliente ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
              <div className="min-w-0"><strong className="block truncate text-slate-950">{cliente.nome}</strong><span className="text-xs text-slate-600">{cliente.telefone || "Sem telefone"}</span></div>
              <button type="button" aria-label="Trocar cliente" onClick={() => { setCliente(null); setClienteBusca(""); setClienteDropdown(true); setOrcamentoParaVenda(null); }} className="rounded-lg p-2 text-slate-500 hover:bg-white"><X size={17} /></button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50 focus-within:border-emerald-500">
                <Search size={17} className="ml-3 text-slate-400" />
                <input autoFocus value={clienteBusca} onFocus={() => setClienteDropdown(true)} onChange={(event) => { setClienteBusca(event.target.value); setClienteDropdown(true); }} placeholder="Nome ou telefone do cliente..." className="w-full bg-transparent px-3 py-3 text-sm font-bold outline-none" />
              </div>
              {clienteDropdown && clienteBusca.trim() && (
                <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                  {clientesFiltrados.map((item) => <button key={item.id} type="button" onClick={() => { setCliente(item); setClienteBusca(item.nome); setClienteDropdown(false); setOrcamentoParaVenda(null); }} className="block w-full border-b border-slate-100 p-3 text-left hover:bg-emerald-50"><strong className="block text-sm">{item.nome}</strong><span className="text-xs text-slate-500">{item.telefone || "Sem telefone"}</span></button>)}
                  {clientesFiltrados.length === 0 && <p className="p-4 text-sm font-bold text-slate-400">Nenhum cliente encontrado.</p>}
                </div>
              )}
            </div>
          )}
        </section>
        <div className={`grid min-w-0 gap-4 xl:grid-cols-2 xl:items-start ${cliente ? "" : "pointer-events-none opacity-45"}`}>
          <section className={`${painelMobile === "venda" ? "block" : "hidden"} min-w-0 overflow-hidden rounded-2xl border border-emerald-200 bg-slate-50 shadow-sm xl:block`}>
            <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-700 px-4 py-3 text-white">
              <div className="flex items-center gap-2"><ShoppingCart size={18} /><strong className="text-sm uppercase tracking-wide">Venda</strong></div>
            </div>
            <div className="p-3">
              <VendaRapidaView
                compact
                onSaleSaved={props.onSaleSaved}
                onNavigateToView={props.onNavigateToView}
                orcamentoInicial={orcamentoParaVenda}
                onOrcamentoCarregado={() => setOrcamentoParaVenda(null)}
                clienteExterno={cliente}
                ocultarSeletorCliente
              />
            </div>
          </section>

          <section className={`${painelMobile === "orcamento" ? "block" : "hidden"} min-w-0 overflow-hidden rounded-2xl border border-blue-200 bg-slate-50 shadow-sm xl:block`}>
            <div className="flex items-center justify-between border-b border-blue-200 bg-blue-700 px-4 py-3 text-white">
              <div className="flex items-center gap-2"><FileText size={18} /><strong className="text-sm uppercase tracking-wide">Orçamento</strong></div>
            </div>
            <div className="p-3">
              <OrcamentoView
                compact
                clienteExterno={cliente}
                ocultarSeletorCliente
                onLevarParaVenda={(orcamento) => {
                  setOrcamentoParaVenda(orcamento);
                  setPainelMobile("venda");
                }}
              />
            </div>
          </section>
        </div>
        </>
      )}
    </section>
  );
}
