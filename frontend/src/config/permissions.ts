// Discord-style roles and permissions config
// Roles are now dynamic and stored in Firestore

// ============================================================================
// TYPES
// ============================================================================

export type PermissionKey =
  // Page View Permissions (10)
  | 'page.home.view'
  | 'page.inventory.view'
  | 'page.sales.view'
  | 'page.services.view'
  | 'page.transactions.view'
  | 'page.newtransaction.view'
  | 'page.returns.view'
  | 'page.customers.view'
  | 'page.users.view'
  | 'page.settings.view'
  // Inventory Permissions (8)
  | 'inventory.view.purchaseprice'
  | 'inventory.view.archived'
  | 'inventory.add'
  | 'inventory.edit'
  | 'inventory.addstock.multiple'
  | 'inventory.archive'
  | 'inventory.delete'
  | 'inventory.export'
  // Services Permissions (7)
  | 'services.view.archived'
  | 'services.add'
  | 'services.edit'
  | 'services.archive'
  | 'services.delete'
  | 'services.toggle.status'
  | 'services.export'
  // Transactions Permissions (6)
  | 'transactions.create'
  | 'transactions.view.archived'
  | 'transactions.archive'
  | 'transactions.unarchive'
  | 'transactions.delete'
  | 'transactions.export'
  // Returns Permissions (6)
  | 'returns.process'
  | 'returns.view.archived'
  | 'returns.archive'
  | 'returns.unarchive'
  | 'returns.delete'
  | 'returns.export'
  // Customers Permissions (5)
  | 'customers.view.archived'
  | 'customers.add'
  | 'customers.edit'
  | 'customers.archive'
  | 'customers.delete'
  // Users Permissions (6)
  | 'users.view.developer'
  | 'users.view.archived'
  | 'users.edit.any'
  | 'users.edit.self'
  | 'users.archive'
  | 'users.delete'
  // Roles Permissions (6)
  | 'roles.view'
  | 'roles.create'
  | 'roles.edit'
  | 'roles.delete'
  | 'roles.assign'
  | 'roles.set.maxperuser'
  // Settings Permissions (1)
  | 'settings.edit';

// Role document structure (stored in Firestore)
export interface Role {
  id: string;
  name: string;
  color: string;
  position: number; // Lower = higher authority (0 = Developer)
  isDefault: boolean;
  isProtected: boolean; // Cannot be deleted or edited
  permissions: Partial<Record<PermissionKey, boolean>>;
  createdAt: Date;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Special role IDs
export const DEVELOPER_ROLE_ID = 'developer';
export const STAFF_ROLE_ID = 'staff';

// All permission keys grouped by category for UI display
export const permissionGroups: { category: string; permissions: { key: PermissionKey; label: string }[] }[] = [
  {
    category: 'Page Access',
    permissions: [
      { key: 'page.home.view', label: 'Home' },
      { key: 'page.inventory.view', label: 'Inventory' },
      { key: 'page.sales.view', label: 'Sales Records' },
      { key: 'page.services.view', label: 'Services Offered' },
      { key: 'page.transactions.view', label: 'Transaction History' },
      { key: 'page.newtransaction.view', label: 'New Transaction' },
      { key: 'page.returns.view', label: 'Returns & Refunds' },
      { key: 'page.customers.view', label: 'Customers' },
      { key: 'page.users.view', label: 'User Management' },
      { key: 'page.settings.view', label: 'Settings' },
    ],
  },
  {
    category: 'Inventory',
    permissions: [
      { key: 'inventory.view.purchaseprice', label: 'View Purchase Price' },
      { key: 'inventory.view.archived', label: 'View Archived' },
      { key: 'inventory.add', label: 'Add Items' },
      { key: 'inventory.edit', label: 'Edit Items' },
      { key: 'inventory.addstock.multiple', label: 'Add Stock to Multiple' },
      { key: 'inventory.archive', label: 'Archive Items' },
      { key: 'inventory.delete', label: 'Permanently Delete' },
      { key: 'inventory.export', label: 'Export to CSV' },
    ],
  },
  {
    category: 'Services',
    permissions: [
      { key: 'services.view.archived', label: 'View Archived' },
      { key: 'services.add', label: 'Add Services' },
      { key: 'services.edit', label: 'Edit Services' },
      { key: 'services.archive', label: 'Archive Services' },
      { key: 'services.delete', label: 'Permanently Delete' },
      { key: 'services.toggle.status', label: 'Toggle Active/Inactive' },
      { key: 'services.export', label: 'Export to CSV' },
    ],
  },
  {
    category: 'Transactions',
    permissions: [
      { key: 'transactions.create', label: 'Create Transactions' },
      { key: 'transactions.view.archived', label: 'View Archived' },
      { key: 'transactions.archive', label: 'Archive Transactions' },
      { key: 'transactions.unarchive', label: 'Unarchive Transactions' },
      { key: 'transactions.delete', label: 'Permanently Delete' },
      { key: 'transactions.export', label: 'Export to CSV' },
    ],
  },
  {
    category: 'Returns & Refunds',
    permissions: [
      { key: 'returns.process', label: 'Process Returns' },
      { key: 'returns.view.archived', label: 'View Archived' },
      { key: 'returns.archive', label: 'Archive Returns' },
      { key: 'returns.unarchive', label: 'Unarchive Returns' },
      { key: 'returns.delete', label: 'Permanently Delete' },
      { key: 'returns.export', label: 'Export to CSV' },
    ],
  },
  {
    category: 'Customers',
    permissions: [
      { key: 'customers.view.archived', label: 'View Archived' },
      { key: 'customers.add', label: 'Add Customers' },
      { key: 'customers.edit', label: 'Edit Customers' },
      { key: 'customers.archive', label: 'Archive Customers' },
      { key: 'customers.delete', label: 'Permanently Delete' },
    ],
  },
  {
    category: 'Users',
    permissions: [
      { key: 'users.view.developer', label: 'View Developer Account' },
      { key: 'users.view.archived', label: 'View Archived Users' },
      { key: 'users.edit.any', label: 'Edit Any User' },
      { key: 'users.edit.self', label: 'Edit Own Profile' },
      { key: 'users.archive', label: 'Archive Users' },
      { key: 'users.delete', label: 'Permanently Delete' },
    ],
  },
  {
    category: 'Roles',
    permissions: [
      { key: 'roles.view', label: 'View Roles' },
      { key: 'roles.create', label: 'Create Roles' },
      { key: 'roles.edit', label: 'Edit Roles' },
      { key: 'roles.delete', label: 'Delete Roles' },
      { key: 'roles.assign', label: 'Assign Roles to Users' },
      { key: 'roles.set.maxperuser', label: 'Set Max Roles Per User' },
    ],
  },
  {
    category: 'Settings',
    permissions: [
      { key: 'settings.edit', label: 'Edit System Settings' },
    ],
  },
];

// Flat list of all permission keys
export const allPermissionKeys: PermissionKey[] = permissionGroups.flatMap(g => g.permissions.map(p => p.key));

// ============================================================================
// PERMISSION DEPENDENCIES
// ============================================================================

/**
 * Permission prerequisites - if user lacks the key permission, they also lack the dependent permissions.
 * This enforces logical permission hierarchies.
 */
export const permissionDependencies: Partial<Record<PermissionKey, PermissionKey[]>> = {
  // If user lacks page.transactions.view, they also can't access these pages
  'page.transactions.view': [
    'page.returns.view',
    'page.sales.view',
    'page.newtransaction.view',
  ],
  
  // If user lacks transactions.create, they can't access New Transaction page at all
  'transactions.create': [
    'page.newtransaction.view',
  ],
  
  // If user lacks inventory.view.purchaseprice, they can't add/edit inventory
  'inventory.view.purchaseprice': [
    'inventory.add',
    'inventory.edit',
  ],
  
  // If user lacks page.inventory.view, they can't do any inventory actions
  'page.inventory.view': [
    'inventory.view.purchaseprice',
    'inventory.view.archived',
    'inventory.add',
    'inventory.edit',
    'inventory.addstock.multiple',
    'inventory.archive',
    'inventory.delete',
    'inventory.export',
  ],
  
  // If user lacks page.services.view, they can't do any service actions
  'page.services.view': [
    'services.view.archived',
    'services.add',
    'services.edit',
    'services.archive',
    'services.delete',
    'services.toggle.status',
    'services.export',
  ],
  
  // If user lacks page.customers.view, they can't do any customer actions
  'page.customers.view': [
    'customers.view.archived',
    'customers.add',
    'customers.edit',
    'customers.archive',
    'customers.delete',
  ],
  
  // If user lacks page.users.view, they can't do any user management actions
  'page.users.view': [
    'users.view.developer',
    'users.view.archived',
    'users.edit.any',
    'users.edit.self',
    'users.archive',
    'users.delete',
  ],
  
  // If user lacks page.settings.view, they can't manage roles or settings
  'page.settings.view': [
    'roles.view',
    'roles.create',
    'roles.edit',
    'roles.delete',
    'roles.assign',
    'roles.set.maxperuser',
    'settings.edit',
  ],
};

/**
 * Get all prerequisite permissions for a given permission.
 * Returns permissions that MUST be granted for the given permission to be effective.
 */
export function getPrerequisites(permission: PermissionKey): PermissionKey[] {
  const prerequisites: PermissionKey[] = [];
  
  for (const [prereq, dependents] of Object.entries(permissionDependencies)) {
    if (dependents.includes(permission)) {
      prerequisites.push(prereq as PermissionKey);
    }
  }
  
  return prerequisites;
}

// ============================================================================
// RUNTIME STATE
// ============================================================================

// Cached roles loaded from Firestore
let cachedRoles: Role[] = [];

export function setCachedRoles(roles: Role[]) {
  cachedRoles = roles;
}

export function getCachedRoles(): Role[] {
  return cachedRoles;
}

// ============================================================================
// PERMISSION CHECKING
// ============================================================================

// Legacy permission mapping for pre-migration compatibility
// Maps old role names to their default permissions
const legacyRolePermissions: Record<string, PermissionKey[]> = {
  superadmin: allPermissionKeys, // Full access
  admin: [
    'page.home.view', 'page.inventory.view', 'page.sales.view', 'page.services.view',
    'page.transactions.view', 'page.newtransaction.view', 'page.returns.view',
    'page.customers.view', 'page.users.view', 'page.settings.view',
    'inventory.view.purchaseprice', 'inventory.view.archived', 'inventory.add',
    'inventory.edit', 'inventory.addstock.multiple', 'inventory.archive', 'inventory.export',
    'services.view.archived', 'services.add', 'services.edit', 'services.archive', 'services.export',
    'transactions.create', 'transactions.view.archived', 'transactions.archive', 'transactions.export',
    'returns.process', 'returns.view.archived', 'returns.archive', 'returns.unarchive', 'returns.export',
    'customers.view.archived', 'customers.add', 'customers.edit', 'customers.archive',
    'users.view.archived', 'users.edit.any', 'users.edit.self',
    'roles.view', 'settings.edit',
  ],
  employee: [
    'page.home.view', 'page.inventory.view', 'page.sales.view', 'page.services.view',
    'page.transactions.view', 'page.newtransaction.view', 'page.returns.view', 'page.customers.view',
    'inventory.add', 'inventory.edit',
    'services.add', 'services.edit',
    'transactions.create',
    'returns.process',
    'customers.add', 'customers.edit',
    'users.edit.self',
  ],
  mechanic: [
    'page.home.view', 'page.inventory.view', 'page.services.view',
    'page.transactions.view', 'page.returns.view',
    'users.edit.self',
  ],
};

/**
 * Check if a user with the given role IDs has a specific permission.
 * Developer role bypasses all permission checks.
 * Falls back to legacy role permissions if no roles are cached (pre-migration).
 * 
 * @param userRoleIds - Array of role IDs the user has
 * @param permission - The permission key to check
 * @param roles - Optional: array of Role objects (uses cached if not provided)
 * @returns true if any of the user's roles has the permission
 */
export function can(
  userRoleIds: string[] | string | null | undefined,
  permission: PermissionKey,
  roles?: Role[]
): boolean {
  // Handle null/undefined
  if (!userRoleIds) return false;
  
  // Normalize to array (backward compatibility with single role string)
  const roleIds = Array.isArray(userRoleIds) ? userRoleIds : [userRoleIds];
  
  if (roleIds.length === 0) return false;
  
  // Developer role bypasses all permission checks
  if (roleIds.includes(DEVELOPER_ROLE_ID)) return true;
  
  // Check prerequisite permissions first
  // If user lacks a prerequisite, they can't have this permission
  const prerequisites = getPrerequisites(permission);
  for (const prereq of prerequisites) {
    // Recursively check prerequisites (avoid infinite loop by not checking self)
    if (!canDirect(roleIds, prereq, roles)) {
      return false;
    }
  }
  
  // Check the actual permission
  return canDirect(roleIds, permission, roles);
}

/**
 * Direct permission check without prerequisite validation.
 * Used internally to avoid infinite recursion when checking prerequisites.
 */
function canDirect(
  roleIds: string[],
  permission: PermissionKey,
  roles?: Role[]
): boolean {
  // Developer role bypasses all permission checks
  if (roleIds.includes(DEVELOPER_ROLE_ID)) return true;
  
  // Get roles to check against
  const rolesToCheck = roles || cachedRoles;
  
  // Check if any of the user's roles has this permission
  for (const roleId of roleIds) {
    // First, try to find the role in cached roles (new system)
    const role = rolesToCheck.find(r => r.id === roleId);
    if (role && role.permissions[permission] === true) {
      return true;
    }
    
    // If role not found in cache, try legacy role permissions
    // This handles users who haven't been migrated yet
    if (!role) {
      const legacyRole = roleId.toLowerCase();
      const legacyPerms = legacyRolePermissions[legacyRole];
      if (legacyPerms && legacyPerms.includes(permission)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if a user can manage another user based on role hierarchy.
 * Users can only manage users whose highest role position is greater than their own.
 * 
 * @param managerRoleIds - Role IDs of the user trying to manage
 * @param targetRoleIds - Role IDs of the user being managed
 * @param roles - Optional: array of Role objects
 * @returns true if manager can manage target
 */
export function canManageUser(
  managerRoleIds: string[] | null | undefined,
  targetRoleIds: string[] | null | undefined,
  roles?: Role[]
): boolean {
  if (!managerRoleIds || managerRoleIds.length === 0) return false;
  
  // Developer can manage anyone
  if (managerRoleIds.includes(DEVELOPER_ROLE_ID)) return true;
  
  // Cannot manage Developer
  if (targetRoleIds?.includes(DEVELOPER_ROLE_ID)) return false;
  
  const rolesToCheck = roles || cachedRoles;
  
  // Get manager's highest position (lowest number)
  const managerPosition = Math.min(
    ...managerRoleIds.map(id => {
      const role = rolesToCheck.find(r => r.id === id);
      return role ? role.position : Infinity;
    })
  );
  
  // Get target's highest position (lowest number)
  const targetPosition = Math.min(
    ...(targetRoleIds || []).map(id => {
      const role = rolesToCheck.find(r => r.id === id);
      return role ? role.position : Infinity;
    })
  );
  
  // Manager can only manage users with higher position number (lower authority)
  return managerPosition < targetPosition;
}

/**
 * Check if a user can assign a specific role.
 * Users can only assign roles with position greater than their highest role.
 * 
 * @param userRoleIds - Role IDs of the user trying to assign
 * @param roleIdToAssign - The role ID being assigned
 * @param roles - Optional: array of Role objects
 * @returns true if user can assign the role
 */
export function canAssignRole(
  userRoleIds: string[] | null | undefined,
  roleIdToAssign: string,
  roles?: Role[]
): boolean {
  if (!userRoleIds || userRoleIds.length === 0) return false;
  
  // Developer can assign any role
  if (userRoleIds.includes(DEVELOPER_ROLE_ID)) return true;
  
  // Cannot assign Developer role
  if (roleIdToAssign === DEVELOPER_ROLE_ID) return false;
  
  const rolesToCheck = roles || cachedRoles;
  
  // Get user's highest position (lowest number)
  const userPosition = Math.min(
    ...userRoleIds.map(id => {
      const role = rolesToCheck.find(r => r.id === id);
      return role ? role.position : Infinity;
    })
  );
  
  // Get the role being assigned
  const roleToAssign = rolesToCheck.find(r => r.id === roleIdToAssign);
  if (!roleToAssign) return false;
  
  // Can only assign roles with higher position number (lower authority)
  return userPosition < roleToAssign.position;
}

/**
 * Get all permissions a user has based on their roles.
 * Returns a Set of permission keys for efficient lookup.
 * 
 * @param userRoleIds - Array of role IDs the user has
 * @param roles - Optional: array of Role objects
 * @returns Set of permission keys the user has
 */
export function getUserPermissions(
  userRoleIds: string[] | null | undefined,
  roles?: Role[]
): Set<PermissionKey> {
  const permissions = new Set<PermissionKey>();
  
  if (!userRoleIds || userRoleIds.length === 0) return permissions;
  
  // Developer has all permissions
  if (userRoleIds.includes(DEVELOPER_ROLE_ID)) {
    allPermissionKeys.forEach(key => permissions.add(key));
    return permissions;
  }
  
  const rolesToCheck = roles || cachedRoles;
  
  // Collect permissions from all roles
  for (const roleId of userRoleIds) {
    const role = rolesToCheck.find(r => r.id === roleId);
    if (role) {
      for (const [key, value] of Object.entries(role.permissions)) {
        if (value === true) {
          permissions.add(key as PermissionKey);
        }
      }
    }
  }
  
  return permissions;
}

// ============================================================================
// LEGACY SUPPORT (for gradual migration)
// ============================================================================

// Keep old type for backward compatibility during migration
export type RoleName = string;

// Legacy pageViewPermissions for settings page (will be replaced)
export const pageViewPermissions: { key: PermissionKey; label: string }[] = 
  permissionGroups.find(g => g.category === 'Page Access')?.permissions || [];
