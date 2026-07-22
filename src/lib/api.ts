import {
  Cliente, Fornecedor, FornecedorProduto, Produto, ProdutoHabitual, Venda, Pagamento, Compra, DashboardStats, Config, SegurancaStatus, SystemInfo, CarteiraCliente
} from "../types";

const API_BASE = "/api";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errMsg = "Erro de rede ou servidor";
    try {
      const errData = await response.json();
      errMsg = errData.error || errMsg;
    } catch {}
    throw new Error(errMsg);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getSystemInfo: () => fetch(`${API_BASE}/system/version`).then(r => handleResponse<SystemInfo>(r)),

  // MOCK DATA CONTROL
  getMockStatus: () => fetch(`${API_BASE}/mock/status`).then(r => handleResponse<{ mockEnabled: boolean }>(r)),
  toggleMock: (enabled: boolean) => 
    fetch(`${API_BASE}/mock/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    }).then(r => handleResponse<{ success: boolean; mockEnabled: boolean }>(r)),

  // CONFIGS
  getConfig: () => fetch(`${API_BASE}/config`).then(r => handleResponse<Record<string, string>>(r)),
  updateConfig: (updates: Record<string, string>) => 
    fetch(`${API_BASE}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    }).then(r => handleResponse<{ success: boolean; message: string }>(r)),

  // SEGURANÇA LOCAL
  getSegurancaStatus: () =>
    fetch(`${API_BASE}/seguranca/status`).then(r => handleResponse<SegurancaStatus>(r)),
  verificarPinAdministrador: (pin: string, finalidade?: string) =>
    fetch(`${API_BASE}/seguranca/verificar-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, finalidade })
    }).then(r => handleResponse<{ valido: boolean; usuario: { id: string; nome: string } }>(r)),
  configurarPinAdministrador: (dados: { nome: string; pinAtual?: string; novoPin: string }) =>
    fetch(`${API_BASE}/seguranca/admin-pin`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados)
    }).then(r => handleResponse<{ success: boolean; nome: string; pinConfigurado: boolean }>(r)),

  // DASHBOARD
  getDashboard: () => fetch(`${API_BASE}/dashboard`).then(r => handleResponse<DashboardStats>(r)),

  // CLIENTES
  getClientes: () => fetch(`${API_BASE}/clientes`).then(r => handleResponse<Cliente[]>(r)),
  createCliente: (cliente: Omit<Cliente, "id" | "createdAt" | "updatedAt">) => 
    fetch(`${API_BASE}/clientes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cliente)
    }).then(r => handleResponse<Cliente>(r)),
  updateCliente: (id: string, cliente: Partial<Cliente>) => 
    fetch(`${API_BASE}/clientes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cliente)
    }).then(r => handleResponse<Cliente>(r)),
  deleteCliente: (id: string) => 
    fetch(`${API_BASE}/clientes/${id}`, { method: "DELETE" }).then(r => handleResponse<{ success: boolean }>(r)),
  getClienteHistorico: (id: string) => 
    fetch(`${API_BASE}/clientes/${id}/historico`).then(r => handleResponse<{
      cliente: Cliente;
      estatisticas: {
        totalComprado: number;
        totalPago: number;
        saldoPendente: number;
        lucroBruto: number;
      };
      produtosMaisComprados: Array<{ produtoId: string; descricao: string; totalValor: number }>;
      vendas: Venda[];
      pagamentos: Pagamento[];
    }>(r)),
  getClienteProdutosHabituais: (id: string) =>
    fetch(`${API_BASE}/clientes/${id}/produtos-habituais`).then(r => handleResponse<ProdutoHabitual[]>(r)),
  getCarteiraCliente: (id: string) =>
    fetch(`${API_BASE}/clientes/${id}/carteira`).then(r => handleResponse<CarteiraCliente>(r)),
  createRecebimentoCliente: (clienteId: string, dados: {
    data: string;
    valorRecebido: number;
    bonusDisponivel: number;
    formaPagamento: string;
    observacao?: string;
    alocacoes: Array<{ vendaId: string; valor: number }>;
  }) => fetch(`${API_BASE}/clientes/${clienteId}/carteira/recebimentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados)
  }).then(r => handleResponse<{
    success: boolean;
    id: string;
    valorRecebido: number;
    valorAplicado: number;
    bonusUtilizado: number;
    bonusGerado: number;
  }>(r)),
  cancelarRecebimentoCliente: (id: string, pin: string) =>
    fetch(`${API_BASE}/recebimentos-cliente/${id}/cancelar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    }).then(r => handleResponse<{ success: boolean; message: string }>(r)),

  // FORNECEDORES
  getFornecedores: () => fetch(`${API_BASE}/fornecedores`).then(r => handleResponse<Fornecedor[]>(r)),
  createFornecedor: (fornecedor: Omit<Fornecedor, "id" | "createdAt" | "updatedAt">) => 
    fetch(`${API_BASE}/fornecedores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fornecedor)
    }).then(r => handleResponse<Fornecedor>(r)),
  updateFornecedor: (id: string, fornecedor: Partial<Fornecedor>) => 
    fetch(`${API_BASE}/fornecedores/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fornecedor)
    }).then(r => handleResponse<Fornecedor>(r)),
  deleteFornecedor: (id: string) => 
    fetch(`${API_BASE}/fornecedores/${id}`, { method: "DELETE" }).then(r => handleResponse<{ success: boolean }>(r)),
  getFornecedorProdutos: (id: string) =>
    fetch(`${API_BASE}/fornecedores/${id}/produtos`).then(r => handleResponse<FornecedorProduto[]>(r)),
  vincularFornecedorProduto: (fornecedorId: string, dados: { produtoId: string; codigoFornecedor?: string; observacao?: string }) =>
    fetch(`${API_BASE}/fornecedores/${fornecedorId}/produtos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados)
    }).then(r => handleResponse<{ success: boolean }>(r)),

  // PRODUTOS
  getProdutos: () => fetch(`${API_BASE}/produtos`).then(r => handleResponse<Produto[]>(r)),
  createProduto: (produto: Omit<Produto, "id" | "createdAt" | "updatedAt">) => 
    fetch(`${API_BASE}/produtos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(produto)
    }).then(r => handleResponse<Produto>(r)),
  updateProduto: (id: string, produto: Partial<Produto>) => 
    fetch(`${API_BASE}/produtos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(produto)
    }).then(r => handleResponse<Produto>(r)),
  deleteProduto: (id: string) => 
    fetch(`${API_BASE}/produtos/${id}`, { method: "DELETE" }).then(r => handleResponse<{ success: boolean }>(r)),
  getProdutoFornecedores: (id: string) =>
    fetch(`${API_BASE}/produtos/${id}/fornecedores`).then(r => handleResponse<FornecedorProduto[]>(r)),

  // VENDAS
  getVendas: () => fetch(`${API_BASE}/vendas`).then(r => handleResponse<Venda[]>(r)),
  getProximoNumeroVenda: () => fetch(`${API_BASE}/vendas/proximo-numero`).then(r => handleResponse<{ proximoNumero: number }>(r)),
  createVenda: (vendaData: {
    clienteId: string;
    data: string;
    descontoGeral: number;
    items: Array<{
      produtoId: string;
      descricao: string;
      quantidade: number;
      unidade: string;
      precoUnitario: number;
      desconto: number;
    }>;
    valorPago: number;
    formaPagamento: string;
    vencimento?: string;
    observacoes?: string;
    instrumentoRecebimento?: {
      emitente: string;
      numeroDocumento: string;
      vencimento: string;
      observacao?: string;
    };
    autorizacaoPreco?: {
      pin: string;
      salvarParaCliente: boolean;
    };
  }) => 
    fetch(`${API_BASE}/vendas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vendaData)
    }).then(r => handleResponse<Venda>(r)),
  cancelarVenda: (id: string) => 
    fetch(`${API_BASE}/vendas/${id}/cancelar`, { method: "POST" }).then(r => handleResponse<{ success: boolean; message: string }>(r)),

  // COMPRAS
  getCompras: () => fetch(`${API_BASE}/compras`).then(r => handleResponse<Compra[]>(r)),
  createCompra: (compraData: {
    fornecedorId: string;
    data: string;
    desconto: number;
    items: Array<{
      produtoId: string;
      quantidade: number;
      unidade: string;
      custoUnitario: number;
    }>;
    observacao?: string;
  }) => 
    fetch(`${API_BASE}/compras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(compraData)
    }).then(r => handleResponse<Compra>(r)),
  cancelarCompra: (id: string) => 
    fetch(`${API_BASE}/compras/${id}/cancelar`, { method: "POST" }).then(r => handleResponse<{ success: boolean; message: string }>(r)),

  // PAGAMENTOS
  getPagamentos: () => fetch(`${API_BASE}/pagamentos`).then(r => handleResponse<Pagamento[]>(r)),
  createPagamento: (pagamentoData: {
    clienteId: string;
    vendaId?: string | null;
    data: string;
    valor: number;
    formaPagamento: string;
    observacao?: string;
  }) => 
    fetch(`${API_BASE}/pagamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pagamentoData)
    }).then(r => handleResponse<{ success: boolean; id: string }>(r)),
  cancelarPagamento: (id: string) => 
    fetch(`${API_BASE}/pagamentos/${id}/cancelar`, { method: "POST" }).then(r => handleResponse<{ success: boolean; message: string }>(r)),

  // RELATÓRIOS
  getRelatorios: (filters: {
    startDate?: string;
    endDate?: string;
    clienteId?: string;
    produtoId?: string;
    fornecedorId?: string;
    formaPagamento?: string;
    statusVenda?: string;
    valeStatus?: string;
    vencimentoInicio?: string;
    vencimentoFim?: string;
  }) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    return fetch(`${API_BASE}/relatorios?${params.toString()}`).then(r => handleResponse<any>(r));
  },

  // BACKUPS
  getBackups: () => fetch(`${API_BASE}/backups`).then(r => handleResponse<any[]>(r)),
  createBackup: () => fetch(`${API_BASE}/backups`, { method: "POST" }).then(r => handleResponse<{ success: boolean; filename: string }>(r)),
  restoreBackup: (filename: string) => 
    fetch(`${API_BASE}/backups/restaurar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename })
    }).then(r => handleResponse<{ success: boolean; message: string }>(r)),
  deleteBackup: (filename: string) => 
    fetch(`${API_BASE}/backups/${filename}`, { method: "DELETE" }).then(r => handleResponse<{ success: boolean }>(r))
};
