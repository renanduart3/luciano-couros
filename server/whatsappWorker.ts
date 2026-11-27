// Processo filho do WhatsApp. Uma falha aqui não derruba o servidor principal.
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "baileys";
import pino from "pino";
import type { EstadoWhatsApp, PedidoWorker, RespostaWorker } from "./whatsappTipos.js";

const pasta = process.env.WHATSAPP_SESSAO_DIR;
if (!pasta || !process.send) process.exit(1);
const responder = (mensagem: RespostaWorker) => process.send?.(mensagem);
const logger = pino({ level: "silent" });

let sock: WASocket | undefined;
let estado: EstadoWhatsApp = "desconectado";
let tentativas = 0;
let qrsExibidos = 0;
let religar: NodeJS.Timeout | undefined;
const temSessao = () => existsSync(path.join(pasta!, "creds.json"));

function informar(novo: EstadoWhatsApp, extra: { qr?: string; erro?: string } = {}) {
  estado = novo;
  const numero = sock?.user?.id?.split(":")[0]?.split("@")[0];
  responder({ tipo: "estado", estado, numero: novo === "conectado" ? numero : undefined, ...extra });
}

function encerrarSocket() {
  clearTimeout(religar);
  const atual = sock;
  sock = undefined;
  try {
    atual?.ev.removeAllListeners("connection.update");
    atual?.end(undefined);
  } catch {
    // O socket já estava fechado.
  }
}

async function conectar() {
  encerrarSocket();
  informar("conectando");
  const { state, saveCreds } = await useMultiFileAuthState(pasta!);
  const versao = await fetchLatestBaileysVersion().then((v) => v.version).catch(() => undefined);
  const novo = makeWASocket({
    auth: state,
    version: versao,
    logger,
    browser: Browsers.windows("Luciano Couros"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
  });
  sock = novo;
  novo.ev.on("creds.update", saveCreds);
  novo.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (sock !== novo) return;
    if (qr) {
      // Cada QR vale cerca de 20 s. Depois de alguns, espera o gerente pedir de novo.
      if (++qrsExibidos > 5) {
        encerrarSocket();
        return informar("desconectado", { erro: "O QR expirou. Clique em Conectar para gerar outro." });
      }
      return informar("qr", { qr });
    }
    if (connection === "open") {
      tentativas = 0;
      qrsExibidos = 0;
      return informar("conectado");
    }
    if (connection !== "close") return;
    const codigo = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
    if (codigo === DisconnectReason.loggedOut || codigo === DisconnectReason.forbidden) {
      encerrarSocket();
      rmSync(pasta!, { recursive: true, force: true });
      return informar("desconectado", { erro: "O celular desconectou o sistema. Leia o QR novamente." });
    }
    if (codigo === DisconnectReason.connectionReplaced) {
      encerrarSocket();
      return informar("desconectado", { erro: "Outra conexão assumiu esta sessão. Clique em Reconectar." });
    }
    if (!temSessao()) {
      encerrarSocket();
      return informar("desconectado");
    }
    // Queda de rede ou reinício pedido pelo WhatsApp: tenta de novo com espera crescente.
    const espera = codigo === DisconnectReason.restartRequired ? 0 : Math.min(300000, 2000 * 2 ** tentativas++);
    informar("conectando", { erro: espera ? "Conexão perdida. Tentando novamente." : undefined });
    religar = setTimeout(() => void conectar().catch(falhaConexao), espera);
  });
}

function falhaConexao(e: unknown) {
  encerrarSocket();
  informar("desconectado", { erro: e instanceof Error ? e.message : "Falha ao conectar." });
}

async function enviar(pedido: Extract<PedidoWorker, { tipo: "enviar" }>) {
  if (!sock || estado !== "conectado") throw new Error("WhatsApp desconectado.");
  const [contato] = (await sock.onWhatsApp(pedido.numero)) ?? [];
  if (!contato?.exists) throw new Error("Número não encontrado no WhatsApp.");
  const dados = Buffer.from(pedido.arquivo.dados, "base64");
  await sock.sendMessage(
    contato.jid,
    pedido.arquivo.tipo.startsWith("image/")
      ? { image: dados, caption: pedido.legenda, mimetype: pedido.arquivo.tipo }
      : { document: dados, caption: pedido.legenda, mimetype: pedido.arquivo.tipo, fileName: pedido.arquivo.nome },
  );
}

process.on("message", async (pedido: PedidoWorker) => {
  try {
    if (pedido.tipo === "conectar") {
      qrsExibidos = 0;
      tentativas = 0;
      await conectar();
    } else if (pedido.tipo === "limpar") {
      try {
        await sock?.logout();
      } catch {
        // Sem conexão, basta apagar a sessão local.
      }
      encerrarSocket();
      rmSync(pasta!, { recursive: true, force: true });
      informar("desconectado");
    } else if (pedido.tipo === "enviar") {
      try {
        await enviar(pedido);
        responder({ tipo: "resultado", id: pedido.id, ok: true });
      } catch (e) {
        responder({ tipo: "resultado", id: pedido.id, ok: false, erro: e instanceof Error ? e.message : "Falha no envio." });
      }
    }
  } catch (e) {
    falhaConexao(e);
  }
});
// Sem o processo principal, este processo não tem por que continuar.
process.on("disconnect", () => process.exit(0));
process.on("uncaughtException", (e) => {
  responder({ tipo: "estado", estado: "desconectado", erro: "Erro interno do WhatsApp: " + e.message });
  process.exit(1);
});
process.on("unhandledRejection", () => {
  // Baileys às vezes rejeita promessas internas após a queda; a reconexão trata o estado.
});

if (temSessao()) void conectar().catch(falhaConexao);
else informar("desconectado");
