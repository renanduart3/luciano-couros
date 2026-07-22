import React, { useState, useEffect } from "react";
import { 
  Database, RefreshCw, ShieldAlert, CheckCircle2, ChevronRight, Save, Store, Archive, KeyRound
} from "lucide-react";
import { api } from "../lib/api";
import { SegurancaStatus } from "../types";

interface BackupConfigViewProps {
  onRefreshConfig?: () => void;
}

export function BackupConfigView({ onRefreshConfig }: BackupConfigViewProps) {
  const [storeName, setStoreName] = useState("");
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seguranca, setSeguranca] = useState<SegurancaStatus | null>(null);
  const [adminNome, setAdminNome] = useState("Administrador");
  const [pinAtual, setPinAtual] = useState("");
  const [novoPin, setNovoPin] = useState("");
  const [confirmarPin, setConfirmarPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Mock status state
  const [mockEnabled, setMockEnabled] = useState(false);
  const [togglingMock, setTogglingMock] = useState(false);

  // Restore confirmation modal state
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreCountdown, setRestoreCountdown] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [config, backupList, mockStatus, segurancaStatus] = await Promise.all([
        api.getConfig(),
        api.getBackups(),
        api.getMockStatus().catch(() => ({ mockEnabled: false })),
        api.getSegurancaStatus()
      ]);
      setStoreName(config.store_name || "Central de Tecidos");
      setBackups(backupList);
      setMockEnabled(mockStatus.mockEnabled);
      setSeguranca(segurancaStatus);
      setAdminNome(segurancaStatus.nome);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      alert("O nome da loja não pode ser vazio.");
      return;
    }
    setSavingConfig(true);
    try {
      await api.updateConfig({ store_name: storeName.trim() });
      alert("Configurações salvas com sucesso!");
      if (onRefreshConfig) onRefreshConfig();
    } catch (err: any) {
      alert(err.message || "Erro ao salvar configurações.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleManualBackup = async () => {
    setCreatingBackup(true);
    try {
      await api.createBackup();
      alert("Backup manual gerado com sucesso!");
      const updatedList = await api.getBackups();
      setBackups(updatedList);
    } catch (err: any) {
      alert(err.message || "Erro ao gerar backup.");
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinFeedback(null);

    if (!/^\d{4,8}$/.test(novoPin)) {
      setPinFeedback({ type: "error", text: "O novo PIN deve possuir de 4 a 8 números." });
      return;
    }
    if (novoPin !== confirmarPin) {
      setPinFeedback({ type: "error", text: "A confirmação do PIN não confere." });
      return;
    }

    setSavingPin(true);
    try {
      const result = await api.configurarPinAdministrador({
        nome: adminNome.trim() || "Administrador",
        pinAtual: seguranca?.pinConfigurado ? pinAtual : undefined,
        novoPin
      });
      setSeguranca((atual) => ({
        usuarioId: atual?.usuarioId || "usuario_admin",
        nome: result.nome,
        pinConfigurado: true
      }));
      setAdminNome(result.nome);
      setPinAtual("");
      setNovoPin("");
      setConfirmarPin("");
      setPinFeedback({ type: "success", text: "PIN administrativo salvo com segurança." });
    } catch (err: any) {
      setPinFeedback({ type: "error", text: err.message || "Erro ao salvar o PIN." });
    } finally {
      setSavingPin(false);
    }
  };

  const handleToggleMock = async () => {
    setTogglingMock(true);
    try {
      const nextState = !mockEnabled;
      const res = await api.toggleMock(nextState);
      setMockEnabled(res.mockEnabled);
      alert(res.mockEnabled 
        ? "Modo de Demonstração ativado com sucesso! Dados fictícios de tecidos e vendas foram carregados separadamente." 
        : "Modo de Demonstração desativado! Seus dados reais foram restaurados com total segurança."
      );
      if (onRefreshConfig) onRefreshConfig();
    } catch (err: any) {
      alert(err.message || "Erro ao alternar o modo de demonstração.");
    } finally {
      setTogglingMock(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;
    if (restoreConfirmText !== "RESTAURAR") {
      alert("Por favor, digite 'RESTAURAR' para confirmar.");
      return;
    }

    setRestoring(true);
    try {
      await api.restoreBackup(selectedBackup);
      
      // Start count down for client reload
      setSelectedBackup(null);
      setRestoreCountdown(5);
    } catch (err: any) {
      alert(err.message || "Erro ao restaurar backup.");
      setRestoring(false);
    }
  };

  useEffect(() => {
    if (restoreCountdown === null) return;

    if (restoreCountdown === 0) {
      window.location.reload();
      return;
    }

    const timer = setTimeout(() => {
      setRestoreCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [restoreCountdown]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      
      {/* Header */}
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-2xl font-bold text-slate-950 tracking-tight font-sans">Configurações & Backups</h2>
        <p className="text-slate-500 text-sm mt-0.5">Definições da marca da loja, segurança de dados e restauração de cópias de segurança.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
          <p className="text-slate-500 mt-4 text-sm font-medium">Carregando painel de controle...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">{error}</div>
      ) : restoreCountdown !== null ? (
        
        /* RESTORE RESTARTING COUNTDOWN SCREEN */
        <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-12 text-center space-y-6 max-w-xl mx-auto">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-emerald-600 mx-auto"></div>
          <h3 className="text-xl font-extrabold text-slate-900">Restaurando Cópia de Segurança...</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            A base de dados foi reinstalada com sucesso. O servidor está reiniciando seus processos em modo seguro para aplicar as alterações.
          </p>
          <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl font-mono text-xs max-w-xs mx-auto">
            Recarregando a aplicação em <strong>{restoreCountdown} segundos...</strong>
          </div>
        </div>

      ) : (
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column (Config Form) */}
          <div className="md:col-span-5 space-y-6">
            
            {/* Branding form */}
            <form onSubmit={handleSaveConfig} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-50 pb-3">
                <Store size={16} className="text-slate-500" />
                Identidade da Loja
              </h3>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Nome Comercial / Cabeçalho *</label>
                <input 
                  type="text" 
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-slate-950 focus:border-emerald-500 outline-none"
                  placeholder="Ex: Central de Tecidos"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">Este nome será exibido nos comprovantes de vendas e nos cabeçalhos da tela inicial.</p>
              </div>

              <button 
                type="submit"
                disabled={savingConfig}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-colors"
              >
                <Save size={14} /> {savingConfig ? "Salvando..." : "Salvar Configurações"}
              </button>
            </form>

            {/* Administrative PIN */}
            <form onSubmit={handleSavePin} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-50 pb-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <KeyRound size={16} className="text-amber-600" />
                  PIN Administrativo
                </h3>
                <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase ${
                  seguranca?.pinConfigurado ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}>
                  {seguranca?.pinConfigurado ? "Configurado" : "Pendente"}
                </span>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500">
                Usado pelo proprietário para ver custos e lucros, autorizar preços abaixo do permitido e proteger ações administrativas.
              </p>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-400 uppercase">Responsável</label>
                <input
                  type="text"
                  value={adminNome}
                  onChange={(e) => setAdminNome(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl font-bold text-slate-950 focus:border-emerald-500 outline-none"
                  placeholder="Nome do administrador"
                />
              </div>

              {seguranca?.pinConfigurado && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase">PIN atual</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    value={pinAtual}
                    onChange={(e) => setPinAtual(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="w-full bg-amber-50 border border-amber-200 text-lg tracking-[0.35em] px-3.5 py-2.5 rounded-xl font-black text-slate-950 focus:border-amber-500 outline-none"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Novo PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={novoPin}
                    onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="w-full bg-slate-50 border border-slate-200 text-lg tracking-[0.28em] px-3 py-2.5 rounded-xl font-black text-slate-950 focus:border-emerald-500 outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Confirmar</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={confirmarPin}
                    onChange={(e) => setConfirmarPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="w-full bg-slate-50 border border-slate-200 text-lg tracking-[0.28em] px-3 py-2.5 rounded-xl font-black text-slate-950 focus:border-emerald-500 outline-none"
                    required
                  />
                </div>
              </div>

              {pinFeedback && (
                <p className={`rounded-lg border px-3 py-2 text-[11px] font-bold ${
                  pinFeedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}>
                  {pinFeedback.text}
                </p>
              )}

              <button
                type="submit"
                disabled={savingPin}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-md transition-colors disabled:opacity-50"
              >
                <KeyRound size={14} /> {savingPin ? "Protegendo..." : seguranca?.pinConfigurado ? "Alterar PIN" : "Configurar PIN"}
              </button>
            </form>

            {/* Mock Data Card */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-50 pb-3">
                <Database size={16} className="text-emerald-600" />
                Dados de Demonstração (Mock)
              </h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">Modo de Simulação</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Ativa dados fictícios para testes.</p>
                </div>
                
                <button
                  type="button"
                  disabled={togglingMock}
                  onClick={handleToggleMock}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    mockEnabled ? "bg-emerald-600" : "bg-slate-200"
                  } disabled:opacity-50`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      mockEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-100/50">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${mockEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}></span>
                  <span className="text-[10px] font-bold text-slate-600">
                    Status: {mockEnabled ? "ATIVO (Dados Simulados)" : "INATIVO (Dados Reais)"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {mockEnabled 
                    ? "As telas exibirão clientes, vendas, compras e pagamentos simulados de tecidos sem afetar seus registros originais."
                    : "Você está visualizando os dados reais de sua base local. Ative para preencher gráficos e tabelas para testes rápidos."}
                </p>
              </div>
            </div>

            {/* Information Card */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-amber-700">
                <ShieldAlert size={15} />
                Segurança dos Dados
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Esta aplicação funciona no modelo <strong>local-first</strong>, o que significa que todos os seus dados estão salvos com segurança no próprio disco do servidor local (banco SQLite).
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Para evitar perda de dados, o sistema realiza um <strong>backup diário automatizado</strong> retendo os últimos 30 dias de arquivos de forma invisível.
              </p>
            </div>

          </div>

          {/* Right Column (Backup listing) */}
          <div className="md:col-span-7 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
            
            <div className="flex justify-between items-center border-b border-slate-50 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Database size={16} className="text-slate-500" />
                Cópias de Segurança Disponíveis
              </h3>
              
              <button
                type="button"
                onClick={handleManualBackup}
                disabled={creatingBackup}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[10px] uppercase shadow-md transition-colors disabled:opacity-50"
              >
                {creatingBackup ? "Gerando..." : "Criar Backup Agora"}
              </button>
            </div>

            {/* Backup Table/List */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                    <th className="p-3">Data/Hora</th>
                    <th className="p-3">Nome do Arquivo</th>
                    <th className="p-3 text-center">Tamanho</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {backups.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400 font-medium">Nenhum backup encontrado em disco.</td>
                    </tr>
                  ) : (
                    backups.map((b, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/20">
                        <td className="p-3 font-semibold text-slate-800">{new Date(b.createdAt).toLocaleString("pt-BR")}</td>
                        <td className="p-3 font-mono text-[10px] text-slate-500 max-w-[150px] truncate" title={b.filename}>{b.filename}</td>
                        <td className="p-3 text-center text-slate-500">{b.size}</td>
                        <td className="p-3 text-center">
                          <button 
                            type="button"
                            onClick={() => setSelectedBackup(b.filename)}
                            className="text-emerald-600 hover:bg-emerald-50 px-2.5 py-1 rounded-lg font-bold transition-colors inline-flex items-center gap-1 text-[10px]"
                          >
                            Restaurar <ChevronRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* Restore Confirmation Dialog Modal */}
      {selectedBackup && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md border border-slate-100 shadow-2xl p-6 space-y-4 animate-fade-in">
            <div className="flex items-start gap-3 text-red-600">
              <ShieldAlert size={24} className="shrink-0 mt-0.5" />
              <div>
                <h3 className="font-extrabold text-slate-950 text-base">Alerta de Restauração de Dados</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Você está prestes a restaurar o backup <strong>{selectedBackup}</strong>.
                </p>
              </div>
            </div>

            <div className="p-4 bg-red-50 text-red-800 text-xs rounded-xl border border-red-100 space-y-2">
              <p className="font-bold">Atenção!</p>
              <p>Esta operação irá substituir TODOS os dados de vendas, pagamentos, clientes e produtos atuais pelos dados salvos nesta data específica de backup.</p>
              <p>Os dados lançados após este arquivo de backup serão perdidos permanentemente.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                Para confirmar, digite <strong>RESTAURAR</strong> em maiúsculas:
              </label>
              <input 
                type="text" 
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                placeholder="RESTAURAR"
                className="w-full bg-slate-50 border border-slate-200 text-sm px-3.5 py-2.5 rounded-xl text-center font-extrabold text-slate-900 placeholder-slate-300 outline-none focus:border-red-500"
              />
            </div>

            <div className="flex gap-2.5 justify-end pt-3 text-xs font-bold">
              <button 
                type="button"
                onClick={() => {
                  setSelectedBackup(null);
                  setRestoreConfirmText("");
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
              >
                Voltar
              </button>
              <button 
                type="button"
                disabled={restoring || restoreConfirmText !== "RESTAURAR"}
                onClick={handleRestore}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
              >
                {restoring ? "Restaurando..." : "Sim, Restaurar Backup"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
