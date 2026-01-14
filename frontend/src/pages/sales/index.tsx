import {
  FaBars,
  FaFilter,
  FaFileExcel,
  FaSearch,
  FaTimes,
} from 'react-icons/fa';

import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import logo from '../../assets/logo.png';
import { db } from '../../lib/firebase';
import { HeaderDropdown } from '../../components/HeaderDropdown';

export function Sales() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

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
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  const [selectingDate, setSelectingDate] = useState<'start' | 'end'>('start');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [customerFilter, setCustomerFilter] = useState('');
  const [customerFilterMode, setCustomerFilterMode] = useState<'all' | 'search'>('all');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [itemFilterMode, setItemFilterMode] = useState<'all' | 'search'>('all');
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');

  const [firestoreSales, setFirestoreSales] = useState<any[]>([]);

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

  const filteredSales = (() => {
    const sorted = [...filteredByAll];
    const [field, dir] = sortBy.split('-');
    const desc = dir === 'desc';

    sorted.sort((a: any, b: any) => {
      switch (field) {
        case 'transactionId': {
          const aCode = (a as any).transactionCode || (typeof a.id === 'string' ? a.id : '');
          const bCode = (b as any).transactionCode || (typeof b.id === 'string' ? b.id : '');
          return desc ? bCode.localeCompare(aCode) : aCode.localeCompare(bCode);
        }
        case 'date': {
          const da = new Date(a.date || 0).getTime();
          const db = new Date(b.date || 0).getTime();
          return desc ? db - da : da - db;
        }
        case 'itemCode': {
          const aCode = (a.itemCode || '').toString().toLowerCase();
          const bCode = (b.itemCode || '').toString().toLowerCase();
          return desc ? bCode.localeCompare(aCode) : aCode.localeCompare(bCode);
        }
        case 'itemName': {
          const aName = (a.itemName || '').toString().toLowerCase();
          const bName = (b.itemName || '').toString().toLowerCase();
          return desc ? bName.localeCompare(aName) : aName.localeCompare(bName);
        }
        case 'quantity': {
          const aQty = Number(a.quantity ?? 0);
          const bQty = Number(b.quantity ?? 0);
          return desc ? bQty - aQty : aQty - bQty;
        }
        case 'unitPrice': {
          const aPrice = Number(a.unitPrice ?? 0);
          const bPrice = Number(b.unitPrice ?? 0);
          return desc ? bPrice - aPrice : aPrice - bPrice;
        }
        case 'totalAmount': {
          const aTotal = Number(a.totalAmount ?? 0);
          const bTotal = Number(b.totalAmount ?? 0);
          return desc ? bTotal - aTotal : aTotal - bTotal;
        }
        case 'customer': {
          const aCust = (a.customer || '').toString().toLowerCase();
          const bCust = (b.customer || '').toString().toLowerCase();
          return desc ? bCust.localeCompare(aCust) : aCust.localeCompare(bCust);
        }
        default:
          return 0;
      }
    });

    return sorted;
  })();

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



  useEffect(() => {
    const handleResize = () => {
      const isMobileView = window.innerWidth < 768;
      setIsMobile(isMobileView);
      if (!isMobileView) {
        setIsNavExpanded(false);
      }
    };

    window.addEventListener('resize', handleResize);

    // Real-time listener for transactions - auto-reloads when data changes
    const unsubscribe = onSnapshot(collection(db, 'transactions'), (snap) => {
      const rows: any[] = [];

      snap.forEach((docSnap) => {
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
    }, (err) => {
      console.error('Error loading sales from Firestore', err);
      setFirestoreSales([]);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      unsubscribe();
    };
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
                color: 'var(--text-primary)',
                margin: 0,
              }}>
                Item Sales
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
                  placeholder="Search sales..."
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
            {/* Action Bar - matching inventory page style */}
            <section style={{ marginBottom: '2rem' }}>
              <div style={{
                backgroundColor: 'var(--surface-elevated)',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem',
                border: '1px solid var(--border)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  marginBottom: showFilters ? '1rem' : 0
                }}>
                  {/* Left side: Export to CSV + Select */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={handleExportToExcel}
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
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#047857';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#059669';
                      }}
                    >
                      Export to CSV <FaFileExcel />
                    </button>
                  </div>

                  {/* Center: Type toggle buttons */}
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

                  {/* Right side: Filters + Clear Filters */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
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
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#1e3a8a';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#1e40af';
                      }}
                    >
                      Filters <FaFilter />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTimeframe('today');
                        setCustomStart('');
                        setCustomEnd('');
                        setPriceType('unit');
                        setMinPrice('');
                        setMaxPrice('');
                        setCustomerFilter('');
                        setItemFilter('');
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
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#4b5563';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#6b7280';
                      }}
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>

                {/* Inline Filters Section - shown when Filters button is clicked */}
                {showFilters && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb'
                  }}>
                    {/* Timeframe Filter */}
                    <div style={{ position: 'relative' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Timeframe
                      </label>
                      <select
                        value={timeframe}
                        onChange={(e) => {
                          const val = e.target.value as typeof timeframe;
                          setTimeframe(val);
                          if (val === 'custom') {
                            setShowCalendarPicker(true);
                          } else {
                            setShowCalendarPicker(false);
                          }
                        }}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}
                      >
                        <option value="today">Today</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                        <option value="year">Last 365 Days</option>
                        <option value="custom">{customStart && customEnd ? `${customStart} – ${customEnd}` : 'Custom Range'}</option>
                      </select>
                      {/* Custom Date Range Picker Dropdown with Visual Calendar */}
                      {showCalendarPicker && (() => {
                        const minDate = new Date('2025-08-05');
                        const maxDate = new Date();
                        const year = calendarViewDate.getFullYear();
                        const month = calendarViewDate.getMonth();
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
                        
                        const firstDayOfMonth = new Date(year, month, 1).getDay();
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        const days: (number | null)[] = [];
                        
                        for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
                        for (let i = 1; i <= daysInMonth; i++) days.push(i);
                        
                        const isDateDisabled = (day: number) => {
                          const date = new Date(year, month, day);
                          return date < minDate || date > maxDate;
                        };
                        
                        const isDateSelected = (day: number) => {
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          return dateStr === customStart || dateStr === customEnd;
                        };
                        
                        const isDateInRange = (day: number) => {
                          if (!customStart || !customEnd) return false;
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          return dateStr > customStart && dateStr < customEnd;
                        };
                        
                        const handleDayClick = (day: number) => {
                          if (isDateDisabled(day)) return;
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          
                          if (selectingDate === 'start') {
                            setCustomStart(dateStr);
                            setSelectingDate('end');
                          } else {
                            if (dateStr < customStart) {
                              setCustomEnd(customStart);
                              setCustomStart(dateStr);
                            } else {
                              setCustomEnd(dateStr);
                            }
                            setSelectingDate('start');
                          }
                        };
                        
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
                            border: '1px solid var(--border)',
                            padding: '1rem',
                            marginTop: '0.25rem',
                            minWidth: '300px'
                          }}>
                            {/* Date inputs row */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', color: 'var(--field-label-text)' }}>Start</label>
                                <input
                                  type="text"
                                  readOnly
                                  value={customStart || 'dd/mm/yyyy'}
                                  onClick={() => setSelectingDate('start')}
                                  style={{
                                    width: '100%',
                                    padding: '0.4rem',
                                    borderRadius: '0.375rem',
                                    border: selectingDate === 'start' ? '2px solid #1e40af' : '1px solid #d1d5db',
                                    backgroundColor: 'var(--surface-elevated)',
                                    color: customStart ? 'var(--text-primary)' : '#9ca3af',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', color: 'var(--field-label-text)' }}>End</label>
                                <input
                                  type="text"
                                  readOnly
                                  value={customEnd || 'dd/mm/yyyy'}
                                  onClick={() => setSelectingDate('end')}
                                  style={{
                                    width: '100%',
                                    padding: '0.4rem',
                                    borderRadius: '0.375rem',
                                    border: selectingDate === 'end' ? '2px solid #1e40af' : '1px solid #d1d5db',
                                    backgroundColor: 'var(--surface-elevated)',
                                    color: customEnd ? 'var(--text-primary)' : '#9ca3af',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>
                            </div>
                            
                            {/* Calendar header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', position: 'relative' }}>
                              <button
                                type="button"
                                onClick={() => canGoPrev && setCalendarViewDate(new Date(year, month - 1, 1))}
                                disabled={!canGoPrev}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: canGoPrev ? 'pointer' : 'not-allowed',
                                  color: canGoPrev ? 'var(--text-primary)' : '#d1d5db',
                                  fontSize: '1rem',
                                  padding: '0.25rem 0.5rem'
                                }}
                              >
                                {'<'}
                              </button>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span
                                  onClick={() => { setShowMonthPicker(!showMonthPicker); setShowYearPicker(false); }}
                                  style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.9rem', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', transition: 'background-color 0.15s' }}
                                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  {monthNames[month]}
                                </span>
                                <span
                                  onClick={() => { setShowYearPicker(!showYearPicker); setShowMonthPicker(false); }}
                                  style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.9rem', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', transition: 'background-color 0.15s' }}
                                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  {year}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => canGoNext && setCalendarViewDate(new Date(year, month + 1, 1))}
                                disabled={!canGoNext}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: canGoNext ? 'pointer' : 'not-allowed',
                                  color: canGoNext ? '#374151' : '#d1d5db',
                                  fontSize: '1rem',
                                  padding: '0.25rem 0.5rem'
                                }}
                              >
                                {'>'}
                              </button>
                              
                              {/* Month Picker Dropdown */}
                              {showMonthPicker && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  zIndex: 1001,
                                  backgroundColor: 'white',
                                  borderRadius: '0.5rem',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                  border: '1px solid #e5e7eb',
                                  padding: '0.5rem',
                                  marginTop: '0.25rem',
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(3, 1fr)',
                                  gap: '0.25rem',
                                  minWidth: '180px'
                                }}>
                                  {monthNames.map((m, idx) => {
                                    const isDisabled = (year === minDate.getFullYear() && idx < minDate.getMonth()) || 
                                                       (year === maxDate.getFullYear() && idx > maxDate.getMonth());
                                    return (
                                      <div
                                        key={m}
                                        onClick={() => {
                                          if (!isDisabled) {
                                            setCalendarViewDate(new Date(year, idx, 1));
                                            setShowMonthPicker(false);
                                          }
                                        }}
                                        style={{
                                          padding: '0.5rem',
                                          textAlign: 'center',
                                          fontSize: '0.8rem',
                                          borderRadius: '0.25rem',
                                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                                          backgroundColor: idx === month ? '#1e40af' : 'transparent',
                                          color: isDisabled ? '#d1d5db' : idx === month ? 'white' : '#111827',
                                          fontWeight: idx === month ? 600 : 400,
                                          transition: 'background-color 0.15s'
                                        }}
                                        onMouseOver={(e) => { if (!isDisabled && idx !== month) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                                        onMouseOut={(e) => { if (idx !== month) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                      >
                                        {m}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              
                              {/* Year Picker Dropdown */}
                              {showYearPicker && (() => {
                                const minYear = minDate.getFullYear();
                                const maxYear = maxDate.getFullYear();
                                const years: number[] = [];
                                for (let y = minYear; y <= maxYear; y++) years.push(y);
                                
                                return (
                                  <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: 1001,
                                    backgroundColor: 'white',
                                    borderRadius: '0.5rem',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    border: '1px solid #e5e7eb',
                                    padding: '0.5rem',
                                    marginTop: '0.25rem',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    minWidth: '100px'
                                  }}>
                                    {years.map(y => (
                                      <div
                                        key={y}
                                        onClick={() => {
                                          let newMonth = month;
                                          if (y === minYear && month < minDate.getMonth()) newMonth = minDate.getMonth();
                                          if (y === maxYear && month > maxDate.getMonth()) newMonth = maxDate.getMonth();
                                          setCalendarViewDate(new Date(y, newMonth, 1));
                                          setShowYearPicker(false);
                                        }}
                                        style={{
                                          padding: '0.5rem 1rem',
                                          textAlign: 'center',
                                          fontSize: '0.85rem',
                                          borderRadius: '0.25rem',
                                          cursor: 'pointer',
                                          backgroundColor: y === year ? '#1e40af' : 'transparent',
                                          color: y === year ? 'white' : '#111827',
                                          fontWeight: y === year ? 600 : 400,
                                          transition: 'background-color 0.15s'
                                        }}
                                        onMouseOver={(e) => { if (y !== year) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                                        onMouseOut={(e) => { if (y !== year) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                      >
                                        {y}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                            
                            {/* Day names */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '0.25rem' }}>
                              {dayNames.map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', color: '#6b7280', fontWeight: 500, padding: '0.25rem' }}>
                                  {d}
                                </div>
                              ))}
                            </div>
                            
                            {/* Calendar days */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                              {days.map((day, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => day && handleDayClick(day)}
                                  style={{
                                    textAlign: 'center',
                                    padding: '0.4rem',
                                    fontSize: '0.8rem',
                                    borderRadius: '0.25rem',
                                    cursor: day && !isDateDisabled(day) ? 'pointer' : 'default',
                                    backgroundColor: day && isDateSelected(day) ? '#1e40af' : day && isDateInRange(day) ? '#dbeafe' : 'transparent',
                                    color: day ? (isDateDisabled(day) ? '#d1d5db' : isDateSelected(day) ? 'white' : '#111827') : 'transparent',
                                    fontWeight: day && isDateSelected(day) ? 600 : 400,
                                    transition: 'background-color 0.15s'
                                  }}
                                  onMouseOver={(e) => {
                                    if (day && !isDateDisabled(day) && !isDateSelected(day)) {
                                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                                    }
                                  }}
                                  onMouseOut={(e) => {
                                    if (day && !isDateSelected(day)) {
                                      e.currentTarget.style.backgroundColor = isDateInRange(day) ? '#dbeafe' : 'transparent';
                                    }
                                  }}
                                >
                                  {day || ''}
                                </div>
                              ))}
                            </div>
                            
                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomStart('');
                                  setCustomEnd('');
                                  setShowCalendarPicker(false);
                                  setTimeframe('today');
                                  setSelectingDate('start');
                                }}
                                style={{
                                  padding: '0.375rem 0.75rem',
                                  borderRadius: '0.375rem',
                                  border: '1px solid #d1d5db',
                                  backgroundColor: 'white',
                                  color: '#374151',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem'
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowCalendarPicker(false);
                                  setSelectingDate('start');
                                }}
                                style={{
                                  padding: '0.375rem 0.75rem',
                                  borderRadius: '0.375rem',
                                  border: 'none',
                                  backgroundColor: '#1e40af',
                                  color: 'white',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem'
                                }}
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Price Range Filter */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Price Range ({priceType === 'unit' ? 'Unit' : 'Total'})
                      </label>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        height: '40px'
                      }}>
                        <input
                          type="number"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#111827',
                            textAlign: 'center',
                            height: '100%',
                            boxSizing: 'border-box'
                          }}
                          placeholder="Min"
                        />
                        <span style={{ color: 'rgb(75, 85, 99)' }}>-</span>
                        <input
                          type="number"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#111827',
                            textAlign: 'center',
                            height: '100%',
                            boxSizing: 'border-box'
                          }}
                          placeholder="Max"
                        />
                      </div>
                    </div>

                    {/* Price Type Filter */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Price Type
                      </label>
                      <select
                        value={priceType}
                        onChange={(e) => setPriceType(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}
                      >
                        <option value="unit">Unit Price</option>
                        <option value="total">Total Amount</option>
                      </select>
                    </div>

                    {/* Customer Filter */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Customer
                      </label>
                      <select
                        value={customerFilterMode}
                        onChange={(e) => {
                          const val = e.target.value as 'all' | 'search';
                          setCustomerFilterMode(val);
                          if (val === 'all') {
                            setCustomerFilter('');
                          } else {
                            setShowCustomerModal(true);
                          }
                        }}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}
                      >
                        <option value="all">{customerFilter ? `Selected: ${customerFilter}` : 'All Customers'}</option>
                        <option value="search">Search Customer...</option>
                      </select>
                    </div>

                    {/* Item Filter */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Item
                      </label>
                      <select
                        value={itemFilterMode}
                        onChange={(e) => {
                          const val = e.target.value as 'all' | 'search';
                          setItemFilterMode(val);
                          if (val === 'all') {
                            setItemFilter('');
                          } else {
                            setShowItemModal(true);
                          }
                        }}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}
                      >
                        <option value="all">{itemFilter ? `Selected: ${itemFilter}` : 'All Items'}</option>
                        <option value="search">Search Item...</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                marginBottom: '1rem',
                color: 'var(--text-primary)'
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
                    backgroundColor: 'var(--surface-elevated)',
                    borderRadius: '0.5rem',
                    padding: '1.25rem',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    borderLeft: `4px solid ${item.color}`
                  }}>
                    <p style={{
                      fontSize: '0.875rem',
                      color: 'var(--field-label-text)',
                      margin: '0 0 0.5rem 0'
                    }}>
                      {item.title}
                    </p>
                    <p style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                      margin: 0
                    }}>
                      {item.value}
                    </p>
                  </div>

                ))}
              </div>
            </section>

            <section>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: 'var(--text-primary)',
                marginBottom: '1rem'
              }}>
                Sales Detail Records
              </h2>

              <div style={{
                overflowX: 'auto',
                backgroundColor: 'var(--surface-elevated)',
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
                      backgroundColor: 'var(--table-header-bg)',
                      borderBottom: '1px solid var(--table-border)'
                    }}>
                      <th
                        onClick={() => handleHeaderSort('transactionId')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--table-header-text)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        TRANSACTION ID {sortBy.startsWith('transactionId-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => handleHeaderSort('date')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--table-header-text)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        DATE {sortBy.startsWith('date-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => handleHeaderSort('itemCode')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--table-header-text)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        ITEM CODE {sortBy.startsWith('itemCode-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => handleHeaderSort('itemName')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--table-header-text)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        ITEM NAME {sortBy.startsWith('itemName-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => handleHeaderSort('quantity')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--table-header-text)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        QUANTITY {sortBy.startsWith('quantity-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => handleHeaderSort('unitPrice')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--table-header-text)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        UNIT PRICE {sortBy.startsWith('unitPrice-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => handleHeaderSort('totalAmount')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--table-header-text)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        TOTAL AMOUNT {sortBy.startsWith('totalAmount-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => handleHeaderSort('customer')}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--table-header-text)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        CUSTOMER {sortBy.startsWith('customer-') ? (sortBy.endsWith('-asc') ? '↑' : '↓') : ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSalesWithGroup.map(({ sale, groupIndex }, index) => {
                      const isEvenGroup = groupIndex % 2 === 0;
                      const rowBg = isEvenGroup ? 'var(--table-row-bg)' : 'var(--table-row-alt-bg)';

                      return (
                        <tr
                          key={sale.id}
                          style={{
                            borderBottom:
                              index === filteredSalesWithGroup.length - 1
                                ? 'none'
                                : '1px solid var(--table-border)',
                            backgroundColor: rowBg,
                          }}
                        >
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: 'var(--table-row-text)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {(sale as any).transactionCode || sale.id}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: 'var(--table-row-text)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {new Date(sale.date).toLocaleDateString()}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: 'var(--table-row-text)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {sale.itemCode}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: 'var(--table-row-text)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {sale.itemName}
                          </td>
                          <td
                            style={{
                              padding: '1rem',
                              fontSize: '0.875rem',
                              color: 'var(--table-row-text)',
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
                              color: 'var(--table-row-text)',
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
                              color: 'var(--table-row-text)',
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
                              color: 'var(--table-row-text)',
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

        {/* Customer Search Modal */}
        {showCustomerModal && (
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
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                Select Customer
              </h3>
              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={customerSearchTerm}
                  onChange={(e) => setCustomerSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.5rem 0.5rem 2.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'var(--surface-elevated)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{
                flex: 1,
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem'
              }}>
                {customerOptions
                  .filter(name => name.toLowerCase().includes(customerSearchTerm.toLowerCase()))
                  .map(name => (
                    <div
                      key={name}
                      onClick={() => {
                        setCustomerFilter(name);
                        setShowCustomerModal(false);
                        setCustomerSearchTerm('');
                        setCustomerFilterMode('all');
                      }}
                      style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: customerFilter === name ? '#eff6ff' : 'var(--surface-elevated)',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseOver={(e) => { if (customerFilter !== name) e.currentTarget.style.backgroundColor = 'var(--surface-hover)'; }}
                      onMouseOut={(e) => { if (customerFilter !== name) e.currentTarget.style.backgroundColor = 'var(--surface-elevated)'; }}
                    >
                      {name}
                    </div>
                  ))}
                {customerOptions.filter(name => name.toLowerCase().includes(customerSearchTerm.toLowerCase())).length === 0 && (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontStyle: 'italic' }}>
                    No customers found
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomerModal(false);
                    setCustomerSearchTerm('');
                    setCustomerFilterMode('all');
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
              </div>
            </div>
          </div>
        )}

        {/* Item Search Modal */}
        {showItemModal && (
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
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                Select Item
              </h3>
              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearchTerm}
                  onChange={(e) => setItemSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.5rem 0.5rem 2.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'var(--surface-elevated)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{
                flex: 1,
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem'
              }}>
                {itemOptions
                  .filter(code => code.toLowerCase().includes(itemSearchTerm.toLowerCase()))
                  .map(code => (
                    <div
                      key={code}
                      onClick={() => {
                        setItemFilter(code);
                        setShowItemModal(false);
                        setItemSearchTerm('');
                        setItemFilterMode('all');
                      }}
                      style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: itemFilter === code ? '#eff6ff' : 'var(--surface-elevated)',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseOver={(e) => { if (itemFilter !== code) e.currentTarget.style.backgroundColor = 'var(--surface-hover)'; }}
                      onMouseOut={(e) => { if (itemFilter !== code) e.currentTarget.style.backgroundColor = 'var(--surface-elevated)'; }}
                    >
                      {code}
                    </div>
                  ))}
                {itemOptions.filter(code => code.toLowerCase().includes(itemSearchTerm.toLowerCase())).length === 0 && (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontStyle: 'italic' }}>
                    No items found
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowItemModal(false);
                    setItemSearchTerm('');
                    setItemFilterMode('all');
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'var(--surface-elevated)',
                    color: '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}