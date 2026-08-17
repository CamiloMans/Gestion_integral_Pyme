import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, UserPlus, Pencil } from 'lucide-react';
import type { InviteUserInput, TenantUser, UserRole } from '@/services/postgresApi';
import { useAppAuth } from '@/hooks/useAppAuth';
import { ACCESS_GROUPS, normalizePermissionKeys, type PermissionKey } from '@/lib/access-control';

interface UserInviteModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (user: InviteUserInput) => void | Promise<void>;
  editingUser?: TenantUser | null;
}

function normalizeRole(role: string | undefined): UserRole {
  if (role === 'super_admin' || role === 'admin') return role;
  return 'member';
}

export function UserInviteModal({ open, onClose, onSave, editingUser }: UserInviteModalProps) {
  const { session } = useAppAuth();
  const isSuperAdmin = session?.role === 'super_admin';
  const isEditing = Boolean(editingUser);
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setNombre('');
      setRole('member');
      setPermissions([]);
      setIsSaving(false);
      return;
    }

    if (editingUser) {
      setEmail(editingUser.email);
      setNombre(editingUser.nombre || '');
      setRole(normalizeRole(editingUser.role));
      setPermissions(normalizePermissionKeys(editingUser.permissions));
    } else {
      setPermissions([]);
    }
  }, [open, editingUser]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      await onSave({
        email: email.trim().toLowerCase(),
        nombre: nombre.trim() || undefined,
        role,
        ...(isSuperAdmin ? { permissions } : {}),
      });
      onClose();
    } catch (error) {
      console.error(isEditing ? 'Error al actualizar usuario:' : 'Error al invitar usuario:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSaving) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            {isEditing ? <Pencil className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            {isEditing ? 'Editar Usuario' : 'Invitar Usuario'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Actualiza el rol y las vistas habilitadas para esta membresía.'
              : 'Crea la invitación y define los accesos iniciales del usuario.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {isEditing
              ? 'Puedes actualizar el nombre visible y el rol del usuario dentro de este tenant.'
              : 'El usuario quedara habilitado para el tenant activo y podra entrar con Microsoft o Google, siempre que use exactamente el correo invitado.'}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-email">Correo de acceso *</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="nombre@rekosol.cl"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isEditing}
            />
          </div>

          {isSuperAdmin && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <Label>Accesos a módulos y submódulos</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {role === 'super_admin'
                    ? 'Los Super Admin siempre tienen acceso total.'
                    : 'Selecciona únicamente las vistas que podrá abrir este usuario. Un usuario nuevo parte sin accesos.'}
                </p>
              </div>

              {role !== 'super_admin' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {ACCESS_GROUPS.map((group) => {
                    const childKeys = group.children.map((child) => child.key as PermissionKey);
                    const selectedCount = childKeys.filter((permission) => permissions.includes(permission)).length;
                    const groupChecked = selectedCount === childKeys.length;
                    const groupState = selectedCount > 0 && !groupChecked ? 'indeterminate' : groupChecked;

                    return (
                      <div key={group.id} className="rounded-md border border-border bg-muted/20 p-3">
                        <label className="flex cursor-pointer items-center gap-2 font-medium">
                          <Checkbox
                            checked={groupState}
                            onCheckedChange={(checked) => {
                              setPermissions((current) => normalizePermissionKeys(
                                checked
                                  ? [...current, ...childKeys]
                                  : current.filter((permission) => !childKeys.includes(permission)),
                              ));
                            }}
                          />
                          {group.label}
                        </label>
                        <div className="mt-2 space-y-2 border-l border-border pl-4">
                          {group.children.map((child) => {
                            const permission = child.key as PermissionKey;
                            return (
                              <label key={permission} className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                                <Checkbox
                                  checked={permissions.includes(permission)}
                                  onCheckedChange={(checked) => {
                                    setPermissions((current) => normalizePermissionKeys(
                                      checked
                                        ? [...current, permission]
                                        : current.filter((candidate) => candidate !== permission),
                                    ));
                                  }}
                                />
                                {child.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {role !== 'super_admin' && permissions.length === 0 && (
                <p className="text-xs font-medium text-amber-700">
                  Este usuario podrá iniciar sesión, pero verá la pantalla “Sin accesos asignados”.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="invite-name">Nombre</Label>
            <Input
              id="invite-name"
              placeholder="Nombre visible en la app"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Rol</Label>
            <Select value={role} onValueChange={(value: UserRole) => setRole(value)}>
              <SelectTrigger id="invite-role" className="bg-card">
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent className="bg-card">
                <SelectItem value="member">Miembro</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
                {isSuperAdmin && <SelectItem value="super_admin">Super administrador</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" className="gap-2" disabled={isSaving}>
              <Save size={18} />
              {isEditing
                ? (isSaving ? 'Guardando...' : 'Guardar cambios')
                : (isSaving ? 'Invitando...' : 'Guardar invitacion')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
