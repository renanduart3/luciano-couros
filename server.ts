import express, { type NextFunction, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { initDatabase, queryAll, queryOne, execute, runInTransaction, db, BACKUP_DIR, LIVE_DB_FILE, rebuildClienteProdutosHabituais } from "./server/db.js";

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
  login: string | null;
  perfil: string;
  ativo: number;
  deveTrocarSenha: number;
  pinHash: string | null;
  pinSalt: string | null;
};

type UsuarioAutenticado = Pick<UsuarioAdministrador, "id" | "nome" | "login" | "perfil" | "deveTrocarSenha">;
type SessaoLocal = { usuario: UsuarioAutenticado; expiraEm: number };

const COOKIE_SESSAO = "luciano_sessao";
const DURACAO_SESSAO_MS = 16 * 60 * 60 * 1000;
const SENHA_RESET_LOCAL = "Altinopolis";
const sessoesLocais = new Map<string, SessaoLocal>();
const tentativasLogin = new Map<string, { quantidade: number; bloqueadoAte: number }>();

function getUsuarioAdministrador(): UsuarioAdministrador | undefined {
  return queryOne<UsuarioAdministrador>(
    `SELECT id, nome, login, perfil, ativo, deveTrocarSenha, pinHash, pinSalt
     FROM usuarios
     WHERE perfil = 'administrador' AND ativo = 1
     ORDER BY createdAt ASC
     LIMIT 1`
  );
}

function getUsuarioPorId(id: string): UsuarioAdministrador | undefined {
  return queryOne<UsuarioAdministrador>(
    `SELECT id, nome, login, perfil, ativo, deveTrocarSenha, pinHash, pinSalt
     FROM usuarios WHERE id = ? AND ativo = 1`,
    [id]
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

function validarSenhaUsuario(usuario: UsuarioAdministrador | undefined, senha: unknown) {
  if (!usuario?.pinHash || !usuario.pinSalt || typeof senha !== "string") return false;
  const informado = Buffer.from(gerarHashPin(senha, usuario.pinSalt).hash, "hex");
  const esperado = Buffer.from(usuario.pinHash, "hex");
  return informado.length === esperado.length && crypto.timingSafeEqual(informado, esperado);
}

function senhaValida(senha: unknown) {
  return typeof senha === "string" && senha.length >= 4 && senha.length <= 64;
}

function cookiesDaRequisicao(req: Request) {
  return String(req.headers.cookie || "").split(";").reduce<Record<string, string>>((cookies, parte) => {
    const separador = parte.indexOf("=");
    if (separador < 0) return cookies;
    const chave = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();
    if (chave) cookies[chave] = decodeURIComponent(valor);
    return cookies;
  }, {});
}

function tokenSessao(req: Request) {
  return cookiesDaRequisicao(req)[COOKIE_SESSAO] || "";
}

function obterSessao(req: Request): SessaoLocal | null {
  const token = tokenSessao(req);
  const sessao = token ? sessoesLocais.get(token) : undefined;
  if (!sessao) return null;
  if (sessao.expiraEm <= Date.now()) {
    sessoesLocais.delete(token);
    return null;
  }
  return sessao;
}

function definirCookieSessao(res: Response, token: string) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_SESSAO}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(DURACAO_SESSAO_MS / 1000)}`
  );
}

function limparCookieSessao(res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE_SESSAO}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function criarSessao(usuario: UsuarioAdministrador, res: Response) {
  const token = crypto.randomBytes(32).toString("hex");
  const autenticado: UsuarioAutenticado = {
    id: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    perfil: usuario.perfil,
    deveTrocarSenha: Number(usuario.deveTrocarSenha || 0),
  };
  sessoesLocais.set(token, { usuario: autenticado, expiraEm: Date.now() + DURACAO_SESSAO_MS });
  definirCookieSessao(res, token);
  return autenticado;
}

function invalidarSessoesUsuario(usuarioId?: string) {
  for (const [token, sessao] of sessoesLocais) {
    if (!usuarioId || sessao.usuario.id === usuarioId) sessoesLocais.delete(token);
  }
}

function usuarioDaRequisicao(req: Request) {
  return obterSessao(req)?.usuario || null;
}

function exigirAutenticacao(req: Request, res: Response, next: NextFunction) {
  const sessao = obterSessao(req);
  if (!sessao) return res.status(401).json({ error: "Sessão expirada. Entre novamente no sistema." });
  const atual = getUsuarioPorId(sessao.usuario.id);
  if (!atual) {
    sessoesLocais.delete(tokenSessao(req));
    limparCookieSessao(res);
    return res.status(401).json({ error: "Este usuário não está mais ativo." });
  }
  sessao.usuario = {
    id: atual.id,
    nome: atual.nome,
    login: atual.login,
    perfil: atual.perfil,
    deveTrocarSenha: Number(atual.deveTrocarSenha || 0),
  };
  next();
}

function exigirGerente(req: Request, res: Response, next: NextFunction) {
  if (usuarioDaRequisicao(req)?.perfil !== "administrador") {
    return res.status(403).json({ error: "Esta operação é exclusiva do gerente." });
  }
  next();
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

function salvarPrecoAutorizadoCliente(
  clienteId: string,
  produtoId: string,
  preco: number,
  fornecedorId?: string | null
) {
  const produto = queryOne<{ unidade: string }>(
    "SELECT unidade FROM produtos WHERE id = ? AND deletedAt IS NULL AND ativo = 1",
    [produtoId]
  );
  if (!produto) throw erroHttp("Produto não encontrado ou inativo.", 404);

  if (fornecedorId) {
    const associacao = queryOne(
      `SELECT fp.fornecedorId
       FROM fornecedor_produtos fp
       JOIN fornecedores f ON f.id = fp.fornecedorId
       WHERE fp.produtoId = ? AND fp.fornecedorId = ? AND fp.ativo = 1
         AND f.ativo = 1 AND f.deletedAt IS NULL`,
      [produtoId, fornecedorId]
    );
    if (!associacao) throw erroHttp("Fornecedor não está associado a este produto.", 400);
    execute(
      `INSERT INTO cliente_produto_fornecedor_precos
         (clienteId, produtoId, fornecedorId, ultimoPreco, ultimaQuantidade, ultimaUnidade, vezesComprado, ultimaCompraEm, precoAutorizado, oculto)
       VALUES (?, ?, ?, ?, NULL, ?, 0, date('now', 'localtime'), ?, 0)
       ON CONFLICT(clienteId, produtoId, fornecedorId) DO UPDATE SET
         precoAutorizado = excluded.precoAutorizado,
         oculto = 0,
         updatedAt = CURRENT_TIMESTAMP`,
      [clienteId, produtoId, fornecedorId, preco, produto.unidade, preco]
    );
    return;
  }

  execute(
    `INSERT INTO cliente_produtos_habituais
       (clienteId, produtoId, ultimoPreco, ultimaQuantidade, ultimaUnidade, vezesComprado, ultimaCompraEm, precoAutorizado, oculto)
     VALUES (?, ?, ?, NULL, ?, 0, date('now', 'localtime'), ?, 0)
     ON CONFLICT(clienteId, produtoId) DO UPDATE SET
       precoAutorizado = excluded.precoAutorizado,
       oculto = 0,
       updatedAt = CURRENT_TIMESTAMP`,
    [clienteId, produtoId, preco, produto.unidade, preco]
  );
}

function resolverPrecoClienteProdutoFornecedor(
  clienteId: string,
  produto: { id: string; precoVendaPadrao: number; custoPadrao?: number },
  fornecedorId?: string | null
) {
  if (fornecedorId) {
    const associacao = queryOne<{
      fornecedorId: string;
      fornecedorReferencia: string | null;
      precoVendaFornecedor: number | null;
      custoFornecedor: number | null;
    }>(
      `SELECT fp.fornecedorId, f.referencia AS fornecedorReferencia,
              fp.precoVendaFornecedor, fp.custoFornecedor
       FROM fornecedor_produtos fp
       JOIN fornecedores f ON f.id = fp.fornecedorId
       WHERE fp.produtoId = ? AND fp.fornecedorId = ? AND fp.ativo = 1
         AND f.ativo = 1 AND f.deletedAt IS NULL`,
      [produto.id, fornecedorId]
    );
    if (!associacao) throw erroHttp("Fornecedor não está associado a este produto.", 400);
    const preferencia = queryOne<{ precoAutorizado: number | null; ultimoPreco: number | null }>(
      `SELECT precoAutorizado, ultimoPreco
       FROM cliente_produto_fornecedor_precos
       WHERE clienteId = ? AND produtoId = ? AND fornecedorId = ? AND oculto = 0`,
      [clienteId, produto.id, fornecedorId]
    );
    return {
      fornecedorId,
      fornecedorReferencia: associacao.fornecedorReferencia,
      precoMinimoSemPin: Number(
        preferencia?.precoAutorizado
        ?? preferencia?.ultimoPreco
        ?? associacao.precoVendaFornecedor
        ?? produto.precoVendaPadrao
        ?? 0
      ),
      custoUnitario: Number(associacao.custoFornecedor ?? produto.custoPadrao ?? 0),
    };
  }

  const preferencia = queryOne<{ precoAutorizado: number | null; ultimoPreco: number | null }>(
    `SELECT precoAutorizado, ultimoPreco
     FROM cliente_produtos_habituais
     WHERE clienteId = ? AND produtoId = ? AND oculto = 0`,
    [clienteId, produto.id]
  );
  return {
    fornecedorId: null,
    fornecedorReferencia: null,
    precoMinimoSemPin: Number(
      preferencia?.precoAutorizado
      ?? preferencia?.ultimoPreco
      ?? produto.precoVendaPadrao
      ?? 0
    ),
    custoUnitario: Number(produto.custoPadrao ?? 0),
  };
}

type ParcelaValeInformada = { vencimento: string; valor: number };

function normalizarParcelasVale(parcelas: unknown, totalEsperado: number): ParcelaValeInformada[] {
  if (!Array.isArray(parcelas) || parcelas.length === 0) {
    throw erroHttp("Informe ao menos uma condição de pagamento para o vale.", 400);
  }
  const maximoParcelasPorValor = Math.max(1, Math.floor(totalEsperado / 100));
  const maximoParcelas = Math.min(24, maximoParcelasPorValor);
  if (parcelas.length > maximoParcelas) {
    throw erroHttp(
      `Para parcelas mínimas de R$ 100,00, este vale pode possuir no máximo ${maximoParcelas} parcela(s).`,
      400
    );
  }
  const normalizadas = parcelas.map((item: any) => ({
    vencimento: String(item?.vencimento || ""),
    valor: Math.round(Number(item?.valor) * 100) / 100,
  }));
  for (const parcela of normalizadas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parcela.vencimento) || !Number.isFinite(parcela.valor) || parcela.valor <= 0) {
      throw erroHttp("Todas as parcelas precisam de uma data e um valor maior que zero.", 400);
    }
    if (totalEsperado >= 100 && parcela.valor < 100) {
      throw erroHttp("Cada parcela do vale deve possuir valor mínimo de R$ 100,00.", 400);
    }
  }
  normalizadas.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const soma = Math.round(normalizadas.reduce((total, parcela) => total + parcela.valor, 0) * 100) / 100;
  if (Math.abs(soma - totalEsperado) > 0.01) {
    throw erroHttp(`A soma das parcelas deve ser ${totalEsperado.toFixed(2).replace(".", ",")}.`, 400);
  }
  return normalizadas;
}

function inserirParcelasVale(vendaId: string, parcelas: ParcelaValeInformada[]) {
  execute("UPDATE vale_parcelas SET deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE vendaId = ? AND deletedAt IS NULL", [vendaId]);
  parcelas.forEach((parcela, index) => {
    execute(
      `INSERT INTO vale_parcelas (id, vendaId, numero, vencimento, valor, valorPago, saldo, status)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'pendente')`,
      [
        "vpar_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
        vendaId,
        index + 1,
        parcela.vencimento,
        parcela.valor,
        parcela.valor
      ]
    );
  });
}

function recalcularParcelasVale(vendaId: string) {
  const venda = queryOne<{ valorPago: number; status: string }>("SELECT valorPago, status FROM vendas WHERE id = ?", [vendaId]);
  if (!venda) return;
  const parcelas = queryAll<any>(
    "SELECT * FROM vale_parcelas WHERE vendaId = ? AND deletedAt IS NULL ORDER BY vencimento ASC, numero ASC",
    [vendaId]
  );
  let pagoDisponivel = Math.max(0, Number(venda.valorPago || 0));
  for (const parcela of parcelas) {
    const valor = Number(parcela.valor);
    const pago = Math.round(Math.min(valor, pagoDisponivel) * 100) / 100;
    const saldo = Math.round(Math.max(0, valor - pago) * 100) / 100;
    pagoDisponivel = Math.max(0, pagoDisponivel - pago);
    execute(
      `UPDATE vale_parcelas
       SET valorPago = ?, saldo = ?, status = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [pago, saldo, venda.status === "cancelada" ? "cancelada" : saldo <= 0.005 ? "paga" : "pendente", parcela.id]
    );
  }
}

function reduzirParcelasValePorDevolucao(vendaId: string, valorCredito: number) {
  const parcelas = queryAll<any>(
    "SELECT * FROM vale_parcelas WHERE vendaId = ? AND deletedAt IS NULL ORDER BY vencimento DESC, numero DESC",
    [vendaId]
  );
  let restante = Math.round(Math.max(0, valorCredito) * 100) / 100;

  for (const parcela of parcelas) {
    if (restante <= 0.005) break;
    const valorAtual = Number(parcela.valor);
    const reducao = Math.round(Math.min(valorAtual, restante) * 100) / 100;
    const novoValor = Math.round(Math.max(0, valorAtual - reducao) * 100) / 100;
    restante = Math.round(Math.max(0, restante - reducao) * 100) / 100;

    if (novoValor <= 0.005) {
      execute(
        "UPDATE vale_parcelas SET deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
        [parcela.id]
      );
    } else {
      execute(
        "UPDATE vale_parcelas SET valor = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
        [novoValor, parcela.id]
      );
    }
  }

  const ativas = queryAll<any>(
    "SELECT id, vencimento FROM vale_parcelas WHERE vendaId = ? AND deletedAt IS NULL ORDER BY vencimento ASC, numero ASC",
    [vendaId]
  );
  ativas.forEach((parcela, index) => {
    execute("UPDATE vale_parcelas SET numero = ? WHERE id = ?", [index + 1, parcela.id]);
  });
  return ativas[0]?.vencimento || null;
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
  res.json({
    status: "ok",
    version: SYSTEM_VERSION,
    startedAt: SERVER_STARTED_AT,
    capabilities: { valeParcelas: true }
  });
});

app.get("/api/system/version", (_req, res) => {
  res.json({
    version: SYSTEM_VERSION,
    startedAt: SERVER_STARTED_AT,
    environment: IS_PRODUCTION ? "production" : "development",
    capabilities: { valeParcelas: true }
  });
});

function origemEhServidor(req: Request) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip || req.socket.remoteAddress || "");
}

app.get("/api/auth/status", (req, res) => {
  try {
    const gerente = getUsuarioAdministrador();
    res.json({
      configuracaoInicialPendente: !gerente?.pinHash,
      configuracaoPermitida: origemEhServidor(req),
      sessaoAtiva: Boolean(obterSessao(req)),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/auth/usuarios", (_req, res) => {
  try {
    res.json(queryAll(
      `SELECT id, nome, login, perfil FROM usuarios
       WHERE ativo = 1 AND pinHash IS NOT NULL
       ORDER BY CASE WHEN perfil = 'administrador' THEN 0 ELSE 1 END, nome`
    ));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/configurar-gerente", (req, res) => {
  try {
    if (!origemEhServidor(req)) {
      return res.status(403).json({ error: "A configuração inicial deve ser feita no computador servidor." });
    }
    const gerente = getUsuarioAdministrador();
    if (!gerente || gerente.pinHash) {
      return res.status(409).json({ error: "O acesso do gerente já foi configurado." });
    }
    const nome = String(req.body?.nome || "Gerente").trim();
    const senha = req.body?.senha;
    if (!nome || !senhaValida(senha)) {
      return res.status(400).json({ error: "Informe o nome e uma senha de 4 a 64 caracteres." });
    }
    const protegida = gerarHashPin(String(senha));
    execute(
      `UPDATE usuarios SET nome = ?, login = 'gerente', pinHash = ?, pinSalt = ?,
       deveTrocarSenha = 0, ativo = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [nome, protegida.hash, protegida.salt, gerente.id]
    );
    registrarAuditoria(gerente.id, "acesso_gerente_configurado", "usuario", gerente.id, { origem: req.ip || null });
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const login = String(req.body?.login || "").trim().toLowerCase();
    const senha = req.body?.senha;
    const chaveTentativa = `${req.ip || "local"}::${login}`;
    const tentativa = tentativasLogin.get(chaveTentativa);
    if (tentativa?.bloqueadoAte && tentativa.bloqueadoAte > Date.now()) {
      return res.status(429).json({ error: "Muitas tentativas. Aguarde 5 minutos e tente novamente." });
    }
    const usuario = queryOne<UsuarioAdministrador>(
      `SELECT id, nome, login, perfil, ativo, deveTrocarSenha, pinHash, pinSalt
       FROM usuarios WHERE LOWER(login) = ? AND ativo = 1`,
      [login]
    );
    if (!validarSenhaUsuario(usuario, senha)) {
      const quantidade = Number(tentativa?.quantidade || 0) + 1;
      tentativasLogin.set(chaveTentativa, {
        quantidade: quantidade >= 5 ? 0 : quantidade,
        bloqueadoAte: quantidade >= 5 ? Date.now() + 5 * 60 * 1000 : 0,
      });
      return res.status(403).json({ error: "Usuário ou senha inválidos." });
    }
    tentativasLogin.delete(chaveTentativa);
    execute("UPDATE usuarios SET ultimoAcesso = CURRENT_TIMESTAMP WHERE id = ?", [usuario!.id]);
    const autenticado = criarSessao(usuario!, res);
    registrarAuditoria(usuario!.id, "login_realizado", "usuario", usuario!.id, { origem: req.ip || null });
    res.json({ usuario: autenticado, expiraEm: new Date(Date.now() + DURACAO_SESSAO_MS).toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = tokenSessao(req);
  if (token) sessoesLocais.delete(token);
  limparCookieSessao(res);
  res.json({ success: true });
});

app.get("/api/auth/me", exigirAutenticacao, (req, res) => {
  res.json({ usuario: usuarioDaRequisicao(req) });
});

app.put("/api/auth/senha", exigirAutenticacao, (req, res) => {
  try {
    const sessao = obterSessao(req)!;
    const usuario = getUsuarioPorId(sessao.usuario.id);
    const senhaAtual = req.body?.senhaAtual;
    const novaSenha = req.body?.novaSenha;
    if (!usuario || (!usuario.deveTrocarSenha && !validarSenhaUsuario(usuario, senhaAtual))) {
      return res.status(403).json({ error: "Senha atual inválida." });
    }
    if (!senhaValida(novaSenha)) {
      return res.status(400).json({ error: "A nova senha deve possuir de 4 a 64 caracteres." });
    }
    const protegida = gerarHashPin(String(novaSenha));
    execute(
      `UPDATE usuarios SET pinHash = ?, pinSalt = ?, deveTrocarSenha = 0,
       updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [protegida.hash, protegida.salt, usuario.id]
    );
    sessao.usuario.deveTrocarSenha = 0;
    registrarAuditoria(usuario.id, "senha_alterada", "usuario", usuario.id);
    res.json({ success: true, usuario: sessao.usuario });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/reset-gerente", (req, res) => {
  try {
    if (!origemEhServidor(req) || req.body?.senhaPadrao !== SENHA_RESET_LOCAL) {
      return res.status(403).json({ error: "Recuperação permitida somente no computador servidor." });
    }
    const gerente = getUsuarioAdministrador();
    if (!gerente) return res.status(404).json({ error: "Gerente não encontrado." });
    const protegida = gerarHashPin(SENHA_RESET_LOCAL);
    execute(
      `UPDATE usuarios SET login = 'gerente', pinHash = ?, pinSalt = ?, deveTrocarSenha = 1,
       ativo = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [protegida.hash, protegida.salt, gerente.id]
    );
    invalidarSessoesUsuario();
    registrarAuditoria(gerente.id, "senha_gerente_redefinida_localmente", "usuario", gerente.id, { origem: req.ip || null });
    res.json({
      success: true,
      login: "gerente",
      senhaTemporaria: SENHA_RESET_LOCAL,
      mensagem: "Senha redefinida. Entre como gerente e cadastre uma nova senha.",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/api", exigirAutenticacao);
app.use("/api", (req, res, next) => {
  if (usuarioDaRequisicao(req)?.deveTrocarSenha) {
    return res.status(403).json({ error: "Troque a senha temporária antes de usar o sistema." });
  }
  next();
});
app.use(["/api/backups", "/api/usuarios"], exigirGerente);
app.use("/api", (req, res, next) => {
  const operacaoGerencial = req.method === "DELETE"
    || /\/(cancelar|devolucoes)(\/|$)/.test(req.path);
  if (operacaoGerencial) return exigirGerente(req, res, next);
  next();
});

app.get("/api/usuarios", (_req, res) => {
  try {
    res.json(queryAll(
      `SELECT id, nome, login, perfil, ativo, deveTrocarSenha, ultimoAcesso, createdAt, updatedAt
       FROM usuarios ORDER BY CASE WHEN perfil = 'administrador' THEN 0 ELSE 1 END, nome`
    ));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/usuarios", (req, res) => {
  try {
    const nome = String(req.body?.nome || "").trim();
    const login = String(req.body?.login || "").trim().toLowerCase();
    const senha = req.body?.senha;
    if (!nome || !/^[a-z0-9._-]{3,30}$/.test(login) || !senhaValida(senha)) {
      return res.status(400).json({ error: "Informe nome, login válido e senha de 4 a 64 caracteres." });
    }
    if (queryOne("SELECT id FROM usuarios WHERE LOWER(login) = ?", [login])) {
      return res.status(409).json({ error: "Este login já está em uso." });
    }
    const id = "usu_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const protegida = gerarHashPin(String(senha));
    execute(
      `INSERT INTO usuarios (id, nome, login, perfil, pinHash, pinSalt, deveTrocarSenha, ativo)
       VALUES (?, ?, ?, 'vendedor', ?, ?, 1, 1)`,
      [id, nome, login, protegida.hash, protegida.salt]
    );
    registrarAuditoria(usuarioDaRequisicao(req)?.id || null, "vendedor_cadastrado", "usuario", id, { nome, login });
    res.status(201).json(queryOne("SELECT id, nome, login, perfil, ativo, deveTrocarSenha FROM usuarios WHERE id = ?", [id]));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/usuarios/:id", (req, res) => {
  try {
    const atual = queryOne<UsuarioAdministrador>(
      `SELECT id, nome, login, perfil, ativo, deveTrocarSenha, pinHash, pinSalt FROM usuarios WHERE id = ?`,
      [req.params.id]
    );
    if (!atual) return res.status(404).json({ error: "Usuário não encontrado." });
    const nome = String(req.body?.nome || atual.nome).trim();
    const login = String(req.body?.login || atual.login || "").trim().toLowerCase();
    const ativo = atual.perfil === "administrador" ? 1 : req.body?.ativo === false || req.body?.ativo === 0 ? 0 : 1;
    if (!nome || !/^[a-z0-9._-]{3,30}$/.test(login)) {
      return res.status(400).json({ error: "Informe nome e login válido." });
    }
    const duplicado = queryOne("SELECT id FROM usuarios WHERE LOWER(login) = ? AND id <> ?", [login, atual.id]);
    if (duplicado) return res.status(409).json({ error: "Este login já está em uso." });
    execute(
      `UPDATE usuarios SET nome = ?, login = ?, ativo = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [nome, login, ativo, atual.id]
    );
    if (senhaValida(req.body?.novaSenha)) {
      const protegida = gerarHashPin(String(req.body.novaSenha));
      execute(
        `UPDATE usuarios SET pinHash = ?, pinSalt = ?, deveTrocarSenha = 1,
         updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [protegida.hash, protegida.salt, atual.id]
      );
      invalidarSessoesUsuario(atual.id);
    }
    if (!ativo) invalidarSessoesUsuario(atual.id);
    registrarAuditoria(usuarioDaRequisicao(req)?.id || null, "usuario_atualizado", "usuario", atual.id, { nome, login, ativo });
    res.json(queryOne("SELECT id, nome, login, perfil, ativo, deveTrocarSenha, ultimoAcesso FROM usuarios WHERE id = ?", [atual.id]));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/usuarios/:id", (req, res) => {
  try {
    const usuario = queryOne<UsuarioAdministrador>(
      `SELECT id, nome, login, perfil, ativo, deveTrocarSenha, pinHash, pinSalt FROM usuarios WHERE id = ?`,
      [req.params.id]
    );
    if (!usuario) return res.status(404).json({ error: "Usuário não encontrado." });
    if (usuario.perfil === "administrador") {
      return res.status(409).json({ error: "O gerente principal não pode ser removido." });
    }
    execute("UPDATE usuarios SET ativo = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [usuario.id]);
    invalidarSessoesUsuario(usuario.id);
    registrarAuditoria(usuarioDaRequisicao(req)?.id || null, "vendedor_desativado", "usuario", usuario.id, { nome: usuario.nome });
    res.json({ success: true });
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

app.put("/api/config", exigirGerente, (req, res) => {
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
    if (req.body?.finalidade === "alterar_preco") {
      registrarAuditoria(usuario.id, "edicao_preco_desbloqueada", "preco_em_edicao", null, {
        origem: req.ip || null
      });
    }

    res.json({ valido: true, usuario: { id: usuario.id, nome: usuario.nome } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/seguranca/admin-pin", exigirGerente, (req, res) => {
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
    if (!senhaValida(novoPin)) {
      return res.status(400).json({ error: "A nova senha deve possuir de 4 a 64 caracteres." });
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
      "SELECT COALESCE(SUM(totalLiquido), 0) as total FROM vendas WHERE clienteId = ? AND status <> 'cancelada' AND deletedAt IS NULL",
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
         (
           iv.total
           - CASE WHEN v.subtotal > 0 THEN v.desconto * (iv.total / v.subtotal) ELSE 0 END
           - iv.custoTotal
         ) * ((iv.quantidade - COALESCE(dev.quantidade, 0)) / NULLIF(iv.quantidade, 0))
       ), 0) as total
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       LEFT JOIN (
         SELECT itemVendaId, SUM(quantidade) AS quantidade
         FROM itens_devolucao
         GROUP BY itemVendaId
       ) dev ON dev.itemVendaId = iv.id
        WHERE v.clienteId = ? AND v.status <> 'cancelada' AND v.deletedAt IS NULL`,
      [id]
    );

    // 5. Produtos mais comprados (ranking)
    const produtosMaisComprados = queryAll<any>(
      `SELECT iv.produtoId, iv.descricao,
              COALESCE(SUM(
                iv.total * ((iv.quantidade - COALESCE(dev.quantidade, 0)) / NULLIF(iv.quantidade, 0))
              ), 0) as totalValor
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       LEFT JOIN (
         SELECT itemVendaId, SUM(quantidade) AS quantidade
         FROM itens_devolucao
         GROUP BY itemVendaId
       ) dev ON dev.itemVendaId = iv.id
        WHERE v.clienteId = ? AND v.status <> 'cancelada' AND v.deletedAt IS NULL
       GROUP BY iv.produtoId, iv.descricao
       HAVING SUM(iv.quantidade - COALESCE(dev.quantidade, 0)) > 0.005
       ORDER BY totalValor DESC
       LIMIT 5`,
      [id]
    );

    // 6. Histórico de vendas
    const vendas = queryAll<any>(
      "SELECT * FROM vendas WHERE clienteId = ? AND deletedAt IS NULL ORDER BY numeroSequencial DESC",
      [id]
    );

    // Carrega itens, parcelas, instrumentos e devoluções para que a ficha do
    // cliente preserve todo o histórico financeiro da venda.
    for (const v of vendas) {
      carregarDetalhesVenda(v);
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

    const produtosSemFornecedor = queryAll<any>(
      `SELECT
         cph.clienteId,
         cph.produtoId,
         NULL AS fornecedorId,
         NULL AS fornecedorReferencia,
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

    const produtosPorFornecedor = queryAll<any>(
      `SELECT
         cpf.clienteId,
         cpf.produtoId,
         cpf.fornecedorId,
         f.referencia AS fornecedorReferencia,
         cpf.ultimoPreco,
         cpf.ultimaQuantidade,
         cpf.ultimaUnidade,
         cpf.vezesComprado,
         cpf.ultimaCompraEm,
         cpf.precoAutorizado,
         p.nome,
         p.codigo,
         p.unidade,
         COALESCE(fp.precoVendaFornecedor, p.precoVendaPadrao) AS precoVendaPadrao,
         COALESCE(fp.custoFornecedor, p.custoPadrao) AS custoPadrao
       FROM cliente_produto_fornecedor_precos cpf
       JOIN produtos p ON p.id = cpf.produtoId
       JOIN fornecedores f ON f.id = cpf.fornecedorId
       JOIN fornecedor_produtos fp ON fp.produtoId = cpf.produtoId
         AND fp.fornecedorId = cpf.fornecedorId
       WHERE cpf.clienteId = ?
         AND cpf.oculto = 0
         AND fp.ativo = 1
         AND f.ativo = 1
         AND f.deletedAt IS NULL
         AND p.ativo = 1
         AND p.deletedAt IS NULL`,
      [req.params.id]
    );
    const produtos = [...produtosSemFornecedor, ...produtosPorFornecedor].sort((a, b) =>
      String(b.ultimaCompraEm || "").localeCompare(String(a.ultimaCompraEm || ""))
      || Number(b.vezesComprado || 0) - Number(a.vezesComprado || 0)
      || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
      || String(a.fornecedorReferencia || "").localeCompare(String(b.fornecedorReferencia || ""), "pt-BR")
    );
    res.json(produtos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/clientes/:id/orcamento-padrao", (req, res) => {
  try {
    const cliente = queryOne("SELECT id FROM clientes WHERE id = ? AND deletedAt IS NULL", [req.params.id]);
    if (!cliente) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    const itens = queryAll<any>(
      `SELECT * FROM (
         SELECT
           cph.produtoId,
           NULL AS fornecedorId,
           NULL AS fornecedorReferencia,
           p.nome,
           p.codigo,
           p.unidade,
           0 AS quantidade,
           COALESCE(cph.precoAutorizado, cph.ultimoPreco, p.precoVendaPadrao) AS precoUnitario,
           0 AS faltante,
           CASE WHEN cph.precoAutorizado IS NULL THEN 0 ELSE 1 END AS personalizado,
           cph.ultimaCompraEm
         FROM cliente_produtos_habituais cph
         JOIN produtos p ON p.id = cph.produtoId
         WHERE cph.clienteId = ?
           AND cph.oculto = 0
           AND p.ativo = 1
           AND p.deletedAt IS NULL
         UNION ALL
         SELECT
           cpf.produtoId,
           cpf.fornecedorId,
           f.referencia AS fornecedorReferencia,
           p.nome,
           p.codigo,
           p.unidade,
           0 AS quantidade,
           COALESCE(cpf.precoAutorizado, cpf.ultimoPreco, fp.precoVendaFornecedor, p.precoVendaPadrao) AS precoUnitario,
           0 AS faltante,
           CASE WHEN cpf.precoAutorizado IS NULL THEN 0 ELSE 1 END AS personalizado,
           cpf.ultimaCompraEm
         FROM cliente_produto_fornecedor_precos cpf
         JOIN produtos p ON p.id = cpf.produtoId
         JOIN fornecedor_produtos fp ON fp.produtoId = cpf.produtoId
           AND fp.fornecedorId = cpf.fornecedorId AND fp.ativo = 1
         JOIN fornecedores f ON f.id = cpf.fornecedorId
         WHERE cpf.clienteId = ?
           AND cpf.oculto = 0
           AND p.ativo = 1
           AND p.deletedAt IS NULL
           AND f.ativo = 1
           AND f.deletedAt IS NULL
       )
       ORDER BY ultimaCompraEm DESC, nome ASC, fornecedorReferencia ASC`,
      [req.params.id, req.params.id]
    );

    res.json(itens);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/clientes/:id/orcamento-padrao", (req, res) => {
  try {
    const { id } = req.params;
    const cliente = queryOne("SELECT id FROM clientes WHERE id = ? AND deletedAt IS NULL", [id]);
    if (!cliente) return res.status(404).json({ error: "Cliente não encontrado." });

    const administrador = getUsuarioAdministrador();
    if (!administrador?.pinHash) {
      return res.status(428).json({ error: "Configure o PIN administrativo antes de alterar a lista do cliente." });
    }
    const autorizador = validarPinAdministrador(req.body?.pin);
    if (!autorizador) {
      return res.status(403).json({ error: "PIN administrativo inválido. A lista não foi alterada." });
    }
    const itens = req.body?.items;
    if (!Array.isArray(itens)) {
      return res.status(400).json({ error: "Informe os itens da lista do cliente." });
    }

    runInTransaction(() => {
      execute("DELETE FROM cliente_orcamento_itens WHERE clienteId = ?", [id]);
      for (const item of itens) {
        const produto = queryOne<any>(
          `SELECT p.id, p.precoVendaPadrao
           FROM produtos p
           JOIN cliente_produtos_habituais cph ON cph.produtoId = p.id AND cph.clienteId = ?
           WHERE p.id = ? AND p.deletedAt IS NULL`,
          [id, item.produtoId]
        );
        if (!produto) throw erroHttp("Produto inválido para a lista habitual do cliente.", 400);
        const quantidade = Number(item.quantidade);
        const precoUnitario = Number(item.precoUnitario);
        if (!Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(precoUnitario) || precoUnitario < 0) {
          throw erroHttp("Quantidade ou preço inválido na lista do cliente.", 400);
        }
        execute(
          `INSERT INTO cliente_orcamento_itens
             (clienteId, produtoId, quantidade, precoUnitario, faltante, updatedAt)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(clienteId, produtoId) DO UPDATE SET
             quantidade = excluded.quantidade,
             precoUnitario = excluded.precoUnitario,
             faltante = excluded.faltante,
             updatedAt = CURRENT_TIMESTAMP`,
          [id, item.produtoId, quantidade, precoUnitario, item.faltante ? 1 : 0]
        );
      }
    });

    registrarAuditoria(autorizador.id, "orcamento_padrao_cliente_atualizado", "cliente", id, {
      quantidadeItens: itens.length
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put("/api/clientes/:clienteId/produtos/:produtoId/preco", (req, res) => {
  try {
    const { clienteId, produtoId } = req.params;
    const fornecedorId = req.body?.fornecedorId ? String(req.body.fornecedorId) : null;
    if (!queryOne("SELECT id FROM clientes WHERE id = ? AND deletedAt IS NULL AND ativo = 1", [clienteId])) {
      return res.status(404).json({ error: "Cliente não encontrado ou inativo." });
    }
    const preco = Number(req.body?.preco);
    if (!Number.isFinite(preco) || preco < 0) {
      return res.status(400).json({ error: "Informe um preço personalizado válido." });
    }
    const administrador = getUsuarioAdministrador();
    if (!administrador?.pinHash) {
      return res.status(428).json({ error: "Configure o PIN administrativo antes de alterar preços." });
    }
    const autorizador = validarPinAdministrador(req.body?.pin);
    if (!autorizador) {
      return res.status(403).json({ error: "PIN administrativo inválido. O preço não foi alterado." });
    }
    const produto = queryOne<{ precoVendaPadrao: number }>(
      "SELECT precoVendaPadrao FROM produtos WHERE id = ? AND deletedAt IS NULL AND ativo = 1",
      [produtoId]
    );
    if (!produto) return res.status(404).json({ error: "Produto não encontrado ou inativo." });
    const contexto = resolverPrecoClienteProdutoFornecedor(clienteId, {
      id: produtoId,
      precoVendaPadrao: produto.precoVendaPadrao
    }, fornecedorId);
    const precoAnterior = contexto.precoMinimoSemPin;

    salvarPrecoAutorizadoCliente(clienteId, produtoId, preco, fornecedorId);
    registrarAuditoria(autorizador.id, "preco_cliente_atualizado", "cliente", clienteId, {
      produtoId,
      fornecedorId,
      fornecedorReferencia: contexto.fornecedorReferencia,
      precoAnterior,
      precoAutorizado: preco,
      origem: String(req.body?.origem || "cadastro_cliente"),
      documentoId: req.body?.documentoId || null
    });
    res.json({ precoAutorizado: preco, precoAnterior, autorizador: autorizador.nome });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.delete("/api/clientes/:clienteId/produtos/:produtoId", (req, res) => {
  try {
    const { clienteId, produtoId } = req.params;
    const fornecedorId = req.body?.fornecedorId ? String(req.body.fornecedorId) : null;
    const administrador = getUsuarioAdministrador();
    if (!administrador?.pinHash) {
      return res.status(428).json({ error: "Configure o PIN administrativo antes de excluir preços de clientes." });
    }
    const autorizador = validarPinAdministrador(req.body?.pin);
    if (!autorizador) {
      return res.status(403).json({ error: "PIN administrativo inválido. O preço não foi excluído." });
    }
    const resultado = runInTransaction(() => {
      const relacionamento = fornecedorId
        ? queryOne(
            `SELECT clienteId, produtoId
             FROM cliente_produto_fornecedor_precos
             WHERE clienteId = ? AND produtoId = ? AND fornecedorId = ?`,
            [clienteId, produtoId, fornecedorId]
          )
        : queryOne(
            `SELECT clienteId, produtoId
             FROM cliente_produtos_habituais
             WHERE clienteId = ? AND produtoId = ?`,
            [clienteId, produtoId]
          );
      if (!relacionamento) {
        throw erroHttp("Produto não encontrado nos preços deste cliente.", 404);
      }
      if (fornecedorId) {
        execute(
          `UPDATE cliente_produto_fornecedor_precos
           SET oculto = 1, updatedAt = CURRENT_TIMESTAMP
           WHERE clienteId = ? AND produtoId = ? AND fornecedorId = ?`,
          [clienteId, produtoId, fornecedorId]
        );
      } else {
        execute(
          `UPDATE cliente_produtos_habituais
           SET oculto = 1, updatedAt = CURRENT_TIMESTAMP
           WHERE clienteId = ? AND produtoId = ?`,
          [clienteId, produtoId]
        );
        execute(
          "DELETE FROM cliente_orcamento_itens WHERE clienteId = ? AND produtoId = ?",
          [clienteId, produtoId]
        );
      }
      const abertos = queryAll<{ id: string }>(
        `SELECT id FROM orcamentos
         WHERE clienteId = ? AND status = 'aberto' AND deletedAt IS NULL`,
        [clienteId]
      );
      for (const orcamento of abertos) {
        execute(
          fornecedorId
            ? "DELETE FROM itens_orcamento WHERE orcamentoId = ? AND produtoId = ? AND fornecedorId = ?"
            : "DELETE FROM itens_orcamento WHERE orcamentoId = ? AND produtoId = ? AND fornecedorId IS NULL",
          fornecedorId ? [orcamento.id, produtoId, fornecedorId] : [orcamento.id, produtoId]
        );
        const totais = queryOne<{ subtotal: number }>(
          "SELECT COALESCE(SUM(total), 0) AS subtotal FROM itens_orcamento WHERE orcamentoId = ?",
          [orcamento.id]
        );
        const atual = queryOne<{ desconto: number }>(
          "SELECT desconto FROM orcamentos WHERE id = ?",
          [orcamento.id]
        );
        const subtotal = Number(totais?.subtotal || 0);
        const desconto = Math.min(Number(atual?.desconto || 0), subtotal);
        execute(
          `UPDATE orcamentos
           SET subtotal = ?, desconto = ?, totalLiquido = ?, updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [subtotal, desconto, subtotal - desconto, orcamento.id]
        );
      }
      return true;
    });
    registrarAuditoria(autorizador.id, "produto_cliente_removido", "cliente", clienteId, {
      produtoId,
      fornecedorId
    });
    res.json({ success: resultado });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
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
    const referencia = String(req.body?.referencia || "").trim().toUpperCase();
    if (!nome) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }
    if (!referencia) {
      return res.status(400).json({ error: "A referência do fornecedor é obrigatória." });
    }
    if (referencia.length > 4) {
      return res.status(400).json({ error: "A referência do fornecedor deve possuir no máximo 4 caracteres." });
    }
    const referenciaExistente = queryOne(
      "SELECT id FROM fornecedores WHERE LOWER(referencia) = LOWER(?) AND deletedAt IS NULL",
      [referencia]
    );
    if (referenciaExistente) {
      return res.status(409).json({ error: "Já existe um fornecedor com esta referência." });
    }
    const id = "for_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    execute(
      `INSERT INTO fornecedores (id, nome, referencia, telefone, documento, observacoes, ativo, isWhatsapp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nome, referencia, telefone || null, documento || null, observacoes || null, ativo !== undefined ? (ativo ? 1 : 0) : 1, isWhatsapp !== undefined ? (isWhatsapp ? 1 : 0) : 0]
    );
    const supplier = queryOne("SELECT * FROM fornecedores WHERE id = ?", [id]);
    res.status(201).json(supplier);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/fornecedores/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { nome, telefone, documento, observacoes, ativo, isWhatsapp } = req.body;
    const referencia = String(req.body?.referencia || "").trim().toUpperCase();
    if (!nome) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }
    if (!referencia) {
      return res.status(400).json({ error: "A referência do fornecedor é obrigatória." });
    }
    if (referencia.length > 4) {
      return res.status(400).json({ error: "A referência do fornecedor deve possuir no máximo 4 caracteres." });
    }
    const referenciaExistente = queryOne(
      "SELECT id FROM fornecedores WHERE LOWER(referencia) = LOWER(?) AND id <> ? AND deletedAt IS NULL",
      [referencia, id]
    );
    if (referenciaExistente) {
      return res.status(409).json({ error: "Já existe outro fornecedor com esta referência." });
    }
    execute(
      `UPDATE fornecedores
       SET nome = ?, referencia = ?, telefone = ?, documento = ?, observacoes = ?, ativo = ?, isWhatsapp = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND deletedAt IS NULL`,
      [nome, referencia, telefone || null, documento || null, observacoes || null, ativo ? 1 : 0, isWhatsapp !== undefined ? (isWhatsapp ? 1 : 0) : 0, id]
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
      `SELECT fp.fornecedorId, fp.produtoId, f.referencia AS fornecedorReferencia, fp.custoFornecedor,
              fp.precoVendaFornecedor, fp.observacao, fp.ativo,
              p.nome as produtoNome, p.codigo as produtoCodigo, p.unidade, p.precoVendaPadrao,
              (SELECT ic.custoUnitario
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL
               ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1) as ultimoCustoCompra,
              COALESCE(fp.custoFornecedor, (SELECT ic.custoUnitario
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL
               ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1), p.custoPadrao, 0) as ultimoCusto,
              (SELECT c.data
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL
               ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1) as ultimaCompraEm,
              (SELECT COUNT(DISTINCT c.id)
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL) as comprasRealizadas
       FROM fornecedor_produtos fp
       JOIN produtos p ON p.id = fp.produtoId
       JOIN fornecedores f ON f.id = fp.fornecedorId
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

    const custoFornecedor = Number(req.body?.custoFornecedor ?? 0);
    const precoVendaFornecedor = Number(req.body?.precoVendaFornecedor ?? 0);
    if (!Number.isFinite(custoFornecedor) || custoFornecedor < 0 || !Number.isFinite(precoVendaFornecedor) || precoVendaFornecedor < 0) {
      return res.status(400).json({ error: "Custo e preço-base do fornecedor devem ser valores válidos." });
    }
    execute(
      `INSERT INTO fornecedor_produtos
         (fornecedorId, produtoId, custoFornecedor, precoVendaFornecedor, observacao, ativo)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(fornecedorId, produtoId) DO UPDATE SET
         custoFornecedor = excluded.custoFornecedor,
         precoVendaFornecedor = excluded.precoVendaFornecedor,
         observacao = excluded.observacao,
         ativo = 1,
         updatedAt = CURRENT_TIMESTAMP`,
      [
        req.params.id,
        req.body.produtoId,
        custoFornecedor,
        precoVendaFornecedor,
        req.body.observacao || null
      ]
    );
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/fornecedores/:id/produtos/:produtoId", (req, res) => {
  try {
    const resultado = execute(
      `UPDATE fornecedor_produtos
       SET ativo = 0, updatedAt = CURRENT_TIMESTAMP
       WHERE fornecedorId = ? AND produtoId = ? AND ativo = 1`,
      [req.params.id, req.params.produtoId]
    );
    if (!resultado.changes) return res.status(404).json({ error: "Associação ativa não encontrada." });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 5. PRODUTOS
app.get("/api/produtos", (req, res) => {
  try {
    const rows = queryAll<any>(`
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
    const fornecedores = queryAll<any>(`
      SELECT
        fp.produtoId,
        fp.fornecedorId,
        f.nome AS fornecedorNome,
        f.referencia AS fornecedorReferencia,
        fp.custoFornecedor,
        fp.precoVendaFornecedor,
        (
          SELECT ic.custoUnitario
          FROM itens_compra ic
          JOIN compras c ON c.id = ic.compraId
          WHERE ic.produtoId = fp.produtoId
            AND c.fornecedorId = fp.fornecedorId
            AND c.deletedAt IS NULL
          ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC
          LIMIT 1
        ) AS ultimoCustoCompra,
        COALESCE(
          fp.custoFornecedor,
          (
            SELECT ic.custoUnitario
            FROM itens_compra ic
            JOIN compras c ON c.id = ic.compraId
            WHERE ic.produtoId = fp.produtoId
              AND c.fornecedorId = fp.fornecedorId
              AND c.deletedAt IS NULL
            ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC
            LIMIT 1
          ),
          0
        ) AS ultimoCusto,
        (
          SELECT c.data
          FROM itens_compra ic
          JOIN compras c ON c.id = ic.compraId
          WHERE ic.produtoId = fp.produtoId
            AND c.fornecedorId = fp.fornecedorId
            AND c.deletedAt IS NULL
          ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC
          LIMIT 1
        ) AS ultimaCompraEm
      FROM fornecedor_produtos fp
      JOIN fornecedores f ON f.id = fp.fornecedorId
      WHERE fp.ativo = 1 AND f.ativo = 1 AND f.deletedAt IS NULL
      ORDER BY f.nome ASC
    `);
    const fornecedoresPorProduto = new Map<string, any[]>();
    for (const fornecedor of fornecedores) {
      const lista = fornecedoresPorProduto.get(fornecedor.produtoId) || [];
      lista.push(fornecedor);
      fornecedoresPorProduto.set(fornecedor.produtoId, lista);
    }
    res.json(rows.map((produto) => ({
      ...produto,
      fornecedores: fornecedoresPorProduto.get(produto.id) || []
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/produtos/:id/fornecedores", (req, res) => {
  try {
    const produto = queryOne("SELECT id FROM produtos WHERE id = ? AND deletedAt IS NULL", [req.params.id]);
    if (!produto) return res.status(404).json({ error: "Produto não encontrado." });

    const fornecedores = queryAll(
      `SELECT fp.fornecedorId, fp.produtoId, f.referencia AS fornecedorReferencia, fp.custoFornecedor,
              fp.precoVendaFornecedor, fp.observacao, fp.ativo,
              f.nome as fornecedorNome, f.telefone as fornecedorTelefone,
              (SELECT ic.custoUnitario
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL
               ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1) as ultimoCustoCompra,
              COALESCE(fp.custoFornecedor, (SELECT ic.custoUnitario
               FROM itens_compra ic JOIN compras c ON c.id = ic.compraId
               WHERE c.fornecedorId = fp.fornecedorId AND ic.produtoId = fp.produtoId AND c.deletedAt IS NULL
               ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1), 0) as ultimoCusto,
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

interface ConfiguracaoFornecedorProduto {
  fornecedorId: string;
  custoFornecedor: number;
  precoVendaFornecedor: number;
}

function normalizarConfiguracoesFornecedores(
  body: any,
  custoPadrao: number,
  precoVendaPadrao: number
): ConfiguracaoFornecedorProduto[] | null {
  const possuiConfiguracoes = Array.isArray(body?.fornecedores);
  const entradas = possuiConfiguracoes
    ? body.fornecedores
    : Array.isArray(body?.fornecedorIds)
      ? body.fornecedorIds.map((fornecedorId: unknown) => ({
          fornecedorId,
          custoFornecedor: custoPadrao,
          precoVendaFornecedor: precoVendaPadrao
        }))
      : null;
  if (entradas === null) return null;

  const configuracoes: ConfiguracaoFornecedorProduto[] = [];
  const ids = new Set<string>();
  for (const entrada of entradas) {
    const fornecedorId = String(entrada?.fornecedorId || "").trim();
    const custoFornecedor = Number(entrada?.custoFornecedor);
    const precoVendaFornecedor = Number(entrada?.precoVendaFornecedor);
    if (!fornecedorId) throw erroHttp("Selecione o fornecedor em todas as linhas.", 400);
    if (ids.has(fornecedorId)) throw erroHttp("O mesmo fornecedor não pode aparecer mais de uma vez no produto.", 400);
    if (!Number.isFinite(custoFornecedor) || custoFornecedor < 0) {
      throw erroHttp("Informe um custo válido em todas as linhas de fornecedor.", 400);
    }
    if (!Number.isFinite(precoVendaFornecedor) || precoVendaFornecedor < 0) {
      throw erroHttp("Informe um preço-base de venda válido em todas as linhas de fornecedor.", 400);
    }
    ids.add(fornecedorId);
    configuracoes.push({
      fornecedorId,
      custoFornecedor,
      precoVendaFornecedor
    });
  }

  if (configuracoes.length > 0) {
    const fornecedoresValidos = queryAll<{ id: string }>(
      `SELECT id FROM fornecedores
       WHERE id IN (${configuracoes.map(() => "?").join(",")})
         AND deletedAt IS NULL AND ativo = 1`,
      configuracoes.map((item) => item.fornecedorId)
    );
    if (fornecedoresValidos.length !== configuracoes.length) {
      throw erroHttp("Um ou mais fornecedores selecionados são inválidos.", 400);
    }
  }
  return configuracoes;
}

function salvarConfiguracoesFornecedoresProduto(
  produtoId: string,
  configuracoes: ConfiguracaoFornecedorProduto[]
) {
  execute("UPDATE fornecedor_produtos SET ativo = 0, updatedAt = CURRENT_TIMESTAMP WHERE produtoId = ?", [produtoId]);
  for (const configuracao of configuracoes) {
    execute(
      `INSERT INTO fornecedor_produtos
         (fornecedorId, produtoId, custoFornecedor, precoVendaFornecedor, ativo)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(fornecedorId, produtoId) DO UPDATE SET
         custoFornecedor = excluded.custoFornecedor,
         precoVendaFornecedor = excluded.precoVendaFornecedor,
         ativo = 1,
         updatedAt = CURRENT_TIMESTAMP`,
      [
        configuracao.fornecedorId,
        produtoId,
        configuracao.custoFornecedor,
        configuracao.precoVendaFornecedor
      ]
    );
  }
}

app.post("/api/produtos", (req, res) => {
  try {
    const { nome, codigo, unidade, precoVendaPadrao, custoPadrao, ativo } = req.body;
    if (!nome || !unidade) {
      return res.status(400).json({ error: "Nome e unidade são obrigatórios." });
    }
    if (!Number.isFinite(Number(precoVendaPadrao)) || Number(precoVendaPadrao) < 0) {
      return res.status(400).json({ error: "O preço de venda não pode ser negativo." });
    }
    if (!Number.isFinite(Number(custoPadrao)) || Number(custoPadrao) < 0) {
      return res.status(400).json({ error: "O preço de custo não pode ser negativo." });
    }
    const configuracoesFornecedores = normalizarConfiguracoesFornecedores(
      req.body,
      Number(custoPadrao),
      Number(precoVendaPadrao)
    ) || [];
    const id = "prod_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    runInTransaction(() => {
      execute(
        `INSERT INTO produtos (id, nome, codigo, unidade, precoVendaPadrao, custoPadrao, custoManual, custoOrigem, unidadeCompra, unidadeVenda, fatorConversao, venderUnidadeCompra, ativo)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?)`,
        [
          id,
          nome,
          codigo || null,
          unidade,
          Number(precoVendaPadrao),
          Number(custoPadrao),
          Number(custoPadrao),
          unidade,
          unidade,
          1,
          0,
          ativo !== undefined ? (ativo ? 1 : 0) : 1
        ]
      );
      salvarConfiguracoesFornecedoresProduto(id, configuracoesFornecedores);
    });
    const product = queryOne("SELECT * FROM produtos WHERE id = ?", [id]);
    res.status(201).json(product);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put("/api/produtos/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { nome, codigo, unidade, precoVendaPadrao, custoPadrao, ativo } = req.body;
    if (!nome || !unidade) {
      return res.status(400).json({ error: "Nome e unidade são obrigatórios." });
    }
    if (!Number.isFinite(Number(precoVendaPadrao)) || Number(precoVendaPadrao) < 0) {
      return res.status(400).json({ error: "O preço de venda não pode ser negativo." });
    }
    if (!Number.isFinite(Number(custoPadrao)) || Number(custoPadrao) < 0) {
      return res.status(400).json({ error: "O preço de custo não pode ser negativo." });
    }
    const configuracoesFornecedores = normalizarConfiguracoesFornecedores(
      req.body,
      Number(custoPadrao),
      Number(precoVendaPadrao)
    );
    runInTransaction(() => {
      execute(
        `UPDATE produtos
         SET nome = ?, codigo = ?, unidade = ?, precoVendaPadrao = ?, custoPadrao = ?, custoManual = ?, custoOrigem = 'manual',
             unidadeCompra = ?, unidadeVenda = ?, fatorConversao = 1, venderUnidadeCompra = 0, ativo = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ? AND deletedAt IS NULL`,
        [
          nome,
          codigo || null,
          unidade,
          Number(precoVendaPadrao),
          Number(custoPadrao),
          Number(custoPadrao),
          unidade,
          unidade,
          ativo ? 1 : 0,
          id
        ]
      );
      if (configuracoesFornecedores !== null) {
        salvarConfiguracoesFornecedoresProduto(id, configuracoesFornecedores);
      }
    });
    const updated = queryOne("SELECT * FROM produtos WHERE id = ?", [id]);
    res.json(updated);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
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

// 5.1 ORÇAMENTOS
function carregarOrcamentoCompleto(id: string) {
  const orcamento = queryOne<any>(
    `SELECT o.*, c.nome AS clienteNome, c.telefone AS clienteTelefone, c.endereco AS clienteEndereco, c.documento AS clienteDocumento
     FROM orcamentos o
     JOIN clientes c ON c.id = o.clienteId
     WHERE o.id = ? AND o.deletedAt IS NULL`,
    [id]
  );
  if (!orcamento) return null;
  orcamento.items = queryAll<any>(
    `SELECT io.*, p.codigo AS referencia,
            COALESCE(
              NULLIF(io.fornecedorReferencia, ''),
              NULLIF(f.referencia, ''),
              (SELECT CASE WHEN COUNT(*) = 1 THEN MAX(fu.referencia) END
               FROM fornecedor_produtos fpu
               JOIN fornecedores fu ON fu.id = fpu.fornecedorId
               WHERE fpu.produtoId = io.produtoId AND fpu.ativo = 1
                 AND fu.ativo = 1 AND fu.deletedAt IS NULL)
            ) AS fornecedorReferenciaResolvida
     FROM itens_orcamento io
     LEFT JOIN produtos p ON p.id = io.produtoId
     LEFT JOIN fornecedores f ON f.id = io.fornecedorId
     WHERE io.orcamentoId = ?
     ORDER BY io.rowid ASC`,
    [id]
  ).map((item) => ({
    ...item,
    fornecedorReferencia: item.fornecedorReferenciaResolvida || item.fornecedorReferencia || null,
  }));
  return orcamento;
}

app.get("/api/clientes/:id/orcamento-vigente", (req, res) => {
  try {
    const vigente = queryOne<{ id: string }>(
      `SELECT id
       FROM orcamentos
       WHERE clienteId = ? AND status = 'aberto' AND deletedAt IS NULL
       ORDER BY numeroSequencial DESC
       LIMIT 1`,
      [req.params.id]
    );
    res.json(vigente ? carregarOrcamentoCompleto(vigente.id) : null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/orcamentos", (_req, res) => {
  try {
    const registros = queryAll<any>(
      `SELECT id
       FROM orcamentos
       WHERE deletedAt IS NULL
       ORDER BY numeroSequencial DESC`
    );
    res.json(registros.map((item) => carregarOrcamentoCompleto(item.id)));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/orcamentos/aberto", (_req, res) => {
  try {
    const aberto = queryOne<{ id: string }>(
      `SELECT id
       FROM orcamentos
       WHERE status = 'aberto' AND deletedAt IS NULL
       ORDER BY createdAt DESC
       LIMIT 1`
    );
    res.json(aberto ? carregarOrcamentoCompleto(aberto.id) : null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/orcamentos/proximo-numero", (_req, res) => {
  try {
    const resultado = queryOne<{ maxSeq: number }>(
      "SELECT COALESCE(MAX(numeroSequencial), 0) AS maxSeq FROM orcamentos"
    );
    res.json({ proximoNumero: Number(resultado?.maxSeq || 0) + 1 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/orcamentos", (req, res) => {
  try {
    const { id: idInformado, clienteId, data, validade, desconto, observacoes, items, autorizacaoPreco } = req.body;
    if (!clienteId || !data || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Informe cliente, data e ao menos um item para o orçamento." });
    }
    const variantesDoOrcamento = items.map((item: any) => ({
      produtoId: String(item?.produtoId || ""),
      chave: `${String(item?.produtoId || "")}::${String(item?.fornecedorId || "")}`
    }));
    if (variantesDoOrcamento.some((item: any) => !item.produtoId) || new Set(variantesDoOrcamento.map((item: any) => item.chave)).size !== variantesDoOrcamento.length) {
      return res.status(400).json({ error: "A mesma combinação de produto e fornecedor não pode aparecer duas vezes no orçamento." });
    }
    if (!queryOne("SELECT id FROM clientes WHERE id = ? AND deletedAt IS NULL", [clienteId])) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    const resultado = runInTransaction(() => {
      const existente = idInformado
        ? queryOne<any>("SELECT * FROM orcamentos WHERE id = ? AND deletedAt IS NULL", [idInformado])
        : queryOne<any>(
            `SELECT * FROM orcamentos
             WHERE clienteId = ? AND status = 'aberto' AND deletedAt IS NULL
             ORDER BY numeroSequencial DESC LIMIT 1`,
            [clienteId]
          );
      if (idInformado && !existente) {
        throw erroHttp("Orçamento não encontrado para edição.", 404);
      }
      if (existente && existente.clienteId !== clienteId) {
        throw erroHttp("O orçamento informado pertence a outro cliente.", 409);
      }
      if (existente && existente.status !== "aberto") {
        throw erroHttp("Somente um orçamento aberto pode ser alterado.", 409);
      }
      const orcamentoId = existente?.id || ("orc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16));
      let administradorAutorizador: UsuarioAdministrador | null = null;

      let subtotal = 0;
      const itensResolvidos = items.map((item: any) => {
        const produto = queryOne<any>("SELECT * FROM produtos WHERE id = ? AND deletedAt IS NULL", [item.produtoId]);
        if (!produto) throw erroHttp(`Produto não encontrado: ${item.produtoId}`, 404);
        const quantidade = Number(item.quantidade);
        const precoUnitario = Number(item.precoUnitario);
        const descontoItem = Number(item.desconto || 0);
        const unidade = String(item.unidade || produto.unidade);
        if (unidade !== produto.unidade) throw erroHttp(`${produto.nome} deve usar a unidade ${produto.unidade}.`, 400);
        if (!Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(precoUnitario) || precoUnitario < 0 || !Number.isFinite(descontoItem) || descontoItem < 0) {
          throw erroHttp(`Quantidade, preço ou desconto inválido para ${produto.nome}.`, 400);
        }
        const total = (quantidade * precoUnitario) - descontoItem;
        if (total < 0) throw erroHttp(`O desconto de ${produto.nome} é maior que o valor do item.`, 400);
        const contextoPreco = resolverPrecoClienteProdutoFornecedor(
          clienteId,
          produto,
          item.fornecedorId ? String(item.fornecedorId) : null
        );
        subtotal += total;
        return {
          id: "ito_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
          produtoId: produto.id,
          descricao: String(item.descricao || produto.nome),
          quantidade,
          unidade,
          precoUnitario,
          desconto: descontoItem,
          total,
          faltante: item.faltante ? 1 : 0,
          fornecedorId: contextoPreco.fornecedorId,
          fornecedorReferencia: contextoPreco.fornecedorReferencia,
          precoMinimoSemPin: contextoPreco.precoMinimoSemPin
        };
      });

      const descontoGeral = Number(desconto || 0);
      if (!Number.isFinite(descontoGeral) || descontoGeral < 0 || descontoGeral > subtotal) {
        throw erroHttp("O desconto do orçamento deve estar entre zero e o subtotal.", 400);
      }
      const totalLiquido = subtotal - descontoGeral;
      const fatorPrecoEfetivo = subtotal > 0 ? totalLiquido / subtotal : 1;
      const itensQueExigemAutorizacao = itensResolvidos
        .map((item) => ({ ...item, precoEfetivo: item.precoUnitario * fatorPrecoEfetivo }))
        .filter((item) => Math.abs(item.precoEfetivo - item.precoMinimoSemPin) > 0.005);
      if (itensQueExigemAutorizacao.length > 0) {
        const administrador = getUsuarioAdministrador();
        if (!administrador?.pinHash) {
          throw erroHttp("Configure o PIN administrativo antes de alterar preços.", 428);
        }
        administradorAutorizador = validarPinAdministrador(autorizacaoPreco?.pin);
        if (!administradorAutorizador) {
          throw erroHttp("Autorize o novo preço no campo do item antes de salvar o orçamento.", 403);
        }
      }

      if (existente) {
        execute(
          `UPDATE orcamentos
           SET clienteId = ?, data = ?, validade = ?, subtotal = ?, desconto = ?, totalLiquido = ?,
               observacoes = ?, updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [clienteId, data, validade || null, subtotal, descontoGeral, totalLiquido, observacoes || null, orcamentoId]
        );
        execute("DELETE FROM itens_orcamento WHERE orcamentoId = ?", [orcamentoId]);
      } else {
        const sequencia = queryOne<{ maxSeq: number }>(
          "SELECT COALESCE(MAX(numeroSequencial), 0) AS maxSeq FROM orcamentos"
        );
        execute(
          `INSERT INTO orcamentos
             (id, numeroSequencial, clienteId, data, validade, subtotal, desconto, totalLiquido, status, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aberto', ?)`,
          [
            orcamentoId,
            Number(sequencia?.maxSeq || 0) + 1,
            clienteId,
            data,
            validade || null,
            subtotal,
            descontoGeral,
            totalLiquido,
            observacoes || null
          ]
        );
      }

      for (const item of itensResolvidos) {
        execute(
          `INSERT INTO itens_orcamento
             (id, orcamentoId, produtoId, fornecedorId, fornecedorReferencia, descricao, quantidade, unidade, precoUnitario, desconto, total, faltante)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, orcamentoId, item.produtoId, item.fornecedorId, item.fornecedorReferencia, item.descricao, item.quantidade, item.unidade, item.precoUnitario, item.desconto, item.total, item.faltante]
        );
        salvarPrecoAutorizadoCliente(clienteId, item.produtoId, item.precoUnitario * fatorPrecoEfetivo, item.fornecedorId);
      }

      // O orçamento operacional é também a lista de pedido permanente deste
      // cliente. Ao converter em venda, a próxima conferência reabre desta base.
      execute("DELETE FROM cliente_orcamento_itens WHERE clienteId = ?", [clienteId]);
      for (const item of itensResolvidos) {
        execute(
          `INSERT INTO cliente_orcamento_itens
             (clienteId, produtoId, quantidade, precoUnitario, faltante, updatedAt)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(clienteId, produtoId) DO UPDATE SET
             quantidade = excluded.quantidade,
             precoUnitario = excluded.precoUnitario,
             faltante = excluded.faltante,
             updatedAt = CURRENT_TIMESTAMP`,
          [clienteId, item.produtoId, item.quantidade, item.precoUnitario, item.faltante]
        );
      }

      if (existente && administradorAutorizador) {
        registrarAuditoria(
          administradorAutorizador.id,
          "orcamento_alterado",
          "orcamento",
          orcamentoId,
          { clienteId, quantidadeItens: itensResolvidos.length }
        );
      }

      if (itensQueExigemAutorizacao.length > 0 && administradorAutorizador) {
        registrarAuditoria(
          administradorAutorizador.id,
          "preco_orcamento_autorizado",
          "orcamento",
          orcamentoId,
          {
            clienteId,
            itens: itensQueExigemAutorizacao.map((item) => ({
              produtoId: item.produtoId,
              precoAtualCliente: item.precoMinimoSemPin,
              precoOrcado: item.precoEfetivo
            }))
          }
        );
      }

      return orcamentoId;
    });

    res.status(201).json(carregarOrcamentoCompleto(resultado));
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/orcamentos/:id/cancelar", (req, res) => {
  try {
    const orcamento = queryOne<any>(
      "SELECT id, status FROM orcamentos WHERE id = ? AND deletedAt IS NULL",
      [req.params.id]
    );
    if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });
    if (orcamento.status !== "aberto") {
      return res.status(409).json({ error: "Somente o orçamento aberto pode ser cancelado." });
    }
    execute(
      "UPDATE orcamentos SET status = 'cancelado', updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/orcamentos/:id", (req, res) => {
  try {
    const orcamento = queryOne<any>(
      "SELECT id, clienteId FROM orcamentos WHERE id = ? AND deletedAt IS NULL",
      [req.params.id]
    );
    if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });
    runInTransaction(() => {
      execute(
        "UPDATE orcamentos SET deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
        [req.params.id]
      );
      execute("DELETE FROM cliente_orcamento_itens WHERE clienteId = ?", [orcamento.clienteId]);
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


function carregarDetalhesVenda(venda: any) {
  venda.items = queryAll<any>(
    `SELECT iv.*,
            p.codigo as referencia,
            COALESCE(
              NULLIF(iv.fornecedorReferencia, ''),
              NULLIF(f.referencia, ''),
              (SELECT CASE WHEN COUNT(*) = 1 THEN MAX(fu.referencia) END
               FROM fornecedor_produtos fpu
               JOIN fornecedores fu ON fu.id = fpu.fornecedorId
               WHERE fpu.produtoId = iv.produtoId AND fpu.ativo = 1
                 AND fu.ativo = 1 AND fu.deletedAt IS NULL)
            ) as fornecedorReferenciaResolvida,
            COALESCE((SELECT SUM(idv.quantidade) FROM itens_devolucao idv WHERE idv.itemVendaId = iv.id), 0) as quantidadeDevolvida,
            iv.quantidade - COALESCE((SELECT SUM(idv.quantidade) FROM itens_devolucao idv WHERE idv.itemVendaId = iv.id), 0) as quantidadeDisponivel
     FROM itens_venda iv
     LEFT JOIN produtos p ON p.id = iv.produtoId
     LEFT JOIN fornecedores f ON f.id = iv.fornecedorId
     WHERE iv.vendaId = ?`,
    [venda.id]
  ).map((item) => ({
    ...item,
    fornecedorReferencia: item.fornecedorReferenciaResolvida || item.fornecedorReferencia || null,
  }));
  venda.devolucoes = queryAll<any>(
    `SELECT * FROM devolucoes_venda WHERE vendaId = ? ORDER BY createdAt DESC`,
    [venda.id]
  );
  for (const devolucao of venda.devolucoes) {
    devolucao.items = queryAll(
      `SELECT idv.*, iv.descricao, iv.unidade
       FROM itens_devolucao idv
       JOIN itens_venda iv ON iv.id = idv.itemVendaId
       WHERE idv.devolucaoId = ?`,
      [devolucao.id]
    );
  }
  venda.instrumentoRecebimento = queryOne(
    `SELECT tipo, emitente, numeroDocumento, valor, vencimento, status, observacao
     FROM instrumentos_recebimento
     WHERE vendaId = ? AND deletedAt IS NULL
     ORDER BY createdAt DESC LIMIT 1`,
    [venda.id]
  ) || null;
  venda.parcelas = queryAll(
    `SELECT id, vendaId, numero, vencimento, valor, valorPago, saldo, status, createdAt, updatedAt
     FROM vale_parcelas
     WHERE vendaId = ? AND deletedAt IS NULL
     ORDER BY vencimento ASC, numero ASC`,
    [venda.id]
  );
  if (venda.parcelas.length === 0 && venda.vencimento) {
    const total = Number(venda.totalLiquido || 0);
    const pago = Math.min(total, Math.max(0, Number(venda.valorPago || 0)));
    const saldo = Math.max(0, total - pago);
    venda.parcelas = [{
      id: `parcela_legada_${venda.id}`,
      vendaId: venda.id,
      numero: 1,
      vencimento: venda.vencimento,
      valor: total,
      valorPago: pago,
      saldo,
      status: venda.status === "cancelada" ? "cancelada" : saldo <= 0.005 ? "paga" : "pendente",
      createdAt: venda.createdAt,
      updatedAt: venda.updatedAt,
    }];
  }
  return venda;
}

// Evita quatro consultas adicionais por venda nas telas de listagem e relatório.
// O detalhamento completo é carregado em lotes e distribuído em memória por ID.
function carregarDetalhesVendasEmLote(vendas: any[]) {
  if (vendas.length === 0) return vendas;
  const ids = vendas.map((venda) => venda.id);
  const marcadores = ids.map(() => "?").join(",");
  const agrupar = (linhas: any[], chave: string) => {
    const mapa = new Map<string, any[]>();
    linhas.forEach((linha) => {
      const grupo = mapa.get(linha[chave]);
      if (grupo) grupo.push(linha); else mapa.set(linha[chave], [linha]);
    });
    return mapa;
  };

  const itensPorVenda = agrupar(queryAll<any>(
    `SELECT iv.*,
            p.codigo as referencia,
            COALESCE(
              NULLIF(iv.fornecedorReferencia, ''),
              NULLIF(f.referencia, ''),
              (SELECT CASE WHEN COUNT(*) = 1 THEN MAX(fu.referencia) END
               FROM fornecedor_produtos fpu
               JOIN fornecedores fu ON fu.id = fpu.fornecedorId
               WHERE fpu.produtoId = iv.produtoId AND fpu.ativo = 1
                 AND fu.ativo = 1 AND fu.deletedAt IS NULL)
            ) as fornecedorReferenciaResolvida,
            COALESCE((SELECT SUM(idv.quantidade) FROM itens_devolucao idv WHERE idv.itemVendaId = iv.id), 0) as quantidadeDevolvida,
            iv.quantidade - COALESCE((SELECT SUM(idv.quantidade) FROM itens_devolucao idv WHERE idv.itemVendaId = iv.id), 0) as quantidadeDisponivel
     FROM itens_venda iv
     LEFT JOIN produtos p ON p.id = iv.produtoId
     LEFT JOIN fornecedores f ON f.id = iv.fornecedorId
     WHERE iv.vendaId IN (${marcadores})`, ids
  ).map((item) => ({
    ...item,
    fornecedorReferencia: item.fornecedorReferenciaResolvida || item.fornecedorReferencia || null,
  })), "vendaId");
  const devolucoes = queryAll<any>(
    `SELECT * FROM devolucoes_venda WHERE vendaId IN (${marcadores}) ORDER BY createdAt DESC`, ids
  );
  const devolucoesPorVenda = agrupar(devolucoes, "vendaId");
  const idsDevolucoes = devolucoes.map((devolucao) => devolucao.id);
  const itensPorDevolucao = idsDevolucoes.length > 0
    ? agrupar(queryAll<any>(
        `SELECT idv.*, iv.descricao, iv.unidade
         FROM itens_devolucao idv
         JOIN itens_venda iv ON iv.id = idv.itemVendaId
         WHERE idv.devolucaoId IN (${idsDevolucoes.map(() => "?").join(",")})`, idsDevolucoes
      ), "devolucaoId")
    : new Map<string, any[]>();
  devolucoes.forEach((devolucao) => { devolucao.items = itensPorDevolucao.get(devolucao.id) || []; });

  const instrumentos = queryAll<any>(
    `SELECT vendaId, tipo, emitente, numeroDocumento, valor, vencimento, status, observacao, createdAt
     FROM instrumentos_recebimento
     WHERE vendaId IN (${marcadores}) AND deletedAt IS NULL
     ORDER BY createdAt DESC`, ids
  );
  const instrumentoPorVenda = new Map<string, any>();
  instrumentos.forEach((instrumento) => {
    if (!instrumentoPorVenda.has(instrumento.vendaId)) instrumentoPorVenda.set(instrumento.vendaId, instrumento);
  });
  const parcelasPorVenda = agrupar(queryAll<any>(
    `SELECT id, vendaId, numero, vencimento, valor, valorPago, saldo, status, createdAt, updatedAt
     FROM vale_parcelas
     WHERE vendaId IN (${marcadores}) AND deletedAt IS NULL
     ORDER BY vencimento ASC, numero ASC`, ids
  ), "vendaId");

  vendas.forEach((venda) => {
    venda.items = itensPorVenda.get(venda.id) || [];
    venda.devolucoes = devolucoesPorVenda.get(venda.id) || [];
    venda.instrumentoRecebimento = instrumentoPorVenda.get(venda.id) || null;
    venda.parcelas = parcelasPorVenda.get(venda.id) || [];
    if (venda.parcelas.length === 0 && venda.vencimento) {
      const total = Number(venda.totalLiquido || 0);
      const pago = Math.min(total, Math.max(0, Number(venda.valorPago || 0)));
      const saldo = Math.max(0, total - pago);
      venda.parcelas = [{
        id: `parcela_legada_${venda.id}`, vendaId: venda.id, numero: 1, vencimento: venda.vencimento,
        valor: total, valorPago: pago, saldo,
        status: venda.status === "cancelada" ? "cancelada" : saldo <= 0.005 ? "paga" : "pendente",
        createdAt: venda.createdAt, updatedAt: venda.updatedAt,
      }];
    }
  });
  return vendas;
}

// 6. VENDAS
app.get("/api/vendas", (req, res) => {
  try {
    const rows = queryAll<any>(
      `SELECT v.*,
              c.nome as clienteNome,
              c.telefone as clienteTelefone,
              c.endereco as clienteEndereco,
              c.documento as clienteDocumento,
              (SELECT u.nome FROM usuarios u WHERE u.id = v.vendedorId) as vendedorNome,
              COALESCE(
                (SELECT p.formaPagamento FROM pagamentos p WHERE p.vendaId = v.id AND p.deletedAt IS NULL ORDER BY p.createdAt ASC LIMIT 1),
                CASE WHEN v.saldoRestante > 0 THEN 'vale' ELSE NULL END
              ) as formaPagamento
       FROM vendas v
       JOIN clientes c ON v.clienteId = c.id
       WHERE v.deletedAt IS NULL
       ORDER BY v.numeroSequencial DESC`
    );
    
    carregarDetalhesVendasEmLote(rows);
    
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

app.get("/api/vendas/:id", (req, res) => {
  try {
    const venda = queryOne<any>(
      `SELECT v.*,
              c.nome as clienteNome,
              c.telefone as clienteTelefone,
              c.endereco as clienteEndereco,
              c.documento as clienteDocumento,
              (SELECT u.nome FROM usuarios u WHERE u.id = v.vendedorId) as vendedorNome,
              COALESCE(
                (SELECT p.formaPagamento FROM pagamentos p WHERE p.vendaId = v.id AND p.deletedAt IS NULL ORDER BY p.createdAt ASC LIMIT 1),
                CASE WHEN v.saldoRestante > 0 THEN 'vale' ELSE NULL END
              ) as formaPagamento
       FROM vendas v
       JOIN clientes c ON v.clienteId = c.id
       WHERE v.id = ? AND v.deletedAt IS NULL`,
      [req.params.id]
    );
    if (!venda) return res.status(404).json({ error: "Venda não encontrada." });
    res.json(carregarDetalhesVenda(venda));
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
      parcelas,
      observacoes,
      autorizacaoPreco,
      instrumentoRecebimento,
      orcamentoId
    } = req.body;

    if (!clienteId || !data || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Dados da venda incompletos ou vazios." });
    }
    const observacoesVenda = String(observacoes || "").trim();
    if (observacoesVenda.length > 100) {
      return res.status(400).json({ error: "A observação da venda deve possuir no máximo 100 caracteres." });
    }
    const variantesDaVenda = items.map((item: any) => ({
      produtoId: String(item?.produtoId || ""),
      chave: `${String(item?.produtoId || "")}::${String(item?.fornecedorId || "")}`
    }));
    if (variantesDaVenda.some((item: any) => !item.produtoId) || new Set(variantesDaVenda.map((item: any) => item.chave)).size !== variantesDaVenda.length) {
      return res.status(400).json({ error: "A mesma combinação de produto e fornecedor não pode aparecer duas vezes na venda." });
    }

    const nextSeqRow = queryOne<{ maxSeq: number }>("SELECT COALESCE(MAX(numeroSequencial), 0) as maxSeq FROM vendas");
    const nextSeq = (nextSeqRow?.maxSeq || 0) + 1;

    const vendaId = "vend_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

    // Atomically execute inside transaction
    const resultVenda = runInTransaction(() => {
      if (orcamentoId) {
        const orcamento = queryOne<any>(
          "SELECT clienteId, status FROM orcamentos WHERE id = ? AND deletedAt IS NULL",
          [orcamentoId]
        );
        if (!orcamento || orcamento.status !== "aberto" || orcamento.clienteId !== clienteId) {
          throw erroHttp("O orçamento informado não está aberto para este cliente.", 409);
        }
      }

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

        const contextoPreco = resolverPrecoClienteProdutoFornecedor(
          clienteId,
          prod,
          it.fornecedorId ? String(it.fornecedorId) : null
        );
        const custoUnit = contextoPreco.custoUnitario;

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
          fornecedorId: contextoPreco.fornecedorId,
          fornecedorReferencia: contextoPreco.fornecedorReferencia,
          precoMinimoSemPin: contextoPreco.precoMinimoSemPin
        };
      });

      // Calcule subtotal, desconto geral e total líquido automaticamente
      const descGeral = Number(descontoGeral || 0);
      const totalLiquido = subtotal - descGeral;
      const vPago = Number(valorPago || 0);
      const saldoRestante = totalLiquido - vPago;
      const usandoCreditoCarteira = formaPagamento === "bonus";

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
      if (!Number.isFinite(vPago) || vPago < 0 || vPago > totalLiquido + 0.005) {
        throw erroHttp("O valor recebido deve estar entre zero e o total da venda.", 400);
      }
      if (usandoCreditoCarteira) {
        const saldoBonus = queryOne<{ saldo: number }>(
          `SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0) as saldo
           FROM cliente_bonus_movimentos
           WHERE clienteId = ? AND deletedAt IS NULL`,
          [clienteId]
        )?.saldo || 0;
        if (vPago <= 0) {
          throw erroHttp("Este cliente não possui crédito disponível para aplicar.", 400);
        }
        if (vPago > saldoBonus + 0.005) {
          throw erroHttp("O crédito informado é maior que o saldo disponível na carteira.", 409);
        }
      }

      // O desconto geral também reduz o preço real dos produtos e não pode ser
      // usado para contornar a autorização administrativa.
      const fatorPrecoEfetivo = subtotal > 0 ? totalLiquido / subtotal : 1;
      const itensQueExigemAutorizacao = resolvedItems
        .map((item) => ({ ...item, precoEfetivo: item.precoUnitario * fatorPrecoEfetivo }))
        .filter((item) => Math.abs(item.precoEfetivo - item.precoMinimoSemPin) > 0.005);
      let administradorAutorizador: UsuarioAdministrador | null = null;

      if (itensQueExigemAutorizacao.length > 0) {
        const administrador = getUsuarioAdministrador();
        if (!administrador?.pinHash) {
          throw erroHttp("Configure o PIN administrativo em Ajustes & Backups antes de alterar preços.", 428);
        }

        administradorAutorizador = validarPinAdministrador(autorizacaoPreco?.pin);
        if (!administradorAutorizador) {
          throw erroHttp("Autorize o novo preço no campo do item antes de registrar a venda.", 403);
        }
      }

      const status = saldoRestante <= 0 ? "paga" : "pendente";
      const parcelasResolvidas = saldoRestante > 0
        ? normalizarParcelasVale(
            Array.isArray(parcelas) && parcelas.length > 0
              ? parcelas
              : [{ vencimento, valor: totalLiquido }],
            totalLiquido
          )
        : [];
      const vencimentoPrincipal = parcelasResolvidas[0]?.vencimento || vencimento || null;

      // Insert Venda
      execute(
        `INSERT INTO vendas (id, numeroSequencial, clienteId, vendedorId, data, subtotal, desconto, totalLiquido, valorPago, saldoRestante, status, vencimento, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vendaId, nextSeq, clienteId, usuarioDaRequisicao(req)?.id || null, data, subtotal, descGeral, totalLiquido, vPago, saldoRestante, status, vencimentoPrincipal, observacoesVenda || null]
      );
      if (parcelasResolvidas.length > 0) {
        inserirParcelasVale(vendaId, parcelasResolvidas);
        recalcularParcelasVale(vendaId);
      }

      // Insert Itens Venda
      for (const it of resolvedItems) {
        execute(
          `INSERT INTO itens_venda (id, vendaId, produtoId, fornecedorId, fornecedorReferencia, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [it.id, vendaId, it.produtoId, it.fornecedorId, it.fornecedorReferencia, it.descricao, it.quantidade, it.unidade, it.precoUnitario, it.custoUnitario, it.desconto, it.total, it.custoTotal, it.lucroBruto]
        );
      }

      // Se houver pagamento inicial, registrar
      if (vPago > 0 && !usandoCreditoCarteira) {
        const pagId = "pag_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
        execute(
          `INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [pagId, clienteId, vendaId, data, vPago, formaPagamento || "pix", "Pagamento inicial da venda #" + nextSeq]
        );
      }
      if (vPago > 0 && usandoCreditoCarteira) {
        execute(
          `INSERT INTO cliente_bonus_movimentos (id, clienteId, recebimentoId, vendaId, data, tipo, valor, observacao)
           VALUES (?, ?, NULL, ?, ?, 'debito', ?, ?)`,
          [
            "bon_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
            clienteId,
            vendaId,
            data,
            vPago,
            "Crédito aplicado na venda #" + nextSeq
          ]
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

      // O preço do cliente é sempre incremental: cada venda passa a ser a
      // referência atual, enquanto o preço praticado permanece preservado no item.
      for (const item of resolvedItems) {
        const precoEfetivo = item.precoUnitario * fatorPrecoEfetivo;
        salvarPrecoAutorizadoCliente(clienteId, item.produtoId, precoEfetivo, item.fornecedorId);
      }

      if (itensQueExigemAutorizacao.length > 0 && administradorAutorizador) {
        registrarAuditoria(
          administradorAutorizador.id,
          "preco_cliente_atualizado",
          "venda",
          vendaId,
          {
            clienteId,
            numeroSequencial: nextSeq,
            itens: itensQueExigemAutorizacao.map((item) => ({
              produtoId: item.produtoId,
              fornecedorId: item.fornecedorId,
              precoAnteriorPermitido: item.precoMinimoSemPin,
              precoAutorizado: item.precoEfetivo
            }))
          }
        );
      }

      if (orcamentoId) {
        execute(
          `UPDATE orcamentos
           SET vendaId = ?, updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [vendaId, orcamentoId]
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

app.post("/api/vendas/:id/devolucoes", (req, res) => {
  try {
    const vendaId = req.params.id;
    const { data, observacoes, pin, items } = req.body || {};
    const administrador = validarPinAdministrador(pin);
    if (!administrador) {
      return res.status(403).json({ error: "PIN administrativo inválido." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || "")) || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Informe a data e ao menos um item para devolução." });
    }

    const resultado = runInTransaction(() => {
      const venda = queryOne<any>(
        "SELECT * FROM vendas WHERE id = ? AND deletedAt IS NULL AND status <> 'cancelada'",
        [vendaId]
      );
      if (!venda) throw erroHttp("Venda não encontrada ou cancelada.", 404);

      const resolvidos = items.map((entrada: any) => {
        const item = queryOne<any>(
          `SELECT iv.*,
                  COALESCE((SELECT SUM(idv.quantidade) FROM itens_devolucao idv WHERE idv.itemVendaId = iv.id), 0) as quantidadeDevolvida
           FROM itens_venda iv
           WHERE iv.id = ? AND iv.vendaId = ?`,
          [entrada.itemVendaId, vendaId]
        );
        if (!item) throw erroHttp("Um item informado não pertence a esta venda.", 400);
        const quantidade = Number(entrada.quantidade);
        const disponivel = Number(item.quantidade) - Number(item.quantidadeDevolvida || 0);
        if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > disponivel + 0.000001) {
          throw erroHttp(`Quantidade inválida para ${item.descricao}. Disponível: ${disponivel}.`, 400);
        }
        const descontoProporcional = Number(venda.subtotal) > 0
          ? Number(venda.desconto || 0) * (Number(item.total) / Number(venda.subtotal))
          : 0;
        const valorUnitarioCredito = (Number(item.total) - descontoProporcional) / Number(item.quantidade);
        return {
          ...item,
          quantidade,
          valorUnitarioCredito,
          totalCredito: Math.round(quantidade * valorUnitarioCredito * 100) / 100
        };
      });

      const valorCredito = Math.round(resolvidos.reduce((total, item) => total + item.totalCredito, 0) * 100) / 100;
      const devolucaoId = "dev_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
      execute(
        `INSERT INTO devolucoes_venda (id, vendaId, clienteId, data, valorCredito, observacoes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [devolucaoId, vendaId, venda.clienteId, data, valorCredito, String(observacoes || "").trim() || null]
      );
      for (const item of resolvidos) {
        execute(
          `INSERT INTO itens_devolucao
             (id, devolucaoId, itemVendaId, produtoId, quantidade, valorUnitarioCredito, totalCredito)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            "idv_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
            devolucaoId,
            item.id,
            item.produtoId,
            item.quantidade,
            item.valorUnitarioCredito,
            item.totalCredito
          ]
        );
      }
      const totalAnterior = Number(venda.totalLiquido);
      const pagoAnterior = Number(venda.valorPago);
      const saldoAnterior = Number(venda.saldoRestante);
      const novoTotal = Math.round(Math.max(0, totalAnterior - valorCredito) * 100) / 100;
      const novoPago = Math.round(Math.min(pagoAnterior, novoTotal) * 100) / 100;
      const novoSaldo = Math.round(Math.max(0, novoTotal - novoPago) * 100) / 100;
      const abatimentoVale = Math.round(Math.min(valorCredito, saldoAnterior) * 100) / 100;
      const bonusGerado = Math.round(Math.max(0, valorCredito - abatimentoVale) * 100) / 100;
      const primeiroVencimento = reduzirParcelasValePorDevolucao(vendaId, valorCredito);

      execute(
        `UPDATE devolucoes_venda
         SET abatimentoVale = ?, bonusGerado = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [abatimentoVale, bonusGerado, devolucaoId]
      );

      execute(
        `UPDATE vendas
         SET totalLiquido = ?, valorPago = ?, saldoRestante = ?, status = ?,
             vencimento = COALESCE(?, vencimento), updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [novoTotal, novoPago, novoSaldo, novoSaldo <= 0.005 ? "paga" : "pendente", primeiroVencimento, vendaId]
      );
      recalcularParcelasVale(vendaId);

      if (bonusGerado > 0.005) {
        execute(
          `INSERT INTO cliente_bonus_movimentos (id, clienteId, recebimentoId, vendaId, data, tipo, valor, observacao)
           VALUES (?, ?, NULL, ?, ?, 'credito', ?, ?)`,
          [
            "bon_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
            venda.clienteId,
            vendaId,
            data,
            bonusGerado,
            `Crédito excedente da devolução da venda #${venda.numeroSequencial}`
          ]
        );
      }
      registrarAuditoria(administrador.id, "devolucao_venda_registrada", "venda", vendaId, {
        devolucaoId,
        clienteId: venda.clienteId,
        valorCredito,
        abatimentoVale,
        bonusGerado,
        totalAnterior,
        totalAtual: novoTotal,
        saldoAnterior,
        saldoAtual: novoSaldo,
        itens: resolvidos.map((item) => ({
          itemVendaId: item.id,
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          totalCredito: item.totalCredito
        }))
      });
      rebuildClienteProdutosHabituais(venda.clienteId);
      return { id: devolucaoId, valorCredito, abatimentoVale, bonusGerado };
    });

    const atualizada = queryOne<any>(
      `SELECT v.*, c.nome AS clienteNome, c.telefone AS clienteTelefone,
              c.endereco AS clienteEndereco, c.documento AS clienteDocumento
       FROM vendas v JOIN clientes c ON c.id = v.clienteId
       WHERE v.id = ?`,
      [vendaId]
    );
    res.status(201).json({
      success: true,
      ...resultado,
      venda: carregarDetalhesVenda(atualizada)
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put("/api/vendas/:id", (req, res) => {
  try {
    const administrador = validarPinAdministrador(req.body?.pin);
    if (!administrador) {
      return res.status(403).json({ error: "PIN administrativo inválido. A venda não foi alterada." });
    }
    const vendaId = req.params.id;
    const observacoesVenda = String(req.body?.observacoes || "").trim();
    if (observacoesVenda.length > 100) {
      return res.status(400).json({ error: "A observação da venda deve possuir no máximo 100 caracteres." });
    }
    const itensInformados = Array.isArray(req.body?.items) ? req.body.items : [];
    if (itensInformados.length === 0) {
      return res.status(400).json({ error: "A venda deve manter ao menos um item." });
    }

    runInTransaction(() => {
      const venda = queryOne<any>(
        "SELECT * FROM vendas WHERE id = ? AND deletedAt IS NULL AND status <> 'cancelada'",
        [vendaId]
      );
      if (!venda) throw erroHttp("Venda não encontrada ou cancelada.", 404);

      const itensAtuais = queryAll<any>(
        `SELECT iv.*,
                COALESCE((SELECT SUM(idv.quantidade) FROM itens_devolucao idv WHERE idv.itemVendaId = iv.id), 0) AS quantidadeDevolvida
         FROM itens_venda iv WHERE iv.vendaId = ?`,
        [vendaId]
      );
      const atuaisPorId = new Map(itensAtuais.map((item) => [item.id, item]));
      const idsInformados = new Set<string>();
      const chavesInformadas = new Set<string>();
      const variantesInformadas = new Set<string>();
      const resolvidos = itensInformados.map((entrada: any) => {
        const chave = String(entrada.id || "");
        if (!chave || chavesInformadas.has(chave)) {
          throw erroHttp("A alteração contém item inválido ou repetido.", 400);
        }
        chavesInformadas.add(chave);
        let atual = atuaisPorId.get(chave) as any;
        const itemNovo = !atual;
        if (itemNovo) {
          const produto = queryOne<any>(
            "SELECT * FROM produtos WHERE id = ? AND deletedAt IS NULL AND ativo = 1",
            [entrada.produtoId]
          );
          if (!produto) throw erroHttp("Um produto adicionado não existe ou está inativo.", 400);
          const contextoPreco = resolverPrecoClienteProdutoFornecedor(
            venda.clienteId,
            produto,
            entrada.fornecedorId ? String(entrada.fornecedorId) : null
          );
          atual = {
            id: "iv_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
            vendaId,
            produtoId: produto.id,
            fornecedorId: contextoPreco.fornecedorId,
            fornecedorReferencia: contextoPreco.fornecedorReferencia,
            descricao: produto.nome,
            unidade: produto.unidade,
            custoUnitario: contextoPreco.custoUnitario,
            desconto: 0,
            quantidadeDevolvida: 0,
            itemNovo: true
          };
        } else {
          idsInformados.add(atual.id);
        }
        const chaveVariante = `${atual.produtoId}::${atual.fornecedorId || ""}`;
        if (variantesInformadas.has(chaveVariante)) {
          throw erroHttp(`A combinação de produto e fornecedor de ${atual.descricao} não pode aparecer duas vezes na mesma venda.`, 400);
        }
        variantesInformadas.add(chaveVariante);
        const quantidade = Number(entrada.quantidade);
        const precoUnitario = Number(entrada.precoUnitario);
        const descontoItem = Number(entrada.desconto ?? atual.desconto ?? 0);
        if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade + 0.000001 < Number(atual.quantidadeDevolvida || 0)) {
          throw erroHttp(`A quantidade de ${atual.descricao} não pode ser menor que a quantidade já devolvida.`, 400);
        }
        if (!Number.isFinite(precoUnitario) || precoUnitario < 0 || !Number.isFinite(descontoItem) || descontoItem < 0) {
          throw erroHttp(`Preço ou desconto inválido para ${atual.descricao}.`, 400);
        }
        const totalBruto = quantidade * precoUnitario;
        if (descontoItem > totalBruto) throw erroHttp(`O desconto de ${atual.descricao} excede o valor do item.`, 400);
        const total = Math.round((totalBruto - descontoItem) * 100) / 100;
        const custoTotal = Math.round(quantidade * Number(atual.custoUnitario) * 100) / 100;
        return { ...atual, quantidade, precoUnitario, desconto: descontoItem, total, custoTotal, lucroBruto: Math.round((total - custoTotal) * 100) / 100 };
      });

      for (const atual of itensAtuais) {
        if (!idsInformados.has(atual.id) && Number(atual.quantidadeDevolvida || 0) > 0.005) {
          throw erroHttp(`O item ${atual.descricao} possui devolução e precisa permanecer no histórico da venda.`, 409);
        }
      }

      const subtotal = Math.round(resolvidos.reduce((soma, item) => soma + item.total, 0) * 100) / 100;
      const desconto = Number(req.body?.desconto || 0);
      if (!Number.isFinite(desconto) || desconto < 0 || desconto > subtotal) {
        throw erroHttp("O desconto geral informado é inválido.", 400);
      }
      const novoTotal = Math.round((subtotal - desconto) * 100) / 100;
      const totalAnterior = Number(venda.totalLiquido);
      const pagoAnterior = Number(venda.valorPago);
      const novoPago = Math.round(Math.min(pagoAnterior, novoTotal) * 100) / 100;
      const novoSaldo = Math.round(Math.max(0, novoTotal - novoPago) * 100) / 100;
      const bonusGerado = Math.round(Math.max(0, pagoAnterior - novoTotal) * 100) / 100;
      const diferencaTotal = Math.round((novoTotal - totalAnterior) * 100) / 100;

      for (const item of resolvidos) {
        if (item.itemNovo) {
          execute(
            `INSERT INTO itens_venda
               (id, vendaId, produtoId, fornecedorId, fornecedorReferencia, descricao, quantidade, unidade, precoUnitario, custoUnitario, desconto, total, custoTotal, lucroBruto)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [item.id, vendaId, item.produtoId, item.fornecedorId, item.fornecedorReferencia, item.descricao, item.quantidade, item.unidade, item.precoUnitario, item.custoUnitario, item.desconto, item.total, item.custoTotal, item.lucroBruto]
          );
        } else {
          execute(
            `UPDATE itens_venda SET quantidade = ?, precoUnitario = ?, desconto = ?, total = ?,
               custoTotal = ?, lucroBruto = ? WHERE id = ?`,
            [item.quantidade, item.precoUnitario, item.desconto, item.total, item.custoTotal, item.lucroBruto, item.id]
          );
        }
        salvarPrecoAutorizadoCliente(venda.clienteId, item.produtoId, item.precoUnitario, item.fornecedorId);
      }
      for (const atual of itensAtuais) {
        if (!idsInformados.has(atual.id)) execute("DELETE FROM itens_venda WHERE id = ?", [atual.id]);
      }

      let primeiroVencimento: string | null = venda.vencimento;
      if (diferencaTotal < -0.005) {
        primeiroVencimento = reduzirParcelasValePorDevolucao(vendaId, Math.abs(diferencaTotal)) || venda.vencimento;
      } else if (diferencaTotal > 0.005) {
        const ultimaParcela = queryOne<any>(
          "SELECT * FROM vale_parcelas WHERE vendaId = ? AND deletedAt IS NULL ORDER BY vencimento DESC, numero DESC LIMIT 1",
          [vendaId]
        );
        if (ultimaParcela) {
          execute("UPDATE vale_parcelas SET valor = valor + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [diferencaTotal, ultimaParcela.id]);
        } else {
          primeiroVencimento = venda.vencimento || req.body?.data || venda.data;
          inserirParcelasVale(vendaId, [{ vencimento: primeiroVencimento, valor: novoTotal }]);
        }
      }

      execute(
        `UPDATE vendas SET data = ?, subtotal = ?, desconto = ?, totalLiquido = ?, valorPago = ?,
           saldoRestante = ?, status = ?, vencimento = ?, observacoes = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.data || "")) ? req.body.data : venda.data,
          subtotal,
          desconto,
          novoTotal,
          novoPago,
          novoSaldo,
          novoSaldo <= 0.005 ? "paga" : "pendente",
          primeiroVencimento,
          observacoesVenda || null,
          vendaId
        ]
      );
      recalcularParcelasVale(vendaId);
      if (bonusGerado > 0.005) {
        execute(
          `INSERT INTO cliente_bonus_movimentos (id, clienteId, recebimentoId, vendaId, data, tipo, valor, observacao)
           VALUES (?, ?, NULL, ?, date('now', 'localtime'), 'credito', ?, ?)`,
          [
            "bon_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
            venda.clienteId,
            vendaId,
            bonusGerado,
            `Crédito excedente da alteração da venda #${venda.numeroSequencial}`
          ]
        );
      }
      registrarAuditoria(administrador.id, "venda_alterada", "venda", vendaId, {
        clienteId: venda.clienteId,
        numeroSequencial: venda.numeroSequencial,
        totalAnterior,
        totalAtual: novoTotal,
        saldoAnterior: venda.saldoRestante,
        saldoAtual: novoSaldo,
        bonusGerado,
        itensAnteriores: itensAtuais,
        itensAtuais: resolvidos
      });
      rebuildClienteProdutosHabituais(venda.clienteId);
    });

    const atualizada = queryOne<any>(
      `SELECT v.*, c.nome AS clienteNome, c.telefone AS clienteTelefone,
              c.endereco AS clienteEndereco, c.documento AS clienteDocumento
       FROM vendas v JOIN clientes c ON c.id = v.clienteId WHERE v.id = ?`,
      [vendaId]
    );
    res.json(carregarDetalhesVenda(atualizada));
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put("/api/vales/:id", (req, res) => {
  try {
    const administrador = validarPinAdministrador(req.body?.pin);
    if (!administrador) {
      return res.status(403).json({ error: "PIN administrativo inválido. O vale não foi alterado." });
    }
    const { id } = req.params;
    const venda = queryOne<any>(
      "SELECT * FROM vendas WHERE id = ? AND deletedAt IS NULL AND vencimento IS NOT NULL",
      [id]
    );
    if (!venda) return res.status(404).json({ error: "Vale não encontrado." });
    if (venda.status === "cancelada") {
      return res.status(409).json({ error: "Um vale cancelado não pode ser alterado." });
    }
    const observacoesVale = String(req.body?.observacoes || "").trim();
    if (observacoesVale.length > 100) {
      return res.status(400).json({ error: "A observação da venda deve possuir no máximo 100 caracteres." });
    }

    const parcelasAnteriores = queryAll<any>(
      "SELECT numero, vencimento, valor, valorPago, saldo, status FROM vale_parcelas WHERE vendaId = ? AND deletedAt IS NULL ORDER BY numero",
      [id]
    );
    const parcelas = normalizarParcelasVale(req.body?.parcelas, Number(venda.totalLiquido));

    runInTransaction(() => {
      inserirParcelasVale(id, parcelas);
      execute(
        "UPDATE vendas SET vencimento = ?, observacoes = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
        [parcelas[0].vencimento, observacoesVale || null, id]
      );
      recalcularParcelasVale(id);
      registrarAuditoria(administrador.id, "vale_replanejado", "venda", id, {
        clienteId: venda.clienteId,
        numeroSequencial: venda.numeroSequencial,
        parcelasAnteriores,
        parcelasNovas: parcelas,
        observacoesAnteriores: venda.observacoes || null,
        observacoesNovas: observacoesVale || null
      });
    });

    const atualizado = queryOne<any>(
      `SELECT v.*, c.nome AS clienteNome, c.telefone AS clienteTelefone,
              c.endereco AS clienteEndereco, c.documento AS clienteDocumento
       FROM vendas v JOIN clientes c ON c.id = v.clienteId
       WHERE v.id = ?`,
      [id]
    );
    res.json(carregarDetalhesVenda(atualizado));
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/vales/:id/cancelar", (req, res) => {
  try {
    const administrador = validarPinAdministrador(req.body?.pin);
    if (!administrador) {
      return res.status(403).json({ error: "PIN administrativo inválido. O vale não foi cancelado." });
    }
    const { id } = req.params;
    runInTransaction(() => {
      const venda = queryOne<any>(
        "SELECT * FROM vendas WHERE id = ? AND deletedAt IS NULL AND vencimento IS NOT NULL",
        [id]
      );
      if (!venda) throw erroHttp("Vale não encontrado.", 404);
      if (venda.status === "cancelada") throw erroHttp("Este vale já está cancelado.", 409);

      execute("UPDATE vendas SET status = 'cancelada', saldoRestante = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [id]);
      execute("UPDATE vale_parcelas SET status = 'cancelada', saldo = 0, updatedAt = CURRENT_TIMESTAMP WHERE vendaId = ? AND deletedAt IS NULL", [id]);
      execute("UPDATE instrumentos_recebimento SET status = 'cancelado', deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE vendaId = ? AND deletedAt IS NULL", [id]);
      const bonusRestituido = Math.round(Math.max(0, Number(venda.valorPago || 0)) * 100) / 100;
      if (bonusRestituido > 0.005) {
        execute(
          `INSERT INTO cliente_bonus_movimentos (id, clienteId, recebimentoId, vendaId, data, tipo, valor, observacao)
           VALUES (?, ?, NULL, ?, date('now', 'localtime'), 'credito', ?, ?)`,
          [
            "bon_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
            venda.clienteId,
            id,
            bonusRestituido,
            `Restituição pelo cancelamento do vale #${venda.numeroSequencial}`
          ]
        );
      }
      registrarAuditoria(administrador.id, "vale_cancelado", "venda", id, {
        clienteId: venda.clienteId,
        numeroSequencial: venda.numeroSequencial,
        totalLiquido: venda.totalLiquido,
        valorPago: venda.valorPago,
        bonusRestituido,
        motivo: String(req.body?.motivo || "").trim() || null
      });
      rebuildClienteProdutosHabituais(venda.clienteId);
    });
    res.json({ success: true, message: "Vale cancelado e removido da contabilidade ativa. O histórico foi preservado." });
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
      const devolucaoAtiva = queryOne<{ quantidade: number }>(
        "SELECT COUNT(*) AS quantidade FROM devolucoes_venda WHERE vendaId = ?",
        [id]
      );
      if (Number(devolucaoAtiva?.quantidade || 0) > 0) {
        throw erroHttp("Esta venda possui devoluções registradas. Ela não pode ser cancelada porque já gerou crédito para o cliente.", 409);
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
      execute(
        "UPDATE vale_parcelas SET status = 'cancelada', saldo = 0, updatedAt = CURRENT_TIMESTAMP WHERE vendaId = ? AND deletedAt IS NULL",
        [id]
      );
      execute(
        "UPDATE cliente_bonus_movimentos SET deletedAt = ? WHERE vendaId = ? AND deletedAt IS NULL",
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
    `UPDATE produtos
     SET custoPadrao = CASE WHEN ? IS NULL THEN COALESCE(custoManual, 0) ELSE ? END,
         custoOrigem = CASE WHEN ? IS NULL THEN 'manual' ELSE 'compra' END,
         updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      ultimaCompra ? Number(ultimaCompra.custoUnitario) : null,
      ultimaCompra ? Number(ultimaCompra.custoUnitario) : null,
      ultimaCompra ? Number(ultimaCompra.custoUnitario) : null,
      produtoId
    ]
  );
}

// 7. COMPRAS. Orçamento e entrada compartilham a mesma validação de catálogo,
// mas permanecem documentos distintos para preservar solicitado x conferido.
function arredondarCompra(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function resolverItensCompraFornecedor(fornecedorId: string, items: any[], campoCusto: "custoEstimado" | "custoUnitario") {
  if (!fornecedorId || !Array.isArray(items) || items.length === 0) {
    throw erroHttp("Informe o fornecedor e pelo menos um produto.", 400);
  }
  const ids = [...new Set(items.map((item) => String(item?.produtoId || "")).filter(Boolean))];
  if (ids.length !== items.length) throw erroHttp("Não repita produtos no mesmo documento.", 400);
  const placeholders = ids.map(() => "?").join(",");
  const fornecedor = queryOne(
    "SELECT id FROM fornecedores WHERE id = ? AND ativo = 1 AND deletedAt IS NULL",
    [fornecedorId]
  );
  if (!fornecedor) throw erroHttp("Fornecedor não encontrado ou inativo.", 404);
  const catalogo = queryAll<any>(
    `SELECT p.id, p.nome, p.unidade, p.codigo
     FROM produtos p
     WHERE p.ativo = 1 AND p.deletedAt IS NULL
       AND p.id IN (${placeholders})`,
    ids
  );
  const porId = new Map(catalogo.map((produto) => [produto.id, produto]));
  return items.map((item) => {
    const produto = porId.get(String(item.produtoId));
    if (!produto) throw erroHttp("A lista contém um produto inexistente ou inativo.", 400);
    const quantidade = Number(item.quantidade);
    const custo = Number(item[campoCusto]);
    if (item.unidade && item.unidade !== produto.unidade) {
      throw erroHttp(`O produto ${produto.nome} deve ser registrado em ${produto.unidade}.`, 400);
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(custo) || custo < 0) {
      throw erroHttp(`Quantidade ou custo inválido para ${produto.nome}.`, 400);
    }
    return { produtoId: produto.id, produtoNome: produto.nome, unidade: produto.unidade, quantidade, custo, total: arredondarCompra(quantidade * custo) };
  });
}

function agruparFilhos<T extends { [key: string]: any }>(pais: any[], filhos: T[], chavePai: string, destino: string) {
  const mapa = new Map<string, T[]>();
  for (const filho of filhos) {
    const chave = String(filho[chavePai]);
    mapa.set(chave, [...(mapa.get(chave) || []), filho]);
  }
  for (const pai of pais) pai[destino] = mapa.get(String(pai.id)) || [];
}

function listarCompras(donde = "", params: any[] = []) {
  const compras = queryAll<any>(
    `SELECT c.*, f.nome AS fornecedorNome, f.telefone AS fornecedorTelefone
     FROM compras c JOIN fornecedores f ON f.id = c.fornecedorId
     WHERE c.deletedAt IS NULL ${donde}
     ORDER BY c.data DESC, c.numeroSequencial DESC`, params
  );
  if (compras.length === 0) return compras;
  const ids = compras.map((item) => item.id);
  const ph = ids.map(() => "?").join(",");
  const itens = queryAll<any>(
    `SELECT ic.*, p.nome AS produtoNome, p.codigo AS produtoCodigo
     FROM itens_compra ic JOIN produtos p ON p.id = ic.produtoId
     WHERE ic.compraId IN (${ph}) ORDER BY ic.id`, ids
  );
  const pagamentos = queryAll<any>(
    `SELECT * FROM pagamentos_compra WHERE compraId IN (${ph}) AND deletedAt IS NULL ORDER BY data, createdAt`, ids
  );
  agruparFilhos(compras, itens, "compraId", "items");
  agruparFilhos(compras, pagamentos, "compraId", "pagamentos");
  return compras;
}

function listarOrcamentosCompra() {
  const documentos = queryAll<any>(
    `SELECT o.*, f.nome AS fornecedorNome, f.telefone AS fornecedorTelefone
     FROM orcamentos_compra o JOIN fornecedores f ON f.id = o.fornecedorId
     WHERE o.deletedAt IS NULL ORDER BY o.data DESC, o.numeroSequencial DESC`
  );
  if (documentos.length === 0) return documentos;
  const ids = documentos.map((item) => item.id);
  const ph = ids.map(() => "?").join(",");
  const itens = queryAll<any>(
    `SELECT io.*, p.nome AS produtoNome, p.codigo AS produtoCodigo
     FROM itens_orcamento_compra io JOIN produtos p ON p.id = io.produtoId
     WHERE io.orcamentoCompraId IN (${ph}) ORDER BY io.id`, ids
  );
  agruparFilhos(documentos, itens, "orcamentoCompraId", "items");
  return documentos;
}

function recalcularCustoFornecedorProduto(fornecedorId: string, produtoId: string) {
  const ultimo = queryOne<{ custoUnitario: number }>(
    `SELECT ic.custoUnitario FROM itens_compra ic
     JOIN compras c ON c.id = ic.compraId
     WHERE c.fornecedorId = ? AND ic.produtoId = ? AND c.deletedAt IS NULL
     ORDER BY c.data DESC, c.createdAt DESC, ic.id DESC LIMIT 1`,
    [fornecedorId, produtoId]
  );
  execute(
    `UPDATE fornecedor_produtos SET custoFornecedor = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE fornecedorId = ? AND produtoId = ?`,
    [ultimo ? Number(ultimo.custoUnitario) : null, fornecedorId, produtoId]
  );
}

app.get("/api/orcamentos-compra", (_req, res) => {
  try { res.json(listarOrcamentosCompra()); }
  catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
});

app.post("/api/orcamentos-compra", (req, res) => {
  try {
    const { fornecedorId, data, validade, observacao } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ""))) return res.status(400).json({ error: "Informe uma data válida." });
    const resolvidos = resolverItensCompraFornecedor(String(fornecedorId || ""), req.body.items, "custoEstimado");
    const subtotal = arredondarCompra(resolvidos.reduce((soma, item) => soma + item.total, 0));
    const desconto = arredondarCompra(Number(req.body.desconto || 0));
    if (!Number.isFinite(desconto) || desconto < 0 || desconto > subtotal) return res.status(400).json({ error: "Desconto inválido." });
    const idInformado = req.body.id ? String(req.body.id) : null;
    const id = idInformado || "orc_comp_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    runInTransaction(() => {
      if (idInformado) {
        const atual = queryOne<any>("SELECT * FROM orcamentos_compra WHERE id = ? AND status = 'aberto' AND deletedAt IS NULL", [id]);
        if (!atual) throw erroHttp("Orçamento de compra não encontrado ou já encerrado.", 409);
        execute(
          `UPDATE orcamentos_compra SET fornecedorId = ?, data = ?, validade = ?, subtotal = ?, desconto = ?, total = ?, observacao = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
          [fornecedorId, data, validade || null, subtotal, desconto, arredondarCompra(subtotal - desconto), observacao || null, id]
        );
        execute("DELETE FROM itens_orcamento_compra WHERE orcamentoCompraId = ?", [id]);
      } else {
        const numero = Number(queryOne<any>("SELECT COALESCE(MAX(numeroSequencial), 0) + 1 AS numero FROM orcamentos_compra")?.numero || 1);
        execute(
          `INSERT INTO orcamentos_compra (id, numeroSequencial, fornecedorId, data, validade, subtotal, desconto, total, observacao)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, numero, fornecedorId, data, validade || null, subtotal, desconto, arredondarCompra(subtotal - desconto), observacao || null]
        );
      }
      for (const item of resolvidos) execute(
        `INSERT INTO itens_orcamento_compra (id, orcamentoCompraId, produtoId, quantidade, unidade, custoEstimado, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["ioc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16), id, item.produtoId, item.quantidade, item.unidade, item.custo, item.total]
      );
    });
    res.status(idInformado ? 200 : 201).json(listarOrcamentosCompra().find((item) => item.id === id));
  } catch (error: any) {
    const mensagem = String(error.message || "");
    res.status(error.statusCode || 500).json({ error: mensagem });
  }
});

app.post("/api/orcamentos-compra/:id/cancelar", (req, res) => {
  try {
    const resultado = execute("UPDATE orcamentos_compra SET status = 'cancelado', updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND status = 'aberto' AND deletedAt IS NULL", [req.params.id]);
    if (!resultado.changes) return res.status(404).json({ error: "Orçamento aberto não encontrado." });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.get("/api/compras", (_req, res) => {
  try { res.json(listarCompras()); }
  catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
});

app.post("/api/compras", (req, res) => {
  try {
    const { fornecedorId, data, observacao } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ""))) return res.status(400).json({ error: "Informe uma data válida." });
    const resolvidos = resolverItensCompraFornecedor(String(fornecedorId || ""), req.body.items, "custoUnitario");
    const subtotal = arredondarCompra(resolvidos.reduce((soma, item) => soma + item.total, 0));
    const desconto = arredondarCompra(Number(req.body.desconto || 0));
    const total = arredondarCompra(subtotal - desconto);
    const valorPago = arredondarCompra(Number(req.body.valorPago || 0));
    const formaPagamento = String(req.body.formaPagamento || "nao_informado").trim().toLocaleLowerCase("pt-BR");
    const formasPermitidas = new Set(["pix", "dinheiro", "boleto", "transferencia", "cartao", "vale", "nao_informado"]);
    if (!formasPermitidas.has(formaPagamento)) throw erroHttp("Forma de pagamento da compra inválida.", 400);
    if (!Number.isFinite(desconto) || desconto < 0 || total < 0) return res.status(400).json({ error: "Desconto inválido." });
    if (!Number.isFinite(valorPago) || valorPago < 0 || valorPago > total) return res.status(400).json({ error: "O valor pago deve estar entre zero e o total da compra." });
    if (formaPagamento === "vale" && valorPago >= total - 0.005) throw erroHttp("O Vale deve possuir saldo pendente. Para uma compra totalmente paga, selecione outra forma.", 400);
    if (valorPago < total - 0.005 && !/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.vencimento || ""))) throw erroHttp("Informe o vencimento do saldo pendente.", 400);
    const compraId = "comp_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    runInTransaction(() => {
      const orcamentoId = req.body.orcamentoCompraId ? String(req.body.orcamentoCompraId) : null;
      if (orcamentoId) {
        const orcamento = queryOne<any>("SELECT * FROM orcamentos_compra WHERE id = ? AND fornecedorId = ? AND status = 'aberto' AND deletedAt IS NULL", [orcamentoId, fornecedorId]);
        if (!orcamento) throw erroHttp("O orçamento informado não está aberto para este fornecedor.", 409);
      }
      const numero = Number(queryOne<any>("SELECT COALESCE(MAX(numeroSequencial), 0) + 1 AS numero FROM compras")?.numero || 1);
      const saldo = arredondarCompra(total - valorPago);
      execute(
        `INSERT INTO compras (id, numeroSequencial, fornecedorId, orcamentoCompraId, data, subtotal, desconto, total, valorPago, saldoRestante, status, formaPagamento, vencimento, observacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [compraId, numero, fornecedorId, orcamentoId, data, subtotal, desconto, total, valorPago, saldo, saldo <= 0.005 ? "paga" : "pendente", formaPagamento, req.body.vencimento || null, observacao || null]
      );
      for (const item of resolvidos) execute(
        `INSERT INTO itens_compra (id, compraId, produtoId, quantidade, unidade, custoUnitario, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["itc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16), compraId, item.produtoId, item.quantidade, item.unidade, item.custo, item.total]
      );
      if (valorPago > 0) execute(
        `INSERT INTO pagamentos_compra (id, fornecedorId, compraId, data, valor, formaPagamento, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["pagc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16), fornecedorId, compraId, data, valorPago, formaPagamento === "vale" ? "entrada" : formaPagamento, "Pagamento registrado na entrada"]
      );
      if (orcamentoId) execute("UPDATE orcamentos_compra SET status = 'convertido', compraId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [compraId, orcamentoId]);
      for (const item of resolvidos) {
        execute(
          `INSERT INTO fornecedor_produtos (fornecedorId, produtoId, custoFornecedor, ativo)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(fornecedorId, produtoId) DO UPDATE SET
             custoFornecedor = excluded.custoFornecedor,
             ativo = 1,
             updatedAt = CURRENT_TIMESTAMP`,
          [fornecedorId, item.produtoId, item.custo]
        );
        recalcularUltimoCustoProduto(item.produtoId);
      }
    });
    res.status(201).json(listarCompras("AND c.id = ?", [compraId])[0]);
  } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
});

app.put("/api/compras/:id", (req, res) => {
  try {
    const id = String(req.params.id);
    const { data, observacao } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ""))) return res.status(400).json({ error: "Informe uma data válida." });
    runInTransaction(() => {
      const compra = queryOne<any>("SELECT * FROM compras WHERE id = ? AND deletedAt IS NULL", [id]);
      if (!compra) throw erroHttp("Compra não encontrada.", 404);
      if (!req.body.updatedAt || String(req.body.updatedAt) !== String(compra.updatedAt)) {
        throw erroHttp("Esta compra foi alterada em outra tela. Recarregue o histórico antes de salvar.", 409);
      }
      const resolvidos = resolverItensCompraFornecedor(compra.fornecedorId, req.body.items, "custoUnitario");
      const subtotal = arredondarCompra(resolvidos.reduce((soma, item) => soma + item.total, 0));
      const desconto = arredondarCompra(Number(req.body.desconto || 0));
      const total = arredondarCompra(subtotal - desconto);
      if (!Number.isFinite(desconto) || desconto < 0 || total < 0) throw erroHttp("Desconto inválido.", 400);
      if (total + 0.005 < Number(compra.valorPago)) throw erroHttp("O total não pode ser menor que o valor já pago.", 400);

      const antigos = queryAll<{ produtoId: string }>("SELECT DISTINCT produtoId FROM itens_compra WHERE compraId = ?", [id]);
      execute("DELETE FROM itens_compra WHERE compraId = ?", [id]);
      for (const item of resolvidos) {
        execute(
          `INSERT INTO itens_compra (id, compraId, produtoId, quantidade, unidade, custoUnitario, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ["itc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16), id, item.produtoId, item.quantidade, item.unidade, item.custo, item.total]
        );
        execute(
          `INSERT INTO fornecedor_produtos (fornecedorId, produtoId, custoFornecedor, ativo)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(fornecedorId, produtoId) DO UPDATE SET custoFornecedor = excluded.custoFornecedor, ativo = 1, updatedAt = CURRENT_TIMESTAMP`,
          [compra.fornecedorId, item.produtoId, item.custo]
        );
      }
      const saldo = arredondarCompra(total - Number(compra.valorPago));
      execute(
        `UPDATE compras SET data = ?, subtotal = ?, desconto = ?, total = ?, saldoRestante = ?, status = ?, vencimento = ?, observacao = ?, updatedAt = ? WHERE id = ?`,
        [data, subtotal, desconto, total, saldo, saldo <= 0.005 ? "paga" : "pendente", req.body.vencimento || null, observacao || null, new Date().toISOString(), id]
      );
      const afetados = new Set([...antigos.map((item) => item.produtoId), ...resolvidos.map((item) => item.produtoId)]);
      for (const produtoId of afetados) {
        recalcularCustoFornecedorProduto(compra.fornecedorId, produtoId);
        recalcularUltimoCustoProduto(produtoId);
      }
    });
    res.json(listarCompras("AND c.id = ?", [id])[0]);
  } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
});

app.post("/api/compras/:id/pagamentos", (req, res) => {
  try {
    const valor = arredondarCompra(Number(req.body.valor));
    if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: "Informe um valor de pagamento válido." });
    const pagamentoId = "pagc_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    runInTransaction(() => {
      const compra = queryOne<any>("SELECT * FROM compras WHERE id = ? AND deletedAt IS NULL", [req.params.id]);
      if (!compra) throw erroHttp("Compra não encontrada.", 404);
      if (valor > Number(compra.saldoRestante) + 0.005) throw erroHttp("O pagamento ultrapassa o saldo da compra.", 400);
      const novoPago = arredondarCompra(Number(compra.valorPago) + valor);
      const saldo = arredondarCompra(Number(compra.total) - novoPago);
      execute(`INSERT INTO pagamentos_compra (id, fornecedorId, compraId, data, valor, formaPagamento, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pagamentoId, compra.fornecedorId, compra.id, req.body.data, valor, String(req.body.formaPagamento || "nao_informado"), req.body.observacao || null]);
      execute("UPDATE compras SET valorPago = ?, saldoRestante = ?, status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [novoPago, saldo, saldo <= 0.005 ? "paga" : "pendente", compra.id]);
    });
    const compra = listarCompras("AND c.id = ?", [req.params.id])[0];
    res.status(201).json({ pagamento: compra.pagamentos.find((item: any) => item.id === pagamentoId), compra });
  } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
});

app.post("/api/compras/:id/cancelar", (req, res) => {
  try {
    const { id } = req.params;
    const nowStr = new Date().toISOString();
    runInTransaction(() => {
      const compra = queryOne<{ id: string; fornecedorId: string }>("SELECT id, fornecedorId FROM compras WHERE id = ? AND deletedAt IS NULL", [id]);
      if (!compra) {
        throw erroHttp("Compra não encontrada ou já cancelada.", 404);
      }
      const produtosAfetados = queryAll<{ produtoId: string }>(
        "SELECT DISTINCT produtoId FROM itens_compra WHERE compraId = ?",
        [id]
      );
      execute("UPDATE compras SET deletedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [nowStr, id]);
      execute("UPDATE pagamentos_compra SET deletedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE compraId = ? AND deletedAt IS NULL", [nowStr, id]);
      for (const item of produtosAfetados) {
        recalcularCustoFornecedorProduto(compra.fornecedorId, item.produtoId);
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
    const { data, formaPagamento, observacao, alocacoes } = req.body;
    const arredondar = (valor: unknown) => Math.round(Number(valor || 0) * 100) / 100;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ""))) {
      throw erroHttp("Informe uma data válida para o recebimento.", 400);
    }
    if (!String(formaPagamento || "").trim()) {
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
    // Na carteira, cada valor aplicado é dinheiro efetivamente recebido.
    // Créditos de devolução são tratados quando a devolução reduz o vale.
    const recebido = totalAplicado;
    const bonusUtilizado = 0;
    const bonusGerado = 0;

    if (totalAplicado <= 0) {
      throw erroHttp("Informe o valor pago em pelo menos uma dívida.", 400);
    }

    const recebimentoId = "rec_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const pagamentoId = "pag_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

    runInTransaction(() => {
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
      execute(
        `INSERT INTO pagamentos (id, clienteId, vendaId, data, valor, formaPagamento, observacao, recebimentoId)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
        [pagamentoId, clienteId, data, recebido, formaPagamento, observacao || "Recebimento pela carteira do cliente", recebimentoId]
      );
      execute(
        `INSERT INTO recebimentos_cliente
         (id, clienteId, data, valorRecebido, valorAplicado, bonusUtilizado, bonusGerado, formaPagamento, observacao, pagamentoId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [recebimentoId, clienteId, data, recebido, totalAplicado, bonusUtilizado, bonusGerado, formaPagamento, observacao || null, pagamentoId]
      );

      for (const item of listaAlocacoes) {
        const venda = queryOne<any>("SELECT * FROM vendas WHERE id = ?", [item.vendaId])!;
        const novoPago = arredondar(Number(venda.valorPago) + item.valor);
        const novoSaldo = arredondar(Math.max(0, Number(venda.totalLiquido) - novoPago));
        execute(
          `UPDATE vendas SET valorPago = ?, saldoRestante = ?, status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
          [novoPago, novoSaldo, novoSaldo <= 0.005 ? "paga" : "pendente", item.vendaId]
        );
        recalcularParcelasVale(item.vendaId);
        execute(
          `INSERT INTO recebimento_alocacoes (id, recebimentoId, vendaId, valor) VALUES (?, ?, ?, ?)`,
          ["alo_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16), recebimentoId, item.vendaId, item.valor]
        );
      }

      registrarAuditoria(null, "registrar_recebimento", "recebimento_cliente", recebimentoId, {
        clienteId, recebido, totalAplicado, dividas: listaAlocacoes
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
        recalcularParcelasVale(venda.id);
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
        recalcularParcelasVale(vendaId);

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
          recalcularParcelasVale(v.id);

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
          recalcularParcelasVale(v.id);
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
          recalcularParcelasVale(v.id);

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
    const quantidadeDevolvidaSql = "COALESCE((SELECT SUM(idv.quantidade) FROM itens_devolucao idv WHERE idv.itemVendaId = iv.id), 0)";
    let itemFilters = [
      "v.deletedAt IS NULL",
      `(iv.quantidade - ${quantidadeDevolvidaSql}) > 0.005`
    ];
    let itemParams: any[] = [];
    if (startDate) { itemFilters.push("v.data >= ?"); itemParams.push(startDate); }
    if (endDate) { itemFilters.push("v.data <= ?"); itemParams.push(endDate); }
    if (clienteId) { itemFilters.push("v.clienteId = ?"); itemParams.push(clienteId); }
    if (produtoId) { itemFilters.push("iv.produtoId = ?"); itemParams.push(produtoId); }

    const itemWhere = "WHERE " + itemFilters.join(" AND ");
    const itensVendidos = queryAll<any>(
      `SELECT
         iv.*,
         p.custoPadrao AS custoAtualProduto,
         v.data,
         v.numeroSequencial,
         v.subtotal AS vendaSubtotal,
         v.desconto AS descontoVenda,
         c.nome as clienteNome,
         ${quantidadeDevolvidaSql} AS quantidadeDevolvida,
         (
           iv.total
           - CASE WHEN v.subtotal > 0 THEN v.desconto * (iv.total / v.subtotal) ELSE 0 END
         ) AS valorVendaLiquido,
         (
           SELECT f.nome
           FROM itens_compra ic
           JOIN compras cp ON cp.id = ic.compraId
           JOIN fornecedores f ON f.id = cp.fornecedorId
           WHERE ic.produtoId = iv.produtoId AND cp.deletedAt IS NULL
           ORDER BY cp.data DESC, cp.createdAt DESC, ic.id DESC
           LIMIT 1
         ) AS fornecedorNome
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       JOIN clientes c ON v.clienteId = c.id
       JOIN produtos p ON p.id = iv.produtoId
       ${itemWhere}
       ORDER BY v.data DESC`,
      itemParams
    ).map((item) => {
      const quantidadeOriginal = Number(item.quantidade || 0);
      const quantidade = Math.max(0, quantidadeOriginal - Number(item.quantidadeDevolvida || 0));
      const proporcao = quantidadeOriginal > 0 ? quantidade / quantidadeOriginal : 0;
      const custoUnitario = Number(item.custoUnitario) > 0
        ? Number(item.custoUnitario)
        : Number(item.custoAtualProduto || 0);
      const custoTotal = custoUnitario * quantidade;
      const valorVendaLiquido = Number(item.valorVendaLiquido || item.total || 0) * proporcao;
      return {
        ...item,
        quantidade,
        total: Number(item.total || 0) * proporcao,
        valorVendaLiquido,
        custoUnitario,
        custoTotal,
        lucroBruto: valorVendaLiquido - custoTotal
      };
    });

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
         iv.unidade,
         COALESCE(SUM(iv.quantidade - ${quantidadeDevolvidaSql}), 0) as totalQuantidade,
         COALESCE(SUM(
           (iv.total - CASE WHEN v.subtotal > 0 THEN v.desconto * (iv.total / v.subtotal) ELSE 0 END)
           * ((iv.quantidade - ${quantidadeDevolvidaSql}) / NULLIF(iv.quantidade, 0))
         ), 0) as totalValor,
         COALESCE(SUM(
           CASE WHEN iv.custoUnitario > 0
             THEN iv.custoUnitario * (iv.quantidade - ${quantidadeDevolvidaSql})
             ELSE (iv.quantidade - ${quantidadeDevolvidaSql}) * COALESCE(p.custoPadrao, 0)
           END
         ), 0) as totalCusto,
         COALESCE(SUM(
           (iv.total
           - CASE WHEN v.subtotal > 0 THEN v.desconto * (iv.total / v.subtotal) ELSE 0 END)
           * ((iv.quantidade - ${quantidadeDevolvidaSql}) / NULLIF(iv.quantidade, 0))
           - CASE WHEN iv.custoUnitario > 0
               THEN iv.custoUnitario * (iv.quantidade - ${quantidadeDevolvidaSql})
               ELSE (iv.quantidade - ${quantidadeDevolvidaSql}) * COALESCE(p.custoPadrao, 0)
             END
         ), 0) as totalLucro,
         COUNT(DISTINCT iv.vendaId) as totalVendas
       FROM itens_venda iv
       JOIN vendas v ON iv.vendaId = v.id
       JOIN produtos p ON p.id = iv.produtoId
       ${itemWhere}
       GROUP BY iv.produtoId, iv.descricao, iv.unidade
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
         printf('%04d', c.rowid) as clienteCodigo,
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
         v.*, c.nome as clienteNome, c.telefone as clienteTelefone,
         c.endereco as clienteEndereco, c.documento as clienteDocumento,
         COALESCE(
           (SELECT p.formaPagamento FROM pagamentos p WHERE p.vendaId = v.id AND p.deletedAt IS NULL ORDER BY p.createdAt ASC LIMIT 1),
           CASE WHEN v.saldoRestante > 0 THEN 'vale' ELSE NULL END
         ) as formaPagamento,
         CASE WHEN v.status = 'pendente' AND v.vencimento < ?
           THEN CAST(julianday(?) - julianday(v.vencimento) AS INTEGER) ELSE 0 END as diasAtraso
       FROM vendas v
       JOIN clientes c ON c.id = v.clienteId
       WHERE ${valeFilters.join(" AND ")}
       ORDER BY CASE WHEN v.status = 'pendente' THEN 0 ELSE 1 END,
                v.vencimento ASC, v.numeroSequencial DESC`,
      [hoje, hoje, ...valeParams]
    );
    carregarDetalhesVendasEmLote(vales);

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
    // Exit with a non-zero code so the Windows service (or another supervisor)
    // recognizes this as a restart request and starts a fresh process.
    // This is the absolute SAFEST way to prevent corrupt in-memory SQLite handles after a restore.
    res.json({ 
      success: true, 
      message: "Backup restaurado com sucesso! O servidor está reiniciando para carregar os dados novos." 
    });

    setTimeout(() => {
      console.log("Exiting to trigger container / tsx restart for database refresh...");
      process.exit(1);
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

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Rota da API não encontrada. Atualize o sistema e tente novamente." });
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
