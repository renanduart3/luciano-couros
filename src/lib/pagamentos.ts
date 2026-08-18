export const FORMAS_PAGAMENTO = [
  { value: "avista_dinheiro", label: "À VISTA DINHEIRO" },
  { value: "avista_debito", label: "À VISTA DÉBITO" },
  { value: "cartao_credito", label: "CARTÃO DE CRÉDITO" },
  { value: "cheque_emitente", label: "CHEQUE EMITENTE" },
  { value: "cheque_terceiro", label: "CHEQUE TERCEIRO" },
  { value: "duplicata_emitente", label: "DUPLICATA EMITENTE" },
  { value: "duplicata_terceiro", label: "DUPLICATA TERCEIRO" },
  { value: "bonus", label: "BÔNUS" },
  { value: "pix", label: "PIX" },
] as const;

export type FormaPagamentoPadrao = typeof FORMAS_PAGAMENTO[number]["value"];

export interface DadosCheque {
  vencimento: string;
  cpfTitular: string;
  cpfTerceiro: string;
  banco: string;
  numeroCheque: string;
}

export const dadosChequeVazios = (): DadosCheque => ({
  vencimento: "",
  cpfTitular: "",
  cpfTerceiro: "",
  banco: "",
  numeroCheque: "",
});

export const ehCheque = (forma: string) => forma === "cheque_emitente" || forma === "cheque_terceiro";
export const ehChequeTerceiro = (forma: string) => forma === "cheque_terceiro";
