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
import { enviarArquivo, FalhaCanal, relatorioPdf } from "./canaisAutomacao.js";

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
const vendedores = () =>
  queryAll<Destinatario>(`SELECT u.id,u.nome,coalesce(d.waha,'') waha,coalesce(d.telegram,'') telegram
 FROM usuarios u LEFT JOIN automacao_destinos d ON d.id=u.id WHERE u.ativo=1 ORDER BY u.nome`);
function painel(): PainelAutomacao {
  return {
    central: central(),
    vendedores: vendedores(),
    historico: queryAll(`SELECT e.id,e.dia,c.nome cliente,u.nome vendedor,e.canal,e.estado,e.detalhe
    FROM automacao_envios e LEFT JOIN clientes c ON c.id=e.clienteId LEFT JOIN usuarios u ON u.id=e.vendedorId
    ORDER BY e.id DESC LIMIT 100`),
  };
}

interface Linha {
  clienteId: string;
  cliente: string;
  vendedorId: string;
  vale: number;
  parcela: number;
  vencimento: string;
  saldo: number;
}
function parcelas(dia: string) {
  return queryAll<Linha>(
    `SELECT c.id clienteId,c.nome cliente,v.vendedorId,v.numeroSequencial vale,
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
    const chave = JSON.stringify([linha.clienteId, linha.vendedorId]);
    const grupo = grupos.get(chave) || { itens: [], regras, centavos: 0 };
    grupo.itens.push(linha);
    grupo.centavos += Math.round(linha.saldo * 100);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].filter((g) => g.centavos >= Math.round(g.regras.minimo * 100));
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
let trabalhando = false;
export async function executarAutomacao() {
  if (trabalhando || isMockModeEnabled()) return;
  trabalhando = true;
  try {
    const cfg = central();
    const { dia, hora } = relogio();
    if (!cfg.ativo || hora < cfg.horario) return;
    const destinos = new Map(vendedores().map((v) => [v.id, v]));
    const grupos = agruparPendencias(parcelas(dia), dia, cfg.regras, excecoes);
    for (const grupo of grupos) {
      const { cliente, clienteId, vendedorId } = grupo.itens[0];
      const destino = destinos.get(vendedorId)?.[cfg.canal];
      if (!destino || situacao(clienteId, vendedorId, dia, grupo.regras.periodicidade)) continue;
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
        [dia, clienteId, vendedorId, cfg.canal],
      );
      if (!registro.changes) continue;
      // Captura o banco original mesmo se o usuário mudar para o modo de demonstração durante o POST.
      const atualizar = db.prepare("UPDATE automacao_envios SET estado=?, detalhe=? WHERE id=?");
      try {
        await enviarArquivo(
          cfg.canal,
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
    const ativos = new Set(vendedores().map((v) => v.id));
    const contatos = dados.data.vendedores;
    if (contatos.some((v) => !ativos.has(v.id)))
      return res.status(409).json({ error: "A lista de usuários mudou. Reabra a aba." });
    for (const canal of ["waha", "telegram"] as const) {
      const ids = contatos.map((v) => v[canal]).filter(Boolean);
      if (ids.length !== new Set(ids).size)
        return res.status(400).json({ error: "Cada vendedor deve ter seu próprio destino." });
    }
    runInTransaction(() => {
      gravar("central", dados.data.central);
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
    res.json({ central: central(), excecoes: excecoes(req.params.id) }),
  );
  router.put("/clientes/:id", (req, res) => {
    const dados = regrasSchema.partial().safeParse(req.body);
    if (!dados.success)
      return res.status(400).json({ error: "Confira o intervalo, o atraso, o saldo e a orientação." });
    gravar("cliente/" + req.params.id, dados.data);
    res.json({ central: central(), excecoes: dados.data });
  });
  router.get("/previa", (_req, res) => {
    const c = central(),
      { dia } = relogio(),
      destinos = vendedores();
    res.json(
      agruparPendencias(parcelas(dia), dia, c.regras, excecoes).map((g) => {
        const i = g.itens[0],
          vendedor = destinos.find((v) => v.id === i.vendedorId);
        return {
          cliente: i.cliente,
          vendedor: vendedor?.nome || "Sem vendedor ativo",
          total: moeda(g.centavos / 100),
          situacao: !vendedor?.[c.canal]
            ? "Sem destino"
            : situacao(i.clienteId, i.vendedorId, dia, g.regras.periodicidade)
              ? "Aguardando intervalo ou revisão"
              : "Elegível",
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
