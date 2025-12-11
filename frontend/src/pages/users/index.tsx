import { useState, useEffect } from 'react';
import { FaHome, FaGripLinesVertical, FaBars, FaWarehouse, FaTag, FaWrench, FaFileInvoice, FaPlus, FaUser, FaSearch, FaTimes, FaFilter, FaChevronDown, FaEye, FaEyeSlash, FaRedo, FaUndoAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { can } from '../../config/permissions';
import logo from '../../assets/logo.png';
import bcrypt from 'bcryptjs';
import { HeaderDropdown } from '../../components/HeaderDropdown';

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
  role: string;
  status: string;
  lastLogin: string;
  password: string; // Plain password kept temporarily for compatibility
  passwordHash?: string; // Hashed password for secure verification
};

export function Users() {

  const [isUserDetailsExpanded, setIsUserDetailsExpanded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isConfirmFocused, setIsConfirmFocused] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const userRoles = user?.roles?.length ? user.roles : (user?.role ? [user.role] : []);
  let closeMenuTimeout: number | undefined;
  const [searchTerm, setSearchTerm] = useState('');

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

  const [sortState, setSortState] = useState<{
    column: 'id' | 'username' | 'fullName' | 'email' | 'role' | 'status' | 'lastLogin' | null;
    direction: 'asc' | 'desc';
    fullNameMode: 'first' | 'last';
  }>({
    column: null,
    direction: 'asc',
    fullNameMode: 'first',
  });

  const currentRole = user?.role ?? 'employee';
  const currentUsername = user?.name ?? '';
  const [isEditing, setIsEditing] = useState(false);
  const isAdminLike = can(currentRole, 'users.edit.any');

  const canEditUserDetailsBase = isAdminLike; // Admin/superadmin capabilities
  // Non-admins can edit only their own details when in edit mode
  const isSelfEditing = !isAdminLike &&
    isEditing &&
    selectedUserRow &&
    (selectedUserRow.username === currentUsername || selectedUserRow.fullName === currentUsername);
  const canEditUserDetails = (isAdminLike && isEditing) || !!isSelfEditing;

  const canSeePasswords = isAdminLike || !!isSelfEditing; // Admin/superadmin or self-editing user see password fields
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
    if (!fullName || !role) return '';

    const initials = fullName
      .split(' ')
      .filter(Boolean)
      .map(part => part[0]?.toUpperCase() || '')
      .join('');

    const rolePrefix = role.slice(0, 3).toUpperCase();
    return `${rolePrefix}-${initials}`;
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
      role: row.role || prev.role,
    }));
    setIsUserDetailsExpanded(true);
    setIsEditing(false);
    setPasswordDirty(false);
    setPasswordUnlockedForRowId(null);
    setStatusChangeConfirmed(false);
  };

  const handleNewUser = () => {
    if (!canEditUserDetailsBase) return;
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
    setIsUserDetailsExpanded(true);
    setIsEditing(true);
    setPasswordDirty(false);
    setStatusChangeConfirmed(false);
  };

  const handleRoleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextRole = e.target.value;

    setFormData(prev => {
      // Only trigger confirmation for existing users, when an admin-like user
      // changes role while the account is currently inactive.
      const isExisting = !!prev.docId && !!selectedUserRow;
      const originalStatus = (selectedUserRow?.status || '').toString().trim().toLowerCase();
      const currentStatus = (prev.status || '').toString().trim().toLowerCase();
      const wasInactive = originalStatus === 'inactive' || currentStatus === 'inactive';

      if (
        isExisting &&
        isAdminLike &&
        wasInactive &&
        selectedUserRow &&
        nextRole !== (selectedUserRow.role || '')
      ) {
        setRoleChangeConfirm({
          userId: prev.docId,
          previousRole: selectedUserRow.role || '',
          nextRole,
        });
        // Do not change role yet; wait for confirmation.
        return prev;
      }

      const updated = { ...prev, role: nextRole };
      updated.userId = generateUserId(updated.fullName, updated.role);
      return updated;
    });
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
        next.userId = generateUserId(value, next.role);
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
        return {
          id: docSnap.id,
          displayId: data.userId ?? docSnap.id,
          username: data.username ?? '',
          fullName: data.fullName ?? '',
          email: data.email ?? '',
          contactNumber: data.contactNumber ?? '',
          role: data.role ?? '',
          // Normalize stored status to a consistent display value
          status: (data.status ?? '').toString().trim() || '',
          lastLogin: data.lastLogin ?? '',
          password: data.password ?? '',
          passwordHash: data.passwordHash ?? '',
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
  }, []);

  const handleDeleteUser = (id: string) => {
    setConfirmState({ type: 'delete', targetUserId: id });
  };

  const handleToggleUserStatus = async (row: UserRow) => {
    if (!canEditUserDetailsBase) return;
    const current = (row.status || '').toString().trim().toLowerCase();
    const nextIsActive = current !== 'active';
    const nextStatus: 'Active' | 'Inactive' = nextIsActive ? 'Active' : 'Inactive';

    // Defer actual update until user confirms in modal
    setSelectedUserRow(row);
    setStatusConfirmState({
      mode: 'table',
      userId: row.id,
      nextStatus,
    });
  };

  const handleSaveUser = async () => {
    const { docId, userId, username, password, confirmPassword, fullName, email, contactNumber, status, role } = formData;

    const isSelfBasicEdit =
      !isAdminLike &&
      !!docId &&
      selectedUserRow &&
      selectedUserRow.id === docId &&
      (selectedUserRow.username === currentUsername || selectedUserRow.fullName === currentUsername);

    // Only admin/superadmin or self-editing employees/mechanics may save
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

    if (docId) {
      // Update existing user
      const userRef = doc(db, 'users', docId);
      const existing = users.find(u => u.id === docId) || selectedUserRow;

      if (isAdminLike) {
        const updateData: any = {
          userId,
          username,
          fullName,
          contactNumber,
          status: status === 'active' ? 'Active' : 'Inactive',
          role,
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
          contactNumber,
          // Preserve original role and status
          role: existing.role,
          status: existing.status,
        };

        await updateDoc(userRef, updateData);
      }
    } else {
      // Only admin/superadmin can create new users
      if (!isAdminLike) return;

      const userRef = collection(db, 'users');
      let finalPassword = password;

      if (!finalPassword) {
        const roleLower = (role || '').toLowerCase();
        if (roleLower === 'employee') finalPassword = 'employee123';
        else if (roleLower === 'mechanic') finalPassword = 'mechanic123';
        else if (roleLower === 'admin') finalPassword = 'admin123';
        else if (roleLower === 'superadmin') finalPassword = 'superadmin123';
        else finalPassword = 'password123';
      }

      const newHash = await hashPassword(finalPassword);

      await addDoc(userRef, {
        userId,
        username,
        fullName,
        contactNumber,
        status: status === 'active' ? 'Active' : 'Inactive',
        role,
        password: finalPassword,
        passwordHash: newHash,
      });
    }

    await loadUsers();
    setIsUserDetailsExpanded(false);
    setIsEditing(false);
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
    superadmin: 0,
    admin: 1,
    employee: 2,
    mechanic: 3,
  };


  const visibleUsers = users.filter(u => {
    // Hide superadmin accounts from any non-superadmin viewer
    if (currentRole !== 'superadmin' && (u.role || '').toLowerCase() === 'superadmin') {
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
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '1rem 2rem',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
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
                color: 'white',
                margin: 0,
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}>
                Users
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.9rem' }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
                {user && (
                  <button
                    onClick={() => {
                      // simple logout: clear context and go to login
                      window.location.href = '/login';
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid white',
                      color: 'white',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    Logout
                  </button>
                )}
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
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'rgba(255, 255, 255)',
                  color: '#1f2937', // Darker color for better contrast
                  width: '350px', // Slightly reduced width
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
                color: 'white',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <FaBars />
              <span style={{ fontSize: '1rem' }}></span>
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

                  {can(currentRole, 'users.edit.any') && (
                    <button
                      type="button"
                      onClick={handleNewUser}
                      style={{
                        padding: '0.35rem 0.9rem',
                        borderRadius: '9999px',
                        border: '1px solid #3b82f6',
                        backgroundColor: 'white',
                        color: '#1d4ed8',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      New User
                    </button>
                  )}
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
                    {/* Row: User Role - Account Status */}
                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#4b5563'
                      }}>
                        User Role *
                      </label>
                      <select
                        name="role"
                        value={formData.role}
                        onChange={handleRoleSelectChange}
                        disabled={!can(currentRole, 'users.edit.any') || !canEditUserDetails}
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
                        <option value="admin">Admin</option>
                        <option value="employee">Employee</option>
                        <option value="mechanic">Mechanic</option>
                        {user?.role === 'superadmin' && (
                          <option value="superadmin">Super Admin</option>
                        )}
                      </select>
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
                        disabled={!can(currentRole, 'users.edit.any') || !canEditUserDetails}
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
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => window.location.reload()}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.375rem',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      transition: 'background-color 0.2s',
                      fontWeight: '500',
                      fontSize: '0.875rem'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                  >
                    <FaRedo /> Refresh
                  </button>
                </div>
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
                    {sortedUsers.map((user, index) => (
                      <tr
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        style={{
                          borderBottom: index === users.length - 1 ? 'none' : '1px solid #e5e7eb',
                          backgroundColor: index % 2 === 0 ? 'white' : '#f9fafb',
                          cursor: 'pointer'
                        }}
                      >
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
                          whiteSpace: 'nowrap'
                        }}>
                          {user.role}
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
                                disabled={!can(currentRole, 'users.edit.any')}
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
                                  cursor: can(currentRole, 'users.edit.any') ? 'pointer' : 'default',
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
                            {/* Admin/superadmin: can edit/delete any non-superadmin (subject to existing filters) */}
                            {can(currentRole, 'users.edit.any') && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectUser(user);
                                    setIsEditing(true);
                                  }}
                                  style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#3b82f6',
                                    cursor: 'pointer',
                                    marginRight: '0.5rem'
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (can(currentRole, 'users.delete')) {
                                      handleDeleteUser(user.id);
                                    }
                                  }}
                                  style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Delete
                                </button>
                              </>
                            )}

                            {/* Non-admin roles: can only edit their own row, no delete */}
                            {!can(currentRole, 'users.edit.any') && (user.username === currentUsername || user.fullName === currentUsername) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectUser(user);
                                  setIsEditing(true);
                                }}
                                style={{
                                  backgroundColor: 'transparent',
                                  border: 'none',
                                  color: '#3b82f6',
                                  cursor: 'pointer'
                                }}
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {users.length === 0 && (
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