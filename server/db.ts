import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Customer data lives outside the application files replaced during updates.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
export const LIVE_DB_FILE = path.join(DATA_DIR, "database.db");
export const MOCK_DB_FILE = path.join(DATA_DIR, "database_mock.db");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");
const CONFIG_PATH = path.join(DATA_DIR, "mock_config.json");

fs.mkdirSync(BACKUP_DIR, { recursive: true });

// One-time, non-destructive migration for installations that stored data in the project root.
const legacyFiles: Array<[string, string]> = [
  ["database.db", "database.db"],
  ["database.db-shm", "database.db-shm"],
  ["database.db-wal", "database.db-wal"],
  ["database_mock.db", "database_mock.db"],
  ["database_mock.db-shm", "database_mock.db-shm"],
  ["database_mock.db-wal", "database_mock.db-wal"],
  ["database_mock_sqlite.db", "database_mock_sqlite.db"],
  ["database_mock_sqlite.db-shm", "database_mock_sqlite.db-shm"],
  ["database_mock_sqlite.db-wal", "database_mock_sqlite.db-wal"],
  ["mock_config.json", "mock_config.json"],
];

for (const [legacyName, dataName] of legacyFiles) {
  const legacyPath = path.join(process.cwd(), legacyName);
  const dataPath = path.join(DATA_DIR, dataName);
  if (fs.existsSync(legacyPath) && !fs.existsSync(dataPath)) {
    fs.copyFileSync(legacyPath, dataPath);
    console.log(`[Database] Migrated local data to: ${dataPath}`);
  }
}

export function isMockModeEnabled(): boolean {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return !!data.mockEnabled;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function getActiveDbFile(): string {
  const enabled = isMockModeEnabled();
  console.log(`[Database] Mock mode status: ${enabled ? "ON" : "OFF"}`);
  return enabled ? MOCK_DB_FILE : LIVE_DB_FILE;
}

let currentDbFile = getActiveDbFile();
let currentDb = new Database(currentDbFile);

// Set WAL mode for better performance
currentDb.pragma("journal_mode = WAL");

export const db = new Proxy({}, {
  get(target, prop) {
    const value = Reflect.get(currentDb, prop);
    if (typeof value === "function") {
      return value.bind(currentDb);
    }
    return value;
  }
}) as any;

export function initDatabase() {
  // Create tables inside a transaction
  db.transaction(() => {
    // 1. Clientes
    db.prepare(`
      CREATE TABLE IF NOT EXISTS clientes (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        telefone TEXT,
        documento TEXT,
        endereco TEXT,
        observacoes TEXT,
        ativo INTEGER DEFAULT 1,
        isWhatsapp INTEGER DEFAULT 0,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 2. Fornecedores
    db.prepare(`
      CREATE TABLE IF NOT EXISTS fornecedores (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        referencia TEXT,
        telefone TEXT,
        documento TEXT,
        observacoes TEXT,
        ativo INTEGER DEFAULT 1,
        isWhatsapp INTEGER DEFAULT 0,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 3. Produtos
    db.prepare(`
      CREATE TABLE IF NOT EXISTS produtos (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        codigo TEXT,
        unidade TEXT NOT NULL, -- metro, unidade, quilograma, rolo, peca
        precoVendaPadrao REAL NOT NULL,
        custoPadrao REAL NOT NULL,
        custoManual REAL,
        custoOrigem TEXT NOT NULL DEFAULT 'manual',
        unidadeCompra TEXT,
        unidadeVenda TEXT,
        fatorConversao REAL DEFAULT 1.0,
        venderUnidadeCompra INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 4. Vendas
    db.prepare(`
      CREATE TABLE IF NOT EXISTS vendas (
        id TEXT PRIMARY KEY,
        numeroSequencial INTEGER NOT NULL,
        clienteId TEXT NOT NULL,
        vendedorId TEXT,
        data TEXT NOT NULL, -- ISO date string (YYYY-MM-DD)
        subtotal REAL NOT NULL,
        desconto REAL NOT NULL,
        totalLiquido REAL NOT NULL,
        valorPago REAL NOT NULL,
        saldoRestante REAL NOT NULL,
        status TEXT NOT NULL, -- paga, pendente, cancelada
        vencimento TEXT, -- ISO date string (YYYY-MM-DD)
        observacoes TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clienteId) REFERENCES clientes (id)
      )
    `).run();

    // Index on sequential number and client
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_seq ON vendas (numeroSequencial)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_vendas_cliente_historico ON vendas (clienteId, deletedAt, numeroSequencial DESC)`).run();

    // 4.1 Orçamentos vinculados aos respectivos clientes.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS orcamentos (
        id TEXT PRIMARY KEY,
        numeroSequencial INTEGER NOT NULL,
        clienteId TEXT NOT NULL,
        data TEXT NOT NULL,
        validade TEXT,
        subtotal REAL NOT NULL,
        desconto REAL NOT NULL,
        totalLiquido REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'aberto',
        observacoes TEXT,
        vendaId TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clienteId) REFERENCES clientes (id),
        FOREIGN KEY (vendaId) REFERENCES vendas (id)
      )
    `).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamentos_seq ON orcamentos (numeroSequencial)`).run();
    // Migração: versões anteriores limitavam o sistema a um orçamento aberto global.
    db.prepare(`DROP INDEX IF EXISTS idx_orcamentos_unico_aberto`).run();
    // Cada cliente mantém somente um orçamento vigente. Em instalações que
    // chegaram a criar duplicados, preservamos o mais recente e encerramos os demais.
    db.prepare(`
      UPDATE orcamentos
      SET status = 'cancelado', updatedAt = CURRENT_TIMESTAMP
      WHERE status = 'aberto'
        AND deletedAt IS NULL
        AND id NOT IN (
          SELECT o1.id
          FROM orcamentos o1
          WHERE o1.status = 'aberto' AND o1.deletedAt IS NULL
            AND o1.numeroSequencial = (
              SELECT MAX(o2.numeroSequencial)
              FROM orcamentos o2
              WHERE o2.clienteId = o1.clienteId
                AND o2.status = 'aberto'
                AND o2.deletedAt IS NULL
            )
        )
    `).run();
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamentos_cliente_vigente
      ON orcamentos (clienteId)
      WHERE status = 'aberto' AND deletedAt IS NULL
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente ON orcamentos (clienteId, numeroSequencial DESC)`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS itens_orcamento (
        id TEXT PRIMARY KEY,
        orcamentoId TEXT NOT NULL,
        produtoId TEXT NOT NULL,
        descricao TEXT NOT NULL,
        quantidade REAL NOT NULL,
        unidade TEXT NOT NULL,
        precoUnitario REAL NOT NULL,
        desconto REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        faltante INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (orcamentoId) REFERENCES orcamentos (id) ON DELETE CASCADE,
        FOREIGN KEY (produtoId) REFERENCES produtos (id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS cliente_orcamento_itens (
        clienteId TEXT NOT NULL,
        produtoId TEXT NOT NULL,
        quantidade REAL NOT NULL DEFAULT 1,
        precoUnitario REAL NOT NULL,
        faltante INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (clienteId, produtoId),
        FOREIGN KEY (clienteId) REFERENCES clientes (id) ON DELETE CASCADE,
        FOREIGN KEY (produtoId) REFERENCES produtos (id) ON DELETE CASCADE
      )
    `).run();

    // 5. ItemVenda
    db.prepare(`
      CREATE TABLE IF NOT EXISTS itens_venda (
        id TEXT PRIMARY KEY,
        vendaId TEXT NOT NULL,
        produtoId TEXT NOT NULL,
        descricao TEXT NOT NULL,
        quantidade REAL NOT NULL,
        unidade TEXT NOT NULL,
        precoUnitario REAL NOT NULL,
        custoUnitario REAL NOT NULL,
        desconto REAL NOT NULL,
        total REAL NOT NULL,
        custoTotal REAL NOT NULL,
        lucroBruto REAL NOT NULL,
        FOREIGN KEY (vendaId) REFERENCES vendas (id) ON DELETE CASCADE,
        FOREIGN KEY (produtoId) REFERENCES produtos (id)
      )
    `).run();

    // 6. Pagamentos
    db.prepare(`
      CREATE TABLE IF NOT EXISTS pagamentos (
        id TEXT PRIMARY KEY,
        clienteId TEXT NOT NULL,
        vendaId TEXT, -- Opcional (vinculado a uma venda ou pagamento avulso/saldo)
        data TEXT NOT NULL, -- YYYY-MM-DD
        valor REAL NOT NULL,
        formaPagamento TEXT NOT NULL, -- dinheiro, pix, cartao_credito, cartao_debito, boleto
        parcelasCartao INTEGER,
        observacao TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clienteId) REFERENCES clientes (id),
        FOREIGN KEY (vendaId) REFERENCES vendas (id)
      )
    `).run();

    // 7. Compras
    db.prepare(`
      CREATE TABLE IF NOT EXISTS compras (
        id TEXT PRIMARY KEY,
        numeroSequencial INTEGER,
        fornecedorId TEXT NOT NULL,
        orcamentoCompraId TEXT,
        data TEXT NOT NULL, -- YYYY-MM-DD
        subtotal REAL NOT NULL,
        desconto REAL NOT NULL,
        total REAL NOT NULL,
        valorPago REAL NOT NULL DEFAULT 0,
        saldoRestante REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pendente',
        formaPagamento TEXT NOT NULL DEFAULT 'nao_informado',
        vencimento TEXT,
        observacao TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fornecedorId) REFERENCES fornecedores (id)
      )
    `).run();

    // 8. ItemCompra
    db.prepare(`
      CREATE TABLE IF NOT EXISTS itens_compra (
        id TEXT PRIMARY KEY,
        compraId TEXT NOT NULL,
        produtoId TEXT NOT NULL,
        quantidade REAL NOT NULL,
        unidade TEXT NOT NULL,
        custoUnitario REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (compraId) REFERENCES compras (id) ON DELETE CASCADE,
        FOREIGN KEY (produtoId) REFERENCES produtos (id)
      )
    `).run();

    // Planejamento de compras: o orçamento registra o que foi solicitado e a
    // compra registra, separadamente, o que efetivamente foi conferido.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS orcamentos_compra (
        id TEXT PRIMARY KEY,
        numeroSequencial INTEGER NOT NULL,
        fornecedorId TEXT NOT NULL,
        data TEXT NOT NULL,
        validade TEXT,
        subtotal REAL NOT NULL,
        desconto REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'aberto',
        observacao TEXT,
        compraId TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fornecedorId) REFERENCES fornecedores (id),
        FOREIGN KEY (compraId) REFERENCES compras (id)
      )
    `).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamentos_compra_seq ON orcamentos_compra (numeroSequencial)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_orcamentos_compra_fornecedor ON orcamentos_compra (fornecedorId, status, data DESC)`).run();
    // Diferentemente das vendas, um fornecedor pode possuir vários pedidos de
    // orçamento abertos ao mesmo tempo.
    db.prepare(`DROP INDEX IF EXISTS idx_orcamentos_compra_vigente`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS itens_orcamento_compra (
        id TEXT PRIMARY KEY,
        orcamentoCompraId TEXT NOT NULL,
        produtoId TEXT NOT NULL,
        quantidade REAL NOT NULL,
        unidade TEXT NOT NULL,
        custoEstimado REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (orcamentoCompraId) REFERENCES orcamentos_compra (id) ON DELETE CASCADE,
        FOREIGN KEY (produtoId) REFERENCES produtos (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_itens_orcamento_compra_documento ON itens_orcamento_compra (orcamentoCompraId)`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS pagamentos_compra (
        id TEXT PRIMARY KEY,
        fornecedorId TEXT NOT NULL,
        compraId TEXT NOT NULL,
        data TEXT NOT NULL,
        valor REAL NOT NULL,
        formaPagamento TEXT NOT NULL,
        observacao TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fornecedorId) REFERENCES fornecedores (id),
        FOREIGN KEY (compraId) REFERENCES compras (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pagamentos_compra_documento ON pagamentos_compra (compraId, deletedAt, data)`).run();

    // 9. Configurações
    db.prepare(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      )
    `).run();

    // 10. Padrão incremental de produtos por cliente
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cliente_produtos_habituais (
        clienteId TEXT NOT NULL,
        produtoId TEXT NOT NULL,
        ultimoPreco REAL NOT NULL,
        ultimaQuantidade REAL,
        ultimaUnidade TEXT NOT NULL,
        vezesComprado INTEGER NOT NULL DEFAULT 1,
        ultimaCompraEm TEXT NOT NULL,
        precoAutorizado REAL,
        oculto INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (clienteId, produtoId),
        FOREIGN KEY (clienteId) REFERENCES clientes (id),
        FOREIGN KEY (produtoId) REFERENCES produtos (id)
      )
    `).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cliente_produtos_habituais_cliente ON cliente_produtos_habituais (clienteId, oculto, ultimaCompraEm DESC)`).run();

    // O mesmo produto pode possuir condições comerciais diferentes conforme
    // o fornecedor. Mantemos a tabela habitual legada para itens antigos sem
    // fornecedor e usamos esta projeção para as variantes identificadas.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cliente_produto_fornecedor_precos (
        clienteId TEXT NOT NULL,
        produtoId TEXT NOT NULL,
        fornecedorId TEXT NOT NULL,
        ultimoPreco REAL NOT NULL,
        ultimaQuantidade REAL,
        ultimaUnidade TEXT NOT NULL,
        vezesComprado INTEGER NOT NULL DEFAULT 0,
        ultimaCompraEm TEXT NOT NULL,
        precoAutorizado REAL,
        oculto INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (clienteId, produtoId, fornecedorId),
        FOREIGN KEY (clienteId) REFERENCES clientes (id),
        FOREIGN KEY (produtoId) REFERENCES produtos (id),
        FOREIGN KEY (fornecedorId) REFERENCES fornecedores (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cliente_produto_fornecedor_cliente ON cliente_produto_fornecedor_precos (clienteId, oculto, ultimaCompraEm DESC)`).run();

    // Catálogo opcional: o produto continua independente, mas pode ser
    // relacionado a um ou mais fornecedores antes ou depois da primeira compra.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS fornecedor_produtos (
        fornecedorId TEXT NOT NULL,
        produtoId TEXT NOT NULL,
        codigoFornecedor TEXT,
        custoFornecedor REAL,
        precoVendaFornecedor REAL,
        observacao TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (fornecedorId, produtoId),
        FOREIGN KEY (fornecedorId) REFERENCES fornecedores (id),
        FOREIGN KEY (produtoId) REFERENCES produtos (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_fornecedor_produtos_produto ON fornecedor_produtos (produtoId, ativo)`).run();

    // Bancos existentes ganham automaticamente os vínculos comprovados pelo
    // histórico de compras, sem alterar produtos cadastrados manualmente.
    db.prepare(`
      INSERT OR IGNORE INTO fornecedor_produtos (fornecedorId, produtoId, ativo)
      SELECT DISTINCT c.fornecedorId, ic.produtoId, 1
      FROM itens_compra ic
      JOIN compras c ON c.id = ic.compraId
      WHERE c.deletedAt IS NULL
    `).run();

    // 11. Usuários locais. A estrutura já permite novos perfis no futuro,
    // mas nesta etapa usamos um administrador responsável pelas autorizações.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        login TEXT,
        perfil TEXT NOT NULL DEFAULT 'operador',
        pinHash TEXT,
        pinSalt TEXT,
        deveTrocarSenha INTEGER NOT NULL DEFAULT 0,
        ultimoAcesso TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 12. Registro imutável das ações sensíveis feitas com PIN.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS auditoria (
        id TEXT PRIMARY KEY,
        usuarioId TEXT,
        acao TEXT NOT NULL,
        entidade TEXT NOT NULL,
        entidadeId TEXT,
        detalhes TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuarioId) REFERENCES usuarios (id)
      )
    `).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria (entidade, entidadeId, createdAt DESC)`).run();

    // 13. Planejamento flexível dos vales. Cada venda a prazo pode possuir
    // quantas parcelas forem necessárias, sem perder o vínculo contábil.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS vale_parcelas (
        id TEXT PRIMARY KEY,
        vendaId TEXT NOT NULL,
        numero INTEGER NOT NULL,
        vencimento TEXT NOT NULL,
        valor REAL NOT NULL,
        valorPago REAL NOT NULL DEFAULT 0,
        saldo REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendente',
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendaId) REFERENCES vendas (id)
      )
    `).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vale_parcelas_numero ON vale_parcelas (vendaId, numero) WHERE deletedAt IS NULL`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_vale_parcelas_vencimento ON vale_parcelas (status, vencimento, deletedAt)`).run();

    // Vales criados antes do parcelamento continuam válidos como uma parcela.
    db.prepare(`
      INSERT INTO vale_parcelas (id, vendaId, numero, vencimento, valor, valorPago, saldo, status)
      SELECT
        'vpar_' || lower(hex(randomblob(8))),
        v.id,
        1,
        v.vencimento,
        v.totalLiquido,
        MIN(v.valorPago, v.totalLiquido),
        MAX(0, v.saldoRestante),
        CASE
          WHEN v.status = 'cancelada' THEN 'cancelada'
          WHEN v.saldoRestante <= 0.005 THEN 'paga'
          ELSE 'pendente'
        END
      FROM vendas v
      WHERE v.vencimento IS NOT NULL
        AND v.deletedAt IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM vale_parcelas vp
          WHERE vp.vendaId = v.id AND vp.deletedAt IS NULL
        )
    `).run();

    // 14. Cheques e duplicatas recebidos em vendas. O título permanece em
    // carteira até uma baixa explícita; o vencimento, por si só, não o recebe.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS instrumentos_recebimento (
        id TEXT PRIMARY KEY,
        vendaId TEXT NOT NULL,
        clienteId TEXT NOT NULL,
        tipo TEXT NOT NULL,
        emitente TEXT NOT NULL,
        numeroDocumento TEXT NOT NULL,
        cpfTitular TEXT,
        cpfTerceiro TEXT,
        banco TEXT,
        valor REAL NOT NULL,
        vencimento TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'em_carteira',
        observacao TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendaId) REFERENCES vendas (id),
        FOREIGN KEY (clienteId) REFERENCES clientes (id)
      )
    `).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_instrumentos_vencimento ON instrumentos_recebimento (status, vencimento)`).run();

    // 15. Carteira do cliente. Um recebimento representa o dinheiro que
    // efetivamente entrou; as alocações registram exatamente quais vendas
    // foram baixadas e os movimentos mantêm o bônus auditável.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS recebimentos_cliente (
        id TEXT PRIMARY KEY,
        clienteId TEXT NOT NULL,
        data TEXT NOT NULL,
        valorRecebido REAL NOT NULL DEFAULT 0,
        valorAplicado REAL NOT NULL DEFAULT 0,
        bonusUtilizado REAL NOT NULL DEFAULT 0,
        bonusGerado REAL NOT NULL DEFAULT 0,
        formaPagamento TEXT NOT NULL,
        parcelasCartao INTEGER,
        observacao TEXT,
        pagamentoId TEXT,
        status TEXT NOT NULL DEFAULT 'ativo',
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clienteId) REFERENCES clientes (id),
        FOREIGN KEY (pagamentoId) REFERENCES pagamentos (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_recebimentos_cliente_data ON recebimentos_cliente (clienteId, data DESC, createdAt DESC)`).run();

    // Dados bancários de cheques usados em baixas individuais, múltiplas ou
    // vinculadas a ordens. O recebimento continua sendo o fato financeiro e
    // este registro guarda apenas os dados do instrumento apresentado.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS recebimento_instrumentos (
        id TEXT PRIMARY KEY,
        recebimentoId TEXT NOT NULL UNIQUE,
        clienteId TEXT NOT NULL,
        tipo TEXT NOT NULL,
        vencimento TEXT NOT NULL,
        cpfTitular TEXT NOT NULL,
        cpfTerceiro TEXT,
        banco TEXT NOT NULL,
        numeroCheque TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'aguardando',
        dataCompensacao TEXT,
        motivoStatus TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recebimentoId) REFERENCES recebimentos_cliente (id),
        FOREIGN KEY (clienteId) REFERENCES clientes (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_recebimento_instrumentos_vencimento ON recebimento_instrumentos (vencimento, deletedAt)`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS recebimento_alocacoes (
        id TEXT PRIMARY KEY,
        recebimentoId TEXT NOT NULL,
        vendaId TEXT NOT NULL,
        valor REAL NOT NULL,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recebimentoId) REFERENCES recebimentos_cliente (id),
        FOREIGN KEY (vendaId) REFERENCES vendas (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_recebimento_alocacoes_recebimento ON recebimento_alocacoes (recebimentoId, deletedAt)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_recebimento_alocacoes_venda ON recebimento_alocacoes (vendaId, deletedAt)`).run();

    // Ordens de cobrança formalizam uma negociação sem substituir os vales.
    // O vínculo ativo em ordem_cobranca_vales impede que o mesmo saldo seja
    // prometido simultaneamente em duas negociações abertas.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS ordens_cobranca (
        id TEXT PRIMARY KEY,
        numeroSequencial INTEGER NOT NULL,
        clienteId TEXT NOT NULL,
        dataEmissao TEXT NOT NULL,
        totalOriginal REAL NOT NULL,
        valorPago REAL NOT NULL DEFAULT 0,
        saldo REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'aberta',
        observacao TEXT,
        motivoEncerramento TEXT,
        substituidaPorId TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clienteId) REFERENCES clientes (id),
        FOREIGN KEY (substituidaPorId) REFERENCES ordens_cobranca (id)
      )
    `).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ordens_cobranca_seq ON ordens_cobranca (numeroSequencial)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ordens_cobranca_cliente ON ordens_cobranca (clienteId, status, dataEmissao DESC)`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS ordem_cobranca_vales (
        id TEXT PRIMARY KEY,
        ordemId TEXT NOT NULL,
        vendaId TEXT NOT NULL,
        valorVinculado REAL NOT NULL,
        valorPago REAL NOT NULL DEFAULT 0,
        saldo REAL NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ordemId) REFERENCES ordens_cobranca (id),
        FOREIGN KEY (vendaId) REFERENCES vendas (id)
      )
    `).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ordem_cobranca_vale_documento ON ordem_cobranca_vales (ordemId, vendaId)`).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ordem_cobranca_vale_ativo ON ordem_cobranca_vales (vendaId) WHERE ativo = 1`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS ordem_cobranca_parcelas (
        id TEXT PRIMARY KEY,
        ordemId TEXT NOT NULL,
        numero INTEGER NOT NULL,
        vencimento TEXT NOT NULL,
        valor REAL NOT NULL,
        valorPago REAL NOT NULL DEFAULT 0,
        saldo REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendente',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ordemId) REFERENCES ordens_cobranca (id)
      )
    `).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ordem_cobranca_parcela_numero ON ordem_cobranca_parcelas (ordemId, numero)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ordem_cobranca_parcela_vencimento ON ordem_cobranca_parcelas (status, vencimento)`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS ordem_cobranca_recebimentos (
        id TEXT PRIMARY KEY,
        ordemId TEXT NOT NULL,
        recebimentoId TEXT NOT NULL,
        vendaId TEXT NOT NULL,
        valor REAL NOT NULL,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ordemId) REFERENCES ordens_cobranca (id),
        FOREIGN KEY (recebimentoId) REFERENCES recebimentos_cliente (id),
        FOREIGN KEY (vendaId) REFERENCES vendas (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ordem_cobranca_recebimento ON ordem_cobranca_recebimentos (recebimentoId, deletedAt)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ordem_cobranca_recebimento_ordem ON ordem_cobranca_recebimentos (ordemId, deletedAt)`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS ordem_cobranca_parcela_recebimentos (
        id TEXT PRIMARY KEY,
        ordemId TEXT NOT NULL,
        parcelaId TEXT NOT NULL,
        recebimentoId TEXT NOT NULL,
        valor REAL NOT NULL,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ordemId) REFERENCES ordens_cobranca (id),
        FOREIGN KEY (parcelaId) REFERENCES ordem_cobranca_parcelas (id),
        FOREIGN KEY (recebimentoId) REFERENCES recebimentos_cliente (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ordem_parcela_recebimento ON ordem_cobranca_parcela_recebimentos (recebimentoId, deletedAt)`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS cliente_bonus_movimentos (
        id TEXT PRIMARY KEY,
        clienteId TEXT NOT NULL,
        recebimentoId TEXT,
        vendaId TEXT,
        data TEXT NOT NULL,
        tipo TEXT NOT NULL,
        valor REAL NOT NULL,
        observacao TEXT,
        deletedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clienteId) REFERENCES clientes (id),
        FOREIGN KEY (recebimentoId) REFERENCES recebimentos_cliente (id),
        FOREIGN KEY (vendaId) REFERENCES vendas (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cliente_bonus_saldo ON cliente_bonus_movimentos (clienteId, deletedAt)`).run();

    // 16. Devoluções preservam a venda original e geram crédito rastreável
    // na carteira do cliente.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS devolucoes_venda (
        id TEXT PRIMARY KEY,
        vendaId TEXT NOT NULL,
        clienteId TEXT NOT NULL,
        data TEXT NOT NULL,
        valorCredito REAL NOT NULL,
        abatimentoVale REAL NOT NULL DEFAULT 0,
        bonusGerado REAL NOT NULL DEFAULT 0,
        observacoes TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendaId) REFERENCES vendas (id),
        FOREIGN KEY (clienteId) REFERENCES clientes (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_devolucoes_venda ON devolucoes_venda (vendaId, createdAt DESC)`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS itens_devolucao (
        id TEXT PRIMARY KEY,
        devolucaoId TEXT NOT NULL,
        itemVendaId TEXT NOT NULL,
        produtoId TEXT NOT NULL,
        quantidade REAL NOT NULL,
        valorUnitarioCredito REAL NOT NULL,
        totalCredito REAL NOT NULL,
        FOREIGN KEY (devolucaoId) REFERENCES devolucoes_venda (id),
        FOREIGN KEY (itemVendaId) REFERENCES itens_venda (id),
        FOREIGN KEY (produtoId) REFERENCES produtos (id)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_itens_devolucao_item ON itens_devolucao (itemVendaId)`).run();

    db.prepare(`
      INSERT OR IGNORE INTO usuarios (id, nome, perfil, ativo)
      VALUES ('usuario_admin', 'Administrador', 'administrador', 1)
    `).run();

    const configuracoesLoja: Array<[string, string]> = [
      ["store_name", "Luciano Couros"],
      ["store_address", "R. Lunard, 289 - B. Caiçara - CEP: 30.770-030 - BH/MG"],
      ["store_phone", "(31) 3413-5778"],
      ["store_mobile", "98800-5778 e 98719-4108"],
      ["store_email", "lucianocouros@hotmail.com"]
    ];
    const inserirConfiguracao = db.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)");
    for (const configuracao of configuracoesLoja) inserirConfiguracao.run(...configuracao);
  })();

  // Dynamic migrations for existing databases to support WhatsApp and product unit conversion fields
  try { db.prepare(`ALTER TABLE clientes ADD COLUMN isWhatsapp INTEGER DEFAULT 0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE fornecedores ADD COLUMN isWhatsapp INTEGER DEFAULT 0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE fornecedores ADD COLUMN referencia TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE usuarios ADD COLUMN login TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE usuarios ADD COLUMN deveTrocarSenha INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE usuarios ADD COLUMN ultimoAcesso TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE vendas ADD COLUMN vendedorId TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE instrumentos_recebimento ADD COLUMN cpfTitular TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE instrumentos_recebimento ADD COLUMN cpfTerceiro TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE instrumentos_recebimento ADD COLUMN banco TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE recebimento_instrumentos ADD COLUMN status TEXT NOT NULL DEFAULT 'aguardando'`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE recebimento_instrumentos ADD COLUMN dataCompensacao TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE recebimento_instrumentos ADD COLUMN motivoStatus TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE pagamentos ADD COLUMN parcelasCartao INTEGER`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE recebimentos_cliente ADD COLUMN parcelasCartao INTEGER`).run(); } catch (e) {}
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_recebimento_instrumentos_status ON recebimento_instrumentos (status, vencimento, deletedAt)`).run();
  db.prepare(`UPDATE usuarios SET login = 'gerente' WHERE id = 'usuario_admin' AND TRIM(COALESCE(login, '')) = ''`).run();
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios (LOWER(login)) WHERE login IS NOT NULL`).run();
  try { db.prepare(`ALTER TABLE produtos ADD COLUMN unidadeCompra TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE produtos ADD COLUMN unidadeVenda TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE produtos ADD COLUMN fatorConversao REAL DEFAULT 1.0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE produtos ADD COLUMN venderUnidadeCompra INTEGER DEFAULT 0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE produtos ADD COLUMN custoManual REAL`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE fornecedor_produtos ADD COLUMN custoFornecedor REAL`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE fornecedor_produtos ADD COLUMN precoVendaFornecedor REAL`).run(); } catch (e) {}
  const colunasComprasAntesDaMigracao = db.prepare(`PRAGMA table_info(compras)`).all() as Array<{ name: string }>;
  const migrarFinanceiroComprasLegadas = !colunasComprasAntesDaMigracao.some((coluna) => coluna.name === "valorPago");
  try { db.prepare(`ALTER TABLE compras ADD COLUMN numeroSequencial INTEGER`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE compras ADD COLUMN orcamentoCompraId TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE compras ADD COLUMN valorPago REAL NOT NULL DEFAULT 0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE compras ADD COLUMN saldoRestante REAL NOT NULL DEFAULT 0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE compras ADD COLUMN status TEXT NOT NULL DEFAULT 'pendente'`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE compras ADD COLUMN formaPagamento TEXT NOT NULL DEFAULT 'nao_informado'`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE compras ADD COLUMN vencimento TEXT`).run(); } catch (e) {}
  db.prepare(`
    UPDATE compras
    SET numeroSequencial = (
      SELECT COUNT(*) FROM compras anterior
      WHERE anterior.createdAt < compras.createdAt
         OR (anterior.createdAt = compras.createdAt AND anterior.id <= compras.id)
    )
    WHERE numeroSequencial IS NULL
  `).run();
  if (migrarFinanceiroComprasLegadas) {
    db.prepare(`
      UPDATE compras
      SET valorPago = total,
          saldoRestante = 0,
          status = 'paga'
    `).run();
  }
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_compras_seq ON compras (numeroSequencial)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_compras_fornecedor_status ON compras (fornecedorId, status, data DESC)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_compras_forma_status ON compras (formaPagamento, status, vencimento)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_itens_compra_documento ON itens_compra (compraId)`).run();
  db.prepare(`
    UPDATE fornecedores
    SET referencia = (
      SELECT fp.codigoFornecedor
      FROM fornecedor_produtos fp
      WHERE fp.fornecedorId = fornecedores.id
        AND TRIM(COALESCE(fp.codigoFornecedor, '')) <> ''
      ORDER BY fp.updatedAt DESC, fp.createdAt DESC
      LIMIT 1
    )
    WHERE TRIM(COALESCE(referencia, '')) = ''
      AND EXISTS (
        SELECT 1
        FROM fornecedor_produtos fp
        WHERE fp.fornecedorId = fornecedores.id
          AND TRIM(COALESCE(fp.codigoFornecedor, '')) <> ''
      )
  `).run();
  db.prepare(`
    UPDATE fornecedor_produtos
    SET custoFornecedor = COALESCE(
          custoFornecedor,
          (
            SELECT ic.custoUnitario
            FROM itens_compra ic
            JOIN compras c ON c.id = ic.compraId
            WHERE ic.produtoId = fornecedor_produtos.produtoId
              AND c.fornecedorId = fornecedor_produtos.fornecedorId
              AND c.deletedAt IS NULL
            ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC
            LIMIT 1
          ),
          (SELECT p.custoPadrao FROM produtos p WHERE p.id = fornecedor_produtos.produtoId),
          0
        ),
        precoVendaFornecedor = COALESCE(
          precoVendaFornecedor,
          (SELECT p.precoVendaPadrao FROM produtos p WHERE p.id = fornecedor_produtos.produtoId),
          0
        )
  `).run();
  let custoOrigemAdicionada = false;
  try {
    db.prepare(`ALTER TABLE produtos ADD COLUMN custoOrigem TEXT NOT NULL DEFAULT 'manual'`).run();
    custoOrigemAdicionada = true;
  } catch (e) {}
  if (custoOrigemAdicionada) {
    db.prepare(`
      UPDATE produtos
      SET custoOrigem = CASE
        WHEN EXISTS (
          SELECT 1
          FROM itens_compra ic
          JOIN compras c ON c.id = ic.compraId
          WHERE ic.produtoId = produtos.id AND c.deletedAt IS NULL
        ) THEN 'compra'
        ELSE 'manual'
      END
    `).run();
  }
  try { db.prepare(`ALTER TABLE pagamentos ADD COLUMN recebimentoId TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE itens_orcamento ADD COLUMN faltante INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE itens_orcamento ADD COLUMN fornecedorId TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE itens_orcamento ADD COLUMN fornecedorReferencia TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE itens_venda ADD COLUMN fornecedorId TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE itens_venda ADD COLUMN fornecedorReferencia TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE cliente_bonus_movimentos ADD COLUMN vendaId TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE devolucoes_venda ADD COLUMN abatimentoVale REAL`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE devolucoes_venda ADD COLUMN bonusGerado REAL`).run(); } catch (e) {}
  db.prepare(`
    UPDATE devolucoes_venda
    SET bonusGerado = COALESCE((
      SELECT SUM(bm.valor)
      FROM cliente_bonus_movimentos bm
      WHERE bm.vendaId = devolucoes_venda.vendaId
        AND bm.data = devolucoes_venda.data
        AND bm.createdAt = devolucoes_venda.createdAt
        AND bm.tipo = 'credito'
        AND bm.deletedAt IS NULL
        AND bm.observacao LIKE 'Crédito excedente da devolução%'
    ), 0)
    WHERE bonusGerado IS NULL
  `).run();
  db.prepare(`
    UPDATE devolucoes_venda
    SET abatimentoVale = MAX(0, valorCredito - COALESCE(bonusGerado, 0))
    WHERE abatimentoVale IS NULL
  `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pagamentos_recebimento ON pagamentos (recebimentoId)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pagamentos_cliente_historico ON pagamentos (clienteId, deletedAt, data DESC, createdAt DESC)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_cliente_bonus_venda ON cliente_bonus_movimentos (vendaId, deletedAt)`).run();

  // A partir desta versão compra e venda usam a mesma unidade. Mantemos as
  // colunas antigas apenas para compatibilidade com bancos já instalados.
  db.prepare(`
    UPDATE produtos
    SET unidade = COALESCE(NULLIF(unidadeVenda, ''), NULLIF(unidadeCompra, ''), unidade),
        unidadeCompra = COALESCE(NULLIF(unidadeVenda, ''), NULLIF(unidadeCompra, ''), unidade),
        unidadeVenda = COALESCE(NULLIF(unidadeVenda, ''), NULLIF(unidadeCompra, ''), unidade),
        custoManual = COALESCE(custoManual, custoPadrao),
        fatorConversao = 1,
        venderUnidadeCompra = 0
  `).run();

  // Seed initial demo data if database is empty
  seedDemoData();

  // Backfill existing installations once. Afterwards each sale keeps the projection current.
  const habitualCount = db.prepare("SELECT COUNT(*) as count FROM cliente_produtos_habituais").get() as { count: number };
  if (habitualCount.count === 0) {
    const clientesComVenda = db.prepare(`
      SELECT DISTINCT clienteId
      FROM vendas
      WHERE deletedAt IS NULL AND status <> 'cancelada'
    `).all() as Array<{ clienteId: string }>;

    db.transaction(() => {
      for (const { clienteId } of clientesComVenda) {
        rebuildClienteProdutosHabituais(clienteId);
      }
    })();
  }
}

function seedDemoData() {
  const rowCount = db.prepare("SELECT COUNT(*) as count FROM clientes").get() as { count: number };
  if (rowCount.count > 0) {
    return; // Already has data
  }

  if (isMockModeEnabled()) {
    seedFromMockJson();
    return;
  }

  console.log("Seeding database with professional demo data...");

  db.transaction(() => {
    // Clientes
    const clientes = [
      { id: "cli_1", nome: "Maria Silva Pereira", telefone: "(11) 98765-4321", documento: "123.456.789-00", endereco: "Rua das Flores, 123 - São Paulo", observacoes: "Cliente antiga, costureira de vestidos de noiva. Paga sempre em dia.", ativo: 1 },
      { id: "cli_2", nome: "João Carlos Santos", telefone: "(11) 97654-3210", documento: "987.654.321-11", endereco: "Av. Paulista, 1000 - São Paulo", observacoes: "Comprador de couro para estofamento de carros.", ativo: 1 },
      { id: "cli_3", nome: "Ana Paula Oliveira", telefone: "(11) 96543-2109", documento: "456.789.123-22", endereco: "Rua Augusta, 450 - São Paulo", observacoes: "Cliente nova, faz bolsas artesanais.", ativo: 1 },
      { id: "cli_4", nome: "Ateliê de Costura Linha de Ouro", telefone: "(11) 3222-4444", documento: "12.345.678/0001-99", endereco: "Rua Bresser, 300 - Brás", observacoes: "Compra em grande quantidade.", ativo: 1 }
    ];

    for (const c of clientes) {
      db.prepare(`
        INSERT INTO clientes (id, nome, telefone, documento, endereco, observacoes, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(c.id, c.nome, c.telefone, c.documento, c.endereco, c.observacoes, c.ativo);
    }

    // Fornecedores
    const fornecedores = [
      { id: "for_1", nome: "Tecidos do Brasil S/A", telefone: "(11) 3333-5555", documento: "99.888.777/0001-66", observacoes: "Fornecedor principal de tricoline e linho." },
      { id: "for_2", nome: "Zíper & Botões Piratininga", telefone: "(11) 3444-6666", documento: "11.222.333/0001-44", observacoes: "Fornecedor de aviamentos em geral." },
      { id: "for_3", nome: "Curtume Couro Real", telefone: "(51) 3555-1234", documento: "55.666.777/0001-88", observacoes: "Fornecedor de couro bovino legítimo, localizado no RS." }
    ];

    for (const f of fornecedores) {
      db.prepare(`
        INSERT INTO fornecedores (id, nome, telefone, documento, observacoes)
        VALUES (?, ?, ?, ?, ?)
      `).run(f.id, f.nome, f.telefone, f.documento, f.observacoes);
    }

    // Produtos
    const produtos = [
      { id: "prod_1", nome: "Tecido Tricoline Estampado 100% Algodão", codigo: "TRI-001", unidade: "metro", precoVendaPadrao: 35.00, custoPadrao: 18.50 },
      { id: "prod_2", nome: "Couro Sintético PU Premium", codigo: "COU-002", unidade: "metro", precoVendaPadrao: 58.00, custoPadrao: 28.00 },
      { id: "prod_3", nome: "Zíper de Nylon N.5 Reforçado", codigo: "ZIP-005", unidade: "unidade", precoVendaPadrao: 2.50, custoPadrao: 1.10 },
      { id: "prod_4", nome: "Cursor para Zíper N.5 Niquelado", codigo: "CUR-005", unidade: "unidade", precoVendaPadrao: 1.20, custoPadrao: 0.45 },
      { id: "prod_5", nome: "Rolo de Entretela Colante 50m", codigo: "ENT-050", unidade: "rolo", precoVendaPadrao: 120.00, custoPadrao: 65.00 },
      { id: "prod_6", nome: "Linha de Costura Poliéster Cone", codigo: "LIN-100", unidade: "peca", precoVendaPadrao: 12.50, custoPadrao: 5.50 }
    ];

    for (const p of produtos) {
      db.prepare(`
        INSERT INTO produtos (id, nome, codigo, unidade, precoVendaPadrao, custoPadrao)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(p.id, p.nome, p.codigo, p.unidade, p.precoVendaPadrao, p.custoPadrao);
    }

    // Configurações
    db.prepare("INSERT INTO configuracoes (chave, valor) VALUES (?, ?)").run("retencao_backups_dias", "30");
    db.prepare("INSERT INTO configuracoes (chave, valor) VALUES (?, ?)").run("nome_loja", "Central dos Tecidos e Aviamentos");

    // Histórico de Compras (da Loja com seus Fornecedores)
    // Compra 1: Tecidos do Brasil
    const compra1Id = "comp_1";
    const dataCompra1 = "2026-06-15";
    db.prepare(`
      INSERT INTO compras (id, fornecedorId, data, subtotal, desconto, total)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(compra1Id, "for_1", dataCompra1, 1915.00, 100.00, 1815.00);

    // Itens Compra 1
    db.prepare(`
      INSERT INTO itens_compra (id, compraId, produtoId, quantidade, unidade, custoUnitario, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("it_comp_1", compra1Id, "prod_1", 100, "metro", 18.50, 1850.00); // 100 metros de tricoline

    db.prepare(`
      INSERT INTO itens_compra (id, compraId, produtoId, quantidade, unidade, custoUnitario, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("it_comp_2", compra1Id, "prod_6", 10, "peca", 6.50, 65.00); // 10 cones de linha (custo real flutuante)

    // Compra 2: Aviamentos Piratininga
    const compra2Id = "comp_2";
    const dataCompra2 = "2026-07-02";
    db.prepare(`
      INSERT INTO compras (id, fornecedorId, data, subtotal, desconto, total)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(compra2Id, "for_2", dataCompra2, 570.00, 0, 570.00);

    db.prepare(`
      INSERT INTO itens_compra (id, compraId, produtoId, quantidade, unidade, custoUnitario, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("it_comp_3", compra2Id, "prod_3", 300, "unidade", 1.10, 330.00); // 300 ziperes

    db.prepare(`
      INSERT INTO itens_compra (id, compraId, produtoId, quantidade, unidade, custoUnitario, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("it_comp_4", compra2Id, "prod_4", 500, "unidade", 0.48, 240.00); // 500 cursores


    // Histórico de Vendas
    // Venda 1: Maria Silva (Paga integralmente)
    const venda1Id = "vend_1";
    const dataVenda1 = "2026-07-10";
    db.prepare(`
      INSERT INTO vendas (id, numeroSequencial, clienteId, data, subtotal, desconto, totalLiquido, valorPago, saldoRestante, status, vencimento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(venda1Id, 1, "cli_1", dataVenda1, 199.00, 19.00, 180.00, 180.00, 0.00, "paga", null);

    // Itens Venda 1
    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_1", venda1Id, "prod_1", "Tecido Tricoline Estampado 100% Algodão", 5.0, "metro", 35.00, 18.50, 0, 175.00, 92.50, 82.50);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_2", venda1Id, "prod_3", "Zíper de Nylon N.5 Reforçado", 8, "unidade", 2.50, 1.10, 0, 20.00, 8.80, 11.20);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_3", venda1Id, "prod_4", "Cursor para Zíper N.5 Niquelado", 4, "unidade", 1.00, 0.45, 0, 4.00, 1.80, 2.20);

    // Pagamento da Venda 1
    db.prepare(`
      INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("pag_1", "cli_1", venda1Id, dataVenda1, 180.00, "pix", "Pago via Pix na entrega");


    // Venda 2: João Carlos Santos (Paga Parcialmente - Pendente)
    const venda2Id = "vend_2";
    const dataVenda2 = "2026-07-15";
    db.prepare(`
      INSERT INTO vendas (id, numeroSequencial, clienteId, data, subtotal, desconto, totalLiquido, valorPago, saldoRestante, status, vencimento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(venda2Id, 2, "cli_2", dataVenda2, 1285.00, 85.00, 1200.00, 400.00, 800.00, "pendente", "2026-08-15");

    // Itens Venda 2
    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_4", venda2Id, "prod_2", "Couro Sintético PU Premium", 20, "metro", 58.00, 28.00, 0, 1160.00, 560.00, 600.00);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_5", venda2Id, "prod_5", "Rolo de Entretela Colante 50m", 1, "rolo", 120.00, 65.00, 0, 120.00, 65.00, 55.00);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_6", venda2Id, "prod_6", "Linha de Costura Poliéster Cone", 2, "peca", 12.50, 5.50, 2.50, 22.50, 11.00, 11.50);

    // Pagamento Parcial Venda 2
    db.prepare(`
      INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("pag_2", "cli_2", venda2Id, dataVenda2, 400.00, "dinheiro", "Sinal em dinheiro, restante para 30 dias");


    // Venda 3: Ateliê Linha de Ouro (Não Paga - Pendente, Vencida)
    const venda3Id = "vend_3";
    const dataVenda3 = "2026-07-01"; // Mais antiga, já vencida para simular cobrança
    db.prepare(`
      INSERT INTO vendas (id, numeroSequencial, clienteId, data, subtotal, desconto, totalLiquido, valorPago, saldoRestante, status, vencimento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(venda3Id, 3, "cli_4", dataVenda3, 850.00, 50.00, 800.00, 0.00, 800.00, "pendente", "2026-07-15");

    // Itens Venda 3
    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_7", venda3Id, "prod_1", "Tecido Tricoline Estampado 100% Algodão", 20, "metro", 35.00, 18.50, 0, 700.00, 370.00, 330.00);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_8", venda3Id, "prod_5", "Rolo de Entretela Colante 50m", 1, "rolo", 120.00, 65.00, 0, 120.00, 65.00, 55.00);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_9", venda3Id, "prod_3", "Zíper de Nylon N.5 Reforçado", 12, "unidade", 2.50, 1.10, 0, 30.00, 13.20, 16.80);


    // Venda 4: Ana Paula Oliveira (Venda hoje)
    const todayStr = "2026-07-20";
    const venda4Id = "vend_4";
    db.prepare(`
      INSERT INTO vendas (id, numeroSequencial, clienteId, data, subtotal, desconto, totalLiquido, valorPago, saldoRestante, status, vencimento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(venda4Id, 4, "cli_3", todayStr, 116.00, 6.00, 110.00, 110.00, 0.00, "paga", null);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_10", venda4Id, "prod_1", "Tecido Tricoline Estampado 100% Algodão", 2, "metro", 35.00, 18.50, 0, 70.00, 37.00, 33.00);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_11", venda4Id, "prod_2", "Couro Sintético PU Premium", 0.5, "metro", 58.00, 28.00, 0, 29.00, 14.00, 15.00);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_12", venda4Id, "prod_3", "Zíper de Nylon N.5 Reforçado", 4, "unidade", 2.50, 1.10, 0, 10.00, 4.40, 5.60);

    db.prepare(`
      INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("it_vend_13", venda4Id, "prod_4", "Cursor para Zíper N.5 Niquelado", 6, "unidade", 1.20, 0.45, 0.20, 7.00, 2.70, 4.30);

    // Pagamento da Venda 4
    db.prepare(`
      INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("pag_3", "cli_3", venda4Id, todayStr, 110.00, "pix", "Pago via Pix na hora");

    console.log("Demo data successfully seeded!");
  });
}

export function rebuildClienteProdutosHabituais(clienteId: string) {
  const existentes = db.prepare(`
    SELECT produtoId, ultimoPreco, ultimaQuantidade, ultimaUnidade, vezesComprado,
           ultimaCompraEm, oculto, precoAutorizado
    FROM cliente_produtos_habituais
    WHERE clienteId = ?
  `).all(clienteId) as Array<{
    produtoId: string;
    ultimoPreco: number;
    ultimaQuantidade: number | null;
    ultimaUnidade: string;
    vezesComprado: number;
    ultimaCompraEm: string;
    oculto: number;
    precoAutorizado: number | null;
  }>;

  const preferencias = new Map(existentes.map((item) => [item.produtoId, item]));
  const existentesPorFornecedor = db.prepare(`
    SELECT fornecedorId, produtoId, ultimoPreco, ultimaQuantidade, ultimaUnidade,
           vezesComprado, ultimaCompraEm, oculto, precoAutorizado
    FROM cliente_produto_fornecedor_precos
    WHERE clienteId = ?
  `).all(clienteId) as Array<{
    fornecedorId: string;
    produtoId: string;
    ultimoPreco: number;
    ultimaQuantidade: number | null;
    ultimaUnidade: string;
    vezesComprado: number;
    ultimaCompraEm: string;
    oculto: number;
    precoAutorizado: number | null;
  }>;
  const chaveFornecedor = (produtoId: string, fornecedorId: string) => `${produtoId}::${fornecedorId}`;
  const preferenciasPorFornecedor = new Map(
    existentesPorFornecedor.map((item) => [chaveFornecedor(item.produtoId, item.fornecedorId), item])
  );
  const historico = db.prepare(`
    SELECT
      iv.vendaId,
      iv.produtoId,
      iv.fornecedorId,
      iv.quantidade,
      iv.unidade,
      iv.precoUnitario,
      v.data,
      v.numeroSequencial
    FROM itens_venda iv
    JOIN vendas v ON v.id = iv.vendaId
    WHERE v.clienteId = ?
      AND v.deletedAt IS NULL
      AND v.status <> 'cancelada'
    ORDER BY v.data ASC, v.numeroSequencial ASC, iv.id ASC
  `).all(clienteId) as Array<{
    vendaId: string;
    produtoId: string;
    fornecedorId: string | null;
    quantidade: number;
    unidade: string;
    precoUnitario: number;
    data: string;
    numeroSequencial: number;
  }>;

  const agregados = new Map<string, {
    produtoId: string;
    ultimoPreco: number;
    ultimaQuantidade: number;
    ultimaUnidade: string;
    ultimaCompraEm: string;
    vendas: Set<string>;
  }>();
  const agregadosPorFornecedor = new Map<string, {
    produtoId: string;
    fornecedorId: string;
    ultimoPreco: number;
    ultimaQuantidade: number;
    ultimaUnidade: string;
    ultimaCompraEm: string;
    vendas: Set<string>;
  }>();

  for (const item of historico) {
    if (item.fornecedorId) {
      const chave = chaveFornecedor(item.produtoId, item.fornecedorId);
      const atual = agregadosPorFornecedor.get(chave) || {
        produtoId: item.produtoId,
        fornecedorId: item.fornecedorId,
        ultimoPreco: Number(item.precoUnitario),
        ultimaQuantidade: Number(item.quantidade),
        ultimaUnidade: item.unidade,
        ultimaCompraEm: item.data,
        vendas: new Set<string>(),
      };
      atual.ultimoPreco = Number(item.precoUnitario);
      atual.ultimaQuantidade = Number(item.quantidade);
      atual.ultimaUnidade = item.unidade;
      atual.ultimaCompraEm = item.data;
      atual.vendas.add(item.vendaId);
      agregadosPorFornecedor.set(chave, atual);
      continue;
    }
    const atual = agregados.get(item.produtoId) || {
      produtoId: item.produtoId,
      ultimoPreco: Number(item.precoUnitario),
      ultimaQuantidade: Number(item.quantidade),
      ultimaUnidade: item.unidade,
      ultimaCompraEm: item.data,
      vendas: new Set<string>(),
    };

    atual.ultimoPreco = Number(item.precoUnitario);
    atual.ultimaQuantidade = Number(item.quantidade);
    atual.ultimaUnidade = item.unidade;
    atual.ultimaCompraEm = item.data;
    atual.vendas.add(item.vendaId);
    agregados.set(item.produtoId, atual);
  }

  db.prepare("DELETE FROM cliente_produtos_habituais WHERE clienteId = ?").run(clienteId);
  db.prepare("DELETE FROM cliente_produto_fornecedor_precos WHERE clienteId = ?").run(clienteId);
  const insert = db.prepare(`
    INSERT INTO cliente_produtos_habituais (
      clienteId, produtoId, ultimoPreco, ultimaQuantidade, ultimaUnidade,
      vezesComprado, ultimaCompraEm, precoAutorizado, oculto
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPorFornecedor = db.prepare(`
    INSERT INTO cliente_produto_fornecedor_precos (
      clienteId, produtoId, fornecedorId, ultimoPreco, ultimaQuantidade,
      ultimaUnidade, vezesComprado, ultimaCompraEm, precoAutorizado, oculto
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of agregados.values()) {
    const preferencia = preferencias.get(item.produtoId);
    insert.run(
      clienteId,
      item.produtoId,
      item.ultimoPreco,
      item.ultimaQuantidade,
      item.ultimaUnidade,
      item.vendas.size,
      item.ultimaCompraEm,
      preferencia?.precoAutorizado ?? null,
      preferencia?.oculto ?? 0,
    );
  }

  // Preços autorizados em orçamentos também pertencem à base do cliente,
  // mesmo antes de o produto aparecer em uma venda concluída.
  for (const preferencia of existentes) {
    if (agregados.has(preferencia.produtoId)) continue;
    insert.run(
      clienteId,
      preferencia.produtoId,
      preferencia.ultimoPreco,
      preferencia.ultimaQuantidade,
      preferencia.ultimaUnidade,
      preferencia.vezesComprado,
      preferencia.ultimaCompraEm,
      preferencia.precoAutorizado,
      preferencia.oculto,
    );
  }

  for (const item of agregadosPorFornecedor.values()) {
    const preferencia = preferenciasPorFornecedor.get(chaveFornecedor(item.produtoId, item.fornecedorId));
    insertPorFornecedor.run(
      clienteId,
      item.produtoId,
      item.fornecedorId,
      item.ultimoPreco,
      item.ultimaQuantidade,
      item.ultimaUnidade,
      item.vendas.size,
      item.ultimaCompraEm,
      preferencia?.precoAutorizado ?? null,
      preferencia?.oculto ?? 0,
    );
  }

  // Autorizações podem existir antes da primeira venda (por exemplo, a partir
  // de um orçamento). Elas não podem desaparecer durante a reconstrução.
  for (const preferencia of existentesPorFornecedor) {
    const chave = chaveFornecedor(preferencia.produtoId, preferencia.fornecedorId);
    if (agregadosPorFornecedor.has(chave)) continue;
    insertPorFornecedor.run(
      clienteId,
      preferencia.produtoId,
      preferencia.fornecedorId,
      preferencia.ultimoPreco,
      preferencia.ultimaQuantidade,
      preferencia.ultimaUnidade,
      preferencia.vezesComprado,
      preferencia.ultimaCompraEm,
      preferencia.precoAutorizado,
      preferencia.oculto,
    );
  }
}

// Database query helpers
export function queryAll<T>(sql: string, params: any[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function queryOne<T>(sql: string, params: any[] = []): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function execute(sql: string, params: any[] = []): Database.RunResult {
  return db.prepare(sql).run(...params);
}

// Perform a operation inside database transaction
export function runInTransaction<T>(callback: () => T): T {
  let result: T;
  const transaction = db.transaction(() => {
    result = callback();
  });
  transaction();
  return result!;
}

// Seed from mock-data.json
function seedFromMockJson() {
  const mockPath = path.join(process.cwd(), "mock-data.json");
  if (!fs.existsSync(mockPath)) {
    console.error("mock-data.json not found!");
    return;
  }

  try {
    const raw = fs.readFileSync(mockPath, "utf8");
    const mockData = JSON.parse(raw);

    currentDb.transaction(() => {
      // 1. Clientes
      if (mockData.clientes) {
        const insert = currentDb.prepare(`
          INSERT INTO clientes (id, nome, telefone, documento, endereco, observacoes, ativo)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of mockData.clientes) {
          insert.run(c.id, c.nome, c.telefone || null, c.documento || null, c.endereco || null, c.observacoes || null, c.ativo !== undefined ? c.ativo : 1);
        }
      }

      // 2. Fornecedores
      if (mockData.fornecedores) {
        const insert = currentDb.prepare(`
          INSERT INTO fornecedores (id, nome, telefone, documento, observacoes, ativo)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const f of mockData.fornecedores) {
          insert.run(f.id, f.nome, f.telefone || null, f.documento || null, f.observacoes || null, f.ativo !== undefined ? f.ativo : 1);
        }
      }

      // 3. Produtos
      if (mockData.produtos) {
        const insert = currentDb.prepare(`
          INSERT INTO produtos (id, nome, codigo, unidade, precoVendaPadrao, custoPadrao, ativo)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of mockData.produtos) {
          insert.run(p.id, p.nome, p.codigo || null, p.unidade, p.precoVendaPadrao, p.custoPadrao, p.ativo !== undefined ? p.ativo : 1);
        }
      }

      // 4. Compras
      if (mockData.compras) {
        const insert = currentDb.prepare(`
          INSERT INTO compras (id, fornecedorId, data, subtotal, desconto, total, observacao)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const cp of mockData.compras) {
          insert.run(cp.id, cp.fornecedorId, cp.data, cp.subtotal, cp.desconto, cp.total, cp.observacao || null);
        }
      }

      // 5. Itens Compra
      if (mockData.itens_compra) {
        const insert = currentDb.prepare(`
          INSERT INTO itens_compra (id, compraId, produtoId, quantidade, unidade, custoUnitario, total)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const ic of mockData.itens_compra) {
          insert.run(ic.id, ic.compraId, ic.produtoId, ic.quantidade, ic.unidade, ic.custoUnitario, ic.total);
        }
      }

      // 6. Vendas
      if (mockData.vendas) {
        const insert = currentDb.prepare(`
          INSERT INTO vendas (id, numeroSequencial, clienteId, data, subtotal, desconto, totalLiquido, valorPago, saldoRestante, status, vencimento, observacoes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const v of mockData.vendas) {
          insert.run(v.id, v.numeroSequencial, v.clienteId, v.data, v.subtotal, v.desconto, v.totalLiquido, v.valorPago, v.saldoRestante, v.status, v.vencimento || null, v.observacoes || null);
        }
      }

      // 7. Itens Venda
      if (mockData.itens_venda) {
        const insert = currentDb.prepare(`
          INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const iv of mockData.itens_venda) {
          insert.run(iv.id, iv.vendaId, iv.produtoId, iv.descricao, iv.quantidade, iv.unidade, iv.precoUnitario, iv.custoUnitario, iv.desconto, iv.total, iv.custoTotal, iv.lucroBruto);
        }
      }

      // 8. Pagamentos
      if (mockData.pagamentos) {
        const insert = currentDb.prepare(`
          INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of mockData.pagamentos) {
          insert.run(p.id, p.clienteId, p.vendaId || null, p.data, p.valor, p.formaPagamento, p.observacao || null);
        }
      }

      // 9. Configurações padrão
      currentDb.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)").run("retencao_backups_dias", "30");
      currentDb.prepare("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)").run("nome_loja", "Central de Tecidos (MOCK)");
    })();

    console.log("Mock data successfully seeded from mock-data.json!");
  } catch (e) {
    console.error("Failed to seed from mock-data.json:", e);
  }
}

// Switch between live database and mock database
export function setMockMode(enabled: boolean) {
  // Write configuration file
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ mockEnabled: enabled }, null, 2));

  // Close active connection
  try {
    currentDb.close();
  } catch (err) {
    console.error("Error closing old database connection:", err);
  }

  // Open the new SQLite file
  currentDbFile = enabled
    ? MOCK_DB_FILE
    : LIVE_DB_FILE;

  console.log(`[Database] Switched active database file to: ${currentDbFile}`);
  currentDb = new Database(currentDbFile);
  currentDb.pragma("journal_mode = WAL");

  // Re-run database setup and seeding
  initDatabase();
}
