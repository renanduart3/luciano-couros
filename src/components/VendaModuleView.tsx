import React, { useState } from "react";
import { History, ShoppingCart } from "lucide-react";
import { VendaRapidaView } from "./VendaRapidaView";
import { VendasListaView } from "./VendasListaView";

interface VendaModuleViewProps {
  onSaleSaved: () => void;
  onRefreshStats?: () => void;
  selectedSaleId?: string | null;
  onClearSelectedSaleId?: () => void;
  onNavigateToView: (view: string) => void;
}

export function VendaModuleView(props: VendaModuleViewProps) {
  const [tab, setTab] = useState<"nova" | "historico">(
    props.selectedSaleId ? "historico" : "nova"
  );

  return (
    <section className="space-y-5">
      <div className="sticky top-0 z-30 -mx-1 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur print:hidden">
        <button type="button" onClick={() => setTab("nova")} className={`module-tab ${tab === "nova" ? "module-tab-active" : ""}`}>
          <ShoppingCart size={17} /> Nova venda
        </button>
        <button type="button" onClick={() => setTab("historico")} className={`module-tab ${tab === "historico" ? "module-tab-active" : ""}`}>
          <History size={17} /> Histórico e comprovantes
        </button>
      </div>

      {tab === "nova" ? (
        <VendaRapidaView onSaleSaved={props.onSaleSaved} onNavigateToView={props.onNavigateToView} />
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
