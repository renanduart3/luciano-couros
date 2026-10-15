import React, { useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Check, ChevronDown, FlaskConical, FunctionSquare, RotateCcw, Sheet, Table2 } from "lucide-react";
import { apresentarCelula, Celulas, COLUNAS, endereco, EXEMPLO, LINHAS } from "../lib/planilhaPrototipo";

type Rascunho = { celulas: Celulas; moedas: string[]; nome: string };
const inicial = (): Rascunho => ({ celulas: { ...EXEMPLO }, moedas: ["C4", "C5", "C6", "D4", "D5", "D6", "D8", "D9", "D10"], nome: "Simulação de materiais" });
export function PlanilhasPrototipoView() {
  const [rascunho, setRascunho] = useState<Rascunho>(inicial);
  const [selecionada, setSelecionada] = useState("D10");
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [restaurar, setRestaurar] = useState(false);
  const grade = useRef<HTMLDivElement>(null);
  const exibicao = useMemo(() => Object.fromEntries(Array.from({ length: LINHAS }, (_, l) => Array.from({ length: COLUNAS }, (_, c) => {
    const id = endereco(l, c); return [id, apresentarCelula(rascunho.celulas, id, rascunho.moedas.includes(id))];
  })).flat()), [rascunho]);
  const escrever = (id: string, valor: string) => setRascunho(anterior => ({ ...anterior, celulas: { ...anterior.celulas, [id]: valor.slice(0, 300) } }));
  const confirmar = () => { if (editando) escrever(editando, texto); setEditando(null); };
  const focar = (id: string) => { setSelecionada(id); requestAnimationFrame(() => grade.current?.querySelector<HTMLButtonElement>(`[data-celula="${id}"]`)?.focus()); };
  const mover = (id: string, dl: number, dc: number) => {
    const l = Math.max(0, Math.min(LINHAS - 1, Number(id.slice(1)) - 1 + dl));
    const c = Math.max(0, Math.min(COLUNAS - 1, id.charCodeAt(0) - 65 + dc));
    focar(endereco(l, c));
  };
  const iniciar = (id: string, novo?: string) => { setSelecionada(id); setTexto(novo ?? rascunho.celulas[id] ?? ""); setEditando(id); };
  const colar = (event: React.ClipboardEvent, id: string) => {
    const conteudo = event.clipboardData.getData("text/plain");
    if (conteudo.length > 120000) { event.preventDefault(); return; }
    event.preventDefault();
    const l0 = Number(id.slice(1)) - 1, c0 = id.charCodeAt(0) - 65;
    const novos: Celulas = {};
    conteudo.replace(/\r/g, "").replace(/\n$/, "").split("\n").slice(0, LINHAS - l0).forEach((linha, l) => linha.split("\t").slice(0, COLUNAS - c0).forEach((valor, c) => { novos[endereco(l0 + l, c0 + c)] = valor.slice(0, 300); }));
    setRascunho(anterior => ({ ...anterior, celulas: { ...anterior.celulas, ...novos } }));
  };
  const moeda = rascunho.moedas.includes(selecionada);
  const resultado = exibicao[selecionada];
  return <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-emerald-100 p-3 text-emerald-800"><Sheet size={26}/></span><div><div className="flex items-center gap-2"><h1 className="text-2xl font-black tracking-tight text-slate-900">Planilhas</h1><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Protótipo</span></div><p className="mt-1 text-sm text-slate-500">Um espaço para organizar ideias e fazer suas contas.</p></div></div>
      <div className="flex items-center gap-2 text-xs text-slate-500"><Check size={14} className="text-emerald-600"/>Simulação temporária</div>
    </header>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-950"><FlaskConical size={17} className="shrink-0"/><p><strong>Área de demonstração.</strong> Dados fictícios. Alterações são temporárias e não alteram vendas, estoque ou financeiro.</p></div>
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <label className="flex items-center gap-2 text-emerald-800"><Table2 size={19}/><input aria-label="Nome da planilha" maxLength={60} value={rascunho.nome} onChange={e => setRascunho(a => ({ ...a, nome: e.target.value }))} className="w-52 rounded px-2 py-1 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"/></label>
        <div className="flex items-center gap-3"><span className="hidden text-xs text-slate-400 sm:block">40 linhas × 10 colunas</span><button type="button" onClick={() => setRestaurar(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw size={14}/>Restaurar exemplo</button></div>
      </div>
      {restaurar && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 p-3 text-xs"><span>Substituir todas as células pelo exemplo inicial?</span><div className="flex gap-2"><button className="rounded border px-3 py-2" onClick={() => setRestaurar(false)}>Voltar</button><button className="rounded bg-amber-800 px-3 py-2 font-bold text-white" onClick={() => { setRascunho(inicial()); setEditando(null); setRestaurar(false); }}>Restaurar exemplo</button></div></div>}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs">
        <span className="mr-1 font-semibold text-slate-500">Formato da célula</span>
        <button type="button" aria-pressed={!moeda} onClick={() => setRascunho(a => ({ ...a, moedas: a.moedas.filter(id => id !== selecionada) }))} className={`rounded-lg border px-3 py-1.5 ${!moeda ? "border-emerald-300 bg-white font-bold text-emerald-800" : "border-transparent text-slate-600"}`}>Número / texto</button>
        <button type="button" aria-pressed={moeda} onClick={() => setRascunho(a => ({ ...a, moedas: [...new Set([...a.moedas, selecionada])] }))} className={`rounded-lg border px-3 py-1.5 ${moeda ? "border-emerald-300 bg-white font-bold text-emerald-800" : "border-transparent text-slate-600"}`}>R$ Moeda</button>
        <span className="ml-auto hidden items-center gap-1 text-slate-400 lg:flex"><ArrowDownToLine size={13}/> Cole linhas e colunas de outra planilha</span>
      </div>
      <div className="flex items-center gap-3 border-b border-slate-300 px-3 py-2">
        <span className="flex w-16 shrink-0 items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs font-bold text-slate-700">{selecionada}<ChevronDown size={12}/></span><FunctionSquare size={18} className="shrink-0 text-slate-400"/>
        <input aria-label={`Conteúdo de ${selecionada}`} placeholder="Digite um valor ou uma fórmula, como =B4*C4" value={editando === selecionada ? texto : rascunho.celulas[selecionada] || ""} onFocus={() => iniciar(selecionada)} onChange={e => { setTexto(e.target.value.slice(0, 300)); setEditando(selecionada); }} onBlur={confirmar} onKeyDown={e => { if (e.key === "Enter") { confirmar(); focar(selecionada); } if (e.key === "Escape") { setEditando(null); focar(selecionada); } }} className="min-w-0 flex-1 rounded px-2 py-1.5 font-mono text-sm text-slate-800 outline-none focus:bg-emerald-50"/>
      </div>
      <div ref={grade} className="max-h-[60vh] min-h-[340px] overflow-auto overscroll-contain" aria-label="Planilha de demonstração">
        <table className="w-max table-fixed border-separate border-spacing-0 text-xs"><thead className="sticky top-0 z-20"><tr><th className="sticky left-0 z-30 w-11 min-w-11 border-b border-r border-slate-300 bg-slate-100 text-slate-400">◢</th>{Array.from({ length: COLUNAS }, (_, c) => <th key={c} className={`h-8 border-b border-r border-slate-300 font-semibold ${selecionada.charCodeAt(0) - 65 === c ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-500"}`} style={{ width: c === 0 ? 260 : 140, minWidth: c === 0 ? 260 : 140 }}>{String.fromCharCode(65 + c)}</th>)}</tr></thead>
          <tbody>{Array.from({ length: LINHAS }, (_, l) => <tr key={l}><th className={`sticky left-0 z-10 h-9 border-b border-r border-slate-200 font-mono text-[11px] font-normal ${Number(selecionada.slice(1)) === l + 1 ? "bg-emerald-100 text-emerald-900" : "bg-slate-50 text-slate-400"}`}>{l + 1}</th>{Array.from({ length: COLUNAS }, (_, c) => {
            const id = endereco(l, c), conteudo = exibicao[id], ativo = selecionada === id, editavel = editando === id;
            const destaque = l === 2 && c < 4, total = l === 9 && c < 4;
            return <td key={id} className={`relative h-9 border-b border-r border-slate-200 p-0 ${total ? "bg-emerald-50 font-bold text-emerald-950" : destaque ? "bg-slate-100 font-bold text-slate-600" : "bg-white text-slate-700"} ${ativo ? "z-[1] ring-2 ring-inset ring-emerald-600" : ""}`}>
              {editavel ? <input autoFocus aria-label={`Editar ${id}`} value={texto} onChange={e => setTexto(e.target.value.slice(0, 300))} onBlur={confirmar} onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); confirmar(); mover(id, e.key === "Enter" ? 1 : 0, e.key === "Tab" ? (e.shiftKey ? -1 : 1) : 0); } if (e.key === "Escape") { setEditando(null); focar(id); } }} className="absolute inset-0 h-full w-full bg-white px-3 font-mono outline-none ring-2 ring-inset ring-emerald-600"/>
                : <button type="button" data-celula={id} tabIndex={ativo ? 0 : -1} aria-label={`${id}: ${conteudo.texto || "vazia"}`} title={rascunho.celulas[id] || id} onFocus={() => setSelecionada(id)} onClick={() => setSelecionada(id)} onDoubleClick={() => iniciar(id)} onPaste={e => colar(e, id)} onCopy={e => { e.preventDefault(); e.clipboardData.setData("text/plain", rascunho.celulas[id] || ""); }} onKeyDown={e => {
                  const direcoes: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, e.shiftKey ? -1 : 1] };
                  if (direcoes[e.key]) { e.preventDefault(); mover(id, ...direcoes[e.key]); }
                  else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); iniciar(id); }
                  else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); escrever(id, ""); }
                  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); iniciar(id, e.key); }
                }} className={`block h-9 w-full overflow-hidden whitespace-nowrap px-3 outline-none ${conteudo.erro ? "text-left font-bold text-red-700" : conteudo.numerico ? "text-right font-mono tabular-nums" : "text-left"} ${id === "A1" ? "font-black tracking-wide text-emerald-900" : ""}`} style={{ maxWidth: c === 0 ? 260 : 140 }}>{conteudo.texto}</button>}
            </td>;
          })}</tr>)}</tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-300 bg-slate-50 px-4"><span className="flex items-center gap-2 border-t-2 border-emerald-600 bg-white px-4 py-3 text-xs font-bold text-emerald-800"><Sheet size={15}/>Planilha 1</span><span className={`py-2 text-xs ${resultado.erro ? "text-red-700" : "text-slate-500"}`}>{selecionada}{resultado.texto && ` · ${resultado.texto}`}</span></footer>
    </div>
    <div className="flex flex-wrap justify-between gap-2 text-xs leading-relaxed text-slate-500"><p><strong className="text-slate-700">Comece por aqui:</strong> dê dois cliques para editar ou selecione uma célula e digite.</p><p>Fórmulas: <code>=B4*C4</code> · <code>=SOMA(D4:D6)</code> · <code>=D8*5%</code></p></div>
  </section>;
}
