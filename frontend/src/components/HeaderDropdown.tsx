import { useNavigate, useLocation } from 'react-router-dom';
import { FaHome, FaWarehouse, FaTag, FaWrench, FaFileInvoice, FaPlus, FaUser, FaUndoAlt, FaCog } from 'react-icons/fa';
import { can } from '../config/permissions';

interface HeaderDropdownProps {
  isNavExpanded: boolean;
  setIsNavExpanded: (expanded: boolean) => void;
  isMobile: boolean;
  userRoles: string[];
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
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
  userRoles,
  onMouseEnter,
  onMouseLeave,
}: HeaderDropdownProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  // Check if user can see a path based on permissions
  const canSeePath = (path: string) => {
    const key = pathPermissionMap[path];
    if (!key) return true;
    return can(userRoles, key as any);
  };

  // Find current page info
  const currentPageItem = allMenuItems.find(item => item.path === currentPath);
  
  // Filter menu items: exclude current page, only show items user has permission for
  const otherMenuItems = allMenuItems.filter(
    item => item.path !== currentPath && canSeePath(item.path)
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        right: '0',
        backgroundColor: 'white',
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
    </div>
  );
}

export default HeaderDropdown;
