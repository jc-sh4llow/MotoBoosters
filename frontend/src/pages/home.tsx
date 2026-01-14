// In home.tsx
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRoles } from '../contexts/PermissionsContext';
import { can } from '../config/permissions';
import { useEffectiveRoleIds } from '../hooks/useEffectiveRoleIds';
import logo from '../assets/logo.png';

import {
  FaWarehouse,
  FaTag,
  FaWrench,
  FaFileInvoice,
  FaPlus,
  FaUser,
  FaUndoAlt,
  FaCog,
} from 'react-icons/fa';

export function Home() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();  // Moved inside the component
  const { loading: rolesLoading } = useRoles();
  const { effectiveRoleIds } = useEffectiveRoleIds();

  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

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

  const baseMenuItems = [
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

  const canSeePath = (path: string) => {
    const key = pathPermissionMap[path];
    if (!key) return true;
    return can(effectiveRoleIds, key as any);
  };

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Show all menu items while loading to prevent empty dashboard flash
  const menuItems = rolesLoading && effectiveRoleIds.length === 0
    ? baseMenuItems
    : baseMenuItems.filter((item) => canSeePath(item.path));

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {/* Update the background gradient div with these styles */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: -1,
        background: 'var(--bg-gradient)',
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat'
      }} />

      
      <div style={{
        width: '100%',
        maxWidth: '1400px',
        margin: '2rem auto',
        padding: '0 2rem'
      }}>
        <header style={{
          backgroundColor: 'var(--surface)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '1.5rem 2rem',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
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
                style={{
                  height: '100%',
                  width: 'auto',
                  objectFit: 'contain',
                }}
              />
            </div>
            <h1 style={{
              fontSize: '1.875rem',
              fontWeight: 'bold',
              color: 'var(--header-title)',
              margin: 0,
            }}>
              MotoBooster
            </h1>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{
              color: 'var(--text)',
              fontSize: '0.9rem'
            }}>
              Welcome, {user ? user.name : 'Guest'}
            </div>
            {user ? (
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--logout-button)',
                  color: 'var(--logout-button)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Logout
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                style={{
                  backgroundColor: 'white',
                  border: 'none',
                  color: 'var(--login-button)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Login
              </button>
            )}
          </div>
        </header>
      </div>

      {/* Main Content */}
      <main style={{
        flex: 1,
        position: 'relative',
        zIndex: 5
      }}>
        <div style={{
          width: '100%',
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 2rem'
        }}>
          <div style={{
            backgroundColor: 'var(--surface)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            padding: '2.5rem',
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
            border: '1px solid var(--border)'
          }}>
            <div style={{
              width: '100%',
              maxWidth: '1400px',
              padding: '2.5rem'
            }}>
              <h1 style={{
                color: 'var(--header-title)',
                fontSize: '2rem',
                fontWeight: 'bold',
                marginBottom: '2rem',
                textAlign: 'center',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}>
                Dashboard
              </h1>

              <div style={{
                display: 'grid',
                gridTemplateColumns: viewportWidth <= 479 ? '1fr' : viewportWidth <= 991 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                gap: '1.5rem',
                width: '100%'
              }}>
                {menuItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => {
                      console.log('Navigating to:', item.path); // For debugging
                      navigate(item.path);
                    }}
                    style={{
                      height: '9rem',
                      backgroundColor: 'var(--surface-elevated)',
                      border: 'none',
                      borderRadius: '0.75rem',
                      padding: '1.5rem',
                      textAlign: 'center',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      fontSize: '1.1rem',
                      color: 'var(--text)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.75rem'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                      e.currentTarget.style.backgroundColor = 'var(--surface-elevated)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                      e.currentTarget.style.backgroundColor = 'var(--surface-elevated)';
                    }}
                  >
                    <div style={{
                      width: '3rem',
                      height: '3rem',
                      borderRadius: '9999px',
                      backgroundColor: '#e0f2fe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0369a1',
                      fontSize: '1.5rem'
                    }}>
                      {item.icon}
                    </div>
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        backgroundColor: 'rgba(26, 86, 219, 0.95)',
        color: 'rgba(255, 255, 255, 0.8)',
        padding: '1rem',
        textAlign: 'center',
        fontSize: '0.875rem',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          © {new Date().getFullYear()} MotoBooster. All rights reserved.
        </div>
      </footer>
    </div>
  );
}