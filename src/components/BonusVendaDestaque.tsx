import React from "react";
import { WalletCards } from "lucide-react";
import { Venda } from "../types";
import { formatCurrency } from "../lib/utils";

export function BonusVendaDestaque({ venda, className = "" }: { venda: Venda; className?: string }) {
  const valor = Number(venda.bonusGeradoVenda || 0);
  if (valor <= 0.005) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-100 px-2 py-1 text-[10px] font-black uppercase text-violet-900 ${className}`}
      title="Bônus gerado por devoluções e pagamentos excedentes ligados somente a este documento. O saldo atual do cliente pode ser menor se ele já usou o crédito."
    >
      <WalletCards size={13} /> Bônus deste {venda.vencimento ? "vale" : "venda"}: {formatCurrency(valor)}
    </span>
  );
}
