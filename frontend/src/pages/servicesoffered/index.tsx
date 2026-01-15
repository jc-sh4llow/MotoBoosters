import { FaBars, FaSearch, FaTimes, FaFilter, FaFileExcel, FaTrash, FaUndoAlt, FaChevronDown } from 'react-icons/fa';

import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import logo from '../../assets/logo.png';
import { can } from '../../config/permissions';
import { useEffectiveRoleIds } from '../../hooks/useEffectiveRoleIds';
import { HeaderDropdown } from '../../components/HeaderDropdown';
import Switch from '../../components/ui/Switch';

type ServiceRow = {
  id: string;        // Firestore document ID
  serviceId: string; // Business ID, e.g. SVC-001
  name: string;
  price: number;
  status: 'Active' | 'Inactive';
  description: string;
  vehicleTypes: string[];
  archived?: boolean;
};

type FirestoreServiceData = {
  serviceId?: string;
  name?: string;
  price?: number;
  status?: string;
  description?: string;
  vehicleTypes?: string[];
  archived?: boolean;
};

export function Services() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const { effectiveRoleIds } = useEffectiveRoleIds();

  // Permission checks
  const canViewArchived = can(effectiveRoleIds, 'services.view.archived');
  const canEditServices = can(effectiveRoleIds, 'services.edit');
  const canArchiveServices = can(effectiveRoleIds, 'services.archive');
  const canDeleteServices = can(effectiveRoleIds, 'services.delete');
  const canToggleStatus = can(effectiveRoleIds, 'services.toggle.status');
  const canExportServices = can(effectiveRoleIds, 'services.export');

  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [shouldShowDetails, setShouldShowDetails] = useState(false);

  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

  const [searchTerm, setSearchTerm] = useState('');
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

  // Required fields settings (loaded from Firestore)
  const [servicesRequiredFields, setServicesRequiredFields] = useState({
    serviceName: true,
    servicePrice: true,
    description: false,
    vehicleType: false,
  });

  // Select mode state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('');
  const [showArchivedFilter, setShowArchivedFilter] = useState(false);
  const [sortBy, setSortBy] = useState('serviceId-asc');
  const [isActionBarExpanded, setIsActionBarExpanded] = useState(false);

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
  const showDescription = viewportWidth >= 992; // Hide on tablet and below
  const showPrice = viewportWidth >= 768; // Hide on mobile
  const showStatus = viewportWidth >= 768; // Hide on mobile
  const showVehicleTypes = viewportWidth >= 1200; // Hide on small desktop and below

  const serviceDetailsRef = useRef<HTMLDivElement | null>(null);
  const servicesTableRef = useRef<HTMLDivElement | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);

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
        const data = docSnap.data() as FirestoreServiceData;
        return {
          id: docSnap.id,
          serviceId: data.serviceId ?? '',
          name: data.name ?? '',
          price: data.price ?? 0,
          status: (data.status ?? 'Active') as 'Active' | 'Inactive',
          description: data.description ?? '',
          vehicleTypes: (data.vehicleTypes ?? []) as string[],
          archived: !!data.archived,
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

  // Load required fields settings from Firestore
  useEffect(() => {
    const loadRequiredFields = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'requiredFields'));
        if (settingsDoc.exists() && settingsDoc.data().services) {
          const svc = settingsDoc.data().services;
          setServicesRequiredFields(prev => ({
            ...prev,
            serviceName: svc.serviceName ?? prev.serviceName,
            servicePrice: svc.servicePrice ?? prev.servicePrice,
            description: svc.description ?? prev.description,
            vehicleType: svc.vehicleType ?? prev.vehicleType,
          }));
        }
      } catch (err) {
        console.error('Failed to load required fields settings:', err);
      }
    };
    loadRequiredFields();
  }, []);

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
  const collapseServiceDetails = () => {
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
  };
  useEffect(() => {
    if (isMobile) return;
    if (!shouldShowDetails || !isDetailsVisible) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      const details = serviceDetailsRef.current;
      const table = servicesTableRef.current;

      if (details && details.contains(target)) return;
      if (table && table.contains(target)) return;

      collapseServiceDetails();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMobile, shouldShowDetails, isDetailsVisible]);

  // App-level confirmation / message modal
  const [modalState, setModalState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone: 'info' | 'danger';
    onConfirm?: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'OK',
    cancelLabel: undefined,
    tone: 'info',
    onConfirm: undefined,
  });

  const handleSaveService = async () => {
    if (!canEditServices) return;

    // Validate required fields based on settings
    if (servicesRequiredFields.serviceName && !serviceForm.name.trim()) {
      setModalState({
        open: true,
        title: 'Missing Required Field',
        message: 'Service Name is required.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'info',
        onConfirm: undefined,
      });
      return;
    }
    if (servicesRequiredFields.servicePrice && !serviceForm.price) {
      setModalState({
        open: true,
        title: 'Missing Required Field',
        message: 'Service Price is required.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'info',
        onConfirm: undefined,
      });
      return;
    }
    if (servicesRequiredFields.description && !serviceForm.description.trim()) {
      setModalState({
        open: true,
        title: 'Missing Required Field',
        message: 'Description is required.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'info',
        onConfirm: undefined,
      });
      return;
    }
    if (servicesRequiredFields.vehicleType && selectedTypes.size === 0) {
      setModalState({
        open: true,
        title: 'Missing Required Field',
        message: 'At least one Vehicle Type is required.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'info',
        onConfirm: undefined,
      });
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
      setModalState({
        open: true,
        title: 'Save Failed',
        message: 'Failed to save service. Please try again.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'danger',
        onConfirm: undefined,
      });
    }
  };

  const handleDeleteService = async () => {
    if (!canEditServices) return;
    if (!selectedService) return;
    setModalState({
      open: true,
      title: 'Delete Service',
      message: 'Are you sure you want to permanently delete this archived service? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      tone: 'danger',
      onConfirm: async () => {
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
          setModalState({
            open: true,
            title: 'Delete Failed',
            message: 'Failed to delete service. Please try again.',
            confirmLabel: 'Close',
            cancelLabel: undefined,
            tone: 'danger',
            onConfirm: undefined,
          });
        }
      },
    });
  };

  const handleToggleServiceStatus = async (service: ServiceRow) => {
    if (!canToggleStatus) return;

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
      setModalState({
        open: true,
        title: 'Status Update Failed',
        message: 'Failed to update service status. Please try again.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'danger',
        onConfirm: undefined,
      });
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
      setModalState({
        open: true,
        title: 'Duplicate Vehicle Type',
        message: 'That vehicle type already exists.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'info',
        onConfirm: undefined,
      });
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

  const handleHeaderSort = (field: string) => {
    setSortBy(prev => {
      const current = prev;
      const ascKey = `${field}-asc`;
      const descKey = `${field}-desc`;

      let next: string;
      if (current === ascKey) {
        next = descKey;
      } else {
        next = ascKey;
      }

      return next;
    });
  };

  const getFilteredServices = () => {
    let filtered = canViewArchived
      ? (showArchivedFilter ? services : services.filter(s => !s.archived))
      : services.filter(s => !s.archived);

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(service => {
        const idMatch = service.serviceId.toLowerCase().includes(q);
        const nameMatch = service.name.toLowerCase().includes(q);
        const descMatch = service.description.toLowerCase().includes(q);
        const statusMatch = service.status.toLowerCase().includes(q);
        const priceMatch = service.price.toString().toLowerCase().includes(q);
        const vehicleTypesMatch = service.vehicleTypes.join(' ').toLowerCase().includes(q);
        return idMatch || nameMatch || descMatch || statusMatch || priceMatch || vehicleTypesMatch;
      });
    }

    if (statusFilter) {
      filtered = filtered.filter(s => s.status === statusFilter);
    }
    if (minPrice) {
      filtered = filtered.filter(s => s.price >= Number(minPrice));
    }
    if (maxPrice) {
      filtered = filtered.filter(s => s.price <= Number(maxPrice));
    }
    if (vehicleTypeFilter) {
      filtered = filtered.filter(s => s.vehicleTypes.includes(vehicleTypeFilter));
    }

    // Apply sorting
    const [field, dir] = sortBy.split('-');
    const desc = dir === 'desc';

    filtered.sort((a, b) => {
      switch (field) {
        case 'serviceId': {
          return desc ? b.serviceId.localeCompare(a.serviceId) : a.serviceId.localeCompare(b.serviceId);
        }
        case 'name': {
          return desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
        }
        case 'price': {
          return desc ? b.price - a.price : a.price - b.price;
        }
        case 'status': {
          return desc ? b.status.localeCompare(a.status) : a.status.localeCompare(b.status);
        }
        default:
          return 0;
      }
    });

    return filtered;
  };

  const filteredServices = getFilteredServices();

  // Helper lists for bulk actions in select mode
  const selectedServices = filteredServices.filter(s => selectedItems.has(s.id));
  const selectedArchivedCount = selectedServices.filter(s => s.archived).length;
  const selectedUnarchivedCount = selectedServices.filter(s => !s.archived).length;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: 'var(--bg-gradient)',
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
        background: 'var(--bg-gradient)',
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
          backgroundColor: 'var(--surface)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '1rem 2rem',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)',
          border: '1px solid var(--border)',
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
                color: 'var(--text-primary)',
                margin: 0,
              }}>
                Services
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem' }}>
                <span style={{ color: '#374151', fontSize: '0.9rem' }}>
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

            {/* Right: Logout + Navbar toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
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
            </div>

            {/* Dropdown Menu */}
            <HeaderDropdown
              isNavExpanded={isNavExpanded}
              setIsNavExpanded={setIsNavExpanded}
              isMobile={isMobile}
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

        <main style={{
          transition: 'margin-left 0.3s ease'
        }}>
          {/* Main Content */}
          <div style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Action Bar */}
            <section style={{ marginBottom: '1rem' }}>
              {isMobile ? (
                /* Mobile: Accordion layout */
                <div
                  ref={actionBarRef}
                  style={{
                    backgroundColor: 'var(--surface-elevated)',
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden'
                  }}
                >
                                    {/* Accordion Header */}
                  <div
                    onClick={() => !isSelectMode && setIsActionBarExpanded(!isActionBarExpanded)}
                    style={{
                      padding: '1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: isSelectMode ? 'default' : 'pointer',
                      backgroundColor: 'var(--surface-elevated)'
                    }}
                  >
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      Actions
                    </span>
                    {!isSelectMode && (
                      <FaChevronDown 
                        style={{
                          transform: isActionBarExpanded ? 'rotate(180deg)' : 'rotate(0)',
                          transition: 'transform 0.2s ease',
                          color: '#6b7280'
                        }}
                      />
                    )}
                  </div>
                  
                  {/* Accordion Content */}
                  {(isActionBarExpanded || isSelectMode) && (
                    <div style={{ 
                      padding: '1rem', 
                      paddingTop: '0',
                      borderTop: '1px solid #e5e7eb',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}>
                                            {/* New Service Button - First */}
                      {canEditServices && (
                        <button
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
                            backgroundColor: '#10b981',
                            color: 'white',
                            padding: '0.75rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          New Service
                        </button>
                      )}

                      {/* Bulk actions when select mode is active */}
                      {isSelectMode && selectedItems.size > 0 && (
                        <>
                          <div style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '0.375rem',
                            textAlign: 'center',
                            fontSize: '0.875rem',
                            color: '#6b7280',
                            marginBottom: '0.25rem'
                          }}>
                            {selectedItems.size} service{selectedItems.size !== 1 ? 's' : ''} selected
                          </div>
                          
                          {/* Archive button */}
                          {selectedUnarchivedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const itemsToArchive = selectedServices.filter(s => !s.archived);
                                if (!itemsToArchive.length) return;
                                setModalState({
                                  open: true,
                                  title: 'Archive Services',
                                  message: `Archive ${itemsToArchive.length} service(s)?`,
                                  confirmLabel: 'Archive',
                                  cancelLabel: 'Cancel',
                                  tone: 'danger',
                                  onConfirm: async () => {
                                    try {
                                      for (const item of itemsToArchive) {
                                        await updateDoc(doc(db, 'services', item.id), { archived: true });
                                      }
                                      await loadServices();
                                      setSelectedItems(new Set());
                                      setIsSelectMode(false);
                                    } catch (err) {
                                      console.error('Error archiving services', err);
                                      setModalState({
                                        open: true,
                                        title: 'Archive Failed',
                                        message: 'Failed to archive selected services. Please try again.',
                                        confirmLabel: 'Close',
                                        cancelLabel: undefined,
                                        tone: 'danger',
                                        onConfirm: undefined,
                                      });
                                    }
                                  },
                                });
                              }}
                              style={{
                                width: '100%',
                                padding: '0.75rem',
                                backgroundColor: '#dc2626',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer'
                              }}
                            >
                              <FaTrash /> Archive {selectedUnarchivedCount} service{selectedUnarchivedCount !== 1 ? 's' : ''}
                            </button>
                          )}
                          
                          {/* Unarchive button */}
                          {selectedArchivedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const itemsToUnarchive = selectedServices.filter(s => s.archived);
                                if (!itemsToUnarchive.length) return;
                                setModalState({
                                  open: true,
                                  title: 'Unarchive Services',
                                  message: `Unarchive ${itemsToUnarchive.length} service(s)?`,
                                  confirmLabel: 'Unarchive',
                                  cancelLabel: 'Cancel',
                                  tone: 'info',
                                  onConfirm: async () => {
                                    try {
                                      for (const item of itemsToUnarchive) {
                                        await updateDoc(doc(db, 'services', item.id), { archived: false });
                                      }
                                      await loadServices();
                                      setSelectedItems(new Set());
                                      setIsSelectMode(false);
                                    } catch (err) {
                                      console.error('Error unarchiving services', err);
                                      setModalState({
                                        open: true,
                                        title: 'Unarchive Failed',
                                        message: 'Failed to unarchive selected services. Please try again.',
                                        confirmLabel: 'Close',
                                        cancelLabel: undefined,
                                        tone: 'danger',
                                        onConfirm: undefined,
                                      });
                                    }
                                  },
                                });
                              }}
                              style={{
                                width: '100%',
                                padding: '0.75rem',
                                backgroundColor: '#4b5563',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer'
                              }}
                            >
                              <FaUndoAlt /> Unarchive {selectedArchivedCount} service{selectedArchivedCount !== 1 ? 's' : ''}
                            </button>
                          )}
                          
                          {/* Delete button */}
                          {canDeleteServices && selectedArchivedCount > 0 && selectedUnarchivedCount === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const itemsToDelete = selectedServices.filter(s => s.archived);
                                if (!itemsToDelete.length) return;
                                setModalState({
                                  open: true,
                                  title: 'Delete Archived Services',
                                  message: `Delete ${itemsToDelete.length} archived service(s)? This cannot be undone.`,
                                  confirmLabel: 'Continue',
                                  cancelLabel: 'Cancel',
                                  tone: 'danger',
                                  onConfirm: () => {
                                    setModalState({
                                      open: true,
                                      title: 'Confirm Permanent Deletion',
                                      message: 'Are you absolutely sure you want to permanently delete the selected archived services? This action cannot be undone.',
                                      confirmLabel: 'Delete',
                                      cancelLabel: 'Cancel',
                                      tone: 'danger',
                                      onConfirm: async () => {
                                        try {
                                          for (const item of itemsToDelete) {
                                            await deleteDoc(doc(db, 'services', item.id));
                                          }
                                          await loadServices();
                                          setSelectedItems(new Set());
                                          setIsSelectMode(false);
                                        } catch (err) {
                                          console.error('Error deleting services', err);
                                          setModalState({
                                            open: true,
                                            title: 'Delete Failed',
                                            message: 'Failed to delete selected services. Please try again.',
                                            confirmLabel: 'Close',
                                            cancelLabel: undefined,
                                            tone: 'danger',
                                            onConfirm: undefined,
                                          });
                                        }
                                      },
                                    });
                                  },
                                });
                              }}
                              style={{
                                width: '100%',
                                padding: '0.75rem',
                                backgroundColor: '#991b1b',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer'
                              }}
                            >
                              <FaTrash /> Delete {selectedArchivedCount} service{selectedArchivedCount !== 1 ? 's' : ''}
                            </button>
                          )}
                        </>
                      )}

                      {/* Export Button */}
                      {canExportServices && (
                        <button 
                          type="button" 
                          onClick={() => {
                            const rows = filteredServices;
                            if (!rows.length) return;
                            const headers = ['Service ID', 'Name', 'Price', 'Status', 'Description', 'Vehicle Types', 'Archived'];
                            const escapeCell = (v: unknown) => { const s = (v ?? '').toString(); return s.includes('"') || s.includes(',') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
                            const csv = [headers.join(','), ...rows.map(s => [s.serviceId, s.name, s.price, s.status, s.description, s.vehicleTypes.join('; '), s.archived ? 'Yes' : 'No'].map(escapeCell).join(','))].join('\r\n');
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `services_${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
                          }} 
                          style={{ 
                            backgroundColor: '#059669', 
                            color: 'white', 
                            padding: '0.75rem', 
                            borderRadius: '0.375rem', 
                            border: 'none', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            gap: '0.5rem', 
                            fontWeight: 500, 
                            fontSize: '0.875rem',
                            width: '100%'
                          }}
                        >
                          Export to CSV <FaFileExcel />
                        </button>
                      )}

                      {/* Select Button */}
                      {canArchiveServices && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isSelectMode) {
                              setIsSelectMode(false);
                              setSelectedItems(new Set());
                            } else {
                              setIsSelectMode(true);
                            }
                          }}
                          style={{
                            backgroundColor: isSelectMode ? '#6b7280' : '#1d4ed8',
                            color: 'white',
                            padding: '0.75rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                            width: '100%'
                          }}
                        >
                          {isSelectMode ? 'Cancel' : 'Select'}
                        </button>
                      )}

                      {/* Filters Button */}
                      <button 
                        type="button" 
                        onClick={() => setShowFilters(!showFilters)} 
                        style={{ 
                          backgroundColor: '#1e40af', 
                          color: 'white', 
                          padding: '0.75rem', 
                          borderRadius: '0.375rem', 
                          border: 'none', 
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          gap: '0.5rem', 
                          fontWeight: 500, 
                          fontSize: '0.875rem',
                          width: '100%'
                        }}
                      >
                        Filters <FaFilter />
                      </button>

                      {/* Clear Filters Button */}
                      <button 
                        type="button" 
                        onClick={() => { 
                          setStatusFilter(''); 
                          setMinPrice(''); 
                          setMaxPrice(''); 
                          setVehicleTypeFilter(''); 
                          setShowArchivedFilter(false); 
                          setSortBy('serviceId-asc'); 
                        }} 
                        style={{ 
                          backgroundColor: '#6b7280', 
                          color: 'white', 
                          padding: '0.75rem', 
                          borderRadius: '0.375rem', 
                          border: 'none', 
                          cursor: 'pointer', 
                          fontWeight: 500, 
                          fontSize: '0.875rem',
                          width: '100%'
                        }}
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                  </div>
              ) : (
                /* Desktop: Horizontal layout */
                <div style={{ backgroundColor: 'var(--surface-elevated)', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showFilters ? '1rem' : 0 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {canExportServices && (
                        <button type="button" onClick={() => {
                          const rows = filteredServices;
                          if (!rows.length) return;
                          const headers = ['Service ID', 'Name', 'Price', 'Status', 'Description', 'Vehicle Types', 'Archived'];
                          const escapeCell = (v: unknown) => { const s = (v ?? '').toString(); return s.includes('"') || s.includes(',') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
                          const csv = [headers.join(','), ...rows.map(s => [s.serviceId, s.name, s.price, s.status, s.description, s.vehicleTypes.join('; '), s.archived ? 'Yes' : 'No'].map(escapeCell).join(','))].join('\r\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `services_${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
                        }} style={{ backgroundColor: '#059669', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, fontSize: '0.875rem', height: '40px' }}>
                          Export to CSV <FaFileExcel />
                        </button>
                      )}
                      {canArchiveServices && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isSelectMode) {
                              setIsSelectMode(false);
                              setSelectedItems(new Set());
                            } else {
                              setIsSelectMode(true);
                            }
                          }}
                          style={{
                            backgroundColor: isSelectMode ? '#6b7280' : '#1d4ed8',
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
                      )}

                      {/* Bulk actions when select mode is active */}
                      {isSelectMode && canArchiveServices && selectedItems.size > 0 && (
                        <>
                          {/* Scenario 1 & 3: at least one unarchived selected -> Archive button */}
                          {selectedUnarchivedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const itemsToArchive = selectedServices.filter(s => !s.archived);
                                if (!itemsToArchive.length) return;
                                setModalState({
                                  open: true,
                                  title: 'Archive Services',
                                  message: `Archive ${itemsToArchive.length} service(s)?`,
                                  confirmLabel: 'Archive',
                                  cancelLabel: 'Cancel',
                                  tone: 'danger',
                                  onConfirm: async () => {
                                    try {
                                      for (const item of itemsToArchive) {
                                        await updateDoc(doc(db, 'services', item.id), { archived: true });
                                      }
                                      await loadServices();
                                      setSelectedItems(new Set());
                                      setIsSelectMode(false);
                                    } catch (err) {
                                      console.error('Error archiving services', err);
                                      setModalState({
                                        open: true,
                                        title: 'Archive Failed',
                                        message: 'Failed to archive selected services. Please try again.',
                                        confirmLabel: 'Close',
                                        cancelLabel: undefined,
                                        tone: 'danger',
                                        onConfirm: undefined,
                                      });
                                    }
                                  },
                                });
                              }}
                              style={{
                                backgroundColor: '#dc2626',
                                color: 'white',
                                padding: '0.5rem 0.9rem',
                                borderRadius: '0.375rem',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                fontWeight: 500,
                                fontSize: '0.875rem',
                                height: '40px',
                              }}
                            >
                              <FaTrash /> Archive
                            </button>
                          )}

                          {/* Scenario 2 & 3: at least one archived selected -> Unarchive button */}
                          {selectedArchivedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const itemsToUnarchive = selectedServices.filter(s => s.archived);
                                if (!itemsToUnarchive.length) return;
                                setModalState({
                                  open: true,
                                  title: 'Unarchive Services',
                                  message: `Unarchive ${itemsToUnarchive.length} service(s)?`,
                                  confirmLabel: 'Unarchive',
                                  cancelLabel: 'Cancel',
                                  tone: 'info',
                                  onConfirm: async () => {
                                    try {
                                      for (const item of itemsToUnarchive) {
                                        await updateDoc(doc(db, 'services', item.id), { archived: false });
                                      }
                                      await loadServices();
                                      setSelectedItems(new Set());
                                      setIsSelectMode(false);
                                    } catch (err) {
                                      console.error('Error unarchiving services', err);
                                      setModalState({
                                        open: true,
                                        title: 'Unarchive Failed',
                                        message: 'Failed to unarchive selected services. Please try again.',
                                        confirmLabel: 'Close',
                                        cancelLabel: undefined,
                                        tone: 'danger',
                                        onConfirm: undefined,
                                      });
                                    }
                                  },
                                });
                              }}
                              style={{
                                backgroundColor: '#4b5563',
                                color: 'white',
                                padding: '0.5rem 0.9rem',
                                borderRadius: '0.375rem',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                fontWeight: 500,
                                fontSize: '0.875rem',
                                height: '40px',
                              }}
                            >
                              <FaUndoAlt /> Unarchive
                            </button>
                          )}

                          {/* Scenario 2: only archived selected -> Delete button with double confirmation */}
                          {canDeleteServices && selectedArchivedCount > 0 && selectedUnarchivedCount === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const itemsToDelete = selectedServices.filter(s => s.archived);
                                if (!itemsToDelete.length) return;
                                // First confirmation
                                setModalState({
                                  open: true,
                                  title: 'Delete Archived Services',
                                  message: `Delete ${itemsToDelete.length} archived service(s)? This cannot be undone.`,
                                  confirmLabel: 'Continue',
                                  cancelLabel: 'Cancel',
                                  tone: 'danger',
                                  onConfirm: () => {
                                    // Second, stronger confirmation
                                    setModalState({
                                      open: true,
                                      title: 'Confirm Permanent Deletion',
                                      message: 'Are you absolutely sure you want to permanently delete the selected archived services? This action cannot be undone.',
                                      confirmLabel: 'Delete',
                                      cancelLabel: 'Cancel',
                                      tone: 'danger',
                                      onConfirm: async () => {
                                        try {
                                          for (const item of itemsToDelete) {
                                            await deleteDoc(doc(db, 'services', item.id));
                                          }
                                          await loadServices();
                                          setSelectedItems(new Set());
                                          setIsSelectMode(false);
                                        } catch (err) {
                                          console.error('Error deleting services', err);
                                          setModalState({
                                            open: true,
                                            title: 'Delete Failed',
                                            message: 'Failed to delete selected services. Please try again.',
                                            confirmLabel: 'Close',
                                            cancelLabel: undefined,
                                            tone: 'danger',
                                            onConfirm: undefined,
                                          });
                                        }
                                      },
                                    });
                                  },
                                });
                              }}
                              style={{
                                backgroundColor: '#b91c1c',
                                color: 'white',
                                padding: '0.5rem 0.9rem',
                                borderRadius: '0.375rem',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                fontWeight: 500,
                                fontSize: '0.875rem',
                                height: '40px',
                              }}
                            >
                              <FaTrash /> Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button type="button" onClick={() => setShowFilters(!showFilters)} style={{ backgroundColor: '#1e40af', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, fontSize: '0.875rem', height: '40px' }}>
                        Filters <FaFilter />
                      </button>
                      <button type="button" onClick={() => { setStatusFilter(''); setMinPrice(''); setMaxPrice(''); setVehicleTypeFilter(''); setShowArchivedFilter(false); setSortBy('serviceId-asc'); }} style={{ backgroundColor: '#6b7280', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', height: '40px' }}>
                        Clear Filters
                      </button>
                    </div>
                  </div>
                  {showFilters && (
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))', 
                      gap: '1rem', 
                      paddingTop: '1rem', 
                      borderTop: '1px solid #e5e7eb' 
                    }}>
                      {/* Status - Full width on mobile */}
                      <div style={isMobile ? { gridColumn: '1' } : {}}>
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
                            color: '#111827' 
                          }}
                        >
                          <option value="">All Status</option>
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                      
                      {/* Price Range - Responsive */}
                      <div style={isMobile ? { gridColumn: '1' } : {}}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                          Price Range
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input 
                            type="number" 
                            placeholder="Min" 
                            value={minPrice} 
                            onChange={(e) => setMinPrice(e.target.value)} 
                            style={{ 
                              width: isMobile ? 'calc(50% - 1rem)' : '70px', 
                              padding: '0.5rem', 
                              borderRadius: '0.375rem', 
                              border: '1px solid #d1d5db', 
                              fontSize: '0.875rem', 
                              backgroundColor: 'white', 
                              color: '#111827' 
                            }} 
                          />
                          <span>-</span>
                          <input 
                            type="number" 
                            placeholder="Max" 
                            value={maxPrice} 
                            onChange={(e) => setMaxPrice(e.target.value)} 
                            style={{ 
                              width: isMobile ? 'calc(50% - 1rem)' : '70px', 
                              padding: '0.5rem', 
                              borderRadius: '0.375rem', 
                              border: '1px solid #d1d5db', 
                              fontSize: '0.875rem', 
                              backgroundColor: 'white', 
                              color: '#111827' 
                            }} 
                          />
                        </div>
                      </div>
                      
                      {/* Vehicle Type - Full width on mobile */}
                      <div style={isMobile ? { gridColumn: '1' } : {}}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                          Vehicle Type
                        </label>
                        <select 
                          value={vehicleTypeFilter} 
                          onChange={(e) => setVehicleTypeFilter(e.target.value)} 
                          style={{ 
                            width: '100%', 
                            padding: '0.5rem', 
                            borderRadius: '0.375rem', 
                            border: '1px solid #d1d5db', 
                            backgroundColor: 'white', 
                            color: '#111827' 
                          }}
                        >
                          <option value="">All Types</option>
                          {vehicleTypeOptions.filter(t => t !== 'All Types').map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Show Archived - Full width on mobile */}
                      {canViewArchived && (
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem', 
                          paddingTop: '1.5rem',
                          ...(isMobile && { gridColumn: '1' })
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Switch checked={showArchivedFilter} onChange={(checked) => setShowArchivedFilter(checked)} size="sm" />
                            Show Archived
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            <div style={{
              display: 'flex',
              gap: '1.5rem',
              alignItems: 'flex-start',
              position: 'relative'
            }}>
              {/* Service Form Section */}
              {shouldShowDetails && (
                !isMobile ? (
                  // Desktop/Tablet: keep inline sticky card beside the table
                  <div ref={serviceDetailsRef} style={{
                    backgroundColor: 'var(--surface-elevated)',
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
                      marginBottom: '1.5rem',
                      fontSize: '1.25rem',
                      fontWeight: '600',
                      color: 'var(--text-primary)'
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
                          color: 'var(--field-label-text)'
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
                          color: 'var(--field-label-text)'
                        }}>
                          Service Name{servicesRequiredFields.serviceName ? ' *' : ''}
                        </label>
                        <input
                          type="text"
                          required={servicesRequiredFields.serviceName}
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
                            backgroundColor: 'var(--surface-elevated)',
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
                          color: 'var(--field-label-text)'
                        }}>
                          Service Price (₱){servicesRequiredFields.servicePrice ? ' *' : ''}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required={servicesRequiredFields.servicePrice}
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
                            backgroundColor: 'var(--surface-elevated)',
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
                          color: 'var(--field-label-text)'
                        }}>
                          Description{servicesRequiredFields.description ? ' *' : ''}
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
                            backgroundColor: 'var(--surface-elevated)',
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
                          color: 'var(--field-label-text)'
                        }}>
                          Vehicle Type(s){servicesRequiredFields.vehicleType ? ' *' : ''}
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
                                  backgroundColor: 'var(--surface-elevated)',
                                  cursor: 'pointer'
                                }}
                              />
                              <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {/* Form Actions (only for users with edit permission) */}
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
                                collapseServiceDetails();
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: 'var(--surface-elevated)',
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
                                e.currentTarget.style.backgroundColor = 'var(--surface-elevated)';
                                e.currentTarget.style.borderColor = '#d1d5db';
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                          {selectedService?.archived ? (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                              {canArchiveServices && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!selectedService) return;
                                    const svc = selectedService;
                                    setModalState({
                                      open: true,
                                      title: 'Unarchive Service',
                                      message: `Unarchive service ${svc.serviceId}?`,
                                      confirmLabel: 'Unarchive',
                                      cancelLabel: 'Cancel',
                                      tone: 'info',
                                      onConfirm: async () => {
                                        try {
                                          await updateDoc(doc(db, 'services', svc.id), { archived: false });
                                          await loadServices();
                                          setSelectedService({ ...svc, archived: false });
                                        } catch (err) {
                                          console.error('Error unarchiving service', err);
                                          setModalState({
                                            open: true,
                                            title: 'Unarchive Failed',
                                            message: 'Failed to unarchive this service. Please try again.',
                                            confirmLabel: 'Close',
                                            cancelLabel: undefined,
                                            tone: 'danger',
                                            onConfirm: undefined,
                                          });
                                        }
                                      },
                                    });
                                  }}
                                  style={{ flex: 1, padding: '0.5rem 1rem', backgroundColor: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '0.375rem', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                                >
                                  <FaUndoAlt /> Unarchive
                                </button>
                              )}
                              {canDeleteServices && (
                                <button
                                  type="button"
                                  onClick={handleDeleteService}
                                  style={{ flex: 1, padding: '0.5rem 1rem', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '0.375rem', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                                >
                                  <FaTrash /> Delete
                                </button>
                              )}
                            </div>
                          ) : (
                            canArchiveServices && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!selectedService) return;
                                  const svc = selectedService;
                                  setModalState({
                                    open: true,
                                    title: 'Archive Service',
                                    message: `Archive service ${svc.serviceId}?`,
                                    confirmLabel: 'Archive',
                                    cancelLabel: 'Cancel',
                                    tone: 'danger',
                                    onConfirm: async () => {
                                      try {
                                        await updateDoc(doc(db, 'services', svc.id), { archived: true });
                                        await loadServices();
                                        setSelectedService(null);
                                        setServiceForm({ id: '', name: '', price: '', description: '', vehicleTypes: [] });
                                        setSelectedTypes(new Set());
                                        setIsDetailsVisible(false);
                                        setTimeout(() => setShouldShowDetails(false), 300);
                                      } catch (err) {
                                        console.error('Error archiving service', err);
                                        setModalState({
                                          open: true,
                                          title: 'Archive Failed',
                                          message: 'Failed to archive this service. Please try again.',
                                          confirmLabel: 'Close',
                                          cancelLabel: undefined,
                                          tone: 'danger',
                                          onConfirm: undefined,
                                        });
                                      }
                                    },
                                  });
                                }}
                                disabled={!selectedService}
                                style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '0.375rem', fontWeight: '500', cursor: 'pointer', width: '100%' }}
                              >
                                Archive Service
                              </button>
                            )
                          )}
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
                          backgroundColor: 'var(--surface-elevated)',
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
                          marginBottom: '1.5rem',
                          fontSize: '1.25rem',
                          fontWeight: '600',
                          color: 'var(--text-primary)'
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
                              color: 'var(--field-label-text)'
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
                              color: 'var(--field-label-text)'
                            }}>
                              Service Name{servicesRequiredFields.serviceName ? ' *' : ''}
                            </label>
                            <input
                              type="text"
                              required={servicesRequiredFields.serviceName}
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
                                backgroundColor: 'var(--surface-elevated)',
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
                              color: 'var(--field-label-text)'
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
                                backgroundColor: 'var(--surface-elevated)',
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
                              color: 'var(--field-label-text)'
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
                                backgroundColor: 'var(--surface-elevated)',
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
                              color: 'var(--field-label-text)'
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
                                      backgroundColor: 'var(--surface-elevated)',
                                      cursor: 'pointer'
                                    }}
                                  />
                                  <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{type}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          {/* Form Actions (only for users with edit permission) */}
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
                                    backgroundColor: 'var(--surface-elevated)',
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
                              {selectedService?.archived ? (
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                  {canArchiveServices && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!selectedService) return;
                                        const svc = selectedService;
                                        setModalState({
                                          open: true,
                                          title: 'Unarchive Service',
                                          message: `Unarchive service ${svc.serviceId}?`,
                                          confirmLabel: 'Unarchive',
                                          cancelLabel: 'Cancel',
                                          tone: 'info',
                                          onConfirm: async () => {
                                            try {
                                              await updateDoc(doc(db, 'services', svc.id), { archived: false });
                                              await loadServices();
                                              setSelectedService({ ...svc, archived: false });
                                            } catch (err) {
                                              console.error('Error unarchiving service', err);
                                              setModalState({
                                                open: true,
                                                title: 'Unarchive Failed',
                                                message: 'Failed to unarchive this service. Please try again.',
                                                confirmLabel: 'Close',
                                                cancelLabel: undefined,
                                                tone: 'danger',
                                                onConfirm: undefined,
                                              });
                                            }
                                          },
                                        });
                                      }}
                                      style={{ flex: 1, padding: '0.5rem 1rem', backgroundColor: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '0.375rem', fontWeight: '500', cursor: 'pointer' }}
                                    >
                                      <FaUndoAlt style={{ marginRight: '0.25rem' }} /> Unarchive
                                    </button>
                                  )}
                                  {canDeleteServices && (
                                    <button
                                      type="button"
                                      onClick={handleDeleteService}
                                      style={{ flex: 1, padding: '0.5rem 1rem', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '0.375rem', fontWeight: '500', cursor: 'pointer' }}
                                    >
                                      <FaTrash style={{ marginRight: '0.25rem' }} /> Delete
                                    </button>
                                  )}
                                </div>
                              ) : (
                                canArchiveServices && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const svc = selectedService;
                                      if (!svc) return;
                                      setModalState({
                                        open: true,
                                        title: 'Archive Service',
                                        message: `Archive service ${svc.serviceId}?`,
                                        confirmLabel: 'Archive',
                                        cancelLabel: 'Cancel',
                                        tone: 'danger',
                                        onConfirm: async () => {
                                          try {
                                            await updateDoc(doc(db, 'services', svc.id), { archived: true });
                                            await loadServices();
                                            setSelectedService(null);
                                            setServiceForm({ id: '', name: '', price: '', description: '', vehicleTypes: [] });
                                            setSelectedTypes(new Set());
                                            setIsDetailsVisible(false);
                                            setTimeout(() => setShouldShowDetails(false), 300);
                                          } catch (err) {
                                            console.error('Error archiving service', err);
                                            setModalState({
                                              open: true,
                                              title: 'Archive Failed',
                                              message: 'Failed to archive this service. Please try again.',
                                              confirmLabel: 'Close',
                                              cancelLabel: undefined,
                                              tone: 'danger',
                                              onConfirm: undefined,
                                            });
                                          }
                                        },
                                      });
                                    }}
                                    disabled={!selectedService}
                                    style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '0.375rem', fontWeight: '500', cursor: 'pointer', width: '100%' }}
                                  >
                                    Archive Service
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
              {/* Services Table Section */}
              <div ref={servicesTableRef} style={{
                backgroundColor: 'var(--surface-elevated)',
                backdropFilter: 'blur(12px)',
                borderRadius: '0.5rem',
                padding: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                flexGrow: 1,
                flexBasis: !isMobile && isDetailsVisible ? '68%' : '100%',
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
                    color: 'var(--text-primary)',
                    fontSize: '1.25rem',
                    fontWeight: '600',
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
                      color: 'var(--text-secondary)',
                      fontSize: '0.9rem',
                      alignItems: 'center'
                    }}>
                      <span>Total: {filteredServices.length}</span>
                      <span>| Active: {filteredServices.filter(s => s.status === 'Active').length}</span>
                      {selectedItems.size > 0 && (
                        <span style={{ color: '#059669', fontWeight: 500 }}>
                          | Selected: {selectedItems.size}
                        </span>
                      )}
                    </div>
                                        {!isMobile && canEditServices && (
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
                          border: '1px solid #10b981',
                          backgroundColor: '#10b981',
                          color: 'white',
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
                        backgroundColor: 'var(--table-header-bg)',
                        borderBottom: '1px solid var(--table-border)',
                        textAlign: 'left',
                        fontWeight: 600
                      }}>
                        {isSelectMode && (
                          <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '40px' }}>
                            <input type="checkbox" checked={selectedItems.size === filteredServices.length && filteredServices.length > 0} onChange={(e) => { if (e.target.checked) { setSelectedItems(new Set(filteredServices.map(s => s.id))); } else { setSelectedItems(new Set()); } }} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                          </th>
                        )}
                        <th onClick={() => handleHeaderSort('serviceId')} style={{ padding: '0.75rem 1rem', fontWeight: '500', color: 'var(--table-header-text)', cursor: 'pointer', userSelect: 'none' }}>Service ID {sortBy === 'serviceId-asc' ? '↑' : sortBy === 'serviceId-desc' ? '↓' : ''}</th>
                        <th onClick={() => handleHeaderSort('name')} style={{ padding: '0.75rem 1rem', fontWeight: '500', color: 'var(--table-header-text)', cursor: 'pointer', userSelect: 'none' }}>Service Name {sortBy === 'name-asc' ? '↑' : sortBy === 'name-desc' ? '↓' : ''}</th>
                        {showDescription && <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '500', color: 'var(--table-header-text)' }}>Description</th>}
                        {showPrice && <th onClick={() => handleHeaderSort('price')} style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '500', color: 'var(--table-header-text)', cursor: 'pointer', userSelect: 'none' }}>Price {sortBy === 'price-asc' ? '↑' : sortBy === 'price-desc' ? '↓' : ''}</th>}
                        {showStatus && <th onClick={() => handleHeaderSort('status')} style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '500', color: 'var(--table-header-text)', cursor: 'pointer', userSelect: 'none' }}>Status {sortBy === 'status-asc' ? '↑' : sortBy === 'status-desc' ? '↓' : ''}</th>}
                        {showVehicleTypes && <th style={{ padding: '0.75rem 1rem', fontWeight: '500', color: 'var(--table-header-text)' }}>Vehicle Types</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredServices.map((service) => (
                        <tr
                          key={service.id}
                          style={{
                            borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                            transition: 'background-color 0.2s',
                            backgroundColor: 'var(--surface-elevated)',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--surface-elevated)';
                          }}
                          onClick={() => {
                            if (isSelectMode) {
                              setSelectedItems(prev => {
                                const next = new Set(prev);
                                if (next.has(service.id)) { next.delete(service.id); } else { next.add(service.id); }
                                return next;
                              });
                            } else {
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
                            }
                          }}
                        >
                          {isMobile ? (
                            <>
                              {/* Mobile 2-column layout */}
                              {isSelectMode && (
                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', verticalAlign: 'top' }}>
                                  <input type="checkbox" checked={selectedItems.has(service.id)} onChange={() => { }} onClick={(e) => e.stopPropagation()} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                                </td>
                              )}
                              <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--table-row-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {service.serviceId}
                                  {service.archived && (
                                    <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: 600 }}>Archived</span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                  {!showStatus && (
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '0.125rem 0.375rem',
                                      borderRadius: '9999px',
                                      backgroundColor: service.status === 'Active' ? '#dcfce7' : '#fee2e2',
                                      color: service.status === 'Active' ? '#166534' : '#991b1b',
                                      fontSize: '0.65rem',
                                      fontWeight: 500,
                                      marginRight: '0.375rem'
                                    }}>
                                      {service.status}
                                    </span>
                                  )}
                                  {service.name}
                                </div>
                                {!showVehicleTypes && (
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                    {service.vehicleTypes.length > 0
                                      ? service.vehicleTypes.slice(0, 2).join(', ') +
                                      (service.vehicleTypes.length > 2 ? '...' : '')
                                      : 'N/A'
                                    }
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle', textAlign: 'right' }}>
                                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--table-row-text)' }}>
                                  ₱{service.price.toLocaleString()}
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              {/* Desktop layout */}
                              {isSelectMode && (
                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                  <input type="checkbox" checked={selectedItems.has(service.id)} onChange={() => { }} onClick={(e) => e.stopPropagation()} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                                </td>
                              )}
                              <td style={{ padding: '0.75rem 1rem', color: 'var(--table-row-text)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {service.serviceId}
                                  {service.archived && (
                                    <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: 600 }}>Archived</span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem 1rem', color: 'var(--table-row-text)' }}>{service.name}</td>

                              {showDescription && (
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDescriptionModalService(service);
                                    }}
                                    style={{
                                      padding: '0.25rem 0.75rem',
                                      borderRadius: '9999px',
                                      border: '1px solid #2563eb',
                                      backgroundColor: 'var(--surface-elevated)',
                                      color: '#2563eb',
                                      fontSize: '0.75rem',
                                      fontWeight: 500,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Description
                                  </button>
                                </td>
                              )}
                              {showPrice && <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--table-row-text)' }}>₱{service.price.toLocaleString()}</td>}
                              {showStatus && (
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--table-row-text)', }}>
                                  <button
                                    type="button"
                                    disabled={!canToggleStatus}
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
                                      cursor: canToggleStatus ? 'pointer' : 'default',
                                    }}
                                  >
                                    {service.status}
                                  </button>
                                </td>
                              )}
                              {showVehicleTypes && (
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {service.vehicleTypes.map((type, i) => (
                                      <span
                                        key={i}
                                        style={{
                                          backgroundColor: 'var(--surface-hover)',
                                          color: 'var(--text-primary)',
                                          padding: '0.25rem 0.5rem',
                                          borderRadius: '0.25rem',
                                          fontSize: '0.75rem',
                                          border: '1px solid var(--border)'
                                        }}
                                      >
                                        {type}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              )}
                            </>
                          )}
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
              backgroundColor: 'var(--surface-elevated)',
              borderRadius: '0.75rem',
              padding: '1.5rem 2rem',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                {descriptionModalService.name}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
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
                    backgroundColor: 'var(--surface-elevated)',
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
        {/* Generic confirmation / message modal (desktop + general) */}
        {modalState.open && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2200,
          }}>
            <div style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'var(--surface-elevated)',
              borderRadius: '0.75rem',
              padding: '1.5rem 2rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.45)',
              border: '1px solid #e5e7eb',
            }}>
              <h3 style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                margin: 0,
                marginBottom: '0.75rem',
                color: modalState.tone === 'danger' ? '#b91c1c' : 'var(--text-primary)',
              }}>
                {modalState.title}
              </h3>
              <p style={{
                fontSize: '0.9rem',
                color: 'var(--text-primary)',
                margin: 0,
                marginBottom: '1.25rem',
                whiteSpace: 'pre-line',
              }}>
                {modalState.message}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                {modalState.cancelLabel && (
                  <button
                    type="button"
                    onClick={() => setModalState(prev => ({ ...prev, open: false }))}
                    style={{
                      padding: '0.45rem 0.9rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: 'var(--surface-elevated)',
                      color: '#374151',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    {modalState.cancelLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const cb = modalState.onConfirm;
                    setModalState(prev => ({ ...prev, open: false }));
                    if (cb) cb();
                  }}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '0.375rem',
                    border: '1px solid',
                    borderColor: modalState.tone === 'danger' ? '#b91c1c' : '#2563eb',
                    backgroundColor: modalState.tone === 'danger' ? '#fee2e2' : '#2563eb',
                    color: modalState.tone === 'danger' ? '#b91c1c' : 'white',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  {modalState.confirmLabel || 'OK'}
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
              backgroundColor: 'var(--surface-elevated)',
              borderRadius: '0.75rem',
              padding: '1.5rem 2rem',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                Service Settings
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--field-label-text)', marginBottom: '1rem' }}>
                Manage the vehicle type options used in the Services module.
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
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
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{type}</span>
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
                    backgroundColor: 'var(--surface-elevated)',
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