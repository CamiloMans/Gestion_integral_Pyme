import type { Empresa } from '@/data/mockData';

export type EmpresaFusionDraft = {
  razonSocial: string;
  rut: string;
  numeroContacto: string;
  correoElectronico: string;
  categoria: 'Empresa' | 'Persona Natural' | '';
};

function toTimestamp(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/**
 * Empresa que conviene conservar: la que tiene mas gastos y, ante empate, la mas
 * antigua (suele ser el registro "real" y el resto los duplicados creados despues).
 */
export function elegirEmpresaPrincipal(
  empresas: Empresa[],
  gastosPorEmpresa: Record<string, number> = {},
): string {
  if (empresas.length === 0) return '';

  return empresas.reduce((mejor, candidata) => {
    const gastosMejor = gastosPorEmpresa[mejor.id] ?? 0;
    const gastosCandidata = gastosPorEmpresa[candidata.id] ?? 0;

    if (gastosCandidata !== gastosMejor) {
      return gastosCandidata > gastosMejor ? candidata : mejor;
    }

    return toTimestamp(candidata.createdAt) < toTimestamp(mejor.createdAt) ? candidata : mejor;
  }).id;
}

/**
 * Datos con los que se prellena el formulario. El nombre siempre viene de la empresa
 * principal, pero RUT, contacto y correo se rescatan de cualquiera de las seleccionadas
 * si la principal los tiene vacios: esos registros se eliminan y el dato se perderia.
 */
export function buildFusionDraft(empresas: Empresa[], empresaPrincipalId: string): EmpresaFusionDraft {
  const principal = empresas.find((item) => item.id === empresaPrincipalId);

  const primerValorPresente = (pick: (empresa: Empresa) => string | undefined) => {
    const desdePrincipal = principal ? pick(principal) : undefined;
    if (desdePrincipal && desdePrincipal.trim()) return desdePrincipal.trim();

    const desdeOtras = empresas
      .map(pick)
      .find((value) => Boolean(value && value.trim()));

    return desdeOtras ? desdeOtras.trim() : '';
  };

  return {
    razonSocial: (principal?.razonSocial || '').toUpperCase(),
    rut: primerValorPresente((empresa) => empresa.rut),
    numeroContacto: primerValorPresente((empresa) => empresa.numeroContacto),
    correoElectronico: primerValorPresente((empresa) => empresa.correoElectronico),
    categoria: (principal?.categoria
      || empresas.find((empresa) => empresa.categoria)?.categoria
      || '') as 'Empresa' | 'Persona Natural' | '',
  };
}

export function contarGastosAReasignar(
  empresas: Empresa[],
  empresaPrincipalId: string,
  gastosPorEmpresa: Record<string, number> = {},
): number {
  return empresas
    .filter((item) => item.id !== empresaPrincipalId)
    .reduce((total, item) => total + (gastosPorEmpresa[item.id] ?? 0), 0);
}
