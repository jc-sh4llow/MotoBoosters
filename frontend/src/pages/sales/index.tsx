import {
  FaHome,
  FaBars,
  FaWarehouse,
  FaWrench,
  FaFileInvoice,
  FaPlus,
  FaUser,
  FaFilter,
  FaRedo,
  FaFileExcel,
  FaSearch,
  FaTimes,
  FaUndoAlt,
  FaCog,
  FaTag,
} from 'react-icons/fa';

import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';

import { useAuth } from '../../contexts/AuthContext';
import { can } from '../../config/permissions';
import { db } from '../../lib/firebase';

export function Sales() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  let closeMenuTimeout: number | undefined;
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [priceType, setPriceType] = useState('unit');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'parts' | 'service' | 'partsAndService'>('all');
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customerFilter, setCustomerFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');

  const [firestoreSales, setFirestoreSales] = useState<any[]>([]);

  const currentRole = (user?.role || '').toString();

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

  // Sample data - used as fallback if Firestore has no data
  const salesData = [
    // Parts Only
    {
      id: 'SALE-001',
      date: '2023-11-15',
      itemCode: 'OIL-4T-1L',
      itemName: '4T Engine Oil (1L)',
      quantity: 2,
      unitPrice: 350,
      totalAmount: 700,
      customer: 'John Dela Cruz',
      transactionType: 'Parts Only' as const
    },
    // ... rest of the sample data ...
  ];

  // Options for customer and item dropdowns (LOVs)
  const sourceForLov = (firestoreSales.length ? firestoreSales : salesData) as any[];
  const customerOptions = Array.from(
    new Set(
      sourceForLov
        .map(s => (s.customer ?? '').toString())
        .filter(name => name && name !== 'N/A')
    )
  ).sort();

  const itemOptions = Array.from(
    new Set(
      sourceForLov
        .map(s => (s.itemCode ?? '').toString())
        .filter(code => code)
    )
  ).sort();

  const getFilteredByTab = () => {
    const source = (firestoreSales.length ? firestoreSales : salesData) as any[];

    if (activeTab === 'all') return source;
    if (activeTab === 'parts') return source.filter(s => s.transactionType === 'Parts Only');
    if (activeTab === 'service') return source.filter(s => s.transactionType === 'Service Only');
    return source.filter(s => s.transactionType === 'Parts + Service');
  };

  const isWithinTimeframe = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const diffDays = (startOfToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / (1000 * 60 * 60 * 24);

    switch (timeframe) {
      case 'today':
        return diffDays === 0;
      case 'week':
        return diffDays >= 0 && diffDays < 7;
      case 'month':
        return diffDays >= 0 && diffDays < 30;
      case 'year':
        return diffDays >= 0 && diffDays < 365;
      case 'custom':
        if (!customStart || !customEnd) return true;
        const start = new Date(customStart);
        const end = new Date(customEnd);
        return d >= start && d <= end;
      default:
        return true;
    }
  };

  // Apply timeframe + price + customer + item filters, then sort latest first
  const afterTab = getFilteredByTab();

  const filteredByTimeframe = afterTab.filter(sale => isWithinTimeframe(sale.date));

  const filteredByCustomerItem = filteredByTimeframe.filter(sale => {
    if (customerFilter && sale.customer !== customerFilter) return false;
    if (itemFilter && sale.itemCode !== itemFilter) return false;
    return true;
  });

  const filteredByAll = filteredByCustomerItem.filter(sale => {
    const min = minPrice ? Number(minPrice) : undefined;
    const max = maxPrice ? Number(maxPrice) : undefined;
    if (min === undefined && max === undefined) return true;

    const value = priceType === 'total' ? Number(sale.totalAmount ?? 0) : Number(sale.unitPrice ?? 0);
    if (Number.isNaN(value)) return false;
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
  });

  const filteredSales = [...filteredByAll].sort((a: any, b: any) => {
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    if (db !== da) return db - da; // latest first

    // tie-breaker: transaction code / id
    const aCode = (a as any).transactionCode || (typeof a.id === 'string' ? a.id : '');
    const bCode = (b as any).transactionCode || (typeof b.id === 'string' ? b.id : '');
    if (aCode < bCode) return -1;
    if (aCode > bCode) return 1;
    return 0;
  });

  const getSummaryData = () => {
    const totalTransactions = filteredSales.length;
    const itemsSold = filteredSales.reduce((sum, s) => sum + s.quantity, 0);
    const totalRevenue = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const averageSale = totalTransactions ? totalRevenue / totalTransactions : 0;

    return {
      totalTransactions,
      itemsSold,
      averageSale,
      totalRevenue
    };
  };

  const summaryData = getSummaryData();

  // For the detail table, tag each row with a group index and first/last flags
  // so that all items from the same transaction share the same band and can
  // show a simple bracket indicator.
  const filteredSalesWithGroup = (() => {
    const rows: {
      sale: any;
      groupIndex: number;
      isFirstInGroup: boolean;
      isLastInGroup: boolean;
    }[] = [];

    const getKey = (s: any) => {
      const txCode = (s as any).transactionCode as string | undefined;
      const derivedFromId = typeof s.id === 'string' ? s.id.split('-')[0] : String(s.id ?? '');
      return txCode || derivedFromId;
    };

    let currentGroup = -1;
    let lastKey: string | null = null;

    filteredSales.forEach((sale, index) => {
      const key = getKey(sale);
      const prevKey = index > 0 ? getKey(filteredSales[index - 1]) : null;
      const nextKey = index < filteredSales.length - 1 ? getKey(filteredSales[index + 1]) : null;

      if (key !== lastKey) {
        currentGroup += 1;
        lastKey = key;
      }

      const isFirstInGroup = key !== prevKey;
      const isLastInGroup = key !== nextKey;

      rows.push({ sale, groupIndex: currentGroup, isFirstInGroup, isLastInGroup });
    });

    return rows;
  })();

  const menuItems = [
    { title: 'Home', path: '/', icon: <FaHome /> },
    { title: 'Inventory Management', path: '/inventory', icon: <FaWarehouse /> },
    { title: 'Sales Records', path: '/sales', icon: <FaTag /> },
    { title: 'Services Offered', path: '/services', icon: <FaWrench /> },
    { title: 'New Transaction', path: '/transactions/new', icon: <FaPlus /> },
    { title: 'Transaction History', path: '/transactions', icon: <FaFileInvoice /> },
    { title: 'Customers', path: '/customers', icon: <FaUser /> },
    { title: 'User Management', path: '/users', icon: <FaUser /> },
    { title: 'Returns & Refunds', path: '/returns', icon: <FaUndoAlt /> },
    { title: 'Settings', path: '/settings', icon: <FaCog /> },
  ];

  const loadSalesFromFirestore = async () => {
    try {
      const snap = await getDocs(collection(db, 'transactions'));
      const rows: any[] = [];

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
        let normalizedType: 'Parts Only' | 'Service Only' | 'Parts + Service' | 'N/A' = 'N/A';
        if (rawType.toLowerCase() === 'parts only') {
          normalizedType = 'Parts Only';
        } else if (rawType.toLowerCase() === 'service only') {
          normalizedType = 'Service Only';
        } else if (rawType.toLowerCase() === 'parts & service' || rawType.toLowerCase() === 'parts + service') {
          normalizedType = 'Parts + Service';
        }

        const itemsArray = Array.isArray(data.items) ? data.items : [];

        const transactionCode = (data.transactionCode ?? '').toString() || undefined;

        itemsArray.forEach((item: any, idx: number) => {
          const quantity = Number(item.quantity ?? 0) || 0;
          const unitPrice = Number(item.price ?? 0) || 0;
          const totalAmount = Number(item.subtotal ?? 0) || (quantity * unitPrice);

          rows.push({
            id: `${docSnap.id}-${idx}`,
            transactionCode,
            date: dateStr,
            itemCode: (item.itemCode ?? item.code ?? '').toString(),
            itemName: (item.name ?? '').toString(),
            quantity,
            unitPrice,
            totalAmount,
            customer: customerName,
            transactionType: normalizedType,
          });
        });
      });

      setFirestoreSales(rows);
    } catch (err) {
      console.error('Error loading sales from Firestore', err);
      setFirestoreSales([]);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const isMobileView = window.innerWidth < 768;
      setIsMobile(isMobileView);
      if (!isMobileView) {
        setIsNavExpanded(false);
      }
    };

    window.addEventListener('resize', handleResize);

    loadSalesFromFirestore();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleApplyFilter = () => {
    // Handle filter logic here
    console.log('Applying filters:', { startDate, endDate, selectedItem });
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setSelectedItem('');
  };

  const handleExportToExcel = () => {
    // Handle export to Excel logic here
    console.log('Exporting to Excel...');
  };

  const timeframeLabel = (() => {
    switch (timeframe) {
      case 'today':
        return 'Today';
      case 'week':
        return 'Last 7 Days';
      case 'month':
        return 'Last 30 Days';
      case 'year':
        return 'Last 365 Days';
      case 'custom':
        return customStart && customEnd ? `${customStart} – ${customEnd}` : 'Custom Range';
      default:
        return '';
    }
  })();

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
          zIndex: 100
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: '1400px',
            margin: '0 auto',
            width: '100%',
            position: 'relative'
          }}>
            <h1 style={{
              fontSize: '1.875rem',
              fontWeight: 'bold',
              color: 'white',
              margin: 0,
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}>
              Sales Records
            </h1>
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              marginLeft: 'auto', // This will push it to the right
              marginRight: '1rem' // Add some space before the hamburger button
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
                placeholder="Search by Customer or Item Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: '0.5rem 2.5rem 0.5rem 2.5rem', // Added right padding for the clear button
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'rgba(255, 255, 255)',
                  color: '#1f2937', // Darker color for better contrast
                  width: '350px', // Slightly reduced width
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
              <span style={{ fontSize: '1rem' }}></span>
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
                    ':hover': {
                      backgroundColor: '#f3f4f6'
                    }
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
            {/* Sales Summary Section */}
            <section style={{ marginBottom: '2rem' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'center',
                marginBottom: '1rem',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'parts', label: 'Parts Only' },
                    { key: 'service', label: 'Service Only' },
                    { key: 'partsAndService', label: 'Parts & Service' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      style={{
                        padding: '0.4rem 0.9rem',
                        borderRadius: '9999px',
                        border: activeTab === tab.key ? '1px solid #1e40af' : '1px solid #e5e7eb',
                        backgroundColor: activeTab === tab.key ? '#1e40af' : 'white',
                        color: activeTab === tab.key ? 'white' : '#374151',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => setShowCustomModal(true)}
                    style={{
                      padding: '0.4rem 0.9rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #1e3a8a',
                      backgroundColor: '#1e40af',
                      color: 'white',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <FaFilter /> Filters
                  </button>
                  {timeframeLabel && (
                    <span
                      style={{
                        fontSize: '0.8rem',
                        color: '#e5e7eb',
                        display: 'inline-block',
                        width: '140px',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {timeframeLabel}
                    </span>
                  )}
                </div>
              </div>

              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                marginBottom: '1rem',
                color: '#1e40af'
              }}>
                {activeTab === 'all' && 'Overall Sales Summary'}
                {activeTab === 'parts' && 'Parts Only Sales Summary'}
                {activeTab === 'service' && 'Service Only Sales Summary'}
                {activeTab === 'partsAndService' && 'Parts & Service Sales Summary'}
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                {[
                  { title: 'Total Transactions', value: summaryData.totalTransactions, color: '#3b82f6' },
                  { title: 'Items Sold', value: summaryData.itemsSold, color: '#10b981' },
                  { title: 'Average Sale', value: `₱${summaryData.averageSale.toFixed(2)}`, color: '#f59e0b' },
                  { title: 'Total Revenue', value: `₱${summaryData.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#8b5cf6' }
                ].map((item, index) => (
                  <div key={index} style={{
                    backgroundColor: 'white',
                    borderRadius: '0.5rem',
                    padding: '1.25rem',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    borderLeft: `4px solid ${item.color}`
                  }}>
                    <p style={{
                      fontSize: '0.875rem',
                      color: '#6b7280',
                      margin: '0 0 0.5rem 0'
                    }}>
                      {item.title}
                    </p>
                    <p style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: '#1f2937',
                      margin: 0
                    }}>
                      {item.value}
                    </p>
                  </div>

                ))}
              </div>
            </section>

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
                  Sales Detail Records
                </h2>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => window.location.reload()}
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
                  <button
                    onClick={handleExportToExcel}
                    style={{
                      backgroundColor: '#10b981',
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
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                  >
                    <FaFileExcel /> Export to Excel
                  </button>
                </div>

              </div>

              <div style={{
                overflowX: 'auto',
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: '800px'
                }}>
                  <thead>
                    <tr style={{
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      {['Transaction ID', 'Date', 'Item Code', 'Item Name', 'Quantity', 'Unit Price', 'Total Amount', 'Customer'].map((header) => (
                        <th
                          key={header}
                          style={{
                            padding: '0.75rem 1rem',
                            textAlign: 'left',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            color: '#4b5563',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSalesWithGroup.map(({ sale, groupIndex }, index) => {
                      const isEvenGroup = groupIndex % 2 === 0;
                      const rowBg = isEvenGroup ? 'white' : '#e5e7eb';

                      return (
                        <tr
                          key={sale.id}
                          style={{
                            borderBottom:
                              index === filteredSalesWithGroup.length - 1
                                ? 'none'
                                : '1px solid #d1d5db',
                            backgroundColor: rowBg,
                          }}
                        >
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: '#111827',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {(sale as any).transactionCode || sale.id}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: '#4b5563',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {new Date(sale.date).toLocaleDateString()}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: '#111827',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {sale.itemCode}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: '#111827',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {sale.itemName}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: '#111827',
                              textAlign: 'right',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {sale.quantity}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: '#111827',
                              textAlign: 'right',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            ₱{sale.unitPrice.toFixed(2)}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: '#111827',
                              textAlign: 'right',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            ₱{sale.totalAmount.toFixed(2)}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: '#111827',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {sale.customer}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredSalesWithGroup.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: '2rem',
                            textAlign: 'center',
                            color: '#6b7280',
                            fontStyle: 'italic',
                          }}
                        >
                          No sales records found for this filter
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </section>
          </div>
        </main>
        {showCustomModal && (
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
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, marginBottom: '1rem', color: '#111827' }}>
                Sales Filters
              </h3>
              <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                {/* Date filter */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#4b5563' }}>
                    Date Range
                  </label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: 'white',
                      color: '#111827',
                    }}
                  >
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="year">Last 365 Days</option>
                    <option value="custom">Custom Range...</option>
                  </select>
                  {timeframe === 'custom' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: '#4b5563' }}>
                          Start
                        </label>
                        <input
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.4rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#111827',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: '#4b5563' }}>
                          End
                        </label>
                        <input
                          type="date"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.4rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#111827',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Price range */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#4b5563' }}>
                    Price Range
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <select
                      value={priceType}
                      onChange={(e) => setPriceType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #d1d5db',
                        backgroundColor: 'white',
                        color: '#111827',
                      }}
                    >
                      <option value="unit">Unit Price</option>
                      <option value="total">Total Amount</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="Min"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #d1d5db',
                        backgroundColor: 'white',
                        color: '#111827',
                      }}
                    />
                    <span>-</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #d1d5db',
                        backgroundColor: 'white',
                        color: '#111827',
                      }}
                    />
                  </div>
                </div>

                {/* Customer filter */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#4b5563' }}>
                    Customer
                  </label>
                  <select
                    value={customerFilter}
                    onChange={(e) => setCustomerFilter(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: 'white',
                      color: '#111827',
                    }}
                  >
                    <option value="">All Customers</option>
                    {customerOptions.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Item filter */}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#4b5563' }}>
                    Item
                  </label>
                  <select
                    value={itemFilter}
                    onChange={(e) => setItemFilter(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: 'white',
                      color: '#111827',
                    }}
                  >
                    <option value="">All Items</option>
                    {itemOptions.map(code => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    // Clear all filters back to defaults
                    setTimeframe('today');
                    setCustomStart('');
                    setCustomEnd('');
                    setPriceType('unit');
                    setMinPrice('');
                    setMaxPrice('');
                    setCustomerFilter('');
                    setItemFilter('');
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                  }}
                >
                  Clear Filters
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomModal(false);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'white',
                    color: '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    backgroundColor: '#1e40af',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}