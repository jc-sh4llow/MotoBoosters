import { FaSearch, FaFilter, FaFileExcel, FaBars, FaTimes, FaChevronDown } from 'react-icons/fa';

import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDocs } from 'firebase/firestore';
import { HeaderDropdown } from '../../components/HeaderDropdown';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import logo from '../../assets/logo.png';
import { can } from '../../config/permissions';
import { useEffectiveRoleIds } from '../../hooks/useEffectiveRoleIds';
import Switch from '../../components/ui/Switch';

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
    specialUnits?: number;
    adjustmentType?: 'none' | 'discount' | 'markup';
    adjustmentPerUnit?: number;
  }[];
  itemCount: number;
  grandTotal: number;
  paymentType: string;
  status: 'Completed' | 'Pending' | 'Cancelled' | 'N/A';
  archived?: boolean;
};

export function Transactions() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

  let closeMenuTimeout: number | undefined;
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showArchivedFilter, setShowArchivedFilter] = useState(true); // Toggle to show/hide archived records
  const [activeTab, setActiveTab] = useState<'all' | 'parts' | 'service' | 'partsAndService'>('all');
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

  // Select mode state (iOS gallery-style selection)
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Calendar picker state
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  const [selectingDate, setSelectingDate] = useState<'start' | 'end'>('start');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const [sortBy, setSortBy] = useState('date-desc');
  const [isActionBarExpanded, setIsActionBarExpanded] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);

  // Responsive column visibility helpers
  // Priority: Customer > Type > Status > Grand Total > Date > Transaction ID > Payment Type > Item
  const showItem = viewportWidth >= 1400; // Hide on smaller desktops and below
  const showPaymentType = viewportWidth >= 1200; // Hide on small desktops and below
  const showTransactionId = viewportWidth >= 992; // Hide on tablets and below
  const showDate = viewportWidth >= 768; // Hide on mobile
  const showGrandTotal = viewportWidth >= 640; // Hide on small mobile
  const showStatus = viewportWidth >= 576; // Hide on extra small mobile
  const showType = viewportWidth >= 520; // Hide on extra extra small mobile
  // Customer is always shown (highest priority)
  // Actions column will be hidden on mobile (< 768px)

  const { effectiveRoleIds } = useEffectiveRoleIds();
  const canDeleteTransactions = can(effectiveRoleIds, 'transactions.delete');
  const canArchiveTransactions = can(effectiveRoleIds, 'transactions.archive');
  const canUnarchiveTransactions = can(effectiveRoleIds, 'transactions.unarchive');
  const canExportTransactions = can(effectiveRoleIds, 'transactions.export');
  const canViewArchived = can(effectiveRoleIds, 'transactions.view.archived');

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
          specialUnits: Number(item.specialUnits ?? 0) || 0,
          adjustmentType: (item.adjustmentType ?? 'none') as 'none' | 'discount' | 'markup',
          adjustmentPerUnit: Number(item.adjustmentPerUnit ?? 0) || 0,
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

      // Apply visibility rules: users without view.archived permission do not see archived transactions
      const visibleRows = canViewArchived ? rows : rows.filter(r => !r.archived);

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
    const handleResize = () => {
      const width = window.innerWidth;
      const isMobileView = width < 768;
      setViewportWidth(width);
      setIsMobile(isMobileView);
      if (!isMobileView) {
        setIsNavExpanded(false);
      }
    };
    handleResize(); // Set initial values
    window.addEventListener('resize', handleResize);

    // Real-time listener for transactions - auto-reloads when data changes
    const unsubscribe = onSnapshot(collection(db, 'transactions'), () => {
      loadTransactions();
    }, (err) => {
      console.error('Error in transactions listener', err);
      setLoadError('Failed to load transactions. Please try again.');
    });

    // Initial load
    loadTransactions();

    return () => {
      window.removeEventListener('resize', handleResize);
      unsubscribe();
    };
  }, [canViewArchived]);

  // Click outside listeners for filters and action bar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close filters if clicking outside
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        if (showFilters) {
          setShowFilters(false);
        }
      }

      // Close action bar accordion on mobile if clicking outside
      if (isMobile && actionBarRef.current && !actionBarRef.current.contains(event.target as Node)) {
        if (isActionBarExpanded) {
          setIsActionBarExpanded(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilters, isActionBarExpanded, isMobile]);

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

  const getFilteredTransactionsForTable = () => {
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
      const matchesArchived = showArchivedFilter || !tx.archived;
      const matchesTab =
        activeTab === 'all' ||
        (activeTab === 'parts' && tx.type === 'Parts Only') ||
        (activeTab === 'service' && tx.type === 'Service Only') ||
        (activeTab === 'partsAndService' && tx.type === 'Parts + Service');

      return matchesSearch && matchesDate && matchesType && matchesPrice && matchesStatus && matchesArchived && matchesTab;
    });

    // Apply sorting
    const [field, dir] = sortBy.split('-');
    const desc = dir === 'desc';

    filtered.sort((a, b) => {
      switch (field) {
        case 'id': {
          const idA = a.transactionCode || a.id;
          const idB = b.transactionCode || b.id;
          return desc ? idB.localeCompare(idA) : idA.localeCompare(idB);
        }
        case 'date': {
          const dateA = new Date(a.date || 0).getTime();
          const dateB = new Date(b.date || 0).getTime();
          return desc ? dateB - dateA : dateA - dateB;
        }
        case 'customer': {
          return desc ? b.customer.localeCompare(a.customer) : a.customer.localeCompare(b.customer);
        }
        case 'type': {
          return desc ? b.type.localeCompare(a.type) : a.type.localeCompare(b.type);
        }
        case 'items': {
          return desc ? b.itemCount - a.itemCount : a.itemCount - b.itemCount;
        }
        case 'total': {
          return desc ? b.grandTotal - a.grandTotal : a.grandTotal - b.grandTotal;
        }
        case 'payment': {
          return desc ? b.paymentType.localeCompare(a.paymentType) : a.paymentType.localeCompare(b.paymentType);
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

  const handleExportCsv = () => {
    const rows = getFilteredTransactionsForTable();
    if (!rows.length) {
      return;
    }

    const headers = [
      'Transaction ID',
      'Date',
      'Customer',
      'Type',
      'Items',
      'Grand Total',
      'Payment Type',
      'Status',
    ];

    const escapeCell = (value: unknown): string => {
      const str = (value ?? '').toString();
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const dataLines = rows.map(tx => {
      const displayDate = tx.date ? new Date(tx.date).toLocaleDateString() : '';
      const cells = [
        tx.transactionCode || tx.id,
        displayDate,
        tx.customer,
        tx.type,
        tx.itemCount.toString(),
        tx.grandTotal.toFixed(2),
        tx.paymentType,
        tx.status,
      ];
      return cells.map(escapeCell).join(',');
    });

    const csv = [headers.join(','), ...dataLines].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const today = new Date().toISOString().split('T')[0];
    link.download = `transactions_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
                  Transactions
                </h1>
                {isMobile && (
                  <span style={{ color: '#374151', fontSize: '0.9rem' }}>
                    Welcome, {user?.name || 'Guest'}
                  </span>
                )}
              </div>
              {!isMobile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem' }}>
                  <span style={{ color: '#374151', fontSize: '0.9rem' }}>
                    Welcome, {user?.name || 'Guest'}
                  </span>
                </div>
              )}
            </div>

            {/* Right: search bar, Logout, navbar toggle */}
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
              {!isMobile && (
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
              )}

              {!isMobile && user && (
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

              {/* Dropdown Menu */}
              <HeaderDropdown
                isNavExpanded={isNavExpanded}
                setIsNavExpanded={setIsNavExpanded}
                isMobile={isMobile}
                currentPage="transactions"
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

        <main>
          <div style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Filter Section */}
            <section style={{ marginBottom: '2rem' }}>
              <div ref={actionBarRef} style={{
                backgroundColor: 'var(--surface-elevated)',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem',
                border: '1px solid #e5e7eb'
              }}>
                {/* Mobile: Accordion Header */}
                {isMobile && (
                  <button
                    onClick={() => setIsActionBarExpanded(!isActionBarExpanded)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      marginBottom: isActionBarExpanded ? '1rem' : 0,
                      fontSize: '1.125rem',
                      fontWeight: 600,
                      color: '#1e40af',
                      textAlign: 'left'
                    }}
                  >
                    <span>Action Bar</span>
                    <FaChevronDown
                      style={{
                        transition: 'transform 0.2s ease',
                        transform: isActionBarExpanded ? 'rotate(180deg)' : 'rotate(0)'
                      }}
                    />
                  </button>
                )}

                {/* Desktop: Horizontal Layout | Mobile: Collapsible Content */}
                {(!isMobile || isActionBarExpanded) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Row 1: Type pills (All/Parts/Service/Parts&Service) */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {[
                        { key: 'all', label: 'All' },
                        { key: 'parts', label: 'Parts' },
                        { key: 'service', label: 'Service' },
                        { key: 'partsAndService', label: 'Parts & Service' }
                      ].map(tab => (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key as any)}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '9999px',
                            border: activeTab === tab.key ? '1px solid #1e40af' : '1px solid #e5e7eb',
                            backgroundColor: activeTab === tab.key ? '#1e40af' : 'white',
                            color: activeTab === tab.key ? 'white' : '#374151',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            height: '40px',
                            transition: 'all 0.2s',
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Row 2: Export, Select, Filters, Clear Filters */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {/* Left side buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {canExportTransactions && (
                          <button
                            onClick={handleExportCsv}
                            style={{
                              backgroundColor: '#059669',
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
                              transition: 'background-color 0.2s',
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#047857'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                          >
                            Export to CSV <FaFileExcel />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setIsSelectMode(!isSelectMode);
                            if (isSelectMode) setSelectedItems(new Set());
                          }}
                          style={{
                            backgroundColor: isSelectMode ? '#dc2626' : '#3b82f6',
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
                            transition: 'background-color 0.2s',
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = isSelectMode ? '#b91c1c' : '#2563eb'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = isSelectMode ? '#dc2626' : '#3b82f6'}
                        >
                          {isSelectMode ? 'Cancel' : 'Select'}
                        </button>
                      </div>

                      {/* Right side buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => setShowFilters(!showFilters)}
                          style={{
                            backgroundColor: '#1e40af',
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
                            transition: 'background-color 0.2s',
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1e3a8a'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1e40af'}
                        >
                          Filters <FaFilter />
                        </button>
                        <button
                          onClick={() => {
                            setStartDate('');
                            setEndDate('');
                            setTransactionType('');
                            setMinPrice('');
                            setMaxPrice('');
                            setStatusFilter('');
                            setSortBy('date-desc');
                          }}
                          style={{
                            backgroundColor: '#6b7280',
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
                            transition: 'background-color 0.2s',
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6b7280'}
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>
                  </div>
                )}

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
                    {/* Timeframe with Calendar Picker */}
                    <div style={{ position: 'relative', gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Timeframe
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => { setSelectingDate('start'); setShowCalendarPicker(!showCalendarPicker); setShowMonthPicker(false); setShowYearPicker(false); }}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: selectingDate === 'start' && showCalendarPicker ? '#dbeafe' : 'white',
                            color: '#111827',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.875rem'
                          }}
                        >
                          {startDate ? new Date(startDate).toLocaleDateString() : 'Start Date'}
                        </button>
                        <span style={{ color: '#6b7280' }}>to</span>
                        <button
                          type="button"
                          onClick={() => { setSelectingDate('end'); setShowCalendarPicker(!showCalendarPicker); setShowMonthPicker(false); setShowYearPicker(false); }}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: selectingDate === 'end' && showCalendarPicker ? '#dbeafe' : 'white',
                            color: '#111827',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.875rem'
                          }}
                        >
                          {endDate ? new Date(endDate).toLocaleDateString() : 'End Date'}
                        </button>
                      </div>

                      {/* Calendar Picker Dropdown */}
                      {showCalendarPicker && (() => {
                        const minDate = new Date('2020-01-01');
                        const maxDate = new Date();
                        const year = calendarViewDate.getFullYear();
                        const month = calendarViewDate.getMonth();
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

                        const firstDay = new Date(year, month, 1).getDay();
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        const days: (number | null)[] = [];
                        for (let i = 0; i < firstDay; i++) days.push(null);
                        for (let d = 1; d <= daysInMonth; d++) days.push(d);

                        const canGoPrev = new Date(year, month - 1, 1) >= new Date(minDate.getFullYear(), minDate.getMonth(), 1);
                        const canGoNext = new Date(year, month + 1, 1) <= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

                        return (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            zIndex: 1000,
                            backgroundColor: 'var(--surface-elevated)',
                            borderRadius: '0.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            border: '1px solid #e5e7eb',
                            padding: '1rem',
                            marginTop: '0.25rem',
                            minWidth: '280px'
                          }}>
                            {/* Calendar Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', position: 'relative' }}>
                              <button type="button" onClick={() => canGoPrev && setCalendarViewDate(new Date(year, month - 1, 1))} disabled={!canGoPrev}
                                style={{ background: 'none', border: 'none', cursor: canGoPrev ? 'pointer' : 'not-allowed', color: canGoPrev ? '#374151' : '#d1d5db', fontSize: '1rem', padding: '0.25rem 0.5rem' }}>{'<'}</button>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span onClick={() => { setShowMonthPicker(!showMonthPicker); setShowYearPicker(false); }}
                                  style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.9rem', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>{monthNames[month]}</span>
                                <span onClick={() => { setShowYearPicker(!showYearPicker); setShowMonthPicker(false); }}
                                  style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.9rem', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>{year}</span>
                              </div>
                              <button type="button" onClick={() => canGoNext && setCalendarViewDate(new Date(year, month + 1, 1))} disabled={!canGoNext}
                                style={{ background: 'none', border: 'none', cursor: canGoNext ? 'pointer' : 'not-allowed', color: canGoNext ? '#374151' : '#d1d5db', fontSize: '1rem', padding: '0.25rem 0.5rem' }}>{'>'}</button>

                              {/* Month Picker */}
                              {showMonthPicker && (
                                <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 1001, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb', padding: '0.5rem', marginTop: '0.25rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem', minWidth: '180px' }}>
                                  {monthNames.map((m, idx) => {
                                    const isDisabled = (year === minDate.getFullYear() && idx < minDate.getMonth()) || (year === maxDate.getFullYear() && idx > maxDate.getMonth());
                                    return (
                                      <div key={m} onClick={() => { if (!isDisabled) { setCalendarViewDate(new Date(year, idx, 1)); setShowMonthPicker(false); } }}
                                        style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem', borderRadius: '0.25rem', cursor: isDisabled ? 'not-allowed' : 'pointer', backgroundColor: idx === month ? '#1e40af' : 'transparent', color: isDisabled ? '#d1d5db' : idx === month ? 'white' : '#111827', fontWeight: idx === month ? 600 : 400 }}>{m}</div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Year Picker */}
                              {showYearPicker && (() => {
                                const years: number[] = [];
                                for (let y = minDate.getFullYear(); y <= maxDate.getFullYear(); y++) years.push(y);
                                return (
                                  <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 1001, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb', padding: '0.5rem', marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', minWidth: '100px' }}>
                                    {years.map(y => (
                                      <div key={y} onClick={() => { setCalendarViewDate(new Date(y, month, 1)); setShowYearPicker(false); }}
                                        style={{ padding: '0.5rem 1rem', textAlign: 'center', fontSize: '0.85rem', borderRadius: '0.25rem', cursor: 'pointer', backgroundColor: y === year ? '#1e40af' : 'transparent', color: y === year ? 'white' : '#111827', fontWeight: y === year ? 600 : 400 }}>{y}</div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Day Names */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', marginBottom: '0.5rem' }}>
                              {dayNames.map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>{d}</div>
                              ))}
                            </div>

                            {/* Days Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
                              {days.map((day, idx) => {
                                if (day === null) return <div key={`empty-${idx}`} />;
                                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                const dateObj = new Date(year, month, day);
                                const isDisabled = dateObj < minDate || dateObj > maxDate;
                                const isSelected = dateStr === startDate || dateStr === endDate;
                                const isInRange = startDate && endDate && dateStr > startDate && dateStr < endDate;

                                return (
                                  <div key={day} onClick={() => {
                                    if (isDisabled) return;
                                    if (selectingDate === 'start') {
                                      setStartDate(dateStr);
                                      if (endDate && dateStr > endDate) setEndDate('');
                                    } else {
                                      setEndDate(dateStr);
                                      if (startDate && dateStr < startDate) setStartDate('');
                                    }
                                    setShowCalendarPicker(false);
                                  }}
                                    style={{
                                      padding: '0.5rem',
                                      textAlign: 'center',
                                      fontSize: '0.85rem',
                                      borderRadius: '0.25rem',
                                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                                      backgroundColor: isSelected ? '#1e40af' : isInRange ? '#dbeafe' : 'transparent',
                                      color: isDisabled ? '#d1d5db' : isSelected ? 'white' : '#111827',
                                      fontWeight: isSelected ? 600 : 400
                                    }}>{day}</div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
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
                          backgroundColor: 'var(--surface-elevated)',
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

                    {/* Show Archived Toggle - only visible if user has permission */}
                    {canViewArchived && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.875rem', color: 'rgb(75, 85, 99)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Switch
                            checked={showArchivedFilter}
                            onChange={(checked) => setShowArchivedFilter(checked)}
                            size="sm"
                          />
                          Show Archived
                        </div>
                      </div>
                    )}
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
                {activeTab === 'all' && 'Overall Transaction Summary'}
                {activeTab === 'parts' && 'Parts Only Transaction Summary'}
                {activeTab === 'service' && 'Service Only Transaction Summary'}
                {activeTab === 'partsAndService' && 'Parts & Service Transaction Summary'}
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
                  backgroundColor: 'var(--surface-elevated)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #3b82f6'
                }}>
                  <p style={{ color: 'var(--field-label-text)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Transactions</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>{summary.totalTransactions}</p>
                </div>
                <div style={{
                  backgroundColor: 'var(--surface-elevated)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #10b981'
                }}>
                  <p style={{ color: 'var(--field-label-text)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Parts Only</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>{summary.partsOnly}</p>
                </div>
                <div style={{
                  backgroundColor: 'var(--surface-elevated)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #f59e0b'
                }}>
                  <p style={{ color: 'var(--field-label-text)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Service Only</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>{summary.serviceOnly}</p>
                </div>
                <div style={{
                  backgroundColor: 'var(--surface-elevated)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #8b5cf6'
                }}>
                  <p style={{ color: 'var(--field-label-text)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Parts + Service</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>{summary.partsAndService}</p>
                </div>
                <div style={{
                  backgroundColor: 'var(--surface-elevated)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #ec4899'
                }}>
                  <p style={{ color: 'var(--field-label-text)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Revenue</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>₱{summary.totalRevenue.toLocaleString()}</p>
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
                {isSelectMode && selectedItems.size > 0 && (() => {
                  // Determine which selected items are archived vs unarchived
                  const selectedTxs = getFilteredTransactionsForTable().filter(tx => selectedItems.has(tx.id));
                  const hasUnarchived = selectedTxs.some(tx => !tx.archived);
                  const hasArchived = selectedTxs.some(tx => tx.archived);

                  return (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                        {selectedItems.size} selected
                      </span>
                      {/* Show Archive button if any unarchived items are selected */}
                      {canArchiveTransactions && hasUnarchived && (
                        <button
                          onClick={async () => {
                            const toArchive = selectedTxs.filter(tx => !tx.archived);
                            await Promise.all(
                              toArchive.map((tx) => {
                                const txRef = doc(db, 'transactions', tx.id);
                                return updateDoc(txRef, { archived: true });
                              })
                            );
                            setTransactions((prev) =>
                              prev.map((row) =>
                                toArchive.some(t => t.id === row.id)
                                  ? { ...row, archived: true }
                                  : row,
                              ),
                            );
                            setSelectedItems(new Set());
                            setIsSelectMode(false);
                          }}
                          style={{
                            backgroundColor: '#f59e0b',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          Archive Selected
                        </button>
                      )}
                      {/* Show Unarchive button if any archived items are selected */}
                      {canUnarchiveTransactions && hasArchived && (
                        <button
                          onClick={async () => {
                            const toUnarchive = selectedTxs.filter(tx => tx.archived);
                            await Promise.all(
                              toUnarchive.map((tx) => {
                                const txRef = doc(db, 'transactions', tx.id);
                                return updateDoc(txRef, { archived: false });
                              })
                            );
                            setTransactions((prev) =>
                              prev.map((row) =>
                                toUnarchive.some(t => t.id === row.id)
                                  ? { ...row, archived: false }
                                  : row,
                              ),
                            );
                            setSelectedItems(new Set());
                            setIsSelectMode(false);
                          }}
                          style={{
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          Unarchive Selected
                        </button>
                      )}
                      {/* Show Delete button if only archived items are selected */}
                      {canDeleteTransactions && hasArchived && !hasUnarchived && (
                        <button
                          onClick={async () => {
                            const toDelete = selectedTxs.filter(tx => tx.archived);
                            await Promise.all(
                              toDelete.map((tx) => {
                                const txRef = doc(db, 'transactions', tx.id);
                                return updateDoc(txRef, { deleted: true });
                              })
                            );
                            setTransactions((prev) =>
                              prev.filter((row) =>
                                !toDelete.some(t => t.id === row.id)
                              ),
                            );
                            setSelectedItems(new Set());
                            setIsSelectMode(false);
                          }}
                          style={{
                            backgroundColor: '#ef4444',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          Delete Selected
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{
                overflowX: 'auto',
                backgroundColor: 'var(--surface-elevated)',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: isMobile ? '400px' : '800px'
                }}>
                  <thead>
                    <tr style={{
                      backgroundColor: 'var(--table-header-bg)',
                      borderBottom: '1px solid var(--table-border)'
                    }}>
                      {isSelectMode && (
                        <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={selectedItems.size === getFilteredTransactionsForTable().length && getFilteredTransactionsForTable().length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedItems(new Set(getFilteredTransactionsForTable().map(tx => tx.id)));
                              } else {
                                setSelectedItems(new Set());
                              }
                            }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                        </th>
                      )}
                      {isMobile ? (
                        /* Mobile: 2 columns */
                        <>
                          <th onClick={() => handleHeaderSort('customer')} style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Customer {sortBy.startsWith('customer-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                          <th onClick={() => handleHeaderSort('total')} style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Grand Total {sortBy.startsWith('total-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                        </>
                      ) : (
                        /* Desktop: All columns */
                        <>
                          <th onClick={() => handleHeaderSort('id')} style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Transaction ID {sortBy.startsWith('id-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                          <th onClick={() => handleHeaderSort('date')} style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Date {sortBy.startsWith('date-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                          <th onClick={() => handleHeaderSort('customer')} style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Customer {sortBy.startsWith('customer-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                          <th onClick={() => handleHeaderSort('type')} style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Type {sortBy.startsWith('type-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                          <th onClick={() => handleHeaderSort('items')} style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Items {sortBy.startsWith('items-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                          <th onClick={() => handleHeaderSort('total')} style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Grand Total {sortBy.startsWith('total-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                          <th onClick={() => handleHeaderSort('payment')} style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Payment Type {sortBy.startsWith('payment-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                          <th onClick={() => handleHeaderSort('status')} style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}>
                            Status {sortBy.startsWith('status-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                          </th>
                        </>
                      )}
                      {!isMobile && (
                        <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: 'var(--table-header-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredTransactionsForTable()
                      .map((tx, index) => {
                        // Calculate discount/markup for mobile display
                        const adjustments = (tx.items || []).filter(item =>
                          (item.adjustmentType === 'discount' || item.adjustmentType === 'markup') &&
                          (item.adjustmentPerUnit || 0) > 0 &&
                          (item.specialUnits || 0) > 0,
                        );
                        const totalAdjAmount = adjustments.reduce((sum, it) => {
                          const qty = it.specialUnits || 0;
                          const per = it.adjustmentPerUnit || 0;
                          return sum + qty * per;
                        }, 0);

                        // Type abbreviation for mobile
                        const typeAbbrev = tx.type === 'Parts Only' ? 'P' : tx.type === 'Service Only' ? 'S' : 'PS';

                        return (
                          <tr
                            key={tx.id}
                            style={{
                              backgroundColor: index % 2 === 0 ? 'var(--table-row-bg)' : 'var(--table-row-alt-bg)',
                              borderBottom: index === transactions.length - 1 ? 'none' : '1px solid var(--table-border)',
                              transition: 'background-color 0.2s',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--table-row-hover-bg)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'var(--table-row-bg)' : 'var(--table-row-alt-bg)';
                            }}
                            onClick={() => {
                              if (isSelectMode) {
                                const newSet = new Set(selectedItems);
                                if (newSet.has(tx.id)) {
                                  newSet.delete(tx.id);
                                } else {
                                  newSet.add(tx.id);
                                }
                                setSelectedItems(newSet);
                              } else {
                                setSelectedTransaction(tx);
                                setIsModalOpen(true);
                              }
                            }}
                          >
                            {/* Select Mode Checkbox */}
                            {isSelectMode && (
                              <td style={{ padding: '1rem 0.5rem', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedItems.has(tx.id)}
                                  onChange={() => { }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                              </td>
                            )}

                            {/* Mobile Layout: 2 columns */}
                            {isMobile ? (
                              <>
                                {/* Column 1: Customer with Transaction ID - Date below */}
                                <td style={{
                                  padding: '1rem 1.5rem',
                                  fontSize: '0.875rem',
                                  color: 'var(--table-row-text)',
                                  textAlign: 'left'
                                }}>
                                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                                    {tx.customer}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.15rem' }}>
                                    {tx.transactionCode || tx.id} - {new Date(tx.date).toLocaleDateString()}
                                  </div>
                                </td>

                                {/* Column 2: Grand Total with Payment Type - Discount/Markup - Type below */}
                                <td style={{
                                  padding: '1rem 1.5rem',
                                  fontSize: '0.875rem',
                                  textAlign: 'right'
                                }}>
                                  <div style={{ fontWeight: '600', color: 'var(--table-row-text)', marginBottom: '0.25rem' }}>
                                    ₱{tx.grandTotal.toLocaleString()}
                                  </div>
                                  <div style={{
                                    fontSize: '0.75rem',
                                    color: '#6b7280',
                                    marginTop: '0.15rem'
                                  }}>
                                    {tx.paymentType}{adjustments.length > 0 ? ` - ${adjustments[0].adjustmentType === 'markup' ? '+' : '-'}₱${totalAdjAmount.toFixed(2)}` : ''} - {typeAbbrev}
                                  </div>
                                </td>
                              </>
                            ) : (
                              /* Desktop Layout: All columns */
                              <>
                                {/* Transaction ID */}
                                <td style={{
                                  padding: '1rem 1.5rem',
                                  fontSize: '0.875rem',
                                  color: 'var(--table-row-text)',
                                  whiteSpace: 'nowrap',
                                  textAlign: 'center'
                                }}>
                                  {tx.transactionCode || tx.id}
                                </td>

                                {/* Date */}
                                <td style={{
                                  padding: '1rem 1.5rem',
                                  fontSize: '0.875rem',
                                  color: 'var(--table-header-text)',
                                  whiteSpace: 'nowrap',
                                  textAlign: 'center'
                                }}>
                                  {new Date(tx.date).toLocaleDateString()}
                                </td>

                                {/* Customer */}
                                <td style={{
                                  padding: '1rem 1.5rem',
                                  fontSize: '0.875rem',
                                  color: 'var(--table-row-text)',
                                  whiteSpace: 'nowrap',
                                  textAlign: 'left'
                                }}>
                                  {tx.customer}
                                </td>

                                {/* Type */}
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

                                {/* Items */}
                                <td style={{
                                  padding: '1rem 1.5rem',
                                  fontSize: '0.875rem',
                                  textAlign: 'center',
                                  color: 'var(--table-row-text)'
                                }}>
                                  {tx.itemCount}
                                </td>

                                {/* Grand Total */}
                                <td style={{
                                  padding: '1rem 1.5rem',
                                  fontSize: '0.875rem',
                                  fontWeight: '600',
                                  color: 'var(--table-row-text)',
                                  textAlign: 'right',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <div>
                                    ₱{tx.grandTotal.toLocaleString()}
                                  </div>
                                  {adjustments.length > 0 && (
                                    <div style={{
                                      fontSize: '0.75rem',
                                      fontWeight: 400,
                                      color: 'var(--table-row-text)',
                                      marginTop: '0.15rem'
                                    }}>
                                      Discount/Markup: ₱{totalAdjAmount.toFixed(2)}
                                    </div>
                                  )}
                                </td>

                                {/* Payment Type */}
                                <td style={{
                                  padding: '1rem 1.5rem',
                                  fontSize: '0.875rem',
                                  color: 'var(--table-header-text)',
                                  textAlign: 'left'
                                }}>
                                  {tx.paymentType}
                                </td>

                                {/* Status */}
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

                                {/* Actions */}
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
                                  {canArchiveTransactions && !tx.archived && (
                                    <button
                                      style={{
                                        padding: '0.25rem 0.75rem',
                                        fontSize: '0.75rem',
                                        borderRadius: '9999px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: '#f59e0b',
                                        color: 'white'
                                      }}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const txRef = doc(db, 'transactions', tx.id);
                                        await updateDoc(txRef, { archived: true });
                                      }}
                                    >
                                      Archive
                                    </button>
                                  )}
                                  {tx.archived && (
                                    <>
                                      <span style={{
                                        fontSize: '0.75rem',
                                        color: '#9ca3af',
                                        marginRight: canUnarchiveTransactions ? '0.5rem' : 0
                                      }}>
                                        Archived
                                      </span>
                                      {canUnarchiveTransactions && (
                                        <button
                                          style={{
                                            padding: '0.25rem 0.75rem',
                                            fontSize: '0.75rem',
                                            borderRadius: '9999px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            backgroundColor: '#3b82f6',
                                            color: 'white',
                                            marginRight: canDeleteTransactions ? '0.5rem' : 0
                                          }}
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const txRef = doc(db, 'transactions', tx.id);
                                            await updateDoc(txRef, { archived: false });
                                          }}
                                        >
                                          Unarchive
                                        </button>
                                      )}
                                      {canDeleteTransactions && (
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
                                    </>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
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
                          No transactions found.
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
                      backgroundColor: 'var(--surface-elevated)',
                      borderRadius: '0.75rem',
                      padding: '1.5rem 2rem',
                      maxWidth: '600px',
                      width: '100%',
                      maxHeight: '80vh',
                      overflowY: 'auto',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                      color: 'var(--text-primary)'
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
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--field-label-text)' }}>Date</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                            {new Date(selectedTransaction.date).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--field-label-text)' }}>Customer</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.customer}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--field-label-text)' }}>Type</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.type}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--field-label-text)' }}>Status</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.status}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--field-label-text)' }}>Items</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.itemCount}</div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--field-label-text)' }}>Payment Type</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{selectedTransaction.paymentType}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--field-label-text)' }}>Grand Total</div>
                          <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                            ₱{selectedTransaction.grandTotal.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Line items */}
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Items in this transaction</h4>
                        {selectedTransaction.items && selectedTransaction.items.length > 0 ? (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Item</th>
                                <th style={{ textAlign: 'center', padding: '0.5rem' }}>Qty</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Price</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedTransaction.items.map((item, idx) => {
                                const specialUnits = item.specialUnits || 0;
                                const adjustmentPerUnit = item.adjustmentPerUnit || 0;
                                const adjustmentType = item.adjustmentType || 'none';
                                const hasAdjustment =
                                  (adjustmentType === 'discount' || adjustmentType === 'markup') &&
                                  adjustmentPerUnit > 0 &&
                                  specialUnits > 0;

                                return (
                                  <tr key={idx}>
                                    <td style={{ padding: '0.5rem' }}>
                                      <div>{item.name}</div>
                                      {hasAdjustment && (
                                        <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '0.1rem' }}>
                                          {specialUnits} unit{specialUnits !== 1 ? 's' : ''} with
                                          {adjustmentType === 'discount' ? ' discount' : ' markup'} of ₱{adjustmentPerUnit.toFixed(2)} each
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.quantity}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>₱{item.price.toFixed(2)}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                      ₱{item.subtotal.toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })}
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
                      backgroundColor: 'var(--surface-elevated)',
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
                                  backgroundColor: 'var(--surface-elevated)',
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
                      backgroundColor: 'var(--surface-elevated)',
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
                            backgroundColor: 'var(--surface-elevated)',
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