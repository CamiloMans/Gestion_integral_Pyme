import { ShieldX } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NoAccess() {
  return (
    <Layout>
      <div className="flex min-h-[65vh] items-center justify-center">
        <Card className="w-full max-w-lg text-center shadow-sm">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <ShieldX className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle>Sin accesos asignados</CardTitle>
            <CardDescription>
              Tu cuenta está activa, pero todavía no tiene módulos habilitados para este tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Solicita a un Super Admin que configure los módulos y submódulos que necesitas.
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
