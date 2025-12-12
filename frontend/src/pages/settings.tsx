import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBars, FaWarehouse, FaTag, FaWrench, FaPlus, FaFileInvoice, FaUser, FaUndoAlt, FaSearch, FaTimes, FaPlus as FaPlusIcon, FaTrash, FaEdit, FaChevronDown, FaUpload } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';
import { can, permissionGroups, DEVELOPER_ROLE_ID, type PermissionKey, type Role } from '../config/permissions';
import { collection, doc, setDoc, deleteDoc, updateDoc, serverTimestamp, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useRoles } from '../contexts/PermissionsContext';
import { RoleBadge } from '../components/RoleBadge';
import { HeaderDropdown } from '../components/HeaderDropdown';

// Section title color (consistent with other pages)
const SECTION_TITLE_COLOR = '#1e40af';

// Cache key for GCash QR URL
const GCASH_QR_CACHE_KEY = 'gcashQrCache';

// Image compression utility for QR codes
const compressImage = (file: File, maxWidth = 400, maxHeight = 400, quality = 0.8): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale down if needed while maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round(width * (maxHeight / height));
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              // Fallback to original file if compression fails
              resolve(new Blob([file], { type: file.type }));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

// Permission groups for each settings section
const inventoryPermissions: PermissionKey[] = [
  'page.inventory.view', 'inventory.view.purchaseprice', 'inventory.view.archived',
  'inventory.add', 'inventory.edit', 'inventory.addstock.multiple',
  'inventory.archive', 'inventory.delete', 'inventory.export'
];

const salesPermissions: PermissionKey[] = [
  'page.sales.view'
];

const servicesPermissions: PermissionKey[] = [
  'page.services.view', 'services.view.archived', 'services.add', 'services.edit',
  'services.archive', 'services.delete', 'services.toggle.status', 'services.export'
];

const newTransactionPermissions: PermissionKey[] = [
  'page.newtransaction.view', 'transactions.create'
];

const transactionsPermissions: PermissionKey[] = [
  'page.transactions.view', 'transactions.view.archived',
  'transactions.archive', 'transactions.delete', 'transactions.export'
];

const returnsPermissions: PermissionKey[] = [
  'page.returns.view', 'returns.process', 'returns.view.archived',
  'returns.archive', 'returns.unarchive', 'returns.delete', 'returns.export'
];

const customersPermissions: PermissionKey[] = [
  'page.customers.view', 'customers.view.archived', 'customers.add',
  'customers.edit', 'customers.archive', 'customers.delete'
];

const usersPermissions: PermissionKey[] = [
  'page.users.view', 'users.view.developer', 'users.view.archived',
  'users.edit.any', 'users.edit.self', 'users.archive', 'users.delete'
];

// Get permission label from permissionGroups
const getPermissionLabel = (key: PermissionKey): string => {
  for (const group of permissionGroups) {
    const found = group.permissions.find(p => p.key === key);
    if (found) return found.label;
  }
  return key;
};

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { roles, loading: rolesLoading, refreshRoles, maxRolesPerUser } = useRoles();

  // Debug: log when roles change
  useEffect(() => {
    console.log('Settings component: roles updated', roles.length, 'roles');
  }, [roles]);

  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchTerm, setSearchTerm] = useState('');
  let closeMenuTimeout: number | undefined;
  // Role management state
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#6b7280');
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [expandedPermissionGroups, setExpandedPermissionGroups] = useState<string[]>([]);

  // Accordion state for settings sections (all closed by default)
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const sectionsContainerRef = useRef<HTMLDivElement>(null);

  // Click outside to close accordions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sectionsContainerRef.current && !sectionsContainerRef.current.contains(event.target as Node)) {
        setExpandedSections([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Required fields state for each page (loaded from Firestore)
  const [inventoryRequiredFields, setInventoryRequiredFields] = useState<Record<string, boolean>>({
    brand: true, itemName: true, itemType: true, purchasePrice: true,
    sellingPrice: true, addedStock: true, restockLevel: true, discount: false
  });
  const [servicesRequiredFields, setServicesRequiredFields] = useState<Record<string, boolean>>({
    serviceName: true, servicePrice: true, description: false, vehicleType: false
  });
  const [newTransactionRequiredFields, setNewTransactionRequiredFields] = useState<Record<string, boolean>>({
    customerName: true, contactNumber: false, email: false, handledBy: true
  });
  const [customersRequiredFields, setCustomersRequiredFields] = useState<Record<string, boolean>>({
    customerName: true, contactNumber: false, email: false, address: false, vehicleType: false
  });

  // Vehicle types state (loaded from Firestore)
  const [vehicleTypes, setVehicleTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [isAddingVehicleType, setIsAddingVehicleType] = useState(false);
  const [newVehicleTypeName, setNewVehicleTypeName] = useState('');
  const [editingVehicleType, setEditingVehicleType] = useState<{ id: string; name: string } | null>(null);

  // GCash QR Code state
  const [gcashQrUrl, setGcashQrUrl] = useState<string | null>(null);
  const [gcashQrInput, setGcashQrInput] = useState('');
  const [isSavingQrUrl, setIsSavingQrUrl] = useState(false);
  const [qrUrlError, setQrUrlError] = useState<string | null>(null);

  // Use roles array with fallback to legacy single role
  const userRoles = user?.roles?.length ? user.roles : (user?.role ? [user.role] : []);

  // Permission-based checks (Developer role automatically has all permissions)
  const canManageRoles = can(userRoles, 'roles.view');
  const canCreateRoles = can(userRoles, 'roles.create');
  const canEditRoles = can(userRoles, 'roles.edit');
  const canDeleteRoles = can(userRoles, 'roles.delete');
  const canViewInventory = can(userRoles, 'page.inventory.view');
  const canViewSales = can(userRoles, 'page.sales.view');
  const canViewServices = can(userRoles, 'page.services.view');
  const canViewTransactions = can(userRoles, 'page.transactions.view');
  const canViewNewTransaction = can(userRoles, 'page.newtransaction.view');
  const canViewReturns = can(userRoles, 'page.returns.view');
  const canViewCustomers = can(userRoles, 'page.customers.view');
  const canViewUsers = can(userRoles, 'page.users.view');
  const isAdminLike = can(userRoles, 'users.edit.any');

  // Toggle section accordion
  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  // Load settings from Firestore on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load required fields settings
        const settingsDoc = await getDoc(doc(db, 'settings', 'requiredFields'));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          if (data.inventory) setInventoryRequiredFields(data.inventory);
          if (data.services) setServicesRequiredFields(data.services);
          if (data.newTransaction) setNewTransactionRequiredFields(data.newTransaction);
          if (data.customers) setCustomersRequiredFields(data.customers);
        }

        // Load vehicle types
        const vehicleTypesSnap = await getDocs(collection(db, 'vehicleTypes'));
        const types: Array<{ id: string; name: string }> = [];
        vehicleTypesSnap.forEach(doc => {
          types.push({ id: doc.id, name: doc.data().name || doc.id });
        });
        setVehicleTypes(types);

        // Load GCash QR URL
        const gcashDoc = await getDoc(doc(db, 'settings', 'gcash'));
        if (gcashDoc.exists() && gcashDoc.data().qrUrl) {
          const qrUrl = gcashDoc.data().qrUrl;
          setGcashQrUrl(qrUrl);
          setGcashQrInput(qrUrl);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();
  }, []);

  // Save required fields to Firestore
  const saveRequiredFields = async (
    section: 'inventory' | 'services' | 'newTransaction' | 'customers',
    fields: Record<string, boolean>
  ) => {
    try {
      await setDoc(doc(db, 'settings', 'requiredFields'), { [section]: fields }, { merge: true });
    } catch (err) {
      console.error('Failed to save required fields:', err);
    }
  };

  // Vehicle type handlers
  const handleAddVehicleType = async () => {
    if (!newVehicleTypeName.trim()) return;
    try {
      const id = newVehicleTypeName.toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, 'vehicleTypes', id), { name: newVehicleTypeName.trim() });
      setVehicleTypes(prev => [...prev, { id, name: newVehicleTypeName.trim() }]);
      setNewVehicleTypeName('');
      setIsAddingVehicleType(false);
    } catch (err) {
      console.error('Failed to add vehicle type:', err);
    }
  };

  const handleUpdateVehicleType = async () => {
    if (!editingVehicleType || !editingVehicleType.name.trim()) return;
    try {
      await updateDoc(doc(db, 'vehicleTypes', editingVehicleType.id), { name: editingVehicleType.name.trim() });
      setVehicleTypes(prev => prev.map(t => t.id === editingVehicleType.id ? editingVehicleType : t));
      setEditingVehicleType(null);
    } catch (err) {
      console.error('Failed to update vehicle type:', err);
    }
  };

  const handleDeleteVehicleType = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vehicle type?')) return;
    try {
      await deleteDoc(doc(db, 'vehicleTypes', id));
      setVehicleTypes(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Failed to delete vehicle type:', err);
    }
  };

  // GCash QR URL save handler
  const handleSaveGcashQrUrl = async () => {
    const url = gcashQrInput.trim();
    if (!url) {
      setQrUrlError('Please enter a URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setQrUrlError('Please enter a valid URL');
      return;
    }

    setIsSavingQrUrl(true);
    setQrUrlError(null);
    try {
      await setDoc(doc(db, 'settings', 'gcash'), {
        qrUrl: url,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setGcashQrUrl(url);

      // Update local cache
      localStorage.setItem(GCASH_QR_CACHE_KEY, JSON.stringify({
        url,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error('Failed to save GCash QR URL:', err);
      setQrUrlError('Failed to save. Please try again.');
    } finally {
      setIsSavingQrUrl(false);
    }
  };

  // Clear GCash QR URL
  const handleClearGcashQrUrl = async () => {
    setIsSavingQrUrl(true);
    try {
      await setDoc(doc(db, 'settings', 'gcash'), {
        qrUrl: null,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setGcashQrUrl(null);
      setGcashQrInput('');
      localStorage.removeItem(GCASH_QR_CACHE_KEY);
    } catch (err) {
      console.error('Failed to clear GCash QR URL:', err);
    } finally {
      setIsSavingQrUrl(false);
    }
  };

  // Get roles that have a specific permission
  const getRolesWithPermission = (permKey: PermissionKey): Role[] => {
    return roles.filter(role => role.permissions[permKey] === true);
  };

  // Get roles that don't have a specific permission (for adding)
  const getRolesWithoutPermission = (permKey: PermissionKey): Role[] => {
    return roles.filter(role => !role.permissions[permKey] && !role.isProtected);
  };

  // Add a role to a permission
  const handleAddRoleToPermission = async (roleId: string, permKey: PermissionKey) => {
    console.log('handleAddRoleToPermission called:', { roleId, permKey, canEditRoles });
    if (!canEditRoles) {
      console.log('Cannot edit roles - permission denied');
      return;
    }
    const role = roles.find(r => r.id === roleId);
    if (!role || role.isProtected) {
      console.log('Role not found or is protected:', { role, isProtected: role?.isProtected });
      return;
    }

    try {
      console.log('Updating Firestore for role:', roleId, 'permission:', permKey);
      const roleRef = doc(db, 'roles', roleId);
      
      // Read current permissions, update the specific key, and write back
      // This avoids Firestore creating nested objects from dot-notation keys
      const { getDoc } = await import('firebase/firestore');
      const roleDoc = await getDoc(roleRef);
      const currentPermissions = roleDoc.data()?.permissions || {};
      
      // Update the flat key directly
      const updatedPermissions = { ...currentPermissions, [permKey]: true };
      
      await updateDoc(roleRef, {
        permissions: updatedPermissions,
        updatedAt: serverTimestamp(),
      });
      
      console.log('Firestore updated, refreshing roles...');
      await refreshRoles();
      console.log('Roles refreshed successfully');
    } catch (err) {
      console.error('Failed to add role to permission:', err);
    }
  };

  // Remove a role from a permission
  const handleRemoveRoleFromPermission = async (roleId: string, permKey: PermissionKey) => {
    console.log('handleRemoveRoleFromPermission called:', { roleId, permKey, canEditRoles });
    if (!canEditRoles) {
      console.log('Cannot edit roles - permission denied');
      return;
    }
    const role = roles.find(r => r.id === roleId);
    if (!role || role.isProtected) {
      console.log('Role not found or is protected:', { role, isProtected: role?.isProtected });
      return;
    }

    try {
      console.log('Updating Firestore for role:', roleId, 'permission:', permKey);
      const roleRef = doc(db, 'roles', roleId);
      
      // Read current permissions, update the specific key, and write back
      const { getDoc } = await import('firebase/firestore');
      const roleDoc = await getDoc(roleRef);
      const currentPermissions = roleDoc.data()?.permissions || {};
      
      // Update the flat key directly
      const updatedPermissions = { ...currentPermissions, [permKey]: false };
      
      await updateDoc(roleRef, {
        permissions: updatedPermissions,
        updatedAt: serverTimestamp(),
      });
      
      console.log('Firestore updated, refreshing roles...');
      await refreshRoles();
      console.log('Roles refreshed successfully');
    } catch (err) {
      console.error('Failed to remove role from permission:', err);
    }
  };

  // State for permission role dropdowns
  const [openPermissionDropdown, setOpenPermissionDropdown] = useState<string | null>(null);

  // Role management handlers
  const handleCreateRole = async () => {
    if (!newRoleName.trim() || !canCreateRoles) return;

    setIsSavingRole(true);
    try {
      const roleId = newRoleName.toLowerCase().replace(/\s+/g, '-');
      const newPosition = roles.length > 0 ? Math.max(...roles.map(r => r.position)) + 1 : 1;

      const newRole: Role = {
        id: roleId,
        name: newRoleName.trim(),
        color: newRoleColor,
        position: newPosition,
        permissions: {},
        isDefault: false,
        isProtected: false,
        createdAt: new Date(),
      };

      await setDoc(doc(db, 'roles', roleId), {
        ...newRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await refreshRoles();
      setIsCreatingRole(false);
      setNewRoleName('');
      setNewRoleColor('#6b7280');
    } catch (err) {
      console.error('Failed to create role:', err);
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole || !canEditRoles) return;

    setIsSavingRole(true);
    try {
      await updateDoc(doc(db, 'roles', editingRole.id), {
        name: editingRole.name,
        color: editingRole.color,
        permissions: editingRole.permissions,
        updatedAt: serverTimestamp(),
      });

      await refreshRoles();
      setEditingRole(null);
    } catch (err) {
      console.error('Failed to update role:', err);
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!canDeleteRoles) return;

    const role = roles.find(r => r.id === roleId);
    if (role?.isProtected) {
      alert('Cannot delete a protected role.');
      return;
    }

    if (!confirm(`Are you sure you want to delete the role "${role?.name}"?`)) return;

    try {
      await deleteDoc(doc(db, 'roles', roleId));
      await refreshRoles();
    } catch (err) {
      console.error('Failed to delete role:', err);
    }
  };

  const togglePermission = (permKey: PermissionKey) => {
    if (!editingRole) return;
    setEditingRole({
      ...editingRole,
      permissions: {
        ...editingRole.permissions,
        [permKey]: !editingRole.permissions[permKey],
      },
    });
  };

  const togglePermissionGroup = (category: string) => {
    setExpandedPermissionGroups(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: 'linear-gradient(109deg, #1e88e5 0%, #1e88e5 50%, #0d47a1 50%, #0d47a1 100%)',
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -1,
          background: 'linear-gradient(109deg, #1e88e5 0%, #1e88e5 50%, #0d47a1 50%, #0d47a1 100%)',
          backgroundSize: 'cover',
          backgroundAttachment: 'fixed',
        }}
      />

      <div
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
          width: '100%',
          zIndex: 5,
          padding: '1.5rem 1.5rem 2rem 1.5rem',
          flex: 1,
        }}
      >
        <header
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            padding: '1rem 2rem',
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '1.25rem',
            position: 'sticky',
            top: '1rem',
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              maxWidth: '1560px',
              margin: '0 auto',
              width: '100%',
              position: 'relative',
            }}
          >
            {/* Left: logo, title, welcome */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div
                style={{
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
                  title="Back to Dashboard"
                  style={{
                    height: '100%',
                    width: 'auto',
                    objectFit: 'contain',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <h1
                  style={{
                    fontSize: '1.875rem',
                    fontWeight: 'bold',
                    color: '#1e40af',
                    margin: 0,
                  }}
                >
                  Settings
                </h1>
                <span
                  style={{
                    color: '#4b5563',
                    fontSize: '0.9rem',
                  }}
                >
                  Global website configuration
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem' }}>
                <span style={{ color: '#374151', fontSize: '0.9rem' }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
              </div>
            </div>

            {/* Right: search bar, Logout, navbar toggle */}
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  marginRight: '1rem',
                }}
              >
                <FaSearch
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search settings..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    padding: '0.5rem 2.5rem 0.5rem 2.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'rgba(255, 255, 255)',
                    color: '#1f2937',
                    width: '320px',
                    outline: 'none',
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
                      padding: '4px',
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
                  gap: '0.5rem',
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
          </div>
        </header>

        <main>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            {/* Semi-transparent container for all sections */}
            <div
              ref={sectionsContainerRef}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                borderRadius: '1rem',
                padding: '1.5rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.1)',
              }}
            >
              {/* Role Management Section - Accordion */}
              {canManageRoles && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('roleManagement')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.25rem 1.75rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: SECTION_TITLE_COLOR }}>
                      Role Management
                    </h2>
                    <FaChevronDown style={{
                      color: SECTION_TITLE_COLOR,
                      transition: 'transform 0.2s',
                      transform: expandedSections.includes('roleManagement') ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {expandedSections.includes('roleManagement') && (
                    <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <p
                          style={{
                            fontSize: '0.85rem',
                            color: '#6b7280',
                            margin: 0,
                          }}
                        >
                          Manage roles and their permissions. Max roles per user: {maxRolesPerUser}
                        </p>
                        {canCreateRoles && (
                          <button
                            type="button"
                            onClick={() => setIsCreatingRole(true)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.5rem 1rem',
                              borderRadius: '0.375rem',
                              border: 'none',
                              backgroundColor: '#2563eb',
                              color: 'white',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <FaPlusIcon /> Create Role
                          </button>
                        )}
                      </div>

                      {rolesLoading ? (
                        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Loading roles...</p>
                      ) : roles.length === 0 ? (
                        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                          No roles found. Contact an administrator.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {roles
                            // Hide Developer role from users without users.view.developer permission
                            .filter((role) => role.id !== DEVELOPER_ROLE_ID || can(userRoles, 'users.view.developer'))
                            .map((role) => (
                              <div
                                key={role.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '1rem',
                                  backgroundColor: '#f9fafb',
                                  borderRadius: '0.5rem',
                                  border: '1px solid #e5e7eb',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                  <RoleBadge role={role} />
                                  <div>
                                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                      Position: {role.position}
                                      {role.isDefault && ' • Default'}
                                      {role.isProtected && ' • Protected'}
                                    </span>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  {canEditRoles && !role.isProtected && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingRole(role)}
                                      style={{
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '0.25rem',
                                        border: '1px solid #d1d5db',
                                        backgroundColor: 'white',
                                        color: '#374151',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <FaEdit /> Edit
                                    </button>
                                  )}
                                  {canDeleteRoles && !role.isProtected && !role.isDefault && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to delete the "${role.name}" role?`)) {
                                          try {
                                            await deleteDoc(doc(db, 'roles', role.id));
                                            await refreshRoles();
                                          } catch (err) {
                                            console.error('Failed to delete role', err);
                                          }
                                        }
                                      }}
                                      style={{
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '0.25rem',
                                        border: '1px solid #fca5a5',
                                        backgroundColor: '#fef2f2',
                                        color: '#b91c1c',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <FaTrash /> Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* New Transaction Section - Accordion */}
              {canViewNewTransaction && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('newTransaction')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.25rem 1.75rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: SECTION_TITLE_COLOR }}>
                      New Transaction
                    </h2>
                    <FaChevronDown style={{
                      color: SECTION_TITLE_COLOR,
                      transition: 'transform 0.2s',
                      transform: expandedSections.includes('newTransaction') ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {expandedSections.includes('newTransaction') && (
                    <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
                      {/* Required Fields Subsection */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '0.75rem', marginTop: 0 }}>
                          Step 1: Customer information — choose which fields are required when starting a new transaction.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem 1.5rem' }}>
                          {[
                            { key: 'customerName', label: 'Customer Name' },
                            { key: 'contactNumber', label: 'Contact Number' },
                            { key: 'email', label: 'Email' },
                            { key: 'handledBy', label: 'Handled By' },
                          ].map(({ key, label }) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: '#111827', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={newTransactionRequiredFields[key] ?? false}
                                onChange={(e) => {
                                  const newFields = { ...newTransactionRequiredFields, [key]: e.target.checked };
                                  setNewTransactionRequiredFields(newFields);
                                  saveRequiredFields('newTransaction', newFields);
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* GCash QR Code Subsection */}
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                          GCash QR Code
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 0, marginBottom: '0.75rem' }}>
                          Paste a URL to your GCash QR code image (e.g., from Imgur, PostImages, etc.) to display during the payment step.
                        </p>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                          {gcashQrUrl && (
                            <div style={{
                              width: '120px',
                              height: '120px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.5rem',
                              overflow: 'hidden',
                              flexShrink: 0,
                              backgroundColor: '#f9fafb',
                            }}>
                              <img
                                src={gcashQrUrl}
                                alt="GCash QR Code"
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={() => {
                                  setGcashQrUrl(null);
                                  setGcashQrInput('');
                                  localStorage.removeItem(GCASH_QR_CACHE_KEY);
                                }}
                              />
                            </div>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <input
                                type="url"
                                value={gcashQrInput}
                                onChange={(e) => {
                                  setGcashQrInput(e.target.value);
                                  setQrUrlError(null);
                                }}
                                placeholder="https://i.imgur.com/example.jpg"
                                style={{
                                  flex: 1,
                                  padding: '0.5rem 0.75rem',
                                  border: qrUrlError ? '1px solid #ef4444' : '1px solid #d1d5db',
                                  borderRadius: '0.375rem',
                                  fontSize: '0.85rem',
                                  backgroundColor: '#ffffff',
                                  color: '#111827',
                                }}
                              />
                              <button
                                type="button"
                                onClick={handleSaveGcashQrUrl}
                                disabled={isSavingQrUrl || !gcashQrInput.trim()}
                                style={{
                                  padding: '0.5rem 1rem',
                                  backgroundColor: isSavingQrUrl || !gcashQrInput.trim() ? '#9ca3af' : '#3b82f6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '0.375rem',
                                  fontSize: '0.85rem',
                                  fontWeight: 500,
                                  cursor: isSavingQrUrl || !gcashQrInput.trim() ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {isSavingQrUrl ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                            {qrUrlError && (
                              <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: 0 }}>
                                {qrUrlError}
                              </p>
                            )}
                            {gcashQrUrl && (
                              <button
                                type="button"
                                onClick={handleClearGcashQrUrl}
                                disabled={isSavingQrUrl}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: 'transparent',
                                  color: '#ef4444',
                                  border: '1px solid #ef4444',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.75rem',
                                  cursor: isSavingQrUrl ? 'not-allowed' : 'pointer',
                                  marginTop: '0.25rem',
                                }}
                              >
                                Remove QR Code
                              </button>
                            )}
                            {!gcashQrUrl && !qrUrlError && (
                              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
                                No QR code URL set
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Permissions Subsection */}
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                          Permissions
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {newTransactionPermissions.map((permKey) => {
                            const rolesWithPerm = getRolesWithPermission(permKey);
                            const rolesWithoutPerm = getRolesWithoutPermission(permKey);
                            const dropdownKey = `newTransaction-${permKey}`;
                            return (
                              <div key={permKey} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#374151', minWidth: '180px' }}>
                                  {getPermissionLabel(permKey)}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                                  {rolesWithPerm.map(role => (
                                    <span
                                      key={role.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        backgroundColor: `${role.color}20`,
                                        color: role.color,
                                        border: `1px solid ${role.color}40`
                                      }}
                                    >
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: role.color }} />
                                      {role.name}
                                      {canEditRoles && !role.isProtected && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRoleFromPermission(role.id, permKey);
                                          }}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.125rem',
                                            color: role.color,
                                            fontSize: '0.875rem',
                                            lineHeight: 1
                                          }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {canEditRoles && rolesWithoutPerm.length > 0 && (
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        type="button"
                                        onClick={() => setOpenPermissionDropdown(openPermissionDropdown === dropdownKey ? null : dropdownKey)}
                                        style={{
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: '9999px',
                                          border: '1px dashed #3b82f6',
                                          backgroundColor: 'transparent',
                                          fontSize: '0.75rem',
                                          color: '#3b82f6',
                                          cursor: 'pointer',
                                          fontWeight: 500
                                        }}
                                      >
                                        + Add Role
                                      </button>
                                      {openPermissionDropdown === dropdownKey && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          marginTop: '0.25rem',
                                          backgroundColor: 'white',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '0.375rem',
                                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                          zIndex: 50,
                                          minWidth: '120px'
                                        }}>
                                          {rolesWithoutPerm.map(role => (
                                            <button
                                              key={role.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddRoleToPermission(role.id, permKey);
                                                setOpenPermissionDropdown(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                fontSize: '0.8rem',
                                                color: '#374151',
                                                cursor: 'pointer'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: role.color, marginRight: '0.5rem' }} />
                                              {role.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {rolesWithPerm.length === 0 && (!canEditRoles || rolesWithoutPerm.length === 0) && (
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>No roles</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Transactions Section - Accordion */}
              {canViewTransactions && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('transactions')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.25rem 1.75rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: SECTION_TITLE_COLOR }}>
                      Transactions
                    </h2>
                    <FaChevronDown style={{
                      color: SECTION_TITLE_COLOR,
                      transition: 'transform 0.2s',
                      transform: expandedSections.includes('transactions') ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {expandedSections.includes('transactions') && (
                    <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
                      {/* Permissions Subsection */}
                      <div style={{ paddingTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                          Permissions
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {transactionsPermissions.map((permKey) => {
                            const rolesWithPerm = getRolesWithPermission(permKey);
                            const rolesWithoutPerm = getRolesWithoutPermission(permKey);
                            const dropdownKey = `transactions-${permKey}`;
                            return (
                              <div key={permKey} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#374151', minWidth: '180px' }}>
                                  {getPermissionLabel(permKey)}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                                  {rolesWithPerm.map(role => (
                                    <span
                                      key={role.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        backgroundColor: `${role.color}20`,
                                        color: role.color,
                                        border: `1px solid ${role.color}40`
                                      }}
                                    >
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: role.color }} />
                                      {role.name}
                                      {canEditRoles && !role.isProtected && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRoleFromPermission(role.id, permKey);
                                          }}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.125rem',
                                            color: role.color,
                                            fontSize: '0.875rem',
                                            lineHeight: 1
                                          }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {canEditRoles && rolesWithoutPerm.length > 0 && (
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        type="button"
                                        onClick={() => setOpenPermissionDropdown(openPermissionDropdown === dropdownKey ? null : dropdownKey)}
                                        style={{
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: '9999px',
                                          border: '1px dashed #3b82f6',
                                          backgroundColor: 'transparent',
                                          fontSize: '0.75rem',
                                          color: '#3b82f6',
                                          cursor: 'pointer',
                                          fontWeight: 500
                                        }}
                                      >
                                        + Add Role
                                      </button>
                                      {openPermissionDropdown === dropdownKey && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          marginTop: '0.25rem',
                                          backgroundColor: 'white',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '0.375rem',
                                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                          zIndex: 50,
                                          minWidth: '120px'
                                        }}>
                                          {rolesWithoutPerm.map(role => (
                                            <button
                                              key={role.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddRoleToPermission(role.id, permKey);
                                                setOpenPermissionDropdown(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                fontSize: '0.8rem',
                                                color: '#374151',
                                                cursor: 'pointer'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: role.color, marginRight: '0.5rem' }} />
                                              {role.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {rolesWithPerm.length === 0 && (!canEditRoles || rolesWithoutPerm.length === 0) && (
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>No roles</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Item Sales Section - Accordion */}
              {canViewSales && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('sales')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.25rem 1.75rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: SECTION_TITLE_COLOR }}>
                      Item Sales
                    </h2>
                    <FaChevronDown style={{
                      color: SECTION_TITLE_COLOR,
                      transition: 'transform 0.2s',
                      transform: expandedSections.includes('sales') ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {expandedSections.includes('sales') && (
                    <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
                      {/* Permissions Subsection */}
                      <div style={{ paddingTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                          Permissions
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {salesPermissions.map((permKey) => {
                            const rolesWithPerm = getRolesWithPermission(permKey);
                            const rolesWithoutPerm = getRolesWithoutPermission(permKey);
                            const dropdownKey = `sales-${permKey}`;
                            return (
                              <div key={permKey} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#374151', minWidth: '180px' }}>
                                  {getPermissionLabel(permKey)}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                                  {rolesWithPerm.map(role => (
                                    <span
                                      key={role.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        backgroundColor: `${role.color}20`,
                                        color: role.color,
                                        border: `1px solid ${role.color}40`
                                      }}
                                    >
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: role.color }} />
                                      {role.name}
                                      {canEditRoles && !role.isProtected && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRoleFromPermission(role.id, permKey);
                                          }}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.125rem',
                                            color: role.color,
                                            fontSize: '0.875rem',
                                            lineHeight: 1
                                          }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {canEditRoles && rolesWithoutPerm.length > 0 && (
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        type="button"
                                        onClick={() => setOpenPermissionDropdown(openPermissionDropdown === dropdownKey ? null : dropdownKey)}
                                        style={{
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: '9999px',
                                          border: '1px dashed #3b82f6',
                                          backgroundColor: 'transparent',
                                          fontSize: '0.75rem',
                                          color: '#3b82f6',
                                          cursor: 'pointer',
                                          fontWeight: 500
                                        }}
                                      >
                                        + Add Role
                                      </button>
                                      {openPermissionDropdown === dropdownKey && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          marginTop: '0.25rem',
                                          backgroundColor: 'white',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '0.375rem',
                                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                          zIndex: 50,
                                          minWidth: '120px'
                                        }}>
                                          {rolesWithoutPerm.map(role => (
                                            <button
                                              key={role.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddRoleToPermission(role.id, permKey);
                                                setOpenPermissionDropdown(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                fontSize: '0.8rem',
                                                color: '#374151',
                                                cursor: 'pointer'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: role.color, marginRight: '0.5rem' }} />
                                              {role.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {rolesWithPerm.length === 0 && (!canEditRoles || rolesWithoutPerm.length === 0) && (
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>No roles</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Inventory Section - Accordion */}
              {canViewInventory && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('inventory')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.25rem 1.75rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: SECTION_TITLE_COLOR }}>
                      Inventory
                    </h2>
                    <FaChevronDown style={{
                      color: SECTION_TITLE_COLOR,
                      transition: 'transform 0.2s',
                      transform: expandedSections.includes('inventory') ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {expandedSections.includes('inventory') && (
                    <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
                      {/* Required Fields Subsection */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '0.75rem', marginTop: 0 }}>
                          Entering new item: choose which fields are required when adding inventory.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem 1.5rem' }}>
                          {[
                            { key: 'brand', label: 'Brand' },
                            { key: 'itemName', label: 'Item Name' },
                            { key: 'itemType', label: 'Item Type' },
                            { key: 'purchasePrice', label: 'Purchase Price' },
                            { key: 'sellingPrice', label: 'Selling Price' },
                            { key: 'addedStock', label: 'Added Stock' },
                            { key: 'restockLevel', label: 'Restock Level' },
                            { key: 'discount', label: 'Discount' },
                          ].map(({ key, label }) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: '#111827', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={inventoryRequiredFields[key] ?? false}
                                onChange={(e) => {
                                  const newFields = { ...inventoryRequiredFields, [key]: e.target.checked };
                                  setInventoryRequiredFields(newFields);
                                  saveRequiredFields('inventory', newFields);
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Permissions Subsection */}
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                          Permissions
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {inventoryPermissions.map((permKey) => {
                            const rolesWithPerm = getRolesWithPermission(permKey);
                            const rolesWithoutPerm = getRolesWithoutPermission(permKey);
                            const dropdownKey = `inventory-${permKey}`;
                            return (
                              <div key={permKey} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#374151', minWidth: '180px' }}>
                                  {getPermissionLabel(permKey)}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                                  {rolesWithPerm.map(role => (
                                    <span
                                      key={role.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        backgroundColor: `${role.color}20`,
                                        color: role.color,
                                        border: `1px solid ${role.color}40`
                                      }}
                                    >
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: role.color }} />
                                      {role.name}
                                      {canEditRoles && !role.isProtected && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRoleFromPermission(role.id, permKey);
                                          }}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.125rem',
                                            color: role.color,
                                            fontSize: '0.875rem',
                                            lineHeight: 1
                                          }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {canEditRoles && rolesWithoutPerm.length > 0 && (
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        type="button"
                                        onClick={() => setOpenPermissionDropdown(openPermissionDropdown === dropdownKey ? null : dropdownKey)}
                                        style={{
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: '9999px',
                                          border: '1px dashed #3b82f6',
                                          backgroundColor: 'transparent',
                                          fontSize: '0.75rem',
                                          color: '#3b82f6',
                                          cursor: 'pointer',
                                          fontWeight: 500
                                        }}
                                      >
                                        + Add Role
                                      </button>
                                      {openPermissionDropdown === dropdownKey && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          marginTop: '0.25rem',
                                          backgroundColor: 'white',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '0.375rem',
                                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                          zIndex: 50,
                                          minWidth: '120px'
                                        }}>
                                          {rolesWithoutPerm.map(role => (
                                            <button
                                              key={role.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddRoleToPermission(role.id, permKey);
                                                setOpenPermissionDropdown(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                fontSize: '0.8rem',
                                                color: '#374151',
                                                cursor: 'pointer'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: role.color, marginRight: '0.5rem' }} />
                                              {role.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {rolesWithPerm.length === 0 && (!canEditRoles || rolesWithoutPerm.length === 0) && (
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>No roles</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Services Section - Accordion */}
              {canViewServices && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('services')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.25rem 1.75rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: SECTION_TITLE_COLOR }}>
                      Services
                    </h2>
                    <FaChevronDown style={{
                      color: SECTION_TITLE_COLOR,
                      transition: 'transform 0.2s',
                      transform: expandedSections.includes('services') ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {expandedSections.includes('services') && (
                    <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
                      {/* Required Fields Subsection */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '0.75rem', marginTop: 0 }}>
                          Entering new service: choose which fields are required when adding a new service.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem 1.5rem' }}>
                          {[
                            { key: 'serviceName', label: 'Service Name' },
                            { key: 'servicePrice', label: 'Service Price' },
                            { key: 'description', label: 'Description' },
                            { key: 'vehicleType', label: 'Vehicle Type' },
                          ].map(({ key, label }) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: '#111827', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={servicesRequiredFields[key] ?? false}
                                onChange={(e) => {
                                  const newFields = { ...servicesRequiredFields, [key]: e.target.checked };
                                  setServicesRequiredFields(newFields);
                                  saveRequiredFields('services', newFields);
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Vehicle Types List Subsection */}
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                          Vehicle Types List
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 0, marginBottom: '0.75rem' }}>
                          Manage the list of vehicle types available throughout the system.
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                          {vehicleTypes.map((type) => (
                            editingVehicleType?.id === type.id ? (
                              <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <input
                                  type="text"
                                  value={editingVehicleType.name}
                                  onChange={(e) => setEditingVehicleType({ ...editingVehicleType, name: e.target.value })}
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    border: '1px solid #3b82f6',
                                    fontSize: '0.8rem',
                                    width: '120px',
                                  }}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={handleUpdateVehicleType}
                                  style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingVehicleType(null)}
                                  style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div
                                key={type.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  padding: '0.25rem 0.5rem 0.25rem 0.75rem',
                                  borderRadius: '999px',
                                  backgroundColor: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  fontSize: '0.8rem',
                                  color: '#1d4ed8',
                                }}
                              >
                                <span>{type.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingVehicleType(type)}
                                  style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}
                                >
                                  Edit
                                </button>
                                <span style={{ color: '#bfdbfe' }}>|</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVehicleType(type.id)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}
                                >
                                  Delete
                                </button>
                              </div>
                            )
                          ))}
                          {isAddingVehicleType ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <input
                                type="text"
                                value={newVehicleTypeName}
                                onChange={(e) => setNewVehicleTypeName(e.target.value)}
                                placeholder="Type name"
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  border: '1px solid #3b82f6',
                                  fontSize: '0.8rem',
                                  width: '120px',
                                }}
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={handleAddVehicleType}
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => { setIsAddingVehicleType(false); setNewVehicleTypeName(''); }}
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsAddingVehicleType(true)}
                              style={{
                                padding: '0.25rem 0.6rem',
                                borderRadius: '999px',
                                border: '1px dashed #3b82f6',
                                backgroundColor: 'transparent',
                                fontSize: '0.8rem',
                                color: '#3b82f6',
                                cursor: 'pointer',
                              }}
                            >
                              + Add type
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Permissions Subsection */}
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                          Permissions
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {servicesPermissions.map((permKey) => {
                            const rolesWithPerm = getRolesWithPermission(permKey);
                            const rolesWithoutPerm = getRolesWithoutPermission(permKey);
                            const dropdownKey = `services-${permKey}`;
                            return (
                              <div key={permKey} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#374151', minWidth: '180px' }}>
                                  {getPermissionLabel(permKey)}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                                  {rolesWithPerm.map(role => (
                                    <span
                                      key={role.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        backgroundColor: `${role.color}20`,
                                        color: role.color,
                                        border: `1px solid ${role.color}40`
                                      }}
                                    >
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: role.color }} />
                                      {role.name}
                                      {canEditRoles && !role.isProtected && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRoleFromPermission(role.id, permKey);
                                          }}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.125rem',
                                            color: role.color,
                                            fontSize: '0.875rem',
                                            lineHeight: 1
                                          }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {canEditRoles && rolesWithoutPerm.length > 0 && (
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        type="button"
                                        onClick={() => setOpenPermissionDropdown(openPermissionDropdown === dropdownKey ? null : dropdownKey)}
                                        style={{
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: '9999px',
                                          border: '1px dashed #3b82f6',
                                          backgroundColor: 'transparent',
                                          fontSize: '0.75rem',
                                          color: '#3b82f6',
                                          cursor: 'pointer',
                                          fontWeight: 500
                                        }}
                                      >
                                        + Add Role
                                      </button>
                                      {openPermissionDropdown === dropdownKey && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          marginTop: '0.25rem',
                                          backgroundColor: 'white',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '0.375rem',
                                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                          zIndex: 50,
                                          minWidth: '120px'
                                        }}>
                                          {rolesWithoutPerm.map(role => (
                                            <button
                                              key={role.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddRoleToPermission(role.id, permKey);
                                                setOpenPermissionDropdown(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                fontSize: '0.8rem',
                                                color: '#374151',
                                                cursor: 'pointer'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: role.color, marginRight: '0.5rem' }} />
                                              {role.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {rolesWithPerm.length === 0 && (!canEditRoles || rolesWithoutPerm.length === 0) && (
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>No roles</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Customers Section - Accordion */}
              {canViewCustomers && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('customers')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.25rem 1.75rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: SECTION_TITLE_COLOR }}>
                      Customers
                    </h2>
                    <FaChevronDown style={{
                      color: SECTION_TITLE_COLOR,
                      transition: 'transform 0.2s',
                      transform: expandedSections.includes('customers') ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {expandedSections.includes('customers') && (
                    <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
                      {/* Required Fields Subsection */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '0.75rem', marginTop: 0 }}>
                          Adding new customer: choose which fields are required when adding a new customer.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem 1.5rem' }}>
                          {[
                            { key: 'customerName', label: 'Customer Name' },
                            { key: 'contactNumber', label: 'Contact Number' },
                            { key: 'email', label: 'Email' },
                            { key: 'address', label: 'Address' },
                            { key: 'vehicleType', label: 'Vehicle Type' },
                          ].map(({ key, label }) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: '#111827', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={customersRequiredFields[key] ?? false}
                                onChange={(e) => {
                                  const newFields = { ...customersRequiredFields, [key]: e.target.checked };
                                  setCustomersRequiredFields(newFields);
                                  saveRequiredFields('customers', newFields);
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Permissions Subsection */}
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                          Permissions
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {customersPermissions.map((permKey) => {
                            const rolesWithPerm = getRolesWithPermission(permKey);
                            const rolesWithoutPerm = getRolesWithoutPermission(permKey);
                            const dropdownKey = `customers-${permKey}`;
                            return (
                              <div key={permKey} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#374151', minWidth: '180px' }}>
                                  {getPermissionLabel(permKey)}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                                  {rolesWithPerm.map(role => (
                                    <span
                                      key={role.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        backgroundColor: `${role.color}20`,
                                        color: role.color,
                                        border: `1px solid ${role.color}40`
                                      }}
                                    >
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: role.color }} />
                                      {role.name}
                                      {canEditRoles && !role.isProtected && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRoleFromPermission(role.id, permKey);
                                          }}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.125rem',
                                            color: role.color,
                                            fontSize: '0.875rem',
                                            lineHeight: 1
                                          }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {canEditRoles && rolesWithoutPerm.length > 0 && (
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        type="button"
                                        onClick={() => setOpenPermissionDropdown(openPermissionDropdown === dropdownKey ? null : dropdownKey)}
                                        style={{
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: '9999px',
                                          border: '1px dashed #3b82f6',
                                          backgroundColor: 'transparent',
                                          fontSize: '0.75rem',
                                          color: '#3b82f6',
                                          cursor: 'pointer',
                                          fontWeight: 500
                                        }}
                                      >
                                        + Add Role
                                      </button>
                                      {openPermissionDropdown === dropdownKey && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          marginTop: '0.25rem',
                                          backgroundColor: 'white',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '0.375rem',
                                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                          zIndex: 50,
                                          minWidth: '120px'
                                        }}>
                                          {rolesWithoutPerm.map(role => (
                                            <button
                                              key={role.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddRoleToPermission(role.id, permKey);
                                                setOpenPermissionDropdown(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                fontSize: '0.8rem',
                                                color: '#374151',
                                                cursor: 'pointer'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: role.color, marginRight: '0.5rem' }} />
                                              {role.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {rolesWithPerm.length === 0 && (!canEditRoles || rolesWithoutPerm.length === 0) && (
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>No roles</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Returns Section - Accordion */}
              {canViewReturns && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
                    overflow: 'hidden',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('returns')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.25rem 1.75rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: SECTION_TITLE_COLOR }}>
                      Returns
                    </h2>
                    <FaChevronDown style={{
                      color: SECTION_TITLE_COLOR,
                      transition: 'transform 0.2s',
                      transform: expandedSections.includes('returns') ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {expandedSections.includes('returns') && (
                    <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
                      {/* Permissions Subsection */}
                      <div style={{ paddingTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                          Permissions
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {returnsPermissions.map((permKey) => {
                            const rolesWithPerm = getRolesWithPermission(permKey);
                            const rolesWithoutPerm = getRolesWithoutPermission(permKey);
                            const dropdownKey = `returns-${permKey}`;
                            return (
                              <div key={permKey} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#374151', minWidth: '180px' }}>
                                  {getPermissionLabel(permKey)}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                                  {rolesWithPerm.map(role => (
                                    <span
                                      key={role.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        backgroundColor: `${role.color}20`,
                                        color: role.color,
                                        border: `1px solid ${role.color}40`
                                      }}
                                    >
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: role.color }} />
                                      {role.name}
                                      {canEditRoles && !role.isProtected && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRoleFromPermission(role.id, permKey);
                                          }}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.125rem',
                                            color: role.color,
                                            fontSize: '0.875rem',
                                            lineHeight: 1
                                          }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {canEditRoles && rolesWithoutPerm.length > 0 && (
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        type="button"
                                        onClick={() => setOpenPermissionDropdown(openPermissionDropdown === dropdownKey ? null : dropdownKey)}
                                        style={{
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: '9999px',
                                          border: '1px dashed #3b82f6',
                                          backgroundColor: 'transparent',
                                          fontSize: '0.75rem',
                                          color: '#3b82f6',
                                          cursor: 'pointer',
                                          fontWeight: 500
                                        }}
                                      >
                                        + Add Role
                                      </button>
                                      {openPermissionDropdown === dropdownKey && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          marginTop: '0.25rem',
                                          backgroundColor: 'white',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '0.375rem',
                                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                          zIndex: 50,
                                          minWidth: '120px'
                                        }}>
                                          {rolesWithoutPerm.map(role => (
                                            <button
                                              key={role.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddRoleToPermission(role.id, permKey);
                                                setOpenPermissionDropdown(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                fontSize: '0.8rem',
                                                color: '#374151',
                                                cursor: 'pointer'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: role.color, marginRight: '0.5rem' }} />
                                              {role.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {rolesWithPerm.length === 0 && (!canEditRoles || rolesWithoutPerm.length === 0) && (
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>No roles</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Users Section - Accordion */}
              {canViewUsers && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection('users')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.25rem 1.75rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: SECTION_TITLE_COLOR }}>
                      Users
                    </h2>
                    <FaChevronDown style={{
                      color: SECTION_TITLE_COLOR,
                      transition: 'transform 0.2s',
                      transform: expandedSections.includes('users') ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {expandedSections.includes('users') && (
                    <div style={{ padding: '0 1.75rem 1.75rem 1.75rem' }}>
                      {/* Permissions Subsection */}
                      <div style={{ paddingTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                          Permissions
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {usersPermissions.map((permKey) => {
                            const rolesWithPerm = getRolesWithPermission(permKey);
                            const rolesWithoutPerm = getRolesWithoutPermission(permKey);
                            const dropdownKey = `users-${permKey}`;
                            return (
                              <div key={permKey} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#374151', minWidth: '180px' }}>
                                  {getPermissionLabel(permKey)}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                                  {rolesWithPerm.map(role => (
                                    <span
                                      key={role.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        padding: '0.125rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        backgroundColor: `${role.color}20`,
                                        color: role.color,
                                        border: `1px solid ${role.color}40`
                                      }}
                                    >
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: role.color }} />
                                      {role.name}
                                      {canEditRoles && !role.isProtected && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveRoleFromPermission(role.id, permKey);
                                          }}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '0 0.125rem',
                                            color: role.color,
                                            fontSize: '0.875rem',
                                            lineHeight: 1
                                          }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {canEditRoles && rolesWithoutPerm.length > 0 && (
                                    <div style={{ position: 'relative' }}>
                                      <button
                                        type="button"
                                        onClick={() => setOpenPermissionDropdown(openPermissionDropdown === dropdownKey ? null : dropdownKey)}
                                        style={{
                                          padding: '0.125rem 0.5rem',
                                          borderRadius: '9999px',
                                          border: '1px dashed #3b82f6',
                                          backgroundColor: 'transparent',
                                          fontSize: '0.75rem',
                                          color: '#3b82f6',
                                          cursor: 'pointer',
                                          fontWeight: 500
                                        }}
                                      >
                                        + Add Role
                                      </button>
                                      {openPermissionDropdown === dropdownKey && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          marginTop: '0.25rem',
                                          backgroundColor: 'white',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '0.375rem',
                                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                          zIndex: 50,
                                          minWidth: '120px'
                                        }}>
                                          {rolesWithoutPerm.map(role => (
                                            <button
                                              key={role.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddRoleToPermission(role.id, permKey);
                                                setOpenPermissionDropdown(null);
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                padding: '0.5rem 0.75rem',
                                                textAlign: 'left',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                fontSize: '0.8rem',
                                                color: '#374151',
                                                cursor: 'pointer'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: role.color, marginRight: '0.5rem' }} />
                                              {role.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {rolesWithPerm.length === 0 && (!canEditRoles || rolesWithoutPerm.length === 0) && (
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>No roles</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Create Role Modal */}
      {isCreatingRole && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setIsCreatingRole(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '450px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: '1rem', fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
              Create New Role
            </h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Role Name
              </label>
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g., Manager"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  backgroundColor: 'white',
                  color: '#111827',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Role Color
              </label>
              {/* Preset color palette */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {['#3b82f6', '#2563eb', '#1e88e5', '#0d47a1', '#10b981', '#059669', '#f59e0b', '#d97706', '#ef4444', '#dc2626', '#8b5cf6', '#7c3aed', '#ec4899', '#6b7280', '#374151'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewRoleColor(color)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '0.375rem',
                      backgroundColor: color,
                      border: newRoleColor === color ? '2px solid #111827' : '1px solid #d1d5db',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    title={color}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="color"
                  value={newRoleColor}
                  onChange={(e) => setNewRoleColor(e.target.value)}
                  style={{ width: '50px', height: '36px', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={newRoleColor}
                  onChange={(e) => setNewRoleColor(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                    backgroundColor: 'white',
                    color: '#111827',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsCreatingRole(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  color: '#374151',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateRole}
                disabled={!newRoleName.trim() || isSavingRole}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  fontSize: '0.875rem',
                  cursor: newRoleName.trim() && !isSavingRole ? 'pointer' : 'not-allowed',
                  opacity: newRoleName.trim() && !isSavingRole ? 1 : 0.6,
                }}
              >
                {isSavingRole ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setEditingRole(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: '1rem', fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
              Edit Role: {editingRole.name}
            </h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Role Name
              </label>
              <input
                type="text"
                value={editingRole.name}
                onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  backgroundColor: 'white',
                  color: '#111827',
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Role Color
              </label>
              {/* Preset color palette */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {['#3b82f6', '#2563eb', '#1e88e5', '#0d47a1', '#10b981', '#059669', '#f59e0b', '#d97706', '#ef4444', '#dc2626', '#8b5cf6', '#7c3aed', '#ec4899', '#6b7280', '#374151'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditingRole({ ...editingRole, color })}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '0.375rem',
                      backgroundColor: color,
                      border: editingRole.color === color ? '2px solid #111827' : '1px solid #d1d5db',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    title={color}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="color"
                  value={editingRole.color}
                  onChange={(e) => setEditingRole({ ...editingRole, color: e.target.value })}
                  style={{ width: '50px', height: '36px', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={editingRole.color}
                  onChange={(e) => setEditingRole({ ...editingRole, color: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                    backgroundColor: 'white',
                    color: '#111827',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Permissions
              </label>
              <style>{`
                .permissions-scroll::-webkit-scrollbar {
                  width: 6px;
                }
                .permissions-scroll::-webkit-scrollbar-track {
                  background: transparent;
                }
                .permissions-scroll::-webkit-scrollbar-thumb {
                  background: rgba(0, 0, 0, 0.15);
                  border-radius: 3px;
                }
                .permissions-scroll::-webkit-scrollbar-thumb:hover {
                  background: rgba(0, 0, 0, 0.25);
                }
              `}</style>
              <div
                className="permissions-scroll"
                style={{
                  maxHeight: '300px',
                  overflow: 'overlay' as any,
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(0,0,0,0.15) transparent',
                }}
              >
                {permissionGroups.map((group) => {
                  const isExpanded = expandedPermissionGroups.includes(group.category);
                  const enabledCount = group.permissions.filter(p => editingRole.permissions[p.key] === true).length;

                  return (
                    <div key={group.category} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      {/* Accordion Header */}
                      <button
                        type="button"
                        onClick={() => togglePermissionGroup(group.category)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem',
                          backgroundColor: '#f9fafb',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            color: '#6b7280',
                            transition: 'transform 0.2s',
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          }}>
                            ▶
                          </span>
                          <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151' }}>
                            {group.category}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '0.7rem',
                          color: '#6b7280',
                          backgroundColor: enabledCount > 0 ? '#dbeafe' : '#f3f4f6',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                        }}>
                          {enabledCount}/{group.permissions.length}
                        </span>
                      </button>

                      {/* Accordion Content */}
                      {isExpanded && (
                        <div style={{ backgroundColor: 'white' }}>
                          {group.permissions.map((perm) => (
                            <label
                              key={perm.key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.5rem 0.75rem 0.5rem 1.75rem',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f3f4f6',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={editingRole.permissions[perm.key] === true}
                                onChange={() => togglePermission(perm.key)}
                              />
                              <div>
                                <div style={{ fontSize: '0.85rem', color: '#111827' }}>{perm.label}</div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{perm.key}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => handleDeleteRole(editingRole.id)}
                disabled={editingRole.isProtected}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  backgroundColor: editingRole.isProtected ? '#e5e7eb' : '#ef4444',
                  color: editingRole.isProtected ? '#9ca3af' : 'white',
                  fontSize: '0.875rem',
                  cursor: editingRole.isProtected ? 'not-allowed' : 'pointer',
                }}
              >
                Delete Role
              </button>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setEditingRole(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'white',
                    color: '#374151',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpdateRole}
                  disabled={isSavingRole}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    fontSize: '0.875rem',
                    cursor: isSavingRole ? 'not-allowed' : 'pointer',
                    opacity: isSavingRole ? 0.6 : 1,
                  }}
                >
                  {isSavingRole ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
