import React, { useEffect } from 'react';
import { TituloRecebimento } from '../types';
import { ehTituloTerceiro } from '../lib/pagamentos';
import { ClienteDocumentoLookupInput } from './ClienteDocumentoLookupInput';

export function CamposTituloRecebimento({forma, nome, documento, valor, titulos, onChange}: {forma:string; nome:string; documento?:string; valor:number; titulos:TituloRecebimento[]; onChange:(t:TituloRecebimento[])=>void}) {
  useEffect(() => {
    if (!titulos.length) onChange([{tipo:forma as TituloRecebimento['tipo'],nomeTitular:ehTituloTerceiro(forma)?'':nome,documentoTitular:ehTituloTerceiro(forma)?'':documento || '',valor:Number.isFinite(valor)?valor:0,vencimento:'',numeroDocumento:''}]);
    else if (titulos.length===1 && titulos[0].valor!==valor && Number.isFinite(valor)) onChange([{...titulos[0],valor}]);
  },[forma,titulos,valor,nome,documento]);
  return <div className="receber-campos-titulos">{titulos.map((t,i)=>{
    const mudar=(dados:Partial<TituloRecebimento>)=>onChange(titulos.map((atual,j)=>i===j?{...atual,...dados}:atual));
    return <div key={i} className="receber-titulo">
      <label>Vencimento<input aria-label={`Vencimento, linha ${i+1}`} type="date" value={t.vencimento} onChange={e=>mudar({vencimento:e.target.value})}/></label>
      <ClienteDocumentoLookupInput label={`CPF/CNPJ, linha ${i+1}`} value={t.documentoTitular} onChange={documentoTitular=>mudar({documentoTitular})} onClienteEncontrado={nomeTitular=>mudar({nomeTitular})}/>
      <label>Titular<input aria-label={`Titular, linha ${i+1}`} value={t.nomeTitular} maxLength={160} onChange={e=>mudar({nomeTitular:e.target.value})}/></label>
      <label>Banco<input value={t.banco || ''} maxLength={60} onChange={e=>mudar({banco:e.target.value})}/></label>
      <label>{forma.startsWith('cheque')?'Nº cheque':'Nº boleto'}<input aria-label={`Número do documento, linha ${i+1}`} value={t.numeroDocumento} maxLength={60} onChange={e=>mudar({numeroDocumento:e.target.value})}/></label>
      <label>Fone<input value={t.telefone || ''} maxLength={30} onChange={e=>mudar({telefone:e.target.value})}/></label>
      {titulos.length>1 && <label>Valor<input type="number" value={t.valor} step="0.01" onChange={e=>mudar({valor:Number(e.target.value)})}/></label>}
    </div>;
  })}</div>;
}
