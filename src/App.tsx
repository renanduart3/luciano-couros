import React, { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ClientesView } from "./components/ClientesView";
import { ProdutosView } from "./components/ProdutosView";
import { RelatoriosView } from "./components/RelatoriosView";
import { BackupConfigView } from "./components/BackupConfigView";
import { VendaModuleView } from "./components/VendaModuleView";
import { FornecedoresModuleView } from "./components/FornecedoresModuleView";
import { ValesView } from "./components/ValesView";
import { ComprasView } from "./components/ComprasView";

export default function App() {
  const [currentView, setCurrentView] = useState("venda");
  const [statsKey, setStatsKey] = useState(0); // Reactive trigger for other views to refresh data
  
  // Pivot shortcut state (e.g. going from dashboard overdue alert to sales ledger)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  // Helper to force-update stats in other views
  const handleRefreshStats = () => {
    setStatsKey(prev => prev + 1);
  };

  const renderActiveView = () => {
    switch (currentView) {
      case "venda":
        return (
          <VendaModuleView
            onSaleSaved={handleRefreshStats}
            onRefreshStats={handleRefreshStats}
            selectedSaleId={selectedSaleId}
            onClearSelectedSaleId={() => setSelectedSaleId(null)}
            onNavigateToView={(view) => setCurrentView(view)}
          />
        );
      case "clientes":
        return (
          <ClientesView 
            onRefreshStats={handleRefreshStats}
          />
        );
      case "compra":
        return <ComprasView />;
      case "fornecedores":
        return (
          <FornecedoresModuleView />
        );
      case "produtos":
        return (
          <ProdutosView />
        );
      case "vales":
        return (
          <ValesView
            onRefreshStats={handleRefreshStats}
          />
        );
      case "relatorios":
        return (
          <RelatoriosView />
        );
      case "config":
        return (
          <BackupConfigView 
            onRefreshConfig={handleRefreshStats}
          />
        );
      default:
        return (
          <div className="p-8 text-center text-slate-500 font-medium">
            Visualização não localizada.
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        currentView={currentView}
        onViewChange={(view) => {
          setCurrentView(view);
          // If moving away from sales list, clear any selection shortcut
          if (view !== "venda") {
            setSelectedSaleId(null);
          }
        }}
      />

      {/* Main Workspace */}
      <main className="min-w-0 flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Top Mini Header Bar */}
        <header className="hidden shrink-0 items-center justify-between border-b border-slate-200/50 bg-white px-5 py-2 md:flex print:hidden">
          <div className="text-xs text-slate-400 font-bold font-mono">
            ESTADO: <span className="text-emerald-600">● ONLINE LOCAL</span>
          </div>
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
            Operação Unificada
          </div>
        </header>

        {/* Dynamic Content Viewport */}
        <div key={statsKey} className="flex-1 overflow-y-auto px-3 pb-4 pt-16 sm:px-4 md:px-5 md:py-4 print:bg-white print:p-0">
          <div className="mx-auto w-full max-w-[1800px]">
            {renderActiveView()}
          </div>
        </div>

      </main>

    </div>
  );
}
