import { FaSearch, FaFilter, FaRedo, FaFileExcel, FaHome, FaBars, FaTag, FaWrench, FaPlus, FaFileInvoice, FaUser, FaTimes, FaWarehouse, FaUndoAlt, FaCog } from 'react-icons/fa';

import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import logo from '../../assets/logo.png';
import { can } from '../../config/permissions';

type TransactionRow = {
  id: string;
  transactionCode?: string;
  date: string;
  customer: string;
  type: 'Parts Only' | 'Service Only' | 'Parts + Service' | 'N/A';

  items: {
    name: string;
    quantity: number;
    price: number;
    subtotal: number;
    type?: string;
  }[];
  itemCount: number;
  grandTotal: number;
  paymentType: string;
  status: 'Completed' | 'Pending' | 'Cancelled' | 'N/A';
  archived?: boolean;
};

export function Transactions() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  let closeMenuTimeout: number | undefined;
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actionConfirm, setActionConfirm] = useState<{
    mode: 'delete';
    transaction: TransactionRow | null;
  } | null>(null);
  const [isActionProcessing, setIsActionProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [paymentReviewTx, setPaymentReviewTx] = useState<TransactionRow | null>(null);
  const [paymentReviewMethod, setPaymentReviewMethod] = useState<'cash' | 'gcash' | 'other'>('cash');
  const [paymentReviewAmountPaid, setPaymentReviewAmountPaid] = useState<number>(0);
  const [paymentReviewChangeGiven, setPaymentReviewChangeGiven] = useState(false);
  const [paymentReviewGcashRef, setPaymentReviewGcashRef] = useState('');
  const [paymentReviewError, setPaymentReviewError] = useState<string | null>(null);
  const [isPaymentReviewProcessing, setIsPaymentReviewProcessing] = useState(false);

  const roleName = (user?.role || '').toString();
  const isSuperadmin = roleName.toLowerCase() === 'superadmin';
  const canDeleteTransactions = can(roleName, 'transactions.delete');

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
    return can(roleName, key as any);
  };

  const menuItems = [
    { title: 'Inventory', path: '/inventory', icon: <FaWarehouse /> },
    { title: 'Sales Records', path: '/sales', icon: <FaTag /> },
    { title: 'Services Offered', path: '/services', icon: <FaWrench /> },
    { title: 'New Transaction', path: '/transactions/new', icon: <FaPlus /> },
    { title: 'Customers', path: '/customers', icon: <FaUser /> },
    { title: 'User Management', path: '/users', icon: <FaUser /> },
    { title: 'Returns & Refunds', path: '/returns', icon: <FaUndoAlt /> },
    { title: 'Settings', path: '/settings', icon: <FaCog /> },
  ];

  const loadTransactions = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const snap = await getDocs(collection(db, 'transactions'));
      const rows: TransactionRow[] = [];

      snap.forEach(docSnap => {
        const data = docSnap.data() as any;

        const rawDate = data.date ?? '';

        const dateStr = typeof rawDate === 'string'
          ? rawDate
          : (rawDate?.toDate ? rawDate.toDate().toISOString().split('T')[0] : '');

        const customerName =
          (data.customer && typeof data.customer.name === 'string')
            ? data.customer.name
            : 'N/A';

        const rawType = (data.transactionType ?? '').toString();
        let normalizedType: TransactionRow['type'] = 'N/A';
        if (rawType.toLowerCase() === 'parts only') {
          normalizedType = 'Parts Only';
        } else if (rawType.toLowerCase() === 'service only') {
          normalizedType = 'Service Only';
        } else if (rawType.toLowerCase() === 'parts & service' || rawType.toLowerCase() === 'parts + service') {
          normalizedType = 'Parts + Service';
        }

        const rawStatus = (data.status ?? '').toString();
        let normalizedStatus: TransactionRow['status'] = 'N/A';
        if (rawStatus.toLowerCase() === 'complete' || rawStatus.toLowerCase() === 'completed') {
          normalizedStatus = 'Completed';
        } else if (rawStatus.toLowerCase() === 'pending') {
          normalizedStatus = 'Pending';
        } else if (rawStatus.toLowerCase() === 'cancelled' || rawStatus.toLowerCase() === 'canceled') {
          normalizedStatus = 'Cancelled';
        }

        const transactionCode = (data.transactionCode ?? '').toString() || undefined;

        const itemsArray = Array.isArray(data.items) ? data.items : [];

        const mappedItems = itemsArray.map((item: any) => ({
          name: (item.name ?? '').toString(),
          quantity: Number(item.quantity ?? 0) || 0,
          price: Number(item.price ?? 0) || 0,
          subtotal: Number(item.subtotal ?? 0) || 0,
          type: item.type,
        }));

        const itemCount = mappedItems.reduce((sum: number, it: { quantity: number }) => sum + it.quantity, 0);
        const grandTotal = Number(data.total ?? 0) || 0;

        const rawPaymentType = (data.payment?.type ?? 'N/A').toString();
        let paymentType = 'N/A';
        if (rawPaymentType.toLowerCase() === 'cash') {
          paymentType = 'Cash';
        } else if (rawPaymentType.toLowerCase() === 'gcash' || rawPaymentType.toLowerCase() === 'g-cash') {
          paymentType = 'G-Cash';
        } else if (rawPaymentType !== 'N/A') {
          paymentType = rawPaymentType;
        }

        const archived = !!data.archived;

        rows.push({
          id: docSnap.id,
          transactionCode,
          date: dateStr,
          customer: customerName,
          type: normalizedType,
          items: mappedItems,
          itemCount,
          grandTotal,
          paymentType,
          status: normalizedStatus,
          archived,
        });
      });

      // Apply visibility rules: non-superadmins do not see archived transactions
      const visibleRows = isSuperadmin ? rows : rows.filter(r => !r.archived);

      // Sort by date descending, then by id
      visibleRows.sort((a, b) => {
        if (a.date === b.date) {
          return a.id.localeCompare(b.id);
        }
        return a.date < b.date ? 1 : -1;
      });

      setTransactions(visibleRows);
    } catch (err) {
      console.error('Error loading transactions from Firestore', err);
      setLoadError('Failed to load transactions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  // Calculate summary data
  const getSummaryData = () => {
    const filtered = transactions.filter(tx => {
      const matchesSearch = searchTerm === '' ||
        tx.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = (!startDate || tx.date >= startDate) &&
        (!endDate || tx.date <= endDate);
      const matchesType = !transactionType || tx.type === transactionType;
      const matchesPrice = (!minPrice || tx.grandTotal >= Number(minPrice)) &&
        (!maxPrice || tx.grandTotal <= Number(maxPrice));
      const matchesStatus = !statusFilter || tx.status === statusFilter;

      return matchesSearch && matchesDate && matchesType && matchesPrice && matchesStatus;
    });

    const partsOnly = filtered.filter(tx => tx.type === 'Parts Only').length;
    const serviceOnly = filtered.filter(tx => tx.type === 'Service Only').length;
    const partsAndService = filtered.filter(tx => tx.type === 'Parts + Service').length;

    const totalRevenue = filtered.reduce((sum: number, tx: TransactionRow) => sum + tx.grandTotal, 0);

    return {
      totalTransactions: filtered.length,
      partsOnly,
      serviceOnly,
      partsAndService,
      totalRevenue
    };
  };

  const summary = getSummaryData();

  const handleConfirmAction = async () => {
    if (!actionConfirm || !actionConfirm.transaction) return;

    setIsActionProcessing(true);
    setActionError(null);

    try {
      const txRef = doc(db, 'transactions', actionConfirm.transaction.id);

      await updateDoc(txRef, { archived: true });

      await loadTransactions();
      setActionConfirm(null);
    } catch (err) {
      console.error('Error performing transaction action', err);
      setActionError('Failed to update transaction. Please try again.');
    } finally {
      setIsActionProcessing(false);
    }
  };

  const openPaymentReview = (tx: TransactionRow) => {
    setPaymentReviewTx(tx);
    const lower = (tx.paymentType || '').toString().toLowerCase();
    const method: 'cash' | 'gcash' | 'other' =
      lower.includes('g-cash') || lower.includes('gcash') ? 'gcash' :
        lower.includes('cash') ? 'cash' : 'other';
    setPaymentReviewMethod(method);
    setPaymentReviewAmountPaid(tx.grandTotal || 0);
    setPaymentReviewChangeGiven(false);
    setPaymentReviewGcashRef('');
    setPaymentReviewError(null);
    setIsPaymentReviewProcessing(false);
  };

  const handleConfirmPaymentReview = async () => {
    if (!paymentReviewTx) return;

    // Validations: for gcash, require reference; for cash, require change-given checkbox
    if (paymentReviewMethod === 'gcash') {
      if (!paymentReviewGcashRef.trim()) {
        setPaymentReviewError('Please enter a G-Cash reference number.');
        return;
      }
    } else if (paymentReviewMethod === 'cash') {
      if (!paymentReviewChangeGiven) {
        setPaymentReviewError('Please confirm that change has been given to the customer.');
        return;
      }
    }

    setPaymentReviewError(null);
    setIsPaymentReviewProcessing(true);
    try {
      const txRef = doc(db, 'transactions', paymentReviewTx.id);
      await updateDoc(txRef, { status: 'Completed' });
      await loadTransactions();
      setPaymentReviewTx(null);
    } catch (err) {
      console.error('Error marking transaction as complete from history', err);
      setPaymentReviewError('Failed to mark transaction as completed. Please try again.');
    } finally {
      setIsPaymentReviewProcessing(false);
    }
  };

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
          zIndex: 100,
        }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              maxWidth: '1400px',
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
              <h1
                style={{
                  fontSize: '1.875rem',
                  fontWeight: 'bold',
                  color: 'white',
                  margin: 0,
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                }}
              >
                Transaction History
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.9rem' }}>
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
                  placeholder="Search by Customer or Transaction ID..."
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
                    fontSize: '0.875rem',
                    marginRight: '0.75rem'
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
                  gap: '0.5rem'
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
                  maxHeight: isNavExpanded ? '420px' : '0',
                  overflowY: isNavExpanded ? 'auto' : 'hidden',
                  overflowX: 'hidden',
                  transition: 'all 0.3s ease-out',
                  pointerEvents: isNavExpanded ? 'auto' : 'none',
                  border: isNavExpanded ? '1px solid rgba(0, 0, 0, 0.1)' : 'none'
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
                <style>{`
                  div::-webkit-scrollbar {
                    width: 0;
                    height: 0;
                  }
                `}</style>
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
                      transition: 'background-color 0.2s ease'
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
                <div
                  style={{
                    height: '1px',
                    backgroundColor: '#e5e7eb',
                    margin: '0.25rem 0',
                  }}
                />

                {/* Transaction History (current page) */}
                <button
                  onClick={() => {
                    navigate('/transactions');
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
                    <FaFileInvoice />
                  </span>
                  <span>Transaction History</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Filter Section */}
            <section style={{ marginBottom: '2rem' }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  width: '100%',
                  marginBottom: showFilters ? '1rem' : 0
                }}>
                  {/* Filters Button */}
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      backgroundColor: '#1e40af',
                      color: 'white',
                      transition: 'all 0.2s',
                      height: '40px'
                    }}
                    onClick={() => setShowFilters(!showFilters)}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1e3a8a'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1e40af'}
                  >
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Filters</h3>
                    <FaFilter style={{ marginLeft: '0.5rem' }} />
                  </div>

                  {/* Clear Filters Button */}
                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setTransactionType('');
                      setMinPrice('');
                      setMaxPrice('');
                    }}
                    disabled={!startDate && !endDate && !transactionType && !minPrice && !maxPrice}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      backgroundColor: (!startDate && !endDate && !transactionType && !minPrice && !maxPrice) ? '#e5e7eb' : '#6b7280',
                      color: (!startDate && !endDate && !transactionType && !minPrice && !maxPrice) ? '#9ca3af' : 'white',
                      border: 'none',
                      cursor: (!startDate && !endDate && !transactionType && !minPrice && !maxPrice) ? 'not-allowed' : 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      height: '40px',
                      opacity: (!startDate && !endDate && !transactionType && !minPrice && !maxPrice) ? 0.7 : 1
                    }}
                    onMouseOver={(e) => {
                      if (startDate || endDate || transactionType || minPrice || maxPrice) {
                        e.currentTarget.style.backgroundColor = '#4b5563';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (startDate || endDate || transactionType || minPrice || maxPrice) {
                        e.currentTarget.style.backgroundColor = '#6b7280';
                      }
                    }}
                  >
                    Clear Filters
                  </button>
                </div>

                {showFilters && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb',
                    justifyContent: 'center',
                    textAlign: 'center'
                  }}>
                    {/* Start Date */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: 'white',
                          color: '#111827'
                        }}
                      />
                    </div>

                    {/* End Date */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        End Date
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: 'white',
                          color: '#111827'
                        }}
                      />
                    </div>

                    {/* Transaction Type */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Transaction Type
                      </label>
                      <select
                        value={transactionType}
                        onChange={(e) => setTransactionType(e.target.value)}
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
                        <option value="Parts Only">Parts Only</option>
                        <option value="Service Only">Service Only</option>
                        <option value="Parts + Service">Parts + Service</option>
                      </select>
                    </div>

                    {/* Price Range */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Price Range
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="number"
                          placeholder="Min"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          style={{
                            width: '80px',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem',
                            backgroundColor: 'white'
                          }}
                        />
                        <span style={{ color: '#111827' }}>to</span>
                        <input
                          type="number"
                          placeholder="Max"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                          style={{
                            width: '80px',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem',
                            backgroundColor: 'white'
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
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
                          fontSize: '0.875rem',
                          color: '#1f2937',
                          backgroundColor: 'white'
                        }}
                      >
                        <option value="">All Status</option>
                        <option value="Completed">Completed</option>
                        <option value="Pending">Pending</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Loading / error states */}
            {isLoading && (
              <div style={{
                backgroundColor: '#eff6ff',
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                color: '#1d4ed8',
                fontSize: '0.9rem',
              }}>
                Loading transactions...
              </div>
            )}
            {loadError && (
              <div style={{
                backgroundColor: '#fee2e2',
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                color: '#b91c1c',
                fontSize: '0.9rem',
              }}>
                {loadError}
              </div>
            )}

            {/* Transaction Summary Section */}
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                marginBottom: '1rem',
                color: '#1e40af'
              }}>
                Transaction Summary
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '1rem',
                margin: '0 auto 1.5rem',
                maxWidth: '1200px',
                width: '100%'
              }}>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #3b82f6'
                }}>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Transactions</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>{summary.totalTransactions}</p>
                </div>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #10b981'
                }}>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Parts Only</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>{summary.partsOnly}</p>
                </div>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #f59e0b'
                }}>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Service Only</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>{summary.serviceOnly}</p>
                </div>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #8b5cf6'
                }}>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Parts + Service</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>{summary.partsAndService}</p>
                </div>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #ec4899'
                }}>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Revenue</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>₱{summary.totalRevenue.toLocaleString()}</p>
                </div>
              </div>
            </section>

            {/* Transaction Records Section */}
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
                  Transaction Records
                </h2>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStartDate('');
                    setEndDate('');
                    setTransactionType('');
                    setMinPrice('');
                    setMaxPrice('');
                    loadTransactions();
                  }}
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

              <div style={{
                overflowX: 'auto',
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: '1000px'
                }}>
                  <thead>
                    <tr style={{
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      {['Transaction ID', 'Date', 'Customer', 'Type', 'Items', 'Grand Total', 'Payment Type', 'Status', 'Actions'].map(header => {
                        // Set text alignment based on column
                        const textAlign =
                          header === 'Grand Total' ? 'right' :
                            header === 'Customer' || header === 'Payment Type' ? 'left' :
                              'center';

                        return (
                          <th key={header} style={{
                            padding: '0.75rem 1.5rem',
                            textAlign,
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            color: '#4b5563',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            {header}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions
                      .filter(tx => {
                        const matchesSearch = searchTerm === '' ||
                          tx.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tx.id.toLowerCase().includes(searchTerm.toLowerCase());
                        const matchesDate = (!startDate || tx.date >= startDate) &&
                          (!endDate || tx.date <= endDate);
                        const matchesType = !transactionType || tx.type === transactionType;
                        const matchesPrice = (!minPrice || tx.grandTotal >= Number(minPrice)) &&
                          (!maxPrice || tx.grandTotal <= Number(maxPrice));
                        const matchesStatus = !statusFilter || tx.status === statusFilter;

                        return matchesSearch && matchesDate && matchesType && matchesPrice && matchesStatus;
                      })
                      .map((tx, index) => (
                        <tr
                          key={tx.id}
                          style={{
                            backgroundColor: index % 2 === 0 ? 'white' : '#f9fafb',
                            borderBottom: index === transactions.length - 1 ? 'none' : '1px solid #e5e7eb',
                            transition: 'background-color 0.2s',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#f9fafb';
                          }}
                          onClick={() => {
                            setSelectedTransaction(tx);
                            setIsModalOpen(true);
                          }}
                        >
                          <td style={{
                            padding: '1rem 1.5rem',
                            fontSize: '0.875rem',
                            color: '#111827',
                            whiteSpace: 'nowrap',
                            textAlign: 'center'
                          }}>
                            {tx.transactionCode || tx.id}
                          </td>
                          <td style={{
                            padding: '1rem 1.5rem',
                            fontSize: '0.875rem',
                            color: '#4b5563',
                            whiteSpace: 'nowrap',
                            textAlign: 'center'
                          }}>
                            {new Date(tx.date).toLocaleDateString()}
                          </td>
                          <td style={{
                            padding: '1rem 1.5rem',
                            fontSize: '0.875rem',
                            color: '#111827',
                            whiteSpace: 'nowrap',
                            textAlign: 'left'
                          }}>
                            {tx.customer}
                          </td>
                          <td style={{
                            padding: '1rem 1.5rem',
                            fontSize: '0.875rem'
                          }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              backgroundColor:
                                tx.type === 'Parts Only' ? '#dbeafe' :
                                  tx.type === 'Service Only' ? '#d1fae5' : '#ede9fe',
                              color:
                                tx.type === 'Parts Only' ? '#1e40af' :
                                  tx.type === 'Service Only' ? '#065f46' : '#5b21b6'
                            }}>
                              {tx.type}
                            </span>
                          </td>
                          <td style={{
                            padding: '1rem 1.5rem',
                            fontSize: '0.875rem',
                            textAlign: 'center',
                            color: '#111827'
                          }}>
                            {tx.itemCount}
                          </td>
                          <td style={{
                            padding: '1rem 1.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            color: '#111827',
                            textAlign: 'right',
                            whiteSpace: 'nowrap'
                          }}>
                            ₱{tx.grandTotal.toLocaleString()}
                          </td>
                          <td style={{
                            padding: '1rem 1.5rem',
                            fontSize: '0.875rem',
                            color: '#4b5563',
                            textAlign: 'left'
                          }}>
                            {tx.paymentType}
                          </td>
                          <td style={{
                            padding: '1rem 1.5rem',
                            fontSize: '0.875rem'
                          }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              backgroundColor:
                                tx.status === 'Completed' ? '#d1fae5' :
                                  tx.status === 'Pending' ? '#fef3c7' : '#fee2e2',
                              color:
                                tx.status === 'Completed' ? '#065f46' :
                                  tx.status === 'Pending' ? '#92400e' : '#991b1b'
                            }}>
                              {tx.status}
                            </span>
                          </td>
                          <td style={{
                            padding: '1rem 1.5rem',
                            fontSize: '0.875rem',
                            textAlign: 'center',
                            whiteSpace: 'nowrap'
                          }}>
                            {tx.status === 'Pending' && !tx.archived && (
                              <button
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '9999px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  backgroundColor: '#10b981',
                                  color: 'white',
                                  marginRight: canDeleteTransactions ? '0.5rem' : 0
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPaymentReview(tx);
                                }}
                              >
                                Mark as Complete
                              </button>
                            )}
                            {canDeleteTransactions && !tx.archived && (
                              <button
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '9999px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  backgroundColor: '#ef4444',
                                  color: 'white'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionConfirm({ mode: 'delete', transaction: tx });
                                }}
                              >
                                Delete
                              </button>
                            )}
                            {canDeleteTransactions && tx.archived && isSuperadmin && (
                              <span style={{
                                fontSize: '0.75rem',
                                color: '#9ca3af'
                              }}>
                                Archived
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    {transactions.length === 0 && (
                      <tr>
                        <td
                          colSpan={9}
                          style={{
                            padding: '2rem',
                            textAlign: 'center',
                            color: '#6b7280',
                            fontStyle: 'italic'
                          }}
                        >
                          No transaction records found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {isModalOpen && selectedTransaction && (
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
                      maxWidth: '600px',
                      width: '100%',
                      maxHeight: '80vh',
                      overflowY: 'auto',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                      color: '#111827'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
                          Transaction Details – {selectedTransaction.transactionCode || selectedTransaction.id}
                        </h3>
                        <button
                          onClick={() => setIsModalOpen(false)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: '1.25rem',
                            cursor: 'pointer',
                            color: '#6b7280'
                          }}
                        >
                          ×
                        </button>
                      </div>

                      {/* Basic info */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem', color: '#111827' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Date</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                            {new Date(selectedTransaction.date).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Customer</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.customer}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Type</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.type}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Status</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.status}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Items</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.itemCount}</div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Payment Type</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.paymentType}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Grand Total</div>
                          <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                            ₱{selectedTransaction.grandTotal.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Line items */}
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#111827' }}>Items in this transaction</h4>
                        {selectedTransaction.items && selectedTransaction.items.length > 0 ? (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#111827' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Item</th>
                                <th style={{ textAlign: 'center', padding: '0.5rem' }}>Qty</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Price</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedTransaction.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td style={{ padding: '0.5rem' }}>{item.name}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.quantity}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>₱{item.price.toFixed(2)}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                    ₱{item.subtotal.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>
                            No item details available for this transaction.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {paymentReviewTx && (
                  <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2050
                  }}>
                    <div style={{
                      backgroundColor: 'white',
                      borderRadius: '0.75rem',
                      padding: '1.5rem 2rem',
                      maxWidth: '700px',
                      width: '100%',
                      maxHeight: '85vh',
                      overflowY: 'auto',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                      color: '#111827'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
                          Step 3: Review & Pay – {paymentReviewTx.transactionCode || paymentReviewTx.id}
                        </h3>
                        <button
                          onClick={() => !isPaymentReviewProcessing && setPaymentReviewTx(null)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: '1.25rem',
                            cursor: isPaymentReviewProcessing ? 'not-allowed' : 'pointer',
                            color: '#6b7280'
                          }}
                          disabled={isPaymentReviewProcessing}
                        >
                          ×
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr', gap: '1.5rem' }}>
                        {/* Order Summary */}
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1f2937' }}>Order Summary</h4>
                          <div style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: '0.5rem',
                            padding: '0.75rem',
                            backgroundColor: '#f9fafb'
                          }}>
                            {paymentReviewTx.items && paymentReviewTx.items.length > 0 ? (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'left', padding: '0.25rem' }}>Item</th>
                                    <th style={{ textAlign: 'center', padding: '0.25rem' }}>Qty</th>
                                    <th style={{ textAlign: 'right', padding: '0.25rem' }}>Price</th>
                                    <th style={{ textAlign: 'right', padding: '0.25rem' }}>Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {paymentReviewTx.items.map((item, idx) => (
                                    <tr key={idx}>
                                      <td style={{ padding: '0.25rem' }}>{item.name}</td>
                                      <td style={{ padding: '0.25rem', textAlign: 'center' }}>{item.quantity}</td>
                                      <td style={{ padding: '0.25rem', textAlign: 'right' }}>₱{item.price.toFixed(2)}</td>
                                      <td style={{ padding: '0.25rem', textAlign: 'right' }}>₱{item.subtotal.toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div style={{ fontSize: '0.85rem', color: '#6b7280', fontStyle: 'italic' }}>No item details available.</div>
                            )}
                            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '0.5rem', paddingTop: '0.5rem', textAlign: 'right' }}>
                              <div style={{ fontSize: '0.9rem' }}>
                                <strong>Total:</strong> ₱{paymentReviewTx.grandTotal.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Payment Method */}
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1f2937' }}>Payment Method</h4>
                          <div style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: '0.5rem',
                            padding: '0.75rem',
                            backgroundColor: 'white'
                          }}>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>Method</div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  onClick={() => setPaymentReviewMethod('cash')}
                                  style={{
                                    flex: 1,
                                    padding: '0.35rem 0.5rem',
                                    borderRadius: '9999px',
                                    border: paymentReviewMethod === 'cash' ? '1px solid #1e40af' : '1px solid #d1d5db',
                                    backgroundColor: paymentReviewMethod === 'cash' ? '#eff6ff' : 'white',
                                    color: paymentReviewMethod === 'cash' ? '#1e40af' : '#374151',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cash
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPaymentReviewMethod('gcash')}
                                  style={{
                                    flex: 1,
                                    padding: '0.35rem 0.5rem',
                                    borderRadius: '9999px',
                                    border: paymentReviewMethod === 'gcash' ? '1px solid #1e40af' : '1px solid #d1d5db',
                                    backgroundColor: paymentReviewMethod === 'gcash' ? '#eff6ff' : 'white',
                                    color: paymentReviewMethod === 'gcash' ? '#1e40af' : '#374151',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  G-Cash
                                </button>
                              </div>
                            </div>

                            {paymentReviewMethod !== 'gcash' && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>Amount Paid</label>
                                <input
                                  type="number"
                                  value={paymentReviewAmountPaid}
                                  onChange={(e) => setPaymentReviewAmountPaid(Number(e.target.value) || 0)}
                                  style={{
                                    width: '100%',
                                    padding: '0.35rem 0.5rem',
                                    borderRadius: '0.375rem',
                                    border: '1px solid #d1d5db',
                                    fontSize: '0.9rem'
                                  }}
                                />
                              </div>
                            )}

                            {paymentReviewMethod === 'cash' && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: '#374151' }}>
                                  <input
                                    type="checkbox"
                                    checked={paymentReviewChangeGiven}
                                    onChange={(e) => setPaymentReviewChangeGiven(e.target.checked)}
                                  />
                                  Change given to customer
                                </label>
                              </div>
                            )}

                            {paymentReviewMethod === 'gcash' && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>G-Cash Reference No.</label>
                                <input
                                  type="text"
                                  value={paymentReviewGcashRef}
                                  onChange={(e) => setPaymentReviewGcashRef(e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '0.35rem 0.5rem',
                                    borderRadius: '0.375rem',
                                    border: '1px solid #d1d5db',
                                    fontSize: '0.9rem'
                                  }}
                                />
                              </div>
                            )}

                            {paymentReviewError && (
                              <div style={{
                                backgroundColor: '#fee2e2',
                                color: '#b91c1c',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.375rem',
                                fontSize: '0.8rem',
                                marginBottom: '0.75rem'
                              }}>
                                {paymentReviewError}
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                              <button
                                onClick={() => !isPaymentReviewProcessing && setPaymentReviewTx(null)}
                                style={{
                                  padding: '0.35rem 0.85rem',
                                  borderRadius: '0.375rem',
                                  border: '1px solid #d1d5db',
                                  backgroundColor: 'white',
                                  color: '#374151',
                                  fontSize: '0.85rem',
                                  cursor: isPaymentReviewProcessing ? 'not-allowed' : 'pointer'
                                }}
                                disabled={isPaymentReviewProcessing}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleConfirmPaymentReview}
                                style={{
                                  padding: '0.35rem 0.85rem',
                                  borderRadius: '0.375rem',
                                  border: 'none',
                                  backgroundColor: '#10b981',
                                  color: 'white',
                                  fontSize: '0.85rem',
                                  cursor: isPaymentReviewProcessing ? 'not-allowed' : 'pointer'
                                }}
                                disabled={isPaymentReviewProcessing}
                              >
                                {isPaymentReviewProcessing ? 'Saving...' : 'Confirm & Mark Complete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {actionConfirm && actionConfirm.transaction && (
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
                      maxWidth: '400px',
                      width: '100%',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                      color: '#111827'
                    }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: 0 }}>
                        Confirm Delete
                      </h3>
                      <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                        Are you sure you want to delete this transaction?
                      </p>
                      <p style={{ fontSize: '0.85rem', marginBottom: '1rem', color: '#4b5563' }}>
                        <strong>Transaction:</strong> {actionConfirm.transaction.transactionCode || actionConfirm.transaction.id}
                      </p>
                      {actionError && (
                        <div style={{
                          backgroundColor: '#fee2e2',
                          color: '#b91c1c',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          fontSize: '0.8rem',
                          marginBottom: '0.75rem'
                        }}>
                          {actionError}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button
                          onClick={() => !isActionProcessing && setActionConfirm(null)}
                          style={{
                            padding: '0.35rem 0.85rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#374151',
                            fontSize: '0.85rem',
                            cursor: isActionProcessing ? 'not-allowed' : 'pointer'
                          }}
                          disabled={isActionProcessing}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleConfirmAction}
                          style={{
                            padding: '0.35rem 0.85rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            fontSize: '0.85rem',
                            cursor: isActionProcessing ? 'not-allowed' : 'pointer'
                          }}
                          disabled={isActionProcessing}
                        >
                          {isActionProcessing ? 'Working...' : 'Yes, Delete (Archive)'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}