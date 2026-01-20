import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Home } from './pages/home';
import { Settings } from './pages/settings';
import { Transactions } from './pages/transactions';
import { Services } from './pages/servicesoffered';
import { Sales } from './pages/sales';
import { Inventory } from './pages/inventory';
import { Users } from './pages/users';
import { Customers } from './pages/customers';
import { Returns } from './pages/returns';
import { AuthProvider } from './contexts/AuthContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { RolePreviewProvider } from './contexts/RolePreviewContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TutorialProvider } from './contexts/TutorialContext';
import { RolePreviewBanner } from './components/RolePreviewBanner';
import { DebugInitializer } from './components/DebugInitializer';
import { Login } from './pages/auth/login';
import { SignUp } from './pages/auth/signup';
import { ProtectedRoute } from './components/ProtectedRoute';
import { NewTransaction } from './pages/transactions/NewTransaction';

const queryClient = new QueryClient();

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PermissionsProvider>
          <RolePreviewProvider>
            <TutorialProvider>
              <QueryClientProvider client={queryClient}>
                <Router>
                  <DebugInitializer />
                  <RolePreviewBanner />
                  <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<SignUp />} />

                  {/* Protected Routes - any authenticated user for main pages */}
                  <Route element={<ProtectedRoute />}>
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/customers" element={<Customers />} />
                    <Route path="/returns" element={<Returns />} />
                    <Route path="/transactions/new" element={<NewTransaction />} />
                    <Route path="/transactions" element={<Transactions />} />
                    <Route path="/users" element={<Users />} />
                  </Route>

                  {/* Settings - only roles allowed by page.settings.view (superadmin/admin) */}
                  <Route element={<ProtectedRoute requiredPermission="page.settings.view" />}>
                    <Route path="/settings" element={<Settings />} />
                  </Route>

                  <Route path="*" element={<div>404 - Not Found</div>} />
                </Routes>
              </Router>
            </QueryClientProvider>
          </TutorialProvider>
          </RolePreviewProvider>
        </PermissionsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;