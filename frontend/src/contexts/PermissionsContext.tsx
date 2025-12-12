import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, doc, getDoc, getDocsFromServer } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { setCachedRoles, getCachedRoles, type Role, type PermissionKey } from '../config/permissions';

interface RolesContextValue {
  roles: Role[];
  loading: boolean;
  error: string | null;
  maxRolesPerUser: number;
  refreshRoles: () => Promise<void>;
}

const RolesContext = createContext<RolesContextValue | undefined>(undefined);

/**
 * Load all roles from Firestore
 */
async function loadRolesFromFirestore(): Promise<Role[]> {
  try {
    // Use getDocsFromServer to bypass Firestore cache and get fresh data
    const snap = await getDocsFromServer(collection(db, 'roles'));
    if (snap.empty) {
      console.warn('No roles found in Firestore');
      return [];
    }

    const roles: Role[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      roles.push({
        id: docSnap.id,
        name: data.name || docSnap.id,
        color: data.color || '#6b7280',
        position: typeof data.position === 'number' ? data.position : 999,
        isDefault: data.isDefault === true,
        isProtected: data.isProtected === true,
        permissions: (data.permissions || {}) as Partial<Record<PermissionKey, boolean>>,
        createdAt: data.createdAt?.toDate?.() || new Date(),
      });
    });

    // Sort by position (lower = higher authority)
    roles.sort((a, b) => a.position - b.position);

    return roles;
  } catch (err) {
    console.error('Failed to load roles from Firestore', err);
    return [];
  }
}

/**
 * Load system settings for roles
 */
async function loadRolesSettings(): Promise<{ maxRolesPerUser: number }> {
  try {
    const settingsDoc = await getDoc(doc(db, 'systemSettings', 'roles'));
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      return {
        maxRolesPerUser: typeof data.maxRolesPerUser === 'number' ? data.maxRolesPerUser : 5,
      };
    }
    return { maxRolesPerUser: 5 };
  } catch (err) {
    console.error('Failed to load roles settings', err);
    return { maxRolesPerUser: 5 };
  }
}

export function RolesProvider({ children }: { children: ReactNode }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxRolesPerUser, setMaxRolesPerUser] = useState(5);

  const refreshRoles = async () => {
    try {
      setLoading(true);
      setError(null);

      const [loadedRoles, settings] = await Promise.all([
        loadRolesFromFirestore(),
        loadRolesSettings(),
      ]);

      console.log('Setting roles in context:', JSON.stringify(loadedRoles.map(r => ({ id: r.id, permissions: r.permissions })), null, 2));
      setRoles([...loadedRoles]); // Create new array reference to ensure re-render
      setCachedRoles(loadedRoles); // Update global cache for can() function
      setMaxRolesPerUser(settings.maxRolesPerUser);
    } catch (err) {
      console.error('Failed to refresh roles', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshRoles();
  }, []);

  return (
    <RolesContext.Provider value={{ roles, loading, error, maxRolesPerUser, refreshRoles }}>
      {children}
    </RolesContext.Provider>
  );
}

export function useRoles(): RolesContextValue {
  const ctx = useContext(RolesContext);
  if (!ctx) {
    throw new Error('useRoles must be used within a RolesProvider');
  }
  return ctx;
}

/**
 * Helper hook to get a role by ID
 */
export function useRole(roleId: string | undefined): Role | undefined {
  const { roles } = useRoles();
  if (!roleId) return undefined;
  return roles.find(r => r.id === roleId);
}

/**
 * Helper hook to get multiple roles by IDs
 */
export function useUserRoles(roleIds: string[] | undefined): Role[] {
  const { roles } = useRoles();
  if (!roleIds || roleIds.length === 0) return [];
  return roles.filter(r => roleIds.includes(r.id));
}

// ============================================================================
// LEGACY EXPORTS (for backward compatibility during migration)
// ============================================================================

// Keep old context name as alias
export const PermissionsProvider = RolesProvider;
export const usePermissions = () => {
  const { roles, loading, error } = useRoles();
  return {
    roles,
    loading,
    error,
    // Legacy properties (deprecated)
    effectivePermissions: {} as Record<PermissionKey, string[]>,
    usingDefaultsOnly: roles.length === 0,
  };
};
