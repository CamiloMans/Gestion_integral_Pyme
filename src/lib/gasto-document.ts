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
  const compactRut = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (compactRut.length <= 1) return compactRut;

  const body = compactRut.slice(0, -1).replace(/^0+/, '') || '0';
  const verifier = compactRut.slice(-1);
  return `${body}${verifier}`;
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
  return resolveEmpresaMatch(empresas, extracted)?.empresaId || '';
}

function levenshteinDistance(left: string, right: string) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
}

function wordSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const distance = levenshteinDistance(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function nameSimilarity(left: string, right: string) {
  const leftWords = normalizeLookupText(left).split(' ').filter(Boolean);
  const rightWords = normalizeLookupText(right).split(' ').filter(Boolean);

  if (leftWords.length === 0 || rightWords.length === 0) return 0;

  const shorter = leftWords.length <= rightWords.length ? leftWords : rightWords;
  const longer = leftWords.length <= rightWords.length ? rightWords : leftWords;

  const bestScores = shorter.map((word) =>
    Math.max(...longer.map((candidate) => wordSimilarity(word, candidate)))
  );

  const averageScore = bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length;
  const strongWordCoverage = bestScores.filter((score) => score >= 0.8).length / shorter.length;

  return (averageScore * 0.7) + (strongWordCoverage * 0.3);
}

export function resolveEmpresaMatch(
  empresas: Empresa[],
  extracted: Pick<
    GastoDocumentExtractionResult,
    'empresaRut' | 'emisorRut' | 'empresaNombre' | 'emisorNombre'
  >,
) {
  const candidateRuts = [
    extracted.empresaRut,
    extracted.emisorRut,
  ].map((value) => ({
    original: value,
    normalized: normalizeRut(value),
  })).filter((rut): rut is { original: string; normalized: string } => Boolean(rut.normalized));

  for (const candidateRut of candidateRuts) {
    const rutMatch = empresas.find((empresa) => {
      const empresaRut = normalizeRut(empresa.rut);
      return empresaRut && empresaRut === candidateRut.normalized;
    });

    if (rutMatch) {
      return {
        empresaId: rutMatch.id,
        matchedName: rutMatch.razonSocial,
        extractedRut: candidateRut.original,
        score: 1,
        method: 'rut' as const,
      };
    }
  }

  const candidateNames = [
    extracted.empresaNombre,
    extracted.emisorNombre,
  ].map((value) => ({
    original: value,
    normalized: normalizeLookupText(value),
  })).filter((name): name is { original: string; normalized: string } => Boolean(name.normalized));

  for (const candidateName of candidateNames) {
    let bestMatch: {
      empresaId: string;
      matchedName: string;
      extractedName: string;
      score: number;
      method: 'nombre';
    } | null = null;

    for (const empresa of empresas) {
      const score = nameSimilarity(empresa.razonSocial, candidateName.original);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          empresaId: empresa.id,
          matchedName: empresa.razonSocial,
          extractedName: candidateName.original,
          score,
          method: 'nombre',
        };
      }
    }

    if (bestMatch && bestMatch.score >= 0.72) {
      return bestMatch;
    }
  }

  return null;
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
