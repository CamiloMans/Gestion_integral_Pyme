// Extraccion de documentos de gasto: normalizacion de la respuesta del modelo,
// JSON Schema y prompt. Vive fuera de index.js para poder testearlo desde
// src/lib/*.test.ts, porque vitest solo incluye src/**.

export function normalizeExtractedNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function normalizeExtractedText(value, { uppercase = false } = {}) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return uppercase ? normalized.toUpperCase() : normalized;
}

export function normalizeRut(value) {
  const normalized = normalizeExtractedText(value, { uppercase: true });
  if (!normalized) {
    return null;
  }

  const cleaned = normalized.replace(/[^0-9K]/g, '');
  if (cleaned.length < 2) {
    return normalized;
  }

  return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
}

export function normalizeExtractedDate(value) {
  const normalized = normalizeExtractedText(value);
  if (!normalized) {
    return null;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Formato chileno: DD/MM/YYYY o DD-MM-YYYY.
  const localMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (localMatch) {
    const [, day, month, year] = localMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return normalized;
}

export function normalizePlazoPagoDias(value) {
  const parsed = normalizeExtractedNumber(value);
  if (parsed === null || parsed <= 0 || parsed > 365) {
    return null;
  }

  return parsed;
}

export function normalizeDocumentType(value) {
  const normalized = normalizeExtractedText(value, { uppercase: true });
  if (!normalized) {
    return 'OTRO';
  }

  if (normalized.includes('HONORARIO')) return 'BOLETA DE HONORARIO';
  if (normalized.includes('EXENTA') || normalized.includes('NO AFECTA')) return 'FACTURA EXENTA';
  if (normalized.includes('FACTURA')) return 'FACTURA';
  if (normalized.includes('BOLETA')) return 'BOLETA';
  return 'OTRO';
}

// --- Comprobantes bancarios ---

// Sin Intl para no depender de ICU en el contenedor de Cloud Run.
export function formatClpAmount(value) {
  return `$ ${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

// Version comparable de un RUT: el banco los imprime con ceros a la izquierda
// (0191467035) y tambien con formato (19.146.703-5). Misma regla que usa el
// cliente en src/lib/gasto-document.ts para emparejar empresas.
export function compactRut(value) {
  const cleaned = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length <= 1) {
    return cleaned;
  }

  const body = cleaned.slice(0, -1).replace(/^0+/, '') || '0';
  return `${body}${cleaned.slice(-1)}`;
}

function normalizeComparableName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizePositiveCount(value) {
  const parsed = normalizeExtractedNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

// El titular de la cuenta de origen paga, no cobra. Se cuela cuando el modelo
// convierte el encabezado del comprobante en una operacion mas.
function isCuentaOrigenHolder(operacion, payload) {
  const receptorRut = compactRut(payload.receptorRut);
  const beneficiarioRut = compactRut(operacion.beneficiarioRut);
  if (receptorRut && beneficiarioRut && receptorRut === beneficiarioRut) {
    return true;
  }

  const receptorNombre = normalizeComparableName(payload.receptorNombre);
  const beneficiarioNombre = normalizeComparableName(operacion.beneficiarioNombre);
  return Boolean(receptorNombre && beneficiarioNombre && receptorNombre === beneficiarioNombre);
}

function buildOperationDetalle(asunto, beneficiarioNombre) {
  if (asunto && asunto !== '-') {
    return asunto;
  }

  return beneficiarioNombre ? `TRANSFERENCIA A ${beneficiarioNombre}` : 'TRANSFERENCIA BANCARIA';
}

function normalizeBankOperation(rawOperation, index, context) {
  const numeroOperacion = normalizeExtractedText(rawOperation?.numeroOperacion, { uppercase: true });
  const idTransaccion = normalizeExtractedText(rawOperation?.idTransaccion, { uppercase: true });
  const asunto = normalizeExtractedText(rawOperation?.asunto, { uppercase: true });
  const beneficiarioNombre = normalizeExtractedText(rawOperation?.beneficiarioNombre, { uppercase: true });

  return {
    indice: index + 1,
    fecha: normalizeExtractedDate(rawOperation?.fecha) || context.fechaDocumento,
    // Numero de operacion y, si no existe, id de transaccion.
    numeroDocumento: numeroOperacion || idTransaccion || null,
    numeroOperacion,
    idTransaccion,
    beneficiarioNombre,
    beneficiarioRut: normalizeRut(rawOperation?.beneficiarioRut),
    bancoDestino: normalizeExtractedText(rawOperation?.bancoDestino, { uppercase: true }),
    cuentaDestino: normalizeExtractedText(rawOperation?.cuentaDestino),
    cuentaOrigen: normalizeExtractedText(rawOperation?.cuentaOrigen),
    monto: normalizeExtractedNumber(rawOperation?.monto),
    tipoOperacion: normalizeExtractedText(rawOperation?.tipoOperacion, { uppercase: true }),
    detalle: buildOperationDetalle(asunto, beneficiarioNombre),
  };
}

// Ultimo recurso cuando el modelo marca el documento como bancario pero no logra
// separar el detalle: una sola operacion con el total del comprobante.
function buildOperationFromDocument(payload) {
  if (payload.montoTotal === null || payload.montoTotal <= 0) {
    return null;
  }

  if (!payload.empresaNombre && !payload.empresaRut) {
    return null;
  }

  const candidata = {
    beneficiarioNombre: payload.empresaNombre,
    beneficiarioRut: payload.empresaRut,
  };

  if (isCuentaOrigenHolder(candidata, payload)) {
    return null;
  }

  return {
    indice: 1,
    fecha: payload.fecha,
    numeroDocumento: payload.numeroDocumento,
    numeroOperacion: null,
    idTransaccion: null,
    beneficiarioNombre: payload.empresaNombre,
    beneficiarioRut: payload.empresaRut,
    bancoDestino: null,
    cuentaDestino: null,
    cuentaOrigen: null,
    monto: payload.montoTotal,
    tipoOperacion: null,
    detalle: buildOperationDetalle(payload.detalle, payload.empresaNombre),
  };
}

export function normalizeBankOperations(rawPayload, payload) {
  const esComprobanteBancario = rawPayload?.esComprobanteBancario === true;
  const operacionesDeclaradas = normalizePositiveCount(rawPayload?.operacionesDeclaradas);
  const warnings = [];

  if (!esComprobanteBancario) {
    return { esComprobanteBancario: false, operacionesDeclaradas, operaciones: [], warnings };
  }

  const rawOperaciones = Array.isArray(rawPayload?.operacionesBancarias) ? rawPayload.operacionesBancarias : [];
  const context = { fechaDocumento: payload.fecha };
  const operaciones = [];
  let descartadasPorTitular = 0;

  for (const rawOperacion of rawOperaciones) {
    const operacion = normalizeBankOperation(rawOperacion, operaciones.length, context);

    // Bloques de relleno sin nada util. Si falta el monto pero hay beneficiario se
    // conserva: validateGastoDraft la marca incompleta y el usuario la ve.
    if (!operacion.beneficiarioNombre && operacion.monto === null) {
      continue;
    }

    if (isCuentaOrigenHolder(operacion, payload)) {
      descartadasPorTitular += 1;
      continue;
    }

    // El mismo beneficiario puede repetirse con montos distintos dentro de un
    // mismo comprobante. No deduplicar.
    operaciones.push(operacion);
  }

  if (descartadasPorTitular > 0) {
    warnings.push(
      `Se ignoraron ${descartadasPorTitular} operacion(es) cuyo destinatario es el titular de la cuenta de origen.`,
    );
  }

  if (operaciones.length === 0) {
    const sintetizada = buildOperationFromDocument(payload);

    if (sintetizada) {
      operaciones.push(sintetizada);
      warnings.push('No se pudo separar el detalle de transferencias; se cargo una sola fila con el total del comprobante.');
    } else {
      warnings.push('Se detecto un comprobante bancario pero no se identificaron transferencias; revisa el documento manualmente.');
    }

    return { esComprobanteBancario, operacionesDeclaradas, operaciones, warnings };
  }

  const sumaOperaciones = operaciones.reduce((sum, operacion) => sum + (operacion.monto || 0), 0);
  if (payload.montoTotal !== null && sumaOperaciones !== payload.montoTotal) {
    warnings.push(
      `La suma de las ${operaciones.length} transferencias (${formatClpAmount(sumaOperaciones)}) no coincide con el monto total del comprobante (${formatClpAmount(payload.montoTotal)}). Revisa si falta alguna operacion.`,
    );
  }

  if (operacionesDeclaradas !== null && operacionesDeclaradas !== operaciones.length) {
    warnings.push(
      `El comprobante declara ${operacionesDeclaradas} operacion(es) y se extrajeron ${operaciones.length}. Revisa el documento completo.`,
    );
  }

  return { esComprobanteBancario, operacionesDeclaradas, operaciones, warnings };
}

export function normalizeExtractionPayload(rawPayload, metadata) {
  const warnings = Array.isArray(rawPayload?.warnings)
    ? rawPayload.warnings.map((warning) => normalizeExtractedText(warning)).filter(Boolean)
    : [];
  const confidence = Number(rawPayload?.confidence);

  const montoNeto = normalizeExtractedNumber(rawPayload?.montoNeto);
  const iva = normalizeExtractedNumber(rawPayload?.iva);
  const tieneIva = typeof rawPayload?.tieneIva === 'boolean'
    ? rawPayload.tieneIva
    : Boolean(iva && iva > 0);

  const payload = {
    fecha: normalizeExtractedDate(rawPayload?.fecha),
    fechaVencimiento: normalizeExtractedDate(rawPayload?.fechaVencimiento),
    plazoPagoDias: normalizePlazoPagoDias(rawPayload?.plazoPagoDias),
    tieneIva,
    tipoDocumento: normalizeDocumentType(rawPayload?.tipoDocumento),
    numeroDocumento: normalizeExtractedText(rawPayload?.numeroDocumento),
    empresaNombre: normalizeExtractedText(rawPayload?.empresaNombre, { uppercase: true }),
    empresaRut: normalizeRut(rawPayload?.empresaRut),
    emisorNombre: normalizeExtractedText(rawPayload?.emisorNombre, { uppercase: true }),
    emisorRut: normalizeRut(rawPayload?.emisorRut),
    receptorNombre: normalizeExtractedText(rawPayload?.receptorNombre, { uppercase: true }),
    receptorRut: normalizeRut(rawPayload?.receptorRut),
    montoNeto,
    iva,
    montoTotal: normalizeExtractedNumber(rawPayload?.montoTotal),
    detalle: normalizeExtractedText(rawPayload?.detalle, { uppercase: true }),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    warnings,
    metadata,
  };

  const banco = normalizeBankOperations(rawPayload, payload);

  return {
    ...payload,
    warnings: [...warnings, ...banco.warnings],
    esComprobanteBancario: banco.esComprobanteBancario,
    operacionesDeclaradas: banco.operacionesDeclaradas,
    operacionesBancarias: banco.operaciones,
  };
}

export function getBankTransferOperationJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'fecha',
      'numeroOperacion',
      'idTransaccion',
      'beneficiarioNombre',
      'beneficiarioRut',
      'bancoDestino',
      'cuentaDestino',
      'cuentaOrigen',
      'monto',
      'tipoOperacion',
      'asunto',
    ],
    properties: {
      fecha: {
        type: ['string', 'null'],
        description: 'Fecha de esta operacion en formato YYYY-MM-DD. Si la operacion no trae fecha propia, usa la fecha de autorizacion o de movimiento del comprobante.',
      },
      numeroOperacion: {
        type: ['string', 'null'],
        description: 'Valor del campo "Numero de operacion". Null si no aparece.',
      },
      idTransaccion: {
        type: ['string', 'null'],
        description: 'Valor del campo "Id transaccion". Null si no aparece.',
      },
      beneficiarioNombre: {
        type: ['string', 'null'],
        description: 'Valor de "Nombre de destino" o "Nombre Destinatario". Es el proveedor del gasto. Nunca el titular de la cuenta de origen ni el banco.',
      },
      beneficiarioRut: {
        type: ['string', 'null'],
        description: 'Valor de "RUT de destino" o "Rut Destinatario", copiado tal cual aunque tenga ceros a la izquierda y no tenga guion.',
      },
      bancoDestino: { type: ['string', 'null'], description: 'Valor de "Banco de destino" o "Banco".' },
      cuentaDestino: { type: ['string', 'null'], description: 'Valor de "Cuenta de destino" o "Cuenta Destinatario".' },
      cuentaOrigen: { type: ['string', 'null'], description: 'Valor de "Cuenta de origen" o "Cuenta Origen".' },
      monto: {
        type: ['number', 'null'],
        description: 'Monto de esta operacion en CLP, entero, sin puntos ni signo peso.',
      },
      tipoOperacion: {
        type: ['string', 'null'],
        description: 'Valor de "Tipo de operacion" o "Tipo de Movimiento".',
      },
      asunto: {
        type: ['string', 'null'],
        description: 'Valor de "Asunto", "Descripcion" o "Comentario". Null si aparece un guion o esta vacio.',
      },
    },
  };
}

export function getExpenseExtractionJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'fecha',
      'fechaVencimiento',
      'plazoPagoDias',
      'tieneIva',
      'tipoDocumento',
      'numeroDocumento',
      'empresaNombre',
      'empresaRut',
      'emisorNombre',
      'emisorRut',
      'receptorNombre',
      'receptorRut',
      'montoNeto',
      'iva',
      'montoTotal',
      'detalle',
      'confidence',
      'warnings',
      'esComprobanteBancario',
      'operacionesDeclaradas',
      'operacionesBancarias',
    ],
    properties: {
      fecha: { type: ['string', 'null'], description: 'Fecha de emision del documento en formato YYYY-MM-DD.' },
      fechaVencimiento: {
        type: ['string', 'null'],
        description: 'Fecha de vencimiento o fecha de pago del documento en formato YYYY-MM-DD. Null si no aparece.',
      },
      plazoPagoDias: {
        type: ['number', 'null'],
        description: 'Dias de plazo de pago declarados en el documento (ej: "30 dias"). Null si no aparece.',
      },
      tieneIva: {
        type: 'boolean',
        description: 'true si el documento desglosa o incluye IVA, false si es exento/sin IVA.',
      },
      tipoDocumento: {
        type: 'string',
        enum: ['FACTURA', 'BOLETA', 'BOLETA DE HONORARIO', 'FACTURA EXENTA', 'OTRO'],
      },
      numeroDocumento: { type: ['string', 'null'], description: 'Folio, numero de factura, boleta u orden.' },
      empresaNombre: { type: ['string', 'null'], description: 'Proveedor real a cargar como empresa/persona.' },
      empresaRut: { type: ['string', 'null'], description: 'RUT del proveedor real, si esta visible.' },
      emisorNombre: { type: ['string', 'null'] },
      emisorRut: { type: ['string', 'null'] },
      receptorNombre: { type: ['string', 'null'] },
      receptorRut: { type: ['string', 'null'] },
      montoNeto: { type: ['number', 'null'] },
      iva: { type: ['number', 'null'] },
      montoTotal: { type: ['number', 'null'] },
      detalle: { type: ['string', 'null'], description: 'Descripcion breve del gasto, no mas de 120 caracteres.' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      warnings: { type: 'array', items: { type: 'string' } },
      esComprobanteBancario: {
        type: 'boolean',
        description: 'true solo si el documento es un comprobante bancario de transferencias, por ejemplo "Comprobante de operaciones autorizadas" o "Comprobante de Movimiento" de Banco de Chile.',
      },
      operacionesDeclaradas: {
        type: ['number', 'null'],
        description: 'Cantidad de operaciones declarada en el encabezado, ej: "Detalle de la(s) operacion(es) autorizada(s) (4)" son 4. Null si no aparece.',
      },
      operacionesBancarias: {
        type: 'array',
        description: 'Una entrada por cada operacion o transferencia listada en el comprobante. Array vacio cuando esComprobanteBancario es false.',
        items: getBankTransferOperationJsonSchema(),
      },
    },
  };
}

export function buildOpenAiExtractionInput(file, mimeType) {
  const base64File = file.buffer.toString('base64');
  const prompt = [
    'Extrae datos de un gasto chileno para llenar formulario Rekosol.',
    'Prioriza proveedor real del gasto para empresaNombre/empresaRut.',
    'Si el documento dice "POR CUENTA DE", usa esa entidad como proveedor; conserva emisorRut tambien.',
    'Receptor normalmente puede ser REKOSOL INGENIERIA SPA, no usarlo como proveedor.',
    'Montos en CLP como numeros enteros sin puntos ni signo peso.',
    'Si hay factura con subtotal neto, IVA y total, extrae esos tres.',
    'Si es boleta/comprobante sin IVA visible, deja montoNeto e iva null y usa montoTotal.',
    'tieneIva true solo si el documento desglosa o incluye IVA; false en exentas, honorarios sin IVA o comprobantes sin IVA.',
    'fecha es la fecha de emision del documento.',
    'fechaVencimiento es la fecha de vencimiento o fecha de pago indicada (vence, pagar antes de, fecha de pago); null si no aparece.',
    'plazoPagoDias son los dias de credito declarados (ej: "pago a 30 dias", "credito 60 dias"); null si no aparece.',
    'Si el documento es comprobante bancario, tipoDocumento OTRO salvo que muestre factura/boleta.',
    'Detecta si el documento es un comprobante bancario de transferencias: "Comprobante de operaciones autorizadas" o "Comprobante de Movimiento".',
    'Si lo es, esComprobanteBancario true y agrega una entrada en operacionesBancarias por cada operacion listada; si no lo es, esComprobanteBancario false y operacionesBancarias vacio.',
    'El encabezado indica cuantas son, ej: "Detalle de la(s) operacion(es) autorizada(s) (4)": copia ese numero en operacionesDeclaradas y devuelve esa misma cantidad de operaciones.',
    'Un bloque de operacion puede partirse entre dos paginas: une los campos del mismo bloque aunque queden en paginas distintas y no lo cuentes dos veces.',
    'El "Monto total" del encabezado es la suma del comprobante y no es una operacion: no lo agregues a operacionesBancarias.',
    'El beneficiario es "Nombre de destino" o "Nombre Destinatario" y ese es el proveedor del gasto.',
    'Nunca uses el titular de la cuenta de origen, su RUT ni el banco emisor como beneficiario de una operacion.',
    'Si el mismo beneficiario aparece en varias operaciones, repitelo: cada operacion es una entrada distinta aunque el nombre y el RUT coincidan.',
    'Copia los RUT tal cual aparecen, incluidos ceros a la izquierda y sin formato, ej: 0191467035.',
    'En un comprobante bancario el nivel superior resume el documento: tipoDocumento OTRO, montoTotal es el "Monto total" del encabezado o el monto unico si hay una sola operacion, emisorNombre es el banco y receptor es el titular de la cuenta de origen.',
    'Ignora textos legales, "Pagina X de Y", www.cmfchile.cl y avisos de garantia estatal de los depositos.',
    'No inventes datos no visibles.',
  ].join('\n');

  const content = [];

  if (mimeType.startsWith('image/')) {
    content.push({
      type: 'input_image',
      image_url: `data:${mimeType};base64,${base64File}`,
      detail: 'high',
    });
  } else if (mimeType === 'application/pdf') {
    content.push({
      type: 'input_file',
      filename: file.originalname || 'documento.pdf',
      file_data: `data:application/pdf;base64,${base64File}`,
    });
  } else {
    const xmlText = file.buffer.toString('utf8').slice(0, 120000);
    content.push({
      type: 'input_text',
      text: `Contenido XML del documento:\n${xmlText}`,
    });
  }

  content.push({ type: 'input_text', text: prompt });

  return [{ role: 'user', content }];
}
