import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHome, FaBars, FaWarehouse, FaTag, FaWrench, FaPlus, FaFileInvoice, FaUser, FaUndoAlt, FaSearch, FaTimes } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';
import { defaultPermissions, pageViewPermissions, can, type PermissionKey } from '../config/permissions';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { usePermissions } from '../contexts/PermissionsContext';

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { usingDefaultsOnly } = usePermissions();

  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchTerm, setSearchTerm] = useState('');
  let closeMenuTimeout: number | undefined;

  const [isSeedingPermissions, setIsSeedingPermissions] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  const currentRole = (user?.role || '').toString().toLowerCase();
  const isAdminLike = currentRole === 'superadmin' || currentRole === 'admin';

  const handleTogglePageVisibility = async (
    role: string,
    permissionKey: PermissionKey,
    nextChecked: boolean
  ) => {
    try {
      const normalizedRole = role.toLowerCase();
      const ref = doc(collection(db, 'rolePermissions'), normalizedRole);
      await setDoc(ref, { [permissionKey]: nextChecked }, { merge: true });
    } catch (err) {
      console.error('Failed to update page visibility permission in Firestore', err);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = [
    { title: 'Inventory', path: '/inventory', icon: <FaWarehouse /> },
    { title: 'Sales Records', path: '/sales', icon: <FaTag /> },
    { title: 'Services Offered', path: '/services', icon: <FaWrench /> },
    { title: 'New Transaction', path: '/transactions/new', icon: <FaPlus /> },
    { title: 'Transaction History', path: '/transactions', icon: <FaFileInvoice /> },
    { title: 'Customers', path: '/customers', icon: <FaUser /> },
    { title: 'User Management', path: '/users', icon: <FaUser /> },
    { title: 'Returns & Refunds', path: '/returns', icon: <FaUndoAlt /> },
  ];

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
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            padding: '1rem 2rem',
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
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
                    color: 'white',
                    margin: 0,
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  Settings
                </h1>
                <span
                  style={{
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontSize: '0.9rem',
                  }}
                >
                  Global website configuration
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.9rem' }}>
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
                    border: '1px solid rgba(255, 255, 255, 0.2)',
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
                    border: '1px solid white',
                    color: 'white',
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
                  color: 'white',
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
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  padding: isNavExpanded ? '0.5rem 0' : 0,
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  minWidth: '220px',
                  zIndex: 1000,
                  overflow: 'hidden',
                  maxHeight: isNavExpanded ? '500px' : '0',
                  transition: 'all 0.3s ease-out',
                  pointerEvents: isNavExpanded ? 'auto' : 'none',
                  border: isNavExpanded ? '1px solid rgba(0, 0, 0, 0.1)' : 'none',
                }}
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
              >
                {menuItems.map((item) => (
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
            {/* Roles & Access Overview */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '1rem',
                padding: '1.75rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              }}
            >
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                Roles & Access Overview
              </h2>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#4b5563',
                  marginTop: 0,
                  marginBottom: '1rem',
                }}
              >
                High-level view of role levels and which pages each role can see. This is hardcoded for
                now and will later drive real RCAB logic.
              </p>
              {usingDefaultsOnly && (
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#6b7280',
                    marginTop: 0,
                    marginBottom: '0.75rem',
                  }}
                >
                  Currently showing built-in default permissions. Firestore overrides are not active.
                </p>
              )}

              {isAdminLike && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                    fontSize: '0.8rem',
                    color: '#4b5563',
                  }}
                >
                  <button
                    type="button"
                    disabled={isSeedingPermissions}
                    onClick={async () => {
                      setSeedStatus(null);
                      setIsSeedingPermissions(true);
                      try {
                        const roles: Array<'superadmin' | 'admin' | 'employee' | 'mechanic'> = [
                          'superadmin',
                          'admin',
                          'employee',
                          'mechanic',
                        ];

                        for (const role of roles) {
                          const payload: Record<string, boolean> = {};
                          (Object.keys(defaultPermissions) as Array<keyof typeof defaultPermissions>).forEach(
                            (key) => {
                              const allowedRoles = defaultPermissions[key] || [];
                              const isAllowed = allowedRoles.some(
                                (r) => String(r).toLowerCase() === role.toLowerCase()
                              );
                              if (isAllowed) {
                                payload[key] = true;
                              }
                            }
                          );

                          const ref = doc(collection(db, 'rolePermissions'), role);
                          await setDoc(ref, payload, { merge: false });
                        }

                        setSeedStatus('Firestore permissions initialized from current defaults.');
                      } catch (err) {
                        console.error('Failed to seed Firestore rolePermissions from defaults', err);
                        setSeedStatus('Failed to initialize Firestore permissions. Please try again.');
                      } finally {
                        setIsSeedingPermissions(false);
                      }
                    }}
                    style={{
                      padding: '0.35rem 0.8rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: isSeedingPermissions ? '#e5e7eb' : '#f9fafb',
                      color: '#111827',
                      fontSize: '0.8rem',
                      cursor: isSeedingPermissions ? 'default' : 'pointer',
                    }}
                  >
                    {isSeedingPermissions ? 'Initializing permissions...' : 'Initialize Firestore permissions from defaults'}
                  </button>
                  {seedStatus && (
                    <span
                      style={{
                        color: seedStatus.startsWith('Failed') ? '#b91c1c' : '#047857',
                      }}
                    >
                      {seedStatus}
                    </span>
                  )}
                </div>
              )}

              {/* Subsection 1: Role levels */}
              <div
                style={{
                  marginBottom: '1.25rem',
                  paddingBottom: '1rem',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '0.5rem',
                  }}
                >
                  Role Levels
                </div>
                <div
                  style={{
                    overflowX: 'auto',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.85rem',
                      minWidth: '420px',
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '0.45rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            borderTopLeftRadius: '0.5rem',
                            color: '#111827',
                          }}
                        >
                          Level
                        </th>
                        {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => (
                          <th
                            key={role}
                            style={{
                              textAlign: 'center',
                              padding: '0.45rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                            }}
                          >
                            {role.charAt(0).toUpperCase() + role.slice(1)}
                          </th>
                        ))}
                        <th
                          style={{
                            textAlign: 'center',
                            padding: '0.45rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            borderTopRightRadius: '0.5rem',
                            color: '#111827',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          + Add role
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { level: 1, role: 'superadmin' },
                        { level: 2, role: 'admin' },
                        { level: 3, role: 'employee' },
                        { level: 4, role: 'mechanic' },
                      ].map((row) => (
                        <tr key={row.level}>
                          <td
                            style={{
                              padding: '0.45rem 0.5rem',
                              borderBottom: '1px solid #e5e7eb',
                              fontWeight: 500,
                              color: '#111827',
                            }}
                          >
                            Level {row.level}
                          </td>
                          {['superadmin', 'admin', 'employee', 'mechanic'].map((r) => (
                            <td
                              key={r}
                              style={{
                                padding: '0.45rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                textAlign: 'center',
                                color: '#111827',
                              }}
                            >
                              {row.role === r ? '●' : ''}
                            </td>
                          ))}
                          <td
                            style={{
                              padding: '0.45rem 0.5rem',
                              borderBottom: '1px solid #e5e7eb',
                              textAlign: 'center',
                              color: '#9ca3af',
                              fontSize: '0.8rem',
                            }}
                          >
                            
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td
                          style={{
                            padding: '0.45rem 0.5rem',
                            borderBottom: '1px solid #e5e7eb',
                            fontWeight: 500,
                            color: '#111827',
                          }}
                        >
                          + Add level access
                        </td>
                        {['superadmin', 'admin', 'employee', 'mechanic'].map((r) => (
                          <td
                            key={r}
                            style={{
                              padding: '0.45rem 0.5rem',
                              borderBottom: '1px solid #e5e7eb',
                              textAlign: 'center',
                              color: '#9ca3af',
                            }}
                          >
                            
                          </td>
                        ))}
                        <td
                          style={{
                            padding: '0.45rem 0.5rem',
                            borderBottom: '1px solid #e5e7eb',
                            textAlign: 'center',
                            color: '#111827',
                            fontSize: '0.8rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          + Add level
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Subsection 2: Page visibility matrix */}
              <div>
                <div
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '0.5rem',
                  }}
                >
                  Page Visibility by Role
                </div>
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#6b7280',
                    marginBottom: '0.5rem',
                  }}
                >
                  Which roles can see each main page. These checkboxes are visual only for now.
                </div>
                <div
                  style={{
                    overflowX: 'auto',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.8rem',
                      minWidth: '720px',
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '0.45rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            borderTopLeftRadius: '0.5rem',
                            whiteSpace: 'nowrap',
                            color: '#111827',
                          }}
                        >
                          Role
                        </th>
                        {pageViewPermissions.map((page, idx) => (
                          <th
                            key={page.key}
                            style={{
                              textAlign: 'center',
                              padding: '0.45rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              whiteSpace: 'nowrap',
                              color: '#111827',
                              ...(idx === pageViewPermissions.length - 1
                                ? { borderTopRightRadius: '0.5rem' }
                                : {}),
                            }}
                          >
                            {page.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => {
                        const roleLower = role.toLowerCase();
                        return (
                          <tr key={role}>
                            <td
                              style={{
                                padding: '0.45rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                fontWeight: 500,
                                color: '#111827',
                                textTransform: 'capitalize',
                              }}
                            >
                              {roleLower}
                            </td>
                            {pageViewPermissions.map((page) => {
                              const canView = can(roleLower, page.key);
                              return (
                                <td
                                  key={page.key}
                                  style={{
                                    padding: '0.35rem 0.5rem',
                                    borderBottom: '1px solid #e5e7eb',
                                    textAlign: 'center',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    defaultChecked={canView}
                                    disabled={usingDefaultsOnly || !isAdminLike}
                                    onChange={(e) =>
                                      handleTogglePageVisibility(roleLower, page.key, e.target.checked)
                                    }
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {/* Inventory */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '1rem',
                padding: '1.75rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              }}
            >
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                Inventory
              </h2>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#4b5563',
                  marginBottom: '0.75rem',
                }}
              >
                Entering new item: choose which fields are required when adding inventory.
              </p>
              {usingDefaultsOnly && (
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#6b7280',
                    marginTop: 0,
                    marginBottom: '0.75rem',
                  }}
                >
                  RCAB in this section is based on default permissions because Firestore overrides are not active.
                </p>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '0.5rem 1.5rem',
                }}
              >
                {[
                  'Brand',
                  'Item Name',
                  'Item Type',
                  'Purchase Price',
                  'Selling Price',
                  'Added Stock',
                  'Restock Level',
                  'Discount',
                ].map((label) => (
                  <label
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.9rem',
                      color: '#111827',
                    }}
                  >
                    <input type="checkbox" defaultChecked />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div
                style={{
                  marginTop: '0.75rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid #e5e7eb',
                  fontSize: '0.85rem',
                  color: '#4b5563',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Profit Margin</div>
                <div>
                  Set a minimum allowed profit margin for new items to help prevent underpricing. (Static
                  placeholder for now.)
                </div>
              </div>

              <div
                style={{
                  marginTop: '0.9rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px dashed #e5e7eb',
                  fontSize: '0.85rem',
                  color: '#4b5563',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: '#111827' }}>
                  RCAB: Who can add inventory
                </div>
                <div
                  style={{
                    marginTop: '0.35rem',
                    overflowX: 'auto',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.8rem',
                      minWidth: '320px',
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '0.4rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#111827',
                            fontWeight: 600,
                          }}
                        >
                          Role
                        </th>
                        <th
                          style={{
                            textAlign: 'center',
                            padding: '0.4rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#111827',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Can add inventory
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => {
                        const roleLower = role.toLowerCase();
                        const canAdd = can(roleLower, 'inventory.add');
                        return (
                          <tr key={role}>
                            <td
                              style={{
                                padding: '0.4rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                color: '#111827',
                                textTransform: 'capitalize',
                                fontWeight: 500,
                              }}
                            >
                              {role}
                            </td>
                            <td
                              style={{
                                padding: '0.35rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                textAlign: 'center',
                              }}
                            >
                              <input
                                type="checkbox"
                                defaultChecked={canAdd}
                                disabled={usingDefaultsOnly || !isAdminLike}
                                onChange={(e) =>
                                  handleTogglePageVisibility(
                                    roleLower,
                                    'inventory.add',
                                    e.target.checked
                                  )
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Sales */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '1rem',
                padding: '1.75rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              }}
            >
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                Sales
              </h2>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#4b5563',
                  marginBottom: '0.5rem',
                }}
              >
                Placeholder for Sales configuration, including reporting defaults, date ranges, and
                visibility of archived or cancelled sales.
              </p>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: '#6b7280',
                  margin: 0,
                }}
              >
                Use this section later to standardize how sales data is summarized and filtered.
              </p>
            </div>

            {/* Services */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '1rem',
                padding: '1.75rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              }}
            >
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                Services
              </h2>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#4b5563',
                  marginBottom: '0.75rem',
                }}
              >
                Entering new service: core fields and vehicle-type settings.
              </p>
              {usingDefaultsOnly && (
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#6b7280',
                    marginTop: 0,
                    marginBottom: '0.75rem',
                  }}
                >
                  RCAB for who can add services is currently using default permissions (no Firestore overrides).
                </p>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '0.5rem 1.5rem',
                  marginBottom: '0.9rem',
                }}
              >
                {['Service Name', 'Service Price', 'Description'].map((label) => (
                  <label
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.9rem',
                      color: '#111827',
                    }}
                  >
                    <input type="checkbox" defaultChecked />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div
                style={{
                  marginTop: '0.25rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid #e5e7eb',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1.4fr)',
                  gap: '1.25rem',
                }}
              >
                {/* Vehicle types required toggle */}
                <div>
                  <div
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Vehicle Types - Required?
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.9rem',
                      color: '#111827',
                    }}
                  >
                    <input type="checkbox" defaultChecked />
                    <span>Vehicle type is required when creating a new service</span>
                  </label>
                </div>

                {/* Vehicle types list (static) */}
                <div>
                  <div
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Vehicle Types List
                  </div>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: '#6b7280',
                      marginTop: 0,
                      marginBottom: '0.5rem',
                    }}
                  >
                    Hardcoded example list. Later, you'll be able to add, edit, or delete vehicle
                    types from here.
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    {['Underbone', 'Scooter', 'Backbone', 'Tricycle'].map((type) => (
                      <div
                        key={type}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '999px',
                          backgroundColor: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          fontSize: '0.8rem',
                          color: '#1d4ed8',
                        }}
                      >
                        <span>{type}</span>
                        <span style={{ opacity: 0.7 }}>edit | delete</span>
                      </div>
                    ))}
                    <button
                      type="button"
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '999px',
                        border: '1px dashed #9ca3af',
                        backgroundColor: 'transparent',
                        fontSize: '0.8rem',
                        color: '#4b5563',
                        cursor: 'default',
                      }}
                    >
                      + Add type (placeholder)
                    </button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: '0.9rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px dashed #e5e7eb',
                  fontSize: '0.85rem',
                  color: '#4b5563',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: '#111827' }}>
                  RCAB: Who can add services
                </div>
                <div
                  style={{
                    marginTop: '0.35rem',
                    overflowX: 'auto',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.8rem',
                      minWidth: '320px',
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '0.4rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#111827',
                            fontWeight: 600,
                          }}
                        >
                          Role
                        </th>
                        <th
                          style={{
                            textAlign: 'center',
                            padding: '0.4rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#111827',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Can add services
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => {
                        const roleLower = role.toLowerCase();
                        const canAdd = can(roleLower, 'services.add');
                        return (
                          <tr key={role}>
                            <td
                              style={{
                                padding: '0.4rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                color: '#111827',
                                textTransform: 'capitalize',
                                fontWeight: 500,
                              }}
                            >
                              {role}
                            </td>
                            <td
                              style={{
                                padding: '0.35rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                textAlign: 'center',
                              }}
                            >
                              <input
                                type="checkbox"
                                defaultChecked={canAdd}
                                disabled={usingDefaultsOnly || !isAdminLike}
                                onChange={(e) =>
                                  handleTogglePageVisibility(
                                    roleLower,
                                    'services.add',
                                    e.target.checked
                                  )
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {usingDefaultsOnly && (
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: '#6b7280',
                      marginTop: 0,
                      marginBottom: '0.75rem',
                    }}
                  >
                    These matrices currently reflect the default, hardcoded permissions. Firestore overrides are not in effect.
                  </p>
                )}
              </div>
            </div>

            {/* New Transaction */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '1rem',
                padding: '1.75rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              }}
            >
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                New Transaction
              </h2>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#4b5563',
                  marginBottom: '0.75rem',
                }}
              >
                Step 1: Customer information  choose which fields are required when starting a new
                transaction.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '0.5rem 1.5rem',
                }}
              >
                {['Customer Name', 'Contact Number', 'Email', 'Handled By'].map((label) => (
                  <label
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.9rem',
                      color: '#111827',
                    }}
                  >
                    <input type="checkbox" defaultChecked />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Transaction History */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '1rem',
                padding: '1.75rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              }}
            >
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                Transaction History
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                  gap: '1.25rem',
                  fontSize: '0.9rem',
                  color: '#4b5563',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#111827' }}>
                    RCAB: Who can see Transaction History page
                  </div>
                  <div
                    style={{
                      marginTop: '0.35rem',
                      overflowX: 'auto',
                    }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.8rem',
                        minWidth: '320px',
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: 'left',
                              padding: '0.4rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                              fontWeight: 600,
                            }}
                          >
                            Role
                          </th>
                          <th
                            style={{
                              textAlign: 'center',
                              padding: '0.4rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Can view history
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => {
                          const roleLower = role.toLowerCase();
                          const canView = can(roleLower, 'page.transactions.view');
                          return (
                            <tr key={role}>
                              <td
                                style={{
                                  padding: '0.4rem 0.5rem',
                                  borderBottom: '1px solid #e5e7eb',
                                  color: '#111827',
                                  textTransform: 'capitalize',
                                  fontWeight: 500,
                                }}
                              >
                                {role}
                              </td>
                              <td
                                style={{
                                  padding: '0.35rem 0.5rem',
                                  borderBottom: '1px solid #e5e7eb',
                                  textAlign: 'center',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  defaultChecked={canView}
                                  disabled={usingDefaultsOnly || !isAdminLike}
                                  onChange={(e) =>
                                    handleTogglePageVisibility(
                                      roleLower,
                                      'page.transactions.view',
                                      e.target.checked
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {usingDefaultsOnly && (
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: '#6b7280',
                        marginTop: 0,
                        marginBottom: '0.75rem',
                      }}
                    >
                      These matrices currently reflect the default, hardcoded permissions. Firestore overrides are not in effect.
                    </p>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#111827' }}>
                    RCAB: Who can delete transactions
                  </div>
                  <div
                    style={{
                      marginTop: '0.35rem',
                      overflowX: 'auto',
                    }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.8rem',
                        minWidth: '320px',
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: 'left',
                              padding: '0.4rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                              fontWeight: 600,
                            }}
                          >
                            Role
                          </th>
                          <th
                            style={{
                              textAlign: 'center',
                              padding: '0.4rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Can delete (archive)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => {
                          const roleLower = role.toLowerCase();
                          const canDelete = can(roleLower, 'transactions.delete');
                          return (
                            <tr key={role}>
                              <td
                                style={{
                                  padding: '0.4rem 0.5rem',
                                  borderBottom: '1px solid #e5e7eb',
                                  color: '#111827',
                                  textTransform: 'capitalize',
                                  fontWeight: 500,
                                }}
                              >
                                {role}
                              </td>
                              <td
                                style={{
                                  padding: '0.35rem 0.5rem',
                                  borderBottom: '1px solid #e5e7eb',
                                  textAlign: 'center',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  defaultChecked={canDelete}
                                  disabled={usingDefaultsOnly || !isAdminLike}
                                  onChange={(e) =>
                                    handleTogglePageVisibility(
                                      roleLower,
                                      'transactions.delete',
                                      e.target.checked
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {usingDefaultsOnly && (
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: '#6b7280',
                        marginTop: 0,
                        marginBottom: '0.75rem',
                      }}
                    >
                      These matrices currently reflect the default, hardcoded permissions. Firestore overrides are not in effect.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Returns & Refunds */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '1rem',
                padding: '1.75rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              }}
            >
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                Returns & Refunds
              </h2>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#4b5563',
                  marginBottom: '0.75rem',
                }}
              >
                Configure who can access the Returns & Refunds page and who is allowed to process or
                archive refunds.
              </p>
              {usingDefaultsOnly && (
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#6b7280',
                    marginTop: 0,
                    marginBottom: '0.75rem',
                  }}
                >
                  Showing default Returns & Refunds permissions. Firestore-based overrides are not active.
                </p>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                  gap: '1.25rem',
                  fontSize: '0.9rem',
                  color: '#4b5563',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#111827' }}>
                    RCAB: Who can see Returns & Refunds page
                  </div>
                  <div
                    style={{
                      marginTop: '0.35rem',
                      overflowX: 'auto',
                    }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.8rem',
                        minWidth: '320px',
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: 'left',
                              padding: '0.4rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                              fontWeight: 600,
                            }}
                          >
                            Role
                          </th>
                          <th
                            style={{
                              textAlign: 'center',
                              padding: '0.4rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Can view
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => {
                          const roleLower = role.toLowerCase();
                          const canView = can(roleLower, 'page.returns.view');
                          return (
                            <tr key={role}>
                              <td
                                style={{
                                  padding: '0.4rem 0.5rem',
                                  borderBottom: '1px solid #e5e7eb',
                                  color: '#111827',
                                  textTransform: 'capitalize',
                                  fontWeight: 500,
                                }}
                              >
                                {role}
                              </td>
                              <td
                                style={{
                                  padding: '0.35rem 0.5rem',
                                  borderBottom: '1px solid #e5e7eb',
                                  textAlign: 'center',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  defaultChecked={canView}
                                  disabled={usingDefaultsOnly || !isAdminLike}
                                  onChange={(e) =>
                                    handleTogglePageVisibility(
                                      roleLower,
                                      'page.returns.view',
                                      e.target.checked
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#111827' }}>
                    RCAB: Who can process refunds
                  </div>
                  <div
                    style={{
                      marginTop: '0.35rem',
                      overflowX: 'auto',
                    }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.8rem',
                        minWidth: '320px',
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: 'left',
                              padding: '0.4rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                              fontWeight: 600,
                            }}
                          >
                            Role
                          </th>
                          <th
                            style={{
                              textAlign: 'center',
                              padding: '0.4rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Process refunds
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => {
                          const roleLower = role.toLowerCase();
                          const canProcess = can(roleLower, 'returns.process');
                          return (
                            <tr key={role}>
                              <td
                                style={{
                                  padding: '0.4rem 0.5rem',
                                  borderBottom: '1px solid #e5e7eb',
                                  color: '#111827',
                                  textTransform: 'capitalize',
                                  fontWeight: 500,
                                }}
                              >
                                {role}
                              </td>
                              <td
                                style={{
                                  padding: '0.35rem 0.5rem',
                                  borderBottom: '1px solid #e5e7eb',
                                  textAlign: 'center',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  defaultChecked={canProcess}
                                  disabled={usingDefaultsOnly || !isAdminLike}
                                  onChange={(e) =>
                                    handleTogglePageVisibility(
                                      roleLower,
                                      'returns.process',
                                      e.target.checked
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: '0.9rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px dashed #e5e7eb',
                  fontSize: '0.9rem',
                  color: '#4b5563',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#111827' }}>
                  RCAB: Who can delete/archive returns
                </div>
                <div
                  style={{
                    marginTop: '0.35rem',
                    overflowX: 'auto',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.8rem',
                      minWidth: '380px',
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '0.4rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#111827',
                            fontWeight: 600,
                          }}
                        >
                          Role
                        </th>
                        <th
                          style={{
                            textAlign: 'center',
                            padding: '0.4rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#111827',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Archive (delete)
                        </th>
                        <th
                          style={{
                            textAlign: 'center',
                            padding: '0.4rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#111827',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Unarchive
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => {
                        const roleLower = role.toLowerCase();
                        const canArchive = can(roleLower, 'returns.archive');
                        const canUnarchive = can(roleLower, 'returns.unarchive');
                        return (
                          <tr key={role}>
                            <td
                              style={{
                                padding: '0.4rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                color: '#111827',
                                textTransform: 'capitalize',
                                fontWeight: 500,
                              }}
                            >
                              {role}
                            </td>
                            <td
                              style={{
                                padding: '0.35rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                textAlign: 'center',
                              }}
                            >
                              <input
                                type="checkbox"
                                defaultChecked={canArchive}
                                disabled={usingDefaultsOnly || !isAdminLike}
                                onChange={(e) =>
                                  handleTogglePageVisibility(
                                    roleLower,
                                    'returns.archive',
                                    e.target.checked
                                  )
                                }
                              />
                            </td>
                            <td
                              style={{
                                padding: '0.35rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                textAlign: 'center',
                              }}
                            >
                              <input
                                type="checkbox"
                                defaultChecked={canUnarchive}
                                disabled={usingDefaultsOnly || !isAdminLike}
                                onChange={(e) =>
                                  handleTogglePageVisibility(
                                    roleLower,
                                    'returns.unarchive',
                                    e.target.checked
                                  )
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Customers */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '1rem',
                padding: '1.75rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              }}
            >
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                Customers
              </h2>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#4b5563',
                  marginBottom: '0.75rem',
                }}
              >
                Entering new customer: decide which details must be captured.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '0.5rem 1.5rem',
                }}
              >
                {['Customer Name', 'Contact Number', 'Email', 'Address', 'Vehicle Type'].map((label) => (
                  <label
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.9rem',
                      color: '#111827',
                    }}
                  >
                    <input type="checkbox" defaultChecked />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* User Management */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: '1rem',
                padding: '1.75rem',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              }}
            >
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  marginTop: 0,
                  marginBottom: '0.75rem',
                  color: '#111827',
                }}
              >
                User Management
              </h2>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#4b5563',
                  marginBottom: '0.75rem',
                }}
              >
                Entering new user: required account details and RCAB rules for who can edit or delete
                users.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '0.5rem 1.5rem',
                }}
              >
                {[
                  'Full Name',
                  'Contact Number',
                  'Username',
                  'Email',
                  'Password',
                  'Confirm Password',
                  'User Role',
                  'Account Status',
                ].map((label) => (
                  <label
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.9rem',
                      color: '#111827',
                    }}
                  >
                    <input type="checkbox" defaultChecked />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div
                style={{
                  marginTop: '0.9rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px dashed #e5e7eb',
                  fontSize: '0.85rem',
                  color: '#4b5563',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: '#111827' }}>
                  RCAB: Who can manage users
                </div>
                <div
                  style={{
                    marginTop: '0.35rem',
                    overflowX: 'auto',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.8rem',
                      minWidth: '520px',
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '0.4rem 0.5rem',
                            backgroundColor: '#f3f4f6',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#111827',
                            fontWeight: 600,
                          }}
                        >
                          Role
                        </th>
                        {['Create', 'Edit', 'Edit own', 'Delete'].map((action) => (
                          <th
                            key={action}
                            style={{
                              textAlign: 'center',
                              padding: '0.4rem 0.5rem',
                              backgroundColor: '#f3f4f6',
                              borderBottom: '1px solid #e5e7eb',
                              color: '#111827',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {action}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {['superadmin', 'admin', 'employee', 'mechanic'].map((role) => {
                        const roleLower = role.toLowerCase();
                        const canCreate = can(roleLower, 'users.edit.any');
                        const canEditAny = can(roleLower, 'users.edit.any');
                        const canEditOwn = can(roleLower, 'users.edit.self');
                        const canDelete = can(roleLower, 'users.delete');
                        const values = [canCreate, canEditAny, canEditOwn, canDelete];
                        const permissionKeys: PermissionKey[] = [
                          'users.edit.any',
                          'users.edit.any',
                          'users.edit.self',
                          'users.delete',
                        ];
                        return (
                          <tr key={role}>
                            <td
                              style={{
                                padding: '0.4rem 0.5rem',
                                borderBottom: '1px solid #e5e7eb',
                                color: '#111827',
                                textTransform: 'capitalize',
                                fontWeight: 500,
                              }}
                            >
                              {role}
                            </td>
                            {values.map((value, idx) => (
                              <td
                                key={idx}
                                style={{
                                  padding: '0.35rem 0.5rem',
                                  borderBottom: '1px solid #e5e7eb',
                                  textAlign: 'center',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  defaultChecked={value}
                                  disabled={usingDefaultsOnly || !isAdminLike}
                                  onChange={(e) =>
                                    handleTogglePageVisibility(
                                      roleLower,
                                      permissionKeys[idx],
                                      e.target.checked
                                    )
                                  }
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
