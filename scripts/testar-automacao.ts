import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { centralInicial } from "../src/lib/regrasAutomacao.js";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "luciano-automacao-"));
process.env.BACKUP_DIR = path.join(process.env.DATA_DIR, "backups");
process.env.TELEGRAM_BOT_TOKEN = "token-ficticio";
const { initDatabase, execute, queryOne } = await import("../server/db.js");
const { executarAutomacao, rotasAutomacao } = await import("../server/automacao.js");
initDatabase();
execute("INSERT INTO clientes (id,nome) VALUES ('cliente-test','Cliente de teste')");
execute("INSERT INTO usuarios (id,nome,perfil) VALUES ('vend-test','Vendedor de teste','vendedor')");
const diasAtras = (dias: number) => {
  const hoje = new Date();
  hoje.setDate(hoje.getDate() - dias);
  return hoje.toLocaleDateString("sv-SE");
};
for (const dias of [40, 41]) {
  execute(
    `INSERT INTO vendas(id,numeroSequencial,clienteId,vendedorId,data,subtotal,desconto,totalLiquido,valorPago,saldoRestante,status,vencimento)
    VALUES(?,?,'cliente-test','vend-test',?,100,0,100,0,100,'pendente',?)`,
    ["v" + dias, 99000 + dias, diasAtras(50), diasAtras(dias)],
  );
  execute(
    "INSERT INTO vale_parcelas(id,vendaId,numero,vencimento,valor,saldo,status) VALUES(?,?,1,?,100,100,'pendente')",
    ["p" + dias, "v" + dias, diasAtras(dias)],
  );
}
const app = express();
app.use(express.json(), rotasAutomacao());
const http = app.listen(0, "127.0.0.1");
const fetchLocal = fetch;
const requisicoes: { url: string; body: RequestInit["body"] }[] = [];
globalThis.fetch = async (url, opcoes) => {
  requisicoes.push({ url: String(url), body: opcoes?.body });
  if (String(url).includes("check-exists"))
    return Response.json({ numberExists: true, chatId: "5511999999999@c.us" });
  return Response.json({ ok: true, id: "id-ficticio" });
};
try {
  await new Promise<void>((resolve) => http.once("listening", resolve));
  const base = "http://127.0.0.1:" + (http.address() as AddressInfo).port;
  async function api(rota: string, method = "GET", dados?: unknown) {
    const resposta = await fetchLocal(base + rota, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const body = await resposta.json();
    assert.ok(resposta.ok, JSON.stringify(body));
    return body;
  }
  const cfg = {
    ...centralInicial,
    ativo: true,
    horario: "00:00",
    regras: { ...centralInicial.regras, observacao: "Ligar à tarde" },
  };
  assert.deepEqual((await api("/")).vendedores.map(p=>p.id), ["usuario_admin"]);
  const destinos = [{id:"usuario_admin",waha:"",telegram:""}, { id: "vend-test", waha: "5511999999999", telegram: "12345" }];
  await api("/", "PUT", { central: cfg, vendedores: destinos });
  await api("/clientes/cliente-test", "PUT", { atraso: 40, observacao: "" });
  assert.equal((await api("/previa"))[0].vendedor, "Administrador");
  const ficha = "/clientes/cliente-test";
  await api(ficha,"PUT",{destinatarios:[], atraso:40});
  await executarAutomacao();
  assert.equal(requisicoes.length,0);
  assert.equal((await api("/previa")).length,0);
  await api(ficha,"PUT",{destinatarios:["usuario_admin","vend-test","vend-test"], atraso:40});
  assert.deepEqual((await api("/previa")).map(p=>p.vendedor),["Administrador","Vendedor de teste"]);
  await api(ficha,"PUT",{destinatarios:null});
  assert.equal((await api("/previa"))[0].vendedor,"Administrador");
  await api(ficha,"PUT",{destinatarios:["vend-test"],atraso:40,observacao:""});
  const previa = await api("/previa");
  assert.equal(previa[0].vendedor,"Vendedor de teste");
  assert.equal(previa.length, 1);
  assert.match(previa[0].total, /100,00/);
  cfg.regras.minimo = 101;
  await api("/", "PUT", { central: cfg, vendedores: destinos });
  assert.equal((await api("/previa")).length, 0);
  assert.deepEqual((await api("/clientes/cliente-test")).excecoes, { atraso: 40, observacao: "" });
  await api("/clientes/cliente-test", "PUT", {});
  assert.match((await api("/previa"))[0].total, /200,00/);
  await executarAutomacao();
  assert.equal(requisicoes.length, 2);
  const arquivo = JSON.parse(requisicoes[1].body as string);
  assert.equal(arquivo.chatId, "5511999999999@c.us");
  assert.equal(Buffer.from(arquivo.file.data, "base64").subarray(0, 5).toString(), "%PDF-");
  await executarAutomacao();
  assert.equal(requisicoes.length, 2);
  execute("UPDATE automacao_envios SET dia=?", [diasAtras(6)]);
  await executarAutomacao();
  assert.equal(requisicoes.length, 2);
  execute("UPDATE automacao_envios SET dia=?", [diasAtras(7)]);
  await executarAutomacao();
  assert.equal(requisicoes.length, 4);
  await api("/testar", "POST", { canal: "telegram", id: "vend-test", formato: "imagem" });
  assert.ok(requisicoes.at(-1).url.endsWith("/sendPhoto"));
  const form = requisicoes.at(-1).body as FormData;
  assert.equal(form.get("chat_id"), "12345");
  assert.equal((form.get("photo") as File).type, "image/png");
  await api("/testar", "POST", { canal: "telegram", id: "vend-test", formato: "pdf" });
  assert.ok(requisicoes.at(-1).url.endsWith("/sendDocument"));
  assert.equal(queryOne<{ n: number }>("SELECT count(*) n FROM automacao_envios").n, 2);
  await api("/", "PUT", {central:cfg, vendedores:[]});
  assert.equal((await api("/previa")).length,0);
  assert.deepEqual((await api(ficha)).vendedores,[]);
  assert.equal((await fetchLocal(base+"/testar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"vend-test",canal:"telegram"})})).status,400);
  await api("/", "PUT", {central:cfg, vendedores:destinos});
  assert.deepEqual((await api(ficha)).destinatarios,[]);
  execute("UPDATE vale_parcelas SET status='paga',saldo=0");
  assert.equal((await api("/previa")).length, 0);
  console.log(
    "OK: herança, remoção de exceções, atraso estrito, saldo mínimo, periodicidade, PDF, imagem, destinos e baixas.",
  );
} finally {
  globalThis.fetch = fetchLocal;
  http.close();
}
