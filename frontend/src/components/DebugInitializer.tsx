import { useEffect } from 'react';
import { useEffectiveRoleIds } from '../hooks/useEffectiveRoleIds';
import { initDebugPermission } from '../utils/debugLog';

export function DebugInitializer() {
  const { effectiveRoleIds } = useEffectiveRoleIds();
  
  useEffect(() => {
    initDebugPermission(effectiveRoleIds);
  }, [effectiveRoleIds]);
  
  return null;
}
