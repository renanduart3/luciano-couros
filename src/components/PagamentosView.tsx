import React, { useState, useEffect } from "react";
import { Search, Plus, Trash2, DollarSign, X, Check, Calendar, ChevronDown } from "lucide-react";
import { Cliente, Venda, Pagamento } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";

interface PagamentosViewProps {
  onRefreshStats?: () => void;
}

export function PagamentosView({ onRefreshStats }: PagamentosViewProps) {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendasPendentes, setVendasPendentes] = useState<Venda[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toggle register screen vs list
  const [modoCadastro, setModoCadastro] = useState(false);

  // Form State
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);

  const [vendaId, setVendaId] = useState<string>(""); // Optional selected sale
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split("T")[0]);
  const [valor, setValor] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [observacao, setObservacao] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pagList, cliList] = await Promise.all([
        api.getPagamentos(),
        api.getClientes()
      ]);
      setPagamentos(pagList);
      setClientes(cliList.filter(c => c.ativo === 1));
    } catch (err: any) {
      setError(err.message || "Erro ao carregar pagamentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch pending sales when a client is selected
  useEffect(() => {
    if (clienteSelecionado) {
      api.getClienteHistorico(clienteSelecionado.id)
        .then(res => {
          setVendasPendentes(res.vendas.filter(v => v.status === "pendente"));
        })
        .catch(err => console.error(err));
    } else {
      setVendasPendentes([]);
      setVendaId("");
    }
  }, [clienteSelecionado]);

  const handleSelectCliente = (cli: Cliente) => {
    setClienteSelecionado(cli);
    setClienteBusca(cli.nome);
    setShowClienteDropdown(false);
  };

  const handleSavePagamento = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clienteSelecionado) {
      alert("Por favor, selecione o cliente.");
      return;
    }

    const val = parseBrazilianNumber(valor);
    if (isNaN(val) || val <= 0) {
      alert("Por favor, informe um valor válido maior que zero.");
      return;
    }

    try {
      await api.createPagamento({
        clienteId: clienteSelecionado.id,
        vendaId: vendaId || null,
        data: dataPagamento,
        valor: val,
        formaPagamento,
        observacao: observacao || undefined
      });

      // Reset state and reload
      setClienteSelecionado(null);
      setClienteBusca("");
      setVendaId("");
      setValor("");
      setObservacao("");
      setModoCadastro(false);
      fetchData();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      alert(err.message || "Erro ao salvar pagamento.");
    }
  };

  const handleCancelPagamento = async (id: string) => {
    if (confirm("Deseja realmente cancelar/estornar este pagamento? Os saldos das faturas correspondentes serão reajustados para a cobrança.")) {
      try {
        await api.cancelarPagamento(id);
        fetchData();
        if (onRefreshStats) onRefreshStats();
      } catch (err: any) {
        alert(err.message || "Erro ao cancelar pagamento.");
      }
    }
  };

  // Filter clients
  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(clienteBusca.toLowerCase()) || 
    (c.telefone && c.telefone.includes(clienteBusca))
  );

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Recebimentos e Pagamentos</h2>
          <p className="text-slate-500 text-sm mt-0.5">Controle de entradas, liquidação de faturas de clientes e amortização de saldos devedores.</p>
        </div>
        
        <button 
          onClick={() => {
            setModoCadastro(!modoCadastro);
            setClienteSelecionado(null);
            setClienteBusca("");
            setValor("");
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all ${
            modoCadastro 
              ? "bg-slate-900 text-white hover:bg-slate-800" 
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {modoCadastro ? "Voltar ao Histórico" : "Registrar Recebimento Rápido"}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
          <p className="text-slate-500 mt-4 text-sm font-medium">Carregando livro de caixa...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">{error}</div>
      ) : modoCadastro ? (
        
        /* REGISTRATION FORM */
        <div className="max-w-xl mx-auto bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-6">
          <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <span className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <DollarSign size={18} />
            </span>
            Registrar Entrada Financeira
          </h3>

          <form onSubmit={handleSavePagamento} className="space-y-4">
            
            {/* Cliente selection with autocomplete */}
            <div className="relative space-y-1">
              <label className="block text-xs font-bold text-slate-400 uppercase">1. Selecionar Cliente *</label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl focus-within:border-emerald-500">
                <input 
                  type="text"
                  placeholder="Pesquise por nome do cliente..."
                  value={clienteBusca}
                  onChange={(e) => {
                    setClienteBusca(e.target.value);
                    setShowClienteDropdown(true);
                    if (clienteSelecionado) setClienteSelecionado(null);
                  }}
                  onFocus={() => setShowClienteDropdown(true)}
                  className="w-full text-slate-900 bg-transparent py-2.5 px-3.5 text-sm outline-none font-bold"
                />
                {clienteSelecionado && (
                  <span className="mr-3.5 text-emerald-600 flex items-center gap-1 text-[10px] font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">
                    <Check size={12} /> Selecionado
                  </span>
                )}
              </div>

              {showClienteDropdown && clienteBusca.trim() !== "" && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-50">
                  {filteredClientes.length === 0 ? (
                    <div className="p-3 text-slate-400 text-xs">Nenhum cliente ativo localizado.</div>
                  ) : (
                    filteredClientes.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCliente(c)}
                        className="w-full p-3 hover:bg-slate-50 text-left text-xs flex justify-between items-center transition-colors"
                      >
                        <div>
                          <p className="font-bold text-slate-800">{c.nome}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{c.telefone || "Sem telefone"}</p>
                        </div>
                        <ChevronDown size={14} className="text-slate-400" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Venda Vinculada Select */}
            {clienteSelecionado && (
              <div className="space-y-1 animate-fade-in">
                <label className="block text-xs font-bold text-slate-400 uppercase">
                  2. Vincular a uma Fatura Específica (Opcional)
                </label>
                <select 
                  value={vendaId}
                  onChange={(e) => setVendaId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3 py-2.5 rounded-xl font-bold text-slate-700 outline-none"
                >
                  <option value="">NÃO VINCULAR (Amortização automática do saldo devedor mais antigo)</option>
                  {vendasPendentes.map(v => (
                    <option key={v.id} value={v.id}>
                      Venda #{v.numeroSequencial} (Faturamento: {formatDate(v.data)} - Saldo Restante: {formatCurrency(v.saldoRestante)})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Se você não vincular a uma venda específica, o sistema deduzirá o valor automaticamente das faturas vencidas mais antigas deste cliente.
                </p>
              </div>
            )}

            {/* Value, date, method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">3. Valor Recebido (R$) *</label>
                <input 
                  type="text" 
                  value={valor}
                  placeholder="0,00"
                  onChange={(e) => setValor(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-extrabold text-emerald-700 focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Data do Recebimento *</label>
                <input 
                  type="date" 
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-slate-900 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Forma de Pagamento *</label>
              <select 
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-sm px-3 py-2.5 rounded-xl font-bold text-slate-700 outline-none"
              >
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao_credito">Cartão de Crédito</option>
                <option value="cartao_debito">Cartão de Débito</option>
                <option value="boleto">Boleto</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-400 uppercase">Observação Adicional</label>
              <textarea 
                rows={2}
                value={observacao}
                placeholder="Ex: Recebido por transferência direta..."
                onChange={(e) => setObservacao(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-xs px-3.5 py-2.5 rounded-xl text-slate-900 focus:border-emerald-500 outline-none"
              />
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setModoCadastro(false)}
                className="px-5 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold rounded-xl text-xs transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-colors"
              >
                Registrar Recebimento
              </button>
            </div>

          </form>
        </div>

      ) : (
        
        /* TABLE LIST OF PAST PAYMENTS */
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold text-xs uppercase">
                  <th className="p-4">Data</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Forma / Finalidade</th>
                  <th className="p-4 text-right font-bold text-emerald-800">Valor Recebido</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {pagamentos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 font-medium">
                      Nenhum pagamento registrado no caixa do período.
                    </td>
                  </tr>
                ) : (
                  pagamentos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-slate-500 font-mono text-xs">{formatDate(p.data)}</td>
                      <td className="p-4 font-bold text-slate-900">{p.clienteNome}</td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded text-[9px] font-extrabold uppercase">
                            {p.formaPagamento}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {p.vendaSequencial ? `Venda #${p.vendaSequencial}` : "Amortização"}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-mono font-extrabold text-emerald-700">{formatCurrency(p.valor)}</td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleCancelPagamento(p.id)}
                          className="px-2.5 py-1.5 text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg inline-flex items-center gap-1 text-xs font-bold transition-all"
                        >
                          <Trash2 size={13} /> Estornar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
