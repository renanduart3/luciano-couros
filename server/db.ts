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
        fornecedorId TEXT NOT NULL,
        data TEXT NOT NULL, -- YYYY-MM-DD
        subtotal REAL NOT NULL,
        desconto REAL NOT NULL,
        total REAL NOT NULL,
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

    // 9. Configurações
    db.prepare(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      )
    `).run();
  })();

  // Dynamic migrations for existing databases to support WhatsApp and product unit conversion fields
  try { db.prepare(`ALTER TABLE clientes ADD COLUMN isWhatsapp INTEGER DEFAULT 0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE fornecedores ADD COLUMN isWhatsapp INTEGER DEFAULT 0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE produtos ADD COLUMN unidadeCompra TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE produtos ADD COLUMN unidadeVenda TEXT`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE produtos ADD COLUMN fatorConversao REAL DEFAULT 1.0`).run(); } catch (e) {}
  try { db.prepare(`ALTER TABLE produtos ADD COLUMN venderUnidadeCompra INTEGER DEFAULT 0`).run(); } catch (e) {}

  // Seed initial demo data if database is empty
  seedDemoData();
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
