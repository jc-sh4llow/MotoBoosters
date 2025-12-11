// One-time migration script to set up Discord-style roles
// This creates the roles collection and updates users from role -> roles array

import { collection, doc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DEVELOPER_ROLE_ID, STAFF_ROLE_ID, type PermissionKey } from '../config/permissions';

// Default permissions for Staff role (basic access)
const staffPermissions: Partial<Record<PermissionKey, boolean>> = {
  // Page Access
  'page.home.view': true,
  'page.inventory.view': true,
  'page.services.view': true,
  'page.transactions.view': true,
  'page.newtransaction.view': true,
  'page.returns.view': true,
  'page.customers.view': true,
  // Basic actions
  'inventory.edit': true,
  'services.edit': true,
  'transactions.create': true,
  'returns.process': true,
  'customers.add': true,
  'customers.edit': true,
  'users.edit.self': true,
};

export interface MigrationResult {
  success: boolean;
  message: string;
  details: {
    rolesCreated: string[];
    usersUpdated: number;
    errors: string[];
  };
}

export async function migrateToDiscordRoles(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    message: '',
    details: {
      rolesCreated: [],
      usersUpdated: 0,
      errors: [],
    },
  };

  try {
    // Step 1: Create Developer role
    const developerRoleRef = doc(db, 'roles', DEVELOPER_ROLE_ID);
    await setDoc(developerRoleRef, {
      name: 'Developer',
      color: '#ef4444', // Red
      position: 0, // Highest authority
      isDefault: false,
      isProtected: true, // Cannot be deleted or edited
      permissions: {}, // Developer bypasses all checks, no need to list permissions
      createdAt: serverTimestamp(),
    });
    result.details.rolesCreated.push('Developer');

    // Step 2: Create Staff role (default)
    const staffRoleRef = doc(db, 'roles', STAFF_ROLE_ID);
    await setDoc(staffRoleRef, {
      name: 'Staff',
      color: '#3b82f6', // Blue
      position: 100, // Low priority
      isDefault: true, // Auto-assigned to new users
      isProtected: false, // Can edit permissions, but cannot delete (it's default)
      permissions: staffPermissions,
      createdAt: serverTimestamp(),
    });
    result.details.rolesCreated.push('Staff');

    // Step 3: Create system settings for roles
    const settingsRef = doc(db, 'systemSettings', 'roles');
    await setDoc(settingsRef, {
      maxRolesPerUser: 5,
      updatedAt: serverTimestamp(),
    });

    // Step 4: Update all users from role -> roles array
    const usersSnapshot = await getDocs(collection(db, 'users'));
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const username = userData.username || '';
      const oldRole = userData.role || '';
      
      // Determine which role(s) to assign
      let newRoles: string[] = [];
      
      if (username.toLowerCase() === 'superadmin') {
        // Your account -> Developer
        newRoles = [DEVELOPER_ROLE_ID];
      } else if (username.toLowerCase() === 'mdhernandez') {
        // Client's account -> Staff
        newRoles = [STAFF_ROLE_ID];
      } else if (oldRole.toLowerCase() === 'superadmin') {
        // Any other superadmin -> Developer (just in case)
        newRoles = [DEVELOPER_ROLE_ID];
      } else {
        // Everyone else -> Staff
        newRoles = [STAFF_ROLE_ID];
      }
      
      try {
        await updateDoc(doc(db, 'users', userDoc.id), {
          roles: newRoles,
          // Keep old role field for now (backward compatibility during migration)
          // role: oldRole, // Don't delete yet
        });
        result.details.usersUpdated++;
      } catch (err) {
        result.details.errors.push(`Failed to update user ${username}: ${err}`);
      }
    }

    // Step 5: Delete old rolePermissions collection (optional - can do manually)
    // We'll leave this for manual cleanup to be safe

    result.success = true;
    result.message = `Migration complete! Created ${result.details.rolesCreated.length} roles, updated ${result.details.usersUpdated} users.`;
    
  } catch (err) {
    result.success = false;
    result.message = `Migration failed: ${err}`;
    result.details.errors.push(String(err));
  }

  return result;
}

// Check if migration has already been done
export async function checkMigrationStatus(): Promise<{
  migrated: boolean;
  rolesExist: boolean;
  usersHaveRolesArray: boolean;
}> {
  try {
    // Check if roles collection exists
    const rolesSnapshot = await getDocs(collection(db, 'roles'));
    const rolesExist = !rolesSnapshot.empty;
    
    // Check if any user has roles array
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let usersHaveRolesArray = false;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      if (Array.isArray(userData.roles) && userData.roles.length > 0) {
        usersHaveRolesArray = true;
        break;
      }
    }
    
    return {
      migrated: rolesExist && usersHaveRolesArray,
      rolesExist,
      usersHaveRolesArray,
    };
  } catch (err) {
    console.error('Failed to check migration status:', err);
    return {
      migrated: false,
      rolesExist: false,
      usersHaveRolesArray: false,
    };
  }
}
