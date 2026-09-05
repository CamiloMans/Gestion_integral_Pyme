export const formatDateOnly = (value?: string | null): string => {
  if (!value) return "-";

  const input = String(value).trim();
  if (!input) return "-";

  const isoDateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "-";

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear());

  return `${day}/${month}/${year}`;
};

const DATE_ONLY_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

const localDateOnly = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Normaliza a 'YYYY-MM-DD'. Tolera timestamps ISO ('2026-09-04T00:00:00.000Z' -> '2026-09-04'). */
export const toDateOnly = (value?: string | null): string => {
  if (!value) return "";

  const input = String(value).trim();
  if (!input) return "";

  const match = input.match(DATE_ONLY_PREFIX);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "";

  return localDateOnly(parsed);
};

/** Fecha calendario como Date local al mediodia (inmune a DST y a corrimientos de zona). */
export const parseDateOnly = (value?: string | null): Date | null => {
  const iso = toDateOnly(value);
  if (!iso) return null;

  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

/** Hoy en la zona del navegador, como 'YYYY-MM-DD'. Reemplaza new Date().toISOString().split('T')[0]. */
export const todayDateOnly = (): string => localDateOnly(new Date());
