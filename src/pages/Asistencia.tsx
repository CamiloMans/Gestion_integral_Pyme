import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { useAppAuth } from '@/hooks/useAppAuth';
import { toast } from '@/hooks/use-toast';
import {
  postgresApi,
  type AsistenciaDashboardResponse,
  type AsistenciaRecord,
  type AsistenciaTipoRegistro,
} from '@/services/postgresApi';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RANGE_OPTIONS = [
  { value: '7', label: 'Ultimos 7 dias' },
  { value: '30', label: 'Ultimos 30 dias' },
  { value: '60', label: 'Ultimos 60 dias' },
];
const EMPTY_RECORDS: AsistenciaRecord[] = [];
type LocationPermissionState = PermissionState | 'checking' | 'unsupported' | 'insecure' | 'unknown';
type LocationRequestAction = AsistenciaTipoRegistro | 'permission';
type MobilePlatform = 'ios' | 'android' | 'other';
type LocationSnapshot = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt: string;
};

function formatDate(value?: string) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatTime(value?: string) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatCoordinates(latitude?: number, longitude?: number) {
  if (latitude === undefined || longitude === undefined) {
    return 'Sin coordenadas';
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function formatAccuracy(value?: number) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'precision no disponible';
  }

  return `precision +/- ${Math.round(value)} m`;
}

function getMobilePlatform(): MobilePlatform {
  if (typeof navigator === 'undefined') {
    return 'other';
  }

  const userAgent = navigator.userAgent || '';
  const isAppleTouchDevice = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  if (/android/i.test(userAgent)) {
    return 'android';
  }

  if (/iPad|iPhone|iPod/i.test(userAgent) || isAppleTouchDevice) {
    return 'ios';
  }

  return 'other';
}

function getLocationAvailabilityState(): Extract<LocationPermissionState, 'unsupported' | 'insecure'> | null {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'insecure';
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unsupported';
  }

  return null;
}

function getLocationErrorState(error: unknown): LocationPermissionState | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = Number((error as { code?: number }).code);

    if (code === 1) {
      return 'denied';
    }
  }

  if (!(error instanceof Error)) {
    return null;
  }

  const normalizedMessage = error.message.toLowerCase();

  if (normalizedMessage.includes('https') || normalizedMessage.includes('secure context')) {
    return 'insecure';
  }

  if (normalizedMessage.includes('no soporta geolocalizacion') || normalizedMessage.includes('not supported')) {
    return 'unsupported';
  }

  if (
    normalizedMessage.includes('permission')
    || normalizedMessage.includes('denied')
    || normalizedMessage.includes('not allowed')
  ) {
    return 'denied';
  }

  return null;
}

async function queryLocationPermissionState(): Promise<LocationPermissionState> {
  const availabilityState = getLocationAvailabilityState();

  if (availabilityState) {
    return availabilityState;
  }

  if (!navigator.permissions?.query) {
    return 'unknown';
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch (_error) {
    return 'unknown';
  }
}

function getLocationStatusMeta(permissionState: LocationPermissionState) {
  switch (permissionState) {
    case 'granted':
      return {
        badgeLabel: 'Permitida',
        badgeVariant: 'default' as const,
        title: 'Ubicacion lista para marcar',
        description: 'El navegador ya puede leer tu posicion. Puedes registrar entrada o salida desde el celular sin volver a pedir permiso.',
        alertClassName: 'border-emerald-200 bg-emerald-50/80',
      };
    case 'prompt':
      return {
        badgeLabel: 'Pendiente',
        badgeVariant: 'secondary' as const,
        title: 'Activa la ubicacion antes de marcar',
        description: 'Toca el boton para que el navegador muestre el aviso de permiso y deje lista la geolocalizacion.',
        alertClassName: 'border-sky-100 bg-white/80',
      };
    case 'denied':
      return {
        badgeLabel: 'Bloqueada',
        badgeVariant: 'destructive' as const,
        title: 'El navegador bloqueo la ubicacion',
        description: 'Si ya negaste el permiso, el telefono normalmente no vuelve a mostrar el aviso hasta que lo habilites desde la configuracion del navegador o del sistema.',
        alertClassName: 'border-rose-200 bg-rose-50/80',
      };
    case 'unsupported':
      return {
        badgeLabel: 'No disponible',
        badgeVariant: 'outline' as const,
        title: 'Este navegador no expone geolocalizacion',
        description: 'Abre la app desde Safari, Chrome o Edge actualizado para poder registrar asistencia con ubicacion.',
        alertClassName: 'border-amber-200 bg-amber-50/80',
      };
    case 'insecure':
      return {
        badgeLabel: 'Sin HTTPS',
        badgeVariant: 'outline' as const,
        title: 'La geolocalizacion requiere una conexion segura',
        description: 'Abre la aplicacion usando HTTPS. En conexiones no seguras el navegador no mostrara el permiso.',
        alertClassName: 'border-amber-200 bg-amber-50/80',
      };
    case 'checking':
      return {
        badgeLabel: 'Revisando',
        badgeVariant: 'secondary' as const,
        title: 'Comprobando permisos de ubicacion',
        description: 'Estamos verificando si el navegador ya tiene acceso a tu posicion actual.',
        alertClassName: 'border-slate-200 bg-slate-50/80',
      };
    case 'unknown':
    default:
      return {
        badgeLabel: 'Por verificar',
        badgeVariant: 'secondary' as const,
        title: 'El navegador pedira la ubicacion al marcar',
        description: 'Algunos navegadores moviles no informan el estado del permiso hasta que intentas obtener la ubicacion por primera vez.',
        alertClassName: 'border-sky-100 bg-white/80',
      };
  }
}

function getLocationHelpSteps(permissionState: LocationPermissionState, platform: MobilePlatform) {
  if (permissionState === 'denied') {
    if (platform === 'ios') {
      return [
        'En iPhone o iPad abre Ajustes > Privacidad y seguridad > Localizacion y verifica que este activa.',
        'Dentro de Localizacion habilita el navegador con el que abriste la app y permite el acceso mientras lo usas.',
        'Si la ubicacion sale muy amplia, activa Ubicacion precisa para mejorar la exactitud del registro.',
      ];
    }

    if (platform === 'android') {
      return [
        'En Chrome abre el menu > Configuracion > Configuracion del sitio > Ubicacion y permite el acceso para este sitio.',
        'Si el telefono bloqueo a nivel sistema, ve a Ajustes > Apps > tu navegador > Permisos > Ubicacion.',
        'Asegurate tambien de tener la ubicacion del telefono encendida antes de volver a la app.',
      ];
    }

    return [
      'Revisa los permisos del sitio en el navegador y habilita el acceso a la ubicacion.',
      'Si el sistema del equipo tambien lo bloqueo, activa la ubicacion del navegador desde la configuracion del dispositivo.',
    ];
  }

  if (permissionState === 'prompt' || permissionState === 'unknown') {
    return [
      'Toca "Activar ubicacion" para que el navegador muestre el aviso de permiso.',
      'Acepta el acceso mientras usas la app y luego registra tu entrada o salida.',
    ];
  }

  if (permissionState === 'granted') {
    return [
      'Si vas a marcar desde el celular, puedes actualizar la lectura antes de registrar para confirmar que el GPS respondio.',
    ];
  }

  if (permissionState === 'insecure') {
    return [
      'Abre la aplicacion con una URL que empiece por https:// para que el navegador permita usar geolocalizacion.',
    ];
  }

  return [];
}

function getDurationLabel(record: AsistenciaRecord | null) {
  if (!record) return 'Sin jornada activa';

  const start = new Date(record.entradaAt).getTime();
  const end = record.salidaAt ? new Date(record.salidaAt).getTime() : Date.now();

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 'Duracion no disponible';
  }

  const totalMinutes = Math.round((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

function getRecordStatusLabel(record: AsistenciaRecord | null) {
  if (!record) return 'Sin registros para hoy';
  return record.salidaAt ? 'Jornada cerrada' : 'Jornada en curso';
}

function getGeolocationErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = Number((error as { code?: number }).code);

    if (code === 1) {
      return 'Debes permitir el acceso a la ubicacion para registrar asistencia.';
    }

    if (code === 2) {
      return 'No se pudo determinar tu ubicacion actual.';
    }

    if (code === 3) {
      return 'La obtencion de ubicacion demoro demasiado. Intenta nuevamente.';
    }
  }

  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase();

    if (normalizedMessage.includes('https') || normalizedMessage.includes('secure context')) {
      return 'La geolocalizacion solo funciona cuando abres la app por HTTPS.';
    }

    if (normalizedMessage.includes('permission') || normalizedMessage.includes('denied') || normalizedMessage.includes('not allowed')) {
      return 'El navegador o el telefono bloquearon la ubicacion. Revisa los permisos y vuelve a intentarlo.';
    }

    return error.message;
  }

  return 'No se pudo obtener la geolocalizacion actual.';
}

function createPositionRequest(options: PositionOptions) {
  return new Promise<{ latitude: number; longitude: number; accuracyMeters?: number }>((resolve, reject) => {
    const availabilityState = getLocationAvailabilityState();

    if (availabilityState === 'insecure') {
      reject(new Error('La geolocalizacion solo funciona cuando abres la app por HTTPS.'));
      return;
    }

    if (availabilityState === 'unsupported') {
      reject(new Error('Tu navegador no soporta geolocalizacion.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => reject(error),
      options,
    );
  });
}

async function requestCurrentLocation() {
  try {
    return await createPositionRequest({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = Number((error as { code?: number }).code);

      if (code === 2 || code === 3) {
        return createPositionRequest({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 120000,
        });
      }
    }

    throw error;
  }
}

function AttendanceTable({
  records,
  emptyMessage,
}: {
  records: AsistenciaRecord[];
  emptyMessage: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>TRABAJADOR</TableHead>
            <TableHead>FECHA</TableHead>
            <TableHead>ENTRADA</TableHead>
            <TableHead>SALIDA</TableHead>
            <TableHead>UBICACION</TableHead>
            <TableHead>ESTADO</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            records.map((record) => (
              <TableRow key={record.id} className={!record.salidaAt ? 'bg-sky-50/60' : undefined}>
                <TableCell>
                  <div>
                    <p className="font-medium">{record.userName}</p>
                    <p className="text-xs text-muted-foreground">{record.userEmail}</p>
                  </div>
                </TableCell>
                <TableCell>{formatDate(record.workDate)}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{formatTime(record.entradaAt)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(record.entradaAt)}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{formatTime(record.salidaAt)}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.salidaAt ? formatDateTime(record.salidaAt) : 'Pendiente'}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground">Entrada</p>
                      <p>{formatCoordinates(record.entradaLatitude, record.entradaLongitude)}</p>
                      <p>{formatAccuracy(record.entradaAccuracyMeters)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Salida</p>
                      <p>{formatCoordinates(record.salidaLatitude, record.salidaLongitude)}</p>
                      <p>{formatAccuracy(record.salidaAccuracyMeters)}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={record.salidaAt ? 'secondary' : 'default'}>
                    {record.salidaAt ? 'Cerrada' : 'Abierta'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Asistencia() {
  const { session } = useAppAuth();
  const [dashboard, setDashboard] = useState<AsistenciaDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState('30');
  const [locationAction, setLocationAction] = useState<LocationRequestAction | null>(null);
  const [locationPermissionState, setLocationPermissionState] = useState<LocationPermissionState>('checking');
  const [locationPreview, setLocationPreview] = useState<LocationSnapshot | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('all');

  const isAdmin = session?.role === 'admin';
  const currentUserId = session?.user.id || '';
  const mobilePlatform = useMemo(() => getMobilePlatform(), []);
  const isLocationBusy = locationAction !== null;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await postgresApi.getAsistenciaDashboard(Number(rangeDays));
      setDashboard(data);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'No se pudo cargar asistencia.';
      setError(message);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [rangeDays]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!error) return;

    toast({
      title: 'Error',
      description: error,
      variant: 'destructive',
    });
  }, [error]);

  useEffect(() => {
    if (!dashboard) return;
    if (selectedUserId === 'all') return;

    const exists = dashboard.users.some((user) => user.id === selectedUserId);
    if (!exists) {
      setSelectedUserId('all');
    }
  }, [dashboard, selectedUserId]);

  const refreshLocationPermissionState = useCallback(async () => {
    const nextState = await queryLocationPermissionState();
    setLocationPermissionState(nextState);
    return nextState;
  }, []);

  useEffect(() => {
    void refreshLocationPermissionState();

    const handleFocus = () => {
      void refreshLocationPermissionState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshLocationPermissionState();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshLocationPermissionState]);

  const records = dashboard?.records ?? EMPTY_RECORDS;
  const myRecords = useMemo(
    () => records.filter((record) => record.userId === currentUserId),
    [currentUserId, records],
  );
  const currentUserOpenRecord = dashboard?.currentUserOpenRecord || null;
  const todayMyRecord = useMemo(() => {
    if (!dashboard) return null;
    return myRecords.find((record) => record.workDate === dashboard.range.endDate) || null;
  }, [dashboard, myRecords]);
  const latestMyClosedRecord = useMemo(
    () => myRecords.find((record) => Boolean(record.salidaAt)) || null,
    [myRecords],
  );

  const filteredTeamRecords = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return records.filter((record) => {
      if (selectedUserId !== 'all' && record.userId !== selectedUserId) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        record.userName.toLowerCase().includes(term)
        || record.userEmail.toLowerCase().includes(term)
        || record.workDate.toLowerCase().includes(term)
      );
    });
  }, [records, searchTerm, selectedUserId]);

  const locationStatusMeta = useMemo(
    () => getLocationStatusMeta(locationPermissionState),
    [locationPermissionState],
  );
  const locationHelpSteps = useMemo(
    () => getLocationHelpSteps(locationPermissionState, mobilePlatform),
    [locationPermissionState, mobilePlatform],
  );

  const captureCurrentLocation = useCallback(async () => {
    const location = await requestCurrentLocation();

    setLocationPreview({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: location.accuracyMeters,
      capturedAt: new Date().toISOString(),
    });
    setLocationPermissionState('granted');

    return location;
  }, []);

  const handlePrepareLocation = async () => {
    setLocationAction('permission');

    try {
      const location = await captureCurrentLocation();

      toast({
        title: 'Ubicacion lista',
        description: `Se detecto ${formatCoordinates(location.latitude, location.longitude)} con ${formatAccuracy(location.accuracyMeters)}.`,
        variant: 'success',
      });
    } catch (locationError) {
      const nextState = getLocationErrorState(locationError);

      if (nextState) {
        setLocationPermissionState(nextState);
      }

      toast({
        title: 'No se pudo activar la ubicacion',
        description: getGeolocationErrorMessage(locationError),
        variant: 'destructive',
      });
    } finally {
      await refreshLocationPermissionState();
      setLocationAction(null);
    }
  };

  const handleMark = async (tipo: AsistenciaTipoRegistro) => {
    setLocationAction(tipo);

    try {
      const location = await captureCurrentLocation();

      await postgresApi.registrarAsistencia({
        tipo,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracyMeters: location.accuracyMeters,
      });

      toast({
        title: tipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada',
        description: 'La hora y geolocalizacion se guardaron correctamente.',
        variant: 'success',
      });

      await loadDashboard();
    } catch (markError) {
      const nextState = getLocationErrorState(markError);

      if (nextState) {
        setLocationPermissionState(nextState);
      }

      toast({
        title: 'No se pudo registrar',
        description: getGeolocationErrorMessage(markError),
        variant: 'destructive',
      });
    } finally {
      await refreshLocationPermissionState();
      setLocationAction(null);
    }
  };

  const pageSubtitle = loading
    ? 'Cargando jornada y registros del equipo...'
    : dashboard
      ? `${dashboard.summary.recordsInRange} registros en ${dashboard.range.days} dias`
      : 'Sin datos de asistencia disponibles';

  return (
    <Layout>
      <PageHeader title="Control de Asistencia" subtitle={pageSubtitle}>
        <div className="w-full sm:w-[170px]">
          <Select value={rangeDays} onValueChange={setRangeDays}>
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Selecciona rango" />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="button" variant="outline" onClick={() => void loadDashboard()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Actualizar
        </Button>
      </PageHeader>

      <div className="mb-6 grid gap-4 xl:grid-cols-[1.6fr,1fr]">
        <Card className="overflow-hidden border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-2xl">Mi jornada</CardTitle>
                <CardDescription>
                  El registro se hace con la cuenta activa y usa la geolocalizacion del navegador.
                </CardDescription>
              </div>
              <Badge variant={currentUserOpenRecord ? 'default' : 'secondary'}>
                {getRecordStatusLabel(todayMyRecord || currentUserOpenRecord)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-sky-100 bg-white/90 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-700">Trabajador</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{session?.user.nombre || 'Sin nombre'}</p>
                    <p className="text-sm text-muted-foreground">{session?.user.email || 'Sin correo'}</p>
                  </div>
                  <div className="rounded-2xl border border-sky-100 bg-white/90 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-700">Entrada</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {currentUserOpenRecord ? formatTime(currentUserOpenRecord.entradaAt) : formatTime(todayMyRecord?.entradaAt)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {currentUserOpenRecord
                        ? formatDateTime(currentUserOpenRecord.entradaAt)
                        : todayMyRecord
                          ? formatDateTime(todayMyRecord.entradaAt)
                          : 'Aun no registrada'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-100 bg-white/90 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-700">Duracion</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{getDurationLabel(currentUserOpenRecord)}</p>
                    <p className="text-sm text-muted-foreground">
                      {currentUserOpenRecord ? 'Contando hasta tu salida' : 'Se actualiza al cerrar la jornada'}
                    </p>
                  </div>
                </div>

                <Alert className={locationStatusMeta.alertClassName}>
                  <MapPin className="h-4 w-4" />
                  <AlertTitle className="flex flex-wrap items-center gap-2">
                    <span>{locationStatusMeta.title}</span>
                    <Badge variant={locationStatusMeta.badgeVariant}>{locationStatusMeta.badgeLabel}</Badge>
                  </AlertTitle>
                  <AlertDescription>
                    <div className="space-y-3">
                      <p>{locationStatusMeta.description}</p>
                      <p>
                        Cada marca guarda latitud, longitud y precision estimada para respaldar la hora oficial de entrada y salida.
                      </p>

                      {locationPreview && (
                        <p className="text-xs text-muted-foreground">
                          Ultima lectura: {formatCoordinates(locationPreview.latitude, locationPreview.longitude)} con {formatAccuracy(locationPreview.accuracyMeters)} a las {formatDateTime(locationPreview.capturedAt)}.
                        </p>
                      )}

                      {(locationPermissionState === 'prompt'
                        || locationPermissionState === 'unknown'
                        || locationPermissionState === 'granted'
                        || locationPermissionState === 'denied') && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={locationPermissionState === 'granted' ? 'outline' : 'default'}
                            onClick={() => void handlePrepareLocation()}
                            disabled={isLocationBusy}
                          >
                            {locationAction === 'permission' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MapPin className="h-4 w-4" />
                            )}
                            {locationPermissionState === 'granted' ? 'Actualizar ubicacion' : 'Activar ubicacion'}
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void refreshLocationPermissionState()}
                            disabled={isLocationBusy}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Revisar permiso
                          </Button>
                        </div>
                      )}

                      {locationHelpSteps.length > 0 && (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {locationHelpSteps.map((step) => (
                            <p key={step}>- {step}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3 md:grid-cols-2">
                  <Button
                    type="button"
                    size="lg"
                    className="h-auto min-h-14 justify-start gap-3 rounded-2xl"
                    disabled={Boolean(currentUserOpenRecord) || isLocationBusy}
                    onClick={() => void handleMark('entrada')}
                  >
                    {locationAction === 'entrada' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                    <div className="text-left">
                      <p className="font-semibold">Registrar entrada</p>
                      <p className="text-xs text-primary-foreground/80">Captura hora actual y punto GPS</p>
                    </div>
                  </Button>

                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="h-auto min-h-14 justify-start gap-3 rounded-2xl border-sky-200 bg-white"
                    disabled={!currentUserOpenRecord || isLocationBusy}
                    onClick={() => void handleMark('salida')}
                  >
                    {locationAction === 'salida' ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                    <div className="text-left">
                      <p className="font-semibold">Registrar salida</p>
                      <p className="text-xs text-muted-foreground">Cierra la jornada abierta y guarda tu ubicacion final</p>
                    </div>
                  </Button>
                </div>

                {currentUserOpenRecord && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <Activity className="h-4 w-4" />
                      <p className="font-medium">Jornada activa desde {formatTime(currentUserOpenRecord.entradaAt)}</p>
                    </div>
                    <p className="mt-2 text-sm text-emerald-900">
                      Entrada registrada en {formatCoordinates(currentUserOpenRecord.entradaLatitude, currentUserOpenRecord.entradaLongitude)} con {formatAccuracy(currentUserOpenRecord.entradaAccuracyMeters)}.
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card className="shadow-sm">
            <CardContent className="p-5">
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Activos ahora</p>
                    <p className="text-2xl font-bold">{dashboard?.summary.activeNow || 0}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Salidas cerradas hoy</p>
                    <p className="text-2xl font-bold">{dashboard?.summary.completedToday || 0}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Trabajadores con marcas</p>
                    <p className="text-2xl font-bold">{dashboard?.summary.uniqueWorkersInRange || 0}</p>
                    <p className="text-xs text-muted-foreground">Dentro del rango seleccionado</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ultima salida propia</p>
                    <p className="text-lg font-bold">
                      {latestMyClosedRecord?.salidaAt ? formatTime(latestMyClosedRecord.salidaAt) : '-'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {latestMyClosedRecord?.salidaAt ? formatDate(latestMyClosedRecord.workDate) : 'Sin cierre reciente'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="mi-historial" className="space-y-4">
        <TabsList className={isAdmin ? 'grid w-full grid-cols-2 md:w-[360px]' : 'grid w-full grid-cols-1 md:w-[180px]'}>
          <TabsTrigger value="mi-historial">Mi historial</TabsTrigger>
          {isAdmin && <TabsTrigger value="equipo">Equipo</TabsTrigger>}
        </TabsList>

        <TabsContent value="mi-historial" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Mis ultimos registros</CardTitle>
              <CardDescription>
                Historico personal de entradas y salidas almacenadas para {session?.user.nombre || 'tu cuenta'}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttendanceTable
                records={myRecords}
                emptyMessage="Aun no tienes registros de asistencia en el rango seleccionado."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="equipo" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Control del equipo</CardTitle>
                <CardDescription>
                  Vista consolidada de los trabajadores del tenant usando los nombres de sus cuentas de acceso.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[1.2fr,0.8fr]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="pl-9"
                      placeholder="Buscar por nombre, correo o fecha..."
                    />
                  </div>

                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Filtrar trabajador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los trabajadores</SelectItem>
                      {(dashboard?.users || []).map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.nombre || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <AttendanceTable
                  records={filteredTeamRecords}
                  emptyMessage="No hay registros de equipo que coincidan con los filtros actuales."
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </Layout>
  );
}
