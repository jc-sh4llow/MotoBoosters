import { FaHome, FaGripLinesVertical, FaBars, FaWarehouse, FaTag, FaWrench, FaFileInvoice, FaPlus, FaUser, FaSearch, FaTimes, FaUndoAlt, FaCog } from 'react-icons/fa';

import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import logo from '../../assets/logo.png';
import { can } from '../../config/permissions';

type ServiceRow = {
  id: string;        // Firestore document ID
  serviceId: string; // Business ID, e.g. SVC-001
  name: string;
  price: number;
  status: 'Active' | 'Inactive';
  description: string;
  vehicleTypes: string[];
};

export function Services() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const currentRole = (user?.role || '').toString();
  const canEditServices = can(currentRole, 'services.add');

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

  const canSeePath = (path: string) => {
    const key = pathPermissionMap[path];
    if (!key) return true;
    return can(currentRole, key as any);
  };

  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [shouldShowDetails, setShouldShowDetails] = useState(false);

  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

  const [selectedItem, setSelectedItem] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  let closeMenuTimeout: number | undefined;
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [vehicleTypeOptions, setVehicleTypeOptions] = useState<string[]>([
    'Scooter',
    'Underbone',
    'Sport Bike',
    'Cruiser',
    'Touring',
    'Off-Road',
    'Big Bike',
    'All Types',
  ]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newVehicleType, setNewVehicleType] = useState('');

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Track viewport width and basic mobile flag
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setViewportWidth(width);
      setIsMobile(width < 768);
    };

    // Run once on mount
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Responsive breakpoint helpers
  const isDesktop = viewportWidth >= 1200;
  const isSmallDesktop = viewportWidth >= 992 && viewportWidth < 1200;
  const isLargePhoneOrTablet = viewportWidth >= 768 && viewportWidth < 992;
  const isPortraitPhone = viewportWidth >= 480 && viewportWidth < 768;
  const isSmallPhone = viewportWidth < 480;

  const handleTypeChange = (type: string) => {
    if (!canEditServices) return;
    setSelectedTypes(prev => {
      const newTypes = new Set(prev);

      if (type === 'All Types') {
        if (newTypes.has('All Types')) {
          newTypes.clear();
        } else {
          vehicleTypeOptions.forEach(t => newTypes.add(t));
        }
      } else {
        if (newTypes.has(type)) {
          newTypes.delete(type);
          newTypes.delete('All Types');
        } else {
          newTypes.add(type);
          const allSelected = vehicleTypeOptions
            .filter(t => t !== 'All Types')
            .every(t => newTypes.has(t) || t === type);
          if (allSelected) {
            newTypes.add('All Types');
          }
        }
      }
      return newTypes;
    });
  };

  const getNextServiceId = (existing: ServiceRow[]): string => {
    const maxNum = existing.reduce((max, svc) => {
      const match = svc.serviceId.match(/^SVC-(\d{3})$/);
      if (!match) return max;
      const num = parseInt(match[1], 10);
      return num > max ? num : max;
    }, 0);
    const next = maxNum + 1;
    return `SVC-${next.toString().padStart(3, '0')}`;
  };

  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);

      const q = query(collection(db, 'services'), orderBy('serviceId', 'asc'));
      const snapshot = await getDocs(q);
      const loaded = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          serviceId: data.serviceId ?? '',
          name: data.name ?? '',
          price: data.price ?? 0,
          status: (data.status ?? 'Active') as 'Active' | 'Inactive',
          description: data.description ?? '',
          vehicleTypes: (data.vehicleTypes ?? []) as string[],
        } as ServiceRow;
      });
      setServices(loaded);
    } catch (err) {
      console.error('Error loading services from Firestore', err);
      setError('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const menuItems = [
    { title: 'Inventory', path: '/inventory', icon: <FaWarehouse /> },
    { title: 'Sales Records', path: '/sales', icon: <FaTag /> },
    { title: 'New Transaction', path: '/transactions/new', icon: <FaPlus /> },
    { title: 'Transaction History', path: '/transactions', icon: <FaFileInvoice /> },
    { title: 'Customers', path: '/customers', icon: <FaUser /> },
    { title: 'User Management', path: '/users', icon: <FaUser /> },
    { title: 'Returns & Refunds', path: '/returns', icon: <FaUndoAlt /> },
    { title: 'Settings', path: '/settings', icon: <FaCog /> },
  ];

  const [selectedService, setSelectedService] = useState<ServiceRow | null>(null);
  const [serviceForm, setServiceForm] = useState({
    id: '',
    name: '',
    price: '',
    description: '',
    vehicleTypes: [] as string[]
  });
  const [serviceHasUnsavedChanges, setServiceHasUnsavedChanges] = useState(false);
  const [descriptionModalService, setDescriptionModalService] = useState<ServiceRow | null>(null);

  const handleSaveService = async () => {
    if (!canEditServices) return;
    if (!serviceForm.name || !serviceForm.price) {
      alert('Please fill in Service Name and Price.');
      return;
    }

    const cleanedVehicleTypes = Array.from(selectedTypes).filter(t => t !== 'All Types');

    const payload = {
      name: serviceForm.name,
      price: Number(serviceForm.price),
      description: serviceForm.description,
      status: selectedService?.status ?? 'Active',
      vehicleTypes: cleanedVehicleTypes,
    };

    try {
      if (selectedService) {
        await updateDoc(doc(db, 'services', selectedService.id), {
          ...payload,
          serviceId: selectedService.serviceId,
        });
      } else {
        const nextId = getNextServiceId(services);
        const docRef = await addDoc(collection(db, 'services'), {
          ...payload,
          serviceId: nextId,
        });

        setServiceForm(prev => ({ ...prev, id: nextId }));
        setSelectedService({
          id: docRef.id,
          serviceId: nextId,
          name: payload.name,
          price: payload.price,
          status: payload.status as 'Active' | 'Inactive',
          description: payload.description,
          vehicleTypes: payload.vehicleTypes,
        });
      }

      await loadServices();
      setServiceHasUnsavedChanges(false);
      setIsDetailsVisible(false);
      setTimeout(() => setShouldShowDetails(false), 300);
    } catch (err) {
      console.error('Error saving service', err);
      alert('Failed to save service. Please try again.');
    }
  };

  const handleDeleteService = async () => {
    if (!canEditServices) return;
    if (!selectedService) return;
    const confirmed = window.confirm('Delete this service?');
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'services', selectedService.id));
      await loadServices();
      setSelectedService(null);

      setServiceForm({
        id: '',
        name: '',
        price: '',
        description: '',
        vehicleTypes: []
      });
      setSelectedTypes(new Set());
      setServiceHasUnsavedChanges(false);
      setIsDetailsVisible(false);
      setTimeout(() => setShouldShowDetails(false), 300);
    } catch (err) {
      console.error('Error deleting service', err);
      alert('Failed to delete service. Please try again.');
    }
  };

  const handleToggleServiceStatus = async (service: ServiceRow) => {
    if (!canEditServices) return;

    const newStatus: 'Active' | 'Inactive' = service.status === 'Active' ? 'Inactive' : 'Active';

    try {
      await updateDoc(doc(db, 'services', service.id), {
        status: newStatus,
      });

      // Optimistically update local state so UI feels instant
      setServices(prev => prev.map(s =>
        s.id === service.id ? { ...s, status: newStatus } : s
      ));

      // If this is the currently selected service, keep form in sync
      if (selectedService && selectedService.id === service.id) {
        setSelectedService({ ...selectedService, status: newStatus });
      }
    } catch (err) {
      console.error('Error toggling service status', err);
      alert('Failed to update service status. Please try again.');
    }
  };

  const handleAddVehicleType = () => {
    const name = newVehicleType.trim();
    if (!name) return;
    // Prevent duplicates (case-insensitive)
    const exists = vehicleTypeOptions.some(
      t => t.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      alert('That vehicle type already exists.');
      return;
    }
    setVehicleTypeOptions(prev => {
      const base = prev.filter(t => t !== 'All Types');
      const updated = [...base, name].sort((a, b) => a.localeCompare(b));
      return [...updated, 'All Types'];
    });
    setNewVehicleType('');
  };

  const handleRemoveVehicleType = (type: string) => {
    if (type === 'All Types') return;
    setVehicleTypeOptions(prev => prev.filter(t => t !== type));
    setSelectedTypes(prev => {
      const next = new Set(prev);
      next.delete(type);
      next.delete('All Types');
      return next;
    });
  };

  const filteredServices = services.filter(service => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;

    const idMatch = service.serviceId.toLowerCase().includes(q);
    const nameMatch = service.name.toLowerCase().includes(q);
    const descMatch = service.description.toLowerCase().includes(q);
    const statusMatch = service.status.toLowerCase().includes(q);
    const priceMatch = service.price.toString().toLowerCase().includes(q);
    const vehicleTypesMatch = service.vehicleTypes.join(' ').toLowerCase().includes(q);

    return (
      idMatch ||
      nameMatch ||
      descMatch ||
      statusMatch ||
      priceMatch ||
      vehicleTypesMatch
    );
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
      padding: '2rem'
    }}>
      {/* Background gradient overlay */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: -1,
        background: 'linear-gradient(109deg, #1e88e5 0%, #1e88e5 50%, #0d47a1 50%, #0d47a1 100%)',
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
      }} />

      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
        zIndex: 5
      }}>
        {/* Header with Search and Add Button */}
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
            maxWidth: '1400px',
            margin: '0 auto',
            width: '100%',
            position: 'relative' // For dropdown positioning
          }}>
            {/* Left: Logo, title, and welcome text */}
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
                Services
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.9rem' }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
              </div>
            </div>
            {/* Center: Search bar */}
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              marginLeft: 'auto',
              marginRight: '1rem'
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
                placeholder="Search by any field..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: '0.5rem 2.5rem 0.5rem 2.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'rgba(255, 255, 255)',
                  color: '#1f2937',
                  width: '350px',
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

            {/* Right: Logout + Navbar toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              {user && (
                <button
                  onClick={() => {
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
            </div>

            {/* Dropdown Menu */}
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
                maxHeight: isNavExpanded ? '500px' : '0',
                transition: 'all 0.3s ease-out',
                pointerEvents: isNavExpanded ? 'auto' : 'none',
                border: isNavExpanded ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid transparent',
                opacity: isNavExpanded ? 1 : 0,
                transform: isNavExpanded ? 'translateY(0)' : 'translateY(-10px)'
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
              {menuItems.filter(item => canSeePath(item.path)).map((item) => (
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
                  <span style={{
                    fontSize: '1.1rem',
                    color: '#4b5563',
                    width: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {item.icon}
                  </span>
                  <span style={{
                    fontSize: '0.95rem',
                    fontWeight: 500
                  }}>
                    {item.title}
                  </span>
                </button>
              ))}

              {/* Divider */}
              <div style={{
                height: '1px',
                backgroundColor: '#e5e7eb',
                margin: '0.25rem 0'
              }} />

              {/* Services (current page) */}
              <button
                onClick={() => {
                  navigate('/services');
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
                  fontWeight: 500
                }}
              >
                <span style={{
                  fontSize: '1.1rem',
                  color: '#1d4ed8',
                  width: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FaWrench />
                </span>
                <span>Services</span>
              </button>
            </div>
          </div>
        </header>

        <main style={{
          transition: 'margin-left 0.3s ease'
        }}>
          {/* Main Content */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.65)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>

            <div style={{
              display: 'flex',
              gap: '1.5rem',
              alignItems: 'flex-start',
              position: 'relative'
            }}>
              {/* Service Form Section */}
              {shouldShowDetails && (
                isDesktop ? (
                  // Desktop: keep inline sticky card beside the table
                  <div style={{
                    backgroundColor: 'white',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                    height: 'fit-content',
                    position: 'sticky',
                    top: '1rem',
                    flexBasis: '32%',
                    maxWidth: '32%',
                    overflow: 'hidden',
                    transform: isDetailsVisible ? 'translateX(0)' : 'translateX(-24px)',
                    opacity: isDetailsVisible ? 1 : 0,
                    transition: 'transform 0.3s ease, opacity 0.3s ease'
                  }}>
                    <h2 style={{
                      color: '#111827',
                      marginBottom: '1.5rem',
                      fontSize: '1.25rem',
                      fontWeight: '600',
                      color: '#1e40af'
                    }}>
                      Service Details
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Service ID (readonly) */}
                      <div>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#374151'
                        }}>
                          Service ID
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={serviceForm.id || 'Auto-generated'}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'rgba(255, 255, 255)',
                            color: '#6b7280'
                          }}
                        />
                      </div>
                      {/* Service Name */}
                      <div>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#374151'
                        }}>
                          Service Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Enter service name"
                          value={serviceForm.name}
                          onChange={(e) => {
                            setServiceForm(prev => ({ ...prev, name: e.target.value }));
                            setServiceHasUnsavedChanges(true);
                          }}
                          disabled={!canEditServices}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#111827'
                          }}
                        />
                      </div>
                      {/* Service Price */}
                      <div>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#374151'
                        }}>
                          Service Price (₱) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          placeholder="0.00"
                          value={serviceForm.price}
                          onChange={(e) => {
                            setServiceForm(prev => ({ ...prev, price: e.target.value }));
                            setServiceHasUnsavedChanges(true);
                          }}
                          disabled={!canEditServices}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#111827'
                          }}
                        />
                      </div>
                      {/* Description */}
                      <div>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#374151'
                        }}>
                          Description
                        </label>
                        <textarea
                          placeholder="Enter service description"
                          rows={4}
                          value={serviceForm.description}
                          onChange={(e) => {
                            setServiceForm(prev => ({ ...prev, description: e.target.value }));
                            setServiceHasUnsavedChanges(true);
                          }}
                          disabled={!canEditServices}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#111827',
                            resize: 'vertical',
                            minHeight: '6rem'
                          }}
                        />
                      </div>
                      {/* Vehicle Types */}
                      <div>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#374151'
                        }}>
                          Vehicle Type(s) *
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {vehicleTypeOptions.map((type) => (
                            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditServices ? 'pointer' : 'default' }}>
                              <input
                                type="checkbox"
                                checked={selectedTypes.has(type)}
                                onChange={() => handleTypeChange(type)}
                                disabled={!canEditServices}
                                style={{
                                  width: '1rem',
                                  height: '1rem',
                                  borderRadius: '0.25rem',
                                  border: '1px solid #d1d5db',
                                  backgroundColor: 'white',
                                  cursor: 'pointer'
                                }}
                              />
                              <span style={{ fontSize: '0.875rem', color: '#111827' }}>{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {/* Form Actions (only for admins/superadmins) */}
                      {canEditServices && (
                        <>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '1rem',
                            marginTop: '1rem'
                          }}>
                            <button
                              type="button"
                              disabled={!serviceHasUnsavedChanges}
                              onClick={handleSaveService}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                                width: '50%'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                            >
                              Save Service
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedService(null);
                                setServiceForm({
                                  id: '',
                                  name: '',
                                  price: '',
                                  description: '',
                                  vehicleTypes: []
                                });
                                setSelectedTypes(new Set());
                                setServiceHasUnsavedChanges(false);
                                setIsDetailsVisible(false);
                                setTimeout(() => setShouldShowDetails(false), 300);
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: 'white',
                                color: '#374151',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.375rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                width: '50%'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#f3f4f6';
                                e.currentTarget.style.borderColor = '#9ca3af';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'white';
                                e.currentTarget.style.borderColor = '#d1d5db';
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={handleDeleteService}
                            disabled={!selectedService}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: '0.375rem',
                              fontWeight: '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#fee2e2';
                              e.currentTarget.style.borderColor = '#fca5a5';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = '#fef2f2';
                              e.currentTarget.style.borderColor = '#fecaca';
                            }}
                          >
                            Delete Service
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  // <1200px: full-width overlay above the table
                  <div
                    onClick={() => {
                      setIsDetailsVisible(false);
                      setTimeout(() => setShouldShowDetails(false), 300);
                    }}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      zIndex: 200,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'flex-start',
                      paddingTop: '6rem',
                      paddingBottom: '2rem',
                      backgroundColor: 'rgba(15, 23, 42, 0.55)'
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '900px',
                        margin: '0 auto',
                        padding: '0 1rem'
                      }}
                    >
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          backgroundColor: 'white',
                          backdropFilter: 'blur(12px)',
                          borderRadius: '0.75rem',
                          padding: '1.5rem',
                          border: '1px solid #e5e7eb',
                          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.45)',
                          maxHeight: 'calc(100vh - 8rem)',
                          overflowY: 'auto',
                          transform: isDetailsVisible ? 'translateY(0)' : 'translateY(24px)',
                          opacity: isDetailsVisible ? 1 : 0,
                          transition: 'transform 0.25s ease, opacity 0.25s ease',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                      >
                        <h2 style={{
                          color: '#111827',
                          marginBottom: '1.5rem',
                          fontSize: '1.25rem',
                          fontWeight: '600',
                          color: '#1e40af'
                        }}>
                          Service Details
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {/* Service ID (readonly) */}
                          <div>
                            <label style={{
                              display: 'block',
                              marginBottom: '0.5rem',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              color: '#374151'
                            }}>
                              Service ID
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={serviceForm.id || 'Auto-generated'}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'rgba(255, 255, 255)',
                                color: '#6b7280'
                              }}
                            />
                          </div>
                          {/* Service Name */}
                          <div>
                            <label style={{
                              display: 'block',
                              marginBottom: '0.5rem',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              color: '#374151'
                            }}>
                              Service Name *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Enter service name"
                              value={serviceForm.name}
                              onChange={(e) => {
                                setServiceForm(prev => ({ ...prev, name: e.target.value }));
                                setServiceHasUnsavedChanges(true);
                              }}
                              disabled={!canEditServices}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'white',
                                color: '#111827'
                              }}
                            />
                          </div>
                          {/* Service Price */}
                          <div>
                            <label style={{
                              display: 'block',
                              marginBottom: '0.5rem',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              color: '#374151'
                            }}>
                              Service Price (₱) *
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              placeholder="0.00"
                              value={serviceForm.price}
                              onChange={(e) => {
                                setServiceForm(prev => ({ ...prev, price: e.target.value }));
                                setServiceHasUnsavedChanges(true);
                              }}
                              disabled={!canEditServices}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'white',
                                color: '#111827'
                              }}
                            />
                          </div>
                          {/* Description */}
                          <div>
                            <label style={{
                              display: 'block',
                              marginBottom: '0.5rem',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              color: '#374151'
                            }}>
                              Description
                            </label>
                            <textarea
                              placeholder="Enter service description"
                              rows={4}
                              value={serviceForm.description}
                              onChange={(e) => {
                                setServiceForm(prev => ({ ...prev, description: e.target.value }));
                                setServiceHasUnsavedChanges(true);
                              }}
                              disabled={!canEditServices}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'white',
                                color: '#111827',
                                resize: 'vertical',
                                minHeight: '6rem'
                              }}
                            />
                          </div>
                          {/* Vehicle Types */}
                          <div>
                            <label style={{
                              display: 'block',
                              marginBottom: '0.5rem',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              color: '#374151'
                            }}>
                              Vehicle Type(s) *
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {vehicleTypeOptions.map((type) => (
                                <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditServices ? 'pointer' : 'default' }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedTypes.has(type)}
                                    onChange={() => handleTypeChange(type)}
                                    disabled={!canEditServices}
                                    style={{
                                      width: '1rem',
                                      height: '1rem',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #d1d5db',
                                      backgroundColor: 'white',
                                      cursor: 'pointer'
                                    }}
                                  />
                                  <span style={{ fontSize: '0.875rem', color: '#111827' }}>{type}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          {/* Form Actions (only for admins/superadmins) */}
                          {canEditServices && (
                            <div
                              style={{
                                position: 'sticky',
                                bottom: 0,
                                marginTop: '1.25rem',
                                paddingTop: '0.75rem',
                                background:
                                  'linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0.9), rgba(255,255,255,0))',
                                backdropFilter: 'blur(4px)'
                              }}
                            >
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '1rem'
                              }}>
                                <button
                                  type="button"
                                  disabled={!serviceHasUnsavedChanges}
                                  onClick={handleSaveService}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s',
                                    width: '50%'
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                                >
                                  Save Service
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedService(null);
                                    setServiceForm({
                                      id: '',
                                      name: '',
                                      price: '',
                                      description: '',
                                      vehicleTypes: []
                                    });
                                    setSelectedTypes(new Set());
                                    setServiceHasUnsavedChanges(false);
                                    setIsDetailsVisible(false);
                                    setTimeout(() => setShouldShowDetails(false), 300);
                                  }}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: 'white',
                                    color: '#374151',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.375rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    width: '50%'
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                                    e.currentTarget.style.borderColor = '#9ca3af';
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = 'white';
                                    e.currentTarget.style.borderColor = '#d1d5db';
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={handleDeleteService}
                                disabled={!selectedService}
                                style={{
                                  marginTop: '0.75rem',
                                  padding: '0.5rem 1rem',
                                  backgroundColor: '#fef2f2',
                                  color: '#dc2626',
                                  border: '1px solid #fecaca',
                                  borderRadius: '0.375rem',
                                  fontWeight: '500',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  whiteSpace: 'nowrap',
                                  width: '100%'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = '#fee2e2';
                                  e.currentTarget.style.borderColor = '#fca5a5';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = '#fef2f2';
                                  e.currentTarget.style.borderColor = '#fecaca';
                                }}
                              >
                                Delete Service
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
              {/* Services Table Section */}
              <div style={{
                backgroundColor: 'rgba(255, 255, 255)',
                backdropFilter: 'blur(12px)',
                borderRadius: '0.5rem',
                padding: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                flexGrow: 1,
                flexBasis: isDesktop && isDetailsVisible ? '68%' : '100%',
                transition: 'flex-basis 0.3s ease'
              }}>
                {loading && (
                  <p style={{ marginBottom: '0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>
                    Loading services...
                  </p>
                )}
                {error && (
                  <p style={{ marginBottom: '0.75rem', color: '#b91c1c', fontSize: '0.875rem' }}>
                    {error}
                  </p>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem'
                }}>
                  <h2 style={{
                    color: 'black',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#1e40af'
                  }}>
                    Available Services
                  </h2>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      color: '#1f2937',
                      fontSize: '0.9rem'
                    }}>
                      <span>Total: {filteredServices.length}</span>
                      <span>Active: {filteredServices.filter(s => s.status === 'Active').length}</span>
                    </div>
                    {canEditServices && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedService(null);
                          setServiceForm({
                            id: '',
                            name: '',
                            price: '',
                            description: '',
                            vehicleTypes: []
                          });
                          setSelectedTypes(new Set());
                          setServiceHasUnsavedChanges(false);
                          setShouldShowDetails(true);
                          requestAnimationFrame(() => setIsDetailsVisible(true));
                        }}
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
                        New Service
                      </button>
                    )}
                  </div>
                </div>

                <div style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '0.5rem',
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#1e293b' }}>
                    <thead>
                      <tr style={{
                        backgroundColor: '#f3f4f6',
                        borderBottom: '1px solid #e5e7eb',
                        textAlign: 'left',
                        fontWeight: 600,
                        textAlign: 'left'
                      }}>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: '500', color: '#4b5563' }}>Service ID</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: '500', color: '#4b5563' }}>Service Name</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: '500', textAlign: 'center', color: '#4b5563' }}>Description</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: '500', textAlign: 'center', color: '#4b5563' }}>Price</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: '500', textAlign: 'center', color: '#4b5563' }}>Status</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: '500', color: '#4b5563' }}>Vehicle Types</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredServices.map((service) => (
                        <tr
                          key={service.id}
                          style={{
                            borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                            transition: 'background-color 0.2s',
                            backgroundColor: 'white',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f0f0f0';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                          }}
                          onClick={() => {
                            setSelectedService(service);
                            setServiceForm({
                              id: service.serviceId,
                              name: service.name,
                              price: String(service.price),
                              description: service.description,
                              vehicleTypes: service.vehicleTypes
                            });
                            setSelectedTypes(new Set(service.vehicleTypes));
                            setServiceHasUnsavedChanges(false);
                            setShouldShowDetails(true);
                            requestAnimationFrame(() => setIsDetailsVisible(true));
                          }}
                        >
                          <td style={{ padding: '0.75rem 1rem', color: '#111827' }}>{service.serviceId}</td>
                          <td style={{ padding: '0.75rem 1rem', color: '#111827' }}>{service.name}</td>

                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation(); // don't trigger row select
                                setDescriptionModalService(service);
                              }}
                              style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '9999px',
                                border: '1px solid #2563eb',
                                backgroundColor: 'white',
                                color: '#2563eb',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                cursor: 'pointer'
                              }}
                            >
                              Description
                            </button>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#111827' }}>₱{service.price.toLocaleString()}</td>
                          <td style={{ padding: '0.75rem 1rem', color: '#111827', }}>
                            <button
                              type="button"
                              disabled={!canEditServices}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleServiceStatus(service);
                              }}
                              style={{
                                display: 'inline-block',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '9999px',
                                backgroundColor: service.status === 'Active' ? '#dcfce7' : '#fee2e2',
                                color: service.status === 'Active' ? '#166534' : '#991b1b',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                border: 'none',
                                cursor: canEditServices ? 'pointer' : 'default',
                              }}
                            >
                              {service.status}
                            </button>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {service.vehicleTypes.map((type, i) => (
                                <span
                                  key={i}
                                  style={{
                                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                                    color: '#111827',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  {type}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </main>
        {/* Service Description Modal */}
        {descriptionModalService && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem 2rem',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, marginBottom: '0.75rem', color: '#111827' }}>
                {descriptionModalService.name}
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#111827', marginBottom: '1.5rem' }}>
                {descriptionModalService.description || 'No description provided.'}
              </p>
              <div style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => setDescriptionModalService(null)}
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
        {/* Service Settings Modal */}
        {canEditServices && isSettingsOpen && (
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
                Service Settings
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '1rem' }}>
                Manage the vehicle type options used in the Services module.
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', color: '#111827' }}>
                  Vehicle Types
                </h4>
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.75rem'
                }}>
                  <input
                    type="text"
                    placeholder="Add new vehicle type"
                    value={newVehicleType}
                    onChange={(e) => setNewVehicleType(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddVehicleType}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.375rem',
                      border: 'none',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    Add
                  </button>
                </div>

                <div style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}>
                  {vehicleTypeOptions.filter(t => t !== 'All Types').length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
                      No vehicle types defined.
                    </p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {vehicleTypeOptions.filter(t => t !== 'All Types').map(type => (
                        <li key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.9rem', color: '#111827' }}>{type}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveVehicleType(type)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #fecaca',
                              backgroundColor: '#fef2f2',
                              color: '#b91c1c',
                              fontSize: '0.75rem',
                              cursor: 'pointer'
                            }}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
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
    </div>
  );
}