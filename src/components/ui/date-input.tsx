import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateOnly, parseDateOnly, toDateOnly } from "@/lib/date-format";

/**
 * Reemplazo de <Input type="date">. El usuario ve y escribe dd/mm/yyyy; el valor
 * hacia el padre sigue siendo 'YYYY-MM-DD', igual que el input nativo.
 *
 * Contrato para tests: el value del DOM es el texto visible ('15/10/2026').
 * Para setear una fecha con fireEvent.change sirven '15/10/2026', '15102026' o
 * '2026-10-15' (las tres se aceptan). Lo que llega al padre siempre es ISO.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** '25082026' | '25-08-2026' -> '25/08/2026'. Tolera parciales. */
const maskDmy = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/** '25/08/2026' -> '2026-08-25'. Vacio si esta incompleta o no existe (31/02). */
const dmyToIso = (text: string): string => {
  const match = text.match(DMY_RE);
  if (!match) return "";

  const [, dd, mm, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  const date = parseDateOnly(iso);
  if (!date) return "";

  // parseDateOnly no valida: new Date(2026, 1, 31) rueda a marzo.
  if (
    date.getFullYear() !== Number(yyyy) ||
    date.getMonth() !== Number(mm) - 1 ||
    date.getDate() !== Number(dd)
  ) {
    return "";
  }

  return iso;
};

/** Componentes locales, nunca toISOString(): en Chile correria el dia. */
const isoFromDate = (date: Date): string => format(date, "yyyy-MM-dd");

/** formatDateOnly devuelve '-' cuando esta vacio; aca vacio debe verse vacio. */
const displayFor = (value?: string | null): string => {
  const iso = toDateOnly(value);
  return iso ? formatDateOnly(iso) : "";
};

const inRange = (iso: string, min?: string, max?: string): boolean => {
  const minIso = toDateOnly(min);
  const maxIso = toDateOnly(max);
  if (minIso && iso < minIso) return false;
  if (maxIso && iso > maxIso) return false;
  return true;
};

export interface DateInputChangeEvent {
  target: { value: string; id?: string; name?: string };
  currentTarget: { value: string; id?: string; name?: string };
}

export interface DateInputProps
  extends Omit<
    React.ComponentPropsWithoutRef<"input">,
    "value" | "defaultValue" | "onChange" | "type" | "min" | "max"
  > {
  /** 'YYYY-MM-DD' o vacio */
  value?: string;
  onChange?: (event: DateInputChangeEvent) => void;
  /** 'YYYY-MM-DD' */
  min?: string;
  /** 'YYYY-MM-DD' */
  max?: string;
  /** Clases para el input interno. */
  className?: string;
  /** Clases para el wrapper. */
  containerClassName?: string;
  calendarLabel?: string;
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      id,
      name,
      className,
      containerClassName,
      calendarLabel = "Abrir calendario",
      placeholder = "dd/mm/aaaa",
      disabled,
      onBlur,
      onKeyDown,
      ...rest
    },
    forwardedRef,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState(() => displayFor(value));

    const committedIso = toDateOnly(value);

    React.useEffect(() => {
      // Si el padre solo hizo eco de lo que acabamos de emitir, no pisar lo tipeado.
      if (dmyToIso(text) === committedIso) return;
      setText(committedIso ? formatDateOnly(committedIso) : "");
      // 'text' fuera de deps a proposito: incluirlo borraria el campo en cada tecla.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [committedIso]);

    const typedIso = dmyToIso(text);
    const invalid = text.length > 0 && (!typedIso || !inRange(typedIso, min, max));

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    // Cubre Enter-to-submit, donde blur nunca dispara.
    React.useEffect(() => {
      const node = inputRef.current;
      if (!node || typeof node.setCustomValidity !== "function") return;

      if (!invalid) {
        node.setCustomValidity("");
        return;
      }

      const minIso = toDateOnly(min);
      const maxIso = toDateOnly(max);
      if (typedIso && maxIso && typedIso > maxIso) {
        node.setCustomValidity(`La fecha no puede ser posterior a ${formatDateOnly(maxIso)}.`);
      } else if (typedIso && minIso && typedIso < minIso) {
        node.setCustomValidity(`La fecha no puede ser anterior a ${formatDateOnly(minIso)}.`);
      } else {
        node.setCustomValidity("Ingresa una fecha valida en formato dd/mm/aaaa.");
      }
    }, [invalid, typedIso, min, max]);

    const emit = React.useCallback(
      (iso: string) => {
        if (!onChange) return;
        const detail = { value: iso, id, name };
        onChange({ target: detail, currentTarget: detail });
      },
      [onChange, id, name],
    );

    const commitText = React.useCallback(
      (next: string) => {
        setText(next);

        if (!next) {
          if (committedIso) emit("");
          return;
        }

        const iso = dmyToIso(next);
        if (iso && iso !== committedIso && inRange(iso, min, max)) emit(iso);
      },
      [committedIso, emit, min, max],
    );

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;

      // Escape hatch: pegar ISO (Excel, BD, tests) se acepta tal cual.
      const trimmed = raw.trim();
      if (ISO_RE.test(trimmed)) {
        const iso = toDateOnly(trimmed);
        setText(formatDateOnly(iso));
        if (iso !== committedIso && inRange(iso, min, max)) emit(iso);
        return;
      }

      commitText(maskDmy(raw));
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      if (text) {
        const iso = dmyToIso(text);
        setText(iso && inRange(iso, min, max) ? formatDateOnly(iso) : displayFor(value));
      }

      onBlur?.(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      const node = event.currentTarget;
      const caret = node.selectionStart;

      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
      } else if (
        event.key === "Backspace" &&
        caret !== null &&
        caret > 0 &&
        caret === node.selectionEnd &&
        node.value[caret - 1] === "/"
      ) {
        // Sin esto la mascara reinserta el '/' y parece que la tecla no hace nada.
        event.preventDefault();
        commitText(maskDmy(`${node.value.slice(0, caret - 2)}${node.value.slice(caret)}`));
      }

      onKeyDown?.(event);
    };

    const selectedDate = parseDateOnly(committedIso) ?? undefined;
    const minDate = parseDateOnly(min) ?? undefined;
    const maxDate = parseDateOnly(max) ?? undefined;
    const disabledDays = [
      ...(minDate ? [{ before: minDate }] : []),
      ...(maxDate ? [{ after: maxDate }] : []),
    ];

    const handleSelect = (day?: Date) => {
      if (!day) return;
      const iso = isoFromDate(day);
      setText(formatDateOnly(iso));
      if (iso !== committedIso) emit(iso);
      setOpen(false);
      inputRef.current?.focus();
    };

    return (
      <div className={cn("relative w-full min-w-0", containerClassName)}>
        <Input
          {...rest}
          ref={setRefs}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn("pr-10", className)}
        />
        <Popover modal open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={calendarLabel}
              className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:bg-transparent"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={es}
              selected={selectedDate}
              defaultMonth={selectedDate ?? maxDate}
              onSelect={handleSelect}
              disabled={disabledDays}
              fromDate={minDate}
              toDate={maxDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);
DateInput.displayName = "DateInput";

export { DateInput };
