// src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { can, type PermissionKey } from '../config/permissions';

interface ProtectedRouteProps {
  /**
   * Legacy role-based restriction. If provided, user.role must be in this list.
   * Prefer using requiredPermission for new code so everything flows through
   * the centralized permissions.ts config.
   */
  allowedRoles?: string[];

  /**
   * Optional permission key to enforce via the centralized can() helper.
   * Example: 'page.settings.view'.
   */
  requiredPermission?: PermissionKey;
}

export function ProtectedRoute({ allowedRoles, requiredPermission }: ProtectedRouteProps) {
  const { user, initializing } = useAuth();

  if (initializing) {
    // Simple splash while we restore auth state from storage
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 1) Legacy role list support (kept for backward compatibility)
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // 2) Centralized permission check when requiredPermission is specified
  if (requiredPermission && !can(user.role, requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}