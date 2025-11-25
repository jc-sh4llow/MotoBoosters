import { FaHome, FaGripLinesVertical, FaBars, FaWarehouse, FaTag, FaWrench, FaFileInvoice, FaPlus, FaUser, FaSearch, FaTimes, FaChevronDown, FaFilter, FaUndoAlt, FaCog } from 'react-icons/fa';

import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Footer } from '@/components/Footer';
import { collection, doc, addDoc, getDocs, updateDoc, deleteDoc, query, where, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import logo from '../../assets/logo.png';
import { can } from '../../config/permissions';

export function Inventory() {
  // Sample data - replace with actual data from your backend
  const inventoryItems = [];

  const getRemainingStock = (item: any) => item.availableStock;

  const getStatus = (item: typeof inventoryItems[0]) => {
    const remaining = item.availableStock - item.sold;

    if (remaining <= 0) return 'Out of Stock';
    if (remaining < 10) return 'Restock';
    return 'In Stock';
  };

  const computeStatusFromStock = (availableStock: number, restockLevel: number) => {
    if (availableStock <= 0) return 'Out of Stock';
    if (availableStock <= restockLevel) return 'Restock';
    return 'In Stock';
  };

  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const currentRole = (user?.role || '').toString();
  const canEditInventory = can(currentRole, 'inventory.add');

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

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  let closeMenuTimeout: number | undefined;

  const [isInventorySettingsOpen, setIsInventorySettingsOpen] = useState(false);
  const [isCompactTable, setIsCompactTable] = useState(window.innerWidth < 1200);

  // Persist inline remarks edits for a given inventory row to Firestore
  const handlePersistRemarks = async (item: any) => {
    try {
      const docId = item.docId as string | undefined;
      if (!docId) return;

      const latestValue = tableRemarks[item.itemId] ?? item.remarks ?? '';
      const trimmed = (latestValue ?? '').toString();

      await updateDoc(doc(inventoryCollection, docId), {
        remarks: trimmed,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error saving inventory remarks to Firestore', err);
    }
  };

  const [itemDetailsRequired, setItemDetailsRequired] = useState({
    itemId: true,
    brand: true,
    itemName: true,
    itemType: true,
    purchasePrice: true,
    sellingPrice: true,
    addedStock: true,
    restockLevel: true,
  });

  const [modalState, setModalState] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'info' | 'error' | 'confirm';
    onConfirm?: () => void | Promise<void>;
  }>({
    open: false,
    title: '',
    message: '',
    variant: 'info',
  });

  // Generate the next itemIdIncrement for a given type/brand based on existing docs
  const getNextItemIncrement = async (itemType: string, brand: string): Promise<number> => {
    // Use the same ID pattern as computeItemIdPreview, but only take the prefix (e.g. OIL-BRE-)
    const prefix = computeItemIdPreview(itemType, brand, 1).slice(0, 7);

    const snap = await getDocs(
      query(inventoryCollection, where('itemIdPrefix', '==', prefix))
    );

    let maxInc = 0;
    snap.forEach(docSnap => {
      const data = docSnap.data() as any;
      const inc = Number(data.itemIdIncrement ?? 0);
      if (!Number.isNaN(inc) && inc > maxInc) {
        maxInc = inc;
      }
    });

    return maxInc + 1;
  };

  // Inventory data sources
  const [items] = useState(inventoryItems); // keep sample data as fallback for table
  const [firestoreItems, setFirestoreItems] = useState<any[]>([]);

  // Lookup data for Brand / Type dropdowns (will later load from Firestore)
  const [brands, setBrands] = useState<string[]>([]);
  const [itemTypes, setItemTypes] = useState<string[]>([]);

  // UI state
  const [isItemDetailsExpanded, setIsItemDetailsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [isCompactSearchOpen, setIsCompactSearchOpen] = useState(false);

  const isSmallDesktop = !isMobile && isCompactTable;

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;


      setIsMobile(mobile);
      setIsCompactTable(width < 1200);
    };

    // run once on mount to set initial state correctly
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const menuItems = [
    { title: 'Sales Records', path: '/sales', icon: <FaTag /> },
    { title: 'Services Offered', path: '/services', icon: <FaWrench /> },
    { title: 'New Transaction', path: '/transactions/new', icon: <FaPlus /> },
    { title: 'Transaction History', path: '/transactions', icon: <FaFileInvoice /> },
    { title: 'Customers', path: '/customers', icon: <FaUser /> },
    { title: 'User Management', path: '/users', icon: <FaUser /> },
    { title: 'Returns & Refunds', path: '/returns', icon: <FaUndoAlt /> },
    { title: 'Settings', path: '/settings', icon: <FaCog /> },
  ];

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    sortBy: '', // 'price-asc', 'price-desc'
    brand: '',
    type: '',
    status: ''
  });

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const [newItem, setNewItem] = useState({
    id: '',
    brand: '',
    customBrand: '',
    itemName: '',
    type: '',
    customType: '',
    purchasePrice: '',
    sellingPrice: '',
    stockQuantity: '',
    status: 'in-stock' // default status
  });

  const isAnyFilterActive = () => {
    return Object.values(filters).some(value => value !== '');
  };

  const [selectedInventoryItem, setSelectedInventoryItem] = useState<typeof inventoryItems[0] | null>(null);

  const [formItem, setFormItem] = useState({
    id: '',
    brand: '',
    itemName: '',
    type: '',
    purchasePrice: '',
    sellingPrice: '',
    stockQuantity: '',
    restockLevel: '',
    remarks: '',
    discount: '',
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Item Details mode: false = view, true = edit
  const [isEditMode, setIsEditMode] = useState(false);

  // Inline table-only fields (not saved to Firestore): remarks & discount per itemId
  const [tableRemarks, setTableRemarks] = useState<Record<string, string>>({});
  const [tableDiscounts, setTableDiscounts] = useState<Record<string, string>>({});
  const [tableDiscountErrors, setTableDiscountErrors] = useState<Record<string, string>>({});

  // Generated Item ID preview (e.g. OIL-HON-001)
  const [generatedItemId, setGeneratedItemId] = useState('');

  const computeItemIdPreview = (type: string, brand: string, increment: number = 1) => {
    const normalize = (value: string) =>
      (value || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');

    const typeCode = normalize(type).slice(0, 3) || 'ITE';
    const brandCode = normalize(brand).slice(0, 3) || 'BRA';
    const incStr = increment.toString().padStart(3, '0');
    return `${typeCode}-${brandCode}-${incStr}`;
  };

  // Keep Item ID preview in sync with current form brand/type
  useEffect(() => {
    const effectiveBrand = newItem.brand === 'other' ? newItem.customBrand : newItem.brand;
    const effectiveType = newItem.type === 'other' ? newItem.customType : newItem.type;
    const preview = computeItemIdPreview(effectiveType, effectiveBrand, 1);
    setGeneratedItemId(preview);
  }, [newItem.brand, newItem.customBrand, newItem.type, newItem.customType]);

  // Firestore collection refs
  const inventoryCollection = collection(db, 'inventory');
  const brandsCollection = collection(db, 'brands');
  const itemTypesCollection = collection(db, 'itemTypes');

  // Helper to load brands and item types from Firestore for dropdowns
  const loadMeta = async () => {
    try {
      const [brandsSnap, typesSnap] = await Promise.all([
        getDocs(brandsCollection),
        getDocs(itemTypesCollection),
      ]);

      const loadedBrands = brandsSnap.docs.map(d => {
        const data = d.data() as any;
        return (data.name as string) || (data.nameLower as string) || d.id;
      });

      const loadedTypes = typesSnap.docs.map(d => {
        const data = d.data() as any;
        return (data.name as string) || (data.nameLower as string) || d.id;
      });

      setBrands(loadedBrands);
      setItemTypes(loadedTypes);
    } catch (err) {
      console.error('Error loading brands/types from Firestore', err);
    }
  };

  // Helper to load inventory items for the Current Inventory table
  const loadInventory = async () => {
    try {
      const snapshot = await getDocs(inventoryCollection);
      const loaded: any[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as any;
        loaded.push({
          docId: docSnap.id,
          itemId: (data.itemId ?? docSnap.id).toString(),
          brand: (data.brand ?? '').toString(),
          itemName: (data.itemName ?? '').toString(),
          type: (data.itemType ?? '').toString(),
          purchasePrice: Number(data.purchasePrice ?? 0),
          sellingPrice: Number(data.sellingPrice ?? 0),
          availableStock: Number(data.availableStock ?? 0),
          restockLevel: Number(data.restockLevel ?? 0),
          status: (data.status ?? '').toString(),
          remarks: (data.remarks ?? '').toString(),
          sold: Number(data.sold ?? 0),
          defaultDiscount: (data.defaultDiscount ?? '').toString(),
        });
      });

      setFirestoreItems(loaded);
    } catch (err) {
      console.error('Error loading inventory table from Firestore', err);
    }
  };

  // Load dropdown data and inventory table data on first render
  useEffect(() => {
    loadMeta();
    loadInventory();
  }, []);

  const handleSaveItem = async () => {
    if (!canEditInventory) return;

    const isEditingExisting = !!(selectedInventoryItem as any)?.docId;

    // Apply settings only for new items
    if (!isEditingExisting) {
      if (itemDetailsRequired.itemName && !formItem.itemName.trim()) {
        setModalState({
          open: true,
          title: 'Missing Required Field',
          message: 'Item Name is required.',
          variant: 'error',
        });
        return;
      }

      if (itemDetailsRequired.brand && !newItem.brand.trim()) {
        setModalState({
          open: true,
          title: 'Missing Required Field',
          message: 'Brand is required.',
          variant: 'error',
        });
        return;
      }

      if (itemDetailsRequired.itemType && !newItem.type.trim()) {
        setModalState({
          open: true,
          title: 'Missing Required Field',
          message: 'Item Type is required.',
          variant: 'error',
        });
        return;
      }

      if (itemDetailsRequired.purchasePrice && Number(formItem.purchasePrice) <= 0) {
        setModalState({
          open: true,
          title: 'Missing Required Field',
          message: 'Purchase Price is required for new items.',
          variant: 'error',
        });
        return;
      }

      if (itemDetailsRequired.sellingPrice && Number(formItem.sellingPrice) <= 0) {
        setModalState({
          open: true,
          title: 'Missing Required Field',
          message: 'Selling Price is required for new items.',
          variant: 'error',
        });
        return;
      }

      if (itemDetailsRequired.addedStock && Number(formItem.stockQuantity) <= 0) {
        setModalState({
          open: true,
          title: 'Missing Required Field',
          message: 'Added Stock is required for new items.',
          variant: 'error',
        });
        return;
      }

      if (itemDetailsRequired.restockLevel && Number(formItem.restockLevel) <= 0) {
        setModalState({
          open: true,
          title: 'Missing Required Field',
          message: 'Restock Level is required for new items.',
          variant: 'error',
        });
        return;
      }
    }

    const effectiveBrand = newItem.brand === 'other'
      ? (newItem.customBrand || '').trim()
      : (newItem.brand || '').trim();
    const effectiveType = newItem.type === 'other'
      ? (newItem.customType || '').trim()
      : (newItem.type || '').trim();

    const purchasePrice = Number(formItem.purchasePrice) || 0;
    const sellingPrice = Number(formItem.sellingPrice) || 0;
    const addedStock = Number(formItem.stockQuantity) || 0;
    const restockLevel = Number(formItem.restockLevel) || 0;

    let profitMarginPercent = 0;
    if (purchasePrice > 0) {
      const profit = sellingPrice - purchasePrice;
      profitMarginPercent = (profit / purchasePrice) * 100;
    }

    const saveMetaIfNew = async () => {
      const lowerBrand = effectiveBrand.toLowerCase();
      const lowerType = effectiveType.toLowerCase();

      if (lowerBrand) {
        const brandSnap = await getDocs(query(brandsCollection, where('nameLower', '==', lowerBrand)));
        if (brandSnap.empty) {
          await addDoc(brandsCollection, { name: effectiveBrand, nameLower: lowerBrand });
        }
      }

      if (lowerType) {
        const typeSnap = await getDocs(query(itemTypesCollection, where('nameLower', '==', lowerType)));
        if (typeSnap.empty) {
          await addDoc(itemTypesCollection, { name: effectiveType, nameLower: lowerType });
        }
      }
    };

    await saveMetaIfNew();

    try {
      if (!isEditingExisting) {
        // New item
        const increment = await getNextItemIncrement(effectiveType, effectiveBrand);
        const itemId = computeItemIdPreview(effectiveType, effectiveBrand, increment);
        const availableStock = addedStock;
        const status = computeStatusFromStock(availableStock, restockLevel);

        await addDoc(inventoryCollection, {
          itemId,
          itemIdPrefix: itemId.slice(0, 7),
          itemIdIncrement: increment,
          brand: effectiveBrand,
          itemName: formItem.itemName.trim(),
          itemType: effectiveType,
          purchasePrice,
          sellingPrice,
          profitMarginPercent,
          availableStock,
          restockLevel,
          status,
          defaultDiscount: formItem.discount?.trim() || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        setModalState({
          open: true,
          title: 'Item Saved',
          message: 'New inventory item added.',
          variant: 'info',
        });
      } else {
        // Existing item - update
        const docId = (selectedInventoryItem as any).docId as string;
        const itemRef = doc(inventoryCollection, docId);
        const snap = await getDoc(itemRef);
        if (!snap.exists()) {
          setModalState({
            open: true,
            title: 'Item Not Found',
            message: 'Item no longer exists in the database.',
            variant: 'error',
          });
          return;
        }
        const data = snap.data() as any;
        const currentAvailable = Number(data.availableStock ?? 0);
        const availableStock = currentAvailable + addedStock;
        const status = computeStatusFromStock(availableStock, restockLevel);

        await updateDoc(itemRef, {
          brand: effectiveBrand,
          itemName: formItem.itemName.trim(),
          itemType: effectiveType,
          purchasePrice,
          sellingPrice,
          profitMarginPercent,
          availableStock,
          restockLevel,
          status,
          defaultDiscount: formItem.discount?.trim() || null,
          updatedAt: new Date().toISOString(),
        });

        setModalState({
          open: true,
          title: 'Item Updated',
          message: 'Inventory item updated.',
          variant: 'info',
        });
      }

      // Refresh brand/type dropdowns and inventory table so newly added values appear without reload
      await loadMeta();
      await loadInventory();

      setHasUnsavedChanges(false);
      setFormItem(prev => ({ ...prev, stockQuantity: '' }));
    } catch (err) {
      console.error('Error saving inventory item', err);
      setModalState({
        open: true,
        title: 'Save Failed',
        message: 'There was an error saving the item. Please try again.',
        variant: 'error',
      });
    }
  };

  const handleDeleteItem = async () => {
    if (!canEditInventory) return;

    if (!(selectedInventoryItem as any)?.docId) {
      setModalState({
        open: true,
        title: 'Delete Item',
        message: 'No saved item selected to delete.',
        variant: 'error',
      });
      return;
    }

    const docId = (selectedInventoryItem as any).docId as string;

    setModalState({
      open: true,
      title: 'Delete Item',
      message: 'Are you sure you want to delete this item?',
      variant: 'confirm',
      onConfirm: async () => {
        const itemRef = doc(inventoryCollection, docId);
        try {
          await deleteDoc(itemRef);
          await loadInventory();

          setModalState({
            open: true,
            title: 'Item Deleted',
            message: 'Inventory item deleted.',
            variant: 'info',
          });

          setSelectedInventoryItem(null);
          setFormItem({
            id: '',
            brand: '',
            itemName: '',
            type: '',
            purchasePrice: '',
            sellingPrice: '',
            stockQuantity: '',
            restockLevel: '',
            remarks: '',
            discount: '',
          });
          setHasUnsavedChanges(false);
        } catch (err) {
          console.error('Error deleting inventory item', err);
          setModalState({
            open: true,
            title: 'Delete Failed',
            message: 'There was an error deleting the item. Please try again.',
            variant: 'error',
          });
        }
      },
    });
  };

  // Derived profit margin for display
  const purchasePriceNum = Number(formItem.purchasePrice) || 0;
  const sellingPriceNum = Number(formItem.sellingPrice) || 0;
  const profitMarginDisplay =
    purchasePriceNum > 0
      ? (((sellingPriceNum - purchasePriceNum) / purchasePriceNum) * 100).toFixed(2)
      : '0.00';

  const closeModal = () => {
    setModalState(prev => ({ ...prev, open: false, onConfirm: undefined }));
  };

  const renderModal = () => {
    if (!modalState.open) return null;

    const isConfirm = modalState.variant === 'confirm' && modalState.onConfirm;

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}
      >
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 1.75rem',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 10px 40px rgba(15, 23, 42, 0.25)',
            border: '1px solid #e5e7eb',
          }}
        >
          <h2
            style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              margin: 0,
              marginBottom: '0.75rem',
              color: modalState.variant === 'error' ? '#b91c1c' : '#111827',
            }}
          >
            {modalState.title}
          </h2>
          <p
            style={{
              fontSize: '0.9rem',
              color: '#4b5563',
              marginBottom: '1.25rem',
            }}
          >
            {modalState.message}
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: isConfirm ? 'flex-end' : 'center',
              gap: '0.75rem',
            }}
          >
            {isConfirm && (
              <button
                type="button"
                onClick={closeModal}
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                if (isConfirm && modalState.onConfirm) {
                  // Close current confirm before running action to avoid double modals stacking
                  closeModal();
                  await modalState.onConfirm();
                } else {
                  closeModal();
                }
              }}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor:
                  modalState.variant === 'error'
                    ? '#dc2626'
                    : modalState.variant === 'confirm'
                      ? '#dc2626'
                      : '#2563eb',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {isConfirm ? 'Delete' : 'OK'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: 'linear-gradient(109deg, #1e88e5 0%, #1e88e5 50%, #0d47a1 50%, #0d47a1 100%)',
      backgroundSize: 'cover',
      backgroundAttachment: 'fixed'
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
        maxWidth: '1600px',
        margin: '0 auto',
        width: '100%',
        zIndex: 5,
        padding: '1.5rem 1.5rem 2rem 1.5rem',
        flex: 1
      }}>
        <header style={{
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '1rem 2.25rem',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          marginBottom: '1.25rem',
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                <h1 style={{
                  fontSize: '1.875rem',
                  fontWeight: 'bold',
                  color: 'white',
                  margin: 0,
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}>
                  Inventory
                </h1>
                <span style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: '0.9rem'
                }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
              </div>
            </div>

            {/* Center/right: Search bar (desktop) or icon (small desktop) */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                marginLeft: 'auto',
                marginRight: '1rem',
              }}
            >
              {isSmallDesktop ? (
                <>
                  {/* Compact search icon button */}
                  <button
                    type="button"
                    onClick={() => setIsCompactSearchOpen(prev => !prev)}
                    style={{
                      width: '2.25rem',
                      height: '2.25rem',
                      borderRadius: '9999px',
                      border: '1px solid rgba(255, 255, 255, 0.6)',
                      backgroundColor: 'white',              // white circle
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    }}
                  >
                    <FaSearch style={{ color: '#1f2937', fontSize: '0.95rem' }} />
                  </button>

                  {/* Compact search popup (right-aligned, below the button) */}
                  {isCompactSearchOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '2.75rem',
                        right: 0,
                        backgroundColor: 'white',
                        borderRadius: '0.5rem',
                        padding: isCompactSearchOpen ? '0.5rem 0.75rem' : '0 0.75rem',
                        boxShadow: '0 8px 20px rgba(15, 23, 42, 0.25)',
                        border: '1px solid #e5e7eb',
                        zIndex: 120,
                        minWidth: '260px',

                        // animation bits:
                        opacity: isCompactSearchOpen ? 1 : 0,
                        transform: isCompactSearchOpen ? 'translateY(0)' : 'translateY(-8px)',
                        maxHeight: isCompactSearchOpen ? '80px' : '0px',
                        pointerEvents: isCompactSearchOpen ? 'auto' : 'none',
                        overflow: 'hidden',
                        transition: 'opacity 0.18s ease-out, transform 0.18s ease-out, max-height 0.18s ease-out, padding 0.18s ease-out',
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        <FaSearch
                          style={{
                            position: 'absolute',
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#9ca3af',
                            fontSize: '0.9rem',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Search by Brand or Item Name..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          autoFocus={isCompactSearchOpen}
                          style={{
                            width: '100%',
                            padding: '0.45rem 2.1rem 0.45rem 2.1rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#1f2937',
                            fontSize: '0.9rem',
                            outline: 'none',
                          }}
                        />
                        {searchTerm && (
                          <button
                            type="button"
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
                              padding: '2px',
                            }}
                          >
                            <FaTimes size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Original full search bar for normal desktop & other sizes */}
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
                    placeholder="Search by Brand or Item Name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      padding: '0.5rem 2.5rem 0.5rem 2.5rem',
                      borderRadius: '0.5rem',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      backgroundColor: 'rgba(255, 255, 255)',
                      color: '#1f2937',
                      width: '350px',
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
                </>
              )}
            </div>
            {/* Right: Logout + Navbar Toggle Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                  <FaWarehouse />
                </span>
                <span>Inventory</span>
              </button>
            </div>
          </div>
        </header>

        <main>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.65)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Item Details Section */}
            <section style={{ marginBottom: '2rem' }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                marginBottom: '1.5rem',
                overflow: 'hidden'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.5rem',
                  borderBottom: isItemDetailsExpanded ? '1px solid #e5e7eb' : 'none',
                  backgroundColor: 'white'
                }}>
                  <button
                    onClick={() => {
                      const next = !isItemDetailsExpanded;
                      setIsItemDetailsExpanded(next);

                      // When collapsing, reset all Item Details fields to defaults and return to view mode
                      if (!next) {
                        setSelectedInventoryItem(null);
                        setFormItem({
                          id: '',
                          brand: '',
                          itemName: '',
                          type: '',
                          purchasePrice: '',
                          sellingPrice: '',
                          stockQuantity: '',
                          restockLevel: '',
                          remarks: '',
                          discount: '',
                        });
                        setNewItem({
                          id: '',
                          brand: '',
                          customBrand: '',
                          itemName: '',
                          type: '',
                          customType: '',
                          purchasePrice: '',
                          sellingPrice: '',
                          stockQuantity: '',
                          status: 'in-stock'
                        });
                        setHasUnsavedChanges(false);
                        setIsEditMode(false);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flex: 1,
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '1.125rem',
                      fontWeight: '600',
                      color: '#1e40af'
                    }}
                  >
                    <span>Item Details</span>
                    <span style={{
                      transition: 'transform 0.2s ease',
                      transform: isItemDetailsExpanded ? 'rotate(-360deg)' : 'rotate(0)'
                    }}>
                      <FaChevronDown style={{
                        transition: 'transform 0.2s ease',
                        transform: isItemDetailsExpanded ? 'rotate(180deg)' : 'rotate(0)',
                        fontSize: '0.8em',
                        marginLeft: '0.5rem'
                      }} />
                    </span>
                  </button>

                  {/* New Item button */}
                  {canEditInventory && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInventoryItem(null);
                        setFormItem({
                          id: '',
                          brand: '',
                          itemName: '',
                          type: '',
                          purchasePrice: '',
                          sellingPrice: '',
                          stockQuantity: '',
                          restockLevel: '',
                          remarks: '',
                          discount: '',
                        });
                        setNewItem({
                          id: '',
                          brand: '',
                          customBrand: '',
                          itemName: '',
                          type: '',
                          customType: '',
                          purchasePrice: '',
                          sellingPrice: '',
                          stockQuantity: '',
                          status: 'in-stock'
                        });
                        setHasUnsavedChanges(false);
                        setIsItemDetailsExpanded(true);
                        setIsEditMode(true); // New item starts in edit mode
                      }}
                      style={{
                        marginLeft: '1rem',
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
                      New Item
                    </button>
                  )}
                </div>

                <div style={{
                  maxHeight: isItemDetailsExpanded ? '2000px' : '0',
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease-out',
                  padding: isItemDetailsExpanded ? '1.5rem' : '0 1.5rem',
                  backgroundColor: 'white'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    {/* Left Column - Keep all your existing input fields here */}
                    <div>
                      {/* Item ID */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          Item ID
                        </label>
                        <input
                          type="text"
                          value={generatedItemId || 'Auto-generated'}
                          disabled
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#6b7280'
                          }}
                        />
                      </div>

                      {/* Brand */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>
                          Brand *
                        </label>
                        <select
                          value={newItem.brand}
                          onChange={(e) => setNewItem({ ...newItem, brand: e.target.value })}
                          disabled={!canEditInventory}

                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">Select or enter a brand</option>
                          {brands.map(brand => (
                            <option key={brand} value={brand}>{brand}</option>
                          ))}
                          <option value="other">Other (specify)</option>
                        </select>

                        {/* Show this input if "Other" is selected */}
                        {newItem.brand === 'other' && (
                          <input
                            type="text"
                            value={newItem.customBrand || ''}
                            onChange={(e) => setNewItem({ ...newItem, customBrand: e.target.value })}
                            placeholder="Enter brand name"
                            style={{
                              width: '100%',
                              marginTop: '2.95rem',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: 'white',
                              color: '#111827'
                            }}
                            disabled={!canEditInventory}
                          />
                        )}
                      </div>

                      {/* Item Name */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          Item Name *
                        </label>
                        <input
                          type="text"
                          placeholder="Enter item name"
                          value={formItem.itemName}
                          onChange={(e) => {
                            setFormItem(prev => ({ ...prev, itemName: e.target.value }));
                            setHasUnsavedChanges(true);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827'
                          }}
                          disabled={!isEditMode || !canEditInventory}
                        />
                      </div>

                      {/* Item Type */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          Item Type *
                        </label>
                        <select
                          value={newItem.type}
                          onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                          disabled={!canEditInventory}

                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">Select or enter an item type</option>
                          {itemTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                          <option value="other">Other (specify)</option>
                        </select>

                        {/* Show this input if "Other" is selected */}
                        {newItem.type === 'other' && (
                          <input
                            type="text"
                            value={newItem.customType || ''}
                            onChange={(e) => setNewItem({ ...newItem, customType: e.target.value })}
                            placeholder="Enter custom type"
                            style={{
                              width: '100%',
                              marginTop: '2.95rem',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: 'white',
                              color: '#111827'
                            }}
                            disabled={!canEditInventory}
                          />
                        )}
                      </div>
                    </div>

                    {/* Right Column - Keep all your existing input fields here */}
                    <div>
                      {/* Purchase Price */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          Purchase Price (₱) *
                        </label>
                        <input
                          type="number"
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          value={formItem.purchasePrice}
                          onChange={(e) => {
                            setFormItem(prev => ({ ...prev, purchasePrice: e.target.value }));
                            setHasUnsavedChanges(true);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827'
                          }}
                          disabled={!isEditMode || !canEditInventory}
                        />
                      </div>

                      {/* Selling Price */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          Selling Price (₱) *
                        </label>
                        <input
                          type="number"
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          value={formItem.sellingPrice}
                          onChange={(e) => {
                            setFormItem(prev => ({ ...prev, sellingPrice: e.target.value }));
                            setHasUnsavedChanges(true);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827'
                          }}
                          disabled={!isEditMode || !canEditInventory}
                        />
                      </div>

                      {/* Profit Margin */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          Profit Margin
                        </label>
                        <div style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          backgroundColor: '#f9fafb',
                          color: '#6b7280'
                        }}>
                          {profitMarginDisplay}%
                        </div>
                      </div>

                      {/* Stock Quantity / Added Stock */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          {isEditMode ? 'Added Stock *' : 'Available Stock'}
                        </label>
                        <input
                          type="number"
                          placeholder="0"
                          min="0"
                          value={isEditMode
                            ? formItem.stockQuantity
                            : String((selectedInventoryItem as any)?.availableStock ?? 0)}
                          onChange={(e) => {
                            setFormItem(prev => ({ ...prev, stockQuantity: e.target.value }));
                            setHasUnsavedChanges(true);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827'
                          }}
                          disabled={!isEditMode || !canEditInventory}
                        />
                      </div>

                      {/* Restock Level */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          Restock Level *
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 10"
                          value={formItem.restockLevel}
                          onChange={(e) => {
                            setFormItem(prev => ({ ...prev, restockLevel: e.target.value }));
                            setHasUnsavedChanges(true);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827'
                          }}
                          disabled={!isEditMode || !canEditInventory}
                        />
                      </div>

                      {/* Discount */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          Discount
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 50 or 10%"
                          value={formItem.discount}
                          onChange={(e) => {
                            setFormItem(prev => ({ ...prev, discount: e.target.value }));
                            setHasUnsavedChanges(true);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827'
                          }}
                          disabled={!isEditMode || !canEditInventory}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Form Actions */}
                  {canEditInventory && (
                    <div style={{
                      display: 'flex',
                      gap: '0.75rem', // Add some gap between buttons
                      marginTop: '1.5rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid #e5e7eb'
                    }}>
                      {isEditMode ? (
                        <>
                          {/* Save Button - Left */}
                          <button
                            type="button"
                            onClick={handleSaveItem}
                            style={{
                              flex: 1,
                              padding: '0.5rem 1.5rem',
                              backgroundColor: '#1d4ed8',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              fontWeight: '500',
                              cursor: 'pointer'
                            }}
                          >
                            Save Item
                          </button>

                          {/* Cancel Button - Middle */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInventoryItem(null);
                              setFormItem({
                                id: '',
                                brand: '',
                                itemName: '',
                                type: '',
                                purchasePrice: '',
                                sellingPrice: '',
                                stockQuantity: '',
                                restockLevel: '',
                                remarks: '',
                                discount: '',
                              });
                              setHasUnsavedChanges(false);
                              setIsEditMode(false);
                              setIsItemDetailsExpanded(false);
                            }}
                            style={{
                              flex: 1,
                              padding: '0.5rem 1.5rem',
                              backgroundColor: 'white',
                              color: '#4b5563',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              fontWeight: '500',
                              cursor: 'pointer',
                              textAlign: 'center'
                            }}
                          >
                            Cancel
                          </button>

                          {/* Delete Button - Right */}
                          <button
                            type="button"
                            onClick={handleDeleteItem}
                            style={{
                              flex: 1,
                              padding: '0.5rem 1.5rem',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: '0.375rem',
                              fontWeight: '500',
                              cursor: 'pointer',
                              textAlign: 'center'
                            }}
                          >
                            Delete Item
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Edit Button - Left */}
                          <button
                            type="button"
                            onClick={() => setIsEditMode(true)}
                            style={{
                              flex: 1,
                              padding: '0.5rem 1.5rem',
                              backgroundColor: '#1d4ed8',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              fontWeight: '500',
                              cursor: 'pointer'
                            }}
                          >
                            Edit Item
                          </button>

                          {/* Cancel Button - Middle */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInventoryItem(null);
                              setFormItem({
                                id: '',
                                brand: '',
                                itemName: '',
                                type: '',
                                purchasePrice: '',
                                sellingPrice: '',
                                stockQuantity: '',
                                restockLevel: '',
                                remarks: '',
                                discount: '',
                              });
                              setHasUnsavedChanges(false);
                              setIsEditMode(false);
                              setIsItemDetailsExpanded(false);
                            }}
                            style={{
                              flex: 1,
                              padding: '0.5rem 1.5rem',
                              backgroundColor: 'white',
                              color: '#4b5563',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              fontWeight: '500',
                              cursor: 'pointer',
                              textAlign: 'center'
                            }}
                          >
                            Cancel
                          </button>

                          {/* Delete Button - Right */}
                          <button
                            type="button"
                            onClick={handleDeleteItem}
                            style={{
                              flex: 1,
                              padding: '0.5rem 1.5rem',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: '0.375rem',
                              fontWeight: '500',
                              cursor: 'pointer',
                              textAlign: 'center'
                            }}
                          >
                            Delete Item
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* System Users Section */}
            <section>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                padding: '1.5rem',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                marginTop: '1.5rem'
              }}>
                <h2 style={{
                  color: '#111827',
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  marginBottom: '1.5rem',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid #e5e7eb',
                  color: '#1e40af'
                }}>
                  Current Inventory
                </h2>

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
                        flex: 1, // This will make it take up half the space
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center', // Center the content
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
                        setFilters({
                          minPrice: '',
                          maxPrice: '',
                          sortBy: '',
                          brand: '',
                          type: '',
                          status: ''
                        });
                      }}
                      disabled={!isAnyFilterActive()}
                      style={{
                        flex: 1, // This will make it take up the other half
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center', // Center the content
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        backgroundColor: isAnyFilterActive() ? '#6b7280' : '#e5e7eb',
                        color: isAnyFilterActive() ? 'white' : '#9ca3af',
                        border: 'none',
                        cursor: isAnyFilterActive() ? 'pointer' : 'not-allowed',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        transition: 'all 0.2s',
                        height: '40px',
                        opacity: isAnyFilterActive() ? 1 : 0.7
                      }}
                      onMouseOver={(e) => {
                        if (isAnyFilterActive()) {
                          e.currentTarget.style.backgroundColor = '#4b5563';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (isAnyFilterActive()) {
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
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>
                          Price Range
                        </label>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          height: '40px' // Match the height of other form controls
                        }}>
                          <input
                            type="number"
                            name="minPrice"
                            value={filters.minPrice}
                            onChange={handleFilterChange}
                            style={{
                              width: '100%',
                              padding: '0.5rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: 'white',
                              color: '#111827',
                              textAlign: 'center',
                              height: '100%', // Make input take full height
                              boxSizing: 'border-box' // Ensure padding is included in height
                            }}
                            placeholder="Min"
                          />
                          <span style={{ color: 'rgb(75, 85, 99)' }}>-</span>
                          <input
                            type="number"
                            name="maxPrice"
                            value={filters.maxPrice}
                            onChange={handleFilterChange}
                            style={{
                              width: '100%',
                              padding: '0.5rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: 'white',
                              color: '#111827',
                              textAlign: 'center',
                              height: '100%', // Make input take full height
                              boxSizing: 'border-box' // Ensure padding is included in height
                            }}
                            placeholder="Max"
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>Sort By</label>
                        <select
                          name="sortBy"
                          value={filters.sortBy}
                          onChange={handleFilterChange}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}
                        >
                          <option value="">None</option>
                          <option value="price-asc">Price: Low to High</option>
                          <option value="price-desc">Price: High to Low</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>Brand</label>
                        <select
                          name="brand"
                          value={filters.brand}
                          onChange={handleFilterChange}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}
                        >
                          <option value="">All Brands</option>
                          {/* Map through your unique brands here */}
                          {Array.from(new Set(inventoryItems.map(item => item.brand))).map(brand => (
                            <option key={brand} value={brand}>{brand}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>Type</label>
                        <select
                          name="type"
                          value={filters.type}
                          onChange={handleFilterChange}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}
                        >
                          <option value="">All Types</option>
                          {Array.from(new Set(inventoryItems.map(item => item.type))).map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'rgb(75, 85, 99)' }}>Status</label>
                        <select
                          name="status"
                          value={filters.status}
                          onChange={handleFilterChange}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}
                        >
                          <option value="">All Status</option>
                          <option value="in-stock">In Stock</option>
                          <option value="restock">Restock</option>
                          <option value="out-of-stock">Out of Stock</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Your existing table component goes here */}
                <div style={{ overflowX: 'auto' }}>
                  <div style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    overflow: 'hidden'
                  }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        color: '#1e293b' // Dark text color
                      }}>
                        <thead>
                          {isCompactTable ? (
                            <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: '#4b5563' }}>
                              <th style={{ padding: '0.75rem 1.5rem' }}>ITEM</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>SELLING PRICE</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>STATUS</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>DISCOUNT</th>
                              <th style={{ padding: '0.75rem 1.5rem' }}>REMARKS</th>
                            </tr>
                          ) : (
                            <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: '#4b5563' }}>
                              <th style={{ padding: '0.75rem 1.5rem' }}>BRAND</th>
                              <th style={{ padding: '0.75rem 1.5rem' }}>ITEM NAME</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>TYPE</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>PURCHASE PRICE</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>SELLING PRICE</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>AVAILABLE STOCK</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>NO. SOLD</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>STATUS</th>
                              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>DISCOUNT</th>
                              <th style={{ padding: '0.75rem 1.5rem' }}>REMARKS</th>
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          {(firestoreItems.length ? firestoreItems : inventoryItems).map((item: any, index: number) => {
                            const available = Number(item.availableStock ?? 0);
                            const restockLevel = Number(item.restockLevel ?? 0);
                            const status = firestoreItems.length
                              ? computeStatusFromStock(available, restockLevel)
                              : getStatus(item as any);
                            const statusStyles = {
                              'In Stock': { color: '#166534', bg: '#dcfce7' },
                              'Restock': { color: '#9a3412', bg: '#ffedd5' },
                              'Out of Stock': { color: '#991b1b', bg: '#fee2e2' }
                            }[status] || { color: '#4b5563', bg: '#e5e7eb' };

                            return (
                              <tr
                                key={item.docId ?? item.id ?? index}
                                style={{
                                  borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                                  transition: 'background-color 0.2s',
                                  backgroundColor: 'white',
                                  color: '#1f2937'
                                }}
                                onMouseOver={e => {
                                  e.currentTarget.style.backgroundColor = '#f0f0f0';
                                }}
                                onMouseOut={e => {
                                  e.currentTarget.style.backgroundColor = 'white';
                                }}
                                onClick={() => {
                                  setSelectedInventoryItem(item);
                                  setFormItem({
                                    id: (item.itemId ?? item.id ?? '').toString(),
                                    brand: item.brand ?? '',
                                    itemName: item.itemName ?? '',
                                    type: item.type ?? item.itemType ?? '',
                                    purchasePrice: String(item.purchasePrice ?? 0),
                                    sellingPrice: String(item.sellingPrice ?? 0),
                                    // When editing, treat Added Stock as 0 by default so we don't accidentally add stock
                                    stockQuantity: '0',
                                    restockLevel: String(item.restockLevel ?? 0),
                                    remarks: item.remarks ?? '',
                                    discount: item.defaultDiscount ?? '',
                                  });

                                  // Keep Brand and Item Type dropdowns in sync with selected row
                                  setNewItem(prev => ({
                                    ...prev,
                                    brand: item.brand ?? '',
                                    customBrand: '',
                                    type: item.type ?? item.itemType ?? '',
                                    customType: '',
                                  }));

                                  setIsItemDetailsExpanded(true);
                                  setHasUnsavedChanges(false);
                                }}
                              >
                                {isCompactTable ? (
                                  <>
                                    {/* ITEM */}
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                      <div style={{ fontWeight: 500 }}>{item.itemName}</div>

                                      {(item.type || item.itemType || item.brand) && (
                                        <div
                                          style={{
                                            fontSize: '0.8rem',
                                            color: '#6b7280',
                                            marginTop: '0.15rem',
                                          }}
                                        >
                                          {item.type || item.itemType
                                            ? `[${item.type || item.itemType}]`
                                            : null}
                                          {(item.type || item.itemType) && item.brand ? ' - ' : ''}
                                          {item.brand || ''}
                                        </div>
                                      )}
                                    </td>

                                    {/* SELLING PRICE + purchase subtext (RCAB) */}
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                      <div>₱{Number(item.sellingPrice ?? 0).toFixed(2)}</div>
                                      {canEditInventory && (
                                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.15rem' }}>
                                          Purchase: ₱{Number(item.purchasePrice ?? 0).toFixed(2)}
                                        </div>
                                      )}
                                    </td>

                                    {/* STATUS + stock subtext */}
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                      <span style={{
                                        display: 'inline-block',
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        backgroundColor: statusStyles.bg,
                                        color: statusStyles.color,
                                      }}>
                                        {status}
                                      </span>
                                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.15rem' }}>
                                        Stock: {available}
                                      </div>
                                    </td>

                                    {/* DISCOUNT */}
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                      {item.defaultDiscount ?? ''}
                                    </td>

                                    {/* REMARKS (same as now) */}
                                    <td style={{ padding: '1rem 1.5rem' }} onClick={e => e.stopPropagation()}>
                                      <input
                                        type="text"
                                        value={tableRemarks[item.itemId] ?? item.remarks ?? ''}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          setTableRemarks(prev => ({ ...prev, [item.itemId]: value }));
                                        }}
                                        onBlur={() => handlePersistRemarks(item)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            (e.currentTarget as HTMLInputElement).blur();
                                          }
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '0.25rem 0.5rem',
                                          borderRadius: '0.375rem',
                                          border: '1px solid #d1d5db',
                                          fontSize: '0.8rem',
                                          backgroundColor: '#f9fafb',
                                        }}
                                        placeholder="Add remarks"
                                        disabled={!canEditInventory}
                                      />
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td style={{ padding: '1rem 1.5rem' }}>{item.brand}</td>
                                    <td style={{ padding: '1rem 1.5rem' }}>{item.itemName}</td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>{item.type ?? item.itemType}</td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>₱{Number(item.purchasePrice ?? 0).toFixed(2)}</td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>₱{Number(item.sellingPrice ?? 0).toFixed(2)}</td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>{available}</td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>{firestoreItems.length ? item.sold ?? '-' : item.sold}</td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                      <span style={{
                                        display: 'inline-block',
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        backgroundColor: statusStyles.bg,
                                        color: statusStyles.color
                                      }}>
                                        {status}
                                      </span>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                      {item.defaultDiscount ?? ''}
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }} onClick={e => e.stopPropagation()}>
                                      <input
                                        type="text"
                                        value={tableRemarks[item.itemId] ?? item.remarks ?? ''}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          setTableRemarks(prev => ({ ...prev, [item.itemId]: value }));
                                        }}
                                        onBlur={() => handlePersistRemarks(item)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            (e.currentTarget as HTMLInputElement).blur();
                                          }
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '0.25rem 0.5rem',
                                          borderRadius: '0.375rem',
                                          border: '1px solid #d1d5db',
                                          fontSize: '0.8rem',
                                          backgroundColor: '#f9fafb',
                                        }}
                                        placeholder="Add remarks"
                                        disabled={!canEditInventory}
                                      />
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {renderModal()}

      {canEditInventory && isInventorySettingsOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2100,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.75rem 2rem',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 10px 40px rgba(15, 23, 42, 0.25)',
              border: '1px solid #e5e7eb',
            }}
          >
            <h2
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                margin: 0,
                marginBottom: '0.75rem',
                color: '#111827',
              }}
            >
              Item Details Settings
            </h2>
            <p
              style={{
                fontSize: '0.85rem',
                color: '#6b7280',
                marginBottom: '1rem',
              }}
            >
              Configure which fields are required when creating <strong>new</strong> inventory items. These settings do not affect existing items.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '0.75rem 1rem',
                marginBottom: '1.25rem',
              }}
            >
              {/* Item ID - always required, disabled */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#111827',
                  opacity: 0.6,
                  cursor: 'not-allowed',
                }}
              >
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  style={{
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#e5e7eb',
                  }}
                />
                <span>Item ID (always required)</span>
              </label>

              {/* Brand */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#111827' }}>
                <input
                  type="checkbox"
                  checked={itemDetailsRequired.brand}
                  onChange={(e) => setItemDetailsRequired(prev => ({ ...prev, brand: e.target.checked }))}
                  style={{
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #d1d5db',
                  }}
                />
                <span>Brand</span>
              </label>

              {/* Item Name */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#111827' }}>
                <input
                  type="checkbox"
                  checked={itemDetailsRequired.itemName}
                  onChange={(e) => setItemDetailsRequired(prev => ({ ...prev, itemName: e.target.checked }))}
                  style={{
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #d1d5db',
                  }}
                />
                <span>Item Name</span>
              </label>

              {/* Item Type */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#111827' }}>
                <input
                  type="checkbox"
                  checked={itemDetailsRequired.itemType}
                  onChange={(e) => setItemDetailsRequired(prev => ({ ...prev, itemType: e.target.checked }))}
                  style={{
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #d1d5db',
                  }}
                />
                <span>Item Type</span>
              </label>

              {/* Purchase Price */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#111827' }}>
                <input
                  type="checkbox"
                  checked={itemDetailsRequired.purchasePrice}
                  onChange={(e) => setItemDetailsRequired(prev => ({ ...prev, purchasePrice: e.target.checked }))}
                  style={{
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #d1d5db',
                  }}
                />
                <span>Purchase Price</span>
              </label>

              {/* Selling Price */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#111827' }}>
                <input
                  type="checkbox"
                  checked={itemDetailsRequired.sellingPrice}
                  onChange={(e) => setItemDetailsRequired(prev => ({ ...prev, sellingPrice: e.target.checked }))}
                  style={{
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #d1d5db',
                  }}
                />
                <span>Selling Price</span>
              </label>

              {/* Added Stock */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#111827' }}>
                <input
                  type="checkbox"
                  checked={itemDetailsRequired.addedStock}
                  onChange={(e) => setItemDetailsRequired(prev => ({ ...prev, addedStock: e.target.checked }))}
                  style={{
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #d1d5db',
                  }}
                />
                <span>Added Stock</span>
              </label>

              {/* Restock Level */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#111827' }}>
                <input
                  type="checkbox"
                  checked={itemDetailsRequired.restockLevel}
                  onChange={(e) => setItemDetailsRequired(prev => ({ ...prev, restockLevel: e.target.checked }))}
                  style={{
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #d1d5db',
                  }}
                />
                <span>Restock Level</span>
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
              }}
            >
              <button
                type="button"
                onClick={() => setIsInventorySettingsOpen(false)}
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}