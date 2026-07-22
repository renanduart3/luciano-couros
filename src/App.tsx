import React, { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ClientesView } from "./components/ClientesView";
import { ProdutosView } from "./components/ProdutosView";
import { RelatoriosView } from "./components/RelatoriosView";
import { BackupConfigView } from "./components/BackupConfigView";
import { VendaModuleView } from "./components/VendaModuleView";
import { FornecedoresModuleView } from "./components/FornecedoresModuleView";
import { ValesView } from "./components/ValesView";

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
        <header className="bg-white border-b border-slate-200/50 px-8 py-3 hidden md:flex justify-between items-center shrink-0 print:hidden">
          <div className="text-xs text-slate-400 font-bold font-mono">
            ESTADO: <span className="text-emerald-600">● ONLINE LOCAL</span>
          </div>
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
            Operação Unificada
          </div>
        </header>

        {/* Dynamic Content Viewport */}
        <div key={statsKey} className="flex-1 overflow-y-auto px-4 pb-6 pt-20 sm:px-5 md:p-8 print:p-0 print:bg-white">
          <div className="max-w-7xl mx-auto">
            {renderActiveView()}
          </div>
        </div>

      </main>

    </div>
  );
}
