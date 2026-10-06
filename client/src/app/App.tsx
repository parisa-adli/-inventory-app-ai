import { BrowserRouter } from 'react-router';
import Providers from './providers';
import AppRoutes from './router';

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  );
}
