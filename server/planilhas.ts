import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne, runInTransaction } from './db.js';
import { CORES_CELULA, COLUNAS, LINHAS, MAX_PLANILHAS, MAX_TEXTO_CELULA, LARGURA_COLUNA_MIN, LARGURA_COLUNA_MAX, enderecoValido, type FormatoCelula } from '../src/lib/planilhas.js';

const falhar = (mensagem: string, statusCode = 400): never => { throw Object.assign(new Error(mensagem), { statusCode }); };
const nomeValido = (nome: unknown) => {
  if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 60) falhar('Informe um nome de até 60 caracteres.');
  return (nome as string).trim();
};
const carregar = (id: string) => {
  const registro = queryOne<any>('SELECT * FROM planilhas WHERE id = ?', [id]);
  if (!registro) falhar('Planilha não encontrada.', 404);
  return registro;
};
const apresentar = (registro: any) => ({ ...registro, celulas: JSON.parse(registro.celulas), moedas: JSON.parse(registro.moedas), formatos: JSON.parse(registro.formatos), larguras: JSON.parse(registro.larguras) });
const conferirVersao = (registro: any, versao: unknown) => {
  if (!Number.isInteger(versao) || registro.versao !== versao) falhar('Esta planilha foi alterada em outra sessão. Suas alterações foram mantidas na tela; confira a versão salva antes de substituir os dados.', 409);
};

export function rotasPlanilhas(validarSenha: (senha: unknown) => { id: string } | null,
  auditar: (usuarioId: string, acao: string, entidade: string, id: string, detalhes: Record<string, unknown>) => void) {
  const router = Router();
  router.get('/', (_req, res) => {
    try { res.json(queryAll('SELECT id,nome,versao,updatedAt FROM planilhas ORDER BY createdAt,rowid')); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  router.get('/:id', (req, res) => {
    try { res.json(apresentar(carregar(req.params.id))); }
    catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
  });
  router.post('/', (req, res) => {
    try {
      const nome = nomeValido(req.body?.nome);
      const registro = runInTransaction(() => {
        if (Number(queryOne<any>('SELECT COUNT(*) total FROM planilhas')?.total) >= MAX_PLANILHAS) falhar('O limite é de três planilhas. Exclua uma antes de criar outra.', 409);
        const id = crypto.randomUUID();
        execute('INSERT INTO planilhas (id,nome) VALUES (?,?)', [id, nome]);
        return carregar(id);
      });
      res.status(201).json(apresentar(registro));
    } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
  });
  router.put('/:id', (req, res) => {
    try {
      const { celulas, moedas, versao, formatos, larguras } = req.body || {};
      const nome = nomeValido(req.body?.nome);
      if (!celulas || typeof celulas !== 'object' || Array.isArray(celulas) || Object.keys(celulas).length > LINHAS * COLUNAS) falhar('Células inválidas.');
      const limpas: Record<string, string> = {};
      for (const [id, texto] of Object.entries(celulas)) {
        if (!enderecoValido(id) || typeof texto !== 'string' || texto.length > MAX_TEXTO_CELULA) falhar('Célula inválida: ' + id);
        if (texto !== '') limpas[id] = texto as string;
      }
      if (!Array.isArray(moedas) || moedas.length > LINHAS * COLUNAS || moedas.some(id => typeof id !== 'string' || !enderecoValido(id))) falhar('Formatação de células inválida.');
      const formatosValidos: Record<string, FormatoCelula> = {};
      if (formatos !== undefined) {
        if (!formatos || typeof formatos !== 'object' || Array.isArray(formatos) || Object.keys(formatos).length > LINHAS * COLUNAS) falhar('Formatação de células inválida.');
        for (const [id, formato] of Object.entries(formatos) as Array<[string, FormatoCelula]>) {
          if (!enderecoValido(id) || !formato || typeof formato !== 'object' || Array.isArray(formato)
            || Object.keys(formato).some(chave => chave !== 'negrito' && chave !== 'cor')
            || (formato.negrito !== undefined && typeof formato.negrito !== 'boolean')
            || (formato.cor !== undefined && !Object.hasOwn(CORES_CELULA, formato.cor))) falhar('Formatação inválida: ' + id);
          formatosValidos[id] = { ...formato };
        }
      }
      if (larguras !== undefined) {
        if (!larguras || typeof larguras !== 'object' || Array.isArray(larguras) || Object.keys(larguras).length > COLUNAS) falhar('Larguras de colunas inválidas.');
        for (const [coluna, largura] of Object.entries(larguras)) {
          if (!/^[A-J]$/.test(coluna) || typeof largura !== 'number' || !Number.isInteger(largura) || largura < LARGURA_COLUNA_MIN || largura > LARGURA_COLUNA_MAX) falhar('Largura inválida: ' + coluna);
        }
      }
      const registro = runInTransaction(() => {
        const atual = carregar(req.params.id);
        conferirVersao(atual, versao);
        execute('UPDATE planilhas SET nome=?,celulas=?,moedas=?,formatos=?,larguras=?,versao=versao+1,updatedAt=? WHERE id=?',
          [nome, JSON.stringify(limpas), JSON.stringify([...new Set(moedas)]), formatos === undefined ? atual.formatos : JSON.stringify(formatosValidos), larguras === undefined ? atual.larguras : JSON.stringify(larguras), new Date().toISOString(), req.params.id]);
        return carregar(req.params.id);
      });
      res.json(apresentar(registro));
    } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
  });
  for (const acao of ['limpar', 'excluir'] as const) {
    router.post('/:id/' + acao, (req, res) => {
      try {
        const usuario = validarSenha(req.body?.senha);
        if (!usuario) falhar('Senha do gerente inválida.', 403);
        const resultado = runInTransaction(() => {
          const atual = carregar(req.params.id);
          conferirVersao(atual, req.body?.versao);
          if (acao === 'limpar') execute("UPDATE planilhas SET celulas='{}',moedas='[]',formatos='{}',versao=versao+1,updatedAt=? WHERE id=?", [new Date().toISOString(), atual.id]);
          else execute('DELETE FROM planilhas WHERE id=?', [atual.id]);
          auditar(usuario.id, 'planilha_' + (acao === 'limpar' ? 'limpa' : 'excluida'), 'planilha', atual.id, { nome: atual.nome, versaoAnterior: atual.versao });
          return acao === 'limpar' ? apresentar(carregar(atual.id)) : { success: true };
        });
        res.json(resultado);
      } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
    });
  }
  return router;
}
