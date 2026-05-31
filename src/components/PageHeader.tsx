import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

type HeaderAction = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
};

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: HeaderAction;
  actions?: HeaderAction[];
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, action, actions, children }: PageHeaderProps) {
  const headerActions = actions || (action ? [{ ...action, icon: <Plus size={18} /> }] : []);

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
        {headerActions.map((item) => (
          <Button
            key={item.label}
            onClick={item.onClick}
            variant={item.variant || 'default'}
            className="hidden sm:flex gap-2"
          >
            {item.icon || <Plus size={18} />}
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
