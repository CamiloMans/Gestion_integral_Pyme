import type { Empresa } from '@/data/mockData';
import type { GastoDocumentExtractionResult, TipoDocumentoOption } from '@/services/postgresApi';

type GastoDraftValidationInput = {
  fecha?: string | null;
  categoria?: string | null;
  empresaId?: string | null;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  montoTotal?: number | string | null;
  comentarioTipoDocumento?: string | null;
};

export function normalizeLookupText(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeRut(value?: string | null) {
  return String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

export function isExtractableDocument(file: File) {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  return (
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/xml' ||
    mimeType === 'text/xml' ||
    /\.(jpe?g|png|webp|pdf|xml)$/i.test(fileName)
  );
}

export function resolveTipoDocumentoId(
  tiposDocumento: TipoDocumentoOption[],
  extractedType?: string | null,
) {
  const normalizedType = normalizeLookupText(extractedType);
  if (!normalizedType) return '';

  return tiposDocumento.find((item) => normalizeLookupText(item.nombre) === normalizedType)?.id || '';
}

export function resolveEmpresaId(
  empresas: Empresa[],
  extracted: Pick<
    GastoDocumentExtractionResult,
    'empresaRut' | 'emisorRut' | 'empresaNombre' | 'emisorNombre'
  >,
) {
  const candidateRuts = [
    extracted.empresaRut,
    extracted.emisorRut,
  ].map(normalizeRut).filter((rut): rut is string => Boolean(rut));
  const rutMatch = empresas.find((empresa) => {
    const empresaRut = normalizeRut(empresa.rut);
    return empresaRut && candidateRuts.includes(empresaRut);
  });

  if (rutMatch) {
    return rutMatch.id;
  }

  const candidateNames = [
    extracted.empresaNombre,
    extracted.emisorNombre,
  ].map(normalizeLookupText).filter((name): name is string => Boolean(name));

  return empresas.find((empresa) => {
    const empresaName = normalizeLookupText(empresa.razonSocial);
    const candidateWords = candidateNames.flatMap((candidateName) => candidateName.split(' ').filter(Boolean));
    return candidateNames.some((candidateName) =>
      empresaName === candidateName ||
      empresaName.includes(candidateName) ||
      candidateName.includes(empresaName) ||
      candidateName.split(' ').filter(Boolean).every((word) => empresaName.includes(word))
    ) || (candidateWords.length > 0 && candidateWords.every((word) => empresaName.includes(word)));
  })?.id || '';
}

export function isOtroTipoDocumento(tiposDocumento: TipoDocumentoOption[], tipoDocumentoId?: string | null) {
  const tipoDocumento = tiposDocumento.find((item) => String(item.id) === String(tipoDocumentoId || ''));
  const nombre = normalizeLookupText(tipoDocumento?.nombre);

  return nombre === 'otro' || nombre === 'otros';
}

export function validateGastoDraft(
  draft: GastoDraftValidationInput,
  tiposDocumento: TipoDocumentoOption[],
) {
  const montoTotal = Number(draft.montoTotal);
  const errors = [
    !String(draft.fecha || '').trim() ? 'Fecha' : null,
    !String(draft.categoria || '').trim() ? 'Categoria' : null,
    !String(draft.empresaId || '').trim() ? 'Empresa' : null,
    !String(draft.tipoDocumento || '').trim() ? 'Tipo de documento' : null,
    !String(draft.numeroDocumento || '').trim() ? 'Numero de documento' : null,
    !Number.isFinite(montoTotal) || montoTotal <= 0 ? 'Monto total' : null,
    isOtroTipoDocumento(tiposDocumento, draft.tipoDocumento) && !String(draft.comentarioTipoDocumento || '').trim()
      ? 'Especificar tipo de documento'
      : null,
  ].filter((item): item is string => Boolean(item));

  return errors;
}
