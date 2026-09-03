import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

interface State {
  error: Error | null;
}

interface Props {
  children?: ReactNode;
}

export class AppErrorBoundary extends Component<Props, State> {
  private readonly content: ReactNode;
  state: State = { error: null };

  constructor(props: Props) {
    super(props);
    this.content = props.children;
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Falha inesperada na interface:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.content;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5 text-slate-900">
        <section role="alert" className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-7 text-center shadow-xl">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle size={30}/></span>
          <h1 className="mt-4 text-2xl font-black">Não foi possível concluir esta tela</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Seus dados já salvos continuam protegidos. Recarregue a tela para tentar novamente ou volte ao início do sistema.</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-xs font-black uppercase text-white"><RefreshCw size={17}/> Recarregar</button>
            <button type="button" onClick={() => { window.location.hash = ""; window.location.reload(); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 text-xs font-black uppercase text-slate-700"><Home size={17}/> Voltar ao início</button>
          </div>
          <details className="mt-5 rounded-xl bg-slate-50 p-3 text-left text-xs text-slate-500"><summary className="cursor-pointer font-black uppercase">Detalhes para suporte</summary><p className="mt-2 break-words font-mono">{this.state.error.message || "Erro inesperado"}</p></details>
        </section>
      </main>
    );
  }
}
