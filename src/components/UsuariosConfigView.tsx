import React, { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { UsuarioSistema } from "../types";

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
