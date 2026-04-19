import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { EmpresaModal } from '@/components/EmpresaModal';
import { ProyectoModal } from '@/components/ProyectoModal';
import { ColaboradorModal } from '@/components/ColaboradorModal';
import { CategoriaModal } from '@/components/CategoriaModal';
import { TipoDocumentoModal } from '@/components/TipoDocumentoModal';
import { TipoDocumentoProyectoModal } from '@/components/TipoDocumentoProyectoModal';
import { UserInviteModal } from '@/components/UserInviteModal';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Search, Building2, FolderKanban, Users, Tag, FileText, Pencil, Trash2, FolderTree, UserPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ColorPicker } from '@/components/ColorPicker';
import { formatDateLong, type Colaborador, type Empresa, type Proyecto } from '@/data/mockData';
import {
  type InviteUserInput,
  postgresApi,
  type CategoriaOption,
  type ConfiguracionResponse,
  type TenantUser,
  type TipoDocumentoOption,
  type TipoDocumentoProyectoOption,
} from '@/services/postgresApi';

type VistaConfiguracion =
  | 'empresas'
  | 'proyectos'
  | 'colaboradores'
  | 'usuarios'
  | 'categorias'
  | 'tiposDocumento'
  | 'tiposDocumentoProyecto';

type DeleteTarget = {
  id: string;
  type: VistaConfiguracion;
  label: string;
};

const VIEW_OPTIONS: Array<{
  key: VistaConfiguracion;
  label: string;
  icon: typeof Building2;
  actionLabel: string;
}> = [
  { key: 'empresas', label: 'Empresas', icon: Building2, actionLabel: 'Nueva Empresa' },
  { key: 'proyectos', label: 'Proyectos', icon: FolderKanban, actionLabel: 'Nuevo Proyecto' },
  { key: 'colaboradores', label: 'Colaboradores', icon: Users, actionLabel: 'Nuevo Colaborador' },
  { key: 'usuarios', label: 'Usuarios', icon: UserPlus, actionLabel: 'Invitar Usuario' },
  { key: 'categorias', label: 'Categorias', icon: Tag, actionLabel: 'Nueva Categoria' },
  { key: 'tiposDocumento', label: 'Tipos de Documento', icon: FileText, actionLabel: 'Nuevo Tipo' },
  { key: 'tiposDocumentoProyecto', label: 'Docs. de Proyecto', icon: FolderTree, actionLabel: 'Nuevo Documento' },
];

function sortByLabel<T>(items: T[], getLabel: (item: T) => string) {
  return [...items].sort((a, b) =>
    getLabel(a).localeCompare(getLabel(b), 'es', { sensitivity: 'base' }),
  );
}

function renderStatusBadge(isActive?: boolean) {
  return isActive === false ? (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
      Inactivo
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
      Activo
    </span>
  );
}

function renderInvitationBadge(invitationState: TenantUser['invitationState']) {
  return invitationState === 'vinculado' ? (
    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
      Vinculado
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
      Pendiente
    </span>
  );
}

function renderRoleBadge(role: TenantUser['role']) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
      {role === 'admin' ? 'Administrador' : 'Miembro'}
    </span>
  );
}

function formatAuthProviders(authProviders: TenantUser['authProviders']) {
  return authProviders
    .map((provider) => (provider === 'google' ? 'Google' : 'Microsoft'))
    .join(', ');
}

export default function Empresas() {
  const [configData, setConfigData] = useState<ConfiguracionResponse | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaConfiguracion>('empresas');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | undefined>();
  const [editingProyecto, setEditingProyecto] = useState<Proyecto | undefined>();
  const [editingColaborador, setEditingColaborador] = useState<Colaborador | undefined>();
  const [editingCategoria, setEditingCategoria] = useState<CategoriaOption | undefined>();
  const [editingTipoDocumento, setEditingTipoDocumento] = useState<TipoDocumentoOption | undefined>();
  const [editingTipoDocumentoProyecto, setEditingTipoDocumentoProyecto] = useState<TipoDocumentoProyectoOption | undefined>();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextConfigData, nextTenantUsers] = await Promise.all([
        postgresApi.getConfiguracion(),
        postgresApi.getUsuarios(),
      ]);
      setConfigData(nextConfigData);
      setTenantUsers(nextTenantUsers);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'No se pudo cargar la configuracion';
      setError(message);
      setConfigData(null);
      setTenantUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!error) return;

    toast({
      title: 'Error de conexion',
      description: error,
      variant: 'destructive',
    });
  }, [error]);

  const empresas = useMemo(() => sortByLabel(configData?.empresas || [], (item) => item.razonSocial), [configData]);
  const proyectos = useMemo(() => sortByLabel(configData?.proyectos || [], (item) => item.nombre), [configData]);
  const colaboradores = useMemo(() => sortByLabel(configData?.colaboradores || [], (item) => item.nombre), [configData]);
  const usuarios = useMemo(() => sortByLabel(tenantUsers, (item) => item.email), [tenantUsers]);
  const categorias = useMemo(() => sortByLabel(configData?.categorias || [], (item) => item.nombre), [configData]);
  const tiposDocumento = useMemo(() => sortByLabel(configData?.tiposDocumento || [], (item) => item.nombre), [configData]);
  const tiposDocumentoProyecto = useMemo(
    () => sortByLabel(configData?.tiposDocumentoProyecto || [], (item) => item.nombre),
    [configData],
  );

  const filteredEmpresas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return empresas;
    return empresas.filter((item) =>
      item.razonSocial.toLowerCase().includes(term) ||
      (item.rut || '').toLowerCase().includes(term) ||
      (item.categoria || '').toLowerCase().includes(term),
    );
  }, [empresas, searchTerm]);

  const filteredProyectos = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return proyectos;
    return proyectos.filter((item) =>
      item.nombre.toLowerCase().includes(term) ||
      (item.codigoProyecto || '').toLowerCase().includes(term) ||
      (item.monedaBase || '').toLowerCase().includes(term),
    );
  }, [proyectos, searchTerm]);

  const filteredColaboradores = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return colaboradores;
    return colaboradores.filter((item) =>
      item.nombre.toLowerCase().includes(term) ||
      (item.email || '').toLowerCase().includes(term) ||
      (item.telefono || '').toLowerCase().includes(term) ||
      (item.cargo || '').toLowerCase().includes(term),
    );
  }, [colaboradores, searchTerm]);

  const filteredUsuarios = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return usuarios;
    return usuarios.filter((item) =>
      item.email.toLowerCase().includes(term) ||
      item.nombre.toLowerCase().includes(term) ||
      item.role.toLowerCase().includes(term) ||
      item.estado.toLowerCase().includes(term) ||
      item.invitationState.toLowerCase().includes(term) ||
      item.authProviders.some((provider) => provider.toLowerCase().includes(term)),
    );
  }, [usuarios, searchTerm]);

  const filteredCategorias = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return categorias;
    return categorias.filter((item) =>
      item.nombre.toLowerCase().includes(term) ||
      (item.color || '').toLowerCase().includes(term),
    );
  }, [categorias, searchTerm]);

  const filteredTiposDocumento = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return tiposDocumento;
    return tiposDocumento.filter((item) =>
      item.nombre.toLowerCase().includes(term) ||
      (item.descripcion || '').toLowerCase().includes(term),
    );
  }, [tiposDocumento, searchTerm]);

  const filteredTiposDocumentoProyecto = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return tiposDocumentoProyecto;
    return tiposDocumentoProyecto.filter((item) =>
      item.nombre.toLowerCase().includes(term) ||
      (item.descripcion || '').toLowerCase().includes(term),
    );
  }, [tiposDocumentoProyecto, searchTerm]);

  const activeView = useMemo(
    () => VIEW_OPTIONS.find((option) => option.key === vista) || VIEW_OPTIONS[0],
    [vista],
  );
  const ActiveViewIcon = activeView.icon;

  const currentCount = useMemo(() => {
    switch (vista) {
      case 'empresas':
        return filteredEmpresas.length;
      case 'proyectos':
        return filteredProyectos.length;
      case 'colaboradores':
        return filteredColaboradores.length;
      case 'usuarios':
        return filteredUsuarios.length;
      case 'categorias':
        return filteredCategorias.length;
      case 'tiposDocumento':
        return filteredTiposDocumento.length;
      case 'tiposDocumentoProyecto':
        return filteredTiposDocumentoProyecto.length;
    }
  }, [
    filteredCategorias.length,
    filteredColaboradores.length,
    filteredEmpresas.length,
    filteredProyectos.length,
    filteredTiposDocumento.length,
    filteredTiposDocumentoProyecto.length,
    filteredUsuarios.length,
    vista,
  ]);

  const resetEditingState = () => {
    setEditingEmpresa(undefined);
    setEditingProyecto(undefined);
    setEditingColaborador(undefined);
    setEditingCategoria(undefined);
    setEditingTipoDocumento(undefined);
    setEditingTipoDocumentoProyecto(undefined);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetEditingState();
  };

  const openCreateModal = () => {
    resetEditingState();
    setModalOpen(true);
  };

  const handleMutationError = (fallbackMessage: string, mutationError: unknown) => {
    toast({
      title: 'Error',
      description: mutationError instanceof Error ? mutationError.message : fallbackMessage,
      variant: 'destructive',
    });
    throw mutationError;
  };

  const handleSaveEmpresa = async (payload: Omit<Empresa, 'id' | 'createdAt'>) => {
    try {
      if (editingEmpresa) {
        await postgresApi.updateEmpresa(editingEmpresa.id, payload);
        toast({ title: 'Empresa actualizada', description: 'La empresa se actualizo correctamente.', variant: 'success' });
      } else {
        await postgresApi.createEmpresa(payload);
        toast({ title: 'Empresa creada', description: 'La empresa se guardo correctamente.', variant: 'success' });
      }
      closeModal();
      await loadData();
    } catch (mutationError) {
      handleMutationError('Error al guardar la empresa', mutationError);
    }
  };

  const handleSaveProyecto = async (payload: Omit<Proyecto, 'id' | 'createdAt'>) => {
    try {
      if (editingProyecto) {
        await postgresApi.updateProyecto(editingProyecto.id, payload);
        toast({ title: 'Proyecto actualizado', description: 'El proyecto se actualizo correctamente.', variant: 'success' });
      } else {
        await postgresApi.createProyecto(payload);
        toast({ title: 'Proyecto creado', description: 'El proyecto se guardo correctamente.', variant: 'success' });
      }
      closeModal();
      await loadData();
    } catch (mutationError) {
      handleMutationError('Error al guardar el proyecto', mutationError);
    }
  };

  const handleSaveColaborador = async (payload: Omit<Colaborador, 'id' | 'createdAt'>) => {
    try {
      if (editingColaborador) {
        await postgresApi.updateColaborador(editingColaborador.id, payload);
        toast({ title: 'Colaborador actualizado', description: 'El colaborador se actualizo correctamente.', variant: 'success' });
      } else {
        await postgresApi.createColaborador(payload);
        toast({ title: 'Colaborador creado', description: 'El colaborador se guardo correctamente.', variant: 'success' });
      }
      closeModal();
      await loadData();
    } catch (mutationError) {
      handleMutationError('Error al guardar el colaborador', mutationError);
    }
  };

  const handleSaveCategoria = async (payload: Omit<CategoriaOption, 'id' | 'color'>) => {
    try {
      if (editingCategoria) {
        await postgresApi.updateCategoria(editingCategoria.id, {
          nombre: payload.nombre,
          color: editingCategoria.color,
          activa: editingCategoria.activa ?? true,
        });
        toast({ title: 'Categoria actualizada', description: 'La categoria se actualizo correctamente.', variant: 'success' });
      } else {
        await postgresApi.createCategoria({ nombre: payload.nombre });
        toast({ title: 'Categoria creada', description: 'La categoria se guardo correctamente.', variant: 'success' });
      }
      closeModal();
      await loadData();
    } catch (mutationError) {
      handleMutationError('Error al guardar la categoria', mutationError);
    }
  };

  const handleSaveTipoDocumento = async (payload: Omit<TipoDocumentoOption, 'id' | 'createdAt' | 'tieneImpuestos' | 'valorImpuestos'>) => {
    try {
      if (editingTipoDocumento) {
        await postgresApi.updateTipoDocumento(editingTipoDocumento.id, payload);
        toast({ title: 'Tipo actualizado', description: 'El tipo de documento se actualizo correctamente.', variant: 'success' });
      } else {
        await postgresApi.createTipoDocumento(payload);
        toast({ title: 'Tipo creado', description: 'El tipo de documento se guardo correctamente.', variant: 'success' });
      }
      closeModal();
      await loadData();
    } catch (mutationError) {
      handleMutationError('Error al guardar el tipo de documento', mutationError);
    }
  };

  const handleSaveTipoDocumentoProyecto = async (payload: Omit<TipoDocumentoProyectoOption, 'id' | 'createdAt'>) => {
    try {
      if (editingTipoDocumentoProyecto) {
        await postgresApi.updateTipoDocumentoProyecto(editingTipoDocumentoProyecto.id, payload);
        toast({ title: 'Documento actualizado', description: 'El documento de proyecto se actualizo correctamente.', variant: 'success' });
      } else {
        await postgresApi.createTipoDocumentoProyecto(payload);
        toast({ title: 'Documento creado', description: 'El documento de proyecto se guardo correctamente.', variant: 'success' });
      }
      closeModal();
      await loadData();
    } catch (mutationError) {
      handleMutationError('Error al guardar el documento de proyecto', mutationError);
    }
  };

  const handleInviteUser = async (payload: InviteUserInput) => {
    try {
      const invitedUser = await postgresApi.inviteUsuario(payload);
      toast({
        title: 'Usuario invitado',
        description: invitedUser.invitationState === 'vinculado'
          ? 'El usuario ya estaba vinculado y su acceso quedo actualizado para este tenant.'
          : 'La invitacion quedo activa para que inicie sesion con Microsoft o Google.',
        variant: 'success',
      });
      closeModal();
      await loadData();
    } catch (mutationError) {
      handleMutationError('Error al invitar al usuario', mutationError);
    }
  };

  const handleCategoriaColorChange = async (categoria: CategoriaOption, color: string) => {
    try {
      await postgresApi.updateCategoria(categoria.id, {
        nombre: categoria.nombre,
        color,
        activa: categoria.activa ?? true,
      });
      toast({ title: 'Color actualizado', description: 'El color de la categoria se actualizo correctamente.', variant: 'success' });
      await loadData();
    } catch (mutationError) {
      toast({
        title: 'Error',
        description: mutationError instanceof Error ? mutationError.message : 'Error al actualizar el color',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteRequest = (target: DeleteTarget) => {
    setDeleteTarget(target);
    setConfirmDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      switch (deleteTarget.type) {
        case 'empresas':
          await postgresApi.deleteEmpresa(deleteTarget.id);
          break;
        case 'proyectos':
          await postgresApi.deleteProyecto(deleteTarget.id);
          break;
        case 'colaboradores':
          await postgresApi.deleteColaborador(deleteTarget.id);
          break;
        case 'usuarios':
          return;
        case 'categorias':
          await postgresApi.deleteCategoria(deleteTarget.id);
          break;
        case 'tiposDocumento':
          await postgresApi.deleteTipoDocumento(deleteTarget.id);
          break;
        case 'tiposDocumentoProyecto':
          await postgresApi.deleteTipoDocumentoProyecto(deleteTarget.id);
          break;
      }

      toast({
        title: 'Registro eliminado',
        description: `Se elimino correctamente "${deleteTarget.label}".`,
        variant: 'success',
      });
      setConfirmDialogOpen(false);
      setDeleteTarget(null);
      await loadData();
    } catch (mutationError) {
      toast({
        title: 'Error',
        description: mutationError instanceof Error ? mutationError.message : 'Error al eliminar el registro',
        variant: 'destructive',
      });
    }
  };

  const renderTableContent = () => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
            Cargando configuracion desde PostgreSQL...
          </TableCell>
        </TableRow>
      );
    }

    if (vista === 'empresas') {
      if (filteredEmpresas.length === 0) {
        return (
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
              {error ? 'No se pudo cargar empresas desde PostgreSQL' : 'No hay empresas para mostrar'}
            </TableCell>
          </TableRow>
        );
      }

      return filteredEmpresas.map((item) => (
        <TableRow key={item.id}>
          <TableCell><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Building2 size={18} className="text-muted-foreground" /></div><div><p className="font-medium">{item.razonSocial}</p><p className="text-sm text-muted-foreground">{item.categoria || '-'}</p></div></div></TableCell>
          <TableCell className="font-mono">{item.rut || '-'}</TableCell>
          <TableCell>{item.numeroContacto || '-'}</TableCell>
          <TableCell>{formatDateLong(item.createdAt)}</TableCell>
          <TableCell><div className="flex justify-center gap-1"><Button variant="ghost" size="icon" onClick={() => { setEditingEmpresa(item); setModalOpen(true); }}><Pencil size={16} /></Button><Button variant="ghost" size="icon" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteRequest({ id: item.id, type: 'empresas', label: item.razonSocial }); }}><Trash2 size={16} className="text-destructive" /></Button></div></TableCell>
        </TableRow>
      ));
    }

    if (vista === 'proyectos') {
      if (filteredProyectos.length === 0) {
        return <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{error ? 'No se pudo cargar proyectos desde PostgreSQL' : 'No hay proyectos para mostrar'}</TableCell></TableRow>;
      }

      return filteredProyectos.map((item) => (
        <TableRow key={item.id}>
          <TableCell><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><FolderKanban size={18} className="text-muted-foreground" /></div><div><p className="font-medium">{item.nombre}</p><p className="text-sm text-muted-foreground">{item.codigoProyecto || item.monedaBase || '-'}</p></div></div></TableCell>
          <TableCell>{item.monedaBase || '-'}</TableCell>
          <TableCell>{item.montoTotalProyecto?.toLocaleString('es-CL') || '-'}</TableCell>
          <TableCell>{formatDateLong(item.createdAt)}</TableCell>
          <TableCell><div className="flex justify-center gap-1"><Button variant="ghost" size="icon" onClick={() => { setEditingProyecto(item); setModalOpen(true); }}><Pencil size={16} /></Button><Button variant="ghost" size="icon" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteRequest({ id: item.id, type: 'proyectos', label: item.nombre }); }}><Trash2 size={16} className="text-destructive" /></Button></div></TableCell>
        </TableRow>
      ));
    }

    if (vista === 'colaboradores') {
      if (filteredColaboradores.length === 0) {
        return <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{error ? 'No se pudo cargar colaboradores desde PostgreSQL' : 'No hay colaboradores para mostrar'}</TableCell></TableRow>;
      }

      return filteredColaboradores.map((item) => (
        <TableRow key={item.id}>
          <TableCell><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Users size={18} className="text-muted-foreground" /></div><span className="font-medium">{item.nombre}</span></div></TableCell>
          <TableCell>{item.email || '-'}</TableCell>
          <TableCell>{item.telefono || '-'}</TableCell>
          <TableCell>{item.cargo || '-'}</TableCell>
          <TableCell>{formatDateLong(item.createdAt)}</TableCell>
          <TableCell><div className="flex justify-center gap-1"><Button variant="ghost" size="icon" onClick={() => { setEditingColaborador(item); setModalOpen(true); }}><Pencil size={16} /></Button><Button variant="ghost" size="icon" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteRequest({ id: item.id, type: 'colaboradores', label: item.nombre }); }}><Trash2 size={16} className="text-destructive" /></Button></div></TableCell>
        </TableRow>
      ));
    }

    if (vista === 'usuarios') {
      if (filteredUsuarios.length === 0) {
        return <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{error ? 'No se pudo cargar usuarios desde PostgreSQL' : 'No hay usuarios invitados en este tenant'}</TableCell></TableRow>;
      }

      return filteredUsuarios.map((item) => (
        <TableRow key={item.membershipId}>
          <TableCell><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><UserPlus size={18} className="text-muted-foreground" /></div><div><p className="font-medium">{item.nombre}</p><p className="text-sm text-muted-foreground">{item.authLinked ? `Proveedores vinculados: ${formatAuthProviders(item.authProviders)}` : 'Pendiente del primer ingreso'}</p></div></div></TableCell>
          <TableCell>{item.email}</TableCell>
          <TableCell>{renderRoleBadge(item.role)}</TableCell>
          <TableCell>{renderInvitationBadge(item.invitationState)}</TableCell>
          <TableCell>{renderStatusBadge(item.estado !== 'inactivo')}</TableCell>
          <TableCell>{formatDateLong(item.createdAt || '')}</TableCell>
        </TableRow>
      ));
    }

    if (vista === 'categorias') {
      if (filteredCategorias.length === 0) {
        return <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">{error ? 'No se pudo cargar categorias desde PostgreSQL' : 'No hay categorias para mostrar'}</TableCell></TableRow>;
      }

      return filteredCategorias.map((item) => (
        <TableRow key={item.id}>
          <TableCell><div className="flex items-center gap-3"><ColorPicker currentColor={item.color || '#E5E7EB'} onColorChange={(newColor) => { void handleCategoriaColorChange(item, newColor); }} /><span className="font-medium">{item.nombre}</span></div></TableCell>
          <TableCell>{item.color || '-'}</TableCell>
          <TableCell>{renderStatusBadge(item.activa)}</TableCell>
          <TableCell><div className="flex justify-center gap-1"><Button variant="ghost" size="icon" onClick={() => { setEditingCategoria(item); setModalOpen(true); }}><Pencil size={16} /></Button><Button variant="ghost" size="icon" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteRequest({ id: item.id, type: 'categorias', label: item.nombre }); }}><Trash2 size={16} className="text-destructive" /></Button></div></TableCell>
        </TableRow>
      ));
    }

    if (vista === 'tiposDocumento') {
      if (filteredTiposDocumento.length === 0) {
        return <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">{error ? 'No se pudo cargar tipos de documento desde PostgreSQL' : 'No hay tipos de documento para mostrar'}</TableCell></TableRow>;
      }

      return filteredTiposDocumento.map((item) => (
        <TableRow key={item.id}>
          <TableCell><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><FileText size={18} className="text-muted-foreground" /></div><span className="font-medium">{item.nombre}</span></div></TableCell>
          <TableCell>{item.descripcion || '-'}</TableCell>
          <TableCell>{renderStatusBadge(item.activo)}</TableCell>
          <TableCell><div className="flex justify-center gap-1"><Button variant="ghost" size="icon" onClick={() => { setEditingTipoDocumento(item); setModalOpen(true); }}><Pencil size={16} /></Button><Button variant="ghost" size="icon" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteRequest({ id: item.id, type: 'tiposDocumento', label: item.nombre }); }}><Trash2 size={16} className="text-destructive" /></Button></div></TableCell>
        </TableRow>
      ));
    }

    if (filteredTiposDocumentoProyecto.length === 0) {
      return <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">{error ? 'No se pudo cargar documentos de proyecto desde PostgreSQL' : 'No hay documentos de proyecto para mostrar'}</TableCell></TableRow>;
    }

    return filteredTiposDocumentoProyecto.map((item) => (
      <TableRow key={item.id}>
        <TableCell><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><FolderTree size={18} className="text-muted-foreground" /></div><span className="font-medium">{item.nombre}</span></div></TableCell>
        <TableCell>{item.descripcion || '-'}</TableCell>
        <TableCell>{renderStatusBadge(item.activo)}</TableCell>
        <TableCell><div className="flex justify-center gap-1"><Button variant="ghost" size="icon" onClick={() => { setEditingTipoDocumentoProyecto(item); setModalOpen(true); }}><Pencil size={16} /></Button><Button variant="ghost" size="icon" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteRequest({ id: item.id, type: 'tiposDocumentoProyecto', label: item.nombre }); }}><Trash2 size={16} className="text-destructive" /></Button></div></TableCell>
      </TableRow>
    ));
  };

  return (
    <Layout>
      <PageHeader
        title="Configuracion"
        subtitle={loading ? 'Cargando catalogos desde PostgreSQL...' : `${currentCount} registros en ${activeView.label.toLowerCase()}`}
        action={{ label: activeView.actionLabel, onClick: openCreateModal }}
      />

      <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input placeholder={`Buscar en ${activeView.label.toLowerCase()}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>

          <Button type="button" onClick={openCreateModal} className="sm:hidden gap-2">
            <ActiveViewIcon size={16} />
            {activeView.actionLabel}
          </Button>

          <div className="flex flex-wrap gap-2">
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <Button key={option.key} type="button" variant={vista === option.key ? 'default' : 'outline'} className="gap-2" onClick={() => setVista(option.key)}>
                  <Icon size={16} />
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {vista === 'empresas' && (<><TableHead className="font-semibold">EMPRESA</TableHead><TableHead className="font-semibold">RUT</TableHead><TableHead className="font-semibold">CONTACTO</TableHead><TableHead className="font-semibold">CREADA</TableHead><TableHead className="text-center font-semibold">ACCIONES</TableHead></>)}
                {vista === 'proyectos' && (<><TableHead className="font-semibold">PROYECTO</TableHead><TableHead className="font-semibold">MONEDA</TableHead><TableHead className="font-semibold">MONTO TOTAL</TableHead><TableHead className="font-semibold">CREADO</TableHead><TableHead className="text-center font-semibold">ACCIONES</TableHead></>)}
                {vista === 'colaboradores' && (<><TableHead className="font-semibold">COLABORADOR</TableHead><TableHead className="font-semibold">EMAIL</TableHead><TableHead className="font-semibold">TELEFONO</TableHead><TableHead className="font-semibold">CARGO</TableHead><TableHead className="font-semibold">CREADO</TableHead><TableHead className="text-center font-semibold">ACCIONES</TableHead></>)}
                {vista === 'usuarios' && (<><TableHead className="font-semibold">USUARIO</TableHead><TableHead className="font-semibold">EMAIL</TableHead><TableHead className="font-semibold">ROL</TableHead><TableHead className="font-semibold">INVITACION</TableHead><TableHead className="font-semibold">ESTADO</TableHead><TableHead className="font-semibold">ALTA</TableHead></>)}
                {vista === 'categorias' && (<><TableHead className="font-semibold">CATEGORIA</TableHead><TableHead className="font-semibold">COLOR</TableHead><TableHead className="font-semibold">ESTADO</TableHead><TableHead className="text-center font-semibold">ACCIONES</TableHead></>)}
                {vista === 'tiposDocumento' && (<><TableHead className="font-semibold">TIPO</TableHead><TableHead className="font-semibold">DESCRIPCION</TableHead><TableHead className="font-semibold">ESTADO</TableHead><TableHead className="text-center font-semibold">ACCIONES</TableHead></>)}
                {vista === 'tiposDocumentoProyecto' && (<><TableHead className="font-semibold">DOCUMENTO</TableHead><TableHead className="font-semibold">DESCRIPCION</TableHead><TableHead className="font-semibold">ESTADO</TableHead><TableHead className="text-center font-semibold">ACCIONES</TableHead></>)}
              </TableRow>
            </TableHeader>
            <TableBody>{renderTableContent()}</TableBody>
          </Table>
        </div>
      </div>

      {vista === 'empresas' && <EmpresaModal open={modalOpen} onClose={closeModal} onSave={handleSaveEmpresa} empresa={editingEmpresa} />}
      {vista === 'proyectos' && <ProyectoModal open={modalOpen} onClose={closeModal} onSave={handleSaveProyecto} proyecto={editingProyecto} />}
      {vista === 'colaboradores' && <ColaboradorModal open={modalOpen} onClose={closeModal} onSave={handleSaveColaborador} colaborador={editingColaborador} />}
      {vista === 'usuarios' && <UserInviteModal open={modalOpen} onClose={closeModal} onSave={handleInviteUser} />}
      {vista === 'categorias' && <CategoriaModal open={modalOpen} onClose={closeModal} onSave={handleSaveCategoria} categoria={editingCategoria ? { id: editingCategoria.id, nombre: editingCategoria.nombre } : undefined} />}
      {vista === 'tiposDocumento' && <TipoDocumentoModal open={modalOpen} onClose={closeModal} onSave={handleSaveTipoDocumento} tipoDocumento={editingTipoDocumento} />}
      {vista === 'tiposDocumentoProyecto' && <TipoDocumentoProyectoModal open={modalOpen} onClose={closeModal} onSave={handleSaveTipoDocumentoProyecto} tipoDocumentoProyecto={editingTipoDocumentoProyecto} />}

      <ConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          setConfirmDialogOpen(open);
          if (!open) setDeleteTarget(null);
        }}
        title="Eliminar registro"
        description={deleteTarget ? `Estas seguro de que deseas eliminar "${deleteTarget.label}"? Esta accion no se puede deshacer.` : 'Estas seguro de que deseas eliminar este registro?'}
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </Layout>
  );
}
