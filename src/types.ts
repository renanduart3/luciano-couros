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
  referencia?: string;
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
  unidade: string;
  precoVendaPadrao: number;
  custoPadrao: number;
  custoManual?: number;
  custoOrigem?: "manual" | "compra";
  fornecedorIds?: string[];
  ultimaCompraEm?: string;
  ultimoFornecedorNome?: string;
  quantidadeFornecedores?: number;
  fornecedores?: Array<{
    fornecedorId: string;
    fornecedorNome: string;
    fornecedorReferencia?: string;
    custoFornecedor?: number | null;
    precoVendaFornecedor?: number | null;
    ultimoCusto?: number | null;
    ultimaCompraEm?: string | null;
  }>;
  ativo: number;
  createdAt: string;
  updatedAt: string;
}

export interface FornecedorProduto {
  fornecedorId: string;
  produtoId: string;
  fornecedorReferencia?: string;
  observacao?: string;
  ativo: number;
  produtoNome?: string;
  produtoCodigo?: string;
  fornecedorNome?: string;
  fornecedorTelefone?: string;
  unidade?: string;
  precoVendaPadrao?: number;
  custoFornecedor?: number | null;
  precoVendaFornecedor?: number | null;
  ultimoCusto?: number | null;
  ultimoCustoCompra?: number | null;
  ultimaCompraEm?: string | null;
  comprasRealizadas: number;
}

export interface ProdutoHabitual {
  clienteId: string;
  produtoId: string;
  fornecedorId?: string | null;
  fornecedorReferencia?: string | null;
  nome: string;
  codigo?: string;
  ultimoPreco: number;
  ultimaQuantidade?: number;
  ultimaUnidade: string;
  vezesComprado: number;
  quantidadeTotal?: number;
  ultimaCompraEm: string;
  precoAutorizado?: number;
  unidade: Produto["unidade"];
  precoVendaPadrao: number;
  custoPadrao: number;
}

export interface OrcamentoPadraoClienteItem {
  produtoId: string;
  fornecedorId?: string | null;
  fornecedorReferencia?: string | null;
  nome: string;
  codigo?: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  faltante: number;
  personalizado: number;
  quantidadeTotal?: number;
}

export interface ItemVenda {
  id: string;
  vendaId: string;
  produtoId: string;
  fornecedorId?: string | null;
  fornecedorReferencia?: string | null;
  descricao: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  custoUnitario: number;
  desconto: number;
  total: number;
  custoTotal: number;
  lucroBruto: number;
  referencia?: string;
  quantidadeDevolvida?: number;
  quantidadeDisponivel?: number;
}

export interface ItemDevolucaoVenda {
  id: string;
  devolucaoId: string;
  itemVendaId: string;
  produtoId: string;
  descricao?: string;
  unidade?: string;
  quantidade: number;
  valorUnitarioCredito: number;
  totalCredito: number;
}

export interface DevolucaoVenda {
  id: string;
  vendaId: string;
  clienteId: string;
  data: string;
  valorCredito: number;
  abatimentoVale: number;
  bonusGerado: number;
  observacoes?: string;
  createdAt: string;
  items: ItemDevolucaoVenda[];
}

export interface Venda {
  id: string;
  numeroSequencial: number;
  clienteId: string;
  vendedorId?: string | null;
  vendedorNome?: string | null;
  clienteNome?: string;
  clienteTelefone?: string;
  clienteEndereco?: string;
  clienteDocumento?: string;
  data: string; // YYYY-MM-DD
  subtotal: number;
  desconto: number;
  totalLiquido: number;
  valorPago: number;
  saldoRestante: number;
  status: "paga" | "pendente" | "cancelada";
  vencimento?: string; // YYYY-MM-DD
  observacoes?: string;
  formaPagamento?: string;
  parcelas?: ValeParcela[];
  instrumentoRecebimento?: {
    tipo: string;
    emitente: string;
    numeroDocumento: string;
    cpfTitular?: string;
    cpfTerceiro?: string;
    banco?: string;
    valor: number;
    vencimento: string;
    status: string;
    observacao?: string;
  } | null;
  items?: ItemVenda[];
  devolucoes?: DevolucaoVenda[];
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ValeParcela {
  id: string;
  vendaId: string;
  numero: number;
  vencimento: string;
  valor: number;
  valorPago: number;
  saldo: number;
  status: "pendente" | "paga" | "cancelada";
  createdAt?: string;
  updatedAt?: string;
}

export interface ItemOrcamento {
  id: string;
  orcamentoId: string;
  produtoId: string;
  fornecedorId?: string | null;
  fornecedorReferencia?: string | null;
  descricao: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  desconto: number;
  total: number;
  faltante: number;
  referencia?: string;
}

export interface Orcamento {
  id: string;
  numeroSequencial: number;
  clienteId: string;
  clienteNome?: string;
  clienteTelefone?: string;
  clienteEndereco?: string;
  clienteDocumento?: string;
  data: string;
  validade?: string;
  subtotal: number;
  desconto: number;
  totalLiquido: number;
  status: "aberto" | "convertido" | "cancelado";
  observacoes?: string;
  vendaId?: string;
  items: ItemOrcamento[];
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
  formaPagamento:
    | "avista_dinheiro"
    | "avista_debito"
    | "cartao_credito"
    | "cheque_emitente"
    | "cheque_terceiro"
    | "duplicata_emitente"
    | "duplicata_terceiro"
    | "bonus"
    | "pix"
    | "vale"
    | "dinheiro"
    | "cartao_debito"
    | "boleto";
  observacao?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DividaCarteira {
  id: string;
  numeroSequencial: number;
  data: string;
  vencimento?: string;
  totalLiquido: number;
  valorPago: number;
  saldoRestante: number;
  status: "pendente";
}

export interface RecebimentoCliente {
  id: string;
  clienteId: string;
  data: string;
  valorRecebido: number;
  valorAplicado: number;
  bonusUtilizado: number;
  bonusGerado: number;
  formaPagamento: string;
  observacao?: string;
  status: "ativo" | "recusado" | "cancelado";
  createdAt: string;
  alocacoes: Array<{
    id: string;
    vendaId: string;
    numeroSequencial: number;
    valor: number;
  }>;
}

export interface TituloCompensacao {
  id: string;
  recebimentoId: string;
  clienteId: string;
  clienteNome: string;
  clienteDocumento?: string;
  tipo: "cheque_emitente" | "cheque_terceiro";
  data: string;
  vencimento: string;
  valorRecebido: number;
  valorAplicado: number;
  bonusGerado: number;
  formaPagamento: "cheque_emitente" | "cheque_terceiro";
  cpfTitular: string;
  cpfTerceiro?: string;
  banco: string;
  numeroCheque: string;
  status: "aguardando" | "compensado" | "recusado";
  motivoStatus?: string;
  observacao?: string;
  recebimentoStatus: "ativo" | "recusado" | "cancelado";
  createdAt: string;
  updatedAt: string;
  alocacoes: Array<{
    id: string;
    vendaId: string;
    numeroSequencial: number;
    valor: number;
    saldoRestante: number;
    deletedAt?: string;
  }>;
  historico: Array<{
    id: string;
    acao: string;
    createdAt: string;
    usuarioNome: string;
    detalhes: Record<string, any>;
  }>;
}

export interface MovimentoBonus {
  id: string;
  clienteId: string;
  recebimentoId?: string;
  vendaId?: string;
  data: string;
  tipo: "credito" | "debito";
  valor: number;
  observacao?: string;
  createdAt: string;
}

export interface CarteiraCliente {
  cliente: Cliente;
  saldoDevedor: number;
  saldoBonus: number;
  dividas: DividaCarteira[];
  recebimentos: RecebimentoCliente[];
  movimentosBonus: MovimentoBonus[];
}

export interface CarteiraResumo {
  saldoDevedor: number;
  saldoBonus: number;
}

export interface OrdemCobrancaParcela {
  id: string;
  ordemId: string;
  numero: number;
  vencimento: string;
  valor: number;
  valorPago: number;
  saldo: number;
  status: "pendente" | "paga" | "cancelada" | "renegociada";
  dataPagamento?: string;
  ultimoRecebimentoId?: string;
  ultimoPagamentoValor?: number;
}

export interface OrdemCobrancaEvento {
  id: string;
  tipo: "criacao" | "pagamento" | "estorno" | "encerramento" | "conclusao";
  data: string;
  parcelaNumero?: number;
  valor?: number;
  formaPagamento?: string;
  texto: string;
}

export interface OrdemCobrancaVale {
  id: string;
  vendaId: string;
  numeroSequencial: number;
  data: string;
  vencimento?: string;
  valorVinculado: number;
  valorPago: number;
  saldo: number;
  saldoAtualVale: number;
}

export interface OrdemCobranca {
  id: string;
  numeroSequencial: number;
  clienteId: string;
  clienteNome: string;
  clienteDocumento?: string;
  dataEmissao: string;
  totalOriginal: number;
  valorPago: number;
  saldo: number;
  saldoBonus: number;
  status: "aberta" | "quitada" | "cancelada" | "renegociada";
  observacao?: string;
  motivoEncerramento?: string;
  createdAt: string;
  updatedAt: string;
  vales: OrdemCobrancaVale[];
  parcelas: OrdemCobrancaParcela[];
  eventos: OrdemCobrancaEvento[];
}

export interface ItemCompra {
  id: string;
  compraId: string;
  produtoId: string;
  produtoNome?: string;
  produtoCodigo?: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
  total: number;
}

export interface ItemOrcamentoCompra {
  id: string;
  orcamentoCompraId: string;
  produtoId: string;
  produtoNome?: string;
  produtoCodigo?: string;
  quantidade: number;
  unidade: string;
  custoEstimado: number;
  total: number;
}

export interface OrcamentoCompra {
  id: string;
  numeroSequencial: number;
  fornecedorId: string;
  fornecedorNome?: string;
  fornecedorTelefone?: string;
  data: string;
  validade?: string;
  subtotal: number;
  desconto: number;
  total: number;
  status: "aberto" | "convertido" | "cancelado";
  observacao?: string;
  compraId?: string;
  items: ItemOrcamentoCompra[];
  createdAt: string;
  updatedAt: string;
}

export interface PagamentoCompra {
  id: string;
  fornecedorId: string;
  compraId: string;
  data: string;
  valor: number;
  formaPagamento: string;
  observacao?: string;
  createdAt: string;
}

export interface Compra {
  id: string;
  numeroSequencial: number;
  fornecedorId: string;
  fornecedorNome?: string;
  fornecedorTelefone?: string;
  data: string; // YYYY-MM-DD
  subtotal: number;
  desconto: number;
  total: number;
  valorPago: number;
  saldoRestante: number;
  status: "paga" | "pendente" | "cancelada";
  formaPagamento: string;
  vencimento?: string;
  orcamentoCompraId?: string;
  observacao?: string;
  items?: ItemCompra[];
  pagamentos?: PagamentoCompra[];
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Config {
  nome_loja: string;
  store_name?: string;
  store_address?: string;
  store_phone?: string;
  store_mobile?: string;
  store_email?: string;
  retencao_backups_dias: string;
}

export interface SegurancaStatus {
  usuarioId: string | null;
  nome: string;
  pinConfigurado: boolean;
}

export interface UsuarioSistema {
  id: string;
  nome: string;
  login: string;
  perfil: "administrador" | "vendedor";
  ativo?: number;
  deveTrocarSenha: number;
  ultimoAcesso?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthStatus {
  configuracaoInicialPendente: boolean;
  configuracaoPermitida: boolean;
  sessaoAtiva: boolean;
}

export interface SystemInfo {
  version: string;
  startedAt: string;
  environment: "production" | "development";
  capabilities?: {
    valeParcelas?: boolean;
  };
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
