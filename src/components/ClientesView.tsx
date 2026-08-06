import React, { useState, useEffect } from "react";
import { 
  Search, Plus, Edit2, Trash2, X, Eye, Phone, FileText, TrendingUp, AlertCircle, MessageCircle, WalletCards, ShieldCheck, RotateCcw
} from "lucide-react";
import { CarteiraCliente, Cliente, Venda, Pagamento, ProdutoHabitual, Orcamento } from "../types";
import { api } from "../lib/api";
import { formatCurrency, formatDate, parseBrazilianNumber } from "../lib/utils";
import { paginate, Pagination } from "./Pagination";
import { PrecoAutorizadoInput } from "./PrecoAutorizadoInput";
import { useConfirmacao } from "./ConfirmacaoDialog";
import { useEhGerente } from "../auth/AuthContext";

const chavePrecoCliente = (produtoId: string, fornecedorId?: string | null) =>
  `${produtoId}::${fornecedorId || ""}`;

const PAGE_SIZE = 10;

function calcularResumoVales(vendas: Venda[]) {
  const vales = vendas.filter((venda) =>
    venda.status === "pendente" && Number(venda.saldoRestante) > 0.005 && Boolean(venda.vencimento)
  );
  const vencimentos = vales.flatMap((vale) => {
    const parcelasAbertas = (vale.parcelas || []).filter((parcela) => parcela.status === "pendente" && Number(parcela.saldo) > 0.005);
    return parcelasAbertas.length > 0 ? parcelasAbertas.map((parcela) => parcela.vencimento) : [vale.vencimento!];
  });
  const timestamps = vencimentos
    .map((data) => new Date(`${data}T12:00:00`).getTime())
    .filter(Number.isFinite);
  const media = timestamps.length > 0
    ? new Date(Math.round(timestamps.reduce((soma, valor) => soma + valor, 0) / timestamps.length)).toISOString().slice(0, 10)
    : null;
  return { quantidade: vales.length, parcelas: timestamps.length, dataMedia: media };
}

interface ClientesViewProps {
  onRefreshStats?: () => void;
}

export function ClientesView({ onRefreshStats }: ClientesViewProps) {
  const confirmacao = useConfirmacao();
  const gerente = useEhGerente();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form modals state
  const [formOpen, setFormOpen] = useState(false);
  const [editingCli, setEditingCli] = useState<Cliente | null>(null);
  
  // Client Form Fields
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [isWhatsapp, setIsWhatsapp] = useState(false);
  const [documento, setDocumento] = useState("");
  const [endereco, setEndereco] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [formError, setFormError] = useState("");

  // Customer History Modal State
  const [activeHistory, setActiveHistory] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [produtosCliente, setProdutosCliente] = useState<ProdutoHabitual[]>([]);
  const [precosCliente, setPrecosCliente] = useState<Record<string, string>>({});
  const [salvandoPrecoProduto, setSalvandoPrecoProduto] = useState("");
  const [produtoRemocao, setProdutoRemocao] = useState<ProdutoHabitual | null>(null);
  const [pinRemocao, setPinRemocao] = useState("");
  const [erroRemocao, setErroRemocao] = useState("");
  const [orcamentoVigente, setOrcamentoVigente] = useState<Orcamento | null>(null);
  const [carteiraCliente, setCarteiraCliente] = useState<CarteiraCliente | null>(null);

  const fetchClientes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getClientes();
      setClientes(data);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [busca]);

  const handleOpenForm = (cli?: Cliente) => {
    if (cli) {
      setEditingCli(cli);
      setNome(cli.nome);
      setTelefone(cli.telefone || "");
      setIsWhatsapp(cli.isWhatsapp === 1);
      setDocumento(cli.documento || "");
      setEndereco(cli.endereco || "");
      setObservacoes(cli.observacoes || "");
      setAtivo(cli.ativo === 1);
    } else {
      setEditingCli(null);
      setNome("");
      setTelefone("");
      setIsWhatsapp(false);
      setDocumento("");
      setEndereco("");
      setObservacoes("");
      setAtivo(true);
    }
    setFormError("");
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!nome.trim()) {
      setFormError("O nome é obrigatório.");
      return;
    }

    try {
      const cliData = {
        nome: nome.trim(),
        telefone: telefone.trim() || undefined,
        isWhatsapp: isWhatsapp ? 1 : 0,
        documento: documento.trim() || undefined,
        endereco: endereco.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
        ativo: ativo ? 1 : 0
      };

      if (editingCli) {
        await api.updateCliente(editingCli.id, cliData);
      } else {
        await api.createCliente(cliData);
      }

      setFormOpen(false);
      fetchClientes();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar.");
    }
  };

  const handleDelete = async (id: string) => {
    if (await confirmacao.confirmar({
      titulo: "Excluir cliente",
      mensagem: "Deseja realmente arquivar/excluir este cliente?",
      textoConfirmar: "Excluir cliente"
    })) {
      try {
        await api.deleteCliente(id);
        fetchClientes();
        if (onRefreshStats) onRefreshStats();
      } catch (err: any) {
        alert(err.message || "Erro ao excluir.");
      }
    }
  };

  const handleViewHistory = async (cli: Cliente) => {
    setLoadingHistory(true);
    try {
      const [data, produtosHabituais, orcamentoCliente, carteira] = await Promise.all([
        api.getClienteHistorico(cli.id),
        api.getClienteProdutosHabituais(cli.id),
        api.getClienteOrcamentoVigente(cli.id),
        api.getCarteiraCliente(cli.id)
      ]);
      setActiveHistory(data);
      setProdutosCliente(produtosHabituais);
      setOrcamentoVigente(orcamentoCliente);
      setCarteiraCliente(carteira);
      setPrecosCliente(Object.fromEntries(produtosHabituais.map((item) => [
        chavePrecoCliente(item.produtoId, item.fornecedorId),
        Number(item.precoAutorizado ?? item.ultimoPreco).toFixed(2).replace(".", ",")
      ])));
    } catch (err: any) {
      alert(err.message || "Erro ao carregar perfil do cliente.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.telefone && c.telefone.includes(busca)) ||
    (c.documento && c.documento.includes(busca))
  );
  const clientesPagina = paginate<Cliente>(filteredClientes, page, PAGE_SIZE);
  const resumoVales = calcularResumoVales(activeHistory?.vendas || []);
  const devolucoesCliente = (activeHistory?.vendas || [])
    .flatMap((venda: Venda) => (venda.devolucoes || []).map((devolucao) => ({
      ...devolucao,
      numeroSequencial: venda.numeroSequencial
    })))
    .sort((a: any, b: any) => b.data.localeCompare(a.data) || String(b.createdAt).localeCompare(String(a.createdAt)));

  const removerProdutoCliente = async (produto: ProdutoHabitual) => {
    if (!activeHistory) return;
    setProdutoRemocao(produto);
    setPinRemocao("");
    setErroRemocao("");
  };

  const confirmarRemocaoProdutoCliente = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeHistory || !produtoRemocao) return;
    if (pinRemocao.length < 4 || pinRemocao.length > 64) {
      setErroRemocao("Informe a senha do gerente.");
      return;
    }
    const produto = produtoRemocao;
    const chaveProduto = chavePrecoCliente(produto.produtoId, produto.fornecedorId);
    setSalvandoPrecoProduto(chaveProduto);
    try {
      await api.removeClienteProduto(activeHistory.cliente.id, produto.produtoId, pinRemocao, produto.fornecedorId);
      setProdutosCliente((atuais) => atuais.filter((item) =>
        chavePrecoCliente(item.produtoId, item.fornecedorId) !== chaveProduto
      ));
      setPrecosCliente((atuais) => {
        const proximos = { ...atuais };
        delete proximos[chaveProduto];
        return proximos;
      });
      setProdutoRemocao(null);
      setPinRemocao("");
    } catch (err: any) {
      setErroRemocao(err.message || "Não foi possível remover o produto deste cliente.");
    } finally {
      setSalvandoPrecoProduto("");
    }
  };

  const apagarOrcamentoVigente = async () => {
    if (!orcamentoVigente || !await confirmacao.confirmar({
      titulo: "Excluir orçamento",
      mensagem: `Apagar o orçamento #${orcamentoVigente.numeroSequencial} deste cliente?`,
      textoConfirmar: "Excluir orçamento"
    })) return;
    try {
      await api.deleteOrcamento(orcamentoVigente.id);
      setOrcamentoVigente(null);
    } catch (err: any) {
      alert(err.message || "Não foi possível apagar o orçamento.");
    }
  };

  return (
    <div className="space-y-6">
      {confirmacao.dialogo}
      {produtoRemocao && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <form onSubmit={confirmarRemocaoProdutoCliente} className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-red-100 bg-red-50 p-5">
              <h3 className="font-black text-red-950">EXCLUIR PREÇO DO CLIENTE</h3>
              <p className="mt-1 text-xs font-bold text-red-800">{produtoRemocao.nome}{produtoRemocao.fornecedorReferencia ? ` — ref. fornecedor ${produtoRemocao.fornecedorReferencia}` : ""} será removido dos preços e do orçamento vigente deste cliente.</p>
            </div>
            <div className="space-y-3 p-5">
              <label className="block text-xs font-black text-slate-600">PIN ADMINISTRATIVO</label>
              <input type="password" autoComplete="off" autoFocus value={pinRemocao} onChange={(event) => { setPinRemocao(event.target.value.slice(0, 64)); setErroRemocao(""); }} placeholder="Senha do gerente" className="w-full rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-center text-xl font-black tracking-widest outline-none" />
              {erroRemocao && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{erroRemocao}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
              <button type="button" onClick={() => setProdutoRemocao(null)} className="rounded-lg px-4 py-2 text-xs font-black text-slate-600">CANCELAR</button>
              <button type="submit" disabled={salvandoPrecoProduto === chavePrecoCliente(produtoRemocao.produtoId, produtoRemocao.fornecedorId)} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><ShieldCheck size={15} /> VALIDAR E EXCLUIR</button>
            </div>
          </form>
        </div>
      )}
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Clientes</h2>
          <p className="text-slate-500 text-sm mt-0.5">Gestão de contatos, histórico de compras, saldos devedores e estatísticas.</p>
        </div>
        <button 
          onClick={() => handleOpenForm()}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-700 transition-all"
        >
          <Plus size={16} /> Cadastrar Cliente
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="flex items-center bg-white border border-slate-200 rounded-xl focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
          <span className="pl-3.5 text-slate-400">
            <Search size={16} />
          </span>
          <input 
            type="text"
            placeholder="Pesquisar por nome, telefone ou documento (CPF/CNPJ)..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full text-slate-900 bg-transparent py-2.5 px-3 text-sm outline-none font-medium placeholder-slate-400"
          />
        </div>
      </div>

      {/* Table List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
          <p className="text-slate-500 mt-4 text-sm font-medium">Buscando banco de clientes...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">{error}</div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold text-xs uppercase">
                  <th className="p-4">Nome / Observações</th>
                  <th className="p-4">Contato</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredClientes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 font-medium">
                      Nenhum cliente cadastrado ou localizado.
                    </td>
                  </tr>
                ) : (
                  clientesPagina.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <p className="font-bold text-slate-900 text-sm">{c.nome}</p>
                        {c.observacoes && (
                          <p className="text-[10px] text-slate-400 italic mt-0.5 max-w-[240px] truncate" title={c.observacoes}>
                            "{c.observacoes}"
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        {c.telefone ? (
                          <span className="flex items-center gap-1.5 text-slate-600 font-medium text-xs">
                            <Phone size={13} className="text-slate-400" /> {c.telefone}
                            {c.isWhatsapp === 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const clean = c.telefone!.replace(/\D/g, "");
                                  const withCountryCode = clean.length <= 11 ? `55${clean}` : clean;
                                  window.open(`https://wa.me/${withCountryCode}`, "_blank");
                                }}
                                className="inline-flex items-center ml-1 p-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                                title="Abrir no WhatsApp Web"
                              >
                                <MessageCircle size={15} className="fill-emerald-100" />
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded-full ${
                          c.ativo === 1 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}>
                          {c.ativo === 1 ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => handleViewHistory(c)}
                            className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                            title="Ficha Completa"
                          >
                            <Eye size={14} /> <span>Ficha</span>
                          </button>
                          <button 
                            onClick={() => handleOpenForm(c)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button 
                            onClick={() => handleDelete(c.id)}
                            className={`${gerente ? "" : "hidden"} p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors`}
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} totalItems={filteredClientes.length} onPageChange={setPage} />
        </div>
      )}

      {/* Add/Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-100 shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-extrabold text-slate-900 text-base">
                {editingCli ? `Editar Cliente: ${editingCli.nome}` : "Cadastrar Novo Cliente"}
              </h3>
              <button onClick={() => setFormOpen(false)} className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && <p className="text-sm text-red-600 font-semibold">{formError}</p>}
              
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Nome Completo *</label>
                <input 
                  type="text" 
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Telefone</label>
                  <input 
                    type="text" 
                    value={telefone}
                    placeholder="(11) 98765-4321"
                    onChange={(e) => setTelefone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                  />
                  <div className="flex items-center gap-1.5 pt-1">
                    <input 
                      type="checkbox" 
                      id="isWhatsapp" 
                      checked={isWhatsapp}
                      onChange={(e) => setIsWhatsapp(e.target.checked)}
                      className="h-3.5 w-3.5 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded"
                    />
                    <label htmlFor="isWhatsapp" className="text-[11px] font-bold text-slate-500 uppercase cursor-pointer">É WhatsApp</label>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Documento (CPF / CNPJ)</label>
                  <input 
                    type="text" 
                    value={documento}
                    placeholder="123.456.789-00"
                    onChange={(e) => setDocumento(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Endereço Residencial/Comercial</label>
                <input 
                  type="text" 
                  value={endereco}
                  placeholder="Rua, Número, Bairro - Cidade/UF"
                  onChange={(e) => setEndereco(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Observações Complementares</label>
                <textarea 
                  rows={2}
                  value={observacoes}
                  placeholder="Informações sobre as preferências do cliente..."
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-medium focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="ativo" 
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded"
                />
                <label htmlFor="ativo" className="text-xs font-bold text-slate-600 uppercase">Cliente Ativo para Operações</label>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setFormOpen(false)}
                  className="px-5 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-colors"
                >
                  {editingCli ? "Salvar Alterações" : "Cadastrar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Full History Modal ("Ficha do Cliente") */}
      {activeHistory && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-6xl border border-slate-100 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-600 text-white rounded-lg">
                  <FileText size={16} />
                </span>
                <h3 className="font-extrabold text-slate-900 text-base">Ficha de Perfil: {activeHistory.cliente.nome}</h3>
              </div>
              <button onClick={() => setActiveHistory(null)} className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable history body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              
              {/* Profile statistics cards */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                
                <div className="rounded-xl border border-slate-100/60 bg-slate-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">COMPRADO</p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900">{formatCurrency(activeHistory.estatisticas.totalComprado)}</p>
                </div>

                <div className="rounded-xl border border-slate-100/60 bg-slate-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">DESDE</p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900">{formatDate(activeHistory.cliente.createdAt)}</p>
                </div>

                <div className="rounded-xl border border-slate-100/60 bg-slate-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">PAGO</p>
                  <p className="mt-1 text-sm font-extrabold text-emerald-700">{formatCurrency(activeHistory.estatisticas.totalPago)}</p>
                </div>

                <div className="rounded-xl border border-slate-100/60 bg-slate-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">PENDENTE</p>
                  <p className={`mt-1 text-sm font-extrabold ${activeHistory.estatisticas.saldoPendente > 0 ? "text-amber-600" : "text-slate-500"}`}>
                    {formatCurrency(activeHistory.estatisticas.saldoPendente)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100/60 bg-slate-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">LUCRO</p>
                  <p className="mt-1 text-sm font-extrabold text-teal-600">{formatCurrency(activeHistory.estatisticas.lucroBruto)}</p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700">VALES</p>
                  <p className="mt-1 text-sm font-extrabold text-amber-950">{resumoVales.quantidade}</p>
                  <p className="text-[8px] font-bold uppercase text-amber-700">{resumoVales.parcelas} VENC.</p>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-blue-700">MÉDIA VALES</p>
                  <p className="mt-1 text-sm font-extrabold text-blue-950">{resumoVales.dataMedia ? formatDate(resumoVales.dataMedia) : "—"}</p>
                </div>

                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-center">
                  <p className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider text-violet-700"><WalletCards size={11} /> BÔNUS</p>
                  <p className="mt-1 text-sm font-extrabold text-violet-950">{formatCurrency(carteiraCliente?.saldoBonus || 0)}</p>
                </div>

              </div>

              {/* Current customer budget */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    <FileText size={14} />
                    Orçamento vigente
                  </h4>
                  {gerente && orcamentoVigente && <button type="button" onClick={apagarOrcamentoVigente} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={14} /> Apagar orçamento</button>}
                </div>
                {!orcamentoVigente ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs font-semibold text-slate-400">Nenhum orçamento vigente para este cliente.</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-blue-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-4 py-3 text-xs">
                      <strong className="text-blue-900">Orçamento #{orcamentoVigente.numeroSequencial}</strong>
                      <span className="font-mono font-black text-blue-800">{formatCurrency(orcamentoVigente.totalLiquido)}</span>
                    </div>
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead><tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-500"><th className="p-3">Material</th><th className="p-3 text-right">Quantidade</th><th className="p-3">Unidade</th><th className="p-3 text-right">Preço</th><th className="p-3 text-right">Total</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{orcamentoVigente.items.map((item) => <tr key={item.id}><td className="p-3 font-bold text-slate-900">{item.descricao}</td><td className="p-3 text-right font-mono">{item.quantidade}</td><td className="p-3 font-bold">{item.unidade}</td><td className="p-3 text-right font-mono">{formatCurrency(item.precoUnitario)}</td><td className="p-3 text-right font-mono font-black">{formatCurrency(item.total)}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Customer-specific pricing */}
              <div className="space-y-3">
                <div>
                  <h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    <TrendingUp size={14} />
                    Preços praticados para este cliente
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">Cada produto vendido entra automaticamente nesta relação. Ajuste o preço individual ou remova o item do cliente.</p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[920px] text-left text-xs">
                    <thead><tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-500"><th className="p-3">Produto</th><th className="p-3 text-right">Preço-base</th><th className="p-3 text-right">Último praticado</th><th className="p-3 text-right">Custo atual</th><th className="p-3 text-right">Preço do cliente</th><th className="p-3 text-right">Lucro unit.</th><th className="p-3 text-right">Margem</th><th className="p-3 text-center">Ações</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {produtosCliente.length === 0 ? <tr><td colSpan={8} className="p-8 text-center font-semibold text-slate-400">Este cliente ainda não possui produtos no histórico.</td></tr> :
                      produtosCliente.map((produto) => {
                        const chaveProduto = chavePrecoCliente(produto.produtoId, produto.fornecedorId);
                        const precoPraticado = Number(produto.precoAutorizado ?? produto.ultimoPreco);
                        const custo = Number(produto.custoPadrao || 0);
                        const lucro = precoPraticado - custo;
                        const margem = precoPraticado > 0 ? (lucro / precoPraticado) * 100 : 0;
                        return <tr key={chaveProduto} className="bg-white">
                          <td className="p-3"><p className="font-extrabold text-slate-900">{produto.nome}</p>{produto.fornecedorReferencia && <p className="font-mono text-[10px] font-black text-blue-700">REF. FORNECEDOR: {produto.fornecedorReferencia}</p>}<p className="text-[10px] text-slate-500">{produto.vezesComprado > 0 ? `${produto.vezesComprado} compra(s) • última em ${formatDate(produto.ultimaCompraEm)}` : "Adicionado ao orçamento do cliente"}</p></td>
                          <td className="p-3 text-right font-mono font-bold">{formatCurrency(produto.precoVendaPadrao)}</td>
                          <td className="p-3 text-right font-mono">{formatCurrency(produto.ultimoPreco)}</td>
                          <td className="p-3 text-right font-mono text-slate-600">{formatCurrency(custo)}</td>
                          <td className="p-3"><PrecoAutorizadoInput clienteId={activeHistory.cliente.id} produtoId={produto.produtoId} fornecedorId={produto.fornecedorId} value={precosCliente[chaveProduto] || ""} precoAutorizado={Number(produto.precoAutorizado ?? produto.ultimoPreco ?? produto.precoVendaPadrao)} origem="cadastro_cliente" ariaLabel={`Preço de ${produto.nome} para o cliente`} onAuthorized={(valorFormatado, valor) => { setPrecosCliente((atuais) => ({ ...atuais, [chaveProduto]: valorFormatado })); setProdutosCliente((atuais) => atuais.map((item) => chavePrecoCliente(item.produtoId, item.fornecedorId) === chaveProduto ? { ...item, precoAutorizado: valor } : item)); }} className="ml-auto block w-28 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-right font-mono font-black text-emerald-900 outline-none focus:border-emerald-600" /></td>
                          <td className={`p-3 text-right font-mono font-black ${lucro >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(lucro)}</td>
                          <td className={`p-3 text-right font-mono font-black ${margem >= 15 ? "text-emerald-700" : "text-amber-700"}`}>{margem.toFixed(1)}%</td>
                          <td className="p-3"><div className="flex justify-center gap-1"><button disabled={salvandoPrecoProduto === chaveProduto} onClick={() => setPrecosCliente((atuais) => ({ ...atuais, [chaveProduto]: Number(produto.precoVendaPadrao).toFixed(2).replace(".", ",") }))} className="rounded-lg border border-slate-300 px-2.5 py-2 font-bold text-slate-600">Usar base</button>{gerente && <button disabled={salvandoPrecoProduto === chaveProduto} onClick={() => removerProdutoCliente(produto)} title="Remover produto deste cliente" className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 size={14} /></button>}</div></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Products Ranking */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-slate-500" />
                  Produtos preferidos por valor
                </h4>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                        <th className="p-3">Material</th>
                        <th className="p-3 text-right">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {activeHistory.produtosMaisComprados.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-slate-400">Sem itens registrados ainda.</td>
                        </tr>
                      ) : (
                        activeHistory.produtosMaisComprados.map((p: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/20">
                            <td className="p-3 font-semibold text-slate-800">{p.descricao}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">{formatCurrency(p.totalValor)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Full History of Sales */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-slate-500" />
                  Histórico de Vendas
                </h4>
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[250px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100 sticky top-0">
                        <th className="p-3 text-center">Venda</th>
                        <th className="p-3">Data</th>
                        <th className="p-3 text-right">Total Líquido</th>
                        <th className="p-3 text-right">Valor Pago</th>
                        <th className="p-3 text-right">Saldo Restante</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {activeHistory.vendas.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-400">Nenhuma compra cadastrada.</td>
                        </tr>
                      ) : (
                        activeHistory.vendas.map((v: Venda) => (
                          <tr key={v.id} className="hover:bg-slate-50/20">
                            <td className="p-3 text-center font-extrabold text-slate-900">#{v.numeroSequencial}</td>
                            <td className="p-3 font-mono">{formatDate(v.data)}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(v.totalLiquido)}
                              {(v.devolucoes || []).length > 0 && <span className="block text-[9px] font-black uppercase text-violet-700">Devolvido: {formatCurrency((v.devolucoes || []).reduce((total, devolucao) => total + Number(devolucao.valorCredito), 0))}</span>}
                            </td>
                            <td className="p-3 text-right font-mono text-emerald-700">{formatCurrency(v.valorPago)}</td>
                            <td className="p-3 text-right font-mono text-amber-600 font-bold">
                              {v.saldoRestante > 0 ? formatCurrency(v.saldoRestante) : "-"}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                v.status === "paga" ? "bg-emerald-100 text-emerald-800" : v.status === "pendente" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                              }`}>
                                {v.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Full History of Returns */}
              <div className="space-y-3">
                <h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  <RotateCcw size={14} className="text-violet-600" />
                  Histórico de Devoluções
                </h4>
                <div className="max-h-[280px] overflow-y-auto rounded-xl border border-violet-200 bg-white">
                  {devolucoesCliente.length === 0 ? (
                    <p className="p-6 text-center text-xs font-semibold text-slate-400">Nenhuma devolução registrada para este cliente.</p>
                  ) : (
                    <div className="divide-y divide-violet-100">
                      {devolucoesCliente.map((devolucao: any) => (
                        <article key={devolucao.id} className="space-y-2 p-3 text-xs">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div><p className="font-black text-slate-950">VENDA #{devolucao.numeroSequencial}</p><p className="font-mono text-slate-500">{formatDate(devolucao.data)}</p></div>
                            <strong className="font-mono text-sm text-violet-800">{formatCurrency(devolucao.valorCredito)}</strong>
                          </div>
                          <div className="flex flex-wrap gap-2 font-black uppercase">
                            <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] text-amber-800">Dívida abatida: {formatCurrency(devolucao.abatimentoVale || 0)}</span>
                            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[9px] text-emerald-800">Bônus gerado: {formatCurrency(devolucao.bonusGerado || 0)}</span>
                          </div>
                          <p className="font-bold text-slate-700">{(devolucao.items || []).map((item: any) => `${item.quantidade} ${item.unidade || ""} de ${item.descricao || "item"}`).join(" • ")}</p>
                          {devolucao.observacoes && <p className="text-slate-500">{devolucao.observacoes}</p>}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Full History of Payments */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-slate-500" />
                  Histórico de Pagamentos
                </h4>
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[250px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100 sticky top-0">
                        <th className="p-3">Data</th>
                        <th className="p-3 text-right">Valor Pago</th>
                        <th className="p-3">Forma</th>
                        <th className="p-3">Venda Vinculada</th>
                        <th className="p-3">Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {activeHistory.pagamentos.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-400">Nenhum pagamento registrado.</td>
                        </tr>
                      ) : (
                        activeHistory.pagamentos.map((p: Pagamento) => (
                          <tr key={p.id} className="hover:bg-slate-50/20">
                            <td className="p-3 font-mono">{formatDate(p.data)}</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCurrency(p.valor)}</td>
                            <td className="p-3 font-bold text-slate-700 uppercase">{p.formaPagamento}</td>
                            <td className="p-3">
                              {p.vendaSequencial ? (
                                <span className="font-semibold text-slate-500">Venda #{p.vendaSequencial}</span>
                              ) : (
                                <span className="text-slate-400">Amortização de Saldo</span>
                              )}
                            </td>
                            <td className="p-3 text-slate-500 truncate max-w-[250px]" title={p.observacao}>{p.observacao || "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50">
              <button 
                onClick={() => setActiveHistory(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Fechar Ficha
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
