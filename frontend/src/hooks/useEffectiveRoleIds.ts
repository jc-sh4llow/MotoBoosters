import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRolePreview } from '../contexts/RolePreviewContext';

export function useEffectiveRoleIds() {
  const { user } = useAuth();
  const { enabled: previewEnabled, previewRoleId } = useRolePreview();

  const actualRoleIds = useMemo(() => {
    if (!user) return [];
    if (user.roles && user.roles.length > 0) return user.roles;
    if (user.role) return [user.role];
    return [];
  }, [user]);

  const effectiveRoleIds = useMemo(() => {
    if (previewEnabled && previewRoleId) return [previewRoleId];
    return actualRoleIds;
  }, [previewEnabled, previewRoleId, actualRoleIds]);

  return { actualRoleIds, effectiveRoleIds, previewEnabled, previewRoleId };
}
