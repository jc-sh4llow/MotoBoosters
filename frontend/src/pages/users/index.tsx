import { useState, useEffect } from 'react';
import { FaBars, FaSearch, FaTimes, FaFilter, FaChevronDown, FaEye, FaEyeSlash, FaFileExcel } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useRoles } from '../../contexts/PermissionsContext';
import { can, type Role } from '../../config/permissions';
import logo from '../../assets/logo.png';

import bcrypt from 'bcryptjs';
import { HeaderDropdown } from '../../components/HeaderDropdown';
import { RoleBadge } from '../../components/RoleBadge';
import Switch from '../../components/ui/Switch';

async function hashPassword(raw: string): Promise<string> {
  const normalized = raw.trim();
  if (!normalized) return '';

  try {
    const saltRounds = 10;
    return await bcrypt.hash(normalized, saltRounds);
  } catch (err) {
    // Fallback: avoid breaking save flows if hashing fails for any reason.
    return normalized;
  }
}

type UserRow = {
  id: string; // Firestore document ID
  displayId: string; // Business user ID (e.g., ADM-MJ)
  username: string;
  fullName: string;
  email: string;
  contactNumber: string;
  role: string; // Legacy single role field
  roles?: string[]; // New multi-role field
  status: string;
  lastLogin: string;
  password: string; // Plain password kept temporarily for compatibility
  passwordHash?: string; // Hashed password for secure verification
  archived?: boolean;
};

export function Users() {

  const [isUserDetailsExpanded, setIsUserDetailsExpanded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isConfirmFocused, setIsConfirmFocused] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { roles: firestoreRoles, loading: rolesLoading } = useRoles();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const userRoles = user?.roles?.length ? user.roles : (user?.role ? [user.role] : []);
  let closeMenuTimeout: number | undefined;
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showArchivedFilter, setShowArchivedFilter] = useState(false);

  // Multi-role selection for user details form
  const [selectedRolesForUser, setSelectedRolesForUser] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    docId: '', // Firestore document ID
    userId: '', // Business ID (e.g. ADM-MJ)
    username: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    email: '',
    contactNumber: '',
    status: 'active',
    role: 'employee',
    dateCreated: new Date().toISOString().split('T')[0]
  });

  const [users, setUsers] = useState<UserRow[]>([]);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [passwordUnlockedForRowId, setPasswordUnlockedForRowId] = useState<string | null>(null);
  const [selectedUserRow, setSelectedUserRow] = useState<UserRow | null>(null);
  const [showPasswordConfirmModal, setShowPasswordConfirmModal] = useState(false);
  const [passwordConfirmInput, setPasswordConfirmInput] = useState('');
  const [passwordConfirmError, setPasswordConfirmError] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const [sortState, setSortState] = useState<{
    column: 'id' | 'username' | 'fullName' | 'email' | 'role' | 'status' | 'lastLogin' | null;
    direction: 'asc' | 'desc';
    fullNameMode: 'first' | 'last';
  }>({
    column: null,
    direction: 'asc',
    fullNameMode: 'first',
  });

  const currentUsername = user?.name ?? '';
  const [isEditing, setIsEditing] = useState(false);
  const isAdminLike = can(userRoles, 'users.edit.any');

  const canEditUserDetailsBase = isAdminLike; // Users with edit.any permission
  // Non-admins can edit only their own details when in edit mode
  const isSelfEditing = !isAdminLike &&
    isEditing &&
    selectedUserRow &&
    (selectedUserRow.username === currentUsername || selectedUserRow.fullName === currentUsername);
  const canEditUserDetails = (isAdminLike && isEditing) || !!isSelfEditing;

  const canSeePasswords = isAdminLike || !!isSelfEditing; // Users with edit.any permission or self-editing user see password fields
  const isOtherUserRowForAdmin =
    isAdminLike &&
    !!selectedUserRow &&
    !!formData.docId &&
    selectedUserRow.id === formData.docId &&
    selectedUserRow.username !== currentUsername &&
    selectedUserRow.fullName !== currentUsername;
  const showRowActions = true; // Everyone sees Actions column; buttons are filtered per row

  const [confirmState, setConfirmState] = useState<{
    type: 'save' | 'delete' | null;
    targetUserId?: string;
  } | null>(null);

  const [statusConfirmState, setStatusConfirmState] = useState<{
    mode: 'table' | 'details';
    userId?: string;
    nextStatus?: 'Active' | 'Inactive';
  } | null>(null);

  const [statusChangeConfirmed, setStatusChangeConfirmed] = useState(false);

  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
    userId: string;
    previousRole: string;
    nextRole: string;
  } | null>(null);

  const [usersAlert, setUsersAlert] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const generateUserId = (fullName: string, role: string) => {
    if (!fullName) return '';

    const initials = fullName
      .split(' ')
      .filter(Boolean)
      .map(part => part[0]?.toUpperCase() || '')
      .join('');

    if (!role) return `NEW-${initials}`;

    const rolePrefix = role.slice(0, 3).toUpperCase();
    return `${rolePrefix}-${initials}`;
  };

  const getHighestAuthorityRoleId = (roleIds: string[], availableRoles: Role[]) => {
    if (!roleIds || roleIds.length === 0) return '';

    const roleMap = new Map(availableRoles.map(r => [r.id, r]));
    const sorted = [...roleIds].sort((a, b) => {
      const aPos = roleMap.get(a)?.position ?? 9999;
      const bPos = roleMap.get(b)?.position ?? 9999;
      return aPos - bPos;
    });
    return sorted[0] ?? '';
  };

  const normalizeRoleIdsByAuthority = (roleIds: string[], availableRoles: Role[]) => {
    const roleMap = new Map(availableRoles.map(r => [r.id, r]));
    return [...roleIds].sort((a, b) => {
      const aPos = roleMap.get(a)?.position ?? 9999;
      const bPos = roleMap.get(b)?.position ?? 9999;
      return aPos - bPos;
    });
  };

  const setRolesAndSyncIds = (nextRoleIds: string[]) => {
    const normalizedRoles = normalizeRoleIdsByAuthority(nextRoleIds, firestoreRoles);
    setSelectedRolesForUser(normalizedRoles);

    const primaryRoleId = getHighestAuthorityRoleId(normalizedRoles, firestoreRoles);
    setFormData(prev => {
      const nextRole = primaryRoleId;
      const nextUserId = generateUserId(prev.fullName, nextRole);
      if (prev.role === nextRole && prev.userId === nextUserId) return prev;
      return {
        ...prev,
        role: nextRole,
        userId: nextUserId,
      };
    });
  };

  const handlePasswordFieldFocus = () => {
    if (!canSeePasswords || !canEditUserDetails) return;

    const currentDocId = formData.docId;
    if (!currentDocId) return;

    const targetRow = users.find(u => u.id === currentDocId);
    if (!targetRow) return;

    const isSelf =
      targetRow.username === currentUsername ||
      targetRow.fullName === currentUsername;

    // If already unlocked for this row, allow normal editing
    if (passwordUnlockedForRowId === currentDocId) {
      return;
    }

    if (isSelf) {
      // For own account, unlock immediately but DO NOT load stored password
      setPasswordUnlockedForRowId(currentDocId);
      setFormData(prev => ({
        ...prev,
        password: '',
        confirmPassword: '',
      }));
      setPasswordDirty(false);
      return;
    }

    // For other users, require confirmation before unlocking password field
    setSelectedUserRow(targetRow);
    setPasswordConfirmInput('');
    setPasswordConfirmError('');
    setShowPasswordConfirmModal(true);
  };

  const handleSelectUser = (row: UserRow) => {
    setSelectedUserRow(row);

    const normalizedRoles = normalizeRoleIdsByAuthority(
      row.roles || (row.role ? [row.role] : []),
      firestoreRoles,
    );
    const primaryRoleId = getHighestAuthorityRoleId(normalizedRoles, firestoreRoles) || row.role || '';

    setFormData(prev => ({
      ...prev,
      docId: row.id,
      userId: row.displayId,
      username: row.username,

      // Start with placeholder dots; actual password will only be revealed
      // after confirmation (for other users) or via eye toggle (for self).
      password: '••••••••',
      confirmPassword: '••••••••',
      fullName: row.fullName,
      email: row.email,
      contactNumber: row.contactNumber,
      status: row.status.toLowerCase() === 'active' ? 'active' : 'inactive',
      role: primaryRoleId || prev.role,
    }));
    // Populate selectedRolesForUser from the user's roles array
    setSelectedRolesForUser(normalizedRoles);
    setIsUserDetailsExpanded(true);
    setIsEditing(false);
    setPasswordDirty(false);
    setPasswordUnlockedForRowId(null);
    setStatusChangeConfirmed(false);
  };

  const handleRoleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextRole = e.target.value;

    setRolesAndSyncIds([nextRole]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value } as typeof prev;

      if (name === 'password' || name === 'confirmPassword') {
        const placeholder = '••••••••';
        // If still on placeholder, first keystroke replaces dots entirely
        if (!passwordDirty && prev.password === placeholder && prev.confirmPassword === placeholder) {
          next.password = name === 'password' ? value : '';
          next.confirmPassword = name === 'confirmPassword' ? value : '';
        }
      }

      // Auto-generate userId when fullName changes
      if (name === 'fullName') {
        const primaryRoleId = getHighestAuthorityRoleId(selectedRolesForUser, firestoreRoles) || formData.role;
        next.userId = generateUserId(value, primaryRoleId);
      }

      return next;
    });

    if (name === 'password' || name === 'confirmPassword') {
      setPasswordDirty(true);
    }
  };

  const loadUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const loadedUsers = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as any;
        const docRoleIds: string[] = Array.isArray(data.roles) ? data.roles : (data.role ? [data.role] : []);
        const primaryRoleId = getHighestAuthorityRoleId(docRoleIds, firestoreRoles) || (data.role ?? '');
        return {
          id: docSnap.id,
          displayId: data.userId ?? (generateUserId(data.fullName ?? '', primaryRoleId) || docSnap.id),
          username: data.username ?? '',
          fullName: data.fullName ?? '',
          email: data.email ?? '',
          contactNumber: data.contactNumber ?? '',
          role: primaryRoleId,
          roles: docRoleIds,
          // Normalize stored status to a consistent display value
          status: (data.status ?? '').toString().trim() || '',
          lastLogin: data.lastLogin ?? '',
          password: data.password ?? '',
          passwordHash: data.passwordHash ?? '',

          archived: data.archived === true,
        } as UserRow;
      });

      if (loadedUsers.length > 0) {
        setUsers(loadedUsers);
      }
    } catch (error) {
      console.error('Error loading users from Firestore', error);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [rolesLoading]);

  const handleDeleteUser = (id: string) => {
    setConfirmState({ type: 'delete', targetUserId: id });
  };

  const handleSaveUser = async () => {
    const { docId, userId, username, password, confirmPassword, fullName, email, contactNumber, status, role } = formData;

    const isSelfBasicEdit =
      !isAdminLike &&
      !!docId &&
      selectedUserRow &&
      selectedUserRow.id === docId &&
      (selectedUserRow.username === currentUsername || selectedUserRow.fullName === currentUsername);

    // Only users with edit.any permission or self-editing users may save
    if (!isAdminLike && !isSelfBasicEdit) return;

    // Non-admins cannot change passwords; only validate passwords for admin-like users
    if (isAdminLike) {
      if (password || confirmPassword) {

        if (!password || !confirmPassword) {
          setUsersAlert({
            title: 'Password Incomplete',
            message: 'Please fill both Password and Confirm Password to change the password.',
          });
          return;
        }
        if (password !== confirmPassword) {
          setUsersAlert({
            title: 'Password Mismatch',
            message: 'Passwords do not match.',
          });
          return;
        }
      }
    }

    try {
      if (!docId) {
        setUsersAlert({
          title: 'Cannot Create User',
          message: 'Users can no longer be created here. New users must sign up using the Sign Up page.',
        });
        return;
      }

      // Update existing user
      const userRef = doc(db, 'users', docId);
      const existing = users.find(u => u.id === docId) || selectedUserRow;

      if (isAdminLike) {
        const normalizedRoles = normalizeRoleIdsByAuthority(selectedRolesForUser, firestoreRoles);
        const primaryRoleId = getHighestAuthorityRoleId(normalizedRoles, firestoreRoles) || role;
        const computedUserId = generateUserId(fullName, primaryRoleId);

        const updateData: any = {
          userId: computedUserId || userId,
          username,
          fullName,
          email,
          contactNumber,
          status: status === 'active' ? 'Active' : 'Inactive',
          role: primaryRoleId,
          roles: normalizedRoles,
        };

        if (password && confirmPassword && password === confirmPassword) {
          // When password is changed, update both plain password and hash
          const newHash = await hashPassword(password);
          updateData.password = password;
          if (newHash) {
            updateData.passwordHash = newHash;
          }
        }

        await updateDoc(userRef, updateData);
      } else if (isSelfBasicEdit && existing) {
        // Employees/mechanics editing their own basic details only
        const updateData: any = {
          userId,
          username,
          fullName,
          email,
          contactNumber,
          // Preserve original role and status
          role: existing.role,
          status: existing.status,
        };

        await updateDoc(userRef, updateData);
      }

      await loadUsers();
      setIsUserDetailsExpanded(false);
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving user', err);
      setUsersAlert({
        title: 'Save Failed',
        message: 'Failed to save user changes. Please try again.',
      });
    }
  };

  const handleSort = (column: 'id' | 'username' | 'fullName' | 'email' | 'role' | 'status' | 'lastLogin') => {
    setSortState(prev => {
      if (prev.column === column) {
        const nextDirection = prev.direction === 'asc' ? 'desc' : 'asc';
        return { ...prev, column, direction: nextDirection };
      }
      return { ...prev, column, direction: 'asc' };
    });
  };

  // Permission checks for Users page
  const canArchiveUsers = can(userRoles, 'users.archive');
  const canDeleteUsers = can(userRoles, 'users.delete');
  const canExportUsers = isAdminLike; // Export is admin-only for now
  const canViewArchived = can(userRoles, 'users.view.archived');

  // Get filtered users based on search and filters
  const getFilteredUsers = () => {
    return users.filter(u => {
      // Hide developer accounts from non-developers unless they have permission
      if (!can(userRoles, 'users.view.developer') && (u.roles || []).some(r => r.toLowerCase() === 'developer')) {
        return false;
      }
      
      // Filter by archived status
      if (!showArchivedFilter && u.archived) return false;
      if (showArchivedFilter && !canViewArchived && u.archived) return false;
      
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          u.displayId.toLowerCase().includes(term) ||
          u.username.toLowerCase().includes(term) ||
          u.fullName.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }
      
      // Role filter
      if (roleFilter) {
        const userRolesList = u.roles || [u.role];
        if (!userRolesList.some(r => r.toLowerCase() === roleFilter.toLowerCase())) return false;
      }
      
      // Status filter
      if (statusFilter) {
        const userStatus = (u.status || '').toLowerCase();
        if (statusFilter === 'active' && userStatus !== 'active') return false;
        if (statusFilter === 'inactive' && userStatus === 'active') return false;
      }
      
      return true;
    });
  };

  // Export to CSV handler
  const handleExportCsv = () => {
    const dataToExport = getFilteredUsers();
    if (dataToExport.length === 0) return;
    
    const headers = ['ID', 'Username', 'Full Name', 'Email', 'Contact', 'Roles', 'Status', 'Last Login'];
    const rows = dataToExport.map(u => [
      u.displayId,
      u.username,
      u.fullName,
      u.email,
      u.contactNumber,
      (u.roles || [u.role]).join('; '),
      u.status,
      u.lastLogin
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getFirstName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return parts[0] ?? '';
  };

  const getLastName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '';
    return parts[parts.length - 1];
  };

  const rolePriority: Record<string, number> = {
    developer: 0,
    admin: 1,
    employee: 2,
    mechanic: 3,
  };


  const visibleUsers = users.filter(u => {
    // Hide developer accounts from non-developers unless they have permission
    if (!can(userRoles, 'users.view.developer') && (u.role || '').toLowerCase() === 'developer') {
      return false;
    }
    return true;
  });

  const sortedUsers = [...visibleUsers].sort((a, b) => {
    if (!sortState.column) return 0;

    const directionFactor = sortState.direction === 'asc' ? 1 : -1;

    if (sortState.column === 'id') {
      const roleA = a.role?.toLowerCase() ?? '';
      const roleB = b.role?.toLowerCase() ?? '';
      const rankA = rolePriority[roleA] ?? 999;
      const rankB = rolePriority[roleB] ?? 999;
      if (rankA !== rankB) return (rankA - rankB) * directionFactor;
      return a.displayId.localeCompare(b.displayId) * directionFactor;
    }

    if (sortState.column === 'username') {
      return a.username.localeCompare(b.username) * directionFactor;
    }

    if (sortState.column === 'fullName') {
      if (sortState.fullNameMode === 'first') {
        const firstA = getFirstName(a.fullName);
        const firstB = getFirstName(b.fullName);
        const cmp = firstA.localeCompare(firstB);
        if (cmp !== 0) return cmp * directionFactor;
        return a.fullName.localeCompare(b.fullName) * directionFactor;
      } else {
        const lastA = getLastName(a.fullName);
        const lastB = getLastName(b.fullName);
        const cmp = lastA.localeCompare(lastB);
        if (cmp !== 0) return cmp * directionFactor;
        return a.fullName.localeCompare(b.fullName) * directionFactor;
      }
    }

    if (sortState.column === 'email') {
      return a.email.localeCompare(b.email) * directionFactor;
    }

    if (sortState.column === 'role') {
      const roleA = a.role?.toLowerCase() ?? '';
      const roleB = b.role?.toLowerCase() ?? '';
      const rankA = rolePriority[roleA] ?? 999;
      const rankB = rolePriority[roleB] ?? 999;
      if (rankA !== rankB) return (rankA - rankB) * directionFactor;
      return a.username.localeCompare(b.username) * directionFactor;
    }

    if (sortState.column === 'status') {
      const statusA = a.status?.toLowerCase() ?? '';
      const statusB = b.status?.toLowerCase() ?? '';
      const normA = statusA === 'active' ? 0 : 1;
      const normB = statusB === 'active' ? 0 : 1;
      if (normA !== normB) return (normA - normB) * directionFactor;
      return a.status.localeCompare(b.status) * directionFactor;
    }

    if (sortState.column === 'lastLogin') {
      const timeA = a.lastLogin ? Date.parse(a.lastLogin) : 0;
      const timeB = b.lastLogin ? Date.parse(b.lastLogin) : 0;
      if (timeA === timeB) return 0;
      return (timeA - timeB) * directionFactor;
    }

    return 0;
  });

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: 'linear-gradient(109deg, #1e88e5 0%, #1e88e5 50%, #0d47a1 50%, #0d47a1 100%)',
      backgroundSize: 'cover',
      backgroundAttachment: 'fixed',
    }}>

      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
        zIndex: 5,
        padding: '2rem',
        flex: 1,
      }}>

        <header style={{
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '1rem 2rem',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: '1rem',
          position: 'sticky',
          top: '1rem',
          zIndex: 100
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: '1560px',
            margin: '0 auto',
            width: '100%',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '1.875rem',
                cursor: 'pointer',
              }}
                onClick={() => navigate('/')}
              >
                <img
                  src={logo}
                  alt="Business Logo"
                  style={{
                    height: '100%',
                    width: 'auto',
                    objectFit: 'contain'
                  }}
                />
              </div>

              <h1 style={{
                fontSize: '1.875rem',
                fontWeight: 'bold',
                color: '#1e40af',
                margin: 0,
              }}>
                Users
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem' }}>
                <span style={{ color: '#374151', fontSize: '0.9rem' }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
              </div>
            </div>

            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              marginLeft: 'auto', // This will push it to the right
              marginRight: '1rem' // Add some space before the hamburger button
            }}>
              <FaSearch style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af'
              }} />
              <input
                type="text"
                placeholder="Search by Brand or Item Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: '0.5rem 2.5rem 0.5rem 2.5rem', // Added right padding for the clear button
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'rgba(255, 255, 255)',
                  color: '#1f2937',
                  width: '320px',
                  outline: 'none'
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px'
                  }}
                >
                  <FaTimes size={14} />
                </button>
              )}
            </div>

            {user && (
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #1e40af',
                  color: '#1e40af',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  marginRight: '0.75rem',
                }}
              >
                Logout
              </button>
            )}

            {/* Navbar Toggle Button */}
            <button
              onClick={() => setIsNavExpanded(!isNavExpanded)}
              onMouseEnter={() => {
                if (!isMobile) {
                  if (closeMenuTimeout) {
                    clearTimeout(closeMenuTimeout);
                  }
                  setIsNavExpanded(true);
                }
              }}
              onMouseLeave={() => {
                if (!isMobile) {
                  closeMenuTimeout = window.setTimeout(() => {
                    setIsNavExpanded(false);
                  }, 200);
                }
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#1e40af',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <FaBars />
            </button>

            {/* Dropdown Menu */}
            <HeaderDropdown
              isNavExpanded={isNavExpanded}
              setIsNavExpanded={setIsNavExpanded}
              isMobile={isMobile}
              userRoles={userRoles}
              onMouseEnter={() => {
                if (!isMobile && closeMenuTimeout) {
                  clearTimeout(closeMenuTimeout);
                }
              }}
              onMouseLeave={() => {
                if (!isMobile) {
                  closeMenuTimeout = window.setTimeout(() => {
                    setIsNavExpanded(false);
                  }, 200);
                }
              }}
            />
          </div>
        </header>

        <main>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.65)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* User Account Details Section */}
            <section style={{ marginBottom: '2rem' }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                marginBottom: '1.5rem',
                overflow: 'hidden'
              }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    backgroundColor: 'white',
                    borderBottom: isUserDetailsExpanded ? '1px solid #e5e7eb' : 'none'
                  }}
                >
                  <button
                    onClick={() => {
                      if (isUserDetailsExpanded) {
                        const today = new Date().toISOString().split('T')[0];
                        setFormData({
                          docId: '',
                          userId: '',
                          username: '',
                          password: '',
                          confirmPassword: '',
                          fullName: '',
                          email: '',
                          contactNumber: '',
                          status: 'active',
                          role: 'employee',
                          dateCreated: today,
                        });
                        setSelectedRolesForUser([]);
                        setSelectedUserRow(null);
                        setIsEditing(false);
                        setShowPassword(false);
                        setShowConfirmPassword(false);
                        setIsPasswordFocused(false);
                        setIsConfirmFocused(false);
                        setPasswordDirty(false);
                        setPasswordUnlockedForRowId(null);
                        setStatusChangeConfirmed(false);
                        setIsUserDetailsExpanded(false);
                      } else {
                        setIsUserDetailsExpanded(true);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      margin: 0,
                      fontSize: '1.125rem',
                      fontWeight: 600,
                      color: '#1e40af',
                      textAlign: 'left'
                    }}
                  >
                    <span>User Account Details</span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.2s ease',
                        transform: isUserDetailsExpanded ? 'rotate(180deg)' : 'rotate(0)'
                      }}
                    >
                      <FaChevronDown style={{ fontSize: '0.9em', marginLeft: '0.25rem' }} />
                    </span>
                  </button>
                </div>

                <div style={{
                  maxHeight: isUserDetailsExpanded ? '2000px' : '0',
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease-out',
                  padding: isUserDetailsExpanded ? '1.5rem' : '0 1.5rem',
                  backgroundColor: 'white'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                    {/* Row: User ID - Date Created */}
                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#4b5563'
                      }}>
                        User ID
                      </label>
                      <input
                        type="text"
                        value={formData.userId}
                        disabled
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#f9fafb',
                          color: '#6b7280'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#4b5563'
                      }}>
                        Date Created
                      </label>
                      <input
                        type="text"
                        value={new Date(formData.dateCreated).toLocaleDateString()}
                        disabled
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#f9fafb',
                          color: '#6b7280'
                        }}
                      />
                    </div>

                    {/* Row: Full Name - Username */}
                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#4b5563'
                      }}>
                        Full Name *
                      </label>
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        disabled={!canEditUserDetails}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#fff',
                          color: '#111827'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#4b5563'
                      }}>
                        Username *
                      </label>
                      <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleInputChange}
                        disabled={!canEditUserDetails}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#fff',
                          color: '#111827'
                        }}
                      />
                    </div>

                    {/* Row: Contact Number - Email */}
                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#4b5563'
                      }}>
                        Contact Number *
                      </label>
                      <input
                        type="tel"
                        name="contactNumber"
                        value={formData.contactNumber}
                        onChange={handleInputChange}
                        disabled={!canEditUserDetails}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#fff',
                          color: '#111827'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#4b5563'
                      }}>
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        disabled
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#f9fafb',
                          color: '#6b7280'
                        }}
                      />
                    </div>

                    {/* Row: Password fields */}
                    {canSeePasswords && !isOtherUserRowForAdmin ? (
                      <>
                        <div>
                          <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            color: '#4b5563'
                          }}>
                            Password *
                          </label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showPassword ? 'text' : 'password'}
                              name="password"
                              value={formData.password}
                              onChange={handleInputChange}
                              onFocus={() => {
                                setIsPasswordFocused(true);
                                handlePasswordFieldFocus();
                              }}
                              onBlur={() => setIsPasswordFocused(false)}
                              disabled={!canEditUserDetails}
                              style={{
                                width: '100%',
                                padding: '0.5rem 2.5rem 0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: '#fff',
                                color: '#111827'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              disabled={!canEditUserDetails}
                              style={{
                                position: 'absolute',
                                right: '0.5rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#6b7280'
                              }}
                            >
                              {showPassword ? <FaEyeSlash /> : <FaEye />}
                            </button>
                          </div>
                          {isPasswordFocused && (
                            <div style={{
                              position: 'absolute',
                              marginTop: '0.25rem',
                              fontSize: '0.75rem',
                              backgroundColor: '#111827',
                              color: 'white',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                              maxWidth: '260px',
                              zIndex: 20
                            }}>
                              Password Requirements: At least 8 characters with uppercase, lowercase, numbers, and special characters.
                            </div>
                          )}
                        </div>

                        <div>
                          <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            color: '#4b5563'
                          }}>
                            Confirm Password *
                          </label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              name="confirmPassword"
                              value={formData.confirmPassword}
                              onChange={handleInputChange}
                              onFocus={() => setIsConfirmFocused(true)}
                              onBlur={() => setIsConfirmFocused(false)}
                              disabled={!canEditUserDetails}
                              style={{
                                width: '100%',
                                padding: '0.5rem 2.5rem 0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: '#fff',
                                color: '#111827'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              disabled={!canEditUserDetails}
                              style={{
                                position: 'absolute',
                                right: '0.5rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#6b7280'
                              }}
                            >
                              {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                            </button>
                          </div>
                          {isConfirmFocused && (
                            <div style={{
                              position: 'absolute',
                              marginTop: '0.25rem',
                              fontSize: '0.75rem',
                              backgroundColor: '#111827',
                              color: 'white',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                              maxWidth: '260px',
                              zIndex: 20
                            }}>
                              Re-enter the password to confirm.
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div />
                        <div />
                      </>
                    )}
                    {/* Row: User Roles - Account Status */}
                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#4b5563'
                      }}>
                        User Roles *
                      </label>
                      <div style={{
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        padding: '0.5rem',
                        backgroundColor: '#fff',
                        minHeight: '42px'
                      }}>
                        {/* Selected roles as badges */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: selectedRolesForUser.length > 0 ? '0.5rem' : 0 }}>
                          {selectedRolesForUser.map(roleId => {
                            const roleData = firestoreRoles.find(r => r.id === roleId);
                            if (!roleData) return null;
                            return (
                              <span
                                key={roleId}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.125rem 0.5rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.75rem',
                                  fontWeight: 500,
                                  backgroundColor: `${roleData.color}20`,
                                  color: roleData.color,
                                  border: `1px solid ${roleData.color}40`
                                }}
                              >
                                <span style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  backgroundColor: roleData.color
                                }} />
                                {roleData.name}
                                {canEditUserDetails && can(userRoles, 'users.edit.any') && (
                                  <button
                                    type="button"
                                    onClick={() => setRolesAndSyncIds(selectedRolesForUser.filter(r => r !== roleId))}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: '0 0.125rem',
                                      color: roleData.color,
                                      fontSize: '0.875rem',
                                      lineHeight: 1
                                    }}
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                        {/* Role selection dropdown */}
                        {canEditUserDetails && can(userRoles, 'users.edit.any') && (
                          <select
                            value=""
                            onChange={(e) => {
                              const roleId = e.target.value;
                              if (roleId && !selectedRolesForUser.includes(roleId)) {
                                setRolesAndSyncIds([...selectedRolesForUser, roleId]);
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.25rem',
                              border: '1px solid #e5e7eb',
                              backgroundColor: '#f9fafb',
                              color: '#6b7280',
                              fontSize: '0.75rem',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="">+ Add role...</option>
                            {firestoreRoles
                              .filter(role => !selectedRolesForUser.includes(role.id))
                              .map(role => (
                                <option key={role.id} value={role.id}>{role.name}</option>
                              ))}
                          </select>
                        )}
                      </div>
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#4b5563'
                      }}>
                        Account Status *
                      </label>
                      <select
                        name="status"
                        value={formData.status}
                        onChange={handleInputChange}
                        disabled={!can(userRoles, 'users.edit.any') || !canEditUserDetails}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#fff',
                          color: '#111827',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>

                  </div>

                  {/* Action Buttons */}
                  {canEditUserDetails && (
                    <div style={{
                      display: 'flex',
                      gap: '0.75rem',
                      marginTop: '1.5rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid #e5e7eb'
                    }}>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          padding: '0.5rem 1.5rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          // If status changed in details, require status confirmation first
                          if (formData.docId && selectedUserRow) {
                            const originalStatus = (selectedUserRow.status || '').toString().trim().toLowerCase();
                            const newStatus = (formData.status || '').toString().trim().toLowerCase();
                            const statusChanged = !!originalStatus && !!newStatus && originalStatus !== newStatus;

                            if (statusChanged && !statusChangeConfirmed) {
                              setStatusConfirmState({
                                mode: 'details',
                                userId: formData.docId,
                                nextStatus: formData.status === 'active' ? 'Active' : 'Inactive',
                              });
                              return;
                            }
                          }
                          // After any required status confirmation, always go through the
                          // standard in-app save confirmation modal. Password confirmation
                          // is now handled exclusively via the password field/modal flow.
                          setConfirmState({ type: 'save' });
                        }}
                      >
                        Save User
                      </button>

                      <button
                        type="button"
                        style={{
                          flex: 1,
                          padding: '0.5rem 1.5rem',
                          backgroundColor: 'white',
                          color: '#4b5563',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          // Exit edit mode and re-hide any visible passwords
                          setIsEditing(false);
                          setShowPassword(false);
                          setShowConfirmPassword(false);
                          setIsPasswordFocused(false);
                          setIsConfirmFocused(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Action Bar Section */}
            <section style={{ marginBottom: '1rem' }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem',
                border: '1px solid #e5e7eb'
              }}>
                {/* Action Bar - Left: Export, Select | Right: Filters, Clear Filters */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: showFilters ? '1rem' : 0 }}>
                  {/* Left side buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {canExportUsers && (
                      <button
                        onClick={handleExportCsv}
                        style={{
                          backgroundColor: '#059669',
                          color: 'white',
                          padding: '0.5rem 1rem',
                          borderRadius: '0.375rem',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontWeight: 500,
                          fontSize: '0.875rem',
                          height: '40px',
                        }}
                      >
                        Export to CSV <FaFileExcel />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIsSelectMode(!isSelectMode);
                        if (isSelectMode) setSelectedItems(new Set());
                      }}
                      style={{
                        backgroundColor: isSelectMode ? '#dc2626' : '#3b82f6',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.375rem',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        height: '40px',
                      }}
                    >
                      {isSelectMode ? 'Cancel' : 'Select'}
                    </button>
                  </div>

                  {/* Right side buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      style={{
                        backgroundColor: '#1e40af',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.375rem',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        height: '40px',
                      }}
                    >
                      Filters <FaFilter />
                    </button>
                    <button
                      onClick={() => {
                        setRoleFilter('');
                        setStatusFilter('');
                        setShowArchivedFilter(false);
                      }}
                      style={{
                        backgroundColor: '#6b7280',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.375rem',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        height: '40px',
                      }}
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>

                {/* Filters Panel */}
                {showFilters && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb',
                  }}>
                    {/* Role Filter */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                        Role
                      </label>
                      <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: 'white',
                          color: '#111827',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="">All Roles</option>
                        {firestoreRoles.map(role => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Status Filter */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                        Status
                      </label>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: 'white',
                          color: '#111827',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>

                    {/* Show Archived Toggle */}
                    {canViewArchived && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
                        <Switch
                          checked={showArchivedFilter}
                          onChange={(checked) => setShowArchivedFilter(checked)}
                          size="sm"
                        />
                        <span style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                          Show Archived
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* System Users Section */}
            <section>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
              }}>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  color: '#1e40af',
                  margin: 0
                }}>
                  System Users
                </h2>
                {isSelectMode && selectedItems.size > 0 && (() => {
                  const selectedUsers = getFilteredUsers().filter(u => selectedItems.has(u.id));
                  const hasUnarchived = selectedUsers.some(u => !u.archived);
                  const hasArchived = selectedUsers.some(u => u.archived);

                  return (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                        {selectedItems.size} selected
                      </span>
                      {canArchiveUsers && hasUnarchived && (
                        <button
                          onClick={async () => {
                            const toArchive = selectedUsers.filter(u => !u.archived);
                            await Promise.all(
                              toArchive.map((u) => updateDoc(doc(db, 'users', u.id), { archived: true, archivedAt: new Date().toISOString() }))
                            );
                            await loadUsers();
                            setSelectedItems(new Set());
                            setIsSelectMode(false);
                          }}
                          style={{
                            backgroundColor: '#f59e0b',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          Archive Selected
                        </button>
                      )}
                      {canArchiveUsers && hasArchived && (
                        <button
                          onClick={async () => {
                            const toUnarchive = selectedUsers.filter(u => u.archived);
                            await Promise.all(
                              toUnarchive.map((u) => updateDoc(doc(db, 'users', u.id), { archived: false }))
                            );
                            await loadUsers();
                            setSelectedItems(new Set());
                            setIsSelectMode(false);
                          }}
                          style={{
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          Unarchive Selected
                        </button>
                      )}
                      {canDeleteUsers && hasArchived && !hasUnarchived && (
                        <button
                          onClick={async () => {
                            const toDelete = selectedUsers.filter(u => u.archived);
                            await Promise.all(
                              toDelete.map((u) => deleteDoc(doc(db, 'users', u.id)))
                            );
                            await loadUsers();
                            setSelectedItems(new Set());
                            setIsSelectMode(false);
                          }}
                          style={{
                            backgroundColor: '#ef4444',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          Delete Selected
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{
                overflowX: 'auto',
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: '800px'
                }}>
                  <thead>
                    <tr style={{
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      {isSelectMode && (
                        <th style={{ padding: '0.75rem 0.5rem', width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={selectedItems.size === getFilteredUsers().length && getFilteredUsers().length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedItems(new Set(getFilteredUsers().map(u => u.id)));
                              } else {
                                setSelectedItems(new Set());
                              }
                            }}
                            style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                          />
                        </th>
                      )}
                      <th
                        onClick={() => handleSort('id')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#4b5563',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                        }}
                      >
                        ID
                      </th>
                      <th
                        onClick={() => handleSort('username')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#4b5563',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                        }}
                      >
                        Username
                      </th>
                      <th
                        onClick={() => handleSort('fullName')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#4b5563',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                        }}
                      >
                        Full Name
                      </th>
                      <th
                        onClick={() => handleSort('email')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#4b5563',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                        }}
                      >
                        Email
                      </th>
                      <th
                        onClick={() => handleSort('role')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#4b5563',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                        }}
                      >
                        Role
                      </th>
                      <th
                        onClick={() => handleSort('status')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#4b5563',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                        }}
                      >
                        Status
                      </th>
                      <th
                        onClick={() => handleSort('lastLogin')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#4b5563',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                        }}
                      >
                        Last Login
                      </th>
                      {showRowActions && (
                        <th
                          style={{
                            padding: '0.75rem 1rem',
                            textAlign: 'left',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            color: '#4b5563',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredUsers().map((user, index) => (
                      <tr
                        key={user.id}
                        onClick={() => isSelectMode ? null : handleSelectUser(user)}
                        style={{
                          borderBottom: index === getFilteredUsers().length - 1 ? 'none' : '1px solid #e5e7eb',
                          backgroundColor: selectedItems.has(user.id) ? '#dbeafe' : (index % 2 === 0 ? 'white' : '#f9fafb'),
                          cursor: isSelectMode ? 'default' : 'pointer'
                        }}
                      >
                        {isSelectMode && (
                          <td style={{ padding: '1rem 0.5rem', width: '40px' }} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedItems.has(user.id)}
                              onChange={(e) => {
                                const newSet = new Set(selectedItems);
                                if (e.target.checked) {
                                  newSet.add(user.id);
                                } else {
                                  newSet.delete(user.id);
                                }
                                setSelectedItems(newSet);
                              }}
                              style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                            />
                          </td>
                        )}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          whiteSpace: 'nowrap'
                        }}>
                          {user.displayId}
                        </td>

                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          whiteSpace: 'nowrap'
                        }}>
                          {user.username}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          whiteSpace: 'nowrap'
                        }}>
                          {user.fullName}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          whiteSpace: 'nowrap'
                        }}>
                          {user.email}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          whiteSpace: 'nowrap',
                        }}>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {(user.roles || [user.role]).filter(Boolean).map(roleId => {
                              const roleData = firestoreRoles.find(r => r.id === roleId || r.name.toLowerCase() === roleId.toLowerCase());
                              return (
                                <RoleBadge
                                  key={roleId}
                                  role={roleData || { id: roleId, name: roleId, color: '#6b7280', position: 999, permissions: {}, isDefault: false, isProtected: false, createdAt: new Date() }}
                                />
                              );
                            })}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '1rem',
                            fontSize: '0.875rem',
                            whiteSpace: 'nowrap'
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          {(() => {
                            const norm = (user.status || '').toString().trim().toLowerCase();
                            const isActive = norm === 'active';
                            const label = isActive ? 'Active' : 'Inactive';
                            const bg = isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
                            const color = isActive ? '#047857' : '#b91c1c';

                            return (
                              <button
                                type="button"
                                disabled={!can(userRoles, 'users.edit.any')}
                                onClick={() => {
                                  setStatusConfirmState({
                                    mode: 'table',
                                    userId: user.id,
                                    nextStatus: isActive ? 'Inactive' : 'Active',
                                  });
                                }}
                                style={{
                                  padding: '0.15rem 0.6rem',
                                  borderRadius: '9999px',
                                  border: 'none',
                                  backgroundColor: bg,
                                  color,
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: can(userRoles, 'users.edit.any') ? 'pointer' : 'default',
                                  textTransform: 'none',
                                  minWidth: '72px',
                                }}
                              >
                                {label}
                              </button>
                            );
                          })()}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#4b5563',
                          whiteSpace: 'nowrap'
                        }}>
                          {user.lastLogin}
                        </td>
                        {showRowActions && (
                          <td style={{
                            padding: '1rem',
                            fontSize: '0.875rem',
                            whiteSpace: 'nowrap'
                          }}>
                            {/* Users with edit.any permission: can edit/archive any user (subject to existing filters) */}
                            {can(userRoles, 'users.edit.any') && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectUser(user);
                                    setIsEditing(true);
                                  }}
                                  style={{
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '999px',
                                    border: '1px solid #bfdbfe',
                                    backgroundColor: '#dbeafe',
                                    color: '#1d4ed8',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    marginRight: '0.5rem'
                                  }}
                                >
                                  Edit
                                </button>
                                {can(userRoles, 'users.archive') && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const userRef = doc(db, 'users', user.id);
                                      await updateDoc(userRef, { archived: true, archivedAt: new Date().toISOString() });
                                      setUsers((prev) =>
                                        prev.map((row) =>
                                          row.id === user.id
                                            ? { ...row, status: 'archived' }
                                            : row,
                                        ),
                                      );
                                    }}
                                    style={{
                                      padding: '0.25rem 0.75rem',
                                      borderRadius: '999px',
                                      border: '1px solid #fecaca',
                                      backgroundColor: '#fee2e2',
                                      color: '#b91c1c',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer',
                                      fontWeight: 500
                                    }}
                                  >
                                    Archive
                                  </button>
                                )}
                              </>
                            )}

                            {/* Non-admin roles: can only edit their own row, no delete */}
                            {!can(userRoles, 'users.edit.any') && (user.username === currentUsername || user.fullName === currentUsername) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectUser(user);
                                  setIsEditing(true);
                                }}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '999px',
                                  border: '1px solid #bfdbfe',
                                  backgroundColor: '#dbeafe',
                                  color: '#1d4ed8',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  fontWeight: 500
                                }}
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {getFilteredUsers().length === 0 && (
                      <tr>
                        <td colSpan={8} style={{
                          padding: '2rem',
                          textAlign: 'center',
                          color: '#6b7280',
                          fontStyle: 'italic'
                        }}>
                          No users found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>

      {usersAlert && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1990,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            width: '100%',
            maxWidth: '420px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{
              margin: 0,
              marginBottom: '0.75rem',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#111827',
            }}>
              {usersAlert.title}
            </h3>
            <p style={{
              margin: 0,
              marginBottom: '1.25rem',
              fontSize: '0.875rem',
              color: '#4b5563',
            }}>
              {usersAlert.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setUsersAlert(null)}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app confirmation modal */}
      {confirmState && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            width: '100%',
            maxWidth: '420px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{
              margin: 0,
              marginBottom: '0.75rem',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#111827'
            }}>
              {confirmState.type === 'save' ? 'Confirm Save' : 'Confirm Delete'}
            </h3>
            <p style={{
              margin: 0,
              marginBottom: '1.25rem',
              fontSize: '0.875rem',
              color: '#4b5563'
            }}>
              {confirmState.type === 'save'
                ? 'Are you sure you want to save these user details?'
                : 'Are you sure you want to delete this user? This action cannot be undone.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirmState) return;
                  try {
                    if (confirmState.type === 'save') {
                      await handleSaveUser();
                    } else if (confirmState.type === 'delete' && confirmState.targetUserId) {
                      const ref = doc(db, 'users', confirmState.targetUserId);
                      await deleteDoc(ref);
                      await loadUsers();
                    }
                  } catch (err) {
                    console.error('Error performing user action', err);
                  } finally {
                    setConfirmState(null);
                  }
                }}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: confirmState.type === 'save' ? '#2563eb' : '#b91c1c',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                {confirmState.type === 'save' ? 'Save' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role change auto-activate confirmation modal */}
      {roleChangeConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2600,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
          }}>
            <h2 style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              margin: 0,
              marginBottom: '0.75rem',
              color: '#111827',
            }}>
              Activate user with new role?
            </h2>
            <p style={{
              fontSize: '0.875rem',
              color: '#4b5563',
              marginBottom: '1rem',
            }}>
              This user is currently inactive. Changing their role to "{roleChangeConfirm.nextRole}" will also
              set the account status to <span style={{ fontWeight: 600 }}>Active</span>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setRoleChangeConfirm(null)}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: 'white',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  color: '#374151',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormData(prev => {
                    const next = {
                      ...prev,
                      role: roleChangeConfirm.nextRole,
                      status: 'active',
                    };
                    next.userId = generateUserId(next.fullName, next.role);
                    return next;
                  });
                  setRolesAndSyncIds([roleChangeConfirm.nextRole]);
                  setStatusChangeConfirmed(true);
                  setRoleChangeConfirm(null);
                }}
                style={{
                  padding: '0.4rem 1.1rem',
                  backgroundColor: '#2563eb',
                  borderRadius: '0.375rem',
                  border: 'none',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Yes, change role & activate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status change confirmation modal */}
      {statusConfirmState && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2050,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            width: '100%',
            maxWidth: '420px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{
              margin: 0,
              marginBottom: '0.75rem',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#111827',
            }}>
              Confirm Status Change
            </h3>
            <p style={{
              margin: 0,
              marginBottom: '1.25rem',
              fontSize: '0.875rem',
              color: '#4b5563',
            }}>
              {statusConfirmState.nextStatus === 'Active'
                ? 'Are you sure you want to set this user to Active?'
                : 'Are you sure you want to set this user to Inactive?'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setStatusConfirmState(null)}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!statusConfirmState) return;

                  try {
                    if (statusConfirmState.mode === 'table' && statusConfirmState.userId && statusConfirmState.nextStatus) {
                      const ref = doc(db, 'users', statusConfirmState.userId);
                      await updateDoc(ref, {
                        status: statusConfirmState.nextStatus,
                      });
                      await loadUsers();
                    } else if (statusConfirmState.mode === 'details') {
                      // Mark status change as confirmed; actual write happens on Save
                      setStatusChangeConfirmed(true);
                    }
                  } catch (err) {
                    console.error('Error updating status', err);
                  } finally {
                    setStatusConfirmState(null);
                  }
                }}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm current password modal for changing another user's password */}
      {showPasswordConfirmModal && selectedUserRow && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            width: '100%',
            maxWidth: '420px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{
              margin: 0,
              marginBottom: '0.75rem',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#111827'
            }}>
              Confirm Current Password
            </h3>
            <p style={{
              margin: 0,
              marginBottom: '1rem',
              fontSize: '0.875rem',
              color: '#4b5563'
            }}>
              To change this user's password, please enter their current password.
            </p>
            <div style={{ marginBottom: '1rem', position: 'relative' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                color: '#4b5563'
              }}>
                Current Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordConfirmInput}
                  onChange={e => {
                    setPasswordConfirmInput(e.target.value);
                    setPasswordConfirmError('');
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 2.5rem 0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: passwordConfirmError ? '1px solid #ef4444' : '1px solid #d1d5db',
                    backgroundColor: '#fff',
                    color: '#111827'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6b7280'
                  }}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              {passwordConfirmError && (
                <div style={{
                  marginTop: '0.25rem',
                  fontSize: '0.75rem',
                  color: '#b91c1c'
                }}>
                  {passwordConfirmError}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordConfirmModal(false);
                  setPasswordConfirmInput('');
                  setPasswordConfirmError('');
                }}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const entered = (passwordConfirmInput || '').toString().trim();
                  const storedPlain = (selectedUserRow.password || '').toString().trim();
                  const storedHash = (selectedUserRow.passwordHash || '').toString();

                  let ok = false;

                  if (storedHash) {
                    // If this looks like a bcrypt hash, use bcrypt.compare
                    if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
                      try {
                        ok = await bcrypt.compare(entered, storedHash);
                      } catch {
                        ok = false;
                      }
                    } else {
                      // Legacy hash/plain: fall back to simple equality
                      ok = !!entered && entered === storedHash;
                    }
                  } else {
                    ok = !!entered && entered === storedPlain;
                  }

                  if (!ok) {
                    setPasswordConfirmError('Current password is incorrect.');
                    return;
                  }

                  // Successful confirmation: unlock password field for this user
                  // but do NOT load stored password; require a new password to be typed
                  setPasswordUnlockedForRowId(selectedUserRow.id);
                  setFormData(prev => ({
                    ...prev,
                    password: '',
                    confirmPassword: '',
                  }));
                  setPasswordDirty(false);

                  setShowPasswordConfirmModal(false);
                  setPasswordConfirmInput('');
                  setPasswordConfirmError('');
                }}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Settings Modal (placeholder) */}
      {canEditUserDetailsBase && isUserSettingsOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, marginBottom: '0.75rem', color: '#111827' }}>
              User Settings
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '1rem' }}>
              This is a placeholder for future Users module settings.
            </p>

            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setIsUserSettingsOpen(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}