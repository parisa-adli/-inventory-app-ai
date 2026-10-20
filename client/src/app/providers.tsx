import { ComponentProps, ReactNode, ScriptHTMLAttributes } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { queryClient } from './queryClient';

// next-themes is hoisted to the root node_modules, where @types/react (client-only) is not
// visible, so its props type loses `children` and `scriptProps`; add them back here.
const ThemeProvider = NextThemesProvider as (
  props: Omit<ComponentProps<typeof NextThemesProvider>, 'scriptProps'> & {
    children: ReactNode;
    scriptProps?: ScriptHTMLAttributes<HTMLScriptElement>;
  }
) => ReactNode;

export default function Providers({ children }: { children: ReactNode }) {
  return (
    // Light by default (docs/DESIGN.md §1). index.html applies the stored choice before first paint;
    // next-themes' own script only runs when server-rendered, so mark it a data block (React 19 warns otherwise).
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      scriptProps={{ type: 'application/json' }}
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
