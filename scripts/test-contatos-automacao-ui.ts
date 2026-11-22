import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { buildSync } from "esbuild";
import express from "express";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "teste-contatos-"));
process.env.BACKUP_DIR = path.join(process.env.DATA_DIR, "backups");
const { execute, initDatabase } = await import("../server/db.js");
const { rotasAutomacao } = await import("../server/automacao.js");
initDatabase();
execute("INSERT INTO usuarios(id,nome,perfil) VALUES('vendedor-ui','Vendedor do teste','vendedor')");
const script = buildSync({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { AutomacaoView } from './src/components/AutomacaoView';
    createRoot(document.querySelector('main')).render(<AutomacaoView />);
  ` },
  bundle: true, write: false, platform:"browser",
}).outputFiles[0].text;
const app = express();
app.use(express.json());
app.use("/api/automacao", rotasAutomacao());
app.get("/", (_req,res) => res.send('<main></main><script src="/app.js"></script>'));
app.get("/app.js", (_req,res) => res.type("js").send(script));
const http = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => http.once("listening",resolve));
try {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try {
    const page = await browser.newPage();
    const url = "http://127.0.0.1:" + (http.address() as AddressInfo).port;
    await page.goto(url);
    const cadastrados = page.getByRole("combobox",{name:/Contato cadastrado/});
    const disponiveis = page.getByLabel("Pessoa para adicionar");
    const whats = page.getByLabel("WhatsApp com DDI e DDD");
    const telegram = page.getByLabel("ID do chat privado no Telegram");
    const clicar = (name:string) => page.getByRole("button",{name,exact:true}).click();
    async function salvar() {
      await clicar("Salvar configurações");
      await page.getByText("Configurações salvas.",{exact:true}).waitFor();
    }
    await disponiveis.selectOption("vendedor-ui");
    await clicar("Adicionar contato");
    assert.equal(await cadastrados.inputValue(),"vendedor-ui");
    assert.ok(await whats.isDisabled());
    await clicar("Editar contato");
    await whats.fill("5511999999876");
    await telegram.fill("43210");
    await cadastrados.selectOption("usuario_admin");
    assert.equal(await whats.inputValue(),"");
    assert.ok(await telegram.isDisabled());
    await cadastrados.selectOption("vendedor-ui");
    assert.equal(await telegram.inputValue(),"43210");
    await salvar();
    await page.reload();
    await cadastrados.selectOption("vendedor-ui");
    assert.equal(await whats.inputValue(),"5511999999876");
    await clicar("Editar contato");
    await telegram.fill("54321");
    await salvar();
    assert.ok(await telegram.isDisabled());
    await clicar("Remover contato");
    await salvar();
    await page.reload();
    await cadastrados.waitFor();
    assert.equal(await cadastrados.locator('option[value="vendedor-ui"]').count(),0);
    await disponiveis.selectOption("vendedor-ui");
    await clicar("Adicionar contato");
    assert.equal(await telegram.inputValue(),"54321");
    assert.equal(await whats.inputValue(),"5511999999876");
    console.log("OK: inclusão, seleção, edição, troca de contato, persistência, remoção e reinclusão no navegador.");
  } finally {await browser.close();}
} finally { http.close(); }
