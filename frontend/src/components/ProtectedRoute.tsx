// src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { can, type PermissionKey } from '../config/permissions';

interface ProtectedRouteProps {
  /**
   * Optional permission key to enforce via the centralized can() helper.
   * Example: 'page.settings.view'.
   * The can() function now checks if ANY of the user's roles has this permission.
   */
  requiredPermission?: PermissionKey;
}

export function ProtectedRoute({ requiredPermission }: ProtectedRouteProps) {
  const { user, initializing } = useAuth();

  if (initializing) {
    // Simple splash while we restore auth state from storage
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Use roles array with fallback to legacy single role (pre-migration)
  const userRoles = (user.roles && user.roles.length > 0) 
    ? user.roles 
    : (user.role ? [user.role] : []);

  // Permission check using user's roles array
  // can() now accepts string[] and checks if ANY role has the permission
  if (requiredPermission && !can(userRoles, requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}