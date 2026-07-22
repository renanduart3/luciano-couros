import React, { useEffect, useState } from "react";
import {
  BarChart3, ChevronLeft, ChevronRight, FileClock,
  Menu, Package, Settings, ShoppingCart, Truck, Users, X
} from "lucide-react";
import logo from "../img/logo.png";

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

const menuItems = [
  { id: "venda", label: "Venda", compactLabel: "Venda", icon: ShoppingCart, highlight: true },
  { id: "fornecedores", label: "Fornecedores", compactLabel: "Fornec.", icon: Truck },
  { id: "clientes", label: "Clientes", compactLabel: "Clientes", icon: Users },
  { id: "vales", label: "Vales", compactLabel: "Vales", icon: FileClock },
  { id: "produtos", label: "Produtos e materiais", compactLabel: "Produtos", icon: Package },
  { id: "relatorios", label: "Relatórios", compactLabel: "Relatórios", icon: BarChart3 },
  { id: "config", label: "Configurações", compactLabel: "Config.", icon: Settings },
];

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("sidebar_collapsed", String(isCollapsed)); } catch {}
  }, [isCollapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [currentView]);

  const activeItem = menuItems.find((item) => item.id === currentView);

  const selectView = (view: string) => {
    onViewChange(view);
    setMobileOpen(false);
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm print:hidden md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <img src={logo} alt="Luciano Couros" className="h-11 w-14 object-contain" />
          <div className="min-w-0"><p className="truncate text-sm font-extrabold text-slate-900">{activeItem?.label || "Luciano Couros"}</p><p className="text-[10px] font-bold text-emerald-600">● ONLINE LOCAL</p></div>
        </div>
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" aria-expanded={mobileOpen} className="rounded-xl bg-slate-900 p-2.5 text-white"><Menu size={20} /></button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-[80] print:hidden md:hidden">
          <button type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
          <aside className="relative flex h-full w-[86vw] max-w-xs flex-col bg-slate-900 text-slate-100 shadow-2xl">
            <div className="flex h-24 items-center justify-between border-b border-slate-800 bg-white px-4">
              <img src={logo} alt="Luciano Couros" className="h-20 w-40 object-contain" />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" className="rounded-xl bg-slate-100 p-2 text-slate-700"><X size={19} /></button>
            </div>
            <nav className="flex-1 space-y-1.5 overflow-y-auto p-4">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = currentView === item.id;
                return <button key={item.id} type="button" onClick={() => selectView(item.id)} aria-current={active ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold ${active ? "bg-emerald-600 text-white" : item.highlight ? "bg-emerald-950/50 text-emerald-300" : "text-slate-300 hover:bg-slate-800"}`}><Icon size={19} /><span>{item.label}</span></button>;
              })}
            </nav>
            <div className="border-t border-slate-800 p-4 text-center text-[10px] text-slate-500">v1.0.0 • Servidor local</div>
          </aside>
        </div>
      )}

      <aside className={`relative hidden h-screen shrink-0 select-none flex-col border-r border-slate-800 bg-slate-900 text-slate-100 transition-all duration-300 md:flex ${isCollapsed ? "w-20" : "w-64"}`}>
        <button type="button" onClick={() => setIsCollapsed(!isCollapsed)} className="absolute -right-3 top-8 z-50 rounded-full border border-slate-700 bg-slate-800 p-1 text-slate-300 hover:bg-emerald-600" aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"} aria-expanded={!isCollapsed}>
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
        <div className={`flex items-center justify-center overflow-hidden border-b border-slate-200 bg-white ${isCollapsed ? "h-20 px-1" : "h-40 px-4"}`}><img src={logo} alt="Luciano Couros" className={`object-contain ${isCollapsed ? "h-14 w-14" : "h-36 w-52"}`} /></div>
        <nav className={`flex-1 space-y-1.5 overflow-y-auto ${isCollapsed ? "px-1.5 py-3" : "p-4"}`}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return <button key={item.id} type="button" onClick={() => selectView(item.id)} title={isCollapsed ? item.label : undefined} aria-label={item.label} aria-current={active ? "page" : undefined} className={`group relative flex w-full items-center rounded-lg text-sm font-medium transition-all ${isCollapsed ? "min-h-11 flex-col justify-center gap-1 px-1 py-2 text-center" : "gap-3 px-3 py-2.5 text-left"} ${active ? item.highlight ? "bg-emerald-600 text-white" : "bg-slate-800 text-emerald-400" : item.highlight ? "border border-emerald-800/30 bg-emerald-950/40 text-emerald-300" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"}`}><Icon size={18} className="shrink-0" />{isCollapsed ? <span className="w-full truncate text-center text-[9px] font-semibold leading-none">{item.compactLabel}</span> : <span className="truncate">{item.label}</span>}</button>;
          })}
        </nav>
        <div className="border-t border-slate-800 bg-slate-950/40 p-4 text-center text-xs text-slate-500">{isCollapsed ? "v1.0" : "v1.0.0 • Offline Autônomo"}</div>
      </aside>
    </>
  );
}
