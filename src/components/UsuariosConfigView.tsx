import React, { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { UsuarioSistema } from "../types";

function SenhaOperacaoCard() {
  const [configurada, setConfigurada] = useState<boolean | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  useEffect(() => { api.getSegurancaStatus().then(s => setConfigurada(s.pinConfigurado)).catch(() => setConfigurada(null)); }, []);
  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    setRetorno(null);
    if (novaSenha.length < 4) return setRetorno({ tipo: "erro", texto: "A senha de operação deve possuir ao menos 4 caracteres." });
    if (novaSenha !== confirmacao) return setRetorno({ tipo: "erro", texto: "A confirmação não confere." });
    setSalvando(true);
    try {
      await api.configurarSenhaOperacao(novaSenha);
      setConfigurada(true); setNovaSenha(""); setConfirmacao("");
      setRetorno({ tipo: "ok", texto: "Senha de operação salva. A senha antiga deixa de funcionar nas vendas." });
    } catch (err: any) { setRetorno({ tipo: "erro", texto: err.message || "Não foi possível salvar a senha de operação." }); }
    finally { setSalvando(false); }
  };
  return <form onSubmit={salvar} aria-label="Senha de operação" className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm xl:col-span-2">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-3xl"><h3 className="flex items-center gap-2 font-black text-slate-950"><KeyRound size={19} className="text-emerald-700" /> Senha de operação</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">É a senha usada <strong>durante as vendas</strong>: liberar preço, cancelar, devolver, reabrir ou estornar. Normalmente o gerente digita; se um vendedor usar, considera-se que o gerente autorizou.</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">Ela <strong>não</strong> entra no sistema como gerente. A senha geral do gerente fica em <strong>Sistema, senha do gerente e backups</strong> e precisa ser diferente desta.</p></div>
      <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${configurada ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{configurada ? "Configurada" : configurada === false ? "Pendente" : "…"}</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="block text-xs font-black uppercase text-slate-500">Nova senha de operação<input type="password" autoComplete="new-password" required value={novaSenha} onChange={(e) => setNovaSenha(e.target.value.slice(0, 64))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-bold normal-case text-slate-950" /></label>
      <label className="block text-xs font-black uppercase text-slate-500">Confirmar senha de operação<input type="password" autoComplete="new-password" required value={confirmacao} onChange={(e) => setConfirmacao(e.target.value.slice(0, 64))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-bold normal-case text-slate-950" /></label>
      <button disabled={salvando} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><KeyRound size={16} /> {salvando ? "Salvando..." : configurada ? "Trocar senha de operação" : "Cadastrar senha de operação"}</button>
    </div>
    {retorno && <p role={retorno.tipo === "erro" ? "alert" : "status"} className={`rounded-xl border p-3 text-xs font-bold ${retorno.tipo === "erro" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{retorno.texto}</p>}
  </form>;
}

export function UsuariosConfigView() {
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try { setUsuarios(await api.getUsuariosSistema()); }
    catch (err: any) { setErro(err.message || "Não foi possível carregar os usuários."); }
  };

  useEffect(() => { void carregar(); }, []);

  const cadastrar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro("");
    if (senha.length < 4) return setErro("A senha provisória deve possuir ao menos 4 caracteres.");
    setSalvando(true);
    try {
      await api.createUsuarioSistema({ nome: nome.trim(), login: login.trim().toLowerCase(), senha });
      setNome(""); setLogin(""); setSenha("");
      await carregar();
    } catch (err: any) { setErro(err.message || "Não foi possível cadastrar o vendedor."); }
    finally { setSalvando(false); }
  };

  const redefinir = async (usuario: UsuarioSistema) => {
    const novaSenha = window.prompt(`Informe a nova senha provisória de ${usuario.nome}:`);
    if (!novaSenha) return;
    if (novaSenha.length < 4) return setErro("A senha provisória deve possuir ao menos 4 caracteres.");
    try {
      await api.updateUsuarioSistema(usuario.id, { novaSenha });
      await carregar();
    } catch (err: any) { setErro(err.message || "Não foi possível redefinir a senha."); }
  };

  const alternarAtivo = async (usuario: UsuarioSistema) => {
    const ativar = usuario.ativo !== 1;
    if (!ativar && !window.confirm(`Desativar ${usuario.nome} e encerrar seu acesso?`)) return;
    try {
      await api.updateUsuarioSistema(usuario.id, { ativo: ativar });
      await carregar();
    } catch (err: any) { setErro(err.message || "Não foi possível alterar o usuário."); }
  };

  const remover = async (usuario: UsuarioSistema) => {
    if (!window.confirm(`Remover o acesso de ${usuario.nome}? O histórico de vendas será preservado.`)) return;
    try { await api.deleteUsuarioSistema(usuario.id); await carregar(); }
    catch (err: any) { setErro(err.message || "Não foi possível remover o acesso."); }
  };

  return <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
    <SenhaOperacaoCard />
    <form onSubmit={cadastrar} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="border-b border-slate-100 pb-4"><h3 className="flex items-center gap-2 font-black text-slate-950"><UserPlus size={19} className="text-emerald-700" /> Novo vendedor</h3><p className="mt-1 text-xs text-slate-500">O vendedor trocará a senha provisória no primeiro acesso.</p></div>
      <label className="block text-xs font-black uppercase text-slate-500">Nome<input required value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-bold normal-case text-slate-950" /></label>
      <label className="block text-xs font-black uppercase text-slate-500">Login<input required pattern="[a-zA-Z0-9._-]{3,30}" value={login} onChange={(e) => setLogin(e.target.value.replace(/\s/g, "").toLowerCase().slice(0, 30))} placeholder="ex.: joao" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-mono text-sm font-bold normal-case text-slate-950" /></label>
      <label className="block text-xs font-black uppercase text-slate-500">Senha provisória<input required type="password" value={senha} onChange={(e) => setSenha(e.target.value.slice(0, 64))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-bold normal-case text-slate-950" /></label>
      {erro && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{erro}</p>}
      <button disabled={salvando} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black uppercase text-white disabled:opacity-50"><UserPlus size={16} /> Cadastrar vendedor</button>
    </form>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 p-4"><h3 className="font-black text-slate-950">Usuários do sistema</h3><p className="mt-1 text-xs text-slate-500">Somente o gerente acessa esta área e remove usuários.</p></header>
      <div className="divide-y divide-slate-200">
        {usuarios.map((usuario) => <article key={usuario.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${usuario.ativo === 1 ? "" : "bg-slate-50 opacity-70"}`}>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-slate-950">{usuario.nome}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${usuario.perfil === "administrador" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{usuario.perfil === "administrador" ? "Gerente" : "Vendedor"}</span>{usuario.deveTrocarSenha === 1 && <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black uppercase text-violet-800">Troca pendente</span>}</div><p className="mt-1 font-mono text-xs text-slate-500">{usuario.login} • {usuario.ultimoAcesso ? `último acesso ${new Date(usuario.ultimoAcesso).toLocaleString("pt-BR")}` : "nunca acessou"}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void redefinir(usuario)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-amber-300 px-3 text-xs font-black text-amber-800"><KeyRound size={14} /> Redefinir senha</button>{usuario.perfil !== "administrador" && <><button type="button" onClick={() => void alternarAtivo(usuario)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-700"><ShieldCheck size={14} /> {usuario.ativo === 1 ? "Desativar" : "Ativar"}</button><button type="button" onClick={() => void remover(usuario)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-300 px-3 text-xs font-black text-red-700"><UserMinus size={14} /> Remover</button></>}</div>
        </article>)}
      </div>
    </section>
  </div>;
}
