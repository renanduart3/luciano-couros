import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { initDatabase, queryAll, queryOne, execute, runInTransaction, db, isMockModeEnabled, setMockMode, BACKUP_DIR, LIVE_DB_FILE, rebuildClienteProdutosHabituais } from "./server/db.js";

// Initialize express app
const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === "production" || path.basename(process.argv[1] ?? "") === "server.cjs";
const PACKAGE_FILE = path.join(process.cwd(), "package.json");
const SYSTEM_VERSION = (() => {
  try {
    return String(JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8")).version || "0.0.0");
  } catch {
    return "0.0.0";
  }
})();
const SERVER_STARTED_AT = new Date().toISOString();

app.use(express.json());

app.get("/pwa-icon.png", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "src", "img", "logo.png"));
});

// Initialize SQLite database and tables
initDatabase();

type UsuarioAdministrador = {
  id: string;
  nome: string;
  pinHash: string | null;
  pinSalt: string | null;
};

function getUsuarioAdministrador(): UsuarioAdministrador | undefined {
  return queryOne<UsuarioAdministrador>(
    `SELECT id, nome, pinHash, pinSalt
     FROM usuarios
     WHERE perfil = 'administrador' AND ativo = 1
     ORDER BY createdAt ASC
     LIMIT 1`
  );
}

function gerarHashPin(pin: string, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: crypto.scryptSync(pin, salt, 64).toString("hex")
  };
}

function validarPinAdministrador(pin: unknown): UsuarioAdministrador | null {
  const administrador = getUsuarioAdministrador();
  if (!administrador?.pinHash || !administrador.pinSalt || typeof pin !== "string") {
    return null;
  }

  const informado = Buffer.from(gerarHashPin(pin, administrador.pinSalt).hash, "hex");
  const esperado = Buffer.from(administrador.pinHash, "hex");
  return informado.length === esperado.length && crypto.timingSafeEqual(informado, esperado)
    ? administrador
    : null;
}

function registrarAuditoria(
  usuarioId: string | null,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  detalhes: Record<string, unknown> = {}
) {
  execute(
    `INSERT INTO auditoria (id, usuarioId, acao, entidade, entidadeId, detalhes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      "aud_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
      usuarioId,
      acao,
      entidade,
      entidadeId,
      JSON.stringify(detalhes)
    ]
  );
}

function erroHttp(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

// --- BACKUP & RESTORATION UTILITIES ---
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Function to create a backup
function createBackupFile(type: "manual" | "auto" = "manual"): string {
  const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = new Date().toTimeString().split(" ")[0].replace(/:/g, "-"); // HH-MM-SS
  const filename = `${type}_${dateStr}_${timeStr}.db`;
  const backupPath = path.join(BACKUP_DIR, filename);
  
  // Close the database connection briefly to ensure consistency, or use online backup mechanism
  // better-sqlite3 offers an elegant backup() method that doesn't block!
  db.backup(backupPath)
    .then(() => {
      console.log(`Backup (${type}) created successfully at: ${backupPath}`);
    })
    .catch((err) => {
      console.error("Failed to create database backup:", err);
    });

  return filename;
}

// Daily automatic backup runner
function runAutoBackup() {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const files = fs.readdirSync(BACKUP_DIR);
    const hasTodayAuto = files.some(f => f.startsWith(`auto_${todayStr}`));
    
    if (!hasTodayAuto) {
      console.log("No automatic backup found for today. Creating one...");
      createBackupFile("auto");
    }

    // Retenção configurável
    const retentionRow = queryOne<{ valor: string }>(
      "SELECT valor FROM configuracoes WHERE chave = ?",
      ["retencao_backups_dias"]
    );
    const retentionDays = retentionRow ? parseInt(retentionRow.valor, 10) : 30;
    
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(filePath);
      const diffDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
      
      if (diffDays > retentionDays) {
        console.log(`Deleting old backup file: ${file} (older than ${retentionDays} days)`);
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.error("Error during automatic backup routine:", err);
  }
}

// Run auto backup on boot, and then every 12 hours
runAutoBackup();
setInterval(runAutoBackup, 12 * 60 * 60 * 1000);


// --- API ROUTES ---

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: SYSTEM_VERSION, startedAt: SERVER_STARTED_AT });
});

app.get("/api/system/version", (_req, res) => {
  res.json({
    version: SYSTEM_VERSION,
    startedAt: SERVER_STARTED_AT,
    environment: IS_PRODUCTION ? "production" : "development"
  });
});

// 0. MOCK DATA CONTROL
app.get("/api/mock/status", (req, res) => {
  try {
    const enabled = isMockModeEnabled();
    res.json({ mockEnabled: enabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/mock/toggle", (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Campo 'enabled' deve ser um booleano." });
    }
    setMockMode(enabled);
    res.json({ success: true, mockEnabled: enabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 1. CONFIGURAÇÕES
app.get("/api/config", (req, res) => {
  try {
    const rows = queryAll<{ chave: string; valor: string }>("SELECT * FROM configuracoes");
    const config = rows.reduce((acc, cur) => {
      acc[cur.chave] = cur.valor;
      return acc;
    }, {} as Record<string, string>);
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/config", (req, res) => {
  try {
    const updates = req.body; // { chave: valor, ... }
    db.transaction(() => {
      for (const [chave, valor] of Object.entries(updates)) {
        execute(
          "INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = ?",
          [chave, String(valor), String(valor)]
        );
      }
    })();
    res.json({ success: true, message: "Configurações salvas!" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 1.1 SEGURANÇA LOCAL
app.get("/api/seguranca/status", (_req, res) => {
  try {
    const administrador = getUsuarioAdministrador();
    res.json({
      usuarioId: administrador?.id || null,
      nome: administrador?.nome || "Administrador",
      pinConfigurado: !!administrador?.pinHash
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/seguranca/verificar-pin", (req, res) => {
  try {
    const administrador = getUsuarioAdministrador();
    if (!administrador?.pinHash) {
      return res.status(428).json({ error: "Configure primeiro o PIN administrativo em Ajustes & Backups." });
    }

    const usuario = validarPinAdministrador(req.body?.pin);
    if (!usuario) {
      return res.status(403).json({ error: "PIN administrativo inválido." });
    }

    if (req.body?.finalidade === "visualizar_analise_venda") {
      registrarAuditoria(usuario.id, "analise_venda_desbloqueada", "venda_em_edicao", null, {
        origem: req.ip || null
      });
    }

    res.json({ valido: true, usuario: { id: usuario.id, nome: usuario.nome } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/seguranca/admin-pin", (req, res) => {
  try {
    const { nome, pinAtual, novoPin } = req.body || {};
    const administrador = getUsuarioAdministrador();
    if (!administrador) {
      return res.status(500).json({ error: "Usuário administrador não foi inicializado." });
    }
    const origemLocal = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip || "");
    if (!administrador.pinHash && !origemLocal) {
      return res.status(403).json({ error: "A configuração inicial do PIN deve ser feita diretamente no computador servidor." });
    }
    if (typeof novoPin !== "string" || !/^\d{4,8}$/.test(novoPin)) {
      return res.status(400).json({ error: "O novo PIN deve possuir de 4 a 8 números." });
    }
    if (administrador.pinHash && !validarPinAdministrador(pinAtual)) {
      return res.status(403).json({ error: "PIN atual inválido." });
    }

    const pinProtegido = gerarHashPin(novoPin);
    const nomeNormalizado = typeof nome === "string" && nome.trim() ? nome.trim() : administrador.nome;
    runInTransaction(() => {
      execute(
        `UPDATE usuarios
         SET nome = ?, pinHash = ?, pinSalt = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nomeNormalizado, pinProtegido.hash, pinProtegido.salt, administrador.id]
      );
      registrarAuditoria(
        administrador.id,
        administrador.pinHash ? "pin_administrativo_alterado" : "pin_administrativo_configurado",
        "usuario",
        administrador.id,
        { nome: nomeNormalizado }
      );
    });

    res.json({ success: true, nome: nomeNormalizado, pinConfigurado: true });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// 2. DASHBOARD
app.get("/api/dashboard", (req, res) => {
  try {
    const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const firstDayOfMonth = todayStr.substring(0, 8) + "01";

    // Vendas de hoje (não canceladas)
    const vendasHoje = queryOne<{ count: number; total: number }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(totalLiquido), 0) as total FROM vendas WHERE data = ? AND deletedAt IS NULL",
      [todayStr]
    ) || { count: 0, total: 0 };

    // Valor recebido hoje (pagamentos não cancelados realizados hoje)
    const recebidoHoje = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(valor), 0) as total FROM pagamentos WHERE data = ? AND deletedAt IS NULL",
      [todayStr]
    ) || { total: 0 };

    // Valor pendente (saldo restante total de vendas ativas)
    const valorPendente = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(saldoRestante), 0) as total FROM vendas WHERE status = 'pendente' AND deletedAt IS NULL"
    ) || { total: 0 };

    const valorVencido = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(saldoRestante), 0) as total FROM vendas WHERE status = 'pendente' AND vencimento < ? AND deletedAt IS NULL",
      [todayStr]
    ) || { total: 0 };

    // Vendas no mês atual (não canceladas)
    const vendasMes = queryOne<{ count: number; total: number }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(totalLiquido), 0) as total FROM vendas WHERE data >= ? AND data <= ? AND deletedAt IS NULL",
      [firstDayOfMonth, todayStr]
    ) || { count: 0, total: 0 };

    // Lucro bruto no mês atual (lucro total de itens de vendas não canceladas no mês)
    const lucroMes = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(
         iv.total
         - CASE WHEN v.subtotal > 0 THEN v.desconto * (iv.total / v.subtotal) ELSE 0 END
         - iv.custoTotal
       ), 0) as total 
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       WHERE v.data >= ? AND v.data <= ? AND v.deletedAt IS NULL`,
      [firstDayOfMonth, todayStr]
    ) || { total: 0 };

    // Metros vendidos no mês (itens com unidade = 'metro' em vendas ativas do mês)
    const metrosMes = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(iv.quantidade), 0) as total
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       WHERE v.data >= ? AND v.data <= ? AND iv.unidade = 'metro' AND v.deletedAt IS NULL`,
      [firstDayOfMonth, todayStr]
    ) || { total: 0 };

    // Clientes com pagamentos vencidos (vendas com saldoRestante > 0 e vencimento < hoje, ativas)
    const vencidos = queryAll<any>(
      `SELECT v.id, v.numeroSequencial, v.data, v.totalLiquido, v.saldoRestante, v.vencimento, c.nome as clienteNome, c.telefone as clienteTelefone
       FROM vendas v
       JOIN clientes c ON v.clienteId = c.id
       WHERE v.status = 'pendente' AND v.vencimento < ? AND v.deletedAt IS NULL
       ORDER BY v.vencimento ASC`,
      [todayStr]
    );

    // Últimas 5 vendas
    const ultimasVendas = queryAll<any>(
      `SELECT v.*, c.nome as clienteNome
       FROM vendas v
       JOIN clientes c ON v.clienteId = c.id
       WHERE v.deletedAt IS NULL
       ORDER BY v.numeroSequencial DESC
       LIMIT 5`
    );

    res.json({
      vendas_hoje: { count: vendasHoje.count, total: vendasHoje.total },
      recebido_hoje: recebidoHoje.total,
      valor_pendente: valorPendente.total,
      valor_vencido: valorVencido.total,
      vendas_mes: { count: vendasMes.count, total: vendasMes.total },
      ticket_medio_mes: vendasMes.count > 0 ? vendasMes.total / vendasMes.count : 0,
      lucro_mes: lucroMes.total,
      metros_mes: metrosMes.total,
      vencidos,
      ultimas_vendas: ultimasVendas
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. CLIENTES
app.get("/api/clientes", (req, res) => {
  try {
    const rows = queryAll("SELECT * FROM clientes WHERE deletedAt IS NULL ORDER BY nome ASC");
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/clientes", (req, res) => {
  try {
    const { nome, telefone, documento, endereco, observacoes, ativo, isWhatsapp } = req.body;
    if (!nome) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }
    const id = "cli_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    execute(
      `INSERT INTO clientes (id, nome, telefone, documento, endereco, observacoes, ativo, isWhatsapp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nome, telefone || null, documento || null, endereco || null, observacoes || null, ativo !== undefined ? (ativo ? 1 : 0) : 1, isWhatsapp !== undefined ? (isWhatsapp ? 1 : 0) : 0]
    );
    const client = queryOne("SELECT * FROM clientes WHERE id = ?", [id]);
    res.status(210).json(client);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/clientes/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { nome, telefone, documento, endereco, observacoes, ativo, isWhatsapp } = req.body;
    if (!nome) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }
    execute(
      `UPDATE clientes 
       SET nome = ?, telefone = ?, documento = ?, endereco = ?, observacoes = ?, ativo = ?, isWhatsapp = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND deletedAt IS NULL`,
      [nome, telefone || null, documento || null, endereco || null, observacoes || null, ativo ? 1 : 0, isWhatsapp !== undefined ? (isWhatsapp ? 1 : 0) : 0, id]
    );
    const updated = queryOne("SELECT * FROM clientes WHERE id = ?", [id]);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/clientes/:id", (req, res) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();
    execute("UPDATE clientes SET deletedAt = ?, ativo = 0 WHERE id = ?", [nowStr, id]);
    res.json({ success: true, message: "Cliente excluído logicamente." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET CLIENTS HISTORY & STATS
app.get("/api/clientes/:id/historico", (req, res) => {
  try {
    const { id } = req.params;
    const cliente = queryOne("SELECT * FROM clientes WHERE id = ? AND deletedAt IS NULL", [id]);
    if (!cliente) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    // 1. Total comprado (soma do totalLiquido das vendas ativas)
    const totalCompradoRow = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(totalLiquido), 0) as total FROM vendas WHERE clienteId = ? AND deletedAt IS NULL",
      [id]
    );

    // 2. Total pago (soma do valor dos pagamentos ativos)
    const totalPagoRow = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(valor), 0) as total FROM pagamentos WHERE clienteId = ? AND deletedAt IS NULL",
      [id]
    );

    // 3. Saldo pendente (soma do saldoRestante de vendas ativas)
    const saldoPendenteRow = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(saldoRestante), 0) as total FROM vendas WHERE clienteId = ? AND status = 'pendente' AND deletedAt IS NULL",
      [id]
    );

    // 4. Lucro bruto gerado (lucro bruto das vendas ativas)
    const lucroBrutoRow = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(
         iv.total
         - CASE WHEN v.subtotal > 0 THEN v.desconto * (iv.total / v.subtotal) ELSE 0 END
         - iv.custoTotal
       ), 0) as total
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       WHERE v.clienteId = ? AND v.deletedAt IS NULL`,
      [id]
    );

    // 5. Produtos mais comprados (ranking)
    const produtosMaisComprados = queryAll<any>(
      `SELECT iv.produtoId, iv.descricao, COALESCE(SUM(iv.total), 0) as totalValor
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       WHERE v.clienteId = ? AND v.deletedAt IS NULL
       GROUP BY iv.produtoId, iv.descricao
       ORDER BY totalValor DESC
       LIMIT 5`,
      [id]
    );

    // 6. Histórico de vendas
    const vendas = queryAll<any>(
      "SELECT * FROM vendas WHERE clienteId = ? AND deletedAt IS NULL ORDER BY numeroSequencial DESC",
      [id]
    );

    // For each sale, get its items
    for (const v of vendas) {
      v.items = queryAll("SELECT * FROM itens_venda WHERE vendaId = ?", [v.id]);
    }

    // 7. Histórico de pagamentos
    const pagamentos = queryAll<any>(
      `SELECT p.*, v.numeroSequencial as vendaSequencial
       FROM pagamentos p
       LEFT JOIN vendas v ON p.vendaId = v.id
       WHERE p.clienteId = ? AND p.deletedAt IS NULL
       ORDER BY p.data DESC, p.createdAt DESC`,
      [id]
    );

    res.json({
      cliente,
      estatisticas: {
        totalComprado: totalCompradoRow?.total || 0,
        totalPago: totalPagoRow?.total || 0,
        saldoPendente: saldoPendenteRow?.total || 0,
        lucroBruto: lucroBrutoRow?.total || 0
      },
      produtosMaisComprados,
      vendas,
      pagamentos
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/clientes/:id/produtos-habituais", (req, res) => {
  try {
    const cliente = queryOne("SELECT id FROM clientes WHERE id = ? AND deletedAt IS NULL", [req.params.id]);
    if (!cliente) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    const produtos = queryAll<any>(
      `SELECT
         cph.clienteId,
         cph.produtoId,
         cph.ultimoPreco,
         cph.ultimaQuantidade,
         cph.ultimaUnidade,
         cph.vezesComprado,
         cph.ultimaCompraEm,
         cph.precoAutorizado,
         p.nome,
         p.codigo,
         p.unidade,
         p.precoVendaPadrao,
         p.custoPadrao
       FROM cliente_produtos_habituais cph
       JOIN produtos p ON p.id = cph.produtoId
       WHERE cph.clienteId = ?
         AND cph.oculto = 0
         AND p.ativo = 1
         AND p.deletedAt IS NULL
       ORDER BY cph.ultimaCompraEm DESC, cph.vezesComprado DESC, p.nome ASC`,
      [req.params.id]
    );

    res.json(produtos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 4. FORNECEDORES
app.get("/api/fornecedores", (req, res) => {
  try {
    const rows = queryAll("SELECT * FROM fornecedores WHERE deletedAt IS NULL ORDER BY nome ASC");
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/fornecedores", (req, res) => {
  try {
    const { nome, telefone, documento, observacoes, ativo, isWhatsapp } = req.body;
    if (!nome) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }
    const id = "for_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    execute(
      `INSERT INTO fornecedores (id, nome, telefone, documento, observacoes, ativo, isWhatsapp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, nome, telefone || null, documento || null, observacoes || null, ativo !== undefined ? (ativo ? 1 : 0) : 1, isWhatsapp !== undefined ? (isWhatsapp ? 1 : 0) : 0]
    );
    const supplier = queryOne("SELECT * FROM fornecedores WHERE id = ?", [id]);
    res.status(210).json(supplier);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/fornecedores/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { nome, telefone, documento, observacoes, ativo, isWhatsapp } = req.body;
    if (!nome) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }
    execute(
      `UPDATE fornecedores
       SET nome = ?, telefone = ?, documento = ?, observacoes = ?, ativo = ?, isWhatsapp = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND deletedAt IS NULL`,
      [nome, telefone || null, documento || null, observacoes || null, ativo ? 1 : 0, isWhatsapp !== undefined ? (isWhatsapp ? 1 : 0) : 0, id]
    );
    const updated = queryOne("SELECT * FROM fornecedores WHERE id = ?", [id]);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/fornecedores/:id", (req, res) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();
    execute("UPDATE fornecedores SET deletedAt = ?, ativo = 0 WHERE id = ?", [nowStr, id]);
    res.json({ success: true, message: "Fornecedor excluído logicamente." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/fornecedores/:id/produtos", (req, res) => {
  try {
    const fornecedor = queryOne("SELECT id FROM fornecedores WHERE id = ? AND deletedAt IS NULL", [req.params.id]);
    if (!fornecedor) return res.status(404).json({ error: "Fornecedor não encontrado." });

    const produtos = queryAll(
      `SELECT fp.fornecedorId, fp.produtoId, fp.codigoFornecedor, fp.observacao, fp.ativo,
              p.nome as produtoNome, p.codigo as produtoCodigo, p.unidade, p.precoVendaPadrao,
              (SELECT ic.custoUnitario
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL
               ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1) as ultimoCusto,
              (SELECT c.data
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL
               ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1) as ultimaCompraEm,
              (SELECT COUNT(DISTINCT c.id)
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL) as comprasRealizadas
       FROM fornecedor_produtos fp
       JOIN produtos p ON p.id = fp.produtoId
       WHERE fp.fornecedorId = ? AND fp.ativo = 1 AND p.deletedAt IS NULL
       ORDER BY p.nome ASC`,
      [req.params.id]
    );
    res.json(produtos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/fornecedores/:id/produtos", (req, res) => {
  try {
    const fornecedor = queryOne("SELECT id FROM fornecedores WHERE id = ? AND deletedAt IS NULL", [req.params.id]);
    const produto = queryOne("SELECT id FROM produtos WHERE id = ? AND deletedAt IS NULL", [req.body?.produtoId]);
    if (!fornecedor || !produto) return res.status(404).json({ error: "Fornecedor ou produto não encontrado." });

    execute(
      `INSERT INTO fornecedor_produtos (fornecedorId, produtoId, codigoFornecedor, observacao, ativo)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(fornecedorId, produtoId) DO UPDATE SET
         codigoFornecedor = excluded.codigoFornecedor,
         observacao = excluded.observacao,
         ativo = 1,
         updatedAt = CURRENT_TIMESTAMP`,
      [req.params.id, req.body.produtoId, req.body.codigoFornecedor || null, req.body.observacao || null]
    );
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 5. PRODUTOS
app.get("/api/produtos", (req, res) => {
  try {
    const rows = queryAll(`
      SELECT
        p.*,
        (
          SELECT c.data
          FROM itens_compra ic
          JOIN compras c ON c.id = ic.compraId
          WHERE ic.produtoId = p.id AND ic.unidade = p.unidade AND c.deletedAt IS NULL
          ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC
          LIMIT 1
        ) AS ultimaCompraEm,
        (
          SELECT f.nome
          FROM itens_compra ic
          JOIN compras c ON c.id = ic.compraId
          JOIN fornecedores f ON f.id = c.fornecedorId
          WHERE ic.produtoId = p.id AND ic.unidade = p.unidade AND c.deletedAt IS NULL
          ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC
          LIMIT 1
        ) AS ultimoFornecedorNome
        ,(SELECT COUNT(*) FROM fornecedor_produtos fp WHERE fp.produtoId = p.id AND fp.ativo = 1) AS quantidadeFornecedores
      FROM produtos p
      WHERE p.deletedAt IS NULL
      ORDER BY p.nome ASC
    `);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/produtos/:id/fornecedores", (req, res) => {
  try {
    const produto = queryOne("SELECT id FROM produtos WHERE id = ? AND deletedAt IS NULL", [req.params.id]);
    if (!produto) return res.status(404).json({ error: "Produto não encontrado." });

    const fornecedores = queryAll(
      `SELECT fp.fornecedorId, fp.produtoId, fp.codigoFornecedor, fp.observacao, fp.ativo,
              f.nome as fornecedorNome, f.telefone as fornecedorTelefone,
              (SELECT ic.custoUnitario
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL
               ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1) as ultimoCusto,
              (SELECT c.data
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL
               ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1) as ultimaCompraEm,
              (SELECT COUNT(DISTINCT c.id)
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL) as comprasRealizadas
       FROM fornecedor_produtos fp
       JOIN fornecedores f ON f.id = fp.fornecedorId
       WHERE fp.produtoId = ? AND fp.ativo = 1 AND f.deletedAt IS NULL
       ORDER BY ultimaCompraEm DESC, f.nome ASC`,
      [req.params.id]
    );
    res.json(fornecedores);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/produtos", (req, res) => {
  try {
    const { nome, codigo, unidade, precoVendaPadrao, ativo } = req.body;
    if (!nome || !unidade) {
      return res.status(400).json({ error: "Nome e unidade são obrigatórios." });
    }
    if (!Number.isFinite(Number(precoVendaPadrao)) || Number(precoVendaPadrao) < 0) {
      return res.status(400).json({ error: "O preço de venda não pode ser negativo." });
    }
    const id = "prod_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    execute(
      `INSERT INTO produtos (id, nome, codigo, unidade, precoVendaPadrao, custoPadrao, unidadeCompra, unidadeVenda, fatorConversao, venderUnidadeCompra, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, 
        nome, 
        codigo || null, 
        unidade,
        Number(precoVendaPadrao), 
        0,
        unidade,
        unidade,
        1,
        0,
        ativo !== undefined ? (ativo ? 1 : 0) : 1
      ]
    );
    const product = queryOne("SELECT * FROM produtos WHERE id = ?", [id]);
    res.status(210).json(product);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/produtos/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { nome, codigo, unidade, precoVendaPadrao, ativo } = req.body;
    if (!nome || !unidade) {
      return res.status(400).json({ error: "Nome e unidade são obrigatórios." });
    }
    if (!Number.isFinite(Number(precoVendaPadrao)) || Number(precoVendaPadrao) < 0) {
      return res.status(400).json({ error: "O preço de venda não pode ser negativo." });
    }
    execute(
      `UPDATE produtos
       SET nome = ?, codigo = ?, unidade = ?, precoVendaPadrao = ?, unidadeCompra = ?, unidadeVenda = ?, fatorConversao = 1, venderUnidadeCompra = 0, ativo = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND deletedAt IS NULL`,
      [
        nome, 
        codigo || null, 
        unidade,
        Number(precoVendaPadrao), 
        unidade,
        unidade,
        ativo ? 1 : 0, 
        id
      ]
    );
    const updated = queryOne("SELECT * FROM produtos WHERE id = ?", [id]);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/produtos/:id", (req, res) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();
    execute("UPDATE produtos SET deletedAt = ?, ativo = 0 WHERE id = ?", [nowStr, id]);
    res.json({ success: true, message: "Produto excluído logicamente." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 6. VENDAS
app.get("/api/vendas", (req, res) => {
  try {
    const rows = queryAll<any>(
      `SELECT v.*,
              c.nome as clienteNome,
              c.telefone as clienteTelefone,
              c.endereco as clienteEndereco,
              c.documento as clienteDocumento,
              COALESCE(
                (SELECT p.formaPagamento FROM pagamentos p WHERE p.vendaId = v.id AND p.deletedAt IS NULL ORDER BY p.createdAt ASC LIMIT 1),
                CASE WHEN v.saldoRestante > 0 THEN 'vale' ELSE NULL END
              ) as formaPagamento
       FROM vendas v
       JOIN clientes c ON v.clienteId = c.id
       WHERE v.deletedAt IS NULL
       ORDER BY v.numeroSequencial DESC`
    );
    
    // Fetch items for each sale
    for (const v of rows) {
      v.items = queryAll(
        `SELECT iv.*, p.codigo as referencia
         FROM itens_venda iv
         LEFT JOIN produtos p ON p.id = iv.produtoId
         WHERE iv.vendaId = ?`,
        [v.id]
      );
      v.instrumentoRecebimento = queryOne(
        `SELECT tipo, emitente, numeroDocumento, valor, vencimento, status, observacao
         FROM instrumentos_recebimento
         WHERE vendaId = ? AND deletedAt IS NULL
         ORDER BY createdAt DESC LIMIT 1`,
        [v.id]
      ) || null;
    }
    
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/vendas/proximo-numero", (req, res) => {
  try {
    const result = queryOne<{ maxSeq: number }>(
      "SELECT COALESCE(MAX(numeroSequencial), 0) as maxSeq FROM vendas"
    );
    const nextSeq = (result?.maxSeq || 0) + 1;
    res.json({ proximoNumero: nextSeq });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/vendas", (req, res) => {
  try {
    const {
      clienteId,
      data,
      descontoGeral, // General discount applied to the subtotal
      items,         // Array of { produtoId, descricao, quantidade, unidade, precoUnitario, descontoItem }
      valorPago,     // Amount paid immediately
      formaPagamento,// e.g. "pix", "dinheiro"
      vencimento,    // YYYY-MM-DD
      observacoes,
      autorizacaoPreco,
      instrumentoRecebimento
    } = req.body;

    if (!clienteId || !data || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Dados da venda incompletos ou vazios." });
    }

    const nextSeqRow = queryOne<{ maxSeq: number }>("SELECT COALESCE(MAX(numeroSequencial), 0) as maxSeq FROM vendas");
    const nextSeq = (nextSeqRow?.maxSeq || 0) + 1;

    const vendaId = "vend_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

    // Atomically execute inside transaction
    const resultVenda = runInTransaction(() => {
      let subtotal = 0;
      let custoTotalAcumulado = 0;
      let lucroBrutoAcumulado = 0;

      // Prepare item insertions
      const resolvedItems = items.map((it: any) => {
        const prod = queryOne<any>("SELECT * FROM produtos WHERE id = ?", [it.produtoId]);
        if (!prod) {
          throw erroHttp(`Produto não encontrado para o ID: ${it.produtoId}`, 404);
        }

        const qty = Number(it.quantidade);
        const precoUnit = Number(it.precoUnitario);
        const descItem = Number(it.desconto || 0);
        const unidadeItem = it.unidade || prod.unidade;

        if (unidadeItem !== prod.unidade) {
          throw new Error(`A venda de ${prod.nome} deve ser registrada em ${prod.unidade}.`);
        }

        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(precoUnit) || precoUnit < 0 || !Number.isFinite(descItem) || descItem < 0) {
          throw new Error(`Quantidade, preço ou desconto inválido para o produto ${prod.nome}.`);
        }

        const custoUnit = Number(prod.custoPadrao || 0);
        const precoPadraoUnidade = Number(prod.precoVendaPadrao || 0);
        const preferenciaCliente = queryOne<{ precoAutorizado: number | null }>(
          `SELECT precoAutorizado
           FROM cliente_produtos_habituais
           WHERE clienteId = ? AND produtoId = ?`,
          [clienteId, it.produtoId]
        );
        const precoMinimoSemPin = preferenciaCliente?.precoAutorizado ?? precoPadraoUnidade;

        // Calculate totals
        const totalItem = (qty * precoUnit) - descItem;
        const totalCustoItem = qty * custoUnit;
        const lucroItem = totalItem - totalCustoItem;

        subtotal += (qty * precoUnit);

        return {
          id: "itv_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
          produtoId: it.produtoId,
          descricao: it.descricao || prod.nome,
          quantidade: qty,
          unidade: unidadeItem,
          precoUnitario: precoUnit,
          custoUnitario: custoUnit,
          desconto: descItem,
          total: totalItem,
          custoTotal: totalCustoItem,
          lucroBruto: lucroItem,
          precoMinimoSemPin
        };
      });

      // Calcule subtotal, desconto geral e total líquido automaticamente
      const descGeral = Number(descontoGeral || 0);
      const totalLiquido = subtotal - descGeral;
      const vPago = Number(valorPago || 0);
      const saldoRestante = totalLiquido - vPago;

      const formasComInstrumento = new Set([
        "cheque_emitente",
        "cheque_terceiro",
        "duplicata_emitente",
        "duplicata_terceiro"
      ]);
      const exigeInstrumento = formasComInstrumento.has(String(formaPagamento || ""));

      if (exigeInstrumento) {
        const emitente = String(instrumentoRecebimento?.emitente || "").trim();
        const numeroDocumento = String(instrumentoRecebimento?.numeroDocumento || "").trim();
        const vencimentoInstrumento = String(instrumentoRecebimento?.vencimento || "").trim();
        if (!emitente || !numeroDocumento || !/^\d{4}-\d{2}-\d{2}$/.test(vencimentoInstrumento)) {
          throw erroHttp("Informe emitente, número e vencimento do cheque ou duplicata.", 400);
        }
        if (vPago <= 0) {
          throw erroHttp("Cheque ou duplicata exige um valor recebido maior que zero.", 400);
        }
      }

      if (totalLiquido < 0) {
        throw new Error("O desconto geral não pode ser maior que o subtotal.");
      }

      // O desconto geral também reduz o preço real dos produtos e não pode ser
      // usado para contornar a autorização administrativa.
      const fatorPrecoEfetivo = subtotal > 0 ? totalLiquido / subtotal : 1;
      const itensQueExigemAutorizacao = resolvedItems
        .map((item) => ({ ...item, precoEfetivo: item.precoUnitario * fatorPrecoEfetivo }))
        .filter((item) => item.precoEfetivo < item.precoMinimoSemPin - 0.005);
      let administradorAutorizador: UsuarioAdministrador | null = null;

      if (itensQueExigemAutorizacao.length > 0) {
        const administrador = getUsuarioAdministrador();
        if (!administrador?.pinHash) {
          throw erroHttp("Configure o PIN administrativo em Ajustes & Backups antes de autorizar preços menores.", 428);
        }

        administradorAutorizador = validarPinAdministrador(autorizacaoPreco?.pin);
        if (!administradorAutorizador) {
          throw erroHttp("PIN administrativo inválido. A venda não foi registrada.", 403);
        }
      }

      const status = saldoRestante <= 0 ? "paga" : "pendente";

      // Insert Venda
      execute(
        `INSERT INTO vendas (id, numeroSequencial, clienteId, data, subtotal, desconto, totalLiquido, valorPago, saldoRestante, status, vencimento, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vendaId, nextSeq, clienteId, data, subtotal, descGeral, totalLiquido, vPago, saldoRestante, status, vencimento || null, observacoes || null]
      );

      // Insert Itens Venda
      for (const it of resolvedItems) {
        execute(
          `INSERT INTO itens_venda (id, vendaId, produtoId, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [it.id, vendaId, it.produtoId, it.descricao, it.quantidade, it.unidade, it.precoUnitario, it.custoUnitario, it.desconto, it.total, it.custoTotal, it.lucroBruto]
        );
      }

      // Se houver pagamento inicial, registrar
      if (vPago > 0) {
        const pagId = "pag_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
        execute(
          `INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [pagId, clienteId, vendaId, data, vPago, formaPagamento || "pix", "Pagamento inicial da venda #" + nextSeq]
        );
      }


      if (exigeInstrumento) {
        execute(
          `INSERT INTO instrumentos_recebimento
             (id, vendaId, clienteId, tipo, emitente, numeroDocumento, valor, vencimento, status, observacao)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'em_carteira', ?)`,
          [
            "ins_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
            vendaId,
            clienteId,
            formaPagamento,
            String(instrumentoRecebimento.emitente).trim(),
            String(instrumentoRecebimento.numeroDocumento).trim(),
            vPago,
            instrumentoRecebimento.vencimento,
            instrumentoRecebimento.observacao || null
          ]
        );
      }

      rebuildClienteProdutosHabituais(clienteId);

      if (itensQueExigemAutorizacao.length > 0 && administradorAutorizador) {
        const salvarParaCliente = autorizacaoPreco?.salvarParaCliente === true;
        if (salvarParaCliente) {
          for (const item of itensQueExigemAutorizacao) {
            execute(
              `UPDATE cliente_produtos_habituais
               SET precoAutorizado = ?, updatedAt = CURRENT_TIMESTAMP
               WHERE clienteId = ? AND produtoId = ?`,
              [item.precoEfetivo, clienteId, item.produtoId]
            );
          }
        }

        registrarAuditoria(
          administradorAutorizador.id,
          salvarParaCliente ? "preco_cliente_autorizado" : "preco_venda_autorizado",
          "venda",
          vendaId,
          {
            clienteId,
            numeroSequencial: nextSeq,
            salvarParaCliente,
            itens: itensQueExigemAutorizacao.map((item) => ({
              produtoId: item.produtoId,
              precoAnteriorPermitido: item.precoMinimoSemPin,
              precoAutorizado: item.precoEfetivo
            }))
          }
        );
      }

      return { id: vendaId, numeroSequencial: nextSeq };
    });

    const fullVenda = queryOne("SELECT * FROM vendas WHERE id = ?", [resultVenda.id]);
    res.status(210).json(fullVenda);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/vendas/:id/cancelar", (req, res) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();
    
    runInTransaction(() => {
      const venda = queryOne<any>("SELECT clienteId FROM vendas WHERE id = ? AND deletedAt IS NULL", [id]);
      if (!venda) {
        throw new Error("Venda não encontrada ou já cancelada.");
      }
      const alocacaoAtiva = queryOne<{ quantidade: number }>(
        `SELECT COUNT(*) AS quantidade
         FROM recebimento_alocacoes
         WHERE vendaId = ? AND deletedAt IS NULL`,
        [id]
      );
      if (Number(alocacaoAtiva?.quantidade || 0) > 0) {
        throw erroHttp("Esta venda possui recebimentos na Carteira do Cliente. Estorne primeiro esses recebimentos para cancelar a venda.", 409);
      }

      // Marcar venda como cancelada e excluída logicamente
      execute(
        "UPDATE vendas SET deletedAt = ?, status = 'cancelada', updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
        [nowStr, id]
      );
      
      // Cancelar todos os pagamentos vinculados a essa venda
      execute(
        "UPDATE pagamentos SET deletedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE vendaId = ?",
        [nowStr, id]
      );
      execute(
        "UPDATE instrumentos_recebimento SET deletedAt = ?, status = 'cancelado', updatedAt = CURRENT_TIMESTAMP WHERE vendaId = ?",
        [nowStr, id]
      );

      rebuildClienteProdutosHabituais(venda.clienteId);
    });

    res.json({ success: true, message: "Venda e pagamentos vinculados cancelados com sucesso." });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});


function recalcularUltimoCustoProduto(produtoId: string) {
  const ultimaCompra = queryOne<{ custoUnitario: number }>(
    `SELECT ic.custoUnitario
     FROM itens_compra ic
     JOIN compras c ON c.id = ic.compraId
     JOIN produtos p ON p.id = ic.produtoId
     WHERE ic.produtoId = ? AND ic.unidade = p.unidade AND c.deletedAt IS NULL
     ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC
     LIMIT 1`,
    [produtoId]
  );

  execute(
    "UPDATE produtos SET custoPadrao = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    [ultimaCompra ? Number(ultimaCompra.custoUnitario) : 0, produtoId]
  );
}

// 7. COMPRAS
app.get("/api/compras", (req, res) => {
  try {
    const rows = queryAll<any>(
      `SELECT comp.*, f.nome as fornecedorNome, f.telefone as fornecedorTelefone
       FROM compras comp
       JOIN fornecedores f ON comp.fornecedorId = f.id
       WHERE comp.deletedAt IS NULL
       ORDER BY comp.data DESC, comp.createdAt DESC`
    );

    for (const c of rows) {
      c.items = queryAll("SELECT * FROM itens_compra WHERE compraId = ?", [c.id]);
    }

    res.json(rows);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/compras", (req, res) => {
  try {
    const { fornecedorId, data, desconto, items, observacao } = req.body;

    if (!fornecedorId || !data || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Dados da compra incompletos." });
    }

    const compraId = "comp_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

    runInTransaction(() => {
      let subtotal = 0;

      const resolvedItems = items.map((it: any) => {
        const prod = queryOne<any>("SELECT * FROM produtos WHERE id = ?", [it.produtoId]);
        if (!prod) {
          throw erroHttp(`Produto não encontrado para o ID: ${it.produtoId}`, 404);
        }

        const qty = Number(it.quantidade);
        const custoUnit = Number(it.custoUnitario);
        const unidadeInformada = it.unidade || prod.unidade;

        if (unidadeInformada !== prod.unidade) {
          throw erroHttp(`A compra de ${prod.nome} deve ser registrada em ${prod.unidade}.`, 400);
        }

        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(custoUnit) || custoUnit < 0) {
          throw erroHttp(`Quantidade ou custo inválido para o produto ${prod.nome}.`, 400);
        }

        const itemTotal = qty * custoUnit;

        subtotal += itemTotal;

        return {
          id: "itc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
          produtoId: it.produtoId,
          quantidade: qty,
          unidade: prod.unidade,
          custoUnitario: custoUnit,
          total: itemTotal
        };
      });

      const desc = Number(desconto || 0);
      const total = subtotal - desc;

      if (total < 0) {
        throw erroHttp("Desconto não pode ser maior que o subtotal da compra.", 400);
      }

      // Insert Compra
      execute(
        `INSERT INTO compras (id, fornecedorId, data, subtotal, desconto, total, observacao)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [compraId, fornecedorId, data, subtotal, desc, total, observacao || null]
      );

      // Insert Itens Compra
      for (const it of resolvedItems) {
        execute(
          `INSERT INTO itens_compra (id, compraId, produtoId, quantidade, unidade, custoUnitario, total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [it.id, compraId, it.produtoId, it.quantidade, it.unidade, it.custoUnitario, it.total]
        );
      }

      for (const produtoId of new Set(resolvedItems.map((item) => item.produtoId))) {
        execute(
          `INSERT INTO fornecedor_produtos (fornecedorId, produtoId, ativo)
           VALUES (?, ?, 1)
           ON CONFLICT(fornecedorId, produtoId) DO UPDATE SET ativo = 1, updatedAt = CURRENT_TIMESTAMP`,
          [fornecedorId, produtoId]
        );
        recalcularUltimoCustoProduto(produtoId);
      }
    });

    const fullCompra = queryOne("SELECT * FROM compras WHERE id = ?", [compraId]);
    res.status(210).json(fullCompra);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/compras/:id/cancelar", (req, res) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();
    runInTransaction(() => {
      const compra = queryOne<{ id: string }>("SELECT id FROM compras WHERE id = ? AND deletedAt IS NULL", [id]);
      if (!compra) {
        throw erroHttp("Compra não encontrada ou já cancelada.", 404);
      }
      const produtosAfetados = queryAll<{ produtoId: string }>(
        "SELECT DISTINCT produtoId FROM itens_compra WHERE compraId = ?",
        [id]
      );
      execute("UPDATE compras SET deletedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [nowStr, id]);
      for (const item of produtosAfetados) {
        recalcularUltimoCustoProduto(item.produtoId);
      }
    });
    res.json({ success: true, message: "Compra cancelada e custos restaurados pela última compra válida." });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});


// 8. CARTEIRA DO CLIENTE
app.get("/api/clientes/:id/carteira", (req, res) => {
  try {
    const { id } = req.params;
    const cliente = queryOne<any>("SELECT * FROM clientes WHERE id = ? AND deletedAt IS NULL", [id]);
    if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });

    const dividas = queryAll<any>(
      `SELECT id, numeroSequencial, data, vencimento, totalLiquido, valorPago, saldoRestante, status
       FROM vendas
       WHERE clienteId = ? AND status = 'pendente' AND saldoRestante > 0.005 AND deletedAt IS NULL
       ORDER BY COALESCE(vencimento, data) ASC, numeroSequencial ASC`,
      [id]
    );
    const bonusRow = queryOne<{ saldo: number }>(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0) AS saldo
       FROM cliente_bonus_movimentos WHERE clienteId = ? AND deletedAt IS NULL`,
      [id]
    );
    const recebimentos = queryAll<any>(
      `SELECT r.*
       FROM recebimentos_cliente r
       WHERE r.clienteId = ? AND r.deletedAt IS NULL
       ORDER BY r.data DESC, r.createdAt DESC LIMIT 50`,
      [id]
    ).map((recebimento) => ({
      ...recebimento,
      alocacoes: queryAll<any>(
        `SELECT a.id, a.vendaId, a.valor, v.numeroSequencial
         FROM recebimento_alocacoes a
         JOIN vendas v ON v.id = a.vendaId
         WHERE a.recebimentoId = ? AND a.deletedAt IS NULL
         ORDER BY v.numeroSequencial ASC`,
        [recebimento.id]
      )
    }));
    const movimentosBonus = queryAll<any>(
      `SELECT * FROM cliente_bonus_movimentos
       WHERE clienteId = ? AND deletedAt IS NULL
       ORDER BY data DESC, createdAt DESC LIMIT 50`,
      [id]
    );

    res.json({
      cliente,
      saldoDevedor: dividas.reduce((total, venda) => total + Number(venda.saldoRestante), 0),
      saldoBonus: Number(bonusRow?.saldo || 0),
      dividas,
      recebimentos,
      movimentosBonus
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/clientes/:id/carteira/recebimentos", (req, res) => {
  try {
    const { id: clienteId } = req.params;
    const { data, valorRecebido, bonusDisponivel, formaPagamento, observacao, alocacoes } = req.body;
    const arredondar = (valor: unknown) => Math.round(Number(valor || 0) * 100) / 100;
    const recebido = arredondar(valorRecebido);
    const bonusPermitido = arredondar(bonusDisponivel);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ""))) {
      throw erroHttp("Informe uma data válida para o recebimento.", 400);
    }
    if (recebido < 0 || bonusPermitido < 0 || (recebido === 0 && bonusPermitido === 0)) {
      throw erroHttp("Informe um valor recebido ou um valor de bônus a utilizar.", 400);
    }
    if (recebido > 0 && !String(formaPagamento || "").trim()) {
      throw erroHttp("Informe a forma de pagamento.", 400);
    }

    const cliente = queryOne<any>("SELECT id FROM clientes WHERE id = ? AND deletedAt IS NULL AND ativo = 1", [clienteId]);
    if (!cliente) throw erroHttp("Cliente não encontrado ou inativo.", 404);

    const agrupadas = new Map<string, number>();
    for (const item of Array.isArray(alocacoes) ? alocacoes : []) {
      const vendaId = String(item?.vendaId || "");
      const valor = arredondar(item?.valor);
      if (!vendaId || valor <= 0) continue;
      agrupadas.set(vendaId, arredondar((agrupadas.get(vendaId) || 0) + valor));
    }
    const listaAlocacoes = [...agrupadas].map(([vendaId, valor]) => ({ vendaId, valor }));
    const totalAplicado = arredondar(listaAlocacoes.reduce((total, item) => total + item.valor, 0));
    const bonusUtilizado = arredondar(Math.max(0, totalAplicado - recebido));
    const bonusGerado = arredondar(Math.max(0, recebido - totalAplicado));

    if (totalAplicado === 0 && recebido === 0) {
      throw erroHttp("Selecione ao menos uma dívida para utilizar o bônus.", 400);
    }
    if (bonusUtilizado > bonusPermitido + 0.005) {
      throw erroHttp("O valor distribuído ultrapassa o dinheiro recebido e o bônus informado.", 400);
    }

    const recebimentoId = "rec_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const pagamentoId = recebido > 0 ? "pag_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16) : null;

    runInTransaction(() => {
      const saldoBonus = Number(queryOne<{ saldo: number }>(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0) AS saldo
         FROM cliente_bonus_movimentos WHERE clienteId = ? AND deletedAt IS NULL`,
        [clienteId]
      )?.saldo || 0);
      if (bonusUtilizado > saldoBonus + 0.005) {
        throw erroHttp("O bônus disponível do cliente não é suficiente.", 409);
      }

      for (const item of listaAlocacoes) {
        const venda = queryOne<any>(
          `SELECT * FROM vendas
           WHERE id = ? AND clienteId = ? AND status = 'pendente' AND deletedAt IS NULL`,
          [item.vendaId, clienteId]
        );
        if (!venda) throw erroHttp("Uma das dívidas selecionadas não está mais em aberto.", 409);
        if (item.valor > Number(venda.saldoRestante) + 0.005) {
          throw erroHttp(`O valor aplicado na venda #${venda.numeroSequencial} ultrapassa o saldo atual.`, 409);
        }
      }

      // A entrada de caixa é criada primeiro porque o cabeçalho do
      // recebimento mantém uma referência explícita a ela.
      if (pagamentoId) {
        execute(
          `INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao, recebimentoId)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
          [pagamentoId, clienteId, data, recebido, formaPagamento, observacao || "Recebimento pela carteira do cliente", recebimentoId]
        );
      }
      execute(
        `INSERT INTO recebimentos_cliente
         (id, clienteId, data, valorRecebido, valorAplicado, bonusUtilizado, bonusGerado, formaPagamento, observacao, pagamentoId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [recebimentoId, clienteId, data, recebido, totalAplicado, bonusUtilizado, bonusGerado, recebido > 0 ? formaPagamento : "bonus", observacao || null, pagamentoId]
      );

      for (const item of listaAlocacoes) {
        const venda = queryOne<any>("SELECT * FROM vendas WHERE id = ?", [item.vendaId])!;
        const novoPago = arredondar(Number(venda.valorPago) + item.valor);
        const novoSaldo = arredondar(Math.max(0, Number(venda.totalLiquido) - novoPago));
        execute(
          `UPDATE vendas SET valorPago = ?, saldoRestante = ?, status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
          [novoPago, novoSaldo, novoSaldo <= 0.005 ? "paga" : "pendente", item.vendaId]
        );
        execute(
          `INSERT INTO recebimento_alocacoes (id, recebimentoId, vendaId, valor) VALUES (?, ?, ?, ?)`,
          ["alo_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16), recebimentoId, item.vendaId, item.valor]
        );
      }

      if (bonusUtilizado > 0) {
        execute(
          `INSERT INTO cliente_bonus_movimentos (id, clienteId, recebimentoId, data, tipo, valor, observacao)
           VALUES (?, ?, ?, ?, 'debito', ?, ?)`,
          ["bon_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16), clienteId, recebimentoId, data, bonusUtilizado, "Bônus utilizado na quitação de dívidas"]
        );
      }
      if (bonusGerado > 0) {
        execute(
          `INSERT INTO cliente_bonus_movimentos (id, clienteId, recebimentoId, data, tipo, valor, observacao)
           VALUES (?, ?, ?, ?, 'credito', ?, ?)`,
          ["bon_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16), clienteId, recebimentoId, data, bonusGerado, "Excedente de recebimento convertido em bônus"]
        );
      }
      registrarAuditoria(null, "registrar_recebimento", "recebimento_cliente", recebimentoId, {
        clienteId, recebido, totalAplicado, bonusUtilizado, bonusGerado, dividas: listaAlocacoes
      });
    });

    res.status(201).json({
      success: true,
      id: recebimentoId,
      valorRecebido: recebido,
      valorAplicado: totalAplicado,
      bonusUtilizado,
      bonusGerado
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/recebimentos-cliente/:id/cancelar", (req, res) => {
  try {
    const administrador = validarPinAdministrador(req.body?.pin);
    if (!administrador) return res.status(403).json({ error: "PIN do administrador inválido." });
    const { id } = req.params;
    const agora = new Date().toISOString();

    runInTransaction(() => {
      const recebimento = queryOne<any>(
        "SELECT * FROM recebimentos_cliente WHERE id = ? AND status = 'ativo' AND deletedAt IS NULL",
        [id]
      );
      if (!recebimento) throw erroHttp("Recebimento não encontrado ou já estornado.", 404);

      const alocacoes = queryAll<any>(
        "SELECT * FROM recebimento_alocacoes WHERE recebimentoId = ? AND deletedAt IS NULL",
        [id]
      );
      for (const alocacao of alocacoes) {
        const venda = queryOne<any>("SELECT * FROM vendas WHERE id = ? AND deletedAt IS NULL", [alocacao.vendaId]);
        if (!venda) throw erroHttp("Não foi possível restaurar uma venda vinculada ao recebimento.", 409);
        const novoPago = Math.round(Math.max(0, Number(venda.valorPago) - Number(alocacao.valor)) * 100) / 100;
        const novoSaldo = Math.round(Math.max(0, Number(venda.totalLiquido) - novoPago) * 100) / 100;
        execute(
          "UPDATE vendas SET valorPago = ?, saldoRestante = ?, status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
          [novoPago, novoSaldo, novoSaldo <= 0.005 ? "paga" : "pendente", venda.id]
        );
      }

      execute("UPDATE recebimento_alocacoes SET deletedAt = ? WHERE recebimentoId = ? AND deletedAt IS NULL", [agora, id]);
      execute("UPDATE cliente_bonus_movimentos SET deletedAt = ? WHERE recebimentoId = ? AND deletedAt IS NULL", [agora, id]);
      if (recebimento.pagamentoId) {
        execute("UPDATE pagamentos SET deletedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND deletedAt IS NULL", [agora, recebimento.pagamentoId]);
      }
      execute("UPDATE recebimentos_cliente SET status = 'cancelado', deletedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [agora, id]);
      registrarAuditoria(administrador.id, "estornar_recebimento", "recebimento_cliente", id, { clienteId: recebimento.clienteId });
    });

    res.json({ success: true, message: "Recebimento estornado e saldos restaurados." });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// 9. PAGAMENTOS LEGADOS
app.get("/api/pagamentos", (req, res) => {
  try {
    const rows = queryAll<any>(
      `SELECT p.*, c.nome as clienteNome, v.numeroSequencial as vendaSequencial
       FROM pagamentos p
       JOIN clientes c ON p.clienteId = c.id
       LEFT JOIN vendas v ON p.vendaId = v.id
       WHERE p.deletedAt IS NULL
       ORDER BY p.data DESC, p.createdAt DESC`
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar um pagamento (manual, vinculando a uma venda ou quitando saldo mais antigo)
app.post("/api/pagamentos", (req, res) => {
  try {
    const { clienteId, vendaId, data, valor, formaPagamento, observacao } = req.body;
    const vValor = Number(valor);

    if (!clienteId || !data || !vValor || vValor <= 0) {
      return res.status(400).json({ error: "Dados de pagamento inválidos. Valor deve ser maior que zero." });
    }

    const pagId = "pag_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

    runInTransaction(() => {
      // Se tiver venda vinculada, quita/amortiza ela especificamente
      if (vendaId) {
        const venda = queryOne<any>("SELECT * FROM vendas WHERE id = ? AND deletedAt IS NULL", [vendaId]);
        if (!venda) {
          throw new Error("Venda informada não existe ou foi cancelada.");
        }

        const novoValorPago = venda.valorPago + vValor;
        const novoSaldo = Math.max(0, venda.totalLiquido - novoValorPago);
        const novoStatus = novoSaldo <= 0 ? "paga" : "pendente";

        // Update venda
        execute(
          "UPDATE vendas SET valorPago = ?, saldoRestante = ?, status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
          [novoValorPago, novoSaldo, novoStatus, vendaId]
        );

        // Insert pagamento
        execute(
          `INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [pagId, clienteId, vendaId, data, vValor, formaPagamento, observacao || `Pagamento parcial/total da venda #${venda.numeroSequencial}`]
        );
      } else {
        // Sem vendaId vinculada: Pagamento avulso de saldo pendente
        // Vamos buscar TODAS as vendas pendentes do cliente, ordenar pela mais antiga, e amortizar o valor entre elas!
        // Este algoritmo é extremamente útil e economiza cliques.
        const vendasPendentes = queryAll<any>(
          "SELECT * FROM vendas WHERE clienteId = ? AND status = 'pendente' AND deletedAt IS NULL ORDER BY data ASC, numeroSequencial ASC",
          [clienteId]
        );

        let valorDisponivel = vValor;

        for (const v of vendasPendentes) {
          if (valorDisponivel <= 0) break;

          const amortizar = Math.min(valorDisponivel, v.saldoRestante);
          const nPago = v.valorPago + amortizar;
          const nSaldo = v.saldoRestante - amortizar;
          const nStatus = nSaldo <= 0 ? "paga" : "pendente";

          execute(
            "UPDATE vendas SET valorPago = ?, saldoRestante = ?, status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
            [nPago, nSaldo, nStatus, v.id]
          );

          valorDisponivel -= amortizar;
        }

        // Registrar o pagamento no sistema (se sobrou valor, fica como crédito registrado de forma avulsa)
        execute(
          `INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [pagId, clienteId, null, data, vValor, formaPagamento, observacao || "Pagamento de saldo pendente (Amortização Automática)"]
        );
      }
    });

    res.json({ success: true, id: pagId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/pagamentos/:id/cancelar", (req, res) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();

    runInTransaction(() => {
      const pag = queryOne<any>("SELECT * FROM pagamentos WHERE id = ? AND deletedAt IS NULL", [id]);
      if (!pag) {
        throw new Error("Pagamento não encontrado ou já cancelado.");
      }
      if (pag.recebimentoId) {
        throw erroHttp("Este lançamento pertence à Carteira do Cliente. Faça o estorno pelo recebimento da carteira.", 409);
      }

      // Soft delete do pagamento
      execute("UPDATE pagamentos SET deletedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [nowStr, id]);

      // Desfazer o impacto do pagamento nas vendas
      if (pag.vendaId) {
        const v = queryOne<any>("SELECT * FROM vendas WHERE id = ?", [pag.vendaId]);
        if (v) {
          const nPago = Math.max(0, v.valorPago - pag.valor);
          const nSaldo = v.totalLiquido - nPago;
          const nStatus = nSaldo <= 0 ? "paga" : "pendente";

          execute(
            "UPDATE vendas SET valorPago = ?, saldoRestante = ?, status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
            [nPago, nSaldo, nStatus, v.id]
          );
        }
      } else {
        // Se foi um pagamento avulso que amortizou múltiplas contas, precisamos recalcular
        // do cliente. Para simplificar e garantir 100% de consistência sem complicar:
        // Buscamos todas as vendas ativas do cliente e todos os pagamentos ativos e recalculamos o saldoRestante das vendas.
        const clienteId = pag.clienteId;
        
        // Obter todas as vendas ativas do cliente em ordem cronológica
        const vendas = queryAll<any>(
          "SELECT * FROM vendas WHERE clienteId = ? AND deletedAt IS NULL ORDER BY data ASC, numeroSequencial ASC",
          [clienteId]
        );
        
        // Obter soma de todos os pagamentos ativos do cliente
        const somaPagamentosRow = queryOne<{ total: number }>(
          "SELECT COALESCE(SUM(valor), 0) as total FROM pagamentos WHERE clienteId = ? AND deletedAt IS NULL",
          [clienteId]
        );
        let saldoDisponivel = somaPagamentosRow ? somaPagamentosRow.total : 0;

        // Redistribuir todo o saldo pago entre as faturas
        for (const v of vendas) {
          const totalLiquido = v.totalLiquido;
          const amortizar = Math.min(saldoDisponivel, totalLiquido);
          const nPago = amortizar;
          const nSaldo = totalLiquido - nPago;
          const nStatus = nSaldo <= 0 ? "paga" : "pendente";

          execute(
            "UPDATE vendas SET valorPago = ?, saldoRestante = ?, status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
            [nPago, nSaldo, nStatus, v.id]
          );

          saldoDisponivel -= amortizar;
        }
      }
    });

    res.json({ success: true, message: "Pagamento cancelado com sucesso e saldos das vendas reajustados." });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});


// 9. RELATÓRIOS GERENCIAIS
app.get("/api/relatorios", (req, res) => {
  try {
    const {
      startDate, endDate, clienteId, produtoId, fornecedorId, formaPagamento,
      statusVenda, valeStatus, vencimentoInicio, vencimentoFim
    } = req.query;

    let filters = ["v.deletedAt IS NULL"];
    let params: any[] = [];

    if (startDate) {
      filters.push("v.data >= ?");
      params.push(startDate);
    }
    if (endDate) {
      filters.push("v.data <= ?");
      params.push(endDate);
    }
    if (clienteId) {
      filters.push("v.clienteId = ?");
      params.push(clienteId);
    }
    if (statusVenda) {
      filters.push("v.status = ?");
      params.push(statusVenda);
    }

    const whereClause = filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";

    // A. VENDAS POR PERÍODO / CLIENTE
    const vendas = queryAll<any>(
      `SELECT v.*, c.nome as clienteNome
       FROM vendas v
       JOIN clientes c ON v.clienteId = c.id
       ${whereClause}
       ORDER BY v.data DESC, v.numeroSequencial DESC`,
      params
    );

    // B. ITENS VENDIDOS (com detalhamento de metros, lucro, custo)
    let itemFilters = ["v.deletedAt IS NULL"];
    let itemParams: any[] = [];
    if (startDate) { itemFilters.push("v.data >= ?"); itemParams.push(startDate); }
    if (endDate) { itemFilters.push("v.data <= ?"); itemParams.push(endDate); }
    if (clienteId) { itemFilters.push("v.clienteId = ?"); itemParams.push(clienteId); }
    if (produtoId) { itemFilters.push("iv.produtoId = ?"); itemParams.push(produtoId); }

    const itemWhere = "WHERE " + itemFilters.join(" AND ");
    const itensVendidos = queryAll<any>(
      `SELECT iv.*, v.data, v.numeroSequencial, c.nome as clienteNome
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       JOIN clientes c ON v.clienteId = c.id
       ${itemWhere}
       ORDER BY v.data DESC`,
      itemParams
    );

    // C. PAGAMENTOS RECEBIDOS
    let pagFilters = ["p.deletedAt IS NULL"];
    let pagParams: any[] = [];
    if (startDate) { pagFilters.push("p.data >= ?"); pagParams.push(startDate); }
    if (endDate) { pagFilters.push("p.data <= ?"); pagParams.push(endDate); }
    if (clienteId) { pagFilters.push("p.clienteId = ?"); pagParams.push(clienteId); }
    if (formaPagamento) { pagFilters.push("p.formaPagamento = ?"); pagParams.push(formaPagamento); }

    const pagWhere = "WHERE " + pagFilters.join(" AND ");
    const pagamentos = queryAll<any>(
      `SELECT p.*, c.nome as clienteNome, v.numeroSequencial as vendaSequencial
       FROM pagamentos p
       JOIN clientes c ON p.clienteId = c.id
       LEFT JOIN vendas v ON p.vendaId = v.id
       ${pagWhere}
       ORDER BY p.data DESC`,
      pagParams
    );

    const rankingProdutos = queryAll<any>(
      `SELECT 
         iv.produtoId, 
         iv.descricao, 
         COALESCE(SUM(
           iv.total - CASE WHEN v.subtotal > 0 THEN v.desconto * (iv.total / v.subtotal) ELSE 0 END
         ), 0) as totalValor,
         COALESCE(SUM(iv.custoTotal), 0) as totalCusto,
         COALESCE(SUM(
           iv.total
           - CASE WHEN v.subtotal > 0 THEN v.desconto * (iv.total / v.subtotal) ELSE 0 END
           - iv.custoTotal
         ), 0) as totalLucro,
         COUNT(DISTINCT iv.vendaId) as totalVendas
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       ${itemWhere}
       GROUP BY iv.produtoId, iv.descricao
       ORDER BY totalLucro DESC`,
      itemParams
    );

    const rankingClientes = queryAll<any>(
      `SELECT 
         v.clienteId, 
         c.nome as clienteNome,
         c.telefone as clienteTelefone,
         COUNT(v.id) as totalVendas,
         COALESCE(SUM(v.totalLiquido), 0) as totalComprado,
         COALESCE(SUM(v.saldoRestante), 0) as saldoDevedor
       FROM vendas v
       JOIN clientes c ON v.clienteId = c.id
       ${whereClause}
       GROUP BY v.clienteId, c.nome, c.telefone
       ORDER BY totalComprado DESC`,
      params
    );

    const hoje = new Date().toISOString().split("T")[0];
    const carteiraVencida = queryOne<any>(
      `SELECT
         COUNT(*) as quantidade,
         COALESCE(SUM(saldoRestante), 0) as total,
         COALESCE(SUM(CASE WHEN julianday(?) - julianday(vencimento) <= 7 THEN saldoRestante ELSE 0 END), 0) as ate7Dias,
         COALESCE(SUM(CASE WHEN julianday(?) - julianday(vencimento) BETWEEN 8 AND 30 THEN saldoRestante ELSE 0 END), 0) as de8a30Dias,
         COALESCE(SUM(CASE WHEN julianday(?) - julianday(vencimento) > 30 THEN saldoRestante ELSE 0 END), 0) as mais30Dias
       FROM vendas
       WHERE status = 'pendente' AND vencimento < ? AND deletedAt IS NULL`,
      [hoje, hoje, hoje, hoje]
    );

    // D. CLIENTES: movimento dentro do período e posição financeira atual.
    const clientesResumo = queryAll<any>(
      `SELECT
         c.id as clienteId,
         c.nome as clienteNome,
         c.telefone as clienteTelefone,
         COUNT(DISTINCT v.id) as totalVendas,
         COALESCE(SUM(v.totalLiquido), 0) as totalComprado,
         COALESCE(MAX(v.data), '') as ultimaCompra,
         COALESCE((
           SELECT SUM(p.valor) FROM pagamentos p
           WHERE p.clienteId = c.id AND p.deletedAt IS NULL
             ${startDate ? "AND p.data >= ?" : ""}
             ${endDate ? "AND p.data <= ?" : ""}
         ), 0) as totalRecebido,
         COALESCE((
           SELECT SUM(vp.saldoRestante) FROM vendas vp
           WHERE vp.clienteId = c.id AND vp.status = 'pendente' AND vp.deletedAt IS NULL
         ), 0) as saldoDevedor,
         COALESCE((
           SELECT SUM(CASE WHEN bm.tipo = 'credito' THEN bm.valor ELSE -bm.valor END)
           FROM cliente_bonus_movimentos bm
           WHERE bm.clienteId = c.id AND bm.deletedAt IS NULL
         ), 0) as saldoBonus
       FROM clientes c
       LEFT JOIN vendas v ON v.clienteId = c.id AND v.deletedAt IS NULL
         ${startDate ? "AND v.data >= ?" : ""}
         ${endDate ? "AND v.data <= ?" : ""}
       WHERE c.deletedAt IS NULL ${clienteId ? "AND c.id = ?" : ""}
       GROUP BY c.id, c.nome, c.telefone
       ORDER BY totalComprado DESC, c.nome ASC`,
      [
        ...(startDate ? [startDate] : []),
        ...(endDate ? [endDate] : []),
        ...(startDate ? [startDate] : []),
        ...(endDate ? [endDate] : []),
        ...(clienteId ? [clienteId] : [])
      ]
    );

    // E. FORNECEDORES: uma linha por item comprado; o frontend consolida
    // compras sem duplicar o valor total quando há vários materiais.
    const compraFornecedorFilters = ["c.deletedAt IS NULL"];
    const compraFornecedorParams: any[] = [];
    if (startDate) { compraFornecedorFilters.push("c.data >= ?"); compraFornecedorParams.push(startDate); }
    if (endDate) { compraFornecedorFilters.push("c.data <= ?"); compraFornecedorParams.push(endDate); }
    if (fornecedorId) { compraFornecedorFilters.push("c.fornecedorId = ?"); compraFornecedorParams.push(fornecedorId); }
    if (produtoId) { compraFornecedorFilters.push("ic.produtoId = ?"); compraFornecedorParams.push(produtoId); }
    const comprasFornecedores = queryAll<any>(
      `SELECT
         c.id as compraId, c.data, c.total as totalCompra, c.desconto,
         f.id as fornecedorId, f.nome as fornecedorNome, f.telefone as fornecedorTelefone,
         ic.produtoId, p.nome as produtoNome, ic.quantidade, ic.unidade,
         ic.custoUnitario, ic.total as totalItem
       FROM compras c
       JOIN fornecedores f ON f.id = c.fornecedorId
       JOIN itens_compra ic ON ic.compraId = c.id
       JOIN produtos p ON p.id = ic.produtoId
       WHERE ${compraFornecedorFilters.join(" AND ")}
       ORDER BY c.data DESC, c.createdAt DESC, f.nome ASC`,
      compraFornecedorParams
    );

    // F. VALES: vendas a prazo identificadas pelo vencimento, com filtros
    // próprios de emissão, vencimento e situação atual.
    const valeFilters = ["v.deletedAt IS NULL", "v.vencimento IS NOT NULL"];
    const valeParams: any[] = [];
    if (startDate) { valeFilters.push("v.data >= ?"); valeParams.push(startDate); }
    if (endDate) { valeFilters.push("v.data <= ?"); valeParams.push(endDate); }
    if (clienteId) { valeFilters.push("v.clienteId = ?"); valeParams.push(clienteId); }
    if (vencimentoInicio) { valeFilters.push("v.vencimento >= ?"); valeParams.push(vencimentoInicio); }
    if (vencimentoFim) { valeFilters.push("v.vencimento <= ?"); valeParams.push(vencimentoFim); }
    if (valeStatus === "abertos") valeFilters.push("v.status = 'pendente'");
    if (valeStatus === "vencidos") { valeFilters.push("v.status = 'pendente'"); valeFilters.push("v.vencimento < ?"); valeParams.push(hoje); }
    if (valeStatus === "a_vencer") { valeFilters.push("v.status = 'pendente'"); valeFilters.push("v.vencimento >= ?"); valeParams.push(hoje); }
    if (valeStatus === "quitados") valeFilters.push("v.status = 'paga'");
    const vales = queryAll<any>(
      `SELECT
         v.id, v.numeroSequencial, v.clienteId, c.nome as clienteNome,
         c.telefone as clienteTelefone, v.data, v.vencimento, v.totalLiquido,
         v.valorPago, v.saldoRestante, v.status,
         CASE WHEN v.status = 'pendente' AND v.vencimento < ?
           THEN CAST(julianday(?) - julianday(v.vencimento) AS INTEGER) ELSE 0 END as diasAtraso
       FROM vendas v
       JOIN clientes c ON c.id = v.clienteId
       WHERE ${valeFilters.join(" AND ")}
       ORDER BY CASE WHEN v.status = 'pendente' THEN 0 ELSE 1 END,
                v.vencimento ASC, v.numeroSequencial DESC`,
      [hoje, hoje, ...valeParams]
    );

    res.json({
      vendas,
      itensVendidos,
      pagamentos,
      carteiraVencida,
      clientesResumo,
      comprasFornecedores,
      vales,
      rankings: {
        produtos: rankingProdutos,
        clientes: rankingClientes
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 10. BACKUP E RESTAURAÇÃO
app.get("/api/backups", (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const backups = files
      .filter((file) => file.endsWith(".db"))
      .map((file) => {
        const filePath = path.join(BACKUP_DIR, file);
        const stat = fs.statSync(filePath);
        return {
          filename: file,
          size: stat.size,
          createdAt: stat.mtime
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json(backups);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/backups", (req, res) => {
  try {
    const filename = createBackupFile("manual");
    res.json({ success: true, message: "Backup criado com sucesso!", filename });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/backups/restaurar", (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: "Nome do arquivo de backup não informado." });
    }

    const backupPath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: "Arquivo de backup não encontrado." });
    }

    // Close the database connection to release lock
    db.close();

    // Copy backup over main database
    fs.copyFileSync(backupPath, LIVE_DB_FILE);

    // Re-initialize database
    // We import it on demand or since db was exported from ./server/db.ts,
    // we can re-open it. Since better-sqlite3 instance is cached, we need to restart or re-instantiate.
    // In node, to safely reload, restarting the dev server is cleanest.
    // But we can also just let the process crash or successfully respond, and since it's a backup restore,
    // we will exit the process and let the container orchestrator (or PM2/nodemon/tsx) auto-restart it instantly!
    // This is the absolute SAFEST way to prevent corrupt in-memory SQLite handles after a restore.
    res.json({ 
      success: true, 
      message: "Backup restaurado com sucesso! O servidor está reiniciando para carregar os dados novos." 
    });

    setTimeout(() => {
      console.log("Exiting to trigger container / tsx restart for database refresh...");
      process.exit(0);
    }, 1000);

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/backups/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const backupPath = path.join(BACKUP_DIR, filename);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      res.json({ success: true, message: "Backup excluído." });
    } else {
      res.status(404).json({ error: "Arquivo não encontrado." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// --- VITE DEV / PRODUCTION HANDLERS ---
async function startServer() {
  if (!IS_PRODUCTION) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start listening
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
