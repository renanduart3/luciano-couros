import React, { useEffect, useState } from "react";
import { handleResponse } from "../lib/api";
import { camposRegras, canais, type Canal, type PainelAutomacao, type Regras } from "../lib/regrasAutomacao";

const controle =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500";
const botao = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const nomes = { waha: "WhatsApp (WAHA + NOWEB)", telegram: "Telegram" };
const campos = Object.keys(camposRegras) as (keyof Regras)[];
const chamar = <T,>(rota: string, method = "GET", dados?: unknown) =>
  fetch("/api/automacao" + rota, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  }).then((r) => handleResponse<T>(r));
type Previa = { cliente: string; vendedor: string; total: string; situacao: string };

export function AutomacaoView({ clienteId }: { clienteId?: string }) {
  const rota = clienteId ? "/clientes/" + encodeURIComponent(clienteId) : "";
  const [painel, setPainel] = useState<PainelAutomacao>();
  const [mensagem, setMensagem] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [teste, setTeste] = useState("");
  const [formato, setFormato] = useState("pdf");
  const [canalTeste, setCanalTeste] = useState<Canal>("waha");
  const [previa, setPrevia] = useState<Previa[]>();
  const [alterado, setAlterado] = useState(false);
  useEffect(() => {
    let atual = true;
    chamar<PainelAutomacao>(rota)
      .then((p) => {
        if (atual) setPainel(p);
      })
      .catch((e) => {
        if (atual) setMensagem(e.message);
      });
    return () => {
      atual = false;
    };
  }, [rota]);
  async function agir(fn: () => Promise<void>) {
    setOcupado(true);
    setMensagem("");
    try {
      await fn();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setOcupado(false);
    }
  }
  if (!painel) return <p role="status">{mensagem || "Carregando automação…"}</p>;
  const { central, vendedores = [], excecoes = {} } = painel;
  function mudar(p: PainelAutomacao) {
    setPainel(p);
    setAlterado(true);
    setPrevia(undefined);
    setMensagem("");
  }
  function regra(campo: keyof Regras, valor: string | number | undefined) {
    if (clienteId) {
      const novos = { ...excecoes, [campo]: valor };
      if (valor === undefined) delete novos[campo];
      mudar({ ...painel, excecoes: novos });
    } else mudar({ ...painel, central: { ...central, regras: { ...central.regras, [campo]: valor } } });
  }
  return (
    <section className="space-y-4 rounded-xl bg-white p-4">
      <h3 className="text-lg font-bold">{clienteId ? "Regras deste cliente" : "Automação de cobrança"}</h3>
      <fieldset disabled={ocupado} className="space-y-4">
        {!clienteId && (
          <div className="flex flex-wrap items-center gap-4">
            <label>
              <input
                type="checkbox"
                checked={central.ativo}
                onChange={(e) => mudar({ ...painel, central: { ...central, ativo: e.target.checked } })}
              />{" "}
              Ativar envios automáticos
            </label>
            <label>
              Canal de envio{" "}
              <select
                className={controle}
                value={central.canal}
                onChange={(e) =>
                  mudar({ ...painel, central: { ...central, canal: e.target.value as Canal } })
                }
              >
                {canais.map((c) => (
                  <option value={c} key={c}>
                    {nomes[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Enviar a partir de{" "}
              <input
                aria-label="Horário local do servidor"
                className={controle}
                type="time"
                value={central.horario}
                onChange={(e) => mudar({ ...painel, central: { ...central, horario: e.target.value } })}
              />
            </label>
          </div>
        )}
        <p className="text-sm text-slate-600">
          {clienteId
            ? "Marque apenas os campos que devem ter uma regra própria. Os demais acompanham o padrão geral."
            : "Padrão para todos os clientes. O relatório reúne as parcelas de vales vencidas e em aberto de cada cliente. Vales em ordem de cobrança ativa ficam fora."}
        </p>
        {clienteId && (
          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 font-bold">Quem recebe os avisos deste cliente</legend>
            {vendedores.map(pessoa => {
              const selecionados = painel.destinatarios ?? (painel.administradorPadrao ? [painel.administradorPadrao] : []);
              return <label key={pessoa.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selecionados.includes(pessoa.id)}
                  onChange={e => mudar({...painel, destinatarios: e.target.checked
                    ? [...selecionados, pessoa.id] : selecionados.filter(id => id !== pessoa.id)})}/>
                {pessoa.nome} · {pessoa.perfil === "administrador" ? "Administrador" : "Vendedor"}
              </label>;
            })}
            {painel.destinatarios == null ? <p className="text-xs text-slate-600">Padrão do cliente: administrador.</p> :
              <button type="button" className={botao} onClick={() => mudar({...painel, destinatarios:null})}>Restaurar administrador padrão</button>}
            {painel.destinatarios?.length === 0 && <p className="text-sm">Nenhum destinatário. Os avisos deste cliente ficam suspensos.</p>}
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {campos.map((campo) => {
            const individual = Object.hasOwn(excecoes, campo);
            const valor = individual ? excecoes[campo] : central.regras[campo];
            return (
              <div key={campo} className="flex flex-col gap-1">
                <label htmlFor={rota + campo} className="text-sm font-semibold">
                  {camposRegras[campo]}
                </label>
                {clienteId && (
                  <label className="text-xs">
                    <input
                      type="checkbox"
                      checked={individual}
                      onChange={(e) => regra(campo, e.target.checked ? central.regras[campo] : undefined)}
                    />{" "}
                    Personalizar
                  </label>
                )}
                {campo === "observacao" ? (
                  <textarea
                    id={rota + campo}
                    className={controle}
                    disabled={!!clienteId && !individual}
                    maxLength={500}
                    placeholder="Sem observação"
                    value={valor ?? ""}
                    onChange={(e) => regra(campo, e.target.value)}
                  />
                ) : (
                  <input
                    id={rota + campo}
                    className={controle}
                    disabled={!!clienteId && !individual}
                    type="number"
                    min={campo === "periodicidade" ? 1 : 0}
                    step={campo === "minimo" ? 0.01 : 1}
                    value={Number.isNaN(valor) ? "" : valor}
                    onChange={(e) => regra(campo, e.target.valueAsNumber)}
                  />
                )}
              </div>
            );
          })}
        </div>
        {!clienteId && (
          <div className="space-y-3">
            <h4 className="font-bold">Contatos para envio</h4>
            <p className="text-sm text-slate-600">
              Use o telefone com DDI e DDD. No Telegram, o vendedor deve iniciar o bot antes do teste. Informe
              o ID da conversa privada.
            </p>
            {vendedores.map((v) => (
              <div key={v.id} className="grid items-center gap-2 sm:grid-cols-3">
                <strong>{v.nome}</strong>
                {canais.map((c) => (
                  <label key={c} className="grid text-xs">
                    {c === "waha" ? "Telefone WhatsApp" : "ID do chat Telegram"}
                    <input
                      className={controle}
                      inputMode="numeric"
                      value={v[c]}
                      onChange={(e) =>
                        mudar({
                          ...painel,
                          vendedores: vendedores.map((item) =>
                            item.id === v.id ? { ...item, [c]: e.target.value.trim() } : item,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
        <button
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          disabled={!alterado}
          onClick={() =>
            agir(async () => {
              const p = await chamar<PainelAutomacao>(
                rota,
                "PUT",
                clienteId
                  ? { ...excecoes, destinatarios: painel.destinatarios }
                  : {
                      central,
                      vendedores: vendedores.map(({ id, waha, telegram }) => ({ id, waha, telegram })),
                    },
              );
              setPainel(p);
              setAlterado(false);
              setMensagem("Configurações salvas.");
            })
          }
        >
          Salvar {clienteId ? "regras do cliente" : "configurações"}
        </button>
        {!clienteId && (
          <div className="space-y-3 border-t pt-3">
            <h4 className="font-bold">Teste de envio</h4>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Canal de teste"
                className={controle}
                value={canalTeste}
                onChange={(e) => setCanalTeste(e.target.value as Canal)}
              >
                {canais.map((c) => (
                  <option value={c} key={c}>
                    {nomes[c]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Vendedor de teste"
                className={controle}
                value={teste}
                onChange={(e) => setTeste(e.target.value)}
              >
                <option value="">Selecione o vendedor</option>
                {vendedores.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
              <select
                aria-label="Formato de teste"
                className={controle}
                value={formato}
                onChange={(e) => setFormato(e.target.value)}
              >
                <option value="pdf">PDF de exemplo</option>
                <option value="imagem">Imagem da loja</option>
              </select>
              <button
                className={botao}
                disabled={!teste || alterado}
                onClick={() =>
                  agir(async () => {
                    await chamar("/testar", "POST", { id: teste, canal: canalTeste, formato });
                    setMensagem("Arquivo de teste aceito pelo canal.");
                  })
                }
              >
                Enviar teste
              </button>
            </div>
            <button
              className={botao}
              disabled={alterado}
              onClick={() => agir(async () => setPrevia(await chamar<Previa[]>("/previa")))}
            >
              Ver prévia das cobranças
            </button>
            {previa && (
              <div className="space-y-1 text-sm">
                {previa.length === 0
                  ? "Nenhuma parcela atende às regras."
                  : previa.map((p, i) => (
                      <p key={i}>
                        {p.cliente} · {p.vendedor} · {p.total} · {p.situacao}
                      </p>
                    ))}
              </div>
            )}
            <h4 className="font-bold">Últimos envios</h4>
            <button
              className={botao}
              disabled={alterado}
              onClick={() => agir(async () => setPainel(await chamar<PainelAutomacao>("")))}
            >
              Atualizar histórico
            </button>
            {!painel.historico?.length && <p className="text-sm">Nenhum envio automático registrado.</p>}
            {painel.historico?.map((h) => (
              <div key={h.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                {h.dia} · {h.cliente} → {h.vendedor} · {nomes[h.canal]} · {h.estado} {h.detalhe}
                {h.estado !== "enviado" &&
                  ["recebido", "repetir"].map((acao) => (
                    <button
                      key={acao}
                      className={botao}
                      disabled={alterado}
                      onClick={() =>
                        agir(async () =>
                          setPainel(
                            await chamar<PainelAutomacao>("/envios/" + h.id + "/revisar", "POST", { acao }),
                          ),
                        )
                      }
                    >
                      {acao === "recebido" ? "Confirmar recebimento" : "Liberar nova tentativa"}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </fieldset>
      {mensagem && (
        <p role="status" className="text-sm font-semibold">
          {mensagem}
        </p>
      )}
    </section>
  );
}
