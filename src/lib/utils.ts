// Brazilian localization formatting helpers

/**
 * Formats a number to Brazilian Real (R$) currency format
 */
export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "R$ 0,00";
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

/**
 * Formats an ISO Date string (YYYY-MM-DD) to Brazilian date format (DD/MM/YYYY)
 */
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return "-";
  
  // Accept both ISO timestamps and SQLite's "YYYY-MM-DD HH:mm:ss" format.
  const cleanDate = dateString.split(/[T ]/)[0];
  const parts = cleanDate.split("-");
  if (parts.length !== 3) return dateString;
  
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Formats a decimal number with commas instead of dots
 */
export function formatDecimal(value: number | undefined | null, decimals = 2): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "0";
  }
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Parses a string containing a Brazilian number (e.g. "1.250,50" or "12,5") into a JS float
 */
export function parseBrazilianNumber(value: string): number {
  if (!value) return 0;
  // Remove thousands separators (dots) and replace decimal separator (comma) with dot
  const sanitized = value
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  
  const parsed = parseFloat(sanitized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Converts form input event to a float value safely
 */
export function handleNumberInput(value: string): number {
  return parseBrazilianNumber(value);
}

/**
 * Basic cn class utility for merging classes
 */
export function cn(...classes: (string | undefined | boolean | null)[]) {
  return classes.filter(Boolean).join(" ");
}
