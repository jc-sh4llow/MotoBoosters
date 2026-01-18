import { FaHome, FaBars, FaWarehouse, FaTag, FaWrench, FaFileInvoice, FaPlus, FaUser, FaSearch, FaTimes, FaUndoAlt, FaCog, FaFileExcel, FaFilter, FaChevronDown } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { can } from '../../config/permissions';
import { useEffectiveRoleIds } from '../../hooks/useEffectiveRoleIds';
import logo from '../../assets/logo.png';
import { HeaderDropdown } from '../../components/HeaderDropdown';
import Switch from '../../components/ui/Switch';

export type CustomerRow = {
  id: string;          // Firestore document ID
  customerId: string;  // Business ID, e.g. CUS-001
  name: string;
  contact: string;
  email: string;
  address: string;
  vehicleTypes: string[];
  isArchived?: boolean;
};

export function Customers() {
  // Highlight text utility function for search results
  const highlightText = (text: string, search: string) => {
    if (!search || !text) return text;
    const parts = text.split(new RegExp(`(${search})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === search.toLowerCase() 
        ? <span key={i} style={{ backgroundColor: '#fef08a', color: '#854d0e', fontWeight: '600' }}>{part}</span>
        : part
    );
  };

  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { effectiveRoleIds } = useEffectiveRoleIds();

  // Permission checks using the can utility
  const canViewArchived = can(effectiveRoleIds, 'customers.view.archived');
  const canAddCustomers = can(effectiveRoleIds, 'customers.add');
  const canEditCustomers = can(effectiveRoleIds, 'customers.edit');
  const canArchiveCustomers = can(effectiveRoleIds, 'customers.archive');
  const canDeleteCustomers = can(effectiveRoleIds, 'customers.delete');
  const canExportCustomers = can(effectiveRoleIds, 'customers.export');



  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  let closeMenuTimeout: number | undefined;
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [showLeftScrollIndicator, setShowLeftScrollIndicator] = useState(false);
  const [showRightScrollIndicator, setShowRightScrollIndicator] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Required fields settings (loaded from Firestore)
  const [customersRequiredFields, setCustomersRequiredFields] = useState({
    customerName: true,
    contactNumber: false,
    email: false,
    address: false,
    vehicleType: false,
  });

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('');
  const [showArchivedFilter, setShowArchivedFilter] = useState(false);
  const [sortBy, setSortBy] = useState('customerId-asc');

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [customerForm, setCustomerForm] = useState({
    id: '',
    name: '',
    contact: '',
    email: '',
    address: '',
    vehicleTypes: [] as string[],
  });
  const [customerHasUnsavedChanges, setCustomerHasUnsavedChanges] = useState(false);

  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [shouldShowDetails, setShouldShowDetails] = useState(false);

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
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'archive' | 'unarchive' | 'hard'>('archive');

  // Select mode and bulk actions state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Action Bar accordion state and refs
  const [isActionBarExpanded, setIsActionBarExpanded] = useState(false);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);

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

  // Determine which columns to show based on viewport
  const showContact = viewportWidth >= 768; // Hide on mobile
  const showEmail = viewportWidth >= 992; // Hide on tablet and below
  const showAddress = viewportWidth >= 1200; // Hide on small desktop and below
  const showVehicleTypes = viewportWidth >= 992; // Hide on tablet and below

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

  // Click outside listener for details section
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside details section and not on a customer row
      const isDetailsClick = target.closest('[data-details-section]');
      const isRowClick = target.closest('table tbody tr');

      if (!isDetailsClick && !isRowClick && shouldShowDetails) {
        setIsDetailsVisible(false);
        setTimeout(() => setShouldShowDetails(false), 300);
      }
    };

    if (shouldShowDetails) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [shouldShowDetails]);

  // Click outside listener for Action Bar accordion
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionBarRef.current &&
        !actionBarRef.current.contains(event.target as Node) &&
        isActionBarExpanded &&
        !isSelectMode) {
        setIsActionBarExpanded(false);
      }
    };

    if (isActionBarExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isActionBarExpanded, isSelectMode]);

  // Click outside listener for Filters section
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filtersRef.current &&
        !filtersRef.current.contains(event.target as Node) &&
        showFilters) {
        setShowFilters(false);
      }
    };

    if (showFilters) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilters]);



  const getNextCustomerId = (existing: CustomerRow[]): string => {
    const maxNum = existing.reduce((max, c) => {
      const match = c.customerId?.match(/^CUS-(\d{3})$/);
      if (!match) return max;
      const num = parseInt(match[1], 10);
      return num > max ? num : max;
    }, 0);
    const next = maxNum + 1;
    return `CUS-${next.toString().padStart(3, '0')}`;
  };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all customers without requiring a customerId field or index
      const customersRef = collection(db, 'customers');
      const snapshot = await getDocs(customersRef);
      let loaded: CustomerRow[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          customerId: data.customerId ?? '',
          name: data.name ?? '',
          contact: data.contact ?? '',
          email: data.email ?? '',
          address: data.address ?? '',
          vehicleTypes: (data.vehicleTypes ?? []) as string[],
          isArchived: Boolean((data as any).isArchived),
        };
      });

      if (!canViewArchived) {
        loaded = loaded.filter(c => !c.isArchived);
      }

      console.log('Loaded customers from Firestore:', loaded.length, loaded);
      setCustomers(loaded);
    } catch (err) {
      console.error('Error loading customers from Firestore', err);
      setError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    // Reset form and hide the details panel, similar to Services page behavior
    setSelectedCustomer(null);
    setCustomerForm({
      id: '',
      name: '',
      contact: '',
      email: '',
      address: '',
      vehicleTypes: [],
    });
    setSelectedTypes(new Set());
    setCustomerHasUnsavedChanges(false);
    setIsDetailsVisible(false);
    setTimeout(() => setShouldShowDetails(false), 300);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const el = tableScrollRef.current;
      if (!el || !isMobile) {
        setShowLeftScrollIndicator(false);
        setShowRightScrollIndicator(false);
        return;
      }
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setShowLeftScrollIndicator(scrollLeft > 10);
      setShowRightScrollIndicator(scrollLeft < scrollWidth - clientWidth - 10);
    };
    const el = tableScrollRef.current;
    if (el && isMobile) {
      handleScroll();
      el.addEventListener('scroll', handleScroll);
      return () => el.removeEventListener('scroll', handleScroll);
    }
  }, [isMobile, customers]);

  // Load required fields settings from Firestore
  useEffect(() => {
    const loadRequiredFields = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'requiredFields'));
        if (settingsDoc.exists() && settingsDoc.data().customers) {
          const cust = settingsDoc.data().customers;
          setCustomersRequiredFields(prev => ({
            ...prev,
            customerName: cust.customerName ?? prev.customerName,
            contactNumber: cust.contactNumber ?? prev.contactNumber,
            email: cust.email ?? prev.email,
            address: cust.address ?? prev.address,
            vehicleType: cust.vehicleType ?? prev.vehicleType,
          }));
        }
      } catch (err) {
        console.error('Failed to load required fields settings:', err);
      }
    };
    loadRequiredFields();
  }, []);

  const handleTypeChange = (type: string) => {
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
      setCustomerHasUnsavedChanges(true);
      return newTypes;
    });
  };

  const handleRowClick = (customer: CustomerRow) => {
    setSelectedCustomer(customer);
    setCustomerForm({
      id: customer.customerId,
      name: customer.name,
      contact: customer.contact,
      email: customer.email,
      address: customer.address,
      vehicleTypes: customer.vehicleTypes,
    });
    setSelectedTypes(new Set(customer.vehicleTypes.length ? customer.vehicleTypes : []));
    setCustomerHasUnsavedChanges(false);
    setShouldShowDetails(true);
    setTimeout(() => setIsDetailsVisible(true), 10);
  };

  const handleNewCustomer = () => {
    setSelectedCustomer(null);
    setCustomerForm({
      id: '',
      name: '',
      contact: '',
      email: '',
      address: '',
      vehicleTypes: [],
    });
    setSelectedTypes(new Set());
    setCustomerHasUnsavedChanges(false);
    setShouldShowDetails(true);
    setTimeout(() => setIsDetailsVisible(true), 10);
  };

  const handleSaveCustomer = async () => {
    // Validate required fields based on settings
    if (customersRequiredFields.customerName && !customerForm.name.trim()) {
      setModalState({
        open: true,
        title: 'Missing Required Field',
        message: 'Customer Name is required.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'info',
        onConfirm: undefined,
      });
      return;
    }
    if (customersRequiredFields.contactNumber && !customerForm.contact.trim()) {
      setModalState({
        open: true,
        title: 'Missing Required Field',
        message: 'Contact Number is required.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'info',
        onConfirm: undefined,
      });
      return;
    }
    if (customersRequiredFields.email && !customerForm.email.trim()) {
      setModalState({
        open: true,
        title: 'Missing Required Field',
        message: 'Email is required.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'info',
        onConfirm: undefined,
      });
      return;
    }
    if (customersRequiredFields.address && !customerForm.address.trim()) {
      setModalState({
        open: true,
        title: 'Missing Required Field',
        message: 'Address is required.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'info',
        onConfirm: undefined,
      });
      return;
    }
    if (customersRequiredFields.vehicleType && selectedTypes.size === 0) {
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
      name: customerForm.name,
      contact: customerForm.contact,
      email: customerForm.email,
      address: customerForm.address,
      vehicleTypes: cleanedVehicleTypes,
    };

    try {
      if (selectedCustomer) {
        await updateDoc(doc(db, 'customers', selectedCustomer.id), {
          ...payload,
          customerId: selectedCustomer.customerId,
        });
      } else {
        const nextId = getNextCustomerId(customers);
        const docRef = await addDoc(collection(db, 'customers'), {
          ...payload,
          customerId: nextId,
        });

        setCustomerForm(prev => ({ ...prev, id: nextId }));
        setSelectedCustomer({
          id: docRef.id,
          customerId: nextId,
          name: payload.name,
          contact: payload.contact,
          email: payload.email,
          address: payload.address,
          vehicleTypes: payload.vehicleTypes,
        });
      }

      await loadCustomers();
      setCustomerHasUnsavedChanges(false);
      setIsDetailsVisible(false);
      setTimeout(() => setShouldShowDetails(false), 300);
    } catch (err) {
      console.error('Error saving customer', err);
      setModalState({
        open: true,
        title: 'Save Failed',
        message: 'Failed to save customer. Please try again.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'danger',
        onConfirm: undefined,
      });
    }
  };

  const handleDeleteCustomer = async () => {
    if (!canDeleteCustomers) return;
    if (!selectedCustomer) return;

    try {
      const customerRef = doc(db, 'customers', selectedCustomer.id);

      if (deleteMode === 'hard' && canDeleteCustomers) {
        await deleteDoc(customerRef);
      } else if (deleteMode === 'unarchive') {
        await updateDoc(customerRef, {
          isArchived: false,
          archivedAt: null,
          archivedBy: null,
        } as any);
      } else {
        await updateDoc(customerRef, {
          isArchived: true,
          archivedAt: new Date().toISOString(),
          archivedBy: user?.name || null,
        });
      }
      await loadCustomers();
      setSelectedCustomer(null);
      setCustomerForm({
        id: '',
        name: '',
        contact: '',
        email: '',
        address: '',
        vehicleTypes: [],
      });
      setSelectedTypes(new Set());
      setCustomerHasUnsavedChanges(false);
      setIsDetailsVisible(false);
      setTimeout(() => setShouldShowDetails(false), 300);
    } catch (err) {
      console.error('Error deleting customer', err);
      setModalState({
        open: true,
        title: 'Delete Failed',
        message: 'Failed to delete customer. Please try again.',
        confirmLabel: 'Close',
        cancelLabel: undefined,
        tone: 'danger',
        onConfirm: undefined,
      });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
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

  const filteredCustomers = (() => {
    const filtered = customers.filter(customer => {
      // Search filter
      const q = searchTerm.trim().toLowerCase();
      if (q) {
        const idMatch = customer.customerId.toLowerCase().includes(q);
        const nameMatch = customer.name.toLowerCase().includes(q);
        const contactMatch = customer.contact.toLowerCase().includes(q);
        const emailMatch = customer.email.toLowerCase().includes(q);
        const addressMatch = customer.address.toLowerCase().includes(q);
        const vehicleTypesMatch = customer.vehicleTypes.join(' ').toLowerCase().includes(q);

        if (!idMatch && !nameMatch && !contactMatch && !emailMatch && !addressMatch && !vehicleTypesMatch) {
          return false;
        }
      }

      // Vehicle type filter
      if (vehicleTypeFilter && vehicleTypeFilter !== 'All Types') {
        if (!customer.vehicleTypes.includes(vehicleTypeFilter)) {
          return false;
        }
      }

      // Archived filter
      if (!showArchivedFilter && customer.isArchived) {
        return false;
      }

      return true;
    });

    // Apply sorting
    const [field, dir] = sortBy.split('-');
    const desc = dir === 'desc';

    filtered.sort((a, b) => {
      switch (field) {
        case 'customerId': {
          return desc ? b.customerId.localeCompare(a.customerId) : a.customerId.localeCompare(b.customerId);
        }
        case 'name': {
          return desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
        }
        case 'contact': {
          return desc ? b.contact.localeCompare(a.contact) : a.contact.localeCompare(b.contact);
        }
        case 'email': {
          return desc ? b.email.localeCompare(a.email) : a.email.localeCompare(b.email);
        }
        case 'address': {
          return desc ? b.address.localeCompare(a.address) : a.address.localeCompare(b.address);
        }
        default:
          return 0;
      }
    });

    return filtered;
  })();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: 'var(--bg-gradient)',
      backgroundSize: 'cover',
      backgroundAttachment: 'fixed',
      padding: '2rem',
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
        zIndex: 5,
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
          zIndex: 100,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: '1560px',
            margin: '0 auto',
            width: '100%',
            position: 'relative',
          }}>
            {/* Left: logo, title, welcome */}
            <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: '1.5rem' }}>
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

              {/* Container for title + welcome message (mobile: stacked, desktop: inline) */}
              <div style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'baseline',
                gap: isMobile ? '0.25rem' : '0.75rem'
              }}>
                <h1 style={{
                  fontSize: isMobile ? '1.5rem' : '1.875rem',
                  fontWeight: 'bold',
                  color: 'var(--text-primary)',
                  margin: 0,
                  lineHeight: isMobile ? '1.75rem' : 'normal',
                }}>
                  Customers
                </h1>
                <span style={{
                  color: '#374151',
                  fontSize: isMobile ? '0.75rem' : '0.9rem',
                  marginLeft: isMobile ? '0' : '1rem',
                }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
              </div>
            </div>

            {/* Right: search bar, Logout, navbar toggle */}
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
              {/* Search bar - Desktop only, hidden on mobile */}
              {!isMobile && (
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  marginRight: '1rem',
                }}>
                  <FaSearch style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af',
                  }} />
                  <input
                    type="text"
                    placeholder="Search customers..."
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
              )}

              {/* Hide logout button on mobile (will be in dropdown) */}
              {viewportWidth >= 768 && user && (
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
                currentPage="customers"
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onLogout={() => {
                  logout();
                  navigate('/login');
                }}
                userName={user?.name}
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

        <main
          style={{
            transition: 'margin-left 0.3s ease',
          }}
        >
          {/* Action Bar */}
          <section style={{ marginBottom: '1rem' }}>
            {viewportWidth >= 768 ? (
              /* Desktop: Horizontal layout */
              <div style={{ backgroundColor: 'var(--surface-elevated)', borderRadius: '0.5rem', padding: '1rem', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showFilters ? '1rem' : 0 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {canExportCustomers && (
                      <button type="button" onClick={() => {
                        const rows = filteredCustomers;
                        if (!rows.length) return;
                        const headers = ['Customer ID', 'Name', 'Contact', 'Email', 'Address', 'Vehicle Types', 'Status'];
                        const escapeCell = (v: unknown) => { const s = (v ?? '').toString(); return s.includes('"') || s.includes(',') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
                        const csv = [headers.join(','), ...rows.map(c => [c.customerId, c.name, c.contact, c.email, c.address, c.vehicleTypes.join('; '), c.isArchived ? 'Archived' : 'Active'].map(escapeCell).join(','))].join('\r\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `customers_${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
                      }} style={{ backgroundColor: '#059669', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, fontSize: '0.875rem', height: '40px' }}>
                        Export to CSV <FaFileExcel />
                      </button>
                    )}
                    {canArchiveCustomers && (
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
                          fontWeight: 500,
                          fontSize: '0.875rem',
                          height: '40px',
                        }}
                      >
                        {isSelectMode ? 'Cancel' : 'Select'}
                      </button>
                    )}

                    {/* Bulk actions when select mode is active */}
                    {isSelectMode && canArchiveCustomers && selectedItems.size > 0 && (
                      <>
                        {/* Helper counts for selected archived/unarchived customers */}
                        {(() => {
                          const selectedCustomers = filteredCustomers.filter(c => selectedItems.has(c.id));
                          const selectedArchivedCount = selectedCustomers.filter(c => c.isArchived).length;
                          const selectedUnarchivedCount = selectedCustomers.filter(c => !c.isArchived).length;

                          return (
                            <>
                              {/* Scenario 1 & 3: at least one unarchived selected -> Archive button */}
                              {selectedUnarchivedCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const itemsToArchive = selectedCustomers.filter(c => !c.isArchived);
                                    if (!itemsToArchive.length) return;
                                    setModalState({
                                      open: true,
                                      title: 'Archive Customers',
                                      message: `Archive ${itemsToArchive.length} customer(s)?`,
                                      confirmLabel: 'Archive',
                                      cancelLabel: 'Cancel',
                                      tone: 'danger',
                                      onConfirm: async () => {
                                        try {
                                          for (const item of itemsToArchive) {
                                            await updateDoc(doc(db, 'customers', item.id), { isArchived: true });
                                          }
                                          await loadCustomers();
                                          setSelectedItems(new Set());
                                          setIsSelectMode(false);
                                        } catch (err) {
                                          console.error('Error archiving customers', err);
                                          setModalState({
                                            open: true,
                                            title: 'Archive Failed',
                                            message: 'Failed to archive selected customers. Please try again.',
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
                                  Archive
                                </button>
                              )}

                              {/* Scenario 2 & 3: at least one archived selected -> Unarchive button */}
                              {selectedArchivedCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const itemsToUnarchive = selectedCustomers.filter(c => c.isArchived);
                                    if (!itemsToUnarchive.length) return;
                                    setModalState({
                                      open: true,
                                      title: 'Unarchive Customers',
                                      message: `Unarchive ${itemsToUnarchive.length} customer(s)?`,
                                      confirmLabel: 'Unarchive',
                                      cancelLabel: 'Cancel',
                                      tone: 'info',
                                      onConfirm: async () => {
                                        try {
                                          for (const item of itemsToUnarchive) {
                                            await updateDoc(doc(db, 'customers', item.id), { isArchived: false });
                                          }
                                          await loadCustomers();
                                          setSelectedItems(new Set());
                                          setIsSelectMode(false);
                                        } catch (err) {
                                          console.error('Error unarchiving customers', err);
                                          setModalState({
                                            open: true,
                                            title: 'Unarchive Failed',
                                            message: 'Failed to unarchive selected customers. Please try again.',
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
                                  Unarchive
                                </button>
                              )}

                              {/* Scenario 2: only archived selected -> Delete button with double confirmation */}
                              {canDeleteCustomers && selectedArchivedCount > 0 && selectedUnarchivedCount === 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const itemsToDelete = selectedCustomers.filter(c => c.isArchived);
                                    if (!itemsToDelete.length) return;
                                    // First confirmation
                                    setModalState({
                                      open: true,
                                      title: 'Delete Archived Customers',
                                      message: `Delete ${itemsToDelete.length} archived customer(s)? This cannot be undone.`,
                                      confirmLabel: 'Continue',
                                      cancelLabel: 'Cancel',
                                      tone: 'danger',
                                      onConfirm: () => {
                                        // Second, stronger confirmation
                                        setModalState({
                                          open: true,
                                          title: 'Confirm Permanent Deletion',
                                          message: 'Are you absolutely sure you want to permanently delete the selected archived customers? This action cannot be undone.',
                                          confirmLabel: 'Delete',
                                          cancelLabel: 'Cancel',
                                          tone: 'danger',
                                          onConfirm: async () => {
                                            try {
                                              for (const item of itemsToDelete) {
                                                await deleteDoc(doc(db, 'customers', item.id));
                                              }
                                              await loadCustomers();
                                              setSelectedItems(new Set());
                                              setIsSelectMode(false);
                                            } catch (err) {
                                              console.error('Error deleting customers', err);
                                              setModalState({
                                                open: true,
                                                title: 'Delete Failed',
                                                message: 'Failed to delete selected customers. Please try again.',
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
                                  Delete
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button type="button" onClick={() => setShowFilters(!showFilters)} style={{ backgroundColor: '#1e40af', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, fontSize: '0.875rem', height: '40px' }}>
                      Filters <FaFilter />
                    </button>
                    <button type="button" onClick={() => { setVehicleTypeFilter(''); setShowArchivedFilter(false); setSortBy('id-asc'); }} style={{ backgroundColor: '#6b7280', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', height: '40px' }}>
                      Clear Filters
                    </button>
                  </div>
                </div>
                {showFilters && (
                  <div ref={filtersRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>Vehicle Type</label>
                      <select value={vehicleTypeFilter} onChange={(e) => setVehicleTypeFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}>
                        <option value="">All Types</option>
                        {vehicleTypeOptions.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                        <Switch
                          checked={showArchivedFilter}
                          onChange={(checked) => setShowArchivedFilter(checked)}
                          size="sm"
                        />
                        Show Archived
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
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
                <div style={{
                  maxHeight: (isActionBarExpanded || isSelectMode) ? '1000px' : '0',
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease-out'
                }}>
                  <div style={{
                    padding: (isActionBarExpanded || isSelectMode) ? '1rem' : '0 1rem',
                    paddingTop: '0',
                    borderTop: (isActionBarExpanded || isSelectMode) ? '1px solid #e5e7eb' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}>
                    {/* New Customer Button - First */}
                    {canAddCustomers && (
                      <button
                        onClick={handleNewCustomer}
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
                        New Customer
                      </button>
                    )}

                    {/* Export to CSV */}
                    {canExportCustomers && (
                      <button type="button" onClick={() => {
                        const rows = filteredCustomers;
                        if (!rows.length) return;
                        const headers = ['Customer ID', 'Name', 'Contact', 'Email', 'Address', 'Vehicle Types', 'Status'];
                        const escapeCell = (v: unknown) => { const s = (v ?? '').toString(); return s.includes('"') || s.includes(',') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
                        const csv = [headers.join(','), ...rows.map(c => [c.customerId, c.name, c.contact, c.email, c.address, c.vehicleTypes.join('; '), c.isArchived ? 'Archived' : 'Active'].map(escapeCell).join(','))].join('\r\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `customers_${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
                      }} style={{ backgroundColor: '#059669', color: 'white', padding: '0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        Export to CSV <FaFileExcel />
                      </button>
                    )}

                    {/* Select Button */}
                    {canArchiveCustomers && (
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
                          fontWeight: 500,
                          fontSize: '0.875rem',
                          width: '100%'
                        }}
                      >
                        {isSelectMode ? 'Cancel' : 'Select'}
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
                          {selectedItems.size} customer{selectedItems.size !== 1 ? 's' : ''} selected
                        </div>

                        {(() => {
                          const selectedCustomers = filteredCustomers.filter(c => selectedItems.has(c.id));
                          const selectedArchivedCount = selectedCustomers.filter(c => c.isArchived).length;
                          const selectedUnarchivedCount = selectedCustomers.filter(c => !c.isArchived).length;

                          return (
                            <>
                              {selectedUnarchivedCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const itemsToArchive = selectedCustomers.filter(c => !c.isArchived);
                                    if (!itemsToArchive.length) return;
                                    setModalState({
                                      open: true,
                                      title: 'Archive Customers',
                                      message: `Archive ${itemsToArchive.length} customer(s)?`,
                                      confirmLabel: 'Archive',
                                      cancelLabel: 'Cancel',
                                      tone: 'danger',
                                      onConfirm: async () => {
                                        try {
                                          for (const item of itemsToArchive) {
                                            await updateDoc(doc(db, 'customers', item.id), { isArchived: true });
                                          }
                                          await loadCustomers();
                                          setSelectedItems(new Set());
                                          setIsSelectMode(false);
                                        } catch (err) {
                                          console.error('Error archiving customers', err);
                                          setModalState({
                                            open: true,
                                            title: 'Archive Failed',
                                            message: 'Failed to archive selected customers. Please try again.',
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
                                    padding: '0.75rem',
                                    borderRadius: '0.375rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    fontSize: '0.875rem',
                                    width: '100%'
                                  }}
                                >
                                  Archive
                                </button>
                              )}

                              {selectedArchivedCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const itemsToUnarchive = selectedCustomers.filter(c => c.isArchived);
                                    if (!itemsToUnarchive.length) return;
                                    setModalState({
                                      open: true,
                                      title: 'Unarchive Customers',
                                      message: `Unarchive ${itemsToUnarchive.length} customer(s)?`,
                                      confirmLabel: 'Unarchive',
                                      cancelLabel: 'Cancel',
                                      tone: 'info',
                                      onConfirm: async () => {
                                        try {
                                          for (const item of itemsToUnarchive) {
                                            await updateDoc(doc(db, 'customers', item.id), { isArchived: false });
                                          }
                                          await loadCustomers();
                                          setSelectedItems(new Set());
                                          setIsSelectMode(false);
                                        } catch (err) {
                                          console.error('Error unarchiving customers', err);
                                          setModalState({
                                            open: true,
                                            title: 'Unarchive Failed',
                                            message: 'Failed to unarchive selected customers. Please try again.',
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
                                    padding: '0.75rem',
                                    borderRadius: '0.375rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    fontSize: '0.875rem',
                                    width: '100%'
                                  }}
                                >
                                  Unarchive
                                </button>
                              )}

                              {canDeleteCustomers && selectedArchivedCount > 0 && selectedUnarchivedCount === 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const itemsToDelete = selectedCustomers.filter(c => c.isArchived);
                                    if (!itemsToDelete.length) return;
                                    setModalState({
                                      open: true,
                                      title: 'Delete Archived Customers',
                                      message: `Delete ${itemsToDelete.length} archived customer(s)? This cannot be undone.`,
                                      confirmLabel: 'Continue',
                                      cancelLabel: 'Cancel',
                                      tone: 'danger',
                                      onConfirm: () => {
                                        setModalState({
                                          open: true,
                                          title: 'Confirm Permanent Deletion',
                                          message: 'Are you absolutely sure you want to permanently delete the selected archived customers? This action cannot be undone.',
                                          confirmLabel: 'Delete',
                                          cancelLabel: 'Cancel',
                                          tone: 'danger',
                                          onConfirm: async () => {
                                            try {
                                              for (const item of itemsToDelete) {
                                                await deleteDoc(doc(db, 'customers', item.id));
                                              }
                                              await loadCustomers();
                                              setSelectedItems(new Set());
                                              setIsSelectMode(false);
                                            } catch (err) {
                                              console.error('Error deleting customers', err);
                                              setModalState({
                                                open: true,
                                                title: 'Delete Failed',
                                                message: 'Failed to delete selected customers. Please try again.',
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
                                    padding: '0.75rem',
                                    borderRadius: '0.375rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    fontSize: '0.875rem',
                                    width: '100%'
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}

                    {/* Filters Button */}
                    <button type="button" onClick={() => setShowFilters(!showFilters)} style={{ backgroundColor: '#1e40af', color: 'white', padding: '0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      Filters <FaFilter />
                    </button>

                    {/* Clear Filters Button */}
                    <button type="button" onClick={() => { setVehicleTypeFilter(''); setShowArchivedFilter(false); setSortBy('id-asc'); }} style={{ backgroundColor: '#6b7280', color: 'white', padding: '0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', width: '100%' }}>
                      Clear Filters
                    </button>
                  </div>
                </div>

                  {/* Filters Panel - Mobile */}
                  {showFilters && (
                    <div ref={filtersRef} style={{ padding: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>Vehicle Type</label>
                        <select value={vehicleTypeFilter} onChange={(e) => setVehicleTypeFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}>
                          <option value="">All Types</option>
                          {vehicleTypeOptions.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                          <Switch
                            checked={showArchivedFilter}
                            onChange={(checked) => setShowArchivedFilter(checked)}
                            size="sm"
                          />
                          Show Archived
                        </div>
                      </div>
                    </div>
                  )}
                </div>
            )}
              </section>

          {/* Main Content */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.65)',
                borderRadius: '1rem',
                padding: '2rem',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '1.5rem',
                  alignItems: 'flex-start',
                }}
              >
                {/* Customer Details Section */}
                {shouldShowDetails && !isMobile && (
                  <div
                    data-details-section
                    style={{
                      backgroundColor: 'var(--surface-elevated)',
                      backdropFilter: 'blur(12px)',
                      borderRadius: '0.5rem',
                      padding: '1.5rem',
                      border: '1px solid var(--border)',
                      boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                      height: 'fit-content',
                      position: 'sticky',
                      top: '1rem',
                      flexBasis: '32%',
                      maxWidth: '32%',
                      overflow: 'hidden',
                      transform: isDetailsVisible ? 'translateX(0)' : 'translateX(-24px)',
                      opacity: isDetailsVisible ? 1 : 0,
                      transition: 'transform 0.3s ease, opacity 0.3s ease',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h2
                      style={{
                        color: 'var(--text-primary)',
                        marginBottom: '1.5rem',
                        fontSize: '1.25rem',
                        fontWeight: '600',
                      }}
                    >
                      Customer Details
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Customer ID (readonly) */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: 'var(--field-label-text)',
                          }}
                        >
                          Customer ID
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={customerForm.id || 'Auto-generated'}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'rgba(255, 255, 255)',
                            color: '#6b7280',
                          }}
                        />
                      </div>

                      {/* Customer Name */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: 'var(--field-label-text)',
                          }}
                        >
                          Customer Name{customersRequiredFields.customerName ? ' *' : ''}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Enter customer name"
                          value={customerForm.name}
                          onChange={(e) => {
                            setCustomerForm(prev => ({ ...prev, name: e.target.value }));
                            setCustomerHasUnsavedChanges(true);
                          }}
                          disabled={!canEditCustomers}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'var(--surface-elevated)',
                            color: 'var(--text-primary)',
                          }}
                        />
                      </div>

                      {/* Contact Number */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: 'var(--field-label-text)',
                          }}
                        >
                          Contact Number{customersRequiredFields.contactNumber ? ' *' : ''}
                        </label>
                        <input
                          type="text"
                          inputMode="tel"
                          placeholder="09xxxxxxxxx"
                          value={customerForm.contact}
                          onChange={(e) => {
                            setCustomerForm(prev => ({ ...prev, contact: e.target.value }));
                            setCustomerHasUnsavedChanges(true);
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.border = '2px solid #3b82f6';
                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.border = '1px solid #d1d5db';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          disabled={!canEditCustomers}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'var(--surface-elevated)',
                            color: 'var(--text-primary)',
                            fontSize: '16px',
                            minHeight: '48px'
                          }}
                        />
                      </div>

                      {/* Email */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: 'var(--field-label-text)',
                          }}
                        >
                          Email{customersRequiredFields.email ? ' *' : ''}
                        </label>
                        <input
                          type="email"
                          inputMode="email"
                          placeholder="customer@example.com"
                          value={customerForm.email}
                          onChange={(e) => {
                            setCustomerForm(prev => ({ ...prev, email: e.target.value }));
                            setCustomerHasUnsavedChanges(true);
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.border = '2px solid #3b82f6';
                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.border = '1px solid #d1d5db';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          disabled={!canEditCustomers}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'var(--surface-elevated)',
                            color: 'var(--text-primary)',
                            fontSize: '16px',
                            minHeight: '48px'
                          }}
                        />
                      </div>

                      {/* Address */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: 'var(--field-label-text)',
                          }}
                        >
                          Address{customersRequiredFields.address ? ' *' : ''}
                        </label>
                        <textarea
                          placeholder="Enter address"
                          rows={3}
                          value={customerForm.address}
                          onChange={(e) => {
                            setCustomerForm(prev => ({ ...prev, address: e.target.value }));
                            setCustomerHasUnsavedChanges(true);
                          }}
                          disabled={!canEditCustomers}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'var(--surface-elevated)',
                            color: 'var(--text-primary)',
                            resize: 'vertical',
                            minHeight: '4.5rem',
                          }}
                        />
                      </div>

                      {/* Vehicle Types */}
                      <div>
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: 'var(--field-label-text)',
                          }}
                        >
                          Vehicle Type(s){customersRequiredFields.vehicleType ? ' *' : ''}
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {vehicleTypeOptions.map((type) => (
                            <label
                              key={type}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: canEditCustomers ? 'pointer' : 'default',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedTypes.has(type)}
                                onChange={() => handleTypeChange(type)}
                                disabled={!canEditCustomers}
                                style={{
                                  width: '1rem',
                                  height: '1rem',
                                  borderRadius: '0.25rem',
                                  border: '1px solid #d1d5db',
                                  backgroundColor: 'white',
                                  cursor: 'pointer',
                                }}
                              />
                              <span style={{ fontSize: '0.875rem', color: '#111827' }}>{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Form Actions (only for users with edit permission) */}
                      {canEditCustomers && (
                        <>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '1rem',
                            marginTop: '1rem',
                          }}>
                            <button
                              type="button"
                              disabled={!customerHasUnsavedChanges}
                              onClick={handleSaveCustomer}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                                width: '50%',
                              }}
                              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
                            >
                              Save Customer
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: 'white',
                                color: 'var(--field-label-text)',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.375rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                width: '50%',
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
                          {canArchiveCustomers && selectedCustomer && !selectedCustomer.isArchived && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteMode('archive');
                                setIsDeleteConfirmOpen(true);
                              }}
                              style={{
                                marginTop: '0.75rem',
                                padding: '0.5rem 1rem',
                                backgroundColor: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '0.375rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                width: '100%',
                              }}
                            >
                              Archive Customer
                            </button>
                          )}
                          {canArchiveCustomers && selectedCustomer && selectedCustomer.isArchived && (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteMode('unarchive');
                                  setIsDeleteConfirmOpen(true);
                                }}
                                style={{
                                  flex: 1,
                                  padding: '0.5rem 1rem',
                                  backgroundColor: '#dbeafe',
                                  color: '#1d4ed8',
                                  border: '1px solid #93c5fd',
                                  borderRadius: '0.375rem',
                                  fontWeight: '500',
                                  cursor: 'pointer',
                                }}
                              >
                                Unarchive
                              </button>
                              {canDeleteCustomers && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteMode('hard');
                                    setIsDeleteConfirmOpen(true);
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#fef2f2',
                                    color: '#dc2626',
                                    border: '1px solid #fecaca',
                                    borderRadius: '0.375rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile Overlay for Customer Details */}
                {shouldShowDetails && isMobile && (
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
                        maxWidth: '100%',
                        margin: '0 auto',
                        padding: '0 0.5rem'
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
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '1.5rem'
                        }}>
                          <h2 style={{
                            fontSize: '1.25rem',
                            fontWeight: '600',
                            color: 'var(--text-primary)',
                            margin: 0
                          }}>
                            Customer Details
                          </h2>
                          <button
                            onClick={() => {
                              setIsDetailsVisible(false);
                              setTimeout(() => setShouldShowDetails(false), 300);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              fontSize: '1.5rem',
                              cursor: 'pointer',
                              color: '#6b7280',
                              padding: '0.25rem',
                              lineHeight: 1,
                              minWidth: '32px',
                              minHeight: '32px',
                              borderRadius: '0.375rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {/* Customer ID (readonly) */}
                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '0.5rem',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                color: 'var(--field-label-text)',
                              }}
                            >
                              Customer ID
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={customerForm.id || 'Auto-generated'}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'rgba(255, 255, 255)',
                                color: '#6b7280',
                              }}
                            />
                          </div>

                          {/* Customer Name */}
                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '0.5rem',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                color: 'var(--field-label-text)',
                              }}
                            >
                              Customer Name{customersRequiredFields.customerName ? ' *' : ''}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Enter customer name"
                              value={customerForm.name}
                              onChange={(e) => {
                                setCustomerForm(prev => ({ ...prev, name: e.target.value }));
                                setCustomerHasUnsavedChanges(true);
                              }}
                              disabled={!canEditCustomers}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'var(--surface-elevated)',
                                color: 'var(--text-primary)',
                              }}
                            />
                          </div>

                          {/* Contact Number */}
                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '0.5rem',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                color: 'var(--field-label-text)',
                              }}
                            >
                              Contact Number{customersRequiredFields.contactNumber ? ' *' : ''}
                            </label>
                            <input
                              type="text"
                              placeholder="09xxxxxxxxx"
                              value={customerForm.contact}
                              onChange={(e) => {
                                setCustomerForm(prev => ({ ...prev, contact: e.target.value }));
                                setCustomerHasUnsavedChanges(true);
                              }}
                              disabled={!canEditCustomers}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'var(--surface-elevated)',
                                color: 'var(--text-primary)',
                              }}
                            />
                          </div>

                          {/* Email */}
                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '0.5rem',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                color: 'var(--field-label-text)',
                              }}
                            >
                              Email{customersRequiredFields.email ? ' *' : ''}
                            </label>
                            <input
                              type="email"
                              placeholder="customer@example.com"
                              value={customerForm.email}
                              onChange={(e) => {
                                setCustomerForm(prev => ({ ...prev, email: e.target.value }));
                                setCustomerHasUnsavedChanges(true);
                              }}
                              disabled={!canEditCustomers}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'var(--surface-elevated)',
                                color: 'var(--text-primary)',
                              }}
                            />
                          </div>

                          {/* Address */}
                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '0.5rem',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                color: 'var(--field-label-text)',
                              }}
                            >
                              Address{customersRequiredFields.address ? ' *' : ''}
                            </label>
                            <textarea
                              placeholder="Enter address"
                              rows={3}
                              value={customerForm.address}
                              onChange={(e) => {
                                setCustomerForm(prev => ({ ...prev, address: e.target.value }));
                                setCustomerHasUnsavedChanges(true);
                              }}
                              disabled={!canEditCustomers}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                backgroundColor: 'var(--surface-elevated)',
                                color: 'var(--text-primary)',
                                resize: 'vertical',
                                minHeight: '4.5rem',
                              }}
                            />
                          </div>

                          {/* Vehicle Types */}
                          <div>
                            <label
                              style={{
                                display: 'block',
                                marginBottom: '0.5rem',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                color: 'var(--field-label-text)',
                              }}
                            >
                              Vehicle Type(s){customersRequiredFields.vehicleType ? ' *' : ''}
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {vehicleTypeOptions.map((type) => (
                                <label
                                  key={type}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    cursor: canEditCustomers ? 'pointer' : 'default',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedTypes.has(type)}
                                    onChange={() => handleTypeChange(type)}
                                    disabled={!canEditCustomers}
                                    style={{ width: '16px', height: '16px' }}
                                  />
                                  <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                                    {type}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {canEditCustomers && (
                            <>
                              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <button
                                  type="button"
                                  onClick={handleSaveCustomer}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    width: '50%',
                                  }}
                                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
                                >
                                  Save Customer
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: 'white',
                                    color: 'var(--field-label-text)',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.375rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    width: '50%',
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
                              {canArchiveCustomers && selectedCustomer && !selectedCustomer.isArchived && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteMode('archive');
                                    setIsDeleteConfirmOpen(true);
                                  }}
                                  style={{
                                    marginTop: '0.75rem',
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#fef2f2',
                                    color: '#dc2626',
                                    border: '1px solid #fecaca',
                                    borderRadius: '0.375rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    width: '100%',
                                  }}
                                >
                                  Archive Customer
                                </button>
                              )}
                              {canArchiveCustomers && selectedCustomer && selectedCustomer.isArchived && (
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteMode('unarchive');
                                      setIsDeleteConfirmOpen(true);
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: '0.5rem 1rem',
                                      backgroundColor: '#dbeafe',
                                      color: '#1d4ed8',
                                      border: '1px solid #93c5fd',
                                      borderRadius: '0.375rem',
                                      fontWeight: '500',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Unarchive
                                  </button>
                                  {canDeleteCustomers && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteMode('hard');
                                        setIsDeleteConfirmOpen(true);
                                      }}
                                      style={{
                                        flex: 1,
                                        padding: '0.5rem 1rem',
                                        backgroundColor: '#fef2f2',
                                        color: '#dc2626',
                                        border: '1px solid #fecaca',
                                        borderRadius: '0.375rem',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Available Customers Table */}
                <div
                  style={{
                    flex: 1,
                    backgroundColor: 'white',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1.5rem',
                    }}
                  >
                    <h2
                      style={{
                        color: 'black',
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        color: '#1e40af',
                        margin: 0,
                      }}
                    >
                      Available Customers
                    </h2>
                    {canEditCustomers && !isMobile && (
                      <button
                        type="button"
                        onClick={handleNewCustomer}
                        style={{
                          padding: '0.35rem 0.9rem',
                          borderRadius: '9999px',
                          border: '1px solid #3b82f6',
                          backgroundColor: 'white',
                          color: '#1d4ed8',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        New Customer
                      </button>
                    )}
                  </div>

                  <div style={{ position: 'relative' }}>
                    {isMobile && showLeftScrollIndicator && (
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '20px',
                        background: 'linear-gradient(to right, rgba(0,0,0,0.1), transparent)',
                        pointerEvents: 'none',
                        zIndex: 10,
                        borderTopLeftRadius: '0.5rem',
                        borderBottomLeftRadius: '0.5rem',
                      }} />
                    )}
                    {isMobile && showRightScrollIndicator && (
                      <div style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '20px',
                        background: 'linear-gradient(to left, rgba(0,0,0,0.1), transparent)',
                        pointerEvents: 'none',
                        zIndex: 10,
                        borderTopRightRadius: '0.5rem',
                        borderBottomRightRadius: '0.5rem',
                      }} />
                    )}
                    <div
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '0.5rem',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        ref={tableScrollRef}
                        style={{
                          maxHeight: '520px',
                          overflow: 'auto',
                          WebkitOverflowScrolling: 'touch',
                        }}
                      >
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr
                              style={{
                                backgroundColor: '#f3f4f6',
                                position: 'sticky',
                                top: 0,
                                zIndex: 1,
                              }}
                            >
                              {isSelectMode && (
                                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '40px' }}>
                                  <input type="checkbox" checked={selectedItems.size === filteredCustomers.length && filteredCustomers.length > 0} onChange={(e) => { if (e.target.checked) { setSelectedItems(new Set(filteredCustomers.map(c => c.id))); } else { setSelectedItems(new Set()); } }} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                                </th>
                              )}
                              {isMobile ? (
                                /* Mobile: Combined Customer column */
                                <th
                                  onClick={() => handleHeaderSort('name')}
                                  style={{
                                    padding: '0.75rem 1rem',
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    textAlign: 'left',
                                    color: '#6b7280',
                                    borderBottom: '1px solid #e5e7eb',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                  }}
                                >
                                  Customer {sortBy.startsWith('name-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                                </th>
                              ) : (
                                /* Desktop: Separate Customer ID and Name columns */
                                <>
                                  <th
                                    onClick={() => handleHeaderSort('customerId')}
                                    style={{
                                      padding: '0.75rem 1rem',
                                      fontSize: '0.75rem',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em',
                                      textAlign: 'left',
                                      color: '#6b7280',
                                      borderBottom: '1px solid #e5e7eb',
                                      cursor: 'pointer',
                                      userSelect: 'none',
                                    }}
                                  >
                                    Customer ID {sortBy.startsWith('customerId-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                                  </th>
                                  <th
                                    onClick={() => handleHeaderSort('name')}
                                    style={{
                                      padding: '0.75rem 1rem',
                                      fontSize: '0.75rem',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em',
                                      textAlign: 'left',
                                      color: '#6b7280',
                                      borderBottom: '1px solid #e5e7eb',
                                      cursor: 'pointer',
                                      userSelect: 'none',
                                    }}
                                  >
                                    Customer Name {sortBy.startsWith('name-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                                  </th>
                                </>
                              )}
                              {isMobile ? (
                                /* Mobile: Combined Contact column */
                                <th
                                  onClick={() => handleHeaderSort('contact')}
                                  style={{
                                    padding: '0.75rem 1rem',
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    textAlign: 'left',
                                    color: '#6b7280',
                                    borderBottom: '1px solid #e5e7eb',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                  }}
                                >
                                  Contact {sortBy.startsWith('contact-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                                </th>
                              ) : (
                                /* Desktop: Separate Contact and Email columns */
                                <>
                                  {showContact && (
                                    <th
                                      onClick={() => handleHeaderSort('contact')}
                                      style={{
                                        padding: '0.75rem 1rem',
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        textAlign: 'left',
                                        color: '#6b7280',
                                        borderBottom: '1px solid #e5e7eb',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                      }}
                                    >
                                      Contact Number {sortBy.startsWith('contact-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                                    </th>
                                  )}
                                  {showEmail && (
                                    <th
                                      onClick={() => handleHeaderSort('email')}
                                      style={{
                                        padding: '0.75rem 1rem',
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        textAlign: 'left',
                                        color: '#6b7280',
                                        borderBottom: '1px solid #e5e7eb',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                      }}
                                    >
                                      Email {sortBy.startsWith('email-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                                    </th>
                                  )}
                                </>
                              )}
                              {showAddress && (
                                <th
                                  onClick={() => handleHeaderSort('address')}
                                  style={{
                                    padding: '0.75rem 1rem',
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    textAlign: 'left',
                                    color: '#6b7280',
                                    borderBottom: '1px solid #e5e7eb',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                  }}
                                >
                                  Address {sortBy.startsWith('address-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                                </th>
                              )}
                              {showVehicleTypes && (
                                <th
                                  style={{
                                    padding: '0.75rem 1rem',
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    textAlign: 'left',
                                    color: '#6b7280',
                                    borderBottom: '1px solid #e5e7eb',
                                  }}
                                >
                                  Vehicle Type(s)
                                </th>
                              )}
                              {canViewArchived && !isMobile && (
                                <th
                                  style={{
                                    padding: '0.75rem 1rem',
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    textAlign: 'left',
                                    color: '#6b7280',
                                    borderBottom: '1px solid #e5e7eb',
                                  }}
                                >
                                  Status
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {loading ? (
                              <tr>
                                <td
                                  colSpan={canViewArchived ? 7 : 6}
                                  style={{
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    fontSize: '0.875rem',
                                    color: '#6b7280',
                                  }}
                                >
                                  Loading customers...
                                </td>
                              </tr>
                            ) : error ? (
                              <tr>
                                <td
                                  colSpan={6}
                                  style={{
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    fontSize: '0.875rem',
                                    color: '#b91c1c',
                                  }}
                                >
                                  {error}
                                </td>
                              </tr>
                            ) : filteredCustomers.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={6}
                                  style={{
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    fontSize: '0.875rem',
                                    color: '#6b7280',
                                  }}
                                >
                                  No customers found.
                                </td>
                              </tr>
                            ) : (
                              filteredCustomers.map((customer) => (
                                <tr
                                  key={customer.id}
                                  style={{
                                    cursor: 'pointer',
                                    backgroundColor:
                                      selectedCustomer && selectedCustomer.id === customer.id
                                        ? '#eff6ff'
                                        : 'white',
                                    transition: 'background-color 0.2s',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f0f0f0';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                      selectedCustomer && selectedCustomer.id === customer.id
                                        ? '#eff6ff'
                                        : 'white';
                                  }}
                                  onClick={() => {
                                    if (isSelectMode) {
                                      setSelectedItems(prev => {
                                        const next = new Set(prev);
                                        if (next.has(customer.id)) { next.delete(customer.id); } else { next.add(customer.id); }
                                        return next;
                                      });
                                    } else {
                                      handleRowClick(customer);
                                    }
                                  }}
                                >
                                  {isSelectMode && (
                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                      <input type="checkbox" checked={selectedItems.has(customer.id)} onChange={() => { }} onClick={(e) => e.stopPropagation()} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                                    </td>
                                  )}
                                  {isMobile ? (
                                    /* Mobile: Combined Customer cell (Name + ID + Status) */
                                    <td
                                      style={{
                                        padding: '0.75rem 1rem',
                                        fontSize: '0.875rem',
                                        color: '#111827',
                                        borderBottom: '1px solid #e5e7eb',
                                      }}
                                    >
                                      <div style={{ fontWeight: '500' }}>{highlightText(customer.name || '-', searchTerm)}</div>
                                      <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', gap: '0.25rem' }}>
                                        <span style={{ color: '#6b7280' }}>{highlightText(customer.customerId || '-', searchTerm)}</span>
                                        {canViewArchived && (
                                          <>
                                            <span style={{ color: '#6b7280' }}>-</span>
                                            <span style={{ color: customer.isArchived ? '#b91c1c' : '#059669' }}>
                                              {customer.isArchived ? 'Archived' : 'Active'}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  ) : (
                                    /* Desktop: Separate Customer ID and Name cells */
                                    <>
                                      <td
                                        style={{
                                          padding: '0.75rem 1rem',
                                          fontSize: '0.875rem',
                                          color: '#111827',
                                          borderBottom: '1px solid #e5e7eb',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {highlightText(customer.customerId || '-', searchTerm)}
                                      </td>
                                      <td
                                        style={{
                                          padding: '0.75rem 1rem',
                                          fontSize: '0.875rem',
                                          color: '#111827',
                                          borderBottom: '1px solid #e5e7eb',
                                        }}
                                      >
                                        {highlightText(customer.name || '-', searchTerm)}
                                      </td>
                                    </>
                                  )}
                                  {isMobile ? (
                                    /* Mobile: Combined Contact cell (Contact + Email) */
                                    <td
                                      style={{
                                        padding: '0.75rem 1rem',
                                        fontSize: '0.875rem',
                                        color: '#111827',
                                        borderBottom: '1px solid #e5e7eb',
                                      }}
                                    >
                                      <div style={{ fontWeight: '500' }}>{customer.contact || '-'}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                        {customer.email || '-'}
                                      </div>
                                    </td>
                                  ) : (
                                    /* Desktop: Separate Contact and Email cells */
                                    <>
                                      {showContact && (
                                        <td
                                          style={{
                                            padding: '0.75rem 1rem',
                                            fontSize: '0.875rem',
                                            color: '#111827',
                                            borderBottom: '1px solid #e5e7eb',
                                          }}
                                        >
                                          {customer.contact || '-'}
                                        </td>
                                      )}
                                      {showEmail && (
                                        <td
                                          style={{
                                            padding: '0.75rem 1rem',
                                            fontSize: '0.875rem',
                                            color: '#111827',
                                            borderBottom: '1px solid #e5e7eb',
                                          }}
                                        >
                                          {customer.email || '-'}
                                        </td>
                                      )}
                                    </>
                                  )}
                                  {showAddress && (
                                    <td
                                      style={{
                                        padding: '0.75rem 1rem',
                                        fontSize: '0.875rem',
                                        color: '#111827',
                                        borderBottom: '1px solid #e5e7eb',
                                      }}
                                    >
                                      {customer.address || '-'}
                                    </td>
                                  )}
                                  {showVehicleTypes && (
                                    <td
                                      style={{
                                        padding: '0.75rem 1rem',
                                        fontSize: '0.875rem',
                                        color: '#111827',
                                        borderBottom: '1px solid #e5e7eb',
                                      }}
                                    >
                                      {customer.vehicleTypes && customer.vehicleTypes.length > 0
                                        ? customer.vehicleTypes.join(', ')
                                        : '-'}
                                    </td>
                                  )}
                                  {canViewArchived && !isMobile && (
                                    <td
                                      style={{
                                        padding: '0.75rem 1rem',
                                        fontSize: '0.875rem',
                                        color: customer.isArchived ? '#b91c1c' : '#059669',
                                        borderBottom: '1px solid #e5e7eb',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {customer.isArchived ? 'Archived' : 'Active'}
                                    </td>
                                  )}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </main>
      </div>

      {/* Generic confirmation / message modal */}
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
            backgroundColor: 'white',
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
              color: modalState.tone === 'danger' ? '#b91c1c' : '#111827',
            }}>
              {modalState.title}
            </h3>
            <p style={{
              fontSize: '0.9rem',
              color: '#374151',
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
                    backgroundColor: 'white',
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

      {/* Delete / Archive Customer Confirmation Modal (users with delete permission) */}
      {canDeleteCustomers && isDeleteConfirmOpen && selectedCustomer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2400,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem 2rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            }}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                margin: 0,
                marginBottom: '0.75rem',
                color: '#111827',
              }}
            >
              {deleteMode === 'hard'
                ? 'Delete Customer'
                : deleteMode === 'unarchive'
                  ? 'Unarchive Customer'
                  : 'Archive Customer'}
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: '1rem' }}>
              {deleteMode === 'hard'
                ? 'This will permanently delete this customer.'
                : deleteMode === 'unarchive'
                  ? 'This will restore this customer so they appear in active lists again.'
                  : 'This will archive this customer so they will no longer appear in active lists.'}
            </p>
            <p
              style={{
                fontSize: '0.9rem',
                color: '#111827',
                fontWeight: 500,
                marginBottom: '1.25rem',
              }}
            >
              {selectedCustomer.name || 'Unnamed customer'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {deleteMode === 'hard'
                  ? 'Delete'
                  : deleteMode === 'unarchive'
                    ? 'Unarchive'
                    : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
