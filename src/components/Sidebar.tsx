import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, Zap, History, Users, Truck, Package, ShoppingCart, DollarSign, BarChart3, Settings,
  ChevronLeft, ChevronRight
} from "lucide-react";
import logo from "../img/logo.png";

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("sidebar_collapsed");
      return saved === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("sidebar_collapsed", String(isCollapsed));
    } catch (err) {
      console.error("Erro ao persistir preferência do menu:", err);
    }
  }, [isCollapsed]);

  const menuItems = [
    { id: "dashboard", label: "Painel Principal", compactLabel: "Painel", icon: LayoutDashboard },
    { id: "venda-rapida", label: "Nova Venda", compactLabel: "Nova venda", icon: Zap, highlight: true },
    { id: "vendas", label: "Vendas Realizadas", compactLabel: "Vendas", icon: History },
    { id: "clientes", label: "Clientes", compactLabel: "Clientes", icon: Users },
    { id: "fornecedores", label: "Fornecedores", compactLabel: "Fornecedores", icon: Truck },
    { id: "produtos", label: "Materiais & Produtos", compactLabel: "Produtos", icon: Package },
    { id: "compras", label: "Compras", compactLabel: "Compras", icon: ShoppingCart },
    { id: "pagamentos", label: "Pagamentos", compactLabel: "Pagamentos", icon: DollarSign },
    { id: "relatorios", label: "Relatórios Gerenciais", compactLabel: "Relatórios", icon: BarChart3 },
    { id: "config", label: "Ajustes & Backups", compactLabel: "Ajustes", icon: Settings },
  ];

  return (
    <aside 
      className={`relative transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-20" : "w-64"
      } bg-slate-900 text-slate-100 flex flex-col h-screen sticky top-0 border-r border-slate-800 shrink-0 select-none`}
    >
      {/* Floating Collapse Toggle Button */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-8 -right-3 z-50 bg-slate-800 hover:bg-emerald-600 border border-slate-700 hover:border-emerald-500 text-slate-300 hover:text-white rounded-full p-1 shadow-lg transition-all duration-200 cursor-pointer"
        title={isCollapsed ? "Expandir menu" : "Recolher menu"}
        aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
        aria-expanded={!isCollapsed}
      >
        {isCollapsed ? <ChevronRight size={13} className="stroke-[3]" /> : <ChevronLeft size={13} className="stroke-[3]" />}
      </button>

      {/* Header Area */}
      <div
        className={`flex items-center justify-center overflow-hidden border-b border-slate-200 bg-white transition-all duration-300 ${
          isCollapsed ? "h-20 px-1" : "h-40 px-4"
        }`}
      >
        <img
          src={logo}
          alt="Luciano Couros"
          title="Luciano Couros"
          className={`block object-contain transition-all duration-300 ${
            isCollapsed ? "h-14 w-14" : "h-36 w-52"
          }`}
        />
      </div>

      {/* Menu Navigation items */}
      <nav className={`flex-1 ${isCollapsed ? "px-1.5 py-3" : "p-4"} space-y-1.5 overflow-y-auto custom-scrollbar`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center ${
                isCollapsed ? "min-h-11 flex-col justify-center gap-1 px-1 py-2 text-center" : "gap-3 px-3 py-2.5"
              } rounded-lg text-sm font-medium transition-all duration-150 text-left cursor-pointer group relative ${
                isActive
                  ? item.highlight
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : isCollapsed
                    ? "bg-slate-800 text-emerald-400 ring-1 ring-inset ring-emerald-500/60"
                    : "bg-slate-800 text-emerald-400 border-l-4 border-emerald-500 pl-2"
                  : item.highlight
                  ? "bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60 border border-emerald-800/30"
                  : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
              title={isCollapsed ? item.label : undefined}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={18} className={`${isActive ? "text-current" : "text-slate-400 group-hover:text-slate-200"} shrink-0`} />
              
              {!isCollapsed && (
                <span className="truncate transition-opacity duration-200">{item.label}</span>
              )}

              {isCollapsed && (
                <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[9px] font-semibold leading-none tracking-tight">
                  {item.compactLabel}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className={`border-t border-slate-800 bg-slate-950/40 text-xs text-slate-500 text-center transition-all duration-300 ${
        isCollapsed ? "py-4 px-1 text-[10px] font-mono" : "p-4"
      }`}>
        {isCollapsed ? "v1.0" : "v1.0.0 • Offline Autônomo"}
      </div>
    </aside>
  );
}
