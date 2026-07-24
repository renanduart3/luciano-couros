import React, { useState } from "react";
import { FileText, History, ShoppingCart } from "lucide-react";
import { VendaRapidaView } from "./VendaRapidaView";
import { VendasListaView } from "./VendasListaView";
import { OrcamentoView } from "./OrcamentoView";
import { Orcamento } from "../types";

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
        <div className="grid min-w-0 gap-4 xl:grid-cols-2 xl:items-start">
          <section className={`${painelMobile === "venda" ? "block" : "hidden"} min-w-0 overflow-hidden rounded-2xl border border-emerald-200 bg-slate-50 shadow-sm xl:block`}>
            <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-700 px-4 py-3 text-white">
              <div className="flex items-center gap-2"><ShoppingCart size={18} /><strong className="text-sm uppercase tracking-wide">Venda</strong></div>
              <span className="rounded-lg bg-white/15 px-2 py-1 text-[10px] font-black uppercase">Itens disponíveis</span>
            </div>
            <div className="p-3">
              <VendaRapidaView
                compact
                onSaleSaved={props.onSaleSaved}
                onNavigateToView={props.onNavigateToView}
                orcamentoInicial={orcamentoParaVenda}
                onOrcamentoCarregado={() => setOrcamentoParaVenda(null)}
              />
            </div>
          </section>

          <section className={`${painelMobile === "orcamento" ? "block" : "hidden"} min-w-0 overflow-hidden rounded-2xl border border-blue-200 bg-slate-50 shadow-sm xl:block`}>
            <div className="flex items-center justify-between border-b border-blue-200 bg-blue-700 px-4 py-3 text-white">
              <div className="flex items-center gap-2"><FileText size={18} /><strong className="text-sm uppercase tracking-wide">Orçamento</strong></div>
              <span className="rounded-lg bg-white/15 px-2 py-1 text-[10px] font-black uppercase">Marque somente faltantes</span>
            </div>
            <div className="p-3">
              <OrcamentoView
                compact
                onLevarParaVenda={(orcamento) => {
                  setOrcamentoParaVenda(orcamento);
                  setPainelMobile("venda");
                }}
              />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
