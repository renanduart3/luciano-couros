import "dotenv/config";
import PDFDocument from "pdfkit";
import type { Canal } from "../src/lib/regrasAutomacao.js";

export type Anexo = { nome: string; tipo: string; dados: Buffer };
export async function relatorioPdf(titulo: string, linhas: string[]): Promise<Anexo> {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const partes: Buffer[] = [];
  const dados = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (parte) => partes.push(parte));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
  });
  doc.fontSize(17).text(titulo).moveDown();
  for (const linha of linhas) doc.fontSize(11).text(linha).moveDown(0.4);
  doc.end();
  return { nome: "pendencias.pdf", tipo: "application/pdf", dados: await dados };
}

export class FalhaCanal extends Error {
  constructor(
    mensagem: string,
    public incerta = false,
  ) {
    super(mensagem);
  }
}

export async function enviarArquivo(canal: Canal, destino: string, legenda: string, arquivo: Anexo) {
  const foto = arquivo.tipo.startsWith("image/");
  if (canal === "telegram") {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new FalhaCanal("Configure TELEGRAM_BOT_TOKEN no servidor.");
    const form = new FormData();
    form.set("chat_id", destino);
    form.set("caption", legenda);
    form.set(
      foto ? "photo" : "document",
      new Blob([new Uint8Array(arquivo.dados)], { type: arquivo.tipo }),
      arquivo.nome,
    );
    await chamada(
      "https://api.telegram.org/bot" + token + (foto ? "/sendPhoto" : "/sendDocument"),
      { method: "POST", body: form },
      true,
    );
    return;
  }
  const base = (process.env.WAHA_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
  const session = process.env.WAHA_SESSION || "default";
  const headers = { "Content-Type": "application/json", "X-Api-Key": process.env.WAHA_API_KEY || "" };
  const contato = await chamada(
    base + "/api/contacts/check-exists?" + new URLSearchParams({ session, phone: destino }),
    { headers },
    false,
  );
  if (!contato.numberExists || !contato.chatId) throw new FalhaCanal("Número não encontrado no WhatsApp.");
  await chamada(
    base + (foto ? "/api/sendImage" : "/api/sendFile"),
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        session,
        chatId: contato.chatId,
        caption: legenda,
        file: { filename: arquivo.nome, mimetype: arquivo.tipo, data: arquivo.dados.toString("base64") },
      }),
    },
    true,
  );
}

async function chamada(url: string, opcoes: RequestInit, envio: boolean) {
  let resposta: Response;
  try {
    resposta = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(30000) });
  } catch {
    throw new FalhaCanal("Sem confirmação de conexão com o canal.", envio);
  }
  if (!resposta.ok)
    throw new FalhaCanal("O canal respondeu HTTP " + resposta.status + ".", envio && resposta.status >= 500);
  try {
    return await resposta.json();
  } catch {
    throw new FalhaCanal("Resposta do canal ilegível.", envio);
  }
}
