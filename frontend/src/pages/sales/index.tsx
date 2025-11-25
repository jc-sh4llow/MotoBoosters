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
} from 'react-icons/fa';

import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { can } from '../../config/permissions';

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
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);

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

  // Sample data - replace with actual data from your backend
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
    {
      id: 'SALE-002',
      date: '2023-11-14',
      itemCode: 'OIL-FILTER-001',
      itemName: 'Oil Filter for Yamaha Mio',
      quantity: 1,
      unitPrice: 450,
      totalAmount: 450,
      customer: 'Maria Santos',
      transactionType: 'Parts Only' as const
    },

    // Service Only
    {
      id: 'SALE-003',
      date: '2023-11-14',
      itemCode: 'SVC-OIL-CHANGE',
      itemName: 'Oil Change Service',
      quantity: 1,
      unitPrice: 200,
      totalAmount: 200,
      customer: 'Carlos Reyes',
      transactionType: 'Service Only' as const
    },
    {
      id: 'SALE-004',
      date: '2023-11-13',
      itemCode: 'SVC-TUNE-UP',
      itemName: 'Engine Tune-Up',
      quantity: 1,
      unitPrice: 800,
      totalAmount: 800,
      customer: 'Andrea Bautista',
      transactionType: 'Service Only' as const
    },

    // Parts + Service
    {
      id: 'SALE-005',
      date: '2023-11-13',
      itemCode: 'SVC-COMPLETE',
      itemName: 'Complete Maintenance Package',
      quantity: 1,
      unitPrice: 2500,
      totalAmount: 2500,
      customer: 'Miguel Lopez',
      transactionType: 'Parts + Service' as const
    },
    {
      id: 'SALE-006',
      date: '2023-11-12',
      itemCode: 'SVC-BRAKE-REPLACE',
      itemName: 'Brake Pad Replacement',
      quantity: 1,
      unitPrice: 1200,
      totalAmount: 1200,
      customer: 'Sofia Garcia',
      transactionType: 'Parts + Service' as const
    },
    {
      id: 'SALE-007',
      date: '2023-11-11',
      itemCode: 'SPARK-PLUG-NGK',
      itemName: 'NGK Spark Plug (Iridium)',
      quantity: 2,
      unitPrice: 400,
      totalAmount: 800,
      customer: 'Jose Tan',
      transactionType: 'Parts Only' as const
    },
    {
      id: 'SALE-008',
      date: '2023-11-10',
      itemCode: 'SVC-CHAIN-LUBE',
      itemName: 'Chain Cleaning and Lubrication',
      quantity: 1,
      unitPrice: 150,
      totalAmount: 150,
      customer: 'Anna Martinez',
      transactionType: 'Service Only' as const
    }
  ];


  const getFilteredByTab = () => {
    if (activeTab === 'all') return salesData;
    if (activeTab === 'parts') return salesData.filter(s => s.transactionType === 'Parts Only');
    if (activeTab === 'service') return salesData.filter(s => s.transactionType === 'Service Only');
    return salesData.filter(s => s.transactionType === 'Parts + Service');
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

  const filteredSales = getFilteredByTab().filter(sale => isWithinTimeframe(sale.date));

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

  useEffect(() => {
    const handleResize = () => {
      const isMobileView = window.innerWidth < 768;
      setIsMobile(isMobileView);
      if (!isMobileView) {
        setIsNavExpanded(false);
      }
    };

    window.addEventListener('resize', handleResize);
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
                border: isNavExpanded ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid transparent',
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
                justifyContent: 'space-between',
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

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    value={timeframe}
                    onChange={(e) => {
                      const value = e.target.value as typeof timeframe;
                      setTimeframe(value);
                      if (value === 'custom') {
                        setShowCustomModal(true);
                      }
                    }}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: 'white',
                      color: '#111827',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="year">Last 365 Days</option>
                    <option value="custom">Custom Range...</option>
                  </select>
                  {timeframe === 'custom' && customStart && customEnd && (
                    <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                      {customStart} – {customEnd}
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

              {/* Filter Section */}
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
                      setSelectedItem('');
                    }}
                    disabled={!startDate && !endDate && !selectedItem}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      backgroundColor: (!startDate && !endDate && !selectedItem) ? '#e5e7eb' : '#6b7280',
                      color: (!startDate && !endDate && !selectedItem) ? '#9ca3af' : 'white',
                      border: 'none',
                      cursor: (!startDate && !endDate && !selectedItem) ? 'not-allowed' : 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      height: '40px',
                      opacity: (!startDate && !endDate && !selectedItem) ? 0.7 : 1
                    }}
                    onMouseOver={(e) => {
                      if (startDate || endDate || selectedItem) {
                        e.currentTarget.style.backgroundColor = '#4b5563';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (startDate || endDate || selectedItem) {
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
                    borderTop: '1px solid #e5e7eb'
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

                    {/* Price Range */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        Price Range
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <select
                          value={priceType}
                          onChange={(e) => setPriceType(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#111827'
                          }}
                        >
                          <option value="unit">Unit Price</option>
                          <option value="total">Total Amount</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                        &nbsp;
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#111827'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
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
                      {['Sale ID', 'Date', 'Item Code', 'Item Name', 'Quantity', 'Unit Price', 'Total Amount', 'Customer'].map((header) => (
                        <th key={header} style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#4b5563',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((sale, index) => (
                      <tr key={sale.id} style={{
                        borderBottom: index === salesData.length - 1 ? 'none' : '1px solid #e5e7eb',
                        backgroundColor: index % 2 === 0 ? 'white' : '#f9fafb'
                      }}>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          whiteSpace: 'nowrap'
                        }}>
                          {sale.id}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#4b5563',
                          whiteSpace: 'nowrap'
                        }}>
                          {new Date(sale.date).toLocaleDateString()}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          whiteSpace: 'nowrap'
                        }}>
                          {sale.itemCode}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          whiteSpace: 'nowrap'
                        }}>
                          {sale.itemName}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          textAlign: 'right',
                          whiteSpace: 'nowrap'
                        }}>
                          {sale.quantity}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          textAlign: 'right',
                          whiteSpace: 'nowrap'
                        }}>
                          ₱{sale.unitPrice.toFixed(2)}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          textAlign: 'right',
                          fontWeight: '600',
                          whiteSpace: 'nowrap'
                        }}>
                          ₱{sale.totalAmount.toFixed(2)}
                        </td>
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: '#111827',
                          whiteSpace: 'nowrap'
                        }}>
                          {sale.customer}
                        </td>
                      </tr>
                    ))}
                    {filteredSales.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{
                          padding: '2rem',
                          textAlign: 'center',
                          color: '#6b7280',
                          fontStyle: 'italic'
                        }}>
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
                Custom Date Range
              </h3>
              <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#4b5563' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
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
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#4b5563' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
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
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomModal(false);
                    if (!customStart || !customEnd) {
                      setTimeframe('month');
                    }
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
                  disabled={!customStart || !customEnd}
                  onClick={() => setShowCustomModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    backgroundColor: (!customStart || !customEnd) ? '#9ca3af' : '#1e40af',
                    color: 'white',
                    cursor: (!customStart || !customEnd) ? 'not-allowed' : 'pointer'
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