/** Montos en pesos para el dashboard. Se comparten entre la pagina y sus graficos. */

export function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Version corta para los ejes: $35 M en lugar de $35.000.000. */
export function formatCompactAmount(value: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0);
}
