import { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Inventory Manager</h1>
        </div>
        <div className="bg-white py-8 px-6 shadow rounded-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
