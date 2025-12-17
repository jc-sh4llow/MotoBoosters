// src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { can, type PermissionKey } from '../config/permissions';
import { useEffectiveRoleIds } from '../hooks/useEffectiveRoleIds';
import { useRolePreview } from '../contexts/RolePreviewContext';

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
  const { effectiveRoleIds } = useEffectiveRoleIds();
  const { enabled: previewEnabled } = useRolePreview();

  if (initializing) {
    // Simple splash while we restore auth state from storage
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Permission check using effective roles (respects role preview)
  // can() checks if ANY role has the permission
  if (requiredPermission && !can(effectiveRoleIds, requiredPermission)) {
    // When in preview mode, show a styled "Not Allowed" page instead of redirecting
    // When not previewing, redirect to home (existing behavior for URL guessing)
    if (previewEnabled) {
      return <NotAllowedPage />;
    }
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

// Styled "Not Allowed" page shown when role preview denies access
function NotAllowedPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(109deg, #1e88e5 0%, #1e88e5 50%, #0d47a1 50%, #0d47a1 100%)',
      backgroundSize: 'cover',
      backgroundAttachment: 'fixed',
      padding: '2rem'
    }}>
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '1rem',
        padding: '3rem',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        maxWidth: '500px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: '1rem',
          color: '#dc2626'
        }}>
          🚫
        </div>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          color: '#1e40af',
          marginBottom: '1rem'
        }}>
          Access Denied
        </h1>
        <p style={{
          color: '#6b7280',
          fontSize: '1rem',
          lineHeight: '1.6',
          marginBottom: '1.5rem'
        }}>
          The role you are previewing does not have permission to access this page.
        </p>
        <p style={{
          color: '#9ca3af',
          fontSize: '0.875rem',
          fontStyle: 'italic'
        }}>
          Exit role preview or switch to a different role to access this content.
        </p>
      </div>
    </div>
  );
}