// Centralized roles and permissions config (static for now)

export type RoleName = 'superadmin' | 'admin' | 'employee' | 'mechanic' | (string & {});

export type PermissionKey =
  | 'page.home.view'
  | 'page.inventory.view'
  | 'page.sales.view'
  | 'page.services.view'
  | 'page.transactions.view'
  | 'page.returns.view'
  | 'page.customers.view'
  | 'page.users.view'
  | 'page.settings.view'
  | 'transactions.delete'
  | 'users.edit.any'
  | 'users.edit.self'
  | 'users.delete'
  | 'returns.process'
  | 'returns.archive'
  | 'returns.unarchive'
  | 'inventory.add'
  | 'services.add';

export const roleLevels: Record<RoleName, number> = {
  superadmin: 1,
  admin: 2,
  employee: 3,
  mechanic: 4,
};

export const defaultPermissions: Record<PermissionKey, RoleName[]> = {
  'page.home.view': ['superadmin', 'admin', 'employee', 'mechanic'],
  'page.inventory.view': ['superadmin', 'admin', 'employee', 'mechanic'],
  'page.sales.view': ['superadmin', 'admin', 'employee'],
  'page.services.view': ['superadmin', 'admin', 'employee', 'mechanic'],
  'page.transactions.view': ['superadmin', 'admin', 'employee', 'mechanic'],
  'page.returns.view': ['superadmin', 'admin', 'employee', 'mechanic'],
  'page.customers.view': ['superadmin', 'admin', 'employee'],
  'page.users.view': ['superadmin', 'admin'],
  'page.settings.view': ['superadmin', 'admin'],
  'transactions.delete': ['superadmin', 'admin'],
  'users.edit.any': ['superadmin', 'admin'],
  'users.edit.self': ['employee', 'mechanic'],
  'users.delete': ['superadmin', 'admin'],
  // Returns & Refunds actions
  // Superadmins: Archive, Unarchive, Process Returns
  // Admins: Delete (Archive), Process Returns
  // Employees: Process Returns
  // Mechanics: view-only (no action permissions)
  'returns.process': ['superadmin', 'admin', 'employee'],
  'returns.archive': ['superadmin', 'admin'],
  'returns.unarchive': ['superadmin'],
  // Inventory & Services actions
  // Who can add inventory/services entries via their respective pages
  'inventory.add': ['superadmin', 'admin'],
  'services.add': ['superadmin', 'admin'],
};

let runtimePermissions: Record<PermissionKey, RoleName[]> | null = null;

export function setRuntimePermissions(effective: Record<PermissionKey, RoleName[]> | null) {
  runtimePermissions = effective;
}

function getEffectivePermissions(): Record<PermissionKey, RoleName[]> {
  if (runtimePermissions) {
    return runtimePermissions;
  }
  return defaultPermissions;
}

export const pageViewPermissions: { key: PermissionKey; label: string }[] = [
  { key: 'page.home.view', label: 'Home' },
  { key: 'page.inventory.view', label: 'Inventory' },
  { key: 'page.sales.view', label: 'Sales Records' },
  { key: 'page.services.view', label: 'Services Offered' },
  { key: 'page.transactions.view', label: 'New Transaction / History' },
  { key: 'page.returns.view', label: 'Returns & Refunds' },
  { key: 'page.customers.view', label: 'Customers' },
  { key: 'page.users.view', label: 'User Management' },
  { key: 'page.settings.view', label: 'Settings' },
];

export function can(role: RoleName | null | undefined, permission: PermissionKey): boolean {
  if (!role) return false;
  const normalized = String(role).toLowerCase();
  const effective = getEffectivePermissions();
  const allowed = effective[permission] || [];
  return allowed.some(r => String(r).toLowerCase() === normalized);
}
