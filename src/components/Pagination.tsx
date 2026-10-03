import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  alwaysVisible?: boolean;
}

export function Pagination({ page, pageSize, totalItems, onPageChange, pageSizeOptions, onPageSizeChange, alwaysVisible = false }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (!alwaysVisible && totalItems <= pageSize) return null;

  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3"><span className="font-semibold text-slate-500">Exibindo {firstItem}–{lastItem} de {totalItems}</span>{pageSizeOptions?.length && onPageSizeChange ? <label className="font-bold text-slate-600">Por página <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} className="ml-1 rounded border border-slate-300 bg-white px-2 py-1">{pageSizeOptions.map(opcao => <option key={opcao} value={opcao}>{opcao}</option>)}</select></label> : null}</div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft size={14} /> Anterior
        </button>
        <span className="min-w-28 text-center font-black text-slate-700">Página {page} de {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
          Próxima <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.min(Math.max(1, page), Math.max(1, Math.ceil(items.length / pageSize)));
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}
