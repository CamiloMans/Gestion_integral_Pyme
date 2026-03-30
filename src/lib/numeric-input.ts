interface NumericInputOptions {
  allowDecimal?: boolean;
  maxDecimals?: number;
}

interface ParsedParts {
  integerPart: string;
  decimalPart: string;
  hasDecimalSeparator: boolean;
}

function parseInputParts(value: string, options: NumericInputOptions = {}): ParsedParts {
  const allowDecimal = options.allowDecimal ?? true;
  const maxDecimals = options.maxDecimals ?? 2;
  const cleaned = value.replace(/[^\d.,]/g, "");

  if (!cleaned) {
    return {
      integerPart: "",
      decimalPart: "",
      hasDecimalSeparator: false,
    };
  }

  let decimalIndex = -1;

  if (allowDecimal) {
    const commaIndex = cleaned.lastIndexOf(",");
    if (commaIndex >= 0) {
      decimalIndex = commaIndex;
    } else {
      const firstDotIndex = cleaned.indexOf(".");
      const lastDotIndex = cleaned.lastIndexOf(".");

      if (firstDotIndex >= 0 && firstDotIndex === lastDotIndex) {
        const decimalsCount = cleaned.length - firstDotIndex - 1;
        if (decimalsCount <= maxDecimals) {
          decimalIndex = firstDotIndex;
        }
      } else if (firstDotIndex >= 0 && lastDotIndex > firstDotIndex) {
        const decimalsCount = cleaned.length - lastDotIndex - 1;
        if (decimalsCount <= maxDecimals) {
          decimalIndex = lastDotIndex;
        }
      }
    }
  }

  if (decimalIndex >= 0) {
    const integerPart = cleaned.slice(0, decimalIndex).replace(/[.,]/g, "");
    const decimalPart = cleaned
      .slice(decimalIndex + 1)
      .replace(/[.,]/g, "")
      .slice(0, maxDecimals);

    return {
      integerPart,
      decimalPart,
      hasDecimalSeparator: true,
    };
  }

  return {
    integerPart: cleaned.replace(/[.,]/g, ""),
    decimalPart: "",
    hasDecimalSeparator: false,
  };
}

export function formatNumericInput(value: string, options: NumericInputOptions = {}): string {
  const allowDecimal = options.allowDecimal ?? true;
  const { integerPart, decimalPart, hasDecimalSeparator } = parseInputParts(value, options);

  if (!integerPart && !decimalPart && !hasDecimalSeparator) {
    return "";
  }

  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "");
  const groupedInteger = normalizedInteger ? Number(normalizedInteger).toLocaleString("es-CL") : "";

  if (allowDecimal && hasDecimalSeparator) {
    const integerDisplay = groupedInteger || "0";
    return `${integerDisplay},${decimalPart}`;
  }

  return groupedInteger;
}

export function parseNumericInput(value: string, options: NumericInputOptions = {}): number {
  const allowDecimal = options.allowDecimal ?? true;
  const { integerPart, decimalPart, hasDecimalSeparator } = parseInputParts(value, options);

  if (!integerPart && !decimalPart) {
    return Number.NaN;
  }

  const normalizedInteger = integerPart || "0";
  const normalized = allowDecimal && hasDecimalSeparator
    ? `${normalizedInteger}.${decimalPart || "0"}`
    : normalizedInteger;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
