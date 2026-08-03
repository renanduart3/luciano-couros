import React, { useState } from "react";
import { PackageSearch, Truck } from "lucide-react";
import { FornecedoresView } from "./FornecedoresView";
import { FornecedorProdutosView } from "./FornecedorProdutosView";

export function FornecedoresModuleView() {
  const [tab, setTab] = useState<"cadastro" | "produtos">("cadastro");

  return (
    <section className="space-y-5">
      <div className="sticky top-0 z-30 -mx-1 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur print:hidden">
        <button type="button" onClick={() => setTab("cadastro")} className={`module-tab ${tab === "cadastro" ? "module-tab-active" : ""}`}>
          <Truck size={17} /> Cadastro
        </button>
        <button type="button" onClick={() => setTab("produtos")} className={`module-tab ${tab === "produtos" ? "module-tab-active" : ""}`}>
          <PackageSearch size={17} /> Produtos associados
        </button>
      </div>

      {tab === "cadastro" ? <FornecedoresView /> : <FornecedorProdutosView />}
    </section>
  );
}
