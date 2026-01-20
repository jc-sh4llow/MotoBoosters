import { can } from '../config/permissions';

interface DebugLogState {
  hasPermission: boolean | null;
  isChecking: boolean;
  queuedLogs: Array<{ type: 'log' | 'error' | 'warn'; args: any[] }>;
  effectiveRoleIds: string[];
}

const debugState: DebugLogState = {
  hasPermission: null,
  isChecking: false,
  queuedLogs: [],
  effectiveRoleIds: [],
};

/**
 * Initialize debug permission state with user's effective role IDs
 * This should be called from a React component that has access to useEffectiveRoleIds
 */
export function initDebugPermission(effectiveRoleIds: string[]): void {
  debugState.effectiveRoleIds = effectiveRoleIds;
  debugState.hasPermission = can(effectiveRoleIds, 'debug.tools.access');
  
  // Process queued logs if permission granted
  if (debugState.hasPermission) {
    debugState.queuedLogs.forEach(log => {
      console[log.type](...log.args);
    });
    debugState.queuedLogs = [];
  } else {
    // Clear queue if no permission
    debugState.queuedLogs = [];
  }
}

/**
 * Debug logging utility that only logs if user has debug permission
 */
export function debugLog(message?: any, ...optionalParams: any[]): void {
  if (debugState.hasPermission === true) {
    console.log(message, ...optionalParams);
    return;
  }
  
  if (debugState.hasPermission === false) {
    return;
  }
  
  // Permission not checked yet, queue the log
  debugState.queuedLogs.push({ type: 'log', args: [message, ...optionalParams] });
}

/**
 * Debug error logging utility
 */
export function debugError(message?: any, ...optionalParams: any[]): void {
  if (debugState.hasPermission === true) {
    console.error(message, ...optionalParams);
    return;
  }
  
  if (debugState.hasPermission === false) {
    return;
  }
  
  debugState.queuedLogs.push({ type: 'error', args: [message, ...optionalParams] });
}

/**
 * Debug warning logging utility
 */
export function debugWarn(message?: any, ...optionalParams: any[]): void {
  if (debugState.hasPermission === true) {
    console.warn(message, ...optionalParams);
    return;
  }
  
  if (debugState.hasPermission === false) {
    return;
  }
  
  debugState.queuedLogs.push({ type: 'warn', args: [message, ...optionalParams] });
}

/**
 * Reset permission cache (useful for login/logout)
 */
export function resetDebugPermissionCache(): void {
  debugState.hasPermission = null;
  debugState.isChecking = false;
  debugState.queuedLogs = [];
  debugState.effectiveRoleIds = [];
}
