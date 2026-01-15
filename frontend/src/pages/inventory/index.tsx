import { FaHome, FaGripLinesVertical, FaBars, FaWarehouse, FaTag, FaWrench, FaFileInvoice, FaPlus, FaUser, FaSearch, FaTimes, FaChevronDown, FaFilter, FaUndoAlt, FaCog, FaFileExcel, FaTrash } from 'react-icons/fa';

import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Footer } from '../../components/Footer';
import { collection, doc, addDoc, getDocs, updateDoc, deleteDoc, query, where, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import logo from '../../assets/logo.png';
import { can } from '../../config/permissions';
import { useEffectiveRoleIds } from '../../hooks/useEffectiveRoleIds';
import { HeaderDropdown } from '../../components/HeaderDropdown';
import Switch from '../../components/ui/Switch';

export function Inventory() {
  // Sample data - replace with actual data from your backend
  const inventoryItems: any[] = [];

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

  const { effectiveRoleIds } = useEffectiveRoleIds();
  const canAddInventory = can(effectiveRoleIds, 'inventory.add');
  const canEditInventory = can(effectiveRoleIds, 'inventory.edit');
  const canViewPurchasePrice = can(effectiveRoleIds, 'inventory.view.purchaseprice');
  const canViewArchived = can(effectiveRoleIds, 'inventory.view.archived');
  const canExportInventory = can(effectiveRoleIds, 'inventory.export');
  const canAddStockMultiple = can(effectiveRoleIds, 'inventory.addstock.multiple');
  const canArchiveInventory = can(effectiveRoleIds, 'inventory.archive');
  const canDeleteInventory = can(effectiveRoleIds, 'inventory.delete');

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  let closeMenuTimeout: number | undefined;

  const [isInventorySettingsOpen, setIsInventorySettingsOpen] = useState(false);

  // Select mode state (iOS gallery-style selection)
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

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
  const itemDetailsRef = useRef<HTMLDivElement | null>(null);
  const itemDetailsToggleRef = useRef<HTMLButtonElement | null>(null);


  const showType = viewportWidth >= 992; // Hide on tablet and below (768-991px)
  const showPurchasePrice = canViewPurchasePrice && viewportWidth >= 992; // Hide on tablet and below
  const showSold = viewportWidth >= 1200; // Hide on small desktop and below (992-1199px)
  const showDiscountMarkup = viewportWidth >= 1200; // Hide on small desktop and below
  const showRemarks = viewportWidth >= 1200; // Hide on small desktop and below

  const collapseItemDetails = () => {
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
      markup: '',
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
    setIsItemDetailsExpanded(false);
  };

  useEffect(() => {
    if (!isItemDetailsExpanded) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      const container = itemDetailsRef.current;
      const toggle = itemDetailsToggleRef.current;

      if (container && container.contains(target)) return;
      if (toggle && toggle.contains(target)) return;

      collapseItemDetails();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isItemDetailsExpanded]);
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;

      setViewportWidth(width);
      setIsMobile(mobile);
    };

    // run once on mount to set initial state correctly
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isActionBarExpanded, setIsActionBarExpanded] = useState(false);
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    sortBy: 'name-asc', // default: Name (↑)
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
    return (
      filters.minPrice !== '' ||
      filters.maxPrice !== '' ||
      filters.brand !== '' ||
      filters.type !== '' ||
      filters.status !== '' ||
      (filters.sortBy !== '' && filters.sortBy !== 'name-asc')
    );
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
    markup: '',
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Item Details mode: false = view, true = edit
  const [isEditMode, setIsEditMode] = useState(false);

  // Generated Item ID preview (e.g. OIL-HON-001)
  const [generatedItemId, setGeneratedItemId] = useState('');

  // Inline table-only fields (not saved to Firestore): remarks & discount per itemId
  const [tableRemarks, setTableRemarks] = useState<Record<string, string>>({});
  const [tableDiscounts, setTableDiscounts] = useState<Record<string, string>>({});
  const [tableDiscountErrors, setTableDiscountErrors] = useState<Record<string, string>>({});

  // Bulk Add Stock modal state
  const [isBulkAddStockOpen, setIsBulkAddStockOpen] = useState(false);
  const [bulkAddRows, setBulkAddRows] = useState<{
    inventoryDocId: string;
    quantity: string;
  }[]>([
    { inventoryDocId: '', quantity: '' },
  ]);

  const openBulkAddStock = () => {
    // Pre-populate with selected items from the table (if any)
    if (selectedItems.size > 0) {
      const rows = Array.from(selectedItems).map(docId => ({
        inventoryDocId: docId,
        quantity: '',
      }));
      setBulkAddRows(rows);
    } else {
      setBulkAddRows([{ inventoryDocId: '', quantity: '' }]);
    }
    setIsBulkAddStockOpen(true);
  };

  const closeBulkAddStock = () => {
    setIsBulkAddStockOpen(false);
  };

  // Toggle selection of an item (for iOS-style multi-select)
  const toggleItemSelection = (docId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  // Exit select mode and clear selections
  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedItems(new Set());
  };

  const handleBulkRowChange = (index: number, field: 'inventoryDocId' | 'quantity', value: string) => {
    setBulkAddRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });

    // When user selects an item in the modal, also select it in the table
    if (field === 'inventoryDocId' && value) {
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.add(value);
        return next;
      });
    }
  };

  const handleBulkAddRow = () => {
    setBulkAddRows(prev => [...prev, { inventoryDocId: '', quantity: '' }]);
  };

  const handleBulkRemoveRow = (index: number) => {
    setBulkAddRows(prev => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmitBulkAddStock = async () => {
    if (!canEditInventory) return;

    const effectiveRows = bulkAddRows
      .map(row => ({
        inventoryDocId: row.inventoryDocId.trim(),
        quantity: Number(row.quantity) || 0,
      }))
      .filter(row => row.inventoryDocId && row.quantity > 0);

    if (effectiveRows.length === 0) {
      setModalState({
        open: true,
        title: 'No Stock Changes',
        message: 'Please select at least one item and enter a quantity greater than 0.',
        variant: 'info',
      });
      return;
    }

    try {
      for (const row of effectiveRows) {
        const item = (firestoreItems || []).find(x => x.docId === row.inventoryDocId);
        if (!item) continue;

        const currentAvailable = Number(item.availableStock ?? 0) || 0;
        const restockLevel = Number(item.restockLevel ?? 0) || 0;
        const newAvailable = currentAvailable + row.quantity;
        const nextStatus = computeStatusFromStock(newAvailable, restockLevel);

        const ref = doc(inventoryCollection, row.inventoryDocId);
        await updateDoc(ref, {
          availableStock: newAvailable,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        });
      }

      await loadInventory();

      closeBulkAddStock();
      setModalState({
        open: true,
        title: 'Stock Updated',
        message: 'Stock levels have been updated for the selected items.',
        variant: 'info',
      });
    } catch (err) {
      console.error('Error applying bulk stock updates', err);
      setModalState({
        open: true,
        title: 'Update Failed',
        message: 'There was an error updating stock. Please try again.',
        variant: 'error',
      });
    }
  };

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
          defaultMarkup: (data.defaultMarkup ?? '').toString(),
          archived: Boolean(data.archived),
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

  // Load required fields settings from Firestore
  useEffect(() => {
    const loadRequiredFields = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'requiredFields'));
        if (settingsDoc.exists() && settingsDoc.data().inventory) {
          const inv = settingsDoc.data().inventory;
          setItemDetailsRequired(prev => ({
            ...prev,
            brand: inv.brand ?? prev.brand,
            itemName: inv.itemName ?? prev.itemName,
            itemType: inv.itemType ?? prev.itemType,
            purchasePrice: inv.purchasePrice ?? prev.purchasePrice,
            sellingPrice: inv.sellingPrice ?? prev.sellingPrice,
            addedStock: inv.addedStock ?? prev.addedStock,
            restockLevel: inv.restockLevel ?? prev.restockLevel,
          }));
        }
      } catch (err) {
        console.error('Failed to load required fields settings:', err);
      }
    };
    loadRequiredFields();
  }, []);

  const handleSaveItem = async () => {
    const isEditingExisting = !!(selectedInventoryItem as any)?.docId;

    // Check appropriate permission based on whether adding or editing
    if (isEditingExisting && !canEditInventory) return;
    if (!isEditingExisting && !canAddInventory) return;

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
          message: 'SRP is required for new items.',
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
          defaultMarkup: formItem.markup?.trim() || null,
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
          defaultMarkup: formItem.markup?.trim() || null,
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

  // Archive a single item (from details view)
  const handleArchiveItem = async () => {
    if (!canArchiveInventory) return;

    if (!(selectedInventoryItem as any)?.docId) {
      setModalState({
        open: true,
        title: 'Archive Item',
        message: 'No saved item selected to archive.',
        variant: 'error',
      });
      return;
    }

    const docId = (selectedInventoryItem as any).docId as string;

    setModalState({
      open: true,
      title: 'Archive Item',
      message: 'Are you sure you want to archive this item?',
      variant: 'confirm',
      onConfirm: async () => {
        const itemRef = doc(inventoryCollection, docId);
        try {
          await updateDoc(itemRef, {
            archived: true,
            updatedAt: new Date().toISOString(),
          });
          await loadInventory();

          setModalState({
            open: true,
            title: 'Item Archived',
            message: 'Inventory item has been archived.',
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
            markup: '',
          });
          setHasUnsavedChanges(false);
          setIsItemDetailsExpanded(false);
        } catch (err) {
          console.error('Error archiving inventory item', err);
          setModalState({
            open: true,
            title: 'Archive Failed',
            message: 'There was an error archiving the item. Please try again.',
            variant: 'error',
          });
        }
      },
    });
  };

  // Unarchive a single item (from details view)
  const handleUnarchiveItem = async () => {
    if (!canArchiveInventory) return;

    if (!(selectedInventoryItem as any)?.docId) {
      setModalState({
        open: true,
        title: 'Unarchive Item',
        message: 'No saved item selected to unarchive.',
        variant: 'error',
      });
      return;
    }

    const docId = (selectedInventoryItem as any).docId as string;

    setModalState({
      open: true,
      title: 'Unarchive Item',
      message: 'Are you sure you want to unarchive this item?',
      variant: 'confirm',
      onConfirm: async () => {
        const itemRef = doc(inventoryCollection, docId);
        try {
          await updateDoc(itemRef, {
            archived: false,
            updatedAt: new Date().toISOString(),
          });
          await loadInventory();

          setModalState({
            open: true,
            title: 'Item Unarchived',
            message: 'Inventory item has been restored.',
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
            markup: '',
          });
          setHasUnsavedChanges(false);
          setIsItemDetailsExpanded(false);
        } catch (err) {
          console.error('Error unarchiving inventory item', err);
          setModalState({
            open: true,
            title: 'Unarchive Failed',
            message: 'There was an error unarchiving the item. Please try again.',
            variant: 'error',
          });
        }
      },
    });
  };

  // Permanently delete a single item (from details view - only for archived items)
  const handlePermanentDeleteItem = async () => {
    if (!canDeleteInventory) return;

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
      title: 'Permanently Delete Item',
      message: 'Are you sure you want to permanently delete this item? This action cannot be undone.',
      variant: 'confirm',
      onConfirm: () => {
        setModalState({
          open: true,
          title: 'Final Confirmation',
          message: 'This will permanently delete the item from the database. Are you absolutely sure?',
          variant: 'confirm',
          onConfirm: async () => {
            const itemRef = doc(inventoryCollection, docId);
            try {
              await deleteDoc(itemRef);
              await loadInventory();

              setModalState({
                open: true,
                title: 'Item Deleted',
                message: 'Inventory item has been permanently deleted.',
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
                markup: '',
              });
              setHasUnsavedChanges(false);
              setIsItemDetailsExpanded(false);
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
      },
    });
  };

  const getBaseInventorySource = () => {
    const source = (firestoreItems.length ? firestoreItems : inventoryItems) as any[];
    // Filter based on showArchived toggle - only show archived items if toggle is on
    if (showArchived) {
      return source; // Show all items (including archived)
    }
    return source.filter((item: any) => !item.archived);
  };

  const handleExportInventoryCsv = async () => {
    const baseSource = getBaseInventorySource();
    if (!baseSource.length) return;

    const today = new Date().toISOString().split('T')[0];

    const soldTodayByItem: Record<string, number> = {};
    try {
      const txItemsRef = collection(db, 'transactionItems');
      const qItems = query(txItemsRef, where('date', '==', today));
      const snap = await getDocs(qItems);

      snap.forEach(docSnap => {
        const data = docSnap.data() as any;
        const code = (data.itemCode ?? '').toString();
        const qty = Number(data.quantity ?? 0) || 0;
        if (!code || !qty) return;
        soldTodayByItem[code] = (soldTodayByItem[code] || 0) + qty;
      });
    } catch (err) {
      console.error('Error aggregating today\'s transaction items for inventory export', err);
    }

    const headers = [
      'Brand',
      'Item Name',
      'Total Available Stock',
      'Total Quantity Sold',
      'Sold Today',
    ];

    const escapeCell = (value: unknown): string => {
      const str = (value ?? '').toString();
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const filtered = baseSource.filter((raw: any) => {
      const brand = (raw.brand ?? '').toString();
      const itemName = (raw.itemName ?? '').toString();
      const type = (raw.type ?? raw.itemType ?? '').toString();
      const selling = Number(raw.sellingPrice ?? 0) || 0;

      const matchesSearch = !searchTerm
        || brand.toLowerCase().includes(searchTerm.toLowerCase())
        || itemName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesMinPrice = !filters.minPrice || selling >= Number(filters.minPrice);
      const matchesMaxPrice = !filters.maxPrice || selling <= Number(filters.maxPrice);

      const matchesBrand = !filters.brand || brand === filters.brand;
      const matchesType = !filters.type || type === filters.type;

      let matchesStatus = true;
      if (filters.status) {
        const available = Number(raw.availableStock ?? 0) || 0;
        const restockLevel = Number(raw.restockLevel ?? 0) || 0;
        const statusLabel = computeStatusFromStock(available, restockLevel).toLowerCase();
        if (filters.status === 'in-stock') {
          matchesStatus = statusLabel === 'in stock';
        } else if (filters.status === 'restock') {
          matchesStatus = statusLabel === 'restock';
        } else if (filters.status === 'out-of-stock') {
          matchesStatus = statusLabel === 'out of stock';
        }
      }

      return (
        matchesSearch &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesBrand &&
        matchesType &&
        matchesStatus
      );
    });

    const sorted = [...filtered];

    const getNameKey = (x: any) => {
      const brand = (x.brand ?? '').toString().toLowerCase();
      const name = (x.itemName ?? '').toString().toLowerCase();
      return `${brand}||${name}`;
    };

    if (!filters.sortBy || filters.sortBy === 'name-asc') {
      sorted.sort((a, b) => getNameKey(a).localeCompare(getNameKey(b)));
    } else if (filters.sortBy === 'name-desc') {
      sorted.sort((a, b) => getNameKey(b).localeCompare(getNameKey(a)));
    } else if (filters.sortBy === 'price-asc') {
      sorted.sort(
        (a, b) =>
          (Number(a.sellingPrice ?? 0) || 0) - (Number(b.sellingPrice ?? 0) || 0)
      );
    } else if (filters.sortBy === 'price-desc') {
      sorted.sort(
        (a, b) =>
          (Number(b.sellingPrice ?? 0) || 0) - (Number(a.sellingPrice ?? 0) || 0)
      );
    }

    if (!sorted.length) return;

    const extractionLine = [
      escapeCell('Extraction as of'),
      escapeCell(today),
    ].join(',');

    const headerLine = headers.map(escapeCell).join(',');

    const dataLines = sorted.map((item: any) => {
      const available = Number(item.availableStock ?? 0) || 0;

      const key = (item.itemId ?? item.id ?? '').toString();
      const soldToday = key ? (soldTodayByItem[key] || 0) : 0;

      const cells = [
        (item.brand ?? '').toString(),
        (item.itemName ?? '').toString(),
        available.toString(),
        Number(item.sold ?? 0).toString(),
        soldToday.toString(),
      ];

      return cells.map(escapeCell).join(',');
    });

    const csv = [extractionLine, headerLine, ...dataLines].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
            backgroundColor: 'var(--surface-elevated)',
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
              color: modalState.variant === 'error' ? '#b91c1c' : 'var(--text-primary)',
            }}
          >
            {modalState.title}
          </h2>
          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--field-label-text)',
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
                  backgroundColor: 'var(--surface-elevated)',
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
                      ? (modalState.title.toLowerCase().includes('unarchive')
                        ? '#059669' // Green for unarchive
                        : '#dc2626') // Red for archive/delete
                      : '#2563eb',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {isConfirm
                ? (modalState.title.toLowerCase().includes('archive') && !modalState.title.toLowerCase().includes('unarchive')
                  ? 'Archive'
                  : modalState.title.toLowerCase().includes('unarchive')
                    ? 'Unarchive'
                    : modalState.title.toLowerCase().includes('delete')
                      ? 'Delete'
                      : 'Confirm')
                : 'OK'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleHeaderSort = (field: string) => {
    setFilters(prev => {
      const current = prev.sortBy;
      const ascKey = `${field}-asc`;
      const descKey = `${field}-desc`;

      let next: string;
      if (current === ascKey) {
        next = descKey;
      } else {
        next = ascKey;
      }

      return { ...prev, sortBy: next };
    });
  };

  const renderDiscountPill = (rawDiscount: any, rawMarkup: any) => {
    const discText = (rawDiscount ?? '').toString().trim();
    const markText = (rawMarkup ?? '').toString().trim();

    if (!discText && !markText) return null;

    let label = '';
    let variant: 'discount' | 'markup' | 'neutral' = 'neutral';

    const hasDisc = !!discText;
    const hasMark = !!markText;

    if (hasDisc && !hasMark) {
      label = discText;
      variant = 'discount';
    } else if (!hasDisc && hasMark) {
      label = markText;
      variant = 'markup';
    } else {
      // both provided
      label = `${discText} / ${markText}`;
      variant = 'neutral';
    }

    const stylesByVariant: Record<string, { bg: string; color: string; border: string }> = {
      discount: { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' }, // red-ish
      markup: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },   // green-ish
      neutral: { bg: '#e5e7eb', color: '#374151', border: '#d1d5db' },
    };

    const s = stylesByVariant[variant];

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.15rem 0.6rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          backgroundColor: s.bg,
          color: s.color,
          border: `1px solid ${s.border}`,
          minWidth: '3.25rem',
        }}
      >
        {label}
      </span>
    );
  };



  const filteredAndSortedItems = (() => {
    const baseSource = getBaseInventorySource();
    if (!baseSource.length) return [];

    const filtered = baseSource.filter((raw: any) => {
      const brand = (raw.brand ?? '').toString();
      const itemName = (raw.itemName ?? '').toString();
      const type = (raw.type ?? raw.itemType ?? '').toString();
      const selling = Number(raw.sellingPrice ?? 0) || 0;

      const matchesSearch =
        !searchTerm ||
        brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        itemName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesMinPrice = !filters.minPrice || selling >= Number(filters.minPrice);
      const matchesMaxPrice = !filters.maxPrice || selling <= Number(filters.maxPrice);

      const matchesBrand = !filters.brand || brand === filters.brand;
      const matchesType = !filters.type || type === filters.type;

      let matchesStatus = true;
      if (filters.status) {
        const available = Number(raw.availableStock ?? 0) || 0;
        const restockLevel = Number(raw.restockLevel ?? 0) || 0;
        const statusLabel = computeStatusFromStock(available, restockLevel).toLowerCase();
        if (filters.status === 'in-stock') {
          matchesStatus = statusLabel === 'in stock';
        } else if (filters.status === 'restock') {
          matchesStatus = statusLabel === 'restock';
        } else if (filters.status === 'out-of-stock') {
          matchesStatus = statusLabel === 'out of stock';
        }
      }

      return (
        matchesSearch &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesBrand &&
        matchesType &&
        matchesStatus
      );
    });

    const sorted = [...filtered];

    const getNameKey = (x: any) => {
      const b = (x.brand ?? '').toString().toLowerCase();
      const n = (x.itemName ?? '').toString().toLowerCase();
      return `${b}||${n}`;
    };

    const getBrandKey = (x: any) =>
      (x.brand ?? '').toString().toLowerCase();

    const getItemNameKey = (x: any) =>
      (x.itemName ?? '').toString().toLowerCase();

    const getTypeKey = (x: any) =>
      ((x.type ?? x.itemType) ?? '').toString().toLowerCase();

    const getPurchase = (x: any) =>
      Number(x.purchasePrice ?? 0) || 0;

    const getSrp = (x: any) =>
      Number(x.sellingPrice ?? 0) || 0;

    const getAvailable = (x: any) =>
      Number(x.availableStock ?? 0) || 0;

    const getSold = (x: any) =>
      Number(x.sold ?? 0) || 0;

    const getStatusScore = (x: any) => {
      const available = Number(x.availableStock ?? 0) || 0;
      const restockLevel = Number(x.restockLevel ?? 0) || 0;
      const label = computeStatusFromStock(available, restockLevel);
      if (label === 'In Stock') return 2;
      if (label === 'Restock') return 1;
      if (label === 'Out of Stock') return 0;
      return 0;
    };

    const sortKey = filters.sortBy || 'name-asc';

    const compareString = (a: string, b: string, desc: boolean) =>
      desc ? b.localeCompare(a) : a.localeCompare(b);

    const compareNumber = (a: number, b: number, desc: boolean) =>
      desc ? b - a : a - b;

    sorted.sort((a, b) => {
      const [field, dir] = sortKey.split('-');
      const desc = dir === 'desc';

      switch (field) {
        case 'brand':
          return compareString(getBrandKey(a), getBrandKey(b), desc);
        case 'itemName':
          return compareString(getItemNameKey(a), getItemNameKey(b), desc);
        case 'type':
          return compareString(getTypeKey(a), getTypeKey(b), desc);
        case 'purchase':
          return compareNumber(getPurchase(a), getPurchase(b), desc);
        case 'srp':
          return compareNumber(getSrp(a), getSrp(b), desc);
        case 'available':
          return compareNumber(getAvailable(a), getAvailable(b), desc);
        case 'sold':
          return compareNumber(getSold(a), getSold(b), desc);
        case 'status': {
          const sa = getStatusScore(a);
          const sb = getStatusScore(b);
          // For status:
          //  status-asc  => In Stock (2) first, then Restock (1), then Out of Stock (0)
          //  status-desc => Out of Stock (0) first, then Restock (1), then In Stock (2)
          return desc ? sa - sb : sb - sa;
        }
        case 'name':
        default:
          return compareString(getNameKey(a), getNameKey(b), desc);
      }
    });

    return sorted;
  })();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: 'var(--bg-gradient)',
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
        background: 'var(--bg-gradient)',
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
      }} />

      {/* Bulk Add Stock Modal */}
      {isBulkAddStockOpen && (
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
              backgroundColor: 'var(--surface-elevated)',
              borderRadius: '0.75rem',
              padding: '1.5rem 1.75rem',
              maxWidth: '560px',
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
                color: 'var(--text-primary)',
              }}
            >
              Add Stock to Multiple Items
            </h2>
            <p
              style={{
                fontSize: '0.9rem',
                color: 'var(--field-label-text)',
                marginBottom: '1rem',
              }}
            >
              Select one or more items and specify how much stock to add for each.
            </p>

            <div
              style={{
                maxHeight: '320px',
                overflowY: 'auto',
                marginBottom: '1rem',
              }}
            >
              {bulkAddRows.map((row, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr auto',
                    gap: '0.5rem',
                    marginBottom: '0.6rem',
                    alignItems: 'center',
                  }}
                >
                  <select
                    value={row.inventoryDocId}
                    onChange={(e) => handleBulkRowChange(index, 'inventoryDocId', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.6rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: 'var(--surface-elevated)',
                      color: '#111827',
                      fontSize: '0.9rem',
                    }}
                  >
                    <option value="">Select Item</option>
                    {firestoreItems
                      .filter((item) => {
                        // Show item if it's the currently selected one for this row
                        if (item.docId === row.inventoryDocId) return true;
                        // Hide items that are already selected in other rows
                        const alreadySelected = bulkAddRows.some(
                          (r, i) => i !== index && r.inventoryDocId === item.docId
                        );
                        return !alreadySelected;
                      })
                      .map((item) => (
                        <option key={item.docId} value={item.docId}>
                          {item.brand ? `${item.brand} - ${item.itemName}` : item.itemName}
                        </option>
                      ))}
                  </select>

                  <input
                    type="number"
                    min="0"
                    placeholder="Added Stock"
                    value={row.quantity}
                    onChange={(e) => handleBulkRowChange(index, 'quantity', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.6rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      fontSize: '0.9rem',
                      backgroundColor: 'var(--surface-elevated)',
                      color: '#111827',
                    }}
                  />

                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {bulkAddRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleBulkRemoveRow(index)}
                        style={{
                          padding: '0.35rem 0.6rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #fecaca',
                          backgroundColor: '#fef2f2',
                          color: '#b91c1c',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    )}
                    {index === bulkAddRows.length - 1 && (
                      <button
                        type="button"
                        onClick={handleBulkAddRow}
                        style={{
                          padding: '0.35rem 0.6rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#f9fafb',
                          color: '#111827',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              <button
                type="button"
                onClick={closeBulkAddStock}
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'var(--surface-elevated)',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitBulkAddStock}
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  backgroundColor: '#1d4ed8',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        maxWidth: '1600px',
        margin: '0 auto',
        width: '100%',
        zIndex: 5,
        padding: '1.5rem 1.5rem 2rem 1.5rem',
        flex: 1
      }}>
        <header style={{
          backgroundColor: 'var(--surface)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '1rem 2rem',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)',
          border: '1px solid var(--border)',
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
                  color: 'var(--header-title)',
                  margin: 0,
                  lineHeight: isMobile ? '1.75rem' : 'normal',
                }}>
                  Inventory
                </h1>
                <span style={{
                  color: 'var(--text)',
                  fontSize: isMobile ? '0.75rem' : '0.9rem',
                  marginLeft: isMobile ? '0' : '1rem',
                }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
              </div>
            </div>

            {/* Center/right: Search bar (desktop only, hidden on mobile) */}
            {!isMobile && (
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  marginLeft: 'auto',
                  marginRight: '1rem',
                }}
              >
                {/* Original full search bar for normal desktop & other sizes */}
                <FaSearch
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  placeholder={isMobile ? "Search..." : "Search by Brand or Item Name..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    padding: '0.5rem 2.5rem 0.5rem 2.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'rgba(255, 255, 255)',
                    color: '#1f2937',
                    width: isMobile ? '200px' : '350px',
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
                      color: 'var(--text-muted)',
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
            {/* Right: Logout + Navbar Toggle Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {user && !isMobile && (
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}

                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid var(--logout-button)',
                    color: 'var(--logout-button)',
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
                  color: 'var(--logout-button)',
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
              currentPage="inventory"
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
        </header>

        <main>
          <div style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Item Details Section */}
            <section style={{ marginBottom: '2rem' }}>
              <div style={{
                backgroundColor: 'var(--surface-elevated)',
                borderRadius: '0.5rem',
                border: '1px solid var(--panel-border)',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                marginBottom: '1.5rem',
                overflow: 'hidden'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.5rem',
                  borderBottom: isItemDetailsExpanded ? '1px solid var(--panel-border)' : 'none',
                  backgroundColor: 'var(--panel-header-bg)'
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
                          markup: '',
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
                      color: 'var(--page-title)'
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

                  {/* New Item button - requires add permission */}
                  {canAddInventory && (
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
                          markup: '',
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
                        backgroundColor: 'var(--surface-elevated)',
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
                  backgroundColor: 'var(--panel-bg)'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem', order: isMobile ? 'initial' : 'unset' }}>
                    {/* Left Column */}
                    <div style={{ order: isMobile ? 0 : 'unset' }}>
                      {/* Item ID */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: 'var(--field-label-text)'
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
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          color: 'var(--field-label-text)'
                        }}>
                          Brand{itemDetailsRequired.brand ? ' *' : ''}
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
                              backgroundColor: 'var(--surface-elevated)',
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
                          color: 'var(--field-label-text)'
                        }}>
                          Item Name{itemDetailsRequired.itemName ? ' *' : ''}
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
                          color: 'var(--field-label-text)'
                        }}>
                          Item Type{itemDetailsRequired.itemType ? ' *' : ''}
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
                              backgroundColor: 'var(--surface-elevated)',
                              color: '#111827'
                            }}
                            disabled={!canEditInventory}
                          />
                        )}
                      </div>
                    </div>

                    {/* Right Column */}
                    <div style={{ order: isMobile ? 0 : 'unset' }}>
                      {/* Purchase Price */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          Purchase Price (₱){itemDetailsRequired.purchasePrice ? ' *' : ''}
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

                      {/* SRP */}
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#4b5563'
                        }}>
                          SRP (₱){itemDetailsRequired.sellingPrice ? ' *' : ''}
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
                          {isEditMode ? `Added Stock${itemDetailsRequired.addedStock ? ' *' : ''}` : 'Available Stock'}
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
                            backgroundColor: 'var(--surface-elevated)',
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
                          Restock Level{itemDetailsRequired.restockLevel ? ' *' : ''}
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

                      {/* Discount / Markup */}
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          {/* Discount (left half) */}
                          <div style={{ flex: 1 }}>
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

                          {/* Markup (right half) */}
                          <div style={{ flex: 1 }}>
                            <label style={{
                              display: 'block',
                              marginBottom: '0.5rem',
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              color: '#4b5563'
                            }}>
                              Markup
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. 50 or 10%"
                              value={formItem.markup}
                              onChange={(e) => {
                                setFormItem(prev => ({ ...prev, markup: e.target.value }));
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

                      {/* Remarks - Always show in details section on mobile, or when column is hidden on desktop */}
                      {(isMobile || !showRemarks) && (
                        <div style={{ marginBottom: '1rem' }}>
                          <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            color: '#4b5563'
                          }}>
                            Remarks
                          </label>
                          <textarea
                            placeholder="Add remarks..."
                            value={formItem.remarks}
                            onChange={(e) => {
                              setFormItem(prev => ({ ...prev, remarks: e.target.value }));
                              setHasUnsavedChanges(true);
                            }}
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: '#f9fafb',
                              color: '#111827',
                              resize: 'vertical',
                              fontFamily: 'inherit'
                            }}
                            disabled={!isEditMode || !canEditInventory}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Form Actions */}
                  {(canAddInventory || canEditInventory || canArchiveInventory || canDeleteInventory) && (
                    <div style={{
                      display: 'flex',
                      gap: '0.75rem',
                      marginTop: '1.5rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid #e5e7eb'
                    }}>
                      {isEditMode ? (
                        <>
                          {/* Save Button */}
                          {(canAddInventory || canEditInventory) && (
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
                          )}

                          {/* Cancel Button */}
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
                                markup: '',
                              });
                              setHasUnsavedChanges(false);
                              setIsEditMode(false);
                              setIsItemDetailsExpanded(false);
                            }}
                            style={{
                              flex: 1,
                              padding: '0.5rem 1.5rem',
                              backgroundColor: 'var(--surface-elevated)',
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

                          {/* Archive/Unarchive/Delete buttons based on item state */}
                          {selectedInventoryItem && (selectedInventoryItem as any).archived ? (
                            <>
                              {/* Unarchive Button - for archived items */}
                              {canArchiveInventory && (
                                <button
                                  type="button"
                                  onClick={handleUnarchiveItem}
                                  style={{
                                    flex: 1,
                                    padding: '0.5rem 1.5rem',
                                    backgroundColor: '#ecfdf5',
                                    color: '#059669',
                                    border: '1px solid #a7f3d0',
                                    borderRadius: '0.375rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    textAlign: 'center'
                                  }}
                                >
                                  Unarchive
                                </button>
                              )}
                              {/* Permanent Delete Button - for archived items */}
                              {canDeleteInventory && (
                                <button
                                  type="button"
                                  onClick={handlePermanentDeleteItem}
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
                                  Delete
                                </button>
                              )}
                            </>
                          ) : (
                            /* Archive Button - for non-archived items */
                            canArchiveInventory && selectedInventoryItem && (
                              <button
                                type="button"
                                onClick={handleArchiveItem}
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
                                Archive
                              </button>
                            )
                          )}
                        </>
                      ) : (
                        <>
                          {/* Edit Button */}
                          {canEditInventory && (
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
                          )}

                          {/* Cancel Button */}
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
                                markup: '',
                              });
                              setHasUnsavedChanges(false);
                              setIsEditMode(false);
                              setIsItemDetailsExpanded(false);
                            }}
                            style={{
                              flex: 1,
                              padding: '0.5rem 1.5rem',
                              backgroundColor: 'var(--surface-elevated)',
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

                          {/* Archive/Unarchive/Delete buttons based on item state */}
                          {selectedInventoryItem && (selectedInventoryItem as any).archived ? (
                            <>
                              {/* Unarchive Button - for archived items */}
                              {canArchiveInventory && (
                                <button
                                  type="button"
                                  onClick={handleUnarchiveItem}
                                  style={{
                                    flex: 1,
                                    padding: '0.5rem 1.5rem',
                                    backgroundColor: '#ecfdf5',
                                    color: '#059669',
                                    border: '1px solid #a7f3d0',
                                    borderRadius: '0.375rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    textAlign: 'center'
                                  }}
                                >
                                  Unarchive
                                </button>
                              )}
                              {/* Permanent Delete Button - for archived items */}
                              {canDeleteInventory && (
                                <button
                                  type="button"
                                  onClick={handlePermanentDeleteItem}
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
                                  Delete
                                </button>
                              )}
                            </>
                          ) : (
                            /* Archive Button - for non-archived items */
                            canArchiveInventory && selectedInventoryItem && (
                              <button
                                type="button"
                                onClick={handleArchiveItem}
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
                                Archive
                              </button>
                            )
                          )}
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
                backgroundColor: 'var(--surface-elevated)',
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
                  backgroundColor: 'var(--surface-elevated)',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  marginBottom: '1rem',
                  border: '1px solid #e5e7eb'
                }}>
                  {/* Desktop: Horizontal layout */}
                  {viewportWidth >= 768 ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: showFilters ? '1rem' : 0 }}>
                      {/* Left side buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {/* Export to CSV Button - only show if user has export permission */}
                        {canExportInventory && (
                          <button
                            type="button"
                            onClick={handleExportInventoryCsv}
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
                        )}

                        {/* Select / Cancel Button - only show if user can add stock multiple OR archive */}
                        {(canAddStockMultiple || canArchiveInventory) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isSelectMode) {
                                exitSelectMode();
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
                              gap: '0.4rem',
                              fontWeight: 500,
                              fontSize: '0.875rem',
                              height: '40px',
                              transition: 'background-color 0.2s',
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = isSelectMode ? '#4b5563' : '#1e40af';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = isSelectMode ? '#6b7280' : '#1d4ed8';
                            }}
                          >
                            {isSelectMode ? 'Cancel' : 'Select'}
                          </button>
                        )}

                        {/* Add Stock Button - only visible when Select mode is active */}
                        {isSelectMode && canAddStockMultiple && (
                          <button
                            type="button"
                            onClick={openBulkAddStock}
                            style={{
                              backgroundColor: '#1d4ed8',
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
                              transition: 'background-color 0.2s',
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#1e40af';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = '#1d4ed8';
                            }}
                          >
                            <FaPlus /> Add Stock
                          </button>
                        )}

                        {/* Bulk action buttons - visible when Select mode is active */}
                        {isSelectMode && (() => {
                          // Determine selection state
                          const selectedItemsList = Array.from(selectedItems).map(docId =>
                            firestoreItems.find(item => item.docId === docId)
                          ).filter(Boolean);
                          const archivedCount = selectedItemsList.filter(item => item?.archived).length;
                          const unarchivedCount = selectedItemsList.length - archivedCount;
                          const hasOnlyArchived = archivedCount > 0 && unarchivedCount === 0;
                          const hasOnlyUnarchived = unarchivedCount > 0 && archivedCount === 0;
                          const hasMixed = archivedCount > 0 && unarchivedCount > 0;

                          return (
                            <>
                              {/* Archive Button - show for unarchived only OR mixed selection */}
                              {canArchiveInventory && (hasOnlyUnarchived || hasMixed) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedItems.size === 0) {
                                      setModalState({
                                        open: true,
                                        title: 'No Items Selected',
                                        message: 'Please select at least one item to archive.',
                                        variant: 'info',
                                      });
                                      return;
                                    }
                                    const itemsToArchive = selectedItemsList.filter(item => !item?.archived);
                                    setModalState({
                                      open: true,
                                      title: 'Confirm Archive',
                                      message: `Are you sure you want to archive ${itemsToArchive.length} item(s)?`,
                                      variant: 'confirm',
                                      onConfirm: async () => {
                                        try {
                                          for (const item of itemsToArchive) {
                                            if (!item) continue;
                                            const ref = doc(inventoryCollection, item.docId);
                                            await updateDoc(ref, {
                                              archived: true,
                                              updatedAt: new Date().toISOString(),
                                            });
                                          }
                                          await loadInventory();
                                          exitSelectMode();
                                          setModalState({
                                            open: true,
                                            title: 'Items Archived',
                                            message: `${itemsToArchive.length} item(s) have been archived successfully.`,
                                            variant: 'info',
                                          });
                                        } catch (err) {
                                          console.error('Error archiving items', err);
                                          setModalState({
                                            open: true,
                                            title: 'Archive Failed',
                                            message: 'There was an error archiving the items. Please try again.',
                                            variant: 'error',
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
                                    transition: 'background-color 0.2s',
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = '#b91c1c';
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = '#dc2626';
                                  }}
                                >
                                  <FaTrash /> Archive
                                </button>
                              )}

                              {/* Unarchive Button - show for archived only OR mixed selection */}
                              {canArchiveInventory && (hasOnlyArchived || hasMixed) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedItems.size === 0) {
                                      setModalState({
                                        open: true,
                                        title: 'No Items Selected',
                                        message: 'Please select at least one item to unarchive.',
                                        variant: 'info',
                                      });
                                      return;
                                    }
                                    const itemsToUnarchive = selectedItemsList.filter(item => item?.archived);
                                    setModalState({
                                      open: true,
                                      title: 'Confirm Unarchive',
                                      message: `Are you sure you want to unarchive ${itemsToUnarchive.length} item(s)?`,
                                      variant: 'confirm',
                                      onConfirm: async () => {
                                        try {
                                          for (const item of itemsToUnarchive) {
                                            if (!item) continue;
                                            const ref = doc(inventoryCollection, item.docId);
                                            await updateDoc(ref, {
                                              archived: false,
                                              updatedAt: new Date().toISOString(),
                                            });
                                          }
                                          await loadInventory();
                                          exitSelectMode();
                                          setModalState({
                                            open: true,
                                            title: 'Items Unarchived',
                                            message: `${itemsToUnarchive.length} item(s) have been restored.`,
                                            variant: 'info',
                                          });
                                        } catch (err) {
                                          console.error('Error unarchiving items', err);
                                          setModalState({
                                            open: true,
                                            title: 'Unarchive Failed',
                                            message: 'There was an error unarchiving the items. Please try again.',
                                            variant: 'error',
                                          });
                                        }
                                      },
                                    });
                                  }}
                                  style={{
                                    backgroundColor: '#059669',
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
                                    transition: 'background-color 0.2s',
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = '#047857';
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = '#059669';
                                  }}
                                >
                                  <FaUndoAlt /> Unarchive
                                </button>
                              )}

                              {/* Delete Button - show ONLY for archived items (not mixed) */}
                              {canDeleteInventory && hasOnlyArchived && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedItems.size === 0) {
                                      setModalState({
                                        open: true,
                                        title: 'No Items Selected',
                                        message: 'Please select at least one item to delete.',
                                        variant: 'info',
                                      });
                                      return;
                                    }
                                    setModalState({
                                      open: true,
                                      title: 'Permanently Delete Items',
                                      message: `Are you sure you want to permanently delete ${selectedItems.size} item(s)? This action cannot be undone.`,
                                      variant: 'confirm',
                                      onConfirm: () => {
                                        setModalState({
                                          open: true,
                                          title: 'Final Confirmation',
                                          message: `This will permanently delete ${selectedItems.size} item(s) from the database. Are you absolutely sure?`,
                                          variant: 'confirm',
                                          onConfirm: async () => {
                                            try {
                                              for (const docId of selectedItems) {
                                                const ref = doc(inventoryCollection, docId);
                                                await deleteDoc(ref);
                                              }
                                              await loadInventory();
                                              exitSelectMode();
                                              setModalState({
                                                open: true,
                                                title: 'Items Deleted',
                                                message: `${selectedItems.size} item(s) have been permanently deleted.`,
                                                variant: 'info',
                                              });
                                            } catch (err) {
                                              console.error('Error deleting items', err);
                                              setModalState({
                                                open: true,
                                                title: 'Delete Failed',
                                                message: 'There was an error deleting the items. Please try again.',
                                                variant: 'error',
                                              });
                                            }
                                          },
                                        });
                                      },
                                    });
                                  }}
                                  style={{
                                    backgroundColor: '#7f1d1d',
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
                                    transition: 'background-color 0.2s',
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = '#450a0a';
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = '#7f1d1d';
                                  }}
                                >
                                  <FaTrash /> Delete
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Right side buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {/* Filters Button */}
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

                        {/* Clear Filters Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setFilters({
                              minPrice: '',
                              maxPrice: '',
                              sortBy: 'name-asc',
                              brand: '',
                              type: '',
                              status: ''
                            });
                          }}
                          disabled={!isAnyFilterActive()}
                          style={{
                            backgroundColor: isAnyFilterActive() ? '#6b7280' : '#e5e7eb',
                            color: isAnyFilterActive() ? 'white' : '#9ca3af',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: isAnyFilterActive() ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                            height: '40px',
                            transition: 'background-color 0.2s',
                            opacity: isAnyFilterActive() ? 1 : 0.7,
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
                    </div>
                  ) : (
                    /* Mobile: Accordion layout */
                    <div>
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
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 0.2s ease',
                            transform: isActionBarExpanded ? 'rotate(180deg)' : 'rotate(0)'
                          }}
                        >
                          <FaChevronDown style={{ fontSize: '0.9em' }} />
                        </span>
                      </button>

                      {isActionBarExpanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: showFilters ? '1rem' : 0 }}>
                          {/* Export Button */}
                          {canExportInventory && (
                            <button
                              type="button"
                              onClick={handleExportInventoryCsv}
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
                                width: '100%',
                                maxWidth: '300px',
                                justifyContent: 'center'
                              }}
                            >
                              Export to CSV <FaFileExcel />
                            </button>
                          )}

                          {/* Select/Cancel Button */}
                          {(canAddStockMultiple || canArchiveInventory) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelectMode) {
                                  exitSelectMode();
                                } else {
                                  setIsSelectMode(true);
                                }
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
                                width: '100%',
                                maxWidth: '300px',
                                justifyContent: 'center'
                              }}
                            >
                              {isSelectMode ? 'Cancel' : 'Select'}
                            </button>
                          )}

                          {/* Add Stock Button - only visible in select mode */}
                          {isSelectMode && canAddStockMultiple && (
                            <button
                              type="button"
                              onClick={openBulkAddStock}
                              style={{
                                backgroundColor: '#1d4ed8',
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
                                width: '100%',
                                maxWidth: '300px',
                                justifyContent: 'center'
                              }}
                            >
                              <FaPlus /> Add Stock
                            </button>
                          )}

                          {/* Bulk action buttons - visible when Select mode is active */}
                          {isSelectMode && (() => {
                            const selectedItemsList = Array.from(selectedItems).map(docId =>
                              firestoreItems.find(item => item.docId === docId)
                            ).filter(Boolean);
                            const archivedCount = selectedItemsList.filter(item => item?.archived).length;
                            const unarchivedCount = selectedItemsList.length - archivedCount;
                            const hasOnlyArchived = archivedCount > 0 && unarchivedCount === 0;
                            const hasOnlyUnarchived = unarchivedCount > 0 && archivedCount === 0;
                            const hasMixed = archivedCount > 0 && unarchivedCount > 0;

                            return (
                              <>
                                {/* Archive Button */}
                                {canArchiveInventory && (hasOnlyUnarchived || hasMixed) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (selectedItems.size === 0) {
                                        setModalState({
                                          open: true,
                                          title: 'No Items Selected',
                                          message: 'Please select at least one item to archive.',
                                          variant: 'info',
                                        });
                                        return;
                                      }
                                      const itemsToArchive = selectedItemsList.filter(item => !item?.archived);
                                      setModalState({
                                        open: true,
                                        title: 'Confirm Archive',
                                        message: `Are you sure you want to archive ${itemsToArchive.length} item(s)?`,
                                        variant: 'confirm',
                                        onConfirm: async () => {
                                          try {
                                            for (const item of itemsToArchive) {
                                              if (!item) continue;
                                              const ref = doc(inventoryCollection, item.docId);
                                              await updateDoc(ref, {
                                                archived: true,
                                                updatedAt: new Date().toISOString(),
                                              });
                                            }
                                            await loadInventory();
                                            exitSelectMode();
                                            setModalState({
                                              open: true,
                                              title: 'Items Archived',
                                              message: `${itemsToArchive.length} item(s) have been archived successfully.`,
                                              variant: 'info',
                                            });
                                          } catch (err) {
                                            console.error('Error archiving items', err);
                                            setModalState({
                                              open: true,
                                              title: 'Archive Failed',
                                              message: 'There was an error archiving the items. Please try again.',
                                              variant: 'error',
                                            });
                                          }
                                        },
                                      });
                                    }}
                                    style={{
                                      backgroundColor: '#dc2626',
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
                                      width: '100%',
                                      maxWidth: '300px',
                                      justifyContent: 'center'
                                    }}
                                  >
                                    <FaTrash /> Archive
                                  </button>
                                )}

                                {/* Unarchive Button */}
                                {canArchiveInventory && (hasOnlyArchived || hasMixed) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (selectedItems.size === 0) {
                                        setModalState({
                                          open: true,
                                          title: 'No Items Selected',
                                          message: 'Please select at least one item to unarchive.',
                                          variant: 'info',
                                        });
                                        return;
                                      }
                                      const itemsToUnarchive = selectedItemsList.filter(item => item?.archived);
                                      setModalState({
                                        open: true,
                                        title: 'Confirm Unarchive',
                                        message: `Are you sure you want to unarchive ${itemsToUnarchive.length} item(s)?`,
                                        variant: 'confirm',
                                        onConfirm: async () => {
                                          try {
                                            for (const item of itemsToUnarchive) {
                                              if (!item) continue;
                                              const ref = doc(inventoryCollection, item.docId);
                                              await updateDoc(ref, {
                                                archived: false,
                                                updatedAt: new Date().toISOString(),
                                              });
                                            }
                                            await loadInventory();
                                            exitSelectMode();
                                            setModalState({
                                              open: true,
                                              title: 'Items Unarchived',
                                              message: `${itemsToUnarchive.length} item(s) have been restored.`,
                                              variant: 'info',
                                            });
                                          } catch (err) {
                                            console.error('Error unarchiving items', err);
                                            setModalState({
                                              open: true,
                                              title: 'Unarchive Failed',
                                              message: 'There was an error unarchiving the items. Please try again.',
                                              variant: 'error',
                                            });
                                          }
                                        },
                                      });
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
                                      fontWeight: 500,
                                      fontSize: '0.875rem',
                                      height: '40px',
                                      width: '100%',
                                      maxWidth: '300px',
                                      justifyContent: 'center'
                                    }}
                                  >
                                    Unarchive
                                  </button>
                                )}

                                {/* Delete Button */}
                                {canDeleteInventory && hasOnlyArchived && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (selectedItems.size === 0) {
                                        setModalState({
                                          open: true,
                                          title: 'No Items Selected',
                                          message: 'Please select at least one item to delete.',
                                          variant: 'info',
                                        });
                                        return;
                                      }
                                      const itemsToDelete = selectedItemsList.filter(item => item?.archived);
                                      setModalState({
                                        open: true,
                                        title: 'Confirm Permanent Delete',
                                        message: `Are you sure you want to permanently delete ${itemsToDelete.length} item(s)? This action cannot be undone.`,
                                        variant: 'confirm',
                                        onConfirm: async () => {
                                          try {
                                            for (const item of itemsToDelete) {
                                              if (!item) continue;
                                              await deleteDoc(doc(inventoryCollection, item.docId));
                                            }
                                            await loadInventory();
                                            exitSelectMode();
                                            setModalState({
                                              open: true,
                                              title: 'Items Deleted',
                                              message: `${itemsToDelete.length} item(s) have been permanently deleted.`,
                                              variant: 'info',
                                            });
                                          } catch (err) {
                                            console.error('Error deleting items', err);
                                            setModalState({
                                              open: true,
                                              title: 'Delete Failed',
                                              message: 'There was an error deleting the items. Please try again.',
                                              variant: 'error',
                                            });
                                          }
                                        },
                                      });
                                    }}
                                    style={{
                                      backgroundColor: '#ef4444',
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
                                      width: '100%',
                                      maxWidth: '300px',
                                      justifyContent: 'center'
                                    }}
                                  >
                                    <FaTrash /> Delete
                                  </button>
                                )}
                              </>
                            );
                          })()}

                          {/* Filters Button */}
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
                              width: '100%',
                              maxWidth: '300px',
                              justifyContent: 'center'
                            }}
                          >
                            Filters <FaFilter />
                          </button>

                          {/* Clear Filters Button */}
                          <button
                            onClick={() => {
                              setFilters({
                                minPrice: '',
                                maxPrice: '',
                                sortBy: 'name-asc',
                                brand: '',
                                type: '',
                                status: ''
                              });
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
                              width: '100%',
                              maxWidth: '300px',
                              justifyContent: 'center'
                            }}
                          >
                            Clear Filters
                          </button>
                        </div>
                      )}
                    </div>
                  )}

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
                              backgroundColor: 'var(--surface-elevated)',
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
                              backgroundColor: 'var(--surface-elevated)',
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
                          <option value="name-asc">Name (↑)</option>
                          <option value="name-desc">Name (↓)</option>
                          <option value="price-asc">Price (↑)</option>
                          <option value="price-desc">Price (↓)</option>
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
                          {Array.from(
                            new Set(getBaseInventorySource().map(item => item.brand).filter(Boolean))
                          ).map((brand: any) => (
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
                          {Array.from(
                            new Set(
                              getBaseInventorySource().map(item => (item.type ?? item.itemType)).filter(Boolean)
                            )
                          ).map((type: any) => (
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
                      {/* Show Archived switch - only visible if user has permission */}
                      {canViewArchived && (
                        <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#111827' }}>
                            <Switch
                              checked={showArchived}
                              onChange={(checked) => setShowArchived(checked)}
                              size="sm"
                            />
                            <span>Show Archived Items</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected count display */}
                {isSelectMode && selectedItems.size > 0 && (
                  <div style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--table-header-text)', fontWeight: 500 }}>
                    {selectedItems.size} selected
                  </div>
                )}

                {/* Your existing table component goes here */}
                <div style={{ overflowX: 'auto' }}>
                  <div style={{
                    backgroundColor: 'var(--table-bg)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '1rem',
                    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                    border: '1px solid var(--table-border)',
                    overflow: 'hidden'
                  }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        color: 'var(--table-row-text)' // Dark text color
                      }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: 'var(--table-header-text)' }}>
                            {isSelectMode && (
                              <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '40px' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedItems.size === filteredAndSortedItems.length && filteredAndSortedItems.length > 0}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedItems(new Set(filteredAndSortedItems.map((item: any) => item.docId)));
                                    } else {
                                      setSelectedItems(new Set());
                                    }
                                  }}
                                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                              </th>
                            )}
                            <th
                              style={{ padding: '0.75rem 1.5rem', cursor: 'pointer' }}
                              onClick={() => handleHeaderSort('brand')}
                            >
                              BRAND
                            </th>
                            <th
                              style={{ padding: '0.75rem 1.5rem', cursor: 'pointer' }}
                              onClick={() => handleHeaderSort('itemName')}
                            >
                              ITEM NAME
                            </th>
                            {showType && (
                              <th
                                style={{ padding: '0.75rem 1.5rem', textAlign: 'center', cursor: 'pointer' }}
                                onClick={() => handleHeaderSort('type')}
                              >
                                TYPE
                              </th>
                            )}
                            {showPurchasePrice && (
                              <th
                                style={{ padding: '0.75rem 1.5rem', textAlign: 'center', cursor: 'pointer' }}
                                onClick={() => handleHeaderSort('purchase')}
                              >
                                PURCHASE PRICE
                              </th>
                            )}
                            <th
                              style={{ padding: '0.75rem 1.5rem', textAlign: 'center', cursor: 'pointer' }}
                              onClick={() => handleHeaderSort('srp')}
                            >
                              SRP
                            </th>
                            <th
                              style={{ padding: '0.75rem 1.5rem', textAlign: 'center', cursor: 'pointer' }}
                              onClick={() => handleHeaderSort('available')}
                            >
                              AVAILABLE STOCK
                            </th>
                            {showSold && (
                              <th
                                style={{ padding: '0.75rem 1.5rem', textAlign: 'center', cursor: 'pointer' }}
                                onClick={() => handleHeaderSort('sold')}
                              >
                                NO. SOLD
                              </th>
                            )}
                            <th
                              style={{ padding: '0.75rem 1.5rem', textAlign: 'center', cursor: 'pointer' }}
                              onClick={() => handleHeaderSort('status')}
                            >
                              STATUS
                            </th>
                            {showDiscountMarkup && (
                              <th
                                style={{ padding: '0.75rem 1.5rem', textAlign: 'center', cursor: 'pointer' }}
                                onClick={() => handleHeaderSort('discount')}
                              >
                                DISCOUNT / MARKUP
                              </th>
                            )}
                            {showRemarks && (
                              <th style={{ padding: '0.75rem 1.5rem' }}>
                                REMARKS
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAndSortedItems.map((item: any, index: number) => {
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

                            // Determine background color based on archived and selection state
                            const isArchived = Boolean(item.archived);
                            const isSelected = isSelectMode && selectedItems.has(item.docId);
                            let rowBgColor = 'var(--table-row-bg)';
                            if (isSelected) {
                              rowBgColor = 'var(--table-row-hover-bg)';
                            } else if (isArchived) {
                              rowBgColor = 'var(--table-row-alt-bg)'; // Light gray for archived
                            }

                            return (
                              <tr
                                key={item.docId ?? item.id ?? index}
                                style={{
                                  borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                                  transition: 'background-color 0.2s',
                                  backgroundColor: rowBgColor,
                                  color: isArchived ? 'var(--table-header-text)' : 'var(--table-row-text)', // Muted text for archived

                                  cursor: isSelectMode ? 'pointer' : 'default',
                                  opacity: isArchived ? 0.7 : 1, // Slightly faded for archived
                                }}
                                onMouseOver={e => {
                                  if (isSelected) {
                                    e.currentTarget.style.backgroundColor = 'var(--table-row-hover-bg)';
                                  } else if (isArchived) {
                                    e.currentTarget.style.backgroundColor = 'var(--table-row-alt-bg)';
                                  } else {
                                    e.currentTarget.style.backgroundColor = 'var(--table-row-hover-bg)';
                                  }
                                }}
                                onMouseOut={e => {
                                  if (isSelected) {
                                    e.currentTarget.style.backgroundColor = 'var(--table-row-hover-bg)';
                                  } else if (isArchived) {
                                    e.currentTarget.style.backgroundColor = 'var(--table-row-alt-bg)';
                                  } else {
                                    e.currentTarget.style.backgroundColor = 'var(--table-row-bg)';
                                  }
                                }}

                                onClick={() => {
                                  // In select mode, toggle selection instead of opening details
                                  if (isSelectMode) {
                                    toggleItemSelection(item.docId);
                                    return;
                                  }

                                  // Normal mode: open item details
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
                                    markup: item.defaultMarkup ?? '',
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
                                {isSelectMode && (
                                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedItems.has(item.docId)}
                                      onChange={() => { }}
                                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                  </td>
                                )}
                                <>
                                  {/* Full table view */}
                                  <td style={{ padding: '1rem 1.5rem' }}>{item.brand}</td>
                                  <td style={{ padding: '1rem 1.5rem' }}>{item.itemName}</td>
                                  {showType && (
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>{item.type || item.itemType}</td>
                                  )}
                                  {showPurchasePrice && (
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                      ₱{Number(item.purchasePrice ?? 0).toFixed(2)}
                                    </td>
                                  )}
                                  <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                    ₱{Number(item.sellingPrice ?? 0).toFixed(2)}
                                  </td>
                                  <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>{available}</td>
                                  {showSold && (
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>{item.soldCount ?? 0}</td>
                                  )}
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
                                  </td>
                                  {showDiscountMarkup && (
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                      {renderDiscountPill(item.defaultDiscount, item.defaultMarkup)}
                                    </td>
                                  )}
                                  {showRemarks && (
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
                                          border: '1px solid var(--table-border)',
                                          fontSize: '0.8rem',
                                          backgroundColor: 'var(--table-row-alt-bg)',
                                          color: 'var(--table-row-text)',
                                        }}
                                        placeholder="Add remarks"
                                        disabled={!canEditInventory}
                                      />
                                    </td>
                                  )}
                                </>
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
              backgroundColor: 'var(--panel-bg)',
              borderRadius: '0.75rem',
              padding: '1.75rem 2rem',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 10px 40px rgba(15, 23, 42, 0.25)',
              border: '1px solid var(--panel-border)',
            }}
          >
            <h2
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                margin: 0,
                marginBottom: '0.75rem',
                color: 'var(--table-row-text)',
              }}
            >
              Item Details Settings
            </h2>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--table-header-text)',
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  color: 'var(--table-row-text)',
                  opacity: 0.6,
                }}
              >
                <Switch
                  checked={true}
                  onChange={() => { }}
                  disabled
                  size="sm"
                />
                <span>Item ID (always required)</span>
              </div>

              {/* Brand */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--table-row-text)' }}>
                <Switch
                  checked={itemDetailsRequired.brand}
                  onChange={(checked) => setItemDetailsRequired(prev => ({ ...prev, brand: checked }))}
                  size="sm"
                />
                <span>Brand</span>
              </div>

              {/* Item Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--table-row-text)' }}>
                <Switch
                  checked={itemDetailsRequired.itemName}
                  onChange={(checked) => setItemDetailsRequired(prev => ({ ...prev, itemName: checked }))}
                  size="sm"
                />
                <span>Item Name</span>
              </div>

              {/* Item Type */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--table-row-text)' }}>
                <Switch
                  checked={itemDetailsRequired.itemType}
                  onChange={(checked) => setItemDetailsRequired(prev => ({ ...prev, itemType: checked }))}
                  size="sm"
                />
                <span>Item Type</span>
              </div>

              {/* Purchase Price */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--table-row-text)' }}>
                <Switch
                  checked={itemDetailsRequired.purchasePrice}
                  onChange={(checked) => setItemDetailsRequired(prev => ({ ...prev, purchasePrice: checked }))}
                  size="sm"
                />
                <span>Purchase Price</span>
              </div>

              {/* SRP */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--table-row-text)' }}>
                <Switch
                  checked={itemDetailsRequired.sellingPrice}
                  onChange={(checked) => setItemDetailsRequired(prev => ({ ...prev, sellingPrice: checked }))}
                  size="sm"
                />
                <span>SRP</span>
              </div>

              {/* Added Stock */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--table-row-text)' }}>
                <Switch
                  checked={itemDetailsRequired.addedStock}
                  onChange={(checked) => setItemDetailsRequired(prev => ({ ...prev, addedStock: checked }))}
                  size="sm"
                />
                <span>Added Stock</span>
              </div>

              {/* Restock Level */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--table-row-text)' }}>
                <Switch
                  checked={itemDetailsRequired.restockLevel}
                  onChange={(checked) => setItemDetailsRequired(prev => ({ ...prev, restockLevel: checked }))}
                  size="sm"
                />
                <span>Restock Level</span>
              </div>
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
                  backgroundColor: 'var(--surface-elevated)',
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