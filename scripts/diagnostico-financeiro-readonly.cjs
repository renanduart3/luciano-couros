// Diagnóstico agregado: não inicializa o servidor, migra ou escreve na base.
// Uso: node scripts/diagnostico-financeiro-readonly.cjs caminho/database.db
const Database = require('better-sqlite3');
const path = require('node:path');
if (!process.argv[2]) throw new Error('Informe explicitamente a base para leitura.');
const arquivo = path.resolve(process.argv[2]);
const db = new Database(arquivo, { readonly: true, fileMustExist: true });
const consultas = {
  vendas: 'SELECT COUNT(*) n FROM vendas',
  ordens: 'SELECT COUNT(*) n FROM ordens_cobranca',
  recebimentos: 'SELECT COUNT(*) n FROM recebimentos_cliente',
  // Indícios para revisão, não autorização para reparar automaticamente.
  ordensCanceladasComRecebimentosAtivos: `SELECT COUNT(DISTINCT o.id) n FROM ordens_cobranca o
    JOIN ordem_cobranca_recebimentos v ON v.ordemId=o.id AND v.deletedAt IS NULL
    JOIN recebimentos_cliente r ON r.id=v.recebimentoId AND r.deletedAt IS NULL AND r.status='ativo'
    WHERE o.status='cancelada' AND o.deletedAt IS NULL`,
  ordensFinalizadasSemRecebimentoAtivoVinculado: `SELECT COUNT(*) n FROM ordens_cobranca o
    WHERE o.finalizadoAt IS NOT NULL AND o.deletedAt IS NULL AND NOT EXISTS (
      SELECT 1 FROM recebimentos_cliente r WHERE r.deletedAt IS NULL AND r.status='ativo' AND
      (r.ordemCobrancaId=o.id OR EXISTS (SELECT 1 FROM ordem_cobranca_recebimentos v
        WHERE v.ordemId=o.id AND v.recebimentoId=r.id AND v.deletedAt IS NULL)))`,
  residualAusente: `SELECT COUNT(*) n FROM ordens_cobranca o WHERE o.deletedAt IS NULL
    AND o.valeResidualId IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM vendas v WHERE v.id=o.valeResidualId AND v.deletedAt IS NULL)`,
  residualSemDescricao: `SELECT COUNT(*) n FROM vendas WHERE deletedAt IS NULL
    AND contabilizaReceita=0 AND valeOrigemIds IS NOT NULL AND TRIM(COALESCE(observacoes,''))=''`,
  alocacoesAtivasSemRecebimentoAtivo: `SELECT COUNT(*) n FROM recebimento_alocacoes a
    LEFT JOIN recebimentos_cliente r ON r.id=a.recebimentoId
    WHERE a.deletedAt IS NULL AND (r.id IS NULL OR r.deletedAt IS NOT NULL OR r.status<>'ativo')`,
  titulosAtivosSemRecebimentoAtivo: `SELECT COUNT(*) n FROM recebimento_titulos t
    LEFT JOIN recebimentos_cliente r ON r.id=t.recebimentoId
    WHERE t.deletedAt IS NULL AND (r.id IS NULL OR r.deletedAt IS NOT NULL OR r.status<>'ativo')`,
};
try {
  db.pragma('query_only = ON');
  const resultado = { arquivo, indicadores: {} };
  db.transaction(() => {
    for (const [nome, sql] of Object.entries(consultas)) {
      try { resultado.indicadores[nome] = db.prepare(sql).get().n; }
      catch (erro) { resultado.indicadores[nome] = { indisponivel: erro.message }; }
    }
  })();
  console.log(JSON.stringify(resultado, null, 2));
} finally { db.close(); }
