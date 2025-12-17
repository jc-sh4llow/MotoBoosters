import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { useRoles } from './PermissionsContext';
import { can, DEVELOPER_ROLE_ID } from '../config/permissions';

type RolePreviewSnapshot = {
  enabled: boolean;
  previewRoleId: string | null;
};

type RolePreviewContextValue = {
  enabled: boolean;
  previewRoleId: string | null;
  startPreview: (roleId: string) => void;
  stopPreview: () => void;
  setPreviewRoleId: (roleId: string | null) => void;
};

const RolePreviewContext = createContext<RolePreviewContextValue | null>(null);

const STORAGE_KEY = 'motobooster_role_preview';

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();

  const [enabled, setEnabled] = useState(false);
  const [previewRoleId, setPreviewRoleIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Partial<RolePreviewSnapshot>;
      const storedRoleId = typeof parsed.previewRoleId === 'string' ? parsed.previewRoleId : null;
      const storedEnabled = parsed.enabled === true && !!storedRoleId;

      setPreviewRoleIdState(storedRoleId);
      setEnabled(storedEnabled);
    } catch (err) {
      console.error('Failed to read role preview from sessionStorage', err);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      if (!enabled && !previewRoleId) {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        const snapshot: RolePreviewSnapshot = { enabled, previewRoleId };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      }
    } catch (err) {
      console.error('Failed to persist role preview to sessionStorage', err);
    }
  }, [enabled, previewRoleId, hydrated]);

  const setPreviewRoleId = useCallback((roleId: string | null) => {
    setPreviewRoleIdState(roleId);
    if (!roleId) setEnabled(false);
  }, []);

  const startPreview = useCallback((roleId: string) => {
    setPreviewRoleIdState(roleId);
    setEnabled(true);
  }, []);

  const stopPreview = useCallback(() => {
    setEnabled(false);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (initializing) return;

    if (!user) {
      if (enabled || previewRoleId) {
        setEnabled(false);
        setPreviewRoleIdState(null);
      }
      return;
    }

    const actualRoleIds =
      user.roles && user.roles.length > 0 ? user.roles : user.role ? [user.role] : [];

    const isActualDeveloper = actualRoleIds.includes(DEVELOPER_ROLE_ID);

    if (previewRoleId === DEVELOPER_ROLE_ID && !isActualDeveloper) {
      setEnabled(false);
      setPreviewRoleIdState(null);
      return;
    }

    if (!enabled) return;

    if (!previewRoleId) {
      setEnabled(false);
      return;
    }

    if (rolesLoading) return;

    if (!can(actualRoleIds, 'roles.view', roles)) {
      setEnabled(false);
      setPreviewRoleIdState(null);
      return;
    }

    const previewRole = roles.find((r) => r.id === previewRoleId);
    if (!previewRole) {
      setEnabled(false);
      setPreviewRoleIdState(null);
      return;
    }

    const actualPositions = actualRoleIds.map((id) => {
      if (id === DEVELOPER_ROLE_ID) return 0;
      const role = roles.find((r) => r.id === id);
      return typeof role?.position === 'number' ? role.position : Infinity;
    });

    const myTopPosition = Math.min(...actualPositions);
    const previewPosition = previewRoleId === DEVELOPER_ROLE_ID ? 0 : previewRole.position;

    if (previewPosition < myTopPosition) {
      setEnabled(false);
      setPreviewRoleIdState(null);
    }
  }, [hydrated, initializing, user, enabled, previewRoleId, rolesLoading, roles]);

  const value = useMemo<RolePreviewContextValue>(
    () => ({
      enabled,
      previewRoleId,
      startPreview,
      stopPreview,
      setPreviewRoleId,
    }),
    [enabled, previewRoleId, startPreview, stopPreview, setPreviewRoleId]
  );

  return <RolePreviewContext.Provider value={value}>{children}</RolePreviewContext.Provider>;
}

export function useRolePreview() {
  const ctx = useContext(RolePreviewContext);
  if (!ctx) {
    throw new Error('useRolePreview must be used within a RolePreviewProvider');
  }
  return ctx;
}
