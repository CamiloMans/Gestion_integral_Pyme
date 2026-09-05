import 'dotenv/config';

export const APP_TIMEZONE = String(process.env.APP_TIMEZONE || 'America/Santiago').trim() || 'America/Santiago';

/**
 * Devuelve el dia calendario 'YYYY-MM-DD' que corresponde a un instante en una zona horaria.
 * Acepta un Date o cualquier valor parseable por `new Date(...)`; devuelve null si es invalido.
 */
export function formatDateInTimeZone(value, timeZone = APP_TIMEZONE) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const part = Object.fromEntries(parts.map((item) => [item.type, item.value]));

  return `${part.year}-${part.month}-${part.day}`;
}

/** Hoy, como 'YYYY-MM-DD', en la zona horaria de la aplicacion (Chile por defecto). */
export function todayInAppTimeZone(timeZone = APP_TIMEZONE) {
  return formatDateInTimeZone(new Date(), timeZone);
}
