import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateInput } from './date-input';
import { Label } from './label';
import { Dialog, DialogContent, DialogTitle } from './dialog';

const lastValue = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls.at(-1)?.[0].target.value;

const renderInput = (props: Partial<React.ComponentProps<typeof DateInput>> = {}) => {
  const onChange = vi.fn();
  const utils = render(
    <>
      <Label htmlFor="fecha">Fecha</Label>
      <DateInput id="fecha" value="" onChange={onChange} {...props} />
    </>,
  );
  return { onChange, input: screen.getByLabelText('Fecha') as HTMLInputElement, ...utils };
};

describe('DateInput', () => {
  it('muestra vacio cuando no hay valor (no "-")', () => {
    const { input } = renderInput();
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'dd/mm/aaaa');
  });

  it('muestra el valor ISO como dd/mm/yyyy', () => {
    const { input } = renderInput({ value: '2026-10-15' });
    expect(input).toHaveValue('15/10/2026');
  });

  it('asocia el id al input interno para getByLabelText', () => {
    const { input } = renderInput();
    expect(input.tagName).toBe('INPUT');
    expect(input.id).toBe('fecha');
  });

  it('enmascara lo tipeado y emite ISO una sola vez', () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: '25082026' } });
    expect(input).toHaveValue('25/08/2026');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastValue(onChange)).toBe('2026-08-25');
  });

  it('no emite con una fecha parcial', () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: '2508' } });
    expect(input).toHaveValue('25/08');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('acepta ISO pegado', () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: '2026-08-25' } });
    expect(input).toHaveValue('25/08/2026');
    expect(lastValue(onChange)).toBe('2026-08-25');
  });

  it('rechaza una fecha imposible sin rodar de mes', () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: '31/02/2026' } });
    expect(input).toHaveValue('31/02/2026');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('emite vacio al limpiar', () => {
    const { input, onChange } = renderInput({ value: '2026-10-15' });
    fireEvent.change(input, { target: { value: '' } });
    expect(lastValue(onChange)).toBe('');
  });

  it('revierte al valor del padre si se sale del campo con texto invalido', () => {
    const { input } = renderInput({ value: '2026-10-15' });
    fireEvent.change(input, { target: { value: '31/02' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('15/10/2026');
  });

  it('no emite una fecha posterior a max', () => {
    const { input, onChange } = renderInput({ max: '2026-09-06' });
    fireEvent.change(input, { target: { value: '10/09/2026' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('no emite una fecha anterior a min', () => {
    const { input, onChange } = renderInput({ min: '2026-09-06' });
    fireEvent.change(input, { target: { value: '01/09/2026' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refleja una escritura programatica del padre', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DateInput id="fecha" value="2026-10-15" onChange={onChange} />);
    const input = document.getElementById('fecha') as HTMLInputElement;
    expect(input).toHaveValue('15/10/2026');

    rerender(<DateInput id="fecha" value="2026-11-14" onChange={onChange} />);
    expect(input).toHaveValue('14/11/2026');
  });

  it('no pisa lo tipeado cuando el padre hace eco del mismo valor', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DateInput id="fecha" value="" onChange={onChange} />);
    const input = document.getElementById('fecha') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '25082026' } });
    rerender(<DateInput id="fecha" value="2026-08-25" onChange={onChange} />);
    expect(input).toHaveValue('25/08/2026');
  });

  it('el boton de calendario es type="button" y no envia el formulario', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <DateInput id="fecha" value="" onChange={vi.fn()} />
      </form>,
    );

    const trigger = screen.getByRole('button', { name: 'Abrir calendario' });
    expect(trigger).toHaveAttribute('type', 'button');
    fireEvent.click(trigger);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('selecciona un dia del calendario y emite el ISO correcto', async () => {
    const { onChange } = renderInput({ value: '2026-10-15' });

    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendario' }));
    // El dia 1 debe emitir -01, no el ultimo del mes anterior (TZ America/Santiago).
    // Hay dos "1" en la grilla: el de octubre y el de noviembre como dia fuera de mes.
    const dias1 = await screen.findAllByRole('gridcell', { name: '1' });
    const dia1Octubre = dias1.find((dia) => !dia.className.includes('day-outside'))!;
    fireEvent.click(dia1Octubre);

    expect(lastValue(onChange)).toBe('2026-10-01');
  });

  it('deshabilita input y trigger', () => {
    const { input } = renderInput({ disabled: true });
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Abrir calendario' })).toBeDisabled();
  });
});

describe('DateInput dentro de un Dialog', () => {
  it('abre el calendario y selecciona sin cerrar el dialogo', async () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Gasto</DialogTitle>
          <DateInput id="fecha-dialog" value="2026-10-15" onChange={onChange} />
        </DialogContent>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendario' }));

    const dias = await screen.findAllByRole('gridcell', { name: '20' });
    fireEvent.click(dias.find((dia) => !dia.className.includes('day-outside'))!);

    expect(onChange.mock.calls.at(-1)?.[0].target.value).toBe('2026-10-20');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
