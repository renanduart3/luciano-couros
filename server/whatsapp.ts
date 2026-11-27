import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { DATA_DIR } from "./db.js";
import type { EstadoWhatsApp, PedidoWorker, RespostaWorker } from "./whatsappTipos.js";

export type SituacaoWhatsApp = {
  estado: EstadoWhatsApp;
  numero?: string;
  qr?: string;
  erro?: string;
  desde: string;
};
export type ArquivoWhatsApp = { nome: string; tipo: string; dados: Buffer };
export class FalhaWhatsApp extends Error {
  constructor(mensagem: string, public incerta = false) {
    super(mensagem);
  }
}

const PRAZO_ENVIO = 90000;
let filho: ChildProcess | undefined;
let situacao: SituacaoWhatsApp = { estado: "desconectado", desde: new Date().toISOString() };
let quedasSeguidas = 0;
let ultimaSubida = 0;
let encerrando = false;
let proximoId = 1;
const pendentes = new Map<number, { resolve: () => void; reject: (e: Error) => void; prazo: NodeJS.Timeout }>();

function caminhoWorker() {
  // Em produção roda a versão compilada; em desenvolvimento, o TypeScript via tsx.
  const compilado = path.join(process.cwd(), "dist", "whatsapp-worker.mjs");
  const producao = path.basename(process.argv[1] ?? "") === "server.cjs" || process.env.NODE_ENV === "production";
  if (producao && existsSync(compilado)) return { arquivo: compilado, execArgv: [] as string[] };
  return { arquivo: path.join(process.cwd(), "server", "whatsappWorker.ts"), execArgv: ["--import", "tsx"] };
}

function mudar(nova: Omit<SituacaoWhatsApp, "desde">) {
  const mudouEstado = nova.estado !== situacao.estado;
  situacao = { ...nova, desde: mudouEstado ? new Date().toISOString() : situacao.desde };
}

function falharPendentes(motivo: string) {
  for (const [id, p] of pendentes) {
    clearTimeout(p.prazo);
    p.reject(new FalhaWhatsApp(motivo, true));
    pendentes.delete(id);
  }
}

function subir() {
  if (encerrando || filho) return;
  const { arquivo, execArgv } = caminhoWorker();
  ultimaSubida = Date.now();
  const processo = fork(arquivo, [], {
    execArgv,
    env: { ...process.env, WHATSAPP_SESSAO_DIR: path.join(DATA_DIR, "whatsapp-sessao") },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  filho = processo;
  processo.stderr?.on("data", () => {
    // A saída da biblioteca é descartada; o estado chega pelo canal IPC.
  });
  processo.on("message", async (msg: RespostaWorker) => {
    if (msg.tipo === "estado") {
      const qr = msg.qr ? await QRCode.toDataURL(msg.qr, { margin: 1, width: 280 }).catch(() => undefined) : undefined;
      if (msg.estado === "conectado") quedasSeguidas = 0;
      mudar({ estado: msg.estado, numero: msg.numero, qr, erro: msg.erro });
    } else {
      const p = pendentes.get(msg.id);
      if (!p) return;
      clearTimeout(p.prazo);
      pendentes.delete(msg.id);
      if (msg.ok) p.resolve();
      else p.reject(new FalhaWhatsApp(msg.erro || "Falha no envio pelo WhatsApp."));
    }
  });
  processo.on("exit", () => {
    if (filho !== processo) return;
    filho = undefined;
    falharPendentes("O processo do WhatsApp reiniciou durante o envio. Confira o celular do vendedor.");
    if (encerrando) return;
    // Reinício automático com espera crescente, para não ficar em laço se a sessão estiver corrompida.
    if (Date.now() - ultimaSubida > 600000) quedasSeguidas = 0;
    const espera = Math.min(300000, 5000 * 2 ** quedasSeguidas++);
    mudar({ estado: "reiniciando", erro: "O WhatsApp parou e será reiniciado automaticamente." });
    setTimeout(subir, espera).unref();
  });
}

function pedir(pedido: PedidoWorker) {
  if (!filho) subir();
  filho?.send(pedido);
}

export const whatsapp = {
  iniciar() {
    subir();
    const parar = () => {
      encerrando = true;
      filho?.kill();
    };
    process.once("exit", parar);
  },
  situacao: () => situacao,
  conectado: () => situacao.estado === "conectado",
  conectar() {
    pedir({ tipo: "conectar" });
  },
  // Reinicia o processo inteiro: resolve travamentos sem apagar o pareamento.
  reconectar() {
    if (!filho) return subir();
    quedasSeguidas = 0;
    const antigo = filho;
    filho = undefined;
    falharPendentes("O WhatsApp foi reiniciado durante o envio. Confira o celular do vendedor.");
    antigo.removeAllListeners("exit");
    antigo.kill();
    mudar({ estado: "reiniciando" });
    subir();
  },
  // Desconecta o celular e apaga a sessão salva; o próximo pareamento pede um QR novo.
  limpar() {
    pedir({ tipo: "limpar" });
  },
  async enviar(numero: string, legenda: string, arquivo: ArquivoWhatsApp) {
    if (!filho || situacao.estado !== "conectado") throw new FalhaWhatsApp("WhatsApp desconectado.");
    const id = proximoId++;
    return new Promise<void>((resolve, reject) => {
      const prazo = setTimeout(() => {
        pendentes.delete(id);
        reject(new FalhaWhatsApp("Sem confirmação do WhatsApp.", true));
      }, PRAZO_ENVIO);
      pendentes.set(id, { resolve, reject, prazo });
      filho!.send({
        tipo: "enviar",
        id,
        numero,
        legenda,
        arquivo: { nome: arquivo.nome, tipo: arquivo.tipo, dados: arquivo.dados.toString("base64") },
      } satisfies PedidoWorker);
    });
  },
};
