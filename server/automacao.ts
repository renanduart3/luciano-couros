import { readFile } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import { db, execute, isMockModeEnabled, queryAll, queryOne, runInTransaction } from "./db.js";
import {
  centralInicial,
  centralSchema,
  destinatarioSchema,
  regrasSchema,
  type Central,
  type Destinatario,
  type PainelAutomacao,
  type Regras,
} from "../src/lib/regrasAutomacao.js";
import { enviarArquivo, enviarTextoTelegram, FalhaCanal, relatorioPdf } from "./canaisAutomacao.js";
import { whatsapp } from "./whatsapp.js";
import type { Canal } from "../src/lib/regrasAutomacao.js";

// ~7,5 MB de PNG; o parser JSON da rota aceita 12 MB.
const MAX_IMAGEM_BASE64 = 10_000_000;
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function config<T>(chave: string, inicial: T): T {
  const row = queryOne<{ dados: string }>("SELECT dados FROM automacao_config WHERE chave=?", [chave]);
  return row ? JSON.parse(row.dados) : inicial;
}
function gravar(chave: string, valor: unknown) {
  execute("INSERT OR REPLACE INTO automacao_config VALUES (?,?)", [chave, JSON.stringify(valor)]);
}
function central(): Central {
  const salva = config<Partial<Central>>("central", {});
  return { ...centralInicial, ...salva, regras: { ...centralInicial.regras, ...regrasAtuais(salva.regras) } };
}
function regrasAtuais(salvas: Partial<Regras> = {}): Partial<Regras> {
  return Object.fromEntries(Object.entries(salvas).filter(([campo]) => Object.hasOwn(regrasSchema.shape, campo)));
}
const excecoes = (id: string) => regrasAtuais(config<Partial<Regras>>("cliente/" + id, {}));
const usuariosAtivos = () =>
  queryAll<Destinatario>(`SELECT u.id,u.nome,u.perfil,coalesce(d.waha,'') waha,coalesce(d.telegram,'') telegram
 FROM usuarios u LEFT JOIN automacao_destinos d ON d.id=u.id WHERE u.ativo=1 AND u.perfil IN ('administrador','vendedor') ORDER BY u.createdAt,u.id`);
const listaCliente = (id: string) => config<string[] | null>("destinatarios/" + id, null);
const administrador = (pessoas: Destinatario[]) => pessoas.find(p => p.perfil === "administrador")?.id;
function vendedores(usuarios = usuariosAtivos()) {
  const ids = config<string[] | null>("contatosElegiveis", null);
  if (ids !== null) {
    const habilitados = new Set(ids);
    return usuarios.filter(p => habilitados.has(p.id));
  }
  // Primeira abertura da versão: preservar contatos e seleções individuais anteriores.
  const anteriores = queryAll<{id:string}>(`SELECT DISTINCT j.value id FROM automacao_config c,
    json_each(c.dados) j WHERE c.chave LIKE 'destinatarios/%' AND j.type='text'`);
  const selecionados = new Set(anteriores.map(p => p.id));
  return usuarios.filter(p => p.id === administrador(usuarios) || p.waha || p.telegram || selecionados.has(p.id));
}
function ficha(id: string) {
  const pessoas = vendedores();
  const lista = listaCliente(id);
  return {
    central: central(), excecoes: excecoes(id), vendedores: pessoas,
    destinatarios: lista === null ? null : lista.filter(id => pessoas.some(p => p.id === id)),
    administradorPadrao: administrador(pessoas),
  };
}
function painel(): PainelAutomacao {
  const usuarios = usuariosAtivos();
  return {
    central: central(),
    vendedores: vendedores(usuarios),
    usuariosDisponiveis: usuarios,
    historico: queryAll(`SELECT e.id,e.dia,c.nome cliente,u.nome vendedor,e.canal,e.estado,e.detalhe
    FROM automacao_envios e LEFT JOIN clientes c ON c.id=e.clienteId LEFT JOIN usuarios u ON u.id=e.vendedorId
    ORDER BY e.id DESC LIMIT 100`),
  };
}

interface Linha {
  clienteId: string;
  cliente: string;
  vale: number;
  parcela: number;
  vencimento: string;
  saldo: number;
}
function parcelas(dia: string) {
  return queryAll<Linha>(
    `SELECT c.id clienteId,c.nome cliente,v.numeroSequencial vale,
    p.numero parcela,p.vencimento,p.saldo FROM vale_parcelas p JOIN vendas v ON v.id=p.vendaId
    JOIN clientes c ON c.id=v.clienteId
    WHERE c.ativo=1 AND c.deletedAt IS NULL AND v.deletedAt IS NULL AND v.status<>'cancelada'
    AND v.finalizadoAt IS NULL AND p.deletedAt IS NULL AND p.status='pendente' AND p.saldo>0.005
    AND p.vencimento<? AND NOT EXISTS(SELECT 1 FROM ordem_cobranca_vales o WHERE o.vendaId=v.id AND o.ativo=1)
    ORDER BY c.nome,v.numeroSequencial,p.numero`,
    [dia],
  );
}
const diasEntre = (inicio: string, fim: string) => (Date.parse(fim) - Date.parse(inicio)) / 86400000;
export function agruparPendencias(
  linhas: Linha[],
  dia: string,
  padrao: Regras,
  individuais: (id: string) => Partial<Regras>,
) {
  const grupos = new Map<string, { itens: Linha[]; regras: Regras; centavos: number }>();
  const porCliente = new Map<string, Regras>();
  for (const linha of linhas) {
    const regras = porCliente.get(linha.clienteId) || { ...padrao, ...individuais(linha.clienteId) };
    porCliente.set(linha.clienteId, regras);
    if (!(diasEntre(linha.vencimento, dia) > regras.atraso)) continue;
    const chave = linha.clienteId;
    const grupo = grupos.get(chave) || { itens: [], regras, centavos: 0 };
    grupo.itens.push(linha);
    grupo.centavos += Math.round(linha.saldo * 100);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].filter((g) => g.centavos >= Math.round(g.regras.minimo * 100));
}
function entregasPrevistas(dia: string, cfg: Central) {
  const pessoas = vendedores();
  const ativos = new Map(pessoas.map(p => [p.id, p]));
  const padrao = administrador(pessoas);
  return agruparPendencias(parcelas(dia), dia, cfg.regras, excecoes).flatMap(grupo => {
    const ids = listaCliente(grupo.itens[0].clienteId) ?? (padrao ? [padrao] : []);
    return ids.filter(id => ativos.has(id)).map(id => ({grupo, pessoa: ativos.get(id)!}));
  });
}
function relogio() {
  const agora = new Date();
  return { dia: agora.toLocaleDateString("sv-SE"), hora: agora.toTimeString().slice(0, 5) };
}
function situacao(cliente: string, vendedor: string, dia: string, intervalo: number) {
  return queryOne(
    `SELECT id FROM automacao_envios WHERE clienteId=? AND vendedorId=? AND
    (estado IN ('em envio','conferir') OR dia=? OR (estado='enviado' AND julianday(?)-julianday(dia)<?)) LIMIT 1`,
    [cliente, vendedor, dia, dia, intervalo],
  );
}
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const canalOnline = (canal: Canal) => canal === "telegram" || whatsapp.conectado();
function canalDisponivel(cfg: Central, pessoa: Destinatario): Canal | undefined {
  const outro: Canal = cfg.canal === "waha" ? "telegram" : "waha";
  const ordem = cfg.reserva ? [cfg.canal, outro] : [cfg.canal];
  return ordem.find((canal) => pessoa[canal] && canalOnline(canal));
}
const PRAZO_ALERTA = 30 * 60000;
let quedaAvisada = "";
async function alertarQuedaWhatsApp(cfg: Central) {
  const { estado, desde } = whatsapp.situacao();
  const usaWhatsApp = cfg.ativo && cfg.canal === "waha";
  if (!usaWhatsApp || estado === "conectado" || quedaAvisada === desde) return;
  if (Date.now() - Date.parse(desde) < PRAZO_ALERTA) return;
  quedaAvisada = desde;
  const administradores = vendedores().filter((p) => p.perfil === "administrador" && p.telegram);
  for (const adm of administradores)
    await enviarTextoTelegram(
      adm.telegram,
      "O WhatsApp da automação de cobrança está desconectado há mais de 30 minutos. Abra Configurações → Automação para reconectar.",
    ).catch(() => undefined);
}
let trabalhando = false;
export async function executarAutomacao() {
  if (trabalhando || isMockModeEnabled()) return;
  trabalhando = true;
  try {
    const cfg = central();
    const { dia, hora } = relogio();
    await alertarQuedaWhatsApp(cfg);
    if (!cfg.ativo || hora < cfg.horario) return;
    for (const {grupo, pessoa} of entregasPrevistas(dia, cfg)) {
      if (!pessoa) continue;
      const { cliente, clienteId } = grupo.itens[0];
      const vendedorId = pessoa.id;
      const canal = canalDisponivel(cfg, pessoa);
      // Sem canal no ar, o relatório espera o próximo ciclo em vez de registrar falha.
      if (!canal || situacao(clienteId, vendedorId, dia, grupo.regras.periodicidade)) continue;
      const destino = pessoa[canal];
      // Apenas um envio por ciclo. O próximo ciclo relê baixas, regras e destinatários.
      const linhas = grupo.itens.map(
        (i) =>
          `Vale #${i.vale} · parcela ${i.parcela} · vencimento ${i.vencimento.split("-").reverse().join("/")} · ${moeda(i.saldo)}`,
      );
      linhas.push("Total vencido selecionado: " + moeda(grupo.centavos / 100));
      if (grupo.regras.observacao) linhas.push(grupo.regras.observacao);
      const arquivo = await relatorioPdf("Pendências de " + cliente, linhas);
      if (isMockModeEnabled()) return;
      const registro = execute(
        `INSERT OR IGNORE INTO automacao_envios(dia,clienteId,vendedorId,canal,estado) VALUES(?,?,?,?,'em envio')`,
        [dia, clienteId, vendedorId, canal],
      );
      if (!registro.changes) continue;
      // Captura o banco original mesmo se o usuário mudar para o modo de demonstração durante o POST.
      const atualizar = db.prepare("UPDATE automacao_envios SET estado=?, detalhe=? WHERE id=?");
      try {
        await enviarArquivo(
          canal,
          destino,
          "Confira as pendências de " + cliente + " no relatório.",
          arquivo,
        );
        atualizar.run("enviado", "", registro.lastInsertRowid);
      } catch (e) {
        atualizar.run(
          e instanceof FalhaCanal && !e.incerta ? "falhou" : "conferir",
          e instanceof FalhaCanal ? e.message : "Confira o recebimento antes de repetir.",
          registro.lastInsertRowid,
        );
      }
      return true;
    }
  } finally {
    trabalhando = false;
  }
}
export function rotasAutomacao() {
  const router = Router();
  router.get("/", (_req, res) => res.json(painel()));
  router.get("/whatsapp", (_req, res) => res.json(whatsapp.situacao()));
  router.post("/whatsapp/:acao", (req, res) => {
    const acao = req.params.acao;
    if (acao === "conectar") whatsapp.conectar();
    else if (acao === "reconectar") whatsapp.reconectar();
    else if (acao === "limpar") whatsapp.limpar();
    else return res.status(404).json({ error: "Ação desconhecida." });
    res.json(whatsapp.situacao());
  });
  router.put("/", (req, res) => {
    const dados = z
      .object({ central: centralSchema, vendedores: z.array(destinatarioSchema) })
      .safeParse(req.body);
    if (!dados.success)
      return res
        .status(400)
        .json({
          error: "Confira os parâmetros e destinos. Use apenas dígitos para telefone e chat privado.",
        });
    const ativos = new Set(usuariosAtivos().map((v) => v.id));
    const contatos = dados.data.vendedores;
    if (contatos.some((v) => !ativos.has(v.id)))
      return res.status(409).json({ error: "A lista de usuários mudou. Reabra a aba." });
    const idsElegiveis = new Set(contatos.map(p => p.id));
    if (idsElegiveis.size !== contatos.length) return res.status(400).json({error:"Contato repetido."});
    for (const canal of ["waha", "telegram"] as const) {
      const ids = contatos.map((v) => v[canal]).filter(Boolean);
      if (ids.length !== new Set(ids).size)
        return res.status(400).json({ error: "Cada vendedor deve ter seu próprio destino." });
    }
    runInTransaction(() => {
      gravar("central", dados.data.central);
      gravar("contatosElegiveis", [...idsElegiveis]);
      const listas = queryAll<{chave:string; dados:string}>(
        "SELECT chave,dados FROM automacao_config WHERE chave LIKE 'destinatarios/%' AND json_type(dados)='array'"
      );
      for (const lista of listas) {
        const antes: string[] = JSON.parse(lista.dados);
        const depois = antes.filter(id => idsElegiveis.has(id));
        if (antes.length !== depois.length) gravar(lista.chave, depois);
      }
      for (const v of contatos)
        execute("INSERT OR REPLACE INTO automacao_destinos VALUES(?,?,?)", [v.id, v.waha, v.telegram]);
    });
    res.json(painel());
  });
  router.use("/clientes/:id", (req, res, next) => {
    if (!queryOne("SELECT id FROM clientes WHERE id=? AND deletedAt IS NULL", [req.params.id]))
      return res.status(404).json({ error: "Cliente não encontrado." });
    next();
  });
  router.get("/clientes/:id", (req, res) =>
    res.json(ficha(req.params.id)),
  );
  router.put("/clientes/:id", (req, res) => {
    const dados = regrasSchema.partial().extend({destinatarios: z.array(z.string().min(1)).nullable().optional()}).safeParse(req.body);
    if (!dados.success)
      return res.status(400).json({ error: "Confira o intervalo, o atraso, o saldo e a orientação." });
    const {destinatarios, ...regras} = dados.data;
    const ativos = new Set(vendedores().map(p => p.id));
    if (destinatarios?.some(id => !ativos.has(id)))
      return res.status(409).json({error:"A lista de usuários ativos mudou. Reabra a ficha."});
    runInTransaction(() => {
      gravar("cliente/" + req.params.id, regras);
      if (destinatarios !== undefined)
        gravar("destinatarios/" + req.params.id, destinatarios === null ? null : [...new Set(destinatarios)]);
    });
    res.json(ficha(req.params.id));
  });
  router.get("/previa", (_req, res) => {
    const c = central(),
      { dia } = relogio();
    res.json(
      entregasPrevistas(dia, c).map(({grupo:g, pessoa:vendedor}) => {
        const i = g.itens[0];
        const canal = canalDisponivel(c, vendedor);
        return {
          cliente: i.cliente,
          vendedor: vendedor?.nome || "Sem vendedor ativo",
          total: moeda(g.centavos / 100),
          situacao: !canal
            ? vendedor[c.canal] ? "Canal desconectado" : "Sem destino"
            : situacao(i.clienteId, vendedor.id, dia, g.regras.periodicidade)
              ? "Aguardando intervalo ou revisão"
              : canal === c.canal ? "Elegível" : "Elegível pelo canal reserva",
        };
      }),
    );
  });
  router.post("/testar", async (req, res) => {
    const dados = z
      .object({
        canal: z.enum(["waha", "telegram"]),
        id: z.string(),
        formato: z.enum(["pdf", "imagem"]).default("pdf"),
      })
      .safeParse(req.body);
    if (!dados.success) return res.status(400).json({ error: "Selecione canal e vendedor." });
    const { canal, id } = dados.data,
      destino = vendedores().find((v) => v.id === id)?.[canal];
    if (!destino || isMockModeEnabled())
      return res.status(400).json({ error: "Salve o destino do vendedor e use a base normal para testar." });
    try {
      const arquivo =
        dados.data.formato === "imagem"
          ? { nome: "marca.png", tipo: "image/png", dados: await readFile("src/img/logo.png") }
          : await relatorioPdf("Teste da central", ["Relatório de exemplo, sem dados de clientes."]);
      await enviarArquivo(canal, destino, "Teste de envio da central.", arquivo);
      res.json({ ok: true });
    } catch (e) {
      res.status(502).json({ error: e instanceof FalhaCanal ? e.message : "Falha ao preparar o teste." });
    }
  });
  // Contatos com WhatsApp salvo, usados pelo envio manual de imagens (ex.: seleção da planilha).
  router.get("/contatos-whatsapp", (_req, res) =>
    res.json({
      conectado: whatsapp.conectado(),
      contatos: vendedores().filter(v => v.waha).map(({ id, nome, waha }) => ({ id, nome, numero: waha })),
    }),
  );
  router.post("/enviar-imagem", async (req, res) => {
    const dados = z
      .object({
        id: z.string().min(1),
        legenda: z.string().max(1000).default(""),
        nome: z.string().regex(/^[\w.-]{1,120}\.png$/).default("planilha.png"),
        imagem: z.string().min(1).max(MAX_IMAGEM_BASE64),
      })
      .safeParse(req.body);
    if (!dados.success) return res.status(400).json({ error: "Selecione o contato e gere a imagem novamente." });
    const destino = vendedores().find(v => v.id === dados.data.id)?.waha;
    if (!destino) return res.status(400).json({ error: "Este contato não tem WhatsApp salvo na Automação." });
    if (isMockModeEnabled()) return res.status(400).json({ error: "Use a base normal para enviar pelo WhatsApp." });
    const conteudo = Buffer.from(dados.data.imagem, "base64");
    if (!conteudo.subarray(0, 8).equals(ASSINATURA_PNG)) return res.status(400).json({ error: "A imagem enviada não é um PNG válido." });
    try {
      await enviarArquivo("waha", destino, dados.data.legenda.trim(), { nome: dados.data.nome, tipo: "image/png", dados: conteudo });
      res.json({ ok: true });
    } catch (e) {
      const incerta = e instanceof FalhaCanal && e.incerta;
      res.status(incerta ? 504 : 502).json({
        error: e instanceof FalhaCanal
          ? incerta ? e.message + " Confira no celular antes de reenviar." : e.message
          : "Falha ao enviar a imagem.",
      });
    }
  });
  router.post("/envios/:id/revisar", (req, res) => {
    if (trabalhando || !["recebido", "repetir"].includes(req.body?.acao))
      return res.status(409).json({ error: "Aguarde o fim do envio e selecione uma ação." });
    const condicao = "WHERE id=? AND estado IN ('em envio','conferir','falhou')";
    if (req.body.acao === "recebido")
      execute("UPDATE automacao_envios SET estado='enviado', detalhe='Confirmado pelo gerente' " + condicao, [
        req.params.id,
      ]);
    else execute("DELETE FROM automacao_envios " + condicao, [req.params.id]);
    res.json(painel());
  });
  return router;
}
