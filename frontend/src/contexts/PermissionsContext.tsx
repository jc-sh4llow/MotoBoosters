import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { defaultPermissions, type PermissionKey, type RoleName, setRuntimePermissions } from '../config/permissions';

interface PermissionsContextValue {
  effectivePermissions: Record<PermissionKey, RoleName[]>;
  loading: boolean;
  error: string | null;
  usingDefaultsOnly: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

const buildBaseFromDefaults = (): Record<PermissionKey, RoleName[]> => {
  const base: Record<PermissionKey, RoleName[]> = {} as any;
  (Object.keys(defaultPermissions) as PermissionKey[]).forEach((key) => {
    base[key] = [...defaultPermissions[key]];
  });
  return base;
};

async function loadPermissionsFromFirestore(): Promise<Record<PermissionKey, RoleName[]> | null> {
  try {
    const snap = await getDocs(collection(db, 'rolePermissions'));
    if (snap.empty) {
      return null;
    }

    const effective = buildBaseFromDefaults();

    snap.forEach((docSnap) => {
      const role = (docSnap.id || '').toString().toLowerCase() as RoleName;
      if (!role) return;
      const data = docSnap.data() as Record<string, unknown>;

      Object.entries(data).forEach(([key, value]) => {
        const permissionKey = key as PermissionKey;
        if (!(permissionKey in defaultPermissions)) return;

        const allowed = effective[permissionKey] || [];
        const normalizedRole = role.toLowerCase();
        const alreadyIncluded = allowed.some((r) => String(r).toLowerCase() === normalizedRole);
        const shouldAllow = Boolean(value);

        if (shouldAllow && !alreadyIncluded) {
          allowed.push(role);
          effective[permissionKey] = allowed;
        }

        if (!shouldAllow && alreadyIncluded) {
          effective[permissionKey] = allowed.filter((r) => String(r).toLowerCase() !== normalizedRole);
        }
      });
    });

    return effective;
  } catch (err) {
    console.error('Failed to load role permissions from Firestore', err);
    return null;
  }
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PermissionsContextValue>(() => ({
    effectivePermissions: buildBaseFromDefaults(),
    loading: true,
    error: null,
    usingDefaultsOnly: true,
  }));

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const overrides = await loadPermissionsFromFirestore();

      if (!isMounted) return;

      if (!overrides) {
        // Firestore not configured or failed -> stick with defaults
        setRuntimePermissions(null);
        setState({
          effectivePermissions: buildBaseFromDefaults(),
          loading: false,
          error: null,
          usingDefaultsOnly: true,
        });
        return;
      }

      setRuntimePermissions(overrides);
      setState({
        effectivePermissions: overrides,
        loading: false,
        error: null,
        usingDefaultsOnly: false,
      });
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PermissionsContext.Provider value={state}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return ctx;
}
