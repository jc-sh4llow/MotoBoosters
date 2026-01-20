import { useNavigate, useLocation } from 'react-router-dom';
import { FaHome, FaWarehouse, FaTag, FaWrench, FaFileInvoice, FaPlus, FaUser, FaUndoAlt, FaCog, FaTimes, FaSearch } from 'react-icons/fa';
import { can, DEVELOPER_ROLE_ID } from '../config/permissions';
import { useRolePreview } from '../contexts/RolePreviewContext';
import { useRoles } from '../contexts/PermissionsContext';
import { useEffectiveRoleIds } from '../hooks/useEffectiveRoleIds';
import { useState, useRef, useEffect } from 'react';
import { HelpButton } from './HelpButton';

interface HeaderDropdownProps {
  isNavExpanded: boolean;
  setIsNavExpanded: (expanded: boolean) => void;
  isMobile: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  // Page-specific props
  currentPage?: string;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
  onLogout?: () => void;
  userName?: string;
}

// All menu items in the correct order
const allMenuItems = [
  { title: 'New Transaction', path: '/transactions/new', icon: <FaPlus /> },
  { title: 'Transactions', path: '/transactions', icon: <FaFileInvoice /> },
  { title: 'Item Sales', path: '/sales', icon: <FaTag /> },
  { title: 'Inventory', path: '/inventory', icon: <FaWarehouse /> },
  { title: 'Services', path: '/services', icon: <FaWrench /> },
  { title: 'Customers', path: '/customers', icon: <FaUser /> },
  { title: 'Returns', path: '/returns', icon: <FaUndoAlt /> },
  { title: 'Users', path: '/users', icon: <FaUser /> },
  { title: 'Settings', path: '/settings', icon: <FaCog /> },
];

// Path to permission mapping
const pathPermissionMap: Record<string, string> = {
  '/': 'page.home.view',
  '/inventory': 'page.inventory.view',
  '/sales': 'page.sales.view',
  '/services': 'page.services.view',
  '/transactions': 'page.transactions.view',
  '/transactions/new': 'page.transactions.view',
  '/returns': 'page.returns.view',
  '/customers': 'page.customers.view',
  '/users': 'page.users.view',
  '/settings': 'page.settings.view',
};

export function HeaderDropdown({
  isNavExpanded,
  setIsNavExpanded,
  isMobile,
  onMouseEnter,
  onMouseLeave,
  currentPage,
  searchTerm,
  onSearchChange,
  onLogout,
  userName,
}: HeaderDropdownProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const { enabled: previewEnabled, previewRoleId, startPreview, stopPreview } = useRolePreview();
  const { roles } = useRoles();
  const { actualRoleIds, effectiveRoleIds } = useEffectiveRoleIds();
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        if (isNavExpanded) {
          setIsNavExpanded(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNavExpanded, setIsNavExpanded]);

  // Check if user can see a path based on permissions (using effective roles for preview)
  const canSeePath = (path: string) => {
    const key = pathPermissionMap[path];
    if (!key) return true;
    return can(effectiveRoleIds, key as any);
  };

  // Compute allowed preview roles (only when preview is enabled)
  const allowedPreviewRoles = previewEnabled ? roles.filter((role) => {
    const actualPositions = actualRoleIds.map((id) => {
      if (id === DEVELOPER_ROLE_ID) return 0;
      const r = roles.find((r) => r.id === id);
      return typeof r?.position === 'number' ? r.position : Infinity;
    });
    const myTopPosition = Math.min(...actualPositions);
    const rolePosition = role.id === DEVELOPER_ROLE_ID ? 0 : role.position;
    return rolePosition >= myTopPosition;
  }) : [];

  // Find current page info
  const currentPageItem = allMenuItems.find(item => item.path === currentPath);

  // Filter menu items: exclude current page, only show items user has permission for
  const otherMenuItems = allMenuItems.filter(
    item => item.path !== currentPath && canSeePath(item.path)
  );

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: '0',
        backgroundColor: 'var(--surface-elevated)',
        borderRadius: '0.5rem',
        padding: isNavExpanded ? '0.5rem 0' : 0,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        minWidth: '220px',
        zIndex: 1000,
        overflow: 'hidden',
        maxHeight: isNavExpanded ? '600px' : '0',
        transition: 'all 0.3s ease-out',
        pointerEvents: isNavExpanded ? 'auto' : 'none',
        border: isNavExpanded ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid transparent',
        opacity: isNavExpanded ? 1 : 0,
        transform: isNavExpanded ? 'translateY(0)' : 'translateY(-10px)',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Mobile-only: Search Icon + Logout Button Row */}
      {isMobile && (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
          }}>
            {/* Search Icon Button - Show for pages with search functionality */}
            {(currentPage === 'inventory' || currentPage === 'users' || currentPage === 'sales' || currentPage === 'transactions' || currentPage === 'services' || currentPage === 'customers' || currentPage === 'returns') && onSearchChange && (
              <button
                onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  color: '#1f2937',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <FaSearch style={{ fontSize: '0.9rem' }} />
                Search
              </button>
            )}

            {/* Logout Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'white',
                  border: '1px solid #dc2626',
                  borderRadius: '0.375rem',
                  color: '#dc2626',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Logout
              </button>
            )}
          </div>

          {/* Expandable Search Bar - For pages with search functionality */}
          {(currentPage === 'inventory' || currentPage === 'users' || currentPage === 'sales' || currentPage === 'transactions' || currentPage === 'services' || currentPage === 'customers' || currentPage === 'returns') && onSearchChange && isSearchExpanded && (
            <div style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              animation: 'slideDown 0.2s ease-out',
            }}>
              <div style={{ position: 'relative' }}>
                <FaSearch
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af',
                    fontSize: '0.875rem',
                  }}
                />
                <input
                  type="text"
                  placeholder={
                    currentPage === 'users' ? 'Search by Name or Username...' :
                    currentPage === 'transactions' ? 'Search by Customer or Transaction ID...' :
                    currentPage === 'services' ? 'Search by any field...' :
                    currentPage === 'customers' ? 'Search customers...' :
                    currentPage === 'returns' ? 'Search returns...' :
                    'Search by Brand or Item Name...'
                  }
                  value={searchTerm || ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 2.5rem 0.5rem 2.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'white',
                    color: '#1f2937',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => onSearchChange('')}
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
                    <FaTimes size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {/* Current page (highlighted at top) */}
      {currentPageItem && (
        <button
          onClick={() => {
            navigate(currentPageItem.path);
            setIsNavExpanded(false);
          }}
          style={{
            background: '#eff6ff',
            border: 'none',
            color: '#1d4ed8',
            padding: '0.75rem 1.25rem',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontWeight: 500,
          }}
        >
          <span
            style={{
              fontSize: '1.1rem',
              color: '#1d4ed8',
              width: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {currentPageItem.icon}
          </span>
          <span>{currentPageItem.title}</span>
        </button>
      )}

      {/* Help Button - Below current page indicator */}
      <div style={{ padding: '0 1.25rem' }}>
        <HelpButton currentPage={currentPath} isMobile={isMobile} />
      </div>

      {/* Home button */}
      <button
        onClick={() => {
          navigate('/');
          setIsNavExpanded(false);
        }}
        style={{
          background: currentPath === '/' ? '#eff6ff' : 'white',
          border: 'none',
          color: currentPath === '/' ? '#1d4ed8' : '#1f2937',
          padding: '0.75rem 1.25rem',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          transition: 'background-color 0.2s ease',
          fontWeight: currentPath === '/' ? 500 : 'normal',
        }}
      >
        <span
          style={{
            fontSize: '1.1rem',
            color: currentPath === '/' ? '#1d4ed8' : '#4b5563',
            width: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FaHome />
        </span>
        <span
          style={{
            fontSize: '0.95rem',
            fontWeight: 500,
          }}
        >
          Home
        </span>
      </button>

      {/* Divider */}
      <div
        style={{
          height: '1px',
          backgroundColor: '#e5e7eb',
          margin: '0.25rem 0',
        }}
      />

      {/* Other menu items */}
      {otherMenuItems.map((item) => (
        <button
          key={item.path}
          onClick={() => {
            navigate(item.path);
            setIsNavExpanded(false);
          }}
          style={{
            background: 'white',
            border: 'none',
            color: '#1f2937',
            padding: '0.75rem 1.25rem',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            transition: 'background-color 0.2s ease',
          }}
        >
          <span
            style={{
              fontSize: '1.1rem',
              color: '#4b5563',
              width: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.icon}
          </span>
          <span
            style={{
              fontSize: '0.95rem',
              fontWeight: 500,
            }}
          >
            {item.title}
          </span>
        </button>
      ))}

      {/* Role Preview Controls - Only visible when preview is enabled */}
      {previewEnabled && (
        <>
          <div
            style={{
              height: '1px',
              backgroundColor: '#e5e7eb',
              margin: '0.25rem 0',
            }}
          />
          <div
            style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: '#eff6ff',
            }}
          >
            <p
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#1e40af',
                margin: '0 0 0.5rem 0',
              }}
            >
              Role Preview Active
            </p>
            <p
              style={{
                fontSize: '0.7rem',
                color: '#6b7280',
                margin: '0 0 0.5rem 0',
              }}
            >
              Viewing as: {roles.find(r => r.id === previewRoleId)?.name || previewRoleId}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                style={{
                  padding: '0.4rem 0.5rem',
                  borderRadius: '0.25rem',
                  border: '1px solid #d1d5db',
                  fontSize: '0.8rem',
                  backgroundColor: 'white',
                }}
              >
                <option value="">Switch role...</option>
                {allowedPreviewRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedRoleId) {
                      startPreview(selectedRoleId);
                      setSelectedRoleId('');
                    }
                  }}
                  disabled={!selectedRoleId}
                  style={{
                    flex: 1,
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.25rem',
                    border: 'none',
                    backgroundColor: selectedRoleId ? '#2563eb' : '#d1d5db',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: selectedRoleId ? 'pointer' : 'not-allowed',
                  }}
                >
                  Switch
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopPreview();
                    setIsNavExpanded(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #dc2626',
                    backgroundColor: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <FaTimes style={{ fontSize: '0.7rem' }} /> Exit
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default HeaderDropdown;
