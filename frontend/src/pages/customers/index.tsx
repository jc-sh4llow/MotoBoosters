import { FaHome, FaBars, FaWarehouse, FaTag, FaWrench, FaFileInvoice, FaPlus, FaUser, FaSearch, FaTimes, FaUndoAlt, FaCog } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { can } from '../../config/permissions';
import logo from '../../assets/logo.png';
import { HeaderDropdown } from '../../components/HeaderDropdown';

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
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const userRoles = user?.roles?.length ? user.roles : (user?.role ? [user.role] : []);

  // Permission checks for customers page
  const canViewArchivedCustomers = can(userRoles, 'customers.view.archived');
  const canAddCustomers = can(userRoles, 'customers.add');
  const canEditCustomers = can(userRoles, 'customers.edit');
  const canArchiveCustomers = can(userRoles, 'customers.archive');
  const canDeleteCustomers = can(userRoles, 'customers.delete');



  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  let closeMenuTimeout: number | undefined;

  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Select mode for bulk archive/unarchive/delete
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);



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

      if (!canViewArchivedCustomers) {
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
    if (!customerForm.name) {
      alert('Please fill in Customer Name.');
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
      alert('Failed to save customer. Please try again.');
    }
  };

  const handleDeleteCustomer = async () => {
    if (!canDeleteCustomers) return;
    if (!selectedCustomer) return;

    try {
      const customerRef = doc(db, 'customers', selectedCustomer.id);

      if (deleteMode === 'hard' && currentRole === 'superadmin') {
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
      alert('Failed to delete customer. Please try again.');
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;

    const idMatch = customer.customerId.toLowerCase().includes(q);
    const nameMatch = customer.name.toLowerCase().includes(q);
    const contactMatch = customer.contact.toLowerCase().includes(q);
    const emailMatch = customer.email.toLowerCase().includes(q);
    const addressMatch = customer.address.toLowerCase().includes(q);
    const vehicleTypesMatch = customer.vehicleTypes.join(' ').toLowerCase().includes(q);

    return (
      idMatch ||
      nameMatch ||
      contactMatch ||
      emailMatch ||
      addressMatch ||
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
        background: 'linear-gradient(109deg, #1e88e5 0%, #1e88e5 50%, #0d47a1 50%, #0d47a1 100%)',
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
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '1rem 2rem',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
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
              <h1 style={{
                fontSize: '1.875rem',
                fontWeight: 'bold',
                color: '#1e40af',
                margin: 0,
              }}>
                Customers
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem' }}>
                <span style={{ color: '#374151', fontSize: '0.9rem' }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
              </div>
            </div>

            {/* Right: search bar, Logout, navbar toggle */}
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
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

        <main
          style={{
            transition: 'margin-left 0.3s ease',
          }}
        >
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
              {shouldShowDetails && (
                <div
                  style={{
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
                    transition: 'transform 0.3s ease, opacity 0.3s ease',
                  }}
                >
                  <h2
                    style={{
                      color: '#1e40af',
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
                          color: '#374151',
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
                          color: '#374151',
                        }}
                      >
                        Customer Name *
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
                          backgroundColor: 'white',
                          color: '#111827',
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
                          color: '#374151',
                        }}
                      >
                        Contact Number
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
                          backgroundColor: 'white',
                          color: '#111827',
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
                          color: '#374151',
                        }}
                      >
                        Email
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
                          backgroundColor: 'white',
                          color: '#111827',
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
                          color: '#374151',
                        }}
                      >
                        Address
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
                          backgroundColor: 'white',
                          color: '#111827',
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
                          color: '#374151',
                        }}
                      >
                        Vehicle Type(s)
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

                    {/* Form Actions (only for admins/superadmins) */}
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
                              color: '#374151',
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
                        {canDeleteCustomers && selectedCustomer && currentRole === 'superadmin' && (
                          <div
                            style={{
                              display: 'flex',
                              gap: '1rem',
                              marginTop: '0.75rem',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteMode(selectedCustomer.isArchived ? 'unarchive' : 'archive');
                                setIsDeleteConfirmOpen(true);
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#fef2f2',
                                color: '#111827',
                                border: '1px solid #fecaca',
                                borderRadius: '0.375rem',
                                fontWeight: '500',
                                width: '50%',
                                cursor: 'pointer',
                              }}
                            >
                              {selectedCustomer.isArchived ? 'Unarchive' : 'Archive'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteMode('hard');
                                setIsDeleteConfirmOpen(true);
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '0.375rem',
                                fontWeight: '500',
                                width: '50%',
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                        {canDeleteCustomers && selectedCustomer && currentRole !== 'superadmin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteMode('archive');
                              setIsDeleteConfirmOpen(true);
                            }}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: '0.375rem',
                              fontWeight: '500',
                              marginTop: '0.75rem',
                              width: '100%',
                              cursor: 'pointer',
                            }}
                          >
                            Archive Customer
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Available Customers Table */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.5rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      color: '#111827',
                    }}
                  >
                    Available Customers
                  </h2>
                  {canEditCustomers && (
                    <button
                      type="button"
                      onClick={handleNewCustomer}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        borderRadius: '0.375rem',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                    >
                      <FaPlus />
                      <span>New Customer</span>
                    </button>
                  )}
                </div>

                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '0.75rem',
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <div
                    style={{
                      maxHeight: '520px',
                      overflow: 'auto',
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
                            Customer ID
                          </th>
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
                            Customer Name
                          </th>
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
                            Contact Number
                          </th>
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
                            Email
                          </th>
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
                            Address
                          </th>
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
                          {currentRole === 'superadmin' && (
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
                              colSpan={currentRole === 'superadmin' ? 7 : 6}
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
                              onClick={() => handleRowClick(customer)}
                              style={{
                                cursor: 'pointer',
                                backgroundColor:
                                  selectedCustomer && selectedCustomer.id === customer.id
                                    ? '#eff6ff'
                                    : 'white',
                              }}
                            >
                              <td
                                style={{
                                  padding: '0.75rem 1rem',
                                  fontSize: '0.875rem',
                                  color: '#111827',
                                  borderBottom: '1px solid #e5e7eb',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {customer.customerId || '-'}
                              </td>
                              <td
                                style={{
                                  padding: '0.75rem 1rem',
                                  fontSize: '0.875rem',
                                  color: '#111827',
                                  borderBottom: '1px solid #e5e7eb',
                                }}
                              >
                                {customer.name || '-'}
                              </td>
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
                              {currentRole === 'superadmin' && (
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
        </main>
      </div>

      {/* Delete / Archive Customer Confirmation Modal (admins/superadmins only) */}
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
