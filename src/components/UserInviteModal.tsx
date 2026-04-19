import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, UserPlus } from 'lucide-react';
import type { InviteUserInput } from '@/services/postgresApi';

interface UserInviteModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (user: InviteUserInput) => void | Promise<void>;
}

export function UserInviteModal({ open, onClose, onSave }: UserInviteModalProps) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setNombre('');
      setRole('member');
      setIsSaving(false);
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      await onSave({
        email: email.trim().toLowerCase(),
        nombre: nombre.trim() || undefined,
        role,
      });
      onClose();
    } catch (error) {
      console.error('Error al invitar usuario:', error);
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
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <UserPlus className="h-5 w-5" />
            Invitar Usuario
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            El usuario quedara habilitado para el tenant activo y podra entrar con Microsoft o Google, siempre
            que use exactamente el correo invitado.
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
            />
          </div>

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
            <Select value={role} onValueChange={(value: 'member' | 'admin') => setRole(value)}>
              <SelectTrigger id="invite-role" className="bg-card">
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent className="bg-card">
                <SelectItem value="member">Miembro</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" className="gap-2" disabled={isSaving}>
              <Save size={18} />
              {isSaving ? 'Invitando...' : 'Guardar invitacion'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
