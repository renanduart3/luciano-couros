import React, { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import logo from "../img/logo.png";
import { api } from "../lib/api";
import { AuthStatus, UsuarioSistema } from "../types";

interface LoginViewProps {
  onAuthenticated: (usuario: UsuarioSistema) => void;
}

export function LoginView({ onAuthenticated }: LoginViewProps) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [usuarios, setUsuarios] = useState<Array<Pick<UsuarioSistema, "id" | "nome" | "login" | "perfil">>>([]);
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [nomeGerente, setNomeGerente] = useState("Gerente");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const authStatus = await api.getAuthStatus();
      setStatus(authStatus);
      if (!authStatus.configuracaoInicialPendente) {
        const lista = await api.getUsuariosLogin();
        setUsuarios(lista);
        if (lista.length === 1) setLogin(lista[0].login);
      }
    } catch (err: any) {
      setErro(err.message || "Não foi possível conectar ao servidor.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const entrar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const resultado = await api.login(login, senha);
      setSenha("");
      onAuthenticated(resultado.usuario);
    } catch (err: any) {
      setErro(err.message || "Não foi possível entrar.");
    } finally {
      setEnviando(false);
    }
  };

  const configurar = async (event: React.FormEvent) => {
    event.preventDefault();
    setErro("");
    if (senha.length < 4) return setErro("A senha deve possuir ao menos 4 caracteres.");
    if (senha !== confirmacao) return setErro("A confirmação da senha não confere.");
    setEnviando(true);
    try {
      await api.configurarGerenteInicial({ nome: nomeGerente.trim() || "Gerente", senha });
      setSenha("");
      setConfirmacao("");
      await carregar();
    } catch (err: any) {
      setErro(err.message || "Não foi possível configurar o gerente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4">
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
        <header className="flex flex-col items-center border-b border-slate-200 bg-slate-50 px-6 py-7 text-center">
          <img src={logo} alt="Luciano Couros" className="h-24 w-40 object-contain" />
          <h1 className="mt-2 text-xl font-black text-slate-950">Acesso ao sistema</h1>
          <p className="mt-1 text-xs font-bold text-emerald-700">Servidor local da loja</p>
        </header>

        {carregando ? <div className="p-10 text-center font-bold text-slate-500">Conectando...</div> : status?.configuracaoInicialPendente ? (
          status.configuracaoPermitida ? (
            <form onSubmit={configurar} className="space-y-4 p-6">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="flex items-center gap-2 font-black"><ShieldCheck size={18} /> Primeiro acesso</p>
                <p className="mt-1 text-xs font-semibold">Cadastre a senha do gerente neste computador servidor.</p>
              </div>
              <label className="block text-xs font-black uppercase text-slate-500">Nome do gerente<input value={nomeGerente} onChange={(e) => setNomeGerente(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold normal-case text-slate-950" /></label>
              <label className="block text-xs font-black uppercase text-slate-500">Senha<input type="password" value={senha} onChange={(e) => setSenha(e.target.value.slice(0, 64))} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold normal-case text-slate-950" /></label>
              <label className="block text-xs font-black uppercase text-slate-500">Confirmar senha<input type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value.slice(0, 64))} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold normal-case text-slate-950" /></label>
              {erro && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{erro}</p>}
              <button disabled={enviando} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-50"><KeyRound size={18} /> Configurar gerente</button>
            </form>
          ) : <div className="p-8 text-center"><LockKeyhole className="mx-auto text-amber-600" size={34} /><p className="mt-3 font-black text-slate-900">Configuração pendente</p><p className="mt-2 text-sm text-slate-600">Abra o sistema diretamente no computador servidor para cadastrar o gerente.</p></div>
        ) : (
          <form onSubmit={entrar} className="space-y-4 p-6">
            <label className="block text-xs font-black uppercase text-slate-500">Usuário<select required value={login} onChange={(e) => setLogin(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold normal-case text-slate-950"><option value="">Selecione seu usuário</option>{usuarios.map((usuario) => <option key={usuario.id} value={usuario.login}>{usuario.nome} — {usuario.perfil === "administrador" ? "Gerente" : "Vendedor"}</option>)}</select></label>
            <label className="block text-xs font-black uppercase text-slate-500">Senha<input autoFocus type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value.slice(0, 64))} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-center text-lg font-black tracking-widest normal-case text-slate-950" /></label>
            {erro && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{erro}</p>}
            <button disabled={enviando || !login || !senha} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-50"><LockKeyhole size={18} /> {enviando ? "Entrando..." : "Entrar"}</button>
            <p className="text-center text-[11px] text-slate-400">A sessão permanece ativa durante o turno ou até bloquear o acesso.</p>
          </form>
        )}
      </section>
    </main>
  );
}

export function AlterarSenhaObrigatoria({ usuario, onChanged }: { usuario: UsuarioSistema; onChanged: (usuario: UsuarioSistema) => void }) {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (senha.length < 4) return setErro("A senha deve possuir ao menos 4 caracteres.");
    if (senha !== confirmacao) return setErro("A confirmação não confere.");
    setSalvando(true);
    try {
      const resultado = await api.alterarSenhaAtual("", senha);
      onChanged(resultado.usuario);
    } catch (err: any) {
      setErro(err.message || "Não foi possível alterar a senha.");
    } finally { setSalvando(false); }
  };

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4"><form onSubmit={salvar} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-7 shadow-2xl"><KeyRound className="text-amber-600" size={30} /><div><h1 className="text-xl font-black text-slate-950">Crie uma nova senha</h1><p className="mt-1 text-sm text-slate-600">{usuario.nome}, a senha temporária deve ser trocada antes de continuar.</p></div><input autoFocus type="password" placeholder="Nova senha" value={senha} onChange={(e) => setSenha(e.target.value.slice(0, 64))} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 font-bold" /><input type="password" placeholder="Confirmar nova senha" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value.slice(0, 64))} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 font-bold" />{erro && <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{erro}</p>}<button disabled={salvando} className="min-h-12 w-full rounded-xl bg-slate-900 px-4 font-black text-white disabled:opacity-50">Salvar nova senha</button></form></main>;
}
