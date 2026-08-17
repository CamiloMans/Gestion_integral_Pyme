import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ReportesPortafolioResponse } from '@/services/postgresApi';
import { AlertsPanel } from './AlertsPanel';

const data = {
  alerts: {
    overBudget: [{ id: 'project-over', name: 'Proyecto Excedido', amountClp: 250000 }],
    overdueMilestones: [{
      id: 'milestone-overdue',
      projectId: 'project-one',
      projectName: 'Proyecto Uno',
      milestoneNumber: 4,
      date: '2026-08-01',
      amountClp: 500000,
    }],
    missingBudget: [{ id: 'project-missing', name: 'Proyecto Sin Presupuesto' }],
    unassignedExpenses: {
      count: 1,
      amountClp: 125000,
      items: [{
        id: 'expense-unassigned',
        date: '2026-08-10',
        supplierName: 'Proveedor Uno',
        categoryName: 'Materiales',
        amountClp: 125000,
      }],
    },
    unconvertibleMilestones: [{
      id: 'milestone-currency',
      projectId: 'project-uf',
      projectName: 'Proyecto UF',
      milestoneNumber: 2,
      date: '2026-08-15',
      amount: 10,
      currency: 'USD',
    }],
  },
  meta: {
    filters: { proyectoId: 'all', ingresos: 'con_ingresos', year: '2026', month: '08' },
  },
} as ReportesPortafolioResponse;

function LocationValue() {
  return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output>;
}

function renderPanel() {
  render(
    <MemoryRouter initialEntries={['/reportes']}>
      <Routes>
        <Route path="*" element={<><AlertsPanel data={data} /><LocationValue /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AlertsPanel', () => {
  it('expone las cinco alertas como controles accesibles', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: /1 proyecto\(s\) sobre presupuesto\. Ver detalle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 hito\(s\) vencido\(s\)\. Ver detalle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 proyecto\(s\) sin presupuesto\. Ver detalle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 gasto\(s\) sin proyecto\. Ver detalle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 hito\(s\) sin conversion CLP\. Ver detalle/i })).toBeInTheDocument();
  });

  it('muestra los gastos exactos y abre el gasto seleccionado', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /1 gasto\(s\) sin proyecto\. Ver detalle/i }));
    expect(await screen.findByRole('dialog', { name: 'Gastos sin proyecto' })).toBeInTheDocument();
    expect(screen.getByText('Proveedor Uno')).toBeInTheDocument();
    expect(screen.getByText('Materiales')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Abrir gasto/i }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/gastos?gastoId=expense-unassigned'));
  });

  it('muestra el numero del hito vencido y abre su pantalla operativa', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /1 hito\(s\) vencido\(s\)\. Ver detalle/i }));
    expect(await screen.findByRole('dialog', { name: 'Hitos vencidos' })).toBeInTheDocument();
    expect(screen.getByText('Hito #4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Abrir hito/i }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/control-pagos/hitos?hitoId=milestone-overdue'));
  });

  it('lleva el proyecto sin presupuesto directamente a su edicion', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /1 proyecto\(s\) sin presupuesto\. Ver detalle/i }));
    expect(await screen.findByText('Proyecto Sin Presupuesto')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Completar/i }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/control-pagos/proyectos?proyectoId=project-missing'));
  });
});
