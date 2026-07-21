export interface Cliente {
  id: string;
  nome: string;
  telefone?: string;
  documento?: string;
  endereco?: string;
  observacoes?: string;
  ativo: number; // 1 or 0
  isWhatsapp?: number; // 1 or 0
  createdAt: string;
  updatedAt: string;
}

export interface Fornecedor {
  id: string;
  nome: string;
  telefone?: string;
  documento?: string;
  observacoes?: string;
  ativo: number;
  isWhatsapp?: number; // 1 or 0
  createdAt: string;
  updatedAt: string;
}

export interface Produto {
  id: string;
  nome: string;
  codigo?: string;
  unidade: "metro" | "unidade" | "quilograma" | "rolo" | "peça";
  precoVendaPadrao: number;
  custoPadrao: number;
  unidadeCompra?: string;
  unidadeVenda?: string;
  fatorConversao?: number;
  venderUnidadeCompra?: number;
  ativo: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemVenda {
  id: string;
  vendaId: string;
  produtoId: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  custoUnitario: number;
  desconto: number;
  total: number;
  custoTotal: number;
  lucroBruto: number;
}

export interface Venda {
  id: string;
  numeroSequencial: number;
  clienteId: string;
  clienteNome?: string;
  clienteTelefone?: string;
  data: string; // YYYY-MM-DD
  subtotal: number;
  desconto: number;
  totalLiquido: number;
  valorPago: number;
  saldoRestante: number;
  status: "paga" | "pendente" | "cancelada";
  vencimento?: string; // YYYY-MM-DD
  observacoes?: string;
  items?: ItemVenda[];
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pagamento {
  id: string;
  clienteId: string;
  clienteNome?: string;
  vendaId?: string;
  vendaSequencial?: number;
  data: string; // YYYY-MM-DD
  valor: number;
  formaPagamento: "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "boleto";
  observacao?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemCompra {
  id: string;
  compraId: string;
  produtoId: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
  total: number;
}

export interface Compra {
  id: string;
  fornecedorId: string;
  fornecedorNome?: string;
  fornecedorTelefone?: string;
  data: string; // YYYY-MM-DD
  subtotal: number;
  desconto: number;
  total: number;
  observacao?: string;
  items?: ItemCompra[];
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Config {
  nome_loja: string;
  retencao_backups_dias: string;
}

export interface DashboardStats {
  vendas_hoje: { count: number; total: number };
  recebido_hoje: number;
  valor_pendente: number;
  valor_vencido: number;
  vendas_mes: { count: number; total: number };
  ticket_medio_mes: number;
  lucro_mes: number;
  metros_mes: number;
  vencidos: Array<{
    id: string;
    numeroSequencial: number;
    data: string;
    totalLiquido: number;
    saldoRestante: number;
    vencimento: string;
    clienteNome: string;
    clienteTelefone: string;
  }>;
  ultimas_vendas: Venda[];
}
