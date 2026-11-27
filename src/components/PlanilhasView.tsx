import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Check, Copy, FunctionSquare, Send, Plus, Save, Sheet, Table2, Trash2, Eraser, RefreshCw } from "lucide-react";
import { calcularPlanilha, limitesSelecao, resumirSelecao, CORES_CELULA, type FormatoCelula, COLUNAS, endereco, LINHAS, MAX_PLANILHAS, MAX_TEXTO_CELULA } from "../lib/planilhas";
import { api } from "../lib/api";
import { Planilha, PlanilhaResumo } from "../types";
import "./planilhas.css";
import { escreverTSV, lerTSV } from "../lib/clipboardPlanilha";
import { IMPRESSAO_PLANILHAS_PREVIEW } from '../lib/recursosPreview';
import { PlanilhaImpressaoPreview } from './PlanilhaImpressaoPreview';
import { larguraColuna, limitarLarguraColuna, LARGURA_COLUNA_MIN, LARGURA_COLUNA_MAX, type ExibicaoCelula } from '../lib/planilhas';
import { baixarImagem, copiarImagemParaAreaDeTransferencia, desenharSelecaoPlanilha, nomeArquivoImagem, pngDoCanvas } from '../lib/imagemPlanilha';
import { EnviarImagemPlanilha } from './EnviarImagemPlanilha';

const vazia = { texto: "", erro: false, numerico: false };
const intervaloPendente = /^=([A-J]\d+:[A-J]\d+)$/i;
function textoDaFormula(entrada: string) {
  if (intervaloPendente.test(entrada)) return `=SOMA(${entrada.slice(1)})`;
  const partes = /^=([A-J]\d+:[A-J]\d+)\s*(SOMA|M[ÉE]DIA|MEDIANA)$/i.exec(entrada);
  return partes ? `=${partes[2].toUpperCase()}(${partes[1]})` : entrada.slice(0, MAX_TEXTO_CELULA);
}
const ALTURA_LINHA = 36;
const resumo = ({ id, nome, versao, updatedAt }: Planilha): PlanilhaResumo => ({ id, nome, versao, updatedAt });
export function PlanilhasView() {
  const [planilhas, setPlanilhas] = useState<PlanilhaResumo[]>([]);
  const [rascunho, setRascunho] = useState<Planilha | null>(null);
  const [alterada, setAlterada] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [impressao, setImpressao] = useState<{ planilha: Planilha; inicio: string; fim: string } | null>(null);
  const [envioImagem, setEnvioImagem] = useState<{ imagem: Blob; nome: string; legenda: string } | null>(null);
  const [avisoImagem, setAvisoImagem] = useState("");
  const [selecionada, setSelecionada] = useState("A1");
  const [ancora, setAncora] = useState("A1");
  const [editando, setEditando] = useState<string | null>(null);
  const [naBarra, setNaBarra] = useState(false);
  const [texto, setTexto] = useState("");
  const [acao, setAcao] = useState<'limpar' | 'excluir' | null>(null);
  const [senha, setSenha] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const [janela, setJanela] = useState({ inicio: 0, quantidade: 30 });
  const barraFormula = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (editando && naBarra) barraFormula.current?.focus({ preventScroll: true });
  }, [editando, naBarra]);
  const grade = useRef<HTMLDivElement>(null);
  const redimensionando = useRef<{ pointerId: number; coluna: number; x: number; largura: number } | null>(null);
  const ignorarBlur = useRef(false);
  const ignorarClique = useRef(false);
  const arrastando = useRef<{ pointerId: number; x: number; y: number; fim: string; referenciar?: (fim: string) => void; concluir?: (fim: string) => void } | null>(null);
  const dialogoSaida = useRef<HTMLDialogElement>(null);
  const resolverSaida = useRef<((permitida: boolean) => void) | null>(null);
  const concluirSaida = (permitida: boolean) => {
    dialogoSaida.current?.close();
    resolverSaida.current?.(permitida);
    resolverSaida.current = null;
  };
  const pendente = alterada || (editando !== null && texto !== (rascunho?.celulas[editando] || ""));
  const exibicao = useMemo<Record<string, ExibicaoCelula>>(() => rascunho ? calcularPlanilha(rascunho.celulas, rascunho.moedas) : {}, [rascunho?.celulas, rascunho?.moedas]);
  const limites = useMemo(() => limitesSelecao(ancora, selecionada), [ancora, selecionada]);
  const resumoSelecao = useMemo(() => resumirSelecao(exibicao, ancora, selecionada), [exibicao, ancora, selecionada]);
  useEffect(() => setAvisoImagem(''), [ancora, selecionada, rascunho?.id]);
  useEffect(() => {
    let frame = 0;
    const atualizar = () => {
      frame = 0;
      const arraste = arrastando.current, elemento = grade.current;
      if (!arraste || !elemento) return;
      const rect = elemento.getBoundingClientRect();
      if (arraste.y < rect.top + 58) elemento.scrollTop -= 18;
      else if (arraste.y > rect.bottom - 24) elemento.scrollTop += 18;
      if (arraste.x < rect.left + 68) elemento.scrollLeft -= 18;
      else if (arraste.x > rect.right - 24) elemento.scrollLeft += 18;
      const x = Math.max(rect.left + 46, Math.min(rect.right - 4, arraste.x));
      const y = Math.max(rect.top + 34, Math.min(rect.bottom - 4, arraste.y));
      const celula = document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-celula]');
      const id = celula?.dataset.celula;
      if (id && elemento.contains(celula) && id !== arraste.fim) {
        arraste.fim = id; ignorarClique.current = true;
        if (arraste.referenciar) arraste.referenciar(id);
        else setSelecionada(id);
      }
      frame = requestAnimationFrame(atualizar);
    };
    const moverPonteiro = (event: PointerEvent) => {
      const arraste = arrastando.current;
      if (!arraste || event.pointerId !== arraste.pointerId) return;
      arraste.x = event.clientX; arraste.y = event.clientY;
      if (!frame) frame = requestAnimationFrame(atualizar);
    };
    const terminar = (event?: Event) => { cancelAnimationFrame(frame); frame = 0; if (arrastando.current && event?.type === 'pointerup') {
      atualizar();
      arrastando.current.concluir?.(arrastando.current.fim);
    } arrastando.current = null; cancelAnimationFrame(frame); frame = 0; };
    window.addEventListener('pointermove', moverPonteiro);
    window.addEventListener('pointerup', terminar);
    window.addEventListener('pointercancel', terminar);
    window.addEventListener('blur', terminar);
    return () => { terminar(); window.removeEventListener('pointermove', moverPonteiro); window.removeEventListener('pointerup', terminar); window.removeEventListener('pointercancel', terminar); window.removeEventListener('blur', terminar); };
  }, []);
  const selecionar = (id: string, estender = false) => { if (!estender) setAncora(id); setSelecionada(id); };
  const iniciarSelecao = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return;
    const editor = document.activeElement;
    if (editando && texto.startsWith('=')) {
      event.preventDefault();
      ignorarClique.current = true;
      const campo = editor instanceof HTMLInputElement ? editor : barraFormula.current;
      const inicio = campo?.selectionStart ?? texto.length;
      const final = campo?.selectionEnd ?? inicio;
      const funcao = final === texto.length && inicio === final && /^=\s*(SOMA|M[ÉE]DIA|MEDIANA)\s*\(?$/i.exec(texto);
      const obterReferencia = (fim: string) => {
        if (id[0] !== fim[0] && id.slice(1) !== fim.slice(1)) return '';

        const r = limitesSelecao(id, fim);
        return id === fim ? id : endereco(r.primeiraLinha, r.primeiraColuna) + ':' + endereco(r.ultimaLinha, r.ultimaColuna);
      };
      const referenciar = (fim: string) => {
        const referencia = obterReferencia(fim);
        if (!referencia) { setTexto(texto); return; }
        const novoTexto = funcao ? `=${funcao[1].toUpperCase()}(${referencia})` : texto.slice(0, inicio) + referencia + texto.slice(final);
        if (novoTexto.length > MAX_TEXTO_CELULA) return;
        setTexto(novoTexto);
        requestAnimationFrame(() => campo?.setSelectionRange(inicio + referencia.length, inicio + referencia.length));
      };
      referenciar(id);
      arrastando.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, fim: id, referenciar, concluir: fim => {
        const referencia = obterReferencia(fim);
        if (!referencia) { setErro('Selecione uma única linha ou coluna para inserir o intervalo.'); return; }
        setErro('');
        if (funcao) {
          escrever(editando, `=${funcao[1].toUpperCase()}(${referencia})`);
          setEditando(null);
          focar(editando);
        }
      } };
      return;
    }
    if (event.pointerType === 'touch') return;
    event.preventDefault(); ignorarClique.current = false;
    selecionar(id, event.shiftKey);
    event.currentTarget.focus({ preventScroll: true });
    arrastando.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, fim: id };
  };
  useEffect(() => {
    let ativo = true;
    api.getPlanilhas().then(async lista => {
      if (!ativo) return;
      setPlanilhas(lista);
      if (lista[0]) { const documento = await api.getPlanilha(lista[0].id); if (ativo) setRascunho(documento); }
    }).catch(e => { if (ativo) setErro(e.message); }).finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);
  useEffect(() => {
    if (!pendente) return;
    const fechar = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', fechar);
    return () => window.removeEventListener('beforeunload', fechar);
  }, [pendente]);
  useLayoutEffect(() => {
    const navegar = (evento: Event) => {
      if (!pendente && !ocupado) return;
      evento.preventDefault();
      const responder = (evento as CustomEvent<(valor: boolean) => void>).detail;
      if (responder) void podeTrocar().then(responder);
    };
    window.addEventListener('planilhas-before-leave', navegar);
    return () => window.removeEventListener('planilhas-before-leave', navegar);
  }, [pendente, ocupado]);
  const atualizarJanela = () => {
    const elemento = grade.current;
    if (!elemento) return;
    const inicio = Math.max(0, Math.floor(Math.max(0, elemento.scrollTop - 32) / ALTURA_LINHA) - 6);
    const quantidade = Math.ceil(elemento.clientHeight / ALTURA_LINHA) + 14;
    if (inicio !== janela.inicio && editando && !naBarra) confirmar();
    setJanela(anterior => anterior.inicio === inicio && anterior.quantidade === quantidade ? anterior : { inicio, quantidade });
  };
  useEffect(() => {
    if (!grade.current) return;
    const observer = new ResizeObserver(atualizarJanela);
    observer.observe(grade.current); atualizarJanela();
    return () => observer.disconnect();
  }, [rascunho?.id]);
  const aplicar = (documento: Planilha) => {
    setRascunho(documento); setAlterada(false); setEditando(null); setSelecionada('A1'); setAncora('A1');
    setPlanilhas(atuais => atuais.some(p => p.id === documento.id) ? atuais.map(p => p.id === documento.id ? resumo(documento) : p) : [...atuais, resumo(documento)]);
    if (grade.current) grade.current.scrollTop = 0;
    setJanela({ inicio: 0, quantidade: 30 });
  };
  const podeTrocar = async () => {
    if (ocupado || resolverSaida.current) return false;
    if (!pendente) return true;
    return new Promise<boolean>(resolve => {
      resolverSaida.current = resolve;
      dialogoSaida.current?.showModal();
    });
  };
  const abrir = async (id: string) => {
    if (ocupado || !(await podeTrocar())) return;
    setOcupado(true); setErro(''); setAviso('');
    try { const [documento, lista] = await Promise.all([api.getPlanilha(id), api.getPlanilhas()]); setPlanilhas(lista); aplicar(documento); } catch (e: any) { setErro(e.message); } finally { setOcupado(false); }
  };
  const criar = async () => {
    if (ocupado || !(await podeTrocar())) return;
    setOcupado(true); setErro(''); setAviso('');
    try { aplicar(await api.createPlanilha(`Planilha ${planilhas.length + 1}`)); } catch (e: any) { setErro(e.message); } finally { setOcupado(false); }
  };
  const mudar = (atualizar: (anterior: Planilha) => Planilha) => {
    setRascunho(anterior => anterior ? atualizar(anterior) : anterior); setAlterada(true); setAviso('');
  };
  const escrever = (id: string, valor: string) => mudar(anterior => {
    const celulas = { ...anterior.celulas };
    if (valor !== '') celulas[id] = valor.slice(0, MAX_TEXTO_CELULA); else delete celulas[id];
    return { ...anterior, celulas };
  });
  const ajustarLargura = (coluna: number, valor: number) => {
    const largura = limitarLarguraColuna(valor);
    if (!rascunho || larguraColuna(coluna, rascunho.larguras) === largura) return;
    mudar(anterior => ({ ...anterior, larguras: { ...anterior.larguras, [String.fromCharCode(65 + coluna)]: largura } }));
  };
  const ajustarAoConteudo = (coluna: number) => {
    const contexto = document.createElement('canvas').getContext('2d');
    if (!contexto || !rascunho) return;
    const letra = String.fromCharCode(65 + coluna);
    const amostra = grade.current?.querySelector<HTMLElement>('[data-celula]');
    if (!amostra) return;
    const estilo = getComputedStyle(amostra);
    const numerica = grade.current?.querySelector<HTMLElement>('.font-mono');
    const fonteNumerica = numerica ? getComputedStyle(numerica).fontFamily : 'monospace';
    let largura = LARGURA_COLUNA_MIN;
    // Usa todas as linhas, inclusive as que estão fora da janela virtualizada.
    for (const [id, valor] of Object.entries<ExibicaoCelula>(exibicao)) {
      if (!id.startsWith(letra)) continue;
      contexto.font = `${rascunho.formatos?.[id]?.negrito ? 700 : 400} ${estilo.fontSize} ${valor.numerico ? fonteNumerica : estilo.fontFamily}`;
      const textoVisivel = estilo.textTransform === 'uppercase' ? valor.texto.toUpperCase() : valor.texto;
      largura = Math.max(largura, Math.ceil(contexto.measureText(textoVisivel).width) + 28);
    }
    ajustarLargura(coluna, largura);
  };
  const idsSelecionados = () => {
    const ids: string[] = [];
    for (let l = limites.primeiraLinha; l <= limites.ultimaLinha; l++) for (let c = limites.primeiraColuna; c <= limites.ultimaColuna; c++) ids.push(endereco(l, c));
    return ids;
  };
  const formatar = (formato: FormatoCelula) => mudar(anterior => {
    const formatos = { ...anterior.formatos };
    for (const id of idsSelecionados()) formatos[id] = { ...formatos[id], ...formato };
    return { ...anterior, formatos };
  });
  const formatarMoeda = (ativar: boolean) => mudar(anterior => {
    const moedas = new Set(anterior.moedas);
    for (const id of idsSelecionados()) { if (ativar) moedas.add(id); else moedas.delete(id); }
    return { ...anterior, moedas: [...moedas] };
  });
  const copiar = (event: React.ClipboardEvent) => {
    if (!rascunho) return;
    event.preventDefault();
    const linhas: string[][] = [];
    for (let l = limites.primeiraLinha; l <= limites.ultimaLinha; l++) {
      const linha: string[] = [];
      for (let c = limites.primeiraColuna; c <= limites.ultimaColuna; c++) linha.push(rascunho.celulas[endereco(l, c)] || '');
      linhas.push(linha);
    }
    event.clipboardData.setData('text/plain', escreverTSV(linhas));
  };
  const confirmar = () => { if (ignorarBlur.current) { ignorarBlur.current = false; return; } if (editando && texto !== (rascunho?.celulas[editando] || '')) escrever(editando, textoDaFormula(texto)); setEditando(null); };
  const salvar = async () => {
    if (!rascunho || ocupado) return;
    const documento = editando ? { ...rascunho, celulas: { ...rascunho.celulas, [editando]: textoDaFormula(texto) } } : rascunho;
    setOcupado(true); setErro('');
    try {
      const salva = await api.savePlanilha(documento);
      setRascunho(salva); setAlterada(false); setEditando(null);
      setPlanilhas(atuais => atuais.map(p => p.id === salva.id ? resumo(salva) : p)); setAviso('Planilha salva.');
      return true;
    } catch (e: any) { setErro(e.message); return false; } finally { setOcupado(false); }
  };
  const focar = (id: string, estender = false) => {
    selecionar(id, estender);
    const linha = Number(id.slice(1)) - 1, elemento = grade.current;
    if (elemento && (linha * ALTURA_LINHA < elemento.scrollTop || (linha + 2) * ALTURA_LINHA > elemento.scrollTop + elemento.clientHeight)) {
      elemento.scrollTop = Math.max(0, linha * ALTURA_LINHA - elemento.clientHeight / 2); atualizarJanela();
    }
    requestAnimationFrame(() => requestAnimationFrame(() => grade.current?.querySelector<HTMLButtonElement>(`[data-celula="${id}"]`)?.focus()));
  };
  const mover = (id: string, dl: number, dc: number, estender = false) => focar(endereco(Math.max(0, Math.min(LINHAS - 1, Number(id.slice(1)) - 1 + dl)), Math.max(0, Math.min(COLUNAS - 1, id.charCodeAt(0) - 65 + dc))), estender);
  const iniciar = (id: string, novo?: string, barra = false) => { ignorarBlur.current = false; setNaBarra(barra || novo === "="); selecionar(id); setTexto(novo ?? rascunho?.celulas[id] ?? ''); setEditando(id); };
  const colar = (event: React.ClipboardEvent, id: string) => {
    event.preventDefault();
    const conteudo = event.clipboardData.getData('text/plain');
    if (conteudo.length > 3100000) { setErro('O conteúdo excede a capacidade da planilha.'); return; }
    let linhas: string[][];
    try { linhas = lerTSV(conteudo); } catch (e: any) { setErro(e.message); return; }
    const l0 = Number(id.slice(1)) - 1, c0 = id.charCodeAt(0) - 65;
    if (linhas.length > LINHAS - l0 || linhas.some(l => l.length > COLUNAS - c0)) { setErro('A colagem excede o espaço disponível. Selecione outra célula ou reduza os dados.'); return; }
    const novos: Record<string, string> = {};
    for (let l = 0; l < linhas.length; l++) {
      const valores = linhas[l];
      for (let c = 0; c < valores.length; c++) {
        if (valores[c].length > MAX_TEXTO_CELULA) { setErro(`Cada célula aceita até ${MAX_TEXTO_CELULA} caracteres.`); return; }
        novos[endereco(l0 + l, c0 + c)] = valores[c];
      }
    }
    mudar(anterior => {
      const celulas = { ...anterior.celulas, ...novos };
      for (const id of Object.keys(celulas)) if (celulas[id] === '') delete celulas[id];
      return { ...anterior, celulas };
    }); setErro('');
  };
  const executarAcao = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rascunho || !acao || ocupado) return;
    setOcupado(true); setErroAcao(''); setErro('');
    try {
      if (acao === 'limpar') aplicar(await api.limparPlanilha(rascunho.id, rascunho.versao, senha));
      else {
        await api.excluirPlanilha(rascunho.id, rascunho.versao, senha);
        const restantes = planilhas.filter(p => p.id !== rascunho.id);
        setPlanilhas(restantes); setRascunho(null); setAlterada(false); setEditando(null);
        if (restantes[0]) {
          try { aplicar(await api.getPlanilha(restantes[0].id)); } catch (e: any) { setErro(e.message); }
        }
      }
      setAcao(null); setSenha(''); setAviso(acao === 'limpar' ? 'Planilha limpa.' : 'Planilha excluída.');
    } catch (e: any) { setErroAcao(e.message); setSenha(''); } finally { setOcupado(false); }
  };
  const pedirAcao = (tipo: 'limpar' | 'excluir') => { setAcao(tipo); setSenha(''); setErroAcao(''); };
  const moeda = rascunho?.moedas.includes(selecionada) || false;
  const formatoSelecionado = rascunho?.formatos?.[selecionada] || {};
  const vertical = limites.primeiraColuna === limites.ultimaColuna;
  const intervaloLinear = ancora !== selecionada && (vertical || limites.primeiraLinha === limites.ultimaLinha);
  let destinoResultado = '';
  if (rascunho && !editando && intervaloLinear) {
    let linha = limites.ultimaLinha + (vertical ? 1 : 0);
    let coluna = limites.ultimaColuna + (vertical ? 0 : 1);
    while (linha < LINHAS && coluna < COLUNAS) {
      const id = endereco(linha, coluna);
      if (!rascunho.celulas[id]) { destinoResultado = id; break; }
      if (vertical) linha++; else coluna++;
    }
  }
  const intervalo = endereco(limites.primeiraLinha, limites.primeiraColuna) + ':' + endereco(limites.ultimaLinha, limites.ultimaColuna);
  // Gera o PNG da seleção atual, incluindo o que está sendo digitado e ainda não foi salvo.
  const imagemDaSelecao = () => {
    if (!rascunho) return null;
    const documento = editando ? { ...rascunho, celulas: { ...rascunho.celulas, [editando]: textoDaFormula(texto) } } : rascunho;
    confirmar();
    const inicio = endereco(limites.primeiraLinha, limites.primeiraColuna), final = endereco(limites.ultimaLinha, limites.ultimaColuna);
    try {
      const png = pngDoCanvas(desenharSelecaoPlanilha(documento, inicio, final));
      return { png, nome: nomeArquivoImagem(documento, inicio, final), legenda: `${documento.nome} · ${inicio === final ? inicio : inicio + ':' + final}` };
    } catch (e: any) { setErro(e.message); return null; }
  };
  const copiarImagem = async () => {
    setAvisoImagem(''); setErro('');
    const gerada = imagemDaSelecao();
    if (!gerada) return;
    try {
      if (await copiarImagemParaAreaDeTransferencia(gerada.png)) { setAvisoImagem('Imagem copiada. Cole com Ctrl+V no WhatsApp ou no e-mail.'); return; }
    } catch { /* Sem permissão de área de transferência: cai no download. */ }
    try {
      baixarImagem(await gerada.png, gerada.nome);
      setAvisoImagem('O navegador não permitiu copiar a imagem; ela foi baixada como arquivo.');
    } catch (e: any) { setErro(e.message); }
  };
  const enviarImagem = async () => {
    setAvisoImagem(''); setErro('');
    const gerada = imagemDaSelecao();
    if (!gerada) return;
    try { setEnvioImagem({ imagem: await gerada.png, nome: gerada.nome, legenda: gerada.legenda }); } catch (e: any) { setErro(e.message); }
  };
  const fim = Math.min(LINHAS, janela.inicio + janela.quantidade);
  return <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
    {IMPRESSAO_PLANILHAS_PREVIEW && impressao && <PlanilhaImpressaoPreview {...impressao} fechar={() => setImpressao(null)}/>}
    {envioImagem && <EnviarImagemPlanilha imagem={envioImagem.imagem} nome={envioImagem.nome} legendaInicial={envioImagem.legenda} fechar={() => setEnvioImagem(null)}/>}
    <dialog ref={dialogoSaida} role="alertdialog" aria-labelledby="titulo-saida-planilha" onCancel={e => { e.preventDefault(); if (!ocupado) concluirSaida(false); }} className="m-auto max-w-md rounded-xl p-5 shadow-xl backdrop:bg-slate-950/70">
      <h2 id="titulo-saida-planilha" className="font-bold">Salvar alterações em {rascunho?.nome}?</h2>
      <p className="my-3 text-sm">Se descartar, as alterações feitas desde o último salvamento serão perdidas.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={ocupado} onClick={async () => concluirSaida(Boolean(await salvar()))} className="rounded bg-emerald-700 px-3 py-2 text-white">Salvar</button>
        <button type="button" disabled={ocupado} onClick={() => concluirSaida(true)} className="rounded border px-3 py-2">Descartar</button>
        <button type="button" disabled={ocupado} onClick={() => concluirSaida(false)} className="rounded border px-3 py-2">Cancelar</button>
      </div>
    </dialog>
    {acao && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 p-4"><form role="alertdialog" aria-modal="true" aria-labelledby="planilha-confirmar-titulo" onSubmit={executarAcao} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
      <h2 id="planilha-confirmar-titulo" className="font-black">{acao === 'limpar' ? 'Limpar planilha' : 'Excluir planilha'}</h2>
      <p className="text-sm">{acao === 'limpar' ? 'Apagar todas as células e formatações' : 'Excluir a planilha'} “{rascunho?.nome}”? Confirme com a senha do gerente.</p>
      <label className="block text-sm font-bold">Senha do gerente<input autoFocus type="password" autoComplete="off" maxLength={64} value={senha} onChange={e => setSenha(e.target.value)} disabled={ocupado} className="mt-1 w-full rounded border p-3" /></label>
      {erroAcao && <p role="alert" className="text-sm text-red-700">{erroAcao}</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={ocupado} onClick={() => { setAcao(null); setSenha(''); }} className="rounded border px-4 py-2">Cancelar</button><button type="submit" disabled={ocupado || !senha} className="rounded bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-40">{ocupado ? 'Aguarde…' : acao === 'limpar' ? 'Confirmar limpeza' : 'Confirmar exclusão'}</button></div>
    </form></div>}
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-3 text-2xl font-black text-slate-900"><Sheet className="text-emerald-700" />Planilhas</h1><div className="flex flex-wrap gap-2"><button type="button" disabled={ocupado || carregando || planilhas.length >= MAX_PLANILHAS} onClick={() => void criar()} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-bold disabled:opacity-40"><Plus size={16} />Nova planilha</button>{rascunho && <button type="button" disabled={ocupado || !pendente} onClick={() => void salvar()} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"><Save size={16} />{ocupado ? 'Aguarde…' : 'Salvar'}</button>}</div></header>
    {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
    {carregando ? <p role="status">Carregando planilhas…</p> : !rascunho ? <div className="rounded-xl border bg-white p-8 text-center text-slate-600"><p>Crie uma planilha para começar.</p></div> : <fieldset disabled={ocupado || Boolean(acao)} className="min-w-0 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><label className="flex items-center gap-2 text-emerald-800"><Table2 size={19}/><input aria-label="Nome da planilha" maxLength={60} value={rascunho.nome} onChange={e => mudar(a => ({ ...a, nome: e.target.value }))} className="w-52 rounded border px-2 py-1 font-bold text-slate-800" /></label><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">{LINHAS.toLocaleString('pt-BR')} linhas × {COLUNAS} colunas</span><button type="button" aria-label="Recarregar planilha" onClick={() => void abrir(rascunho.id)} className="rounded border p-2"><RefreshCw size={15}/></button><button type="button" onClick={() => pedirAcao('limpar')} className="flex items-center gap-1 rounded border px-3 py-2 text-xs font-bold"><Eraser size={15}/>Limpar planilha</button><button type="button" onClick={() => pedirAcao('excluir')} className="flex items-center gap-1 rounded border border-red-200 px-3 py-2 text-xs font-bold text-red-700"><Trash2 size={15}/>Excluir planilha</button></div></div>
      <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-4 py-2 text-xs"><span>Formato da seleção</span><button type="button" aria-pressed={!moeda} onClick={() => formatarMoeda(false)} className={`rounded border px-3 py-1.5 ${!moeda ? 'bg-emerald-100 font-bold text-emerald-900' : ''}`}>Número / texto</button><button type="button" aria-pressed={moeda} onClick={() => formatarMoeda(true)} className={`rounded border px-3 py-1.5 ${moeda ? 'bg-emerald-100 font-bold text-emerald-900' : ''}`}>R$ Moeda</button><span className="mx-1 h-6 border-l border-slate-300" aria-hidden="true"/>
        <button type="button" aria-pressed={Boolean(formatoSelecionado.negrito)} onClick={() => formatar({ negrito: true })} className={`rounded border px-3 py-1.5 font-bold ${formatoSelecionado.negrito ? 'bg-emerald-100 text-emerald-900' : 'bg-white'}`}>Negrito</button>
        <button type="button" aria-pressed={!formatoSelecionado.negrito} onClick={() => formatar({ negrito: false })} className={`rounded border px-3 py-1.5 ${!formatoSelecionado.negrito ? 'bg-emerald-100 text-emerald-900' : 'bg-white'}`}>Sem negrito</button>
        <span className="ml-1">Cor do texto</span>
        {(Object.keys(CORES_CELULA) as Array<keyof typeof CORES_CELULA>).map(cor => <button key={cor} type="button" aria-label={`Cor do texto: ${cor}`} aria-pressed={(formatoSelecionado.cor || 'preto') === cor} onClick={() => formatar({ cor })} className={`flex items-center gap-1.5 rounded border px-2 py-1.5 ${(formatoSelecionado.cor || 'preto') === cor ? 'border-emerald-600 bg-white font-bold' : 'border-slate-300 bg-white'}`}><span aria-hidden="true" className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: CORES_CELULA[cor] }}/>{cor === 'preto' ? 'Preto' : cor === 'vermelho' ? 'Vermelho' : cor === 'verde' ? 'Verde' : 'Amarelo'}</button>)}
        {IMPRESSAO_PLANILHAS_PREVIEW && <button type="button" onClick={() => {
          const documento = editando ? { ...rascunho, celulas: { ...rascunho.celulas, [editando]: textoDaFormula(texto) } } : rascunho;
          confirmar();
          setImpressao({ planilha: documento, inicio: endereco(limites.primeiraLinha, limites.primeiraColuna), fim: endereco(limites.ultimaLinha, limites.ultimaColuna) });
        }} className="rounded border border-emerald-700 bg-white px-3 py-1.5 font-bold text-emerald-800">Imprimir seleção · prévia</button>}
        <button type="button" onClick={() => void copiarImagem()} title="Copia as células selecionadas como imagem, para colar no WhatsApp ou no e-mail" className="flex items-center gap-1.5 rounded border border-emerald-700 bg-white px-3 py-1.5 font-bold text-emerald-800"><Copy size={14}/>Copiar como imagem</button>
        <button type="button" onClick={() => void enviarImagem()} title="Envia as células selecionadas como imagem pelo WhatsApp da Automação" className="flex items-center gap-1.5 rounded border border-emerald-700 bg-white px-3 py-1.5 font-bold text-emerald-800"><Send size={14}/>Enviar imagem no WhatsApp</button>
        {avisoImagem && <span role="status" className="font-bold text-emerald-800">{avisoImagem}</span>}
        <span className="ml-auto hidden items-center gap-1 text-slate-400 lg:flex"><ArrowDownToLine size={13}/>Cole linhas e colunas de outra planilha</span></div>
      <div className="flex items-center gap-3 border-b px-3 py-2"><span className="w-16 shrink-0 rounded border bg-slate-50 p-2 text-center font-mono text-xs font-bold">{selecionada}</span><FunctionSquare size={18} className="shrink-0 text-slate-400"/><input ref={barraFormula} aria-label={`Conteúdo de ${selecionada}`} placeholder="Digite um valor ou uma fórmula, como =MÉDIA(A1:A5)" value={editando === selecionada ? texto : rascunho.celulas[selecionada] || ''} onFocus={() => { if (!editando || !naBarra) iniciar(selecionada, undefined, true); }} onChange={e => { setTexto(e.target.value.slice(0, MAX_TEXTO_CELULA)); setEditando(selecionada); }} onBlur={confirmar} onKeyDown={e => { if (e.key === 'Enter') { confirmar(); focar(selecionada); } if (e.key === 'Escape') { ignorarBlur.current = true; setEditando(null); focar(selecionada); } }} className="min-w-0 flex-1 rounded p-2 font-mono text-sm outline-none focus:bg-emerald-50"/>
{editando && intervaloPendente.test(texto) && <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <span>Resultado em <b>{editando}</b> · Enter para somar</span>
        {['SOMA', 'MÉDIA', 'MEDIANA'].map(funcao => <button type="button" key={funcao} className="rounded border px-3 py-1" onPointerDown={e => e.preventDefault()} onClick={() => {
          escrever(editando, `=${funcao}(${texto.slice(1)})`);
          setEditando(null); focar(editando);
        }}>{funcao}</button>)}
      </div>}
      </div>
      <div ref={grade} onScroll={atualizarJanela} className="planilhas-grade max-h-[60vh] min-h-[340px] overflow-auto overscroll-contain" aria-label="Células da planilha" tabIndex={-1}>
        <table className="table-fixed border-separate border-spacing-0 text-xs" style={{ width: 44 + Array.from({ length: COLUNAS }, (_, c) => larguraColuna(c, rascunho.larguras)).reduce((a, b) => a + b, 0) }}>
          <colgroup><col style={{ width: 44 }}/>{Array.from({ length: COLUNAS }, (_, c) => <col key={c} style={{ width: larguraColuna(c, rascunho.larguras) }}/>)}</colgroup>
          <thead className="sticky top-0 z-20"><tr><th className="sticky left-0 z-30 border-b border-r bg-slate-100 text-slate-400">◢</th>{Array.from({ length: COLUNAS }, (_, c) => <th key={c} className={`relative border-b border-r font-semibold ${selecionada.charCodeAt(0) - 65 === c ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-500'}`}>
            {String.fromCharCode(65 + c)}
            <button type="button" role="separator" aria-orientation="vertical" aria-label={`Largura da coluna ${String.fromCharCode(65 + c)}`} aria-valuemin={LARGURA_COLUNA_MIN} aria-valuemax={LARGURA_COLUNA_MAX} aria-valuenow={larguraColuna(c, rascunho.larguras)} title="Arraste para ajustar; dois cliques para ajustar ao conteúdo. Use as setas para mudar a largura." className="planilhas-ajustar-coluna"
              onPointerDown={e => {
                if (e.button !== 0) return;
                e.preventDefault(); confirmar(); e.currentTarget.focus();
                e.currentTarget.setPointerCapture(e.pointerId);
                redimensionando.current = { pointerId: e.pointerId, coluna: c, x: e.clientX, largura: larguraColuna(c, rascunho.larguras) };
              }}
              onPointerMove={e => {
                const arraste = redimensionando.current;
                if (arraste?.pointerId === e.pointerId) ajustarLargura(arraste.coluna, arraste.largura + e.clientX - arraste.x);
              }}
              onPointerUp={e => { redimensionando.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
              onPointerCancel={() => { redimensionando.current = null; }}
              onLostPointerCapture={() => { redimensionando.current = null; }}
              onDoubleClick={() => ajustarAoConteudo(c)}
              onKeyDown={e => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); ajustarLargura(c, larguraColuna(c, rascunho.larguras) + (e.key === 'ArrowLeft' ? -10 : 10)); }
                else if (e.key === 'Enter') { e.preventDefault(); ajustarAoConteudo(c); }
                else if (e.key === 'Home') { e.preventDefault(); ajustarLargura(c, larguraColuna(c)); }
              }}/>
          </th>)}</tr></thead><tbody>
          {janela.inicio > 0 && <tr aria-hidden="true" className="planilhas-espaco"><td colSpan={COLUNAS + 1} style={{ height: janela.inicio * ALTURA_LINHA }}/></tr>}
          {Array.from({ length: fim - janela.inicio }, (_, indice) => { const l = janela.inicio + indice; return <tr key={l} data-linha={l + 1}><th className={`sticky left-0 z-10 border-b border-r font-mono font-normal ${Number(selecionada.slice(1)) === l + 1 ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-50 text-slate-500'}`}>{l + 1}</th>{Array.from({ length: COLUNAS }, (_, c) => {
            const id = endereco(l, c), conteudo = exibicao[id] || vazia, ativo = selecionada === id;
            const formato = rascunho.formatos?.[id];
            const noIntervalo = l >= limites.primeiraLinha && l <= limites.ultimaLinha && c >= limites.primeiraColuna && c <= limites.ultimaColuna;
            return <td key={id} style={{ '--planilha-cor': formato?.cor ? CORES_CELULA[formato.cor] : conteudo.erro ? '#dc2626' : CORES_CELULA.preto, '--planilha-peso': formato?.negrito ? 700 : 400 } as React.CSSProperties} className={`relative border-b border-r border-slate-200 ${noIntervalo ? 'planilhas-selecionada' : 'bg-white'} ${ativo ? 'z-[1] ring-2 ring-inset ring-emerald-600' : ''}`}>
              {editando === id && !naBarra ? <input autoFocus aria-label={`Editar ${id}`} value={texto} onChange={e => setTexto(e.target.value.slice(0, MAX_TEXTO_CELULA))} onBlur={confirmar} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); confirmar(); mover(id, e.key === 'Enter' ? 1 : 0, e.key === 'Tab' ? e.shiftKey ? -1 : 1 : 0); } if (e.key === 'Escape') { ignorarBlur.current = true; setEditando(null); focar(id); } }} className="absolute inset-0 w-full bg-white px-3 font-mono outline-none ring-2 ring-inset ring-emerald-600"/>
                : <button type="button" data-celula={id} aria-pressed={noIntervalo} tabIndex={ativo ? 0 : -1} aria-label={`${id}: ${conteudo.texto || 'vazia'}`} title={rascunho.celulas[id] || id} onFocus={() => { if (!editando) setSelecionada(id); }} onPointerDown={e => iniciarSelecao(e, id)} onClick={e => { if (ignorarClique.current) { ignorarClique.current = false; return; } selecionar(id, e.shiftKey); }} onDoubleClick={() => iniciar(id)} onPaste={e => colar(e, endereco(limites.primeiraLinha, limites.primeiraColuna))} onCopy={copiar} onKeyDown={e => {
                  const direcoes: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, e.shiftKey ? -1 : 1] };
                  if (direcoes[e.key]) { e.preventDefault(); mover(selecionada, direcoes[e.key][0], direcoes[e.key][1], e.shiftKey && e.key !== 'Tab'); }
                  else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); iniciar(selecionada); }
                  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); escrever(selecionada, ''); }
                  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); iniciar(selecionada, e.key); }
                }} className={`block w-full overflow-hidden whitespace-nowrap px-3 outline-none ${conteudo.erro ? 'text-left font-bold text-red-700' : conteudo.numerico ? 'text-right font-mono tabular-nums' : 'text-left text-slate-700'}`} style={{ maxWidth: larguraColuna(c, rascunho.larguras) }}>{editando === id && naBarra ? texto : conteudo.texto}</button>}
            </td>;
          })}</tr>; })}
          {fim < LINHAS && <tr aria-hidden="true" className="planilhas-espaco"><td colSpan={COLUNAS + 1} style={{ height: (LINHAS - fim) * ALTURA_LINHA }}/></tr>}
        </tbody></table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-3 py-2"><nav aria-label="Planilhas" className="flex flex-wrap gap-2">{planilhas.map(p => <button key={p.id} type="button" aria-current={p.id === rascunho.id ? 'page' : undefined} onClick={() => p.id !== rascunho.id && void abrir(p.id)} className={`max-w-52 truncate rounded border px-3 py-2 text-xs font-bold ${p.id === rascunho.id ? 'border-emerald-600 bg-white text-emerald-800' : ''}`}>{p.id === rascunho.id ? rascunho.nome : p.nome}</button>)}</nav><div role="status" aria-label="Resumo da seleção" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
        <span className="font-mono">{ancora === selecionada ? selecionada : `${endereco(limites.primeiraLinha, limites.primeiraColuna)}:${endereco(limites.ultimaLinha, limites.ultimaColuna)}`}</span>
        {resumoSelecao.erro ? <span>Cálculo do intervalo excedeu o limite.</span> : resumoSelecao.quantidade > 0 ? <><span>Números: <b>{resumoSelecao.quantidade}</b></span><span>Média: <b>{resumoSelecao.media}</b></span><span>Soma: <b>{resumoSelecao.soma}</b></span><span>Mín.: <b>{resumoSelecao.minimo}</b></span><span>Máx.: <b>{resumoSelecao.maximo}</b></span></> : <span>Selecione células numéricas</span>}
      </div>
      {!editando && intervaloLinear && <div className="flex flex-wrap items-center gap-2 text-xs">
        {destinoResultado ? <><span>Inserir resultado em <b>{destinoResultado}</b></span>
          {['SOMA', 'MÉDIA', 'MEDIANA'].map(funcao => <button key={funcao} type="button" className="rounded border bg-white px-3 py-2 font-bold" onClick={() => {
            escrever(destinoResultado, `=${funcao}(${intervalo})`);
            focar(destinoResultado);
          }}>{funcao}</button>)}</> : <span>Sem célula vazia após o intervalo nesta {vertical ? 'coluna' : 'linha'}.</span>}
      </div>}
      </footer>
    </fieldset>}
    {rascunho && <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><p>Arraste a borda do cabeçalho para ajustar a coluna; dois cliques ajustam ao conteúdo. Arraste as células para selecionar um intervalo ou use Shift + clique / setas. Dê dois cliques para editar. Fórmulas: <code>=B4*C4</code> · <code>=SOMA(D4:D6)</code></p><p role="status" className="flex items-center gap-1">{!pendente && <Check size={14}/>}{pendente ? 'Alterações não salvas' : aviso || 'Salvo'}</p></div>}
  </section>;
}
