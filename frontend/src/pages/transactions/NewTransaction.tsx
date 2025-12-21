import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  FaArrowLeft,
  FaPlus,
  FaMinus,
  FaSearch,
  FaSave,
  FaFilter,
  FaRedo,
  FaFileExcel,
  FaHome,
  FaBars,
  FaTag,
  FaWrench,
  FaFileInvoice,
  FaUser,
  FaTimes,
  FaWarehouse,
  FaUndoAlt,
  FaCog
} from 'react-icons/fa';
import { Footer } from '../../components/Footer';
import { useAuth } from '../../contexts/AuthContext';
import { can } from '../../config/permissions';
import { useEffectiveRoleIds } from '../../hooks/useEffectiveRoleIds';
import logo from '../../assets/logo.png';
import { HeaderDropdown } from '../../components/HeaderDropdown';
import Switch from '../../components/ui/Switch';
import { collection, getDocs, doc, updateDoc, getDoc, setDoc, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Types
type CartItem = {
  id: string;
  name: string;
  type: 'product' | 'service';
  price: number; // base effective price per unit for this transaction (after any default inventory discount)
  quantity: number;
  subtotal: number;
  // Optional metadata for products, used for inventory/discount display
  inventoryDocId?: string;
  basePrice?: number;       // original SRP from inventory
  discountAmount?: number;  // defaultDiscount applied from inventory

  // Per-transaction adjustments
  specialUnits?: number;    // how many units (0..quantity) get a special price
  adjustmentType?: 'none' | 'discount' | 'markup';
  adjustmentPerUnit?: number; // positive peso amount per affected unit
  adjustmentReason?: string;
};

export function NewTransaction() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const { effectiveRoleIds } = useEffectiveRoleIds();
  const canCreateTransaction = can(effectiveRoleIds, 'transactions.create');
  const canAddCustomer = can(effectiveRoleIds, 'customers.add');

  // Block access if user doesn't have transactions.create permission
  useEffect(() => {
    if (user && !canCreateTransaction) {
      navigate('/transactions');
    }
  }, [user, canCreateTransaction, navigate]);

  const [step, setStep] = useState(1); // 1: Customer Info, 2: Add Items, 3: Review & Pay

  const [customer, setCustomer] = useState({
    name: '',
    contact: '',
    email: '',
    address: ''
  });
  const [isNewCustomer, setIsNewCustomer] = useState(true);

  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  let closeMenuTimeout: number | undefined;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [requiredFields, setRequiredFields] = useState({
    name: false,
    contact: false,
    email: false,
    handledBy: true,
  });

  const [employees, setEmployees] = useState<string[]>([]);
  const [products, setProducts] = useState<{
    id: string;
    name: string;
    price: number; // effective price
    type: 'product';
    itemId: string;
    itemType: string;
    availableStock: number;
    inventoryDocId: string;
    basePrice: number;
    discountAmount: number;
  }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string; price: number; description: string; type: 'service' }[]>([]);
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<{
    id: string;
    name: string;
    price: number; // effective price
    type: 'product';
    itemId: string;
    itemType: string;
    availableStock: number;
    inventoryDocId: string;
    basePrice: number;
    discountAmount: number;
  } | null>(null);
  const [selectedServiceForDetails, setSelectedServiceForDetails] = useState<{ id: string; name: string; price: number; description: string; type: 'service' } | null>(null);
  const [isProductDetailsOpen, setIsProductDetailsOpen] = useState(false);
  const [isServiceDetailsOpen, setIsServiceDetailsOpen] = useState(false);
  const [gcashQrDataUrl, setGcashQrDataUrl] = useState<string | null>(null);
  const [gcashReference, setGcashReference] = useState('');

  // Customer LOV (list of values) state
  const [isCustomerLovOpen, setIsCustomerLovOpen] = useState(false);
  const [customerLovSearch, setCustomerLovSearch] = useState('');
  const [customerLovItems, setCustomerLovItems] = useState<{
    id: string;
    name: string;
    contact: string;
    email: string;
    address: string;
  }[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [customerLovError, setCustomerLovError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load active employees for the Handled By dropdown
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const names: string[] = [];

        snapshot.forEach(docSnap => {
          const data = docSnap.data() as any;
          const status = (data.status ?? '').toString().toLowerCase();
          if (status === 'active') {
            const fullName = (data.fullName ?? '').toString();
            if (fullName) {
              names.push(fullName);
            }
          }
        });

        names.sort((a, b) => a.localeCompare(b));
        setEmployees(names);
      } catch (err) {
        console.error('Error loading employees for Handled By', err);
      }
    };

    loadEmployees();
  }, []);

  // Load GCash QR code from settings
  useEffect(() => {
    const loadGcashQr = async () => {
      try {
        const gcashDoc = await getDoc(doc(db, 'settings', 'gcash'));
        if (gcashDoc.exists() && gcashDoc.data().qrUrl) {
          setGcashQrDataUrl(gcashDoc.data().qrUrl);
        }
      } catch (err) {
        console.error('Failed to load GCash QR:', err);
      }
    };
    loadGcashQr();
  }, []);

  // Load required fields settings from Firestore
  useEffect(() => {
    const loadRequiredFields = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'requiredFields'));
        if (settingsDoc.exists() && settingsDoc.data().newTransaction) {
          const nt = settingsDoc.data().newTransaction;
          setRequiredFields({
            name: nt.customerName ?? false,
            contact: nt.contactNumber ?? false,
            email: nt.email ?? false,
            handledBy: nt.handledBy ?? true,
          });
        }
      } catch (err) {
        console.error('Failed to load required fields:', err);
      }
    };
    loadRequiredFields();
  }, []);

  // Load products (from inventory) and services for Step 2 lists
  useEffect(() => {
    const loadProductsAndServices = async () => {
      try {
        // Load inventory as products
        const inventoryRef = collection(db, 'inventory');
        const inventorySnap = await getDocs(inventoryRef);
        const loadedProducts: {
          id: string;
          name: string;
          price: number; // effective price
          type: 'product';
          itemId: string;
          itemType: string;
          availableStock: number;
          inventoryDocId: string;
          basePrice: number;
          discountAmount: number;
          netDiscountAmount: number;
        }[] = [];

        inventorySnap.forEach(docSnap => {
          const data = docSnap.data() as any;
          const status = (data.status ?? '').toString().toLowerCase();
          if (status === 'in stock' || status === 'restock') {
            const brand = (data.brand ?? '').toString();
            const itemName = (data.itemName ?? '').toString();
            const sellingPriceNum = Number(data.sellingPrice ?? 0);
            const defaultDiscountRaw = (data.defaultDiscount ?? '').toString().trim();
            const defaultMarkupRaw = (data.defaultMarkup ?? '').toString().trim();
            const discountAmount = defaultDiscountRaw === '' ? 0 : Number(defaultDiscountRaw);
            const markupAmount = defaultMarkupRaw === '' ? 0 : Number(defaultMarkupRaw);
            const basePrice = isNaN(sellingPriceNum) ? 0 : sellingPriceNum;
            const effectivePrice = Math.max(basePrice - (isNaN(discountAmount) ? 0 : discountAmount) + (isNaN(markupAmount) ? 0 : markupAmount), 0);
            const netDiscountAmount = Math.max(basePrice - effectivePrice, 0);
            const id = (data.itemId ?? docSnap.id).toString();
            const itemType = (data.itemType ?? data.type ?? '').toString();
            const availableStockNum = Number(data.availableStock ?? 0);

            if (itemName) {
              const displayName = brand ? `${brand} - ${itemName}` : itemName;
              loadedProducts.push({
                id,
                name: displayName,
                price: isNaN(effectivePrice) ? 0 : effectivePrice,
                type: 'product',
                itemId: id,
                itemType,
                availableStock: isNaN(availableStockNum) ? 0 : availableStockNum,
                inventoryDocId: docSnap.id,
                basePrice,
                discountAmount: isNaN(discountAmount) ? 0 : discountAmount,
                netDiscountAmount: isNaN(netDiscountAmount) ? 0 : netDiscountAmount,
              });
            }
          }
        });

        loadedProducts.sort((a, b) => a.name.localeCompare(b.name));
        setProducts(loadedProducts);

        // Load services
        const servicesSnap = await getDocs(collection(db, 'services'));
        const rows: { id: string; name: string; price: number; description: string; type: 'service' }[] = [];
        servicesSnap.forEach(docSnap => {
          const data = docSnap.data() as any;
          const status = (data.status ?? '').toString().toLowerCase();
          if (status === 'active') {
            const id = (data.serviceId ?? docSnap.id).toString();
            const name = (data.name ?? '').toString();
            const priceNum = Number(data.price ?? 0);
            const description = (data.description ?? '').toString();
            if (name) {
              rows.push({
                id,
                name,
                price: isNaN(priceNum) ? 0 : priceNum,
                description,
                type: 'service',
              });
            }
          }
        });
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setServices(rows);
      } catch (err) {
        console.error('Error loading products/services for New Transaction step 2', err);
      }
    };

    loadProductsAndServices();
  }, []);

  const openCustomerLov = async () => {
    setIsCustomerLovOpen(true);
    if (customerLovItems.length > 0 || isLoadingCustomers) return;

    setIsLoadingCustomers(true);
    setCustomerLovError(null);
    try {
      const snap = await getDocs(collection(db, 'customers'));
      const rows: {
        id: string;
        name: string;
        contact: string;
        email: string;
        address: string;
      }[] = [];

      snap.forEach(docSnap => {
        const data = docSnap.data() as any;
        rows.push({
          id: docSnap.id,
          name: (data.name ?? '').toString(),
          contact: (data.contact ?? '').toString(),
          email: (data.email ?? '').toString(),
          address: (data.address ?? '').toString(),
        });
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      setCustomerLovItems(rows);
    } catch (err) {
      console.error('Error loading customers for LOV', err);
      setCustomerLovError('Failed to load customers. Please try again.');
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  const handleSelectCustomerFromLov = (item: {
    id: string;
    name: string;
    contact: string;
    email: string;
    address: string;
  }) => {
    setCustomer({
      name: item.name,
      contact: item.contact,
      email: item.email,
      address: item.address,
    });
    setSelectedCustomerId(item.id);
    setIsNewCustomer(false);
    setIsCustomerLovOpen(false);
  };

  const [handledBy, setHandledBy] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState({
    type: 'cash', // 'cash' | 'gcash'
    amountPaid: 0,
    change: 0
  });
  const [isChangeGivenConfirmed, setIsChangeGivenConfirmed] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<'Pending' | 'Complete'>('Complete');
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isSummaryEditMode, setIsSummaryEditMode] = useState(false);
  const [lastTransactionId, setLastTransactionId] = useState<string | null>(null);
  const [editableTransaction, setEditableTransaction] = useState<any | null>(null);
  const [lastSavedTransaction, setLastSavedTransaction] = useState<any | null>(null);

  // Post-transaction customer save prompt
  const [isAddCustomerPromptOpen, setIsAddCustomerPromptOpen] = useState(false);
  const [pendingCustomerForSave, setPendingCustomerForSave] = useState<{
    name: string;
    contact: string;
    email: string;
    address: string;
  } | null>(null);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [addCustomerError, setAddCustomerError] = useState<string | null>(null);

  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [serviceSearchTerm, setServiceSearchTerm] = useState('');
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);

  const [expandedCartItemId, setExpandedCartItemId] = useState<string | null>(null);

  const MAX_VISIBLE_ROWS = 4;

  const normalizeOptionalField = (value: string) => {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? 'N/A' : trimmed;
  };

  const getCustomerInitials = (fullName: string) => {
    const cleaned = (fullName ?? '').trim();
    if (!cleaned) return 'NA';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const initials = parts.map(p => p[0]?.toUpperCase() ?? '').join('');
    return initials || 'NA';
  };

  const generateCustomCustomerId = async () => {
    const initials = getCustomerInitials(user?.name || '');

    let maxSequence = 0;
    try {
      const snap = await getDocs(collection(db, 'customers'));
      snap.forEach(docSnap => {
        const data = docSnap.data() as any;
        const existingId = (data.customerId ?? '').toString();
        if (existingId.startsWith(`${initials}-`)) {
          const parts = existingId.split('-');
          const last = parts[parts.length - 1];
          const num = parseInt(last, 10);
          if (!isNaN(num) && num > maxSequence) {
            maxSequence = num;
          }
        }
      });
    } catch (err) {
      console.error('Error calculating next customer sequence, defaulting to 0', err);
    }

    const next = maxSequence + 1;
    const padded = next.toString().padStart(3, '0');
    return `${initials}-${padded}`;
  };

  const generateCustomTransactionId = async (
    type: 'Parts only' | 'Service only' | 'Parts & Service' | null,
    customerName: string,
    paymentType: 'cash' | 'gcash',
  ) => {
    let typeCode: 'P' | 'S' | 'B' | 'U' = 'U';
    if (type === 'Parts only') typeCode = 'P';
    else if (type === 'Service only') typeCode = 'S';
    else if (type === 'Parts & Service') typeCode = 'B';

    const initials = getCustomerInitials(customerName);
    const paymentCode: 'C' | 'G' = paymentType === 'gcash' ? 'G' : 'C';

    // Count existing transactions of this typeCode to determine the next sequence number
    let sequence = 1;
    try {
      const txRef = collection(db, 'transactions');
      const q = query(txRef, where('transactionTypeCode', '==', typeCode));
      const snap = await getDocs(q);
      sequence = snap.size + 1;
    } catch (err) {
      console.error('Error generating transaction sequence, defaulting to 1', err);
    }

    const customId = `${typeCode}-${initials}-${paymentCode}-${sequence}`;

    return {
      customId,
      typeCode,
      paymentCode,
      sequence,
    };
  };

  const canGoToItems = () => {
    if (requiredFields.name && !customer.name.trim()) return false;
    if (requiredFields.contact && !customer.contact.trim()) return false;
    if (requiredFields.email && !customer.email.trim()) return false;
    if (requiredFields.handledBy && !handledBy.trim()) return false;
    return true;
  };

  // Compute subtotal for a single cart item, including any per-item adjustment
  const computeItemSubtotal = (item: CartItem): number => {
    const unitPrice = item.price || 0;
    const quantity = item.quantity || 0;

    const adjustmentType = item.adjustmentType ?? 'none';
    const rawSpecialUnits = item.specialUnits ?? 0;
    const adjustmentPerUnit = item.adjustmentPerUnit ?? 0;

    if (adjustmentType === 'none' || adjustmentPerUnit <= 0 || rawSpecialUnits <= 0) {
      return quantity * unitPrice;
    }

    const specialUnits = Math.min(Math.max(rawSpecialUnits, 0), quantity);
    const normalUnits = Math.max(quantity - specialUnits, 0);

    let specialPrice = unitPrice;
    if (adjustmentType === 'discount') {
      specialPrice = Math.max(unitPrice - adjustmentPerUnit, 0);
    } else if (adjustmentType === 'markup') {
      specialPrice = unitPrice + adjustmentPerUnit;
    }

    return normalUnits * unitPrice + specialUnits * specialPrice;
  };

  const handleAddToCart = (item: { id: string; name: string; price: number; type: 'product' | 'service' }) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        const updatedQuantity = existing.quantity + 1;
        const updated: CartItem = {
          ...existing,
          quantity: updatedQuantity,
          // Ensure specialUnits never exceeds quantity
          specialUnits: Math.min(existing.specialUnits ?? 0, updatedQuantity),
        };
        updated.subtotal = computeItemSubtotal(updated);
        return prev.map(i => (i.id === item.id ? updated : i));
      }

      const initial: CartItem = {
        ...item,
        quantity: 1,
        subtotal: 0,
        adjustmentType: 'none',
        specialUnits: 0,
        adjustmentPerUnit: 0,
      };
      initial.subtotal = computeItemSubtotal(initial);
      return [...prev, initial];
    });
  };

  const updateQuantity = (id: string, change: number) => {
    setCart(prev => {
      const item = prev.find(i => i.id === id);
      if (!item) return prev;

      const newQuantity = item.quantity + change;
      if (newQuantity <= 0) {
        return prev.filter(i => i.id !== id);
      }

      const updated: CartItem = {
        ...item,
        quantity: newQuantity,
        // Clamp specialUnits to the new quantity
        specialUnits: Math.min(item.specialUnits ?? 0, newQuantity),
      };
      updated.subtotal = computeItemSubtotal(updated);

      return prev.map(i => (i.id === id ? updated : i));
    });
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + computeItemSubtotal(item), 0);
  };

  const transactionType: 'Parts only' | 'Service only' | 'Parts & Service' | null = (() => {
    if (cart.length === 0) return null;
    const hasParts = cart.some(item => item.type === 'product');
    const hasService = cart.some(item => item.type === 'service');
    if (hasParts && hasService) return 'Parts & Service';
    if (hasParts) return 'Parts only';
    if (hasService) return 'Service only';
    return null;
  })();

  const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'type') {
      const nextType = value as 'cash' | 'gcash';

      // Reset method-specific fields when switching payment method
      setPayment(prev => ({
        ...prev,
        type: nextType,
        amountPaid: nextType === 'gcash' ? 0 : prev.amountPaid,
      }));

      // Clear the opposite method's specific fields and reset confirmation
      if (nextType === 'cash') {
        setGcashReference('');
      } else if (nextType === 'gcash') {
        setPayment(prev => ({ ...prev, amountPaid: 0 }));
      }

      setIsChangeGivenConfirmed(false);
      return;
    }

    setPayment(prev => ({
      ...prev,
      [name]: name === 'amountPaid' ? parseFloat(value) || 0 : value
    }));
  };

  const handleGcashQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        setGcashQrDataUrl(dataUrl);
        try {
          const settingsRef = doc(db, 'settings', 'gcash');
          await setDoc(settingsRef, { qrUrl: dataUrl }, { merge: true });
        } catch (err) {
          console.error('Error saving GCash QR to settings', err);
        }
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = calculateTotal();
    const change = Math.max(payment.amountPaid - total, 0);

    const customerSnapshot = {
      name: normalizeOptionalField(customer.name),
      contact: normalizeOptionalField(customer.contact),
      email: normalizeOptionalField(customer.email),
      address: normalizeOptionalField(customer.address),
    };

    const handledBySnapshot = normalizeOptionalField(handledBy);

    const { customId: customTransactionId, typeCode, paymentCode } = await generateCustomTransactionId(
      transactionType,
      handledBySnapshot,
      payment.type as 'cash' | 'gcash',
    );

    const transactionPayload = {
      transactionCode: customTransactionId,
      transactionTypeCode: typeCode,
      paymentCode,
      customer: customerSnapshot,
      customerIsNew: !!isNewCustomer,
      handledBy: handledBySnapshot,
      items: cart,
      transactionType,
      payment: {
        type: payment.type, // Payment Method: 'cash' | 'gcash'
        amountPaid: payment.amountPaid,
        change,
        gcashReference,
      },
      total,
      date: new Date().toISOString().split('T')[0],
      status: transactionStatus || 'Complete',
    };

    try {
      const transactionsRef = collection(db, 'transactions');
      const batch = writeBatch(db);

      // If this transaction is linked to an existing customer, update that customer doc
      if (selectedCustomerId) {
        const existingCustomerRef = doc(db, 'customers', selectedCustomerId);
        batch.set(
          existingCustomerRef,
          {
            name: customer.name.trim(),
            contact: customer.contact.trim(),
            email: customer.email.trim(),
            address: customer.address.trim(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      }

      // Prepare a new transaction document with a generated ID
      const transactionDocRef = doc(transactionsRef);
      const transactionId = transactionDocRef.id;

      batch.set(transactionDocRef, transactionPayload);

      // Prepare transactionItems documents for each cart item
      const transactionItemsRef = collection(db, 'transactionItems');
      const transactionDate = transactionPayload.date;

      // Accumulate product quantities per inventory document for stock decrement
      const inventoryQuantityByDoc: Record<string, number> = {};

      cart.forEach(item => {
        const itemDocRef = doc(transactionItemsRef);

        const itemPayload = {
          transactionId,
          transactionCode: customTransactionId,
          date: transactionDate,
          customerName: customerSnapshot.name,
          handledBy: handledBySnapshot,
          itemCode: item.id,
          itemName: item.name,
          itemType: item.type,
          quantity: item.quantity,
          unitPrice: item.price,
          totalAmount: item.subtotal,
          transactionType: transactionType ?? 'N/A',
          paymentType: payment.type,
          // Per-item adjustment metadata (optional)
          specialUnits: item.specialUnits ?? 0,
          adjustmentType: item.adjustmentType ?? 'none',
          adjustmentPerUnit: item.adjustmentPerUnit ?? 0,
          adjustmentReason: item.adjustmentReason ?? '',
        };

        batch.set(itemDocRef, itemPayload);

        if (item.type === 'product' && item.inventoryDocId) {
          const key = item.inventoryDocId;
          inventoryQuantityByDoc[key] = (inventoryQuantityByDoc[key] || 0) + item.quantity;
        }
      });

      await batch.commit();

      // Only decrement inventory stock if transaction is marked as Complete
      // Pending transactions do not affect stock until they are completed
      if (transactionStatus === 'Complete') {
        const inventoryEntries = Object.entries(inventoryQuantityByDoc);
        if (inventoryEntries.length > 0) {
          try {
            await Promise.all(
              inventoryEntries.map(async ([inventoryDocId, soldQty]) => {
                const invRef = doc(db, 'inventory', inventoryDocId);
                const snap = await getDoc(invRef);
                if (!snap.exists()) return;
                const data = snap.data() as any;
                const currentStock = Number(data.availableStock ?? 0);
                const currentSold = Number(data.sold ?? 0);
                const newStock = Math.max(currentStock - soldQty, 0);
                const newSold = currentSold + soldQty;
                await updateDoc(invRef, {
                  availableStock: newStock,
                  sold: newSold,
                  updatedAt: new Date().toISOString(),
                });
              }),
            );
          } catch (stockErr) {
            console.error('Error updating inventory stock after transaction', stockErr);
          }
        }
      }

      console.log('Transaction submitted with ID:', transactionId, transactionPayload);

      setLastTransactionId(transactionId);
      setEditableTransaction(transactionPayload);
      setLastSavedTransaction(transactionPayload);
      setIsSummaryEditMode(false);
      setIsSummaryModalOpen(true);

      // After transaction is saved, optionally ask to add customer to system
      const hasMeaningfulCustomerInfo =
        (customer.name && customer.name.trim().length > 0) ||
        (customer.contact && customer.contact.trim().length > 0) ||
        (customer.email && customer.email.trim().length > 0) ||
        (customer.address && customer.address.trim().length > 0);

      if (isNewCustomer && hasMeaningfulCustomerInfo) {
        setPendingCustomerForSave({
          name: customer.name.trim(),
          contact: customer.contact.trim(),
          email: customer.email.trim(),
          address: customer.address.trim(),
        });
        setIsAddCustomerPromptOpen(true);
      }
    } catch (err) {
      console.error('Error saving transaction to Firestore', err);
      alert('There was an error saving the transaction. Please try again.');
    }
  };

  const handleConfirmAddCustomer = async () => {
    if (!pendingCustomerForSave) {
      setIsAddCustomerPromptOpen(false);
      return;
    }

    setIsSavingCustomer(true);
    setAddCustomerError(null);
    try {
      const customerId = await generateCustomCustomerId();
      const customersRef = collection(db, 'customers');
      const customerDocRef = doc(customersRef);
      await setDoc(customerDocRef, {
        customerId,
        name: pendingCustomerForSave.name,
        contact: pendingCustomerForSave.contact,
        email: pendingCustomerForSave.email,
        address: pendingCustomerForSave.address,
        createdAt: new Date().toISOString(),
        createdBy: user?.name || null,
      });

      setIsAddCustomerPromptOpen(false);
      setPendingCustomerForSave(null);
    } catch (err) {
      console.error('Error saving customer record', err);
      setAddCustomerError('Failed to save customer. Please try again.');
    } finally {
      setIsSavingCustomer(false);
    }
  };



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
        backgroundAttachment: 'fixed'
      }} />

      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
        zIndex: 5,
        padding: '2rem',
        flex: 1
      }}>
        {/* Header */}
        <header style={{
          backgroundColor: 'var(--surface)',
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
                  title="Back to Dashboard"
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
                color: 'var(--page-title)',
                margin: 0,
              }}>
                New Transaction
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'var(--primary-text)', fontSize: '0.9rem' }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {user && (
                <button
                  onClick={() => {
                    window.location.href = '/login';
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid var(--logout-button)',
                    color: 'var(--logout-button)',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
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
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
          }}>

            {/* Progress Steps */}
            <div className="flex justify-between mb-8">
              {[1, 2, 3].map((stepNum) => (
                <div key={stepNum} className="flex-1">
                  <div className={`flex flex-col items-center ${step === stepNum ? 'text-blue-600' : step > stepNum ? 'text-green-600' : 'text-gray-400'
                    }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${step === stepNum ? 'bg-blue-100' : step > stepNum ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                      {step > stepNum ? '✓' : stepNum}
                    </div>
                    <span className="text-sm font-medium">
                      {stepNum === 1 ? 'Customer' : stepNum === 2 ? 'Items' : 'Payment'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="rounded-lg shadow-md p-6"
                  style={{
                    backgroundColor: 'var(--surface-elevated)',
                  }}>
              {step === 1 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold mb-4"
                    style={{ color: 'var(--header-title)' }}>Customer Information</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text[var(--text)]">
                        Name{requiredFields.name && <span style={{ color: '#dc2626' }}> *</span>}
                      </label>

                      <div className="mt-1 flex items-stretch gap-2">
                        <input
                          placeholder="Andres Bonifacio"
                          type="text"
                          value={customer.name}
                          onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid var(--control-border)',
                            backgroundColor: 'var(-control-bg)',
                            color: 'var(--text-muted)',
                          }}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          required={requiredFields.name}
                        />
                        <button
                          type="button"
                          onClick={openCustomerLov}
                          title="Select from saved customers"
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid var(--control-border)',
                            backgroundColor: 'var(--control-bg)',
                            color: 'var(--control-text)',
                            cursor: 'pointer',
                            minWidth: '2.5rem',
                          }}
                          className="border-gray-300 hover:bg-gray-50 flex items-center justify-center text-sm"
                        >
                          ...
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text[var(--text)]">
                        Contact Number{requiredFields.contact && <span style={{ color: '#dc2626' }}> *</span>}
                      </label>

                      <input
                        placeholder="09123456789"
                        type="tel"
                        value={customer.contact}
                        onChange={(e) => setCustomer({ ...customer, contact: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid var(--control-border)',
                          backgroundColor: 'var(-control-bg)',
                          color: 'var(--text-muted)',
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        required={requiredFields.contact}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text[var(--text)]">
                        Email{requiredFields.email && <span style={{ color: '#dc2626' }}> *</span>}
                      </label>

                      <input
                        placeholder="andres.bonifacio@email.com"
                        type="email"
                        value={customer.email}
                        onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid var(--control-border)',
                          backgroundColor: 'var(-control-bg)',
                          color: 'var(--text-muted)',
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        required={requiredFields.email}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text[var(--text)]">
                        Handled By{requiredFields.handledBy && <span style={{ color: '#dc2626' }}> *</span>}
                      </label>

                      <select
                        value={handledBy}
                        onChange={(e) => setHandledBy(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          border: '1px solid var(--control-border)',
                          backgroundColor: 'var(-control-bg)',
                          color: 'var(--text-muted)',
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        required={requiredFields.handledBy}
                      >
                        <option value="">Select employee</option>
                        {employees.map(emp => (
                          <option key={emp} value={emp}>{emp}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {canAddCustomer && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                      <Switch
                        checked={isNewCustomer}
                        onChange={(checked) => {
                          setIsNewCustomer(checked);
                          if (checked) {
                            // switching back to new customer mode, clear any selected existing id
                            setSelectedCustomerId(null);
                          }
                        }}
                        size="sm"
                      />
                      <span className="select-none"
                        style={{
                          color: 'var(--text)',
                        }}>
                        New customer
                      </span>
                    </div>
                  )}
                  <div className="flex justify-end mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        if (canGoToItems()) {
                          setStep(2);
                        }
                      }}
                      disabled={!canGoToItems()}
                      className={`px-4 py-2 rounded-md text-white ${canGoToItems() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
                    >
                      Next: Add Items
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold" style={{ color: '#1e40af' }}>Add Items</h2>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
                    {/* Left: Products & Services lists */}
                    <div className="lg:col-span-2 space-y-4">
                      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <h3 className="font-medium text-gray-800">Products</h3>
                          <div className="relative w-64 max-w-full">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <FaSearch className="text-gray-400" />
                            </div>
                            <input
                              type="text"
                              placeholder="Search products..."
                              value={productSearchTerm}
                              onChange={(e) => setProductSearchTerm(e.target.value)}
                              className="block w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                        </div>
                        {(() => {
                          const filteredProducts = products.filter(p =>
                            p.name.toLowerCase().includes(productSearchTerm.toLowerCase())
                          );
                          const visibleProducts = showAllProducts
                            ? filteredProducts
                            : filteredProducts.slice(0, MAX_VISIBLE_ROWS);

                          if (filteredProducts.length === 0) {
                            return <p className="text-sm text-gray-500 text-center py-2">No matching products.</p>;
                          }

                          return (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {visibleProducts.map(product => (
                                  <div
                                    key={product.id}
                                    className="flex flex-col justify-between p-3 rounded-md border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                                  >
                                    <div>
                                      <p className="font-medium text-gray-900 truncate" title={product.name}>{product.name}</p>
                                      {product.discountAmount > 0 ? (
                                        <p className="text-sm text-gray-600">
                                          <span className="line-through text-gray-400 mr-1">
                                            ₱{product.basePrice.toFixed(2)}
                                          </span>
                                          <span className="font-semibold text-green-700">
                                            ₱{product.price.toFixed(2)}
                                          </span>
                                        </p>
                                      ) : (
                                        <p className="text-sm text-gray-600">
                                          ₱{product.price.toFixed(2)}
                                        </p>
                                      )}
                                    </div>
                                    <div className="mt-3 flex justify-between gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleAddToCart(product)}
                                        className="flex-1 px-3 py-1 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                                      >
                                        Add
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedProductForDetails(product);
                                          setIsProductDetailsOpen(true);
                                        }}
                                        className="flex-1 px-3 py-1 rounded-md text-sm font-medium text-blue-700 bg-white border border-blue-200 hover:bg-blue-50"
                                      >
                                        Details
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {filteredProducts.length > MAX_VISIBLE_ROWS && (
                                <div className="mt-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setShowAllProducts(prev => !prev)}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                  >
                                    {showAllProducts
                                      ? 'Show less'
                                      : `Show all ${filteredProducts.length} products`}
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <h3 className="font-medium text-gray-800">Services</h3>
                          <div className="relative w-64 max-w-full">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <FaSearch className="text-gray-400" />
                            </div>
                            <input
                              type="text"
                              placeholder="Search services..."
                              value={serviceSearchTerm}
                              onChange={(e) => setServiceSearchTerm(e.target.value)}
                              className="block w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                              style={{ color: '#111827' }}
                            />
                          </div>
                        </div>
                        {(() => {
                          const filteredServices = services.filter(s =>
                            s.name.toLowerCase().includes(serviceSearchTerm.toLowerCase())
                          );
                          const visibleServices = showAllServices
                            ? filteredServices
                            : filteredServices.slice(0, MAX_VISIBLE_ROWS);

                          if (filteredServices.length === 0) {
                            return <p className="text-sm text-gray-500 text-center py-2">No matching services.</p>;
                          }

                          return (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {visibleServices.map(service => (
                                  <div
                                    key={service.id}
                                    className="flex flex-col justify-between p-3 rounded-md border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                                  >
                                    <div>
                                      <p className="font-medium text-gray-900 truncate" title={service.name}>{service.name}</p>
                                      <p className="text-sm text-gray-600">₱{service.price.toFixed(2)}</p>
                                    </div>
                                    <div className="mt-3 flex justify-between gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleAddToCart(service)}
                                        className="flex-1 px-3 py-1 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                                      >
                                        Add
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedServiceForDetails(service);
                                          setIsServiceDetailsOpen(true);
                                        }}
                                        className="flex-1 px-3 py-1 rounded-md text-sm font-medium text-blue-700 bg-white border border-blue-200 hover:bg-blue-50"
                                      >
                                        Details
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {filteredServices.length > MAX_VISIBLE_ROWS && (
                                <div className="mt-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setShowAllServices(prev => !prev)}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                  >
                                    {showAllServices
                                      ? 'Show less'
                                      : `Show all ${filteredServices.length} services`}
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Right: Order Summary */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col">
                      <h3 className="font-medium text-gray-800 mb-3">Order Summary</h3>
                      {cart.length === 0 ? (
                        <p className="text-gray-500 text-center py-6 text-sm">No items added yet. Use the Add buttons on the left.</p>
                      ) : (
                        <>
                          <div className="space-y-3 mb-4 overflow-y-auto pr-1">
                            {cart.map(item => {
                              const isExpanded = expandedCartItemId === item.id;
                              const specialUnits = item.specialUnits ?? 0;
                              const adjustmentType = item.adjustmentType ?? 'none';
                              const adjustmentPerUnit = item.adjustmentPerUnit ?? 0;

                              const handleUpdateItem = (updater: (current: CartItem) => CartItem) => {
                                setCart(prev => prev.map(ci => {
                                  if (ci.id !== item.id) return ci;
                                  const updated = updater(ci);
                                  return { ...updated, subtotal: computeItemSubtotal(updated) };
                                }));
                              };

                              return (
                                <div
                                  key={item.id}
                                  className="border-b border-gray-100 pb-2 last:border-b-0 last:pb-0"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="pr-2">
                                      <p className="font-medium text-gray-900">{item.name}</p>
                                      <p className="text-xs text-gray-500 capitalize">{item.type}</p>
                                      {item.type === 'product' && item.basePrice !== undefined && item.discountAmount && item.discountAmount > 0 ? (
                                        <p className="text-xs text-gray-700 mt-1">
                                          <span className="line-through text-gray-400 mr-1">
                                            ₱{item.basePrice.toFixed(2)}
                                          </span>
                                          <span>₱{item.price.toFixed(2)} each</span>
                                        </p>
                                      ) : (
                                        <p className="text-xs text-gray-700 mt-1">₱{item.price.toFixed(2)} each</p>
                                      )}
                                      {adjustmentType !== 'none' && adjustmentPerUnit > 0 && specialUnits > 0 && (
                                        <p className="mt-1 text-[11px] text-blue-700">
                                          {specialUnits} unit{specialUnits !== 1 ? 's' : ''} with
                                          {adjustmentType === 'discount' ? ' discount' : ' markup'} of ₱{adjustmentPerUnit.toFixed(2)} each
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex flex-col items-end space-y-1">
                                      <div className="flex items-center space-x-2">
                                        <button
                                          type="button"
                                          onClick={() => updateQuantity(item.id, -1)}
                                          className="p-1 text-gray-500 hover:text-gray-700 border border-gray-300 rounded"
                                        >
                                          <FaMinus size={10} />
                                        </button>
                                        <span className="text-sm font-medium text-gray-800 w-6 text-center">{item.quantity}</span>
                                        <button
                                          type="button"
                                          onClick={() => updateQuantity(item.id, 1)}
                                          className="p-1 text-gray-500 hover:text-gray-700 border border-gray-300 rounded"
                                        >
                                          <FaPlus size={10} />
                                        </button>
                                      </div>
                                      <div className="text-sm font-semibold text-gray-900">
                                        ₱{item.subtotal.toFixed(2)}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => updateQuantity(item.id, -item.quantity)}
                                        className="text-xs text-red-600 hover:text-red-700"
                                      >
                                        Remove
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setExpandedCartItemId(isExpanded ? null : item.id)}
                                        className="text-[11px] text-blue-600 hover:text-blue-800 mt-1 whitespace-nowrap"
                                      >
                                        {isExpanded ? 'Hide discount / markup ▲' : 'Discount / Markup ▼'}
                                      </button>
                                    </div>
                                  </div>

                                  {isExpanded && (
                                    <div className="mt-2 rounded-md bg-gray-50 px-2 py-2 text-[11px] text-gray-800 space-y-2">
                                      {/* Special units counter */}
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="whitespace-nowrap">Units with special price</span>
                                        <div className="flex items-center space-x-1">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateItem(current => {
                                                const qty = current.quantity || 0;
                                                const next = Math.max(Math.min((current.specialUnits ?? 0) - 1, qty), 0);
                                                return { ...current, specialUnits: next };
                                              })
                                            }
                                            className="px-1 py-0.5 border border-gray-300 rounded text-gray-600 hover:text-gray-800"
                                          >
                                            -
                                          </button>
                                          <span className="w-6 text-center text-xs font-medium">
                                            {specialUnits}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateItem(current => {
                                                const qty = current.quantity || 0;
                                                const next = Math.min((current.specialUnits ?? 0) + 1, qty);
                                                return { ...current, specialUnits: next };
                                              })
                                            }
                                            className="px-1 py-0.5 border border-gray-300 rounded text-gray-600 hover:text-gray-800"
                                          >
                                            +
                                          </button>
                                          <span className="text-[10px] text-gray-500">/ {item.quantity}</span>
                                        </div>
                                      </div>

                                      {/* Discount / Markup per unit */}
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block mb-0.5 text-[10px] text-gray-600">Discount per unit (₱)</label>
                                          <input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={adjustmentType === 'discount' ? adjustmentPerUnit || '' : ''}
                                            onChange={e => {
                                              const value = parseFloat(e.target.value || '0');
                                              handleUpdateItem(current => ({
                                                ...current,
                                                adjustmentType: value > 0 ? 'discount' : 'none',
                                                adjustmentPerUnit: value > 0 ? value : 0,
                                              }));
                                            }}
                                            className="w-full border border-gray-300 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                          />
                                        </div>
                                        <div>
                                          <label className="block mb-0.5 text-[10px] text-gray-600">Markup per unit (₱)</label>
                                          <input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={adjustmentType === 'markup' ? adjustmentPerUnit || '' : ''}
                                            onChange={e => {
                                              const value = parseFloat(e.target.value || '0');
                                              handleUpdateItem(current => ({
                                                ...current,
                                                adjustmentType: value > 0 ? 'markup' : 'none',
                                                adjustmentPerUnit: value > 0 ? value : 0,
                                              }));
                                            }}
                                            className="w-full border border-gray-300 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                          />
                                        </div>
                                      </div>

                                      {/* Reason */}
                                      <div>
                                        <label className="block mb-0.5 text-[10px] text-gray-600">Reason</label>
                                        <input
                                          type="text"
                                          value={item.adjustmentReason ?? ''}
                                          onChange={e =>
                                            handleUpdateItem(current => ({
                                              ...current,
                                              adjustmentReason: e.target.value,
                                            }))
                                          }
                                          placeholder="e.g. Loyal customer discount"
                                          className="w-full border border-gray-300 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-auto pt-3 border-t border-gray-200">
                            <div className="flex justify-between items-center mb-1 text-sm text-gray-600">
                              <span>Items</span>
                              <span>{cart.reduce((sum, i) => sum + i.quantity, 0)}</span>
                            </div>
                            <div className="flex justify-between items-center font-semibold text-gray-900 text-base">
                              <span>Total</span>
                              <span>₱{calculateTotal().toFixed(2)}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between mt-8">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      disabled={cart.length === 0}
                      className={`px-4 py-2 rounded-md text-white ${cart.length > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
                        }`}
                    >
                      Next: Review & Pay
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <h2 className="text-lg font-semibold" style={{ color: '#1e40af' }}>Review & Payment</h2>

                  {/* Order Summary */}
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h3 className="font-medium text-gray-700 mb-3">Order Summary</h3>
                    <div className="space-y-2">
                      {cart.map(item => {
                        const specialUnits = item.specialUnits ?? 0;
                        const adjustmentType = item.adjustmentType ?? 'none';
                        const adjustmentPerUnit = item.adjustmentPerUnit ?? 0;

                        const hasAdjustment =
                          adjustmentType !== 'none' &&
                          adjustmentPerUnit > 0 &&
                          specialUnits > 0;

                        return (
                          <div key={item.id} className="flex justify-between" style={{ color: '#111827' }}>
                            <div className="mr-3">
                              <div>
                                {item.quantity}x {item.name}
                              </div>
                              {hasAdjustment && (
                                <div className="text-xs text-blue-700 mt-0.5">
                                  {specialUnits} unit{specialUnits !== 1 ? 's' : ''} with
                                  {adjustmentType === 'discount' ? ' discount' : ' markup'} of ₱{adjustmentPerUnit.toFixed(2)} each
                                </div>
                              )}
                            </div>
                            <span>₱{item.subtotal.toFixed(2)}</span>
                          </div>
                        );
                      })}
                      <div className="border-t border-gray-200 pt-2 mt-2 font-bold flex justify-between">
                        <span style={{ color: '#111827' }}>Total:</span>
                        <span style={{ color: '#111827' }}>₱{calculateTotal().toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-700">Payment Method</h3>
                    <div className="grid grid-cols-2 gap-3"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#f9fafb',
                      }}>
                      {['Cash', 'GCash'].map(method => (
                        <label key={method} className="flex items-center space-x-2 p-3 border rounded-md hover:bg-gray-50">
                          <input
                            type="radio"
                            name="type"
                            value={method.toLowerCase()}
                            checked={payment.type === method.toLowerCase()}
                            onChange={handlePaymentChange}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                          />
                          <span style={{ color: '#111827' }}>{method}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Cash payment fields */}
                  {payment.type === 'cash' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Amount Paid</label>
                        <input
                          type="number"
                          name="amountPaid"
                          value={payment.amountPaid || ''}
                          onChange={handlePaymentChange}
                          min={calculateTotal()}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827',
                          }}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <div className="text-sm flex justify-between">
                        <span className="text-gray-700">Change:</span>
                        <span className="font-medium text-gray-900">
                          ₱{Math.max(payment.amountPaid - calculateTotal(), 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-700">
                        <Switch
                          checked={isChangeGivenConfirmed}
                          onChange={(checked) => setIsChangeGivenConfirmed(checked)}
                          size="sm"
                        />
                        <span>Change given to customer</span>
                      </div>
                    </div>
                  )}

                  {/* GCash payment fields */}
                  {payment.type === 'gcash' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">GCash QR Code</label>
                        <div className="flex items-center justify-center border border-dashed border-gray-300 rounded-md p-4 bg-gray-50">
                          {gcashQrDataUrl ? (
                            <img
                              src={gcashQrDataUrl}
                              alt="GCash QR"
                              style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'contain' }}
                            />
                          ) : (
                            <span className="text-sm text-gray-500 text-center">
                              No GCash QR configured. Upload one in New Transaction Settings.
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">GCash Reference Number</label>
                        <input
                          type="text"
                          value={gcashReference}
                          onChange={(e) => setGcashReference(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#f9fafb',
                            color: '#111827',
                          }}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder="Enter GCash reference number"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between pt-4 border-t">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <div className="space-x-3">
                      <button
                        type="submit"
                        onClick={() => setTransactionStatus('Pending')}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                      >
                        Mark as Pending
                      </button>
                      <button
                        type="submit"
                        onClick={() => setTransactionStatus('Complete')}
                        disabled={
                          (payment.type === 'cash' && (payment.amountPaid < calculateTotal() || !isChangeGivenConfirmed)) ||
                          (payment.type === 'gcash' && gcashReference.trim().length === 0)
                        }
                        className={`px-4 py-2 rounded-md text-white ${(payment.type === 'cash' && payment.amountPaid >= calculateTotal() && isChangeGivenConfirmed) ||
                          (payment.type === 'gcash' && gcashReference.trim().length > 0)
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-400 cursor-not-allowed'
                          }`}
                      >
                        <FaSave className="inline mr-2" />
                        Mark as Complete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </main>
      </div>

      <Footer />

      {/* Customer LOV Modal */}
      {isCustomerLovOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2200,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem 2rem',
              maxWidth: '720px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  margin: 0,
                  color: '#111827',
                }}
              >
                Select Customer
              </h2>
              <button
                type="button"
                onClick={() => setIsCustomerLovOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  color: '#6b7280',
                }}
              >
                <FaTimes />
              </button>
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <input
                type="text"
                value={customerLovSearch}
                onChange={(e) => setCustomerLovSearch(e.target.value)}
                placeholder="Search by name, contact, or email"
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                style={{ backgroundColor: 'white', color: '#111827' }}
              />
            </div>

            {customerLovError && (
              <div className="mb-3 text-sm text-red-600">
                {customerLovError}
              </div>
            )}

            {isLoadingCustomers ? (
              <p className="text-sm text-gray-500">Loading customers...</p>
            ) : (
              (() => {
                const term = customerLovSearch.toLowerCase();
                const filtered = customerLovItems.filter((c) => {
                  const name = (c.name || '').toLowerCase();
                  const contact = (c.contact || '').toLowerCase();
                  const email = (c.email || '').toLowerCase();
                  return (
                    term === '' ||
                    name.includes(term) ||
                    contact.includes(term) ||
                    email.includes(term)
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <p className="text-sm text-gray-500">
                      No customers found.
                    </p>
                  );
                }

                return (
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-gray-600">
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Contact</th>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2">Address</th>
                          <th className="px-3 py-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c) => (
                          <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
                            <td className="px-3 py-2 text-gray-900" onClick={() => handleSelectCustomerFromLov(c)}>{c.name || '-'}</td>
                            <td className="px-3 py-2 text-gray-700" onClick={() => handleSelectCustomerFromLov(c)}>{c.contact || '-'}</td>
                            <td className="px-3 py-2 text-gray-700" onClick={() => handleSelectCustomerFromLov(c)}>{c.email || '-'}</td>
                            <td className="px-3 py-2 text-gray-700" onClick={() => handleSelectCustomerFromLov(c)}>{c.address || '-'}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleSelectCustomerFromLov(c)}
                                className="px-3 py-1 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700"
                              >
                                Select
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Add Customer Prompt Modal */}
      {isAddCustomerPromptOpen && (
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  margin: 0,
                  color: '#111827',
                }}
              >
                Add Customer
              </h2>
              <button
                type="button"
                onClick={() => setIsAddCustomerPromptOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  color: '#6b7280',
                }}
              >
                <FaTimes />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Do you want to add this customer to the system for future use?
              </p>
              {pendingCustomerForSave && (
                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2 space-y-0.5">
                  <p><strong>Name:</strong> {pendingCustomerForSave.name || 'N/A'}</p>
                  <p><strong>Contact:</strong> {pendingCustomerForSave.contact || 'N/A'}</p>
                  <p><strong>Email:</strong> {pendingCustomerForSave.email || 'N/A'}</p>
                </div>
              )}
              {addCustomerError && (
                <div className="text-xs text-red-600">
                  {addCustomerError}
                </div>
              )}
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => !isSavingCustomer && setIsAddCustomerPromptOpen(false)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  disabled={isSavingCustomer}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddCustomer}
                  className="px-4 py-2 rounded-md border border-transparent text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                  disabled={isSavingCustomer}
                >
                  {isSavingCustomer ? 'Saving...' : 'Yes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Details Modal */}
      {isProductDetailsOpen && selectedProductForDetails && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2200,
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h2
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  margin: 0,
                  color: '#111827',
                }}
              >
                Product Details
              </h2>
              <button
                type="button"
                onClick={() => setIsProductDetailsOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  color: '#6b7280',
                }}
              >
                <FaTimes />
              </button>
            </div>

            <div className="space-y-2 text-sm text-gray-800">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Product</p>
                <p className="font-medium text-gray-900">{selectedProductForDetails.name}</p>
                <p className="text-sm text-gray-600">
                  ₱{selectedProductForDetails.price.toFixed(2)}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Item ID</p>
                  <p className="text-sm text-gray-800 break-all">{selectedProductForDetails.itemId || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Item Type</p>
                  <p className="text-sm text-gray-800">{selectedProductForDetails.itemType || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Available Stock</p>
                  <p className="text-sm text-gray-800">{selectedProductForDetails.availableStock}</p>
                </div>
              </div>

              <div className="mt-4 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsProductDetailsOpen(false)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleAddToCart(selectedProductForDetails);
                    setIsProductDetailsOpen(false);
                  }}
                  className="px-4 py-2 rounded-md border border-transparent text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Add to Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Summary Modal (for Pending/Complete) */}
      {isSummaryModalOpen && editableTransaction && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2300,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0, color: '#111827' }}>
                Transaction Summary
              </h2>
              <button
                type="button"
                onClick={() => setIsSummaryModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  color: '#6b7280',
                }}
              >
                <FaTimes />
              </button>
            </div>

            {/* Customer & meta section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Customer Details</h3>
                {!isSummaryEditMode ? (
                  <div className="text-sm text-gray-800 space-y-1">
                    <p><strong>Name:</strong> {editableTransaction.customer?.name || '-'}</p>
                    <p><strong>Contact:</strong> {editableTransaction.customer?.contact || '-'}</p>
                    <p><strong>Email:</strong> {editableTransaction.customer?.email || '-'}</p>
                    <p><strong>Address:</strong> {editableTransaction.customer?.address || '-'}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editableTransaction.customer?.name || ''}
                      onChange={(e) => setEditableTransaction((prev: any) => ({
                        ...prev,
                        customer: { ...prev.customer, name: e.target.value },
                      }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                      placeholder="Customer name"
                    />
                    <input
                      type="text"
                      value={editableTransaction.customer?.contact || ''}
                      onChange={(e) => setEditableTransaction((prev: any) => ({
                        ...prev,
                        customer: { ...prev.customer, contact: e.target.value },
                      }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                      placeholder="Contact number"
                    />
                    <input
                      type="email"
                      value={editableTransaction.customer?.email || ''}
                      onChange={(e) => setEditableTransaction((prev: any) => ({
                        ...prev,
                        customer: { ...prev.customer, email: e.target.value },
                      }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                      placeholder="Email"
                    />
                    <input
                      type="text"
                      value={editableTransaction.customer?.address || ''}
                      onChange={(e) => setEditableTransaction((prev: any) => ({
                        ...prev,
                        customer: { ...prev.customer, address: e.target.value },
                      }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                      placeholder="Address"
                    />
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Meta</h3>
                <div className="text-sm text-gray-800 space-y-1">
                  {!isSummaryEditMode ? (
                    <>
                      <p><strong>Handled By:</strong> {editableTransaction.handledBy || '-'}</p>
                      <p><strong>Date:</strong> {editableTransaction.date || '-'}</p>
                      <p><strong>Status:</strong> {editableTransaction.status || '-'}</p>
                      <p><strong>Transaction Type:</strong> {editableTransaction.transactionType || '-'}</p>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={editableTransaction.handledBy || ''}
                        onChange={(e) => setEditableTransaction((prev: any) => ({
                          ...prev,
                          handledBy: e.target.value,
                        }))}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm mb-2"
                        placeholder="Handled by"
                      />
                      <p><strong>Date:</strong> {editableTransaction.date || '-'}</p>
                      <p><strong>Status:</strong> {editableTransaction.status || '-'}</p>
                      <p><strong>Transaction Type:</strong> {editableTransaction.transactionType || '-'}</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Items & totals */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Items / Services</h3>
              {editableTransaction.items && editableTransaction.items.length > 0 ? (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-gray-600">
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 text-center">Qty</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                        {isSummaryEditMode && <th className="px-3 py-2 text-center">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {editableTransaction.items.map((item: CartItem, index: number) => (
                        <tr key={index} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{item.name}</td>
                          <td className="px-3 py-2 capitalize text-gray-700">{item.type}</td>
                          <td className="px-3 py-2 text-right text-gray-700">₱{item.price.toFixed(2)}</td>
                          <td className="px-3 py-2 text-center">
                            {!isSummaryEditMode ? (
                              <span>{item.quantity}</span>
                            ) : (
                              <div className="inline-flex items-center space-x-1">
                                <button
                                  type="button"
                                  className="px-2 py-0.5 border border-gray-300 rounded"
                                  onClick={() => setEditableTransaction((prev: any) => {
                                    const updatedItems = [...prev.items];
                                    const current = updatedItems[index];
                                    const newQty = current.quantity - 1;
                                    if (newQty <= 0) {
                                      updatedItems.splice(index, 1);
                                    } else {
                                      updatedItems[index] = {
                                        ...current,
                                        quantity: newQty,
                                        subtotal: newQty * current.price,
                                      };
                                    }
                                    const newTotal = updatedItems.reduce((sum: number, it: CartItem) => sum + it.subtotal, 0);
                                    const newChange = Math.max((prev.payment?.amountPaid || 0) - newTotal, 0);
                                    return {
                                      ...prev,
                                      items: updatedItems,
                                      total: newTotal,
                                      payment: {
                                        ...prev.payment,
                                        change: newChange,
                                      },
                                    };
                                  })}
                                >
                                  -
                                </button>
                                <span>{item.quantity}</span>
                                <button
                                  type="button"
                                  className="px-2 py-0.5 border border-gray-300 rounded"
                                  onClick={() => setEditableTransaction((prev: any) => {
                                    const updatedItems = [...prev.items];
                                    const current = updatedItems[index];
                                    const newQty = current.quantity + 1;
                                    updatedItems[index] = {
                                      ...current,
                                      quantity: newQty,
                                      subtotal: newQty * current.price,
                                    };
                                    const newTotal = updatedItems.reduce((sum: number, it: CartItem) => sum + it.subtotal, 0);
                                    const newChange = Math.max((prev.payment?.amountPaid || 0) - newTotal, 0);
                                    return {
                                      ...prev,
                                      items: updatedItems,
                                      total: newTotal,
                                      payment: {
                                        ...prev.payment,
                                        change: newChange,
                                      },
                                    };
                                  })}
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900">₱{item.subtotal.toFixed(2)}</td>
                          {isSummaryEditMode && (
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                className="text-xs text-red-600 hover:text-red-700"
                                onClick={() => setEditableTransaction((prev: any) => {
                                  const updatedItems = prev.items.filter((_: CartItem, i: number) => i !== index);
                                  const newTotal = updatedItems.reduce((sum: number, it: CartItem) => sum + it.subtotal, 0);
                                  const newChange = Math.max((prev.payment?.amountPaid || 0) - newTotal, 0);
                                  return {
                                    ...prev,
                                    items: updatedItems,
                                    total: newTotal,
                                    payment: {
                                      ...prev.payment,
                                      change: newChange,
                                    },
                                  };
                                })}
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-between items-center px-4 py-2 border-t border-gray-200 bg-gray-50 text-sm font-semibold text-gray-900">
                    <span>Total</span>
                    <span>₱{(editableTransaction.total ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No items.</p>
              )}
            </div>

            {/* Payment section */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Payment</h3>
              {!isSummaryEditMode ? (
                <div className="text-sm text-gray-800 space-y-1">
                  <p><strong>Method:</strong> {editableTransaction.payment?.type === 'gcash' ? 'GCash' : 'Cash'}</p>
                  <p><strong>Amount Paid:</strong> ₱{(editableTransaction.payment?.amountPaid ?? 0).toFixed(2)}</p>
                  <p><strong>Change:</strong> ₱{(editableTransaction.payment?.change ?? 0).toFixed(2)}</p>
                  {editableTransaction.payment?.type === 'gcash' && (
                    <p><strong>GCash Reference:</strong> {editableTransaction.payment?.gcashReference || '-'}</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
                    <select
                      value={editableTransaction.payment?.type || 'cash'}
                      onChange={(e) => {
                        const nextType = e.target.value as 'cash' | 'gcash';
                        setEditableTransaction((prev: any) => ({
                          ...prev,
                          payment: {
                            ...prev.payment,
                            type: nextType,
                          },
                        }));
                      }}
                      className="block w-full rounded-md border-gray-300 shadow-sm"
                    >
                      <option value="cash">Cash</option>
                      <option value="gcash">GCash</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount Paid</label>
                    <input
                      type="number"
                      value={editableTransaction.payment?.amountPaid ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setEditableTransaction((prev: any) => {
                          const newChange = Math.max(val - (prev.total ?? 0), 0);
                          return {
                            ...prev,
                            payment: {
                              ...prev.payment,
                              amountPaid: val,
                              change: newChange,
                            },
                          };
                        });
                      }}
                      className="block w-full rounded-md border-gray-300 shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Change</label>
                    <input
                      type="number"
                      value={editableTransaction.payment?.change ?? 0}
                      readOnly
                      className="block w-full rounded-md border-gray-300 shadow-sm bg-gray-100"
                    />
                  </div>
                  {editableTransaction.payment?.type === 'gcash' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">GCash Reference</label>
                      <input
                        type="text"
                        value={editableTransaction.payment?.gcashReference || ''}
                        onChange={(e) => setEditableTransaction((prev: any) => ({
                          ...prev,
                          payment: {
                            ...prev.payment,
                            gcashReference: e.target.value,
                          },
                        }))}
                        className="block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer buttons */}
            <div className="mt-4 flex justify-between items-center border-t border-gray-200 pt-3">
              <div className="text-xs text-gray-500">
                <span>Transaction Status: </span>
                <span className="font-semibold">{editableTransaction.status}</span>
              </div>
              <div className="space-x-2">
                {!isSummaryEditMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsSummaryEditMode(true)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSummaryModalOpen(false);
                        if (editableTransaction.status === 'Complete') {
                          navigate('/');
                        } else {
                          navigate('/transactions');
                        }
                      }}
                      className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 text-sm"
                    >
                      Finish
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!lastTransactionId || !editableTransaction) return;
                        try {
                          const transactionRef = doc(db, 'transactions', lastTransactionId);
                          await updateDoc(transactionRef, editableTransaction);
                          setLastSavedTransaction(editableTransaction);
                          setIsSummaryEditMode(false);
                          console.log('Transaction updated with ID:', lastTransactionId, editableTransaction);
                        } catch (err) {
                          console.error('Error updating transaction to Firestore', err);
                          alert('There was an error updating the transaction. Please try again.');
                        }
                      }}
                      className="px-4 py-2 rounded-md text-white bg-green-600 hover:bg-green-700 text-sm"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditableTransaction(lastSavedTransaction);
                        setIsSummaryEditMode(false);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service Details Modal */}
      {isServiceDetailsOpen && selectedServiceForDetails && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2050,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, marginBottom: '0.75rem', color: '#111827' }}>
              Service Details
            </h3>
            <div style={{ fontSize: '0.95rem', color: '#111827', marginBottom: '1rem' }}>
              <p style={{ marginBottom: '0.25rem' }}><strong>Name:</strong> {selectedServiceForDetails.name}</p>
              <p style={{ marginBottom: '0.25rem' }}><strong>Service ID:</strong> {selectedServiceForDetails.id}</p>
              <p style={{ marginBottom: '0.25rem' }}><strong>Price:</strong> ₱{selectedServiceForDetails.price.toFixed(2)}</p>
              {selectedServiceForDetails.description && (
                <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                  <strong>Description:</strong> {selectedServiceForDetails.description}
                </p>
              )}
            </div>

            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setIsServiceDetailsOpen(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  marginRight: '0.5rem',
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handleAddToCart(selectedServiceForDetails);
                  setIsServiceDetailsOpen(false);
                }}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Add to Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Transaction Settings Modal */}
      {isSettingsOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, marginBottom: '0.75rem', color: '#111827' }}>
              New Transaction Settings
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              Configure which fields are required when creating a new transaction.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {[
                { key: 'name' as const, label: 'Customer Name' },
                { key: 'contact' as const, label: 'Contact Number' },
                { key: 'email' as const, label: 'Email' },
                { key: 'handledBy' as const, label: 'Handled By' },
              ].map(field => (
                <div
                  key={field.key}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Switch
                    checked={requiredFields[field.key]}
                    onChange={(checked) =>
                      setRequiredFields(prev => ({
                        ...prev,
                        [field.key]: checked,
                      }))
                    }
                    size="sm"
                  />
                  <span style={{ fontSize: '0.9rem', color: '#111827' }}>{field.label}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 500, color: '#111827', marginBottom: '0.25rem' }}>
                GCash QR Code image
              </label>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Upload an image of your GCash QR. This will be shown in Step 3 when GCash is selected.
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={handleGcashQrUpload}
                style={{ fontSize: '0.85rem' }}
              />
              {gcashQrDataUrl && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={gcashQrDataUrl}
                    alt="GCash QR preview"
                    style={{ maxWidth: '150px', maxHeight: '150px', objectFit: 'contain' }}
                  />
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewTransaction;