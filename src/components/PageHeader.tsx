import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, action, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
      <div className="min-w-0 flex-1 pl-12 sm:pl-0">
        <h1 className="text-xl sm:text-2xl font-bold leading-tight text-foreground truncate">{title}</h1>
        {subtitle && (
          <p className="text-sm sm:text-base text-muted-foreground mt-1 truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 flex-shrink-0">
        {children}
        {action && (
          <Button onClick={action.onClick} className="hidden sm:flex gap-2">
            <Plus size={18} />
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
