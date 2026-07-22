import React, { useState } from "react";
import { Link2, ShoppingBag, Truck } from "lucide-react";
import { ComprasView } from "./ComprasView";
import { FornecedoresView } from "./FornecedoresView";
import { FornecedorProdutosView } from "./FornecedorProdutosView";

export function FornecedoresModuleView() {
  const [tab, setTab] = useState<"cadastro" | "catalogo" | "compras">("cadastro");

  return (
    <section className="space-y-5">
      <div className="sticky top-0 z-30 -mx-1 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur print:hidden">
        <button type="button" onClick={() => setTab("cadastro")} className={`module-tab ${tab === "cadastro" ? "module-tab-active" : ""}`}>
          <Truck size={17} /> Cadastro
        </button>
        <button type="button" onClick={() => setTab("catalogo")} className={`module-tab ${tab === "catalogo" ? "module-tab-active" : ""}`}>
          <Link2 size={17} /> Produtos por fornecedor
        </button>
        <button type="button" onClick={() => setTab("compras")} className={`module-tab ${tab === "compras" ? "module-tab-active" : ""}`}>
          <ShoppingBag size={17} /> Compras e custos
        </button>
      </div>

      {tab === "cadastro" ? <FornecedoresView /> : tab === "catalogo" ? <FornecedorProdutosView /> : <ComprasView />}
    </section>
  );
}
