import { useNavigate } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AuthTabsProps {
  value: 'login' | 'register';
}

// Sign in / Sign up are separate routes, so the tabs navigate instead of swapping local state
export function AuthTabs({ value }: AuthTabsProps) {
  const navigate = useNavigate();

  return (
    <Tabs value={value} onValueChange={(next: string) => navigate(`/${next}`)}>
      <TabsList className="w-full">
        <TabsTrigger value="login">Sign in</TabsTrigger>
        <TabsTrigger value="register">Sign up</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
