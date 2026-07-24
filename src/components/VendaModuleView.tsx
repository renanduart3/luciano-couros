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
  const [tab, setTab] = useState<"nova" | "orcamento" | "historico">(
    props.selectedSaleId ? "historico" : "nova"
  );
  const [orcamentoParaVenda, setOrcamentoParaVenda] = useState<Orcamento | null>(null);

  return (
    <section className="space-y-5">
      <div className="sticky top-0 z-30 -mx-1 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur print:hidden">
        <button type="button" onClick={() => setTab("nova")} className={`module-tab ${tab === "nova" ? "module-tab-active" : ""}`}>
          <ShoppingCart size={17} /> Nova venda
        </button>
        <button type="button" onClick={() => setTab("orcamento")} className={`module-tab ${tab === "orcamento" ? "module-tab-active" : ""}`}>
          <FileText size={17} /> Orçamento
        </button>
        <button type="button" onClick={() => setTab("historico")} className={`module-tab ${tab === "historico" ? "module-tab-active" : ""}`}>
          <History size={17} /> Histórico e comprovantes
        </button>
      </div>

      {tab === "nova" ? (
        <VendaRapidaView
          onSaleSaved={props.onSaleSaved}
          onNavigateToView={props.onNavigateToView}
          orcamentoInicial={orcamentoParaVenda}
          onOrcamentoCarregado={() => setOrcamentoParaVenda(null)}
        />
      ) : tab === "orcamento" ? (
        <OrcamentoView onLevarParaVenda={(orcamento) => {
          setOrcamentoParaVenda(orcamento);
          setTab("nova");
        }} />
      ) : (
        <VendasListaView
          onRefreshStats={props.onRefreshStats}
          selectedSaleId={props.selectedSaleId}
          onClearSelectedSaleId={props.onClearSelectedSaleId}
        />
      )}
    </section>
  );
}
