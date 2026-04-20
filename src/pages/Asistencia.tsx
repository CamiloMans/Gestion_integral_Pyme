import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  Clock3,
  Download,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { useAppAuth } from '@/hooks/useAppAuth';
import { toast } from '@/hooks/use-toast';
import {
  postgresApi,
  type AsistenciaDashboardResponse,
  type AsistenciaRecord,
  type AsistenciaTipoRegistro,
  type TenantUser,
} from '@/services/postgresApi';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const RANGE_OPTIONS = [
  { value: '7', label: 'Ultimos 7 dias' },
  { value: '30', label: 'Ultimos 30 dias' },
  { value: '60', label: 'Ultimos 60 dias' },
];
const TEAM_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'working', label: 'En jornada' },
  { value: 'closed-today', label: 'Salida registrada hoy' },
  { value: 'no-mark-today', label: 'Sin marca hoy' },
];
const RECORD_STATUS_OPTIONS = [
  { value: 'all', label: 'Todas las jornadas' },
  { value: 'open', label: 'Jornadas abiertas' },
  { value: 'closed', label: 'Jornadas cerradas' },
];
const EMPTY_RECORDS: AsistenciaRecord[] = [];
const ASISTENCIA_PATHS = {
  registro: '/asistencia/registro',
  personal: '/asistencia/personal',
} as const;

type AsistenciaView = 'registro' | 'personal';
type LocationPermissionState = PermissionState | 'checking' | 'unsupported' | 'insecure' | 'unknown';
type LocationRequestAction = AsistenciaTipoRegistro | 'permission';
type MobilePlatform = 'ios' | 'android' | 'other';
type TeamStatusFilter = 'all' | 'working' | 'closed-today' | 'no-mark-today';
type RecordStatusFilter = 'all' | 'open' | 'closed';
type TeamStatusKey = Exclude<TeamStatusFilter, 'all'>;
type LocationSnapshot = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt: string;
};
type TeamStatusRow = {
  userId: string;
  userName: string;
  userEmail: string;
  statusKey: TeamStatusKey;
  statusLabel: string;
  badgeVariant: 'default' | 'secondary' | 'outline';
  todayRecord: AsistenciaRecord | null;
  workedMinutes: number | null;
};

function parseDateValue(value?: string) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function formatDate(value?: string) {
  const date = parseDateValue(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatDateShort(value?: string) {
  const date = parseDateValue(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(value?: string) {
  const date = parseDateValue(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTime(value?: string) {
  const date = parseDateValue(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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

function formatDurationFromMinutes(minutes?: number | null) {
  if (minutes === undefined || minutes === null || Number.isNaN(minutes) || minutes < 0) {
    return '-';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes.toString().padStart(2, '0')}m`;
}

function getWorkedMinutes(record: AsistenciaRecord | null) {
  if (!record) return null;

  const start = new Date(record.entradaAt).getTime();
  const end = record.salidaAt ? new Date(record.salidaAt).getTime() : Date.now();

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }

  return Math.round((end - start) / 60000);
}

function getUserDisplayName(user: Pick<TenantUser, 'nombre' | 'email'> | Pick<AsistenciaRecord, 'userName' | 'userEmail'>) {
  if ('nombre' in user) {
    return user.nombre || user.email || 'Sin nombre';
  }

  return user.userName || user.userEmail || 'Sin nombre';
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

  return formatDurationFromMinutes(getWorkedMinutes(record)) || 'Duracion no disponible';
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

function buildTeamStatusRow(user: TenantUser, todayRecord: AsistenciaRecord | null): TeamStatusRow {
  if (todayRecord && !todayRecord.salidaAt) {
    return {
      userId: user.id,
      userName: getUserDisplayName(user),
      userEmail: user.email,
      statusKey: 'working',
      statusLabel: 'En jornada',
      badgeVariant: 'default',
      todayRecord,
      workedMinutes: getWorkedMinutes(todayRecord),
    };
  }

  if (todayRecord?.salidaAt) {
    return {
      userId: user.id,
      userName: getUserDisplayName(user),
      userEmail: user.email,
      statusKey: 'closed-today',
      statusLabel: 'Salida registrada hoy',
      badgeVariant: 'secondary',
      todayRecord,
      workedMinutes: getWorkedMinutes(todayRecord),
    };
  }

  return {
    userId: user.id,
    userName: getUserDisplayName(user),
    userEmail: user.email,
    statusKey: 'no-mark-today',
    statusLabel: 'Sin marca hoy',
    badgeVariant: 'outline',
    todayRecord: null,
    workedMinutes: null,
  };
}

function AttendanceTable({
  records,
  emptyMessage,
  showWorkerColumn = true,
}: {
  records: AsistenciaRecord[];
  emptyMessage: string;
  showWorkerColumn?: boolean;
}) {
  const totalColumns = showWorkerColumn ? 7 : 6;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {showWorkerColumn && <TableHead>TRABAJADOR</TableHead>}
              <TableHead>FECHA</TableHead>
              <TableHead>ENTRADA</TableHead>
              <TableHead>SALIDA</TableHead>
              <TableHead>HORAS TOTALES</TableHead>
              <TableHead>UBICACION</TableHead>
              <TableHead>ESTADO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColumns} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow key={record.id} className={!record.salidaAt ? 'bg-sky-50/60' : undefined}>
                  {showWorkerColumn && (
                    <TableCell>
                      <div>
                        <p className="font-medium">{record.userName}</p>
                        <p className="text-xs text-muted-foreground">{record.userEmail}</p>
                      </div>
                    </TableCell>
                  )}
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
                    <p className="font-medium">{formatDurationFromMinutes(getWorkedMinutes(record))}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.salidaAt ? 'Jornada cerrada' : 'Contando jornada abierta'}
                    </p>
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
    </div>
  );
}

function TeamStatusTable({ rows, emptyMessage }: { rows: TeamStatusRow[]; emptyMessage: string }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>PERSONAL</TableHead>
              <TableHead>ESTADO HOY</TableHead>
              <TableHead>ENTRADA</TableHead>
              <TableHead>SALIDA</TableHead>
              <TableHead>HORAS HOY</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{row.userName}</p>
                      <p className="text-xs text-muted-foreground">{row.userEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.badgeVariant}>{row.statusLabel}</Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{formatTime(row.todayRecord?.entradaAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.todayRecord ? formatDate(row.todayRecord.workDate) : 'Sin marca'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{formatTime(row.todayRecord?.salidaAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.todayRecord?.salidaAt ? formatDateTime(row.todayRecord.salidaAt) : 'Pendiente'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{formatDurationFromMinutes(row.workedMinutes)}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.statusKey === 'working' ? 'Tiempo en curso' : row.statusKey === 'closed-today' ? 'Jornada cerrada' : 'Sin actividad hoy'}
                    </p>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function Asistencia() {
  const location = useLocation();
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
  const [teamStatusFilter, setTeamStatusFilter] = useState<TeamStatusFilter>('all');
  const [recordStatusFilter, setRecordStatusFilter] = useState<RecordStatusFilter>('all');
  const [exporting, setExporting] = useState(false);

  const isAdmin = session?.role === 'admin';
  const currentUserId = session?.user.id || '';
  const mobilePlatform = useMemo(() => getMobilePlatform(), []);
  const isLocationBusy = locationAction !== null;
  const currentView: AsistenciaView = location.pathname === ASISTENCIA_PATHS.personal ? 'personal' : 'registro';
  const needsRedirectToRegistro = location.pathname === '/asistencia' || (!isAdmin && location.pathname === ASISTENCIA_PATHS.personal);
  const needsRedirectToKnownRoute = location.pathname !== '/asistencia'
    && location.pathname !== ASISTENCIA_PATHS.registro
    && location.pathname !== ASISTENCIA_PATHS.personal;

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
  const recordsByUserId = useMemo(() => {
    const nextMap = new Map<string, AsistenciaRecord[]>();

    records.forEach((record) => {
      const existing = nextMap.get(record.userId);
      if (existing) {
        existing.push(record);
        return;
      }

      nextMap.set(record.userId, [record]);
    });

    return nextMap;
  }, [records]);

  const myRecords = recordsByUserId.get(currentUserId) ?? EMPTY_RECORDS;
  const currentUserOpenRecord = dashboard?.currentUserOpenRecord || null;
  const todayMyRecord = useMemo(() => {
    if (!dashboard) return null;

    return myRecords.find((record) => record.workDate === dashboard.range.endDate) || null;
  }, [dashboard, myRecords]);
  const latestMyClosedRecord = useMemo(
    () => myRecords.find((record) => Boolean(record.salidaAt)) || null,
    [myRecords],
  );
  const myWorkedDaysCount = useMemo(
    () => new Set(myRecords.map((record) => record.workDate)).size,
    [myRecords],
  );

  const teamStatusRows = useMemo(() => {
    if (!dashboard) return [];

    return dashboard.users
      .map((user) => {
        const todayRecord = (recordsByUserId.get(user.id) || []).find((record) => record.workDate === dashboard.range.endDate) || null;
        return buildTeamStatusRow(user, todayRecord);
      })
      .sort((left, right) => left.userName.localeCompare(right.userName, 'es', { sensitivity: 'base' }));
  }, [dashboard, recordsByUserId]);

  const teamSummary = useMemo(() => {
    const activeNow = teamStatusRows.filter((row) => row.statusKey === 'working').length;
    const completedToday = teamStatusRows.filter((row) => row.statusKey === 'closed-today').length;
    const withoutMarkToday = teamStatusRows.filter((row) => row.statusKey === 'no-mark-today').length;

    return {
      activeNow,
      completedToday,
      withoutMarkToday,
      activeWorkers: teamStatusRows.length,
    };
  }, [teamStatusRows]);

  const filteredTeamStatusRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return teamStatusRows.filter((row) => {
      if (selectedUserId !== 'all' && row.userId !== selectedUserId) {
        return false;
      }

      if (teamStatusFilter !== 'all' && row.statusKey !== teamStatusFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return row.userName.toLowerCase().includes(term) || row.userEmail.toLowerCase().includes(term);
    });
  }, [searchTerm, selectedUserId, teamStatusFilter, teamStatusRows]);

  const filteredUserIds = useMemo(
    () => new Set(filteredTeamStatusRows.map((row) => row.userId)),
    [filteredTeamStatusRows],
  );

  const filteredTeamRecords = useMemo(() => {
    return records.filter((record) => {
      if (!filteredUserIds.has(record.userId)) {
        return false;
      }

      if (recordStatusFilter === 'open' && record.salidaAt) {
        return false;
      }

      if (recordStatusFilter === 'closed' && !record.salidaAt) {
        return false;
      }

      return true;
    });
  }, [filteredUserIds, recordStatusFilter, records]);

  const locationStatusMeta = useMemo(
    () => getLocationStatusMeta(locationPermissionState),
    [locationPermissionState],
  );
  const locationHelpSteps = useMemo(
    () => getLocationHelpSteps(locationPermissionState, mobilePlatform),
    [locationPermissionState, mobilePlatform],
  );

  const captureCurrentLocation = useCallback(async () => {
    const position = await requestCurrentLocation();

    setLocationPreview({
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMeters: position.accuracyMeters,
      capturedAt: new Date().toISOString(),
    });
    setLocationPermissionState('granted');

    return position;
  }, []);

  const handlePrepareLocation = async () => {
    setLocationAction('permission');

    try {
      const position = await captureCurrentLocation();

      toast({
        title: 'Ubicacion lista',
        description: `Se detecto ${formatCoordinates(position.latitude, position.longitude)} con ${formatAccuracy(position.accuracyMeters)}.`,
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
      const position = await captureCurrentLocation();

      await postgresApi.registrarAsistencia({
        tipo,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracyMeters: position.accuracyMeters,
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

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedUserId('all');
    setTeamStatusFilter('all');
    setRecordStatusFilter('all');
  };

  const handleExportTeamReport = async () => {
    if (!dashboard || filteredTeamRecords.length === 0) {
      return;
    }

    setExporting(true);

    try {
      const XLSX = await import('xlsx');

      const sortedRecords = [...filteredTeamRecords].sort((left, right) => {
        const byName = getUserDisplayName(left).localeCompare(getUserDisplayName(right), 'es', { sensitivity: 'base' });
        if (byName !== 0) return byName;

        const byDate = left.workDate.localeCompare(right.workDate);
        if (byDate !== 0) return byDate;

        return left.entradaAt.localeCompare(right.entradaAt);
      });

      const detailRows = sortedRecords.map((record) => ({
        Nombre: getUserDisplayName(record),
        Dia: formatDateShort(record.workDate),
        'Horario entrada': formatTime(record.entradaAt),
        'Horario salida': record.salidaAt ? formatTime(record.salidaAt) : 'Pendiente',
        'Horas totales': formatDurationFromMinutes(getWorkedMinutes(record)),
      }));

      const summaryMap = new Map<string, { nombre: string; dias: Set<string>; minutes: number }>();

      sortedRecords.forEach((record) => {
        const workedMinutes = getWorkedMinutes(record) || 0;
        const existing = summaryMap.get(record.userId);

        if (existing) {
          existing.dias.add(record.workDate);
          existing.minutes += workedMinutes;
          return;
        }

        summaryMap.set(record.userId, {
          nombre: getUserDisplayName(record),
          dias: new Set([record.workDate]),
          minutes: workedMinutes,
        });
      });

      const consolidatedRows = Array.from(summaryMap.values())
        .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es', { sensitivity: 'base' }))
        .map((row) => ({
          Nombre: row.nombre,
          'Dias trabajados': row.dias.size,
          'Horas sumadas': formatDurationFromMinutes(row.minutes),
        }));

      const workbook = XLSX.utils.book_new();
      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      const consolidatedSheet = XLSX.utils.json_to_sheet(consolidatedRows);

      detailSheet['!cols'] = [
        { wch: 28 },
        { wch: 14 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 },
      ];
      consolidatedSheet['!cols'] = [
        { wch: 28 },
        { wch: 18 },
        { wch: 16 },
      ];

      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle');
      XLSX.utils.book_append_sheet(workbook, consolidatedSheet, 'Consolidado');

      XLSX.writeFile(workbook, `asistencia-personal-${dashboard.range.startDate}-${dashboard.range.endDate}.xlsx`);

      toast({
        title: 'Excel generado',
        description: `Se exportaron ${detailRows.length} registros y ${consolidatedRows.length} filas consolidadas.`,
        variant: 'success',
      });
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : 'No se pudo generar el Excel.';

      toast({
        title: 'Error al exportar',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const pageSubtitle = loading
    ? currentView === 'personal'
      ? 'Cargando estado y registros del personal...'
      : 'Cargando tu jornada y tus registros...'
    : dashboard
      ? currentView === 'personal'
        ? `${filteredTeamStatusRows.length} personas visibles y ${filteredTeamRecords.length} registros en ${dashboard.range.days} dias`
        : currentUserOpenRecord
          ? `Tu jornada esta activa desde las ${formatTime(currentUserOpenRecord.entradaAt)}`
          : `${myRecords.length} registros personales en ${dashboard.range.days} dias`
      : 'Sin datos de asistencia disponibles';

  if (needsRedirectToKnownRoute) {
    return <Navigate to={ASISTENCIA_PATHS.registro} replace />;
  }

  if (needsRedirectToRegistro) {
    return <Navigate to={ASISTENCIA_PATHS.registro} replace />;
  }

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
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </PageHeader>

      {currentView === 'registro' ? (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[1.6fr,1fr]">
            <Card className="overflow-hidden border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="text-2xl">Mi jornada</CardTitle>
                    <CardDescription>
                      Esta vista queda dedicada solo al registro individual con geolocalizacion.
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

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <Card className="shadow-sm">
                <CardContent className="p-5">
                  {loading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                        <CalendarDays className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Mis registros en rango</p>
                        <p className="text-2xl font-bold">{myRecords.length}</p>
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
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Dias trabajados</p>
                        <p className="text-2xl font-bold">{myWorkedDaysCount}</p>
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
                        <Clock3 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Ultima salida</p>
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

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Mi historial reciente</CardTitle>
              <CardDescription>
                Historico personal de entradas y salidas almacenadas para {session?.user.nombre || 'tu cuenta'}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttendanceTable
                records={myRecords}
                emptyMessage="Aun no tienes registros de asistencia en el rango seleccionado."
                showWorkerColumn={false}
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="shadow-sm">
              <CardContent className="p-5">
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Personal activo</p>
                      <p className="text-2xl font-bold">{teamSummary.activeWorkers}</p>
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
                    <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">En jornada ahora</p>
                      <p className="text-2xl font-bold">{teamSummary.activeNow}</p>
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
                      <p className="text-sm text-muted-foreground">Salida registrada hoy</p>
                      <p className="text-2xl font-bold">{teamSummary.completedToday}</p>
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
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Sin marca hoy</p>
                      <p className="text-2xl font-bold">{teamSummary.withoutMarkToday}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Estado del personal</CardTitle>
              <CardDescription>
                Vista diaria del estado actual del equipo y detalle exportable dentro del rango seleccionado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 xl:grid-cols-[1.2fr,0.8fr,0.9fr,0.9fr]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="pl-9"
                    placeholder="Buscar por nombre o correo..."
                  />
                </div>

                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Filtrar trabajador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo el personal</SelectItem>
                    {(dashboard?.users || []).map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {getUserDisplayName(user)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={teamStatusFilter} onValueChange={(value) => setTeamStatusFilter(value as TeamStatusFilter)}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Estado diario" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={recordStatusFilter} onValueChange={(value) => setRecordStatusFilter(value as RecordStatusFilter)}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Estado de jornada" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECORD_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {filteredTeamStatusRows.length} personas visibles y {filteredTeamRecords.length} registros exportables.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="ghost" onClick={handleClearFilters}>
                    Limpiar filtros
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleExportTeamReport()}
                    disabled={loading || exporting || filteredTeamRecords.length === 0}
                  >
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Exportar Excel
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Estado de hoy</h3>
                    <p className="text-sm text-muted-foreground">
                      Resume si cada trabajador esta en jornada, ya cerro su dia o aun no marca asistencia.
                    </p>
                  </div>
                  <Badge variant="outline">{dashboard?.range.endDate ? formatDate(dashboard.range.endDate) : 'Hoy'}</Badge>
                </div>

                <TeamStatusTable
                  rows={filteredTeamStatusRows}
                  emptyMessage="No hay personal que coincida con los filtros actuales."
                />
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold">Detalle de asistencia</h3>
                  <p className="text-sm text-muted-foreground">
                    Este mismo detalle se usa para generar el Excel con la hoja de detalle y la hoja consolidada.
                  </p>
                </div>

                <AttendanceTable
                  records={filteredTeamRecords}
                  emptyMessage="No hay registros de asistencia que coincidan con los filtros actuales."
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}
