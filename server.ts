import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { initDatabase, queryAll, queryOne, execute, runInTransaction, db, isMockModeEnabled, setMockMode, BACKUP_DIR, LIVE_DB_FILE } from "./server/db.js";

// Initialize express app
const app = express();
const PORT = 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production" || path.basename(process.argv[1] ?? "") === "server.cjs";

app.use(express.json());

// Initialize SQLite database and tables
initDatabase();

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


// 5. PRODUTOS
app.get("/api/produtos", (req, res) => {
  try {
    const rows = queryAll("SELECT * FROM produtos WHERE deletedAt IS NULL ORDER BY nome ASC");
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/produtos", (req, res) => {
  try {
    const { nome, codigo, unidade, precoVendaPadrao, custoPadrao, ativo, unidadeCompra, unidadeVenda, fatorConversao, venderUnidadeCompra } = req.body;
    if (!nome) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }
    if (precoVendaPadrao < 0 || custoPadrao < 0) {
      return res.status(400).json({ error: "Preços e custos não podem ser negativos." });
    }
    const id = "prod_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    execute(
      `INSERT INTO produtos (id, nome, codigo, unidade, precoVendaPadrao, custoPadrao, unidadeCompra, unidadeVenda, fatorConversao, venderUnidadeCompra, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, 
        nome, 
        codigo || null, 
        unidadeVenda || unidade, 
        Number(precoVendaPadrao), 
        Number(custoPadrao), 
        unidadeCompra || unidade,
        unidadeVenda || unidade,
        fatorConversao !== undefined ? Number(fatorConversao) : 1.0,
        venderUnidadeCompra ? 1 : 0,
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
    const { nome, codigo, unidade, precoVendaPadrao, custoPadrao, ativo, unidadeCompra, unidadeVenda, fatorConversao, venderUnidadeCompra } = req.body;
    if (!nome) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }
    if (precoVendaPadrao < 0 || custoPadrao < 0) {
      return res.status(400).json({ error: "Preços e custos não podem ser negativos." });
    }
    execute(
      `UPDATE produtos
       SET nome = ?, codigo = ?, unidade = ?, precoVendaPadrao = ?, custoPadrao = ?, unidadeCompra = ?, unidadeVenda = ?, fatorConversao = ?, venderUnidadeCompra = ?, ativo = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND deletedAt IS NULL`,
      [
        nome, 
        codigo || null, 
        unidadeVenda || unidade, 
        Number(precoVendaPadrao), 
        Number(custoPadrao), 
        unidadeCompra || unidade,
        unidadeVenda || unidade,
        fatorConversao !== undefined ? Number(fatorConversao) : 1.0,
        venderUnidadeCompra ? 1 : 0,
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
      `SELECT v.*, c.nome as clienteNome, c.telefone as clienteTelefone
       FROM vendas v
       JOIN clientes c ON v.clienteId = c.id
       WHERE v.deletedAt IS NULL
       ORDER BY v.numeroSequencial DESC`
    );
    
    // Fetch items for each sale
    for (const v of rows) {
      v.items = queryAll("SELECT * FROM itens_venda WHERE vendaId = ?", [v.id]);
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
      observacoes
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
          throw new Error(`Produto não encontrado para o ID: ${it.produtoId}`);
        }

        const qty = Number(it.quantidade);
        const precoUnit = Number(it.precoUnitario);
        const descItem = Number(it.desconto || 0);
        const unidadeVenda = prod.unidadeVenda || prod.unidade;
        const unidadeItem = it.unidade || unidadeVenda;
        const unidadesPermitidas = [unidadeVenda];

        if (prod.venderUnidadeCompra && prod.unidadeCompra && prod.unidadeCompra !== unidadeVenda) {
          unidadesPermitidas.push(prod.unidadeCompra);
        }

        if (!unidadesPermitidas.includes(unidadeItem)) {
          throw new Error(`A unidade "${unidadeItem}" não está liberada para venda do produto ${prod.nome}.`);
        }

        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(precoUnit) || precoUnit < 0 || !Number.isFinite(descItem) || descItem < 0) {
          throw new Error(`Quantidade, preço ou desconto inválido para o produto ${prod.nome}.`);
        }

        const usaUnidadeCompra = unidadeItem === prod.unidadeCompra && unidadeItem !== unidadeVenda;
        const fatorCusto = usaUnidadeCompra ? Number(prod.fatorConversao || 1) : 1;
        const custoUnit = Number(prod.custoPadrao || 0) * fatorCusto;

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
          lucroBruto: lucroItem
        };
      });

      // Calcule subtotal, desconto geral e total líquido automaticamente
      const descGeral = Number(descontoGeral || 0);
      const totalLiquido = subtotal - descGeral;
      const vPago = Number(valorPago || 0);
      const saldoRestante = totalLiquido - vPago;

      if (totalLiquido < 0) {
        throw new Error("O desconto geral não pode ser maior que o subtotal.");
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

      return { id: vendaId, numeroSequencial: nextSeq };
    });

    const fullVenda = queryOne("SELECT * FROM vendas WHERE id = ?", [resultVenda.id]);
    res.status(210).json(fullVenda);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/vendas/:id/cancelar", (req, res) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();
    
    runInTransaction(() => {
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
    });

    res.json({ success: true, message: "Venda e pagamentos vinculados cancelados com sucesso." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


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
    res.status(500).json({ error: error.message });
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
          throw new Error(`Produto não encontrado para o ID: ${it.produtoId}`);
        }

        const qty = Number(it.quantidade);
        const custoUnit = Number(it.custoUnitario);
        const unidadeCompra = prod.unidadeCompra || prod.unidadeVenda || prod.unidade;
        const unidadeInformada = it.unidade || unidadeCompra;

        if (unidadeInformada !== unidadeCompra) {
          throw new Error(`A compra de ${prod.nome} deve ser registrada em ${unidadeCompra}.`);
        }

        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(custoUnit) || custoUnit < 0) {
          throw new Error(`Quantidade ou custo inválido para o produto ${prod.nome}.`);
        }

        const itemTotal = qty * custoUnit;

        subtotal += itemTotal;

        const unidadeVenda = prod.unidadeVenda || prod.unidade;
        const usaConversao = unidadeCompra !== unidadeVenda;
        const fatorConversao = usaConversao ? Number(prod.fatorConversao || 1) : 1;
        const custoBaseVenda = custoUnit / fatorConversao;

        // Auto-update standard product cost in standard database
        execute(
          "UPDATE produtos SET custoPadrao = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
          [custoBaseVenda, it.produtoId]
        );

        return {
          id: "itc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
          produtoId: it.produtoId,
          quantidade: qty,
          unidade: unidadeCompra,
          custoUnitario: custoUnit,
          total: itemTotal
        };
      });

      const desc = Number(desconto || 0);
      const total = subtotal - desc;

      if (total < 0) {
        throw new Error("Desconto não pode ser maior que o subtotal da compra.");
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
    });

    const fullCompra = queryOne("SELECT * FROM compras WHERE id = ?", [compraId]);
    res.status(210).json(fullCompra);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/compras/:id/cancelar", (req, res) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();
    execute("UPDATE compras SET deletedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [nowStr, id]);
    res.json({ success: true, message: "Compra cancelada com sucesso." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 8. PAGAMENTOS
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
    res.status(500).json({ error: error.message });
  }
});


// 9. RELATÓRIOS GERENCIAIS
app.get("/api/relatorios", (req, res) => {
  try {
    const { startDate, endDate, clienteId, produtoId, formaPagamento, statusVenda } = req.query;

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

    res.json({
      vendas,
      itensVendidos,
      pagamentos,
      carteiraVencida,
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
