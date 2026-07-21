import React, { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { DashboardView } from "./components/DashboardView";
import { VendaRapidaView } from "./components/VendaRapidaView";
import { VendasListaView } from "./components/VendasListaView";
import { ClientesView } from "./components/ClientesView";
import { FornecedoresView } from "./components/FornecedoresView";
import { ProdutosView } from "./components/ProdutosView";
import { ComprasView } from "./components/ComprasView";
import { PagamentosView } from "./components/PagamentosView";
import { RelatoriosView } from "./components/RelatoriosView";
import { BackupConfigView } from "./components/BackupConfigView";

export default function App() {
  const [currentView, setCurrentView] = useState("dashboard");
  const [statsKey, setStatsKey] = useState(0); // Reactive trigger for other views to refresh data
  
  // Pivot shortcut state (e.g. going from dashboard overdue alert to sales ledger)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  // Handle direct navigation to past sales from dashboard alerts
  const handleSelectSaleFromDashboard = (saleId: string) => {
    setSelectedSaleId(saleId);
    setCurrentView("vendas");
  };

  // Helper to force-update stats in other views
  const handleRefreshStats = () => {
    setStatsKey(prev => prev + 1);
  };

  const renderActiveView = () => {
    switch (currentView) {
      case "dashboard":
        return (
          <DashboardView 
            onNavigateToView={(view) => setCurrentView(view)}
            onSelectVenda={handleSelectSaleFromDashboard}
          />
        );
      case "venda-rapida":
        return (
          <VendaRapidaView 
            onSaleSaved={handleRefreshStats}
            onNavigateToView={(view) => setCurrentView(view)}
          />
        );
      case "vendas":
        return (
          <VendasListaView 
            onRefreshStats={handleRefreshStats}
            selectedSaleId={selectedSaleId}
            onClearSelectedSaleId={() => setSelectedSaleId(null)}
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
          <FornecedoresView />
        );
      case "produtos":
        return (
          <ProdutosView />
        );
      case "compras":
        return (
          <ComprasView />
        );
      case "pagamentos":
        return (
          <PagamentosView 
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
          if (view !== "vendas") {
            setSelectedSaleId(null);
          }
        }}
      />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Top Mini Header Bar */}
        <header className="bg-white border-b border-slate-200/50 px-8 py-3 flex justify-between items-center shrink-0 print:hidden">
          <div className="text-xs text-slate-400 font-bold font-mono">
            ESTADO: <span className="text-emerald-600">● ONLINE LOCAL</span>
          </div>
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
            Operação Unificada
          </div>
        </header>

        {/* Dynamic Content Viewport */}
        <div key={statsKey} className="flex-1 p-8 overflow-y-auto print:p-0 print:bg-white">
          <div className="max-w-7xl mx-auto">
            {renderActiveView()}
          </div>
        </div>

      </main>

    </div>
  );
}
