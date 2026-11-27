import React, { useEffect, useState } from "react";
import { Check, KeyRound, ShieldCheck, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { UsuarioSistema } from "../types";

const campo = "mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-bold normal-case text-slate-950 outline-none focus:border-emerald-600";
const rotulo = "block text-xs font-black uppercase text-slate-500";

type Retorno = { tipo: "ok" | "erro"; texto: string } | null;
const Aviso = ({ retorno }: { retorno: Retorno }) => retorno && <p role={retorno.tipo === "erro" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-xs font-bold ${retorno.tipo === "erro" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{retorno.texto}</p>;

function SenhaOperacaoCard() {
  const [configurada, setConfigurada] = useState<boolean | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);
  useEffect(() => { api.getSegurancaStatus().then(s => setConfigurada(s.pinConfigurado)).catch(() => setConfigurada(null)); }, []);
  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    setRetorno(null);
    if (novaSenha.length < 4) return setRetorno({ tipo: "erro", texto: "Use pelo menos 4 caracteres." });
    if (novaSenha !== confirmacao) return setRetorno({ tipo: "erro", texto: "As duas senhas digitadas não são iguais." });
    setSalvando(true);
    try {
      await api.configurarSenhaOperacao(novaSenha);
      setConfigurada(true); setNovaSenha(""); setConfirmacao("");
      setRetorno({ tipo: "ok", texto: "Senha de operação salva." });
    } catch (err: any) { setRetorno({ tipo: "erro", texto: err.message || "Não foi possível salvar." }); }
    finally { setSalvando(false); }
  };
  return <form onSubmit={salvar} aria-label="Senha de operação" className="space-y-3 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm xl:col-span-2">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="flex items-center gap-2 font-black text-slate-950"><KeyRound size={19} className="text-emerald-700" /> Senha de operação</h3>
      <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${configurada ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{configurada ? "Configurada" : configurada === false ? "Pendente" : "…"}</span>
      <p className="w-full text-xs text-slate-500">Pedida nas vendas para liberar preço, cancelar, devolver e estornar. Não serve para entrar como gerente.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className={rotulo}>Nova senha<input type="password" autoComplete="new-password" required value={novaSenha} onChange={(e) => { setNovaSenha(e.target.value.slice(0, 64)); setRetorno(null); }} className={campo} /></label>
      <label className={rotulo}>Repetir senha<input type="password" autoComplete="new-password" required value={confirmacao} onChange={(e) => { setConfirmacao(e.target.value.slice(0, 64)); setRetorno(null); }} className={campo} /></label>
      <button disabled={salvando} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-black uppercase text-white disabled:opacity-50"><Check size={16} /> {salvando ? "Salvando..." : "Salvar"}</button>
    </div>
    <Aviso retorno={retorno} />
  </form>;
}

const LinhaUsuario: React.FC<{ usuario: UsuarioSistema; onAlterado: () => Promise<void> }> = ({ usuario, onAlterado }) => {
  const [modo, setModo] = useState<"" | "senha" | "desativar">("");
  const [novaSenha, setNovaSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);
  const gerente = usuario.perfil === "administrador";
  const abrir = (proximo: typeof modo) => { setModo(proximo); setNovaSenha(""); setRetorno(null); };
  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    setOcupado(true); setRetorno(null);
    try { await acao(); setModo(""); setNovaSenha(""); await onAlterado(); setRetorno({ tipo: "ok", texto: ok }); }
    catch (err: any) { setRetorno({ tipo: "erro", texto: err.message || "Não foi possível concluir." }); }
    finally { setOcupado(false); }
  };
  const salvarSenha = (event: React.FormEvent) => {
    event.preventDefault();
    if (novaSenha.length < 4) return setRetorno({ tipo: "erro", texto: "Use pelo menos 4 caracteres." });
    void executar(() => api.updateUsuarioSistema(usuario.id, { novaSenha }), `Senha provisória definida. ${usuario.nome} troca no próximo acesso.`);
  };
  const botao = "inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs font-black disabled:opacity-50";
  return <article className={`space-y-3 p-4 ${usuario.ativo === 1 ? "" : "bg-slate-50 opacity-70"}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-slate-950">{usuario.nome}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${gerente ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{gerente ? "Gerente" : "Vendedor"}</span>{usuario.deveTrocarSenha === 1 && <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black uppercase text-violet-800">Troca pendente</span>}</div><p className="mt-1 font-mono text-xs text-slate-500">{usuario.login} • {usuario.ultimoAcesso ? `último acesso ${new Date(usuario.ultimoAcesso).toLocaleString("pt-BR")}` : "nunca acessou"}</p></div>
      {gerente
        ? <p className="text-xs text-slate-500">Senha do gerente: em <strong>Sistema</strong>.</p>
        : !modo && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => abrir("senha")} className={`${botao} border-amber-300 text-amber-800`}><KeyRound size={14} /> Nova senha</button>
          {usuario.ativo === 1
            ? <button type="button" onClick={() => abrir("desativar")} className={`${botao} border-slate-300 text-slate-700`}><ShieldCheck size={14} /> Desativar</button>
            : <button type="button" disabled={ocupado} onClick={() => void executar(() => api.updateUsuarioSistema(usuario.id, { ativo: true }), "Usuário ativado.")} className={`${botao} border-slate-300 text-slate-700`}><ShieldCheck size={14} /> Ativar</button>}
        </div>}
    </div>
    {modo === "senha" && <form onSubmit={salvarSenha} className="flex flex-wrap items-end gap-2 rounded-xl bg-amber-50 p-3">
      <label className={`${rotulo} min-w-48 flex-1`}>Senha provisória de {usuario.nome}<input autoFocus type="password" autoComplete="new-password" value={novaSenha} disabled={ocupado} onChange={(e) => { setNovaSenha(e.target.value.slice(0, 64)); setRetorno(null); }} className={`${campo} bg-white`} /></label>
      <button disabled={ocupado} className={`${botao} border-amber-600 bg-amber-600 text-white`}><Check size={14} /> {ocupado ? "Salvando..." : "Salvar"}</button>
      <button type="button" disabled={ocupado} onClick={() => abrir("")} className={`${botao} border-slate-300 bg-white text-slate-700`}><X size={14} /> Cancelar</button>
    </form>}
    {modo === "desativar" && <div role="group" aria-label="Confirmar desativação" className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-3">
      <p className="flex-1 text-xs font-bold text-slate-800">Desativar {usuario.nome}? Ele sai do sistema na hora. As vendas continuam no histórico.</p>
      <button type="button" disabled={ocupado} onClick={() => void executar(() => api.updateUsuarioSistema(usuario.id, { ativo: false }), "Usuário desativado.")} className={`${botao} border-slate-800 bg-slate-800 text-white`}><Check size={14} /> Desativar</button>
      <button type="button" disabled={ocupado} onClick={() => abrir("")} className={`${botao} border-slate-300 bg-white text-slate-700`}><X size={14} /> Cancelar</button>
    </div>}
    <Aviso retorno={retorno} />
  </article>;
};

export function UsuariosConfigView() {
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [retorno, setRetorno] = useState<Retorno>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try { setUsuarios(await api.getUsuariosSistema()); }
    catch (err: any) { setRetorno({ tipo: "erro", texto: err.message || "Não foi possível carregar os usuários." }); }
  };

  useEffect(() => { void carregar(); }, []);

  const cadastrar = async (event: React.FormEvent) => {
    event.preventDefault();
    setRetorno(null);
    if (senha.length < 4) return setRetorno({ tipo: "erro", texto: "A senha provisória precisa de pelo menos 4 caracteres." });
    setSalvando(true);
    try {
      await api.createUsuarioSistema({ nome: nome.trim(), login: login.trim().toLowerCase(), senha });
      setRetorno({ tipo: "ok", texto: `Vendedor ${nome.trim()} cadastrado.` });
      setNome(""); setLogin(""); setSenha("");
      await carregar();
    } catch (err: any) { setRetorno({ tipo: "erro", texto: err.message || "Não foi possível cadastrar o vendedor." }); }
    finally { setSalvando(false); }
  };

  return <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
    <SenhaOperacaoCard />
    <form onSubmit={cadastrar} className="space-y-4 self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h3 className="flex items-center gap-2 font-black text-slate-950"><UserPlus size={19} className="text-emerald-700" /> Novo vendedor</h3><p className="mt-1 text-xs text-slate-500">Ele troca a senha no primeiro acesso.</p></div>
      <label className={rotulo}>Nome<input required value={nome} onChange={(e) => setNome(e.target.value)} className={campo} /></label>
      <label className={rotulo}>Login<input required pattern="[a-zA-Z0-9._-]{3,30}" value={login} onChange={(e) => setLogin(e.target.value.replace(/\s/g, "").toLowerCase().slice(0, 30))} placeholder="ex.: joao" className={`${campo} font-mono`} /></label>
      <label className={rotulo}>Senha provisória<input required type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value.slice(0, 64))} className={campo} /></label>
      <Aviso retorno={retorno} />
      <button disabled={salvando} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><UserPlus size={16} /> Cadastrar vendedor</button>
    </form>

    <section className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="font-black text-slate-950">Usuários do sistema</h3></header>
      <div className="divide-y divide-slate-200">
        {usuarios.map((usuario) => <LinhaUsuario key={usuario.id} usuario={usuario} onAlterado={carregar} />)}
      </div>
    </section>
  </div>;
}
