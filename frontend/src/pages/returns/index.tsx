import { FaHome, FaChevronDown, FaBars, FaWarehouse, FaTag, FaWrench, FaFileInvoice, FaPlus, FaUser, FaSearch, FaTimes, FaUndoAlt, FaFilter, FaCog, FaFileExcel, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, addDoc, writeBatch, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { Footer } from '@/components/Footer';
import { can } from '../../config/permissions';
import { db } from '../../lib/firebase';
import logo from '../../assets/logo.png';
import { HeaderDropdown } from '../../components/HeaderDropdown';

type TransactionRow = {
  id: string; // Firestore document ID
  transactionCode: string;
  date: string;
  customerName: string;
  transactionType: string;
  total: number;
  paymentType: string;
  handledBy?: string | null;
};

export const Returns: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  let closeMenuTimeout: number | undefined;

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [isReturnDetailsExpanded, setIsReturnDetailsExpanded] = useState(false);
  const userRoles = user?.roles?.length ? user.roles : (user?.role ? [user.role] : []);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRow | null>(null);
  const [transactionItems, setTransactionItems] = useState<any[]>([]);
  const [returnLines, setReturnLines] = useState<
    Array<{
      id: string; // transactionItemId
      itemName: string;
      quantity: number; // quantity bought
      totalAmount: number;
      alreadyReturned: number;
      maxReturn: number;
      selected: boolean;
      qtyToReturn: number;
      reason: string;
    }>
  >([]);
  const [isTransactionsPanelOpen, setIsTransactionsPanelOpen] = useState(false);
  const [showTransactionsContent, setShowTransactionsContent] = useState(false);
  const [isTransactionsFilterOpen, setIsTransactionsFilterOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'last7' | 'thisMonth'>('all');
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [handledBy, setHandledBy] = useState<string>('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [returnDate] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [refundMethod, setRefundMethod] = useState<'cash' | 'gcash'>('cash');
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [gcashRef, setGcashRef] = useState('');
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [previousReturns, setPreviousReturns] = useState<
    Array<{
      id: string; // display id (returnCode or doc id)
      returnDocId: string; // actual Firestore doc id
      date: string;
      customerName: string;
      transactionCode: string;
      itemsReturned: number;
      returnedTotal: number;
      status?: string;
    }>
  >([]);

  const canProcessReturns = can(userRoles, 'returns.process');
  const canViewArchivedReturns = can(userRoles, 'returns.view.archived');
  const canArchiveReturns = can(userRoles, 'returns.archive');
  const canUnarchiveReturns = can(userRoles, 'returns.unarchive');
  const canDeleteReturns = can(userRoles, 'returns.delete');
  const canExportReturns = can(userRoles, 'returns.export');
  const canViewReturnsPage = can(userRoles, 'page.returns.view');



  const [modalState, setModalState] = useState<
    | null
    | {
      type: 'info';
      title: string;
      message: string;
    }
    | {
      type: 'confirm-archive';
      title: string;
      message: string;
      returnDocId: string;
      currentStatus?: string;
    }
    | {
      type: 'returns-settings';
      title: string;
      message: string;
    }
  >(null);

  const [rcabSettings, setRcabSettings] = useState({
    processRefund: { admin: true, employee: true, mechanic: false },
    archiveReturn: { admin: true, employee: false, mechanic: false },
    deleteReturn: { admin: false, employee: false, mechanic: false },
  });

  const totalRefundAmount = useMemo(() => {
    if (!returnLines.length) return 0;

    return returnLines.reduce((sum, line) => {
      const qty = Number.isNaN(line.qtyToReturn) ? 0 : line.qtyToReturn;
      if (!line.selected || qty <= 0 || line.quantity <= 0) return sum;
      const unit = line.totalAmount / line.quantity;
      const lineRefund = unit * qty;
      return sum + lineRefund;
    }, 0);
  }, [returnLines]);

  const effectiveRefundMethod: 'cash' | 'gcash' = useMemo(() => {
    return refundMethod;
  }, [refundMethod]);

  const hasPreviousReturns = useMemo(() => {
    if (!returnLines.length) return false;
    const totalAlready = returnLines.reduce((sum, line) => sum + (line.alreadyReturned || 0), 0);
    return totalAlready > 0;
  }, [returnLines]);

  const getFilteredReturns = useMemo(() => {
    return previousReturns.filter((ret) => {
      if (!showArchived && ret.status === 'archived') return false;
      
      if (dateFilter !== 'all') {
        const retDate = new Date(ret.date);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const retDateOnly = new Date(retDate.getFullYear(), retDate.getMonth(), retDate.getDate());
        
        if (dateFilter === 'today') {
          if (retDateOnly.getTime() !== today.getTime()) return false;
        } else if (dateFilter === 'last7') {
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          if (retDateOnly.getTime() < sevenDaysAgo.getTime()) return false;
        } else if (dateFilter === 'thisMonth') {
          if (retDate.getFullYear() !== now.getFullYear() || retDate.getMonth() !== now.getMonth()) return false;
        }
      }
      
      return true;
    });
  }, [previousReturns, showArchived, dateFilter]);

  const handleProcessReturn = async () => {
    if (!canProcessReturns) {
      setModalState({
        type: 'info',
        title: 'Not allowed',
        message: 'Your role is not allowed to process returns.',
      });
      return;
    }

    if (isProcessingReturn) {
      return;
    }

    setIsProcessingReturn(true);

    if (!selectedTransaction || !selectedTransactionId) {
      setModalState({
        type: 'info',
        title: 'Select a transaction',
        message:
          'Please select a transaction from the Transactions List before processing a return.',
      });
      setIsProcessingReturn(false);
      return;
    }

    if (!handledBy) {
      setModalState({
        type: 'info',
        title: 'Handled By required',
        message: 'Please select who handled this return.',
      });
      setIsProcessingReturn(false);
      return;
    }

    const activeLines = returnLines.filter((line) => line.selected && !Number.isNaN(line.qtyToReturn) && line.qtyToReturn > 0);
    if (!activeLines.length) {
      setModalState({
        type: 'info',
        title: 'No items selected',
        message: 'Please select at least one item and specify a quantity to return.',
      });
      setIsProcessingReturn(false);
      return;
    }

    if (totalRefundAmount <= 0) {
      setModalState({
        type: 'info',
        title: 'Invalid refund amount',
        message: 'Total refund amount must be greater than 0.',
      });
      setIsProcessingReturn(false);
      return;
    }

    if (effectiveRefundMethod === 'cash' && !cashConfirmed) {
      setModalState({
        type: 'info',
        title: 'Cash confirmation required',
        message: 'Please confirm that the cash refund was handed to the customer.',
      });
      setIsProcessingReturn(false);
      return;
    }

    if (effectiveRefundMethod === 'gcash' && !gcashRef.trim()) {
      setModalState({
        type: 'info',
        title: 'GCash reference required',
        message: 'Please enter the GCash reference code before processing the return.',
      });
      setIsProcessingReturn(false);
      return;
    }

    const overallNotesElement = document.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="Add any additional notes about this return..."]',
    );
    const overallNotes = overallNotesElement?.value?.trim() ?? '';

    try {
      const returnsCollection = collection(db, 'returns');

      // Derive handler initials from employees list
      const handler = employees.find((e) => e.id === handledBy);
      let handlerInitials = '';
      if (handler) {
        const name = handler.name.trim();
        if (name) {
          const parts = name.split(/\s+/);
          if (parts.length === 1) {
            handlerInitials = parts[0].charAt(0).toUpperCase();
          } else {
            handlerInitials = (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
          }
        }
      }

      if (!handlerInitials) {
        // Fallback to "XX" if we cannot derive initials for some reason
        handlerInitials = 'XX';
      }

      const prefix = `RET-${handlerInitials}-`;

      // Find the next sequence number for this handler by scanning existing returns
      const existingForHandlerSnap = await getDocs(
        query(returnsCollection, where('handledBy', '==', handledBy)),
      );

      let maxSeq = 0;
      existingForHandlerSnap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const code = String(data.returnCode ?? '');
        if (!code.startsWith(prefix)) return;
        const parts = code.split('-');
        const last = parts[parts.length - 1];
        const num = Number(last);
        if (!Number.isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      });

      const nextSeq = maxSeq + 1;
      const seqStr = String(nextSeq).padStart(4, '0');
      const returnCode = `${prefix}${seqStr}`;

      const returnPayload: any = {
        transactionId: selectedTransactionId,
        transactionCode: selectedTransaction.transactionCode,
        customerName: selectedTransaction.customerName,
        handledBy,
        originalTotal: selectedTransaction.total,
        returnDate,
        returnCode,
        refundMethod,
        totalRefundAmount,
        notes: overallNotes,
        createdAt: new Date().toISOString(),
      };

      if (effectiveRefundMethod === 'gcash') {
        returnPayload.gcashRef = gcashRef.trim();
      }

      // Create main return document
      const returnDocRef = await addDoc(returnsCollection, returnPayload);

      // Prepare line-level returnItems documents
      const returnItemsCollection = collection(db, 'returnItems');

      const batch = writeBatch(db);

      activeLines.forEach((line) => {
        const qty = Number.isNaN(line.qtyToReturn) ? 0 : line.qtyToReturn;
        const unit = line.quantity > 0 ? line.totalAmount / line.quantity : 0;
        const lineRefund = unit * qty;

        // Match back to the original transactionItem by id so we have stable linkage
        const baseItem = transactionItems.find((it) => it.id === line.id);

        const payload: any = {
          returnId: returnDocRef.id,
          transactionId: selectedTransactionId,
          transactionCode: selectedTransaction.transactionCode,
          transactionItemId: line.id,
          itemName: line.itemName,
          quantityBought: line.quantity,
          qtyReturned: qty,
          unitPrice: unit,
          lineRefund,
          reason: line.reason || '',
          createdAt: new Date().toISOString(),
        };

        if (baseItem) {
          payload.itemCode = baseItem.itemCode ?? null;
          payload.itemType = baseItem.itemType ?? null;
        }

        const newReturnItemRef = doc(returnItemsCollection);
        batch.set(newReturnItemRef, payload);
      });

      // Commit returnItems batch
      await batch.commit();

      // For each active product line, look up inventory by custom item code and apply rollback
      const inventoryUpdates = activeLines.map(async (line) => {
        const qty = Number.isNaN(line.qtyToReturn) ? 0 : line.qtyToReturn;
        if (qty <= 0) return;

        const baseItem = transactionItems.find((it) => it.id === line.id);
        if (!baseItem) return;

        if (baseItem.itemType !== 'product' || !baseItem.itemCode) return;

        const code = String(baseItem.itemCode);
        const invQuery = query(collection(db, 'inventory'), where('itemId', '==', code));
        const snap = await getDocs(invQuery);
        if (snap.empty) return;

        await Promise.all(
          snap.docs.map(async (invDoc) => {
            const invData = invDoc.data() as any;
            const currentStock = Number(invData.availableStock ?? 0);
            const currentSold = Number(invData.sold ?? 0);
            const newStock = currentStock + qty;
            const newSold = Math.max(currentSold - qty, 0);
            await updateDoc(invDoc.ref, {
              availableStock: newStock,
              sold: newSold,
              updatedAt: new Date().toISOString(),
            });
          }),
        );
      });

      await Promise.all(inventoryUpdates);

      setModalState({
        type: 'info',
        title: 'Return processed',
        message: 'Return processed successfully.',
      });

      // Reset UI state for Return Details
      setReturnLines([]);
      setSelectedTransactionId(null);
      setSelectedTransaction(null);
      setHandledBy('');
      setRefundMethod('cash');
      setCashConfirmed(false);
      setGcashRef('');
      if (overallNotesElement) {
        overallNotesElement.value = '';
      }
      setIsProcessingReturn(false);
    } catch (err) {
      console.error('Error processing return:', err);
      setModalState({
        type: 'info',
        title: 'Error',
        message: 'An error occurred while processing the return. Please try again.',
      });
      setIsProcessingReturn(false);
    }
  };

  const handleToggleArchiveReturn = async (returnDocId: string, currentStatus?: string) => {
    try {
      const newStatus = currentStatus === 'archived' ? 'active' : 'archived';

      if (newStatus === 'archived' && !canArchiveReturns) {
        setModalState({
          type: 'info',
          title: 'Not allowed',
          message: 'Your role is not allowed to archive returns.',
        });
        return;
      }

      if (newStatus === 'active' && !canUnarchiveReturns) {
        setModalState({
          type: 'info',
          title: 'Not allowed',
          message: 'Your role is not allowed to unarchive returns.',
        });
        return;
      }

      if (newStatus === 'archived') {
        setModalState({
          type: 'confirm-archive',
          title: 'Archive return?',
          message:
            'Are you sure you want to archive this return? It will be hidden from the main list but not deleted.',
          returnDocId,
          currentStatus,
        });
        return;
      }

      const ref = doc(db, 'returns', returnDocId);
      await updateDoc(ref, {
        status: newStatus,
        archivedAt: newStatus === 'archived' ? new Date().toISOString() : null,
      });

      setPreviousReturns((prev) =>
        prev.map((row) =>
          row.returnDocId === returnDocId
            ? {
              ...row,
              status: newStatus,
            }
            : row,
        ),
      );
    } catch (err) {
      console.error('Error archiving/unarchiving return:', err);
      setModalState({
        type: 'info',
        title: 'Error',
        message: 'Failed to update return archive status. Please try again.',
      });
    }
  };

  // Firestore collection ref for transactions
  const transactionsCollection = collection(db, 'transactions');

  // Load global previous returns history (all returns across transactions)
  useEffect(() => {
    const loadGlobalReturns = async () => {
      try {
        const returnItemsSnap = await getDocs(collection(db, 'returnItems'));

        const itemsByReturn: Record<
          string,
          {
            itemsReturned: number;
            returnedTotal: number;
          }
        > = {};

        returnItemsSnap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const returnId = String(data.returnId ?? '');
          if (!returnId) return;

          const qty = Number(data.qtyReturned ?? 0);
          const lineRefund = Number(data.lineRefund ?? 0);
          const bucket = itemsByReturn[returnId] || { itemsReturned: 0, returnedTotal: 0 };
          if (qty > 0 && !Number.isNaN(qty)) {
            bucket.itemsReturned += 1;
          }
          if (!Number.isNaN(lineRefund)) {
            bucket.returnedTotal += lineRefund;
          }
          itemsByReturn[returnId] = bucket;
        });

        const returnsSnap = await getDocs(collection(db, 'returns'));

        const rows: Array<{
          id: string;
          returnDocId: string;
          date: string;
          customerName: string;
          transactionCode: string;
          itemsReturned: number;
          returnedTotal: number;
          status?: string;
        }> = [];

        returnsSnap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const docId = docSnap.id;
          const date = String(data.returnDate ?? data.createdAt ?? '');
          const customerName = String(data.customerName ?? '');
          const transactionCode = String(data.transactionCode ?? '');
          const code = String(data.returnCode ?? docId);
          const status = String(data.status ?? 'active');
          const bucket = itemsByReturn[docId] || { itemsReturned: 0, returnedTotal: 0 };
          rows.push({
            id: code,
            returnDocId: docId,
            date,
            customerName,
            transactionCode,
            itemsReturned: bucket.itemsReturned,
            returnedTotal: bucket.returnedTotal,
            status,
          });
        });

        rows.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return b.id.localeCompare(a.id);
        });

        setPreviousReturns(rows);
      } catch (err) {
        console.error('Error loading global previous returns:', err);
        setPreviousReturns([]);
      }
    };

    loadGlobalReturns();
  }, []);

  // Load employees for "Handled By" dropdown and auto-select current user when available
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const rows: Array<{ id: string; name: string }> = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const id = docSnap.id;
          const name = (data.fullName || data.name || data.email || id).toString();
          rows.push({ id, name });
        });
        setEmployees(rows);

        // Default handledBy to current user if present and not already set
        if (!handledBy && user && (user as any).uid) {
          const uid = (user as any).uid as string;
          const match = rows.find((e) => e.id === uid);
          if (match) {
            setHandledBy(match.id);
          }
        }
      } catch (err) {
        console.error('Error loading users for Handled By dropdown:', err);
      }
    };

    loadEmployees();
  }, [handledBy, user]);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        setTransactionsLoading(true);
        const snap = await getDocs(transactionsCollection);
        const rows: TransactionRow[] = [];

        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;

          const status = (data.status ?? '').toString();
          if (status && status !== 'Complete') {
            return; // only completed transactions eligible for returns
          }

          const transactionCode = (data.transactionCode ?? docSnap.id).toString();
          const date = (data.date ?? '').toString();
          const customerName = (data.customer?.name ?? '').toString();
          const total = Number(data.total ?? 0);
          const transactionType = (data.transactionType ?? '').toString();
          const paymentType = (data.payment?.type ?? '').toString();
          const handledBy = (data.handledBy ?? null) as string | null;

          rows.push({
            id: docSnap.id,
            transactionCode,
            date,
            customerName,
            transactionType,
            total,
            paymentType,
            handledBy,
          });
        });

        // newest first by date then code
        rows.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return b.transactionCode.localeCompare(a.transactionCode);
        });

        setTransactions(rows);
      } catch (err) {
        console.error('Error loading transactions for returns', err);
      } finally {
        setTransactionsLoading(false);
      }
    };

    loadTransactions();
  }, []);

  const filteredTransactions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const now = new Date();

    return transactions.filter((tx) => {
      // text search
      const inCode = tx.transactionCode.toLowerCase().includes(q);
      const inCustomer = tx.customerName.toLowerCase().includes(q);
      const inDateStr = tx.date.toLowerCase().includes(q);
      const inEmployee = (tx.handledBy ?? '').toLowerCase().includes(q);
      const inPayment = tx.paymentType.toLowerCase().includes(q);
      const textMatch = !q || inCode || inCustomer || inDateStr || inEmployee || inPayment;
      if (!textMatch) return false;

      // date filter
      if (dateFilter === 'all') return true;
      if (!tx.date) return false;

      const [y, m, d] = tx.date.split('-').map((v) => parseInt(v, 10));
      if (!y || !m || !d) return false;
      const txDate = new Date(y, m - 1, d);

      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (dateFilter === 'today') {
        return txDate.getTime() === startOfToday.getTime();
      }

      if (dateFilter === 'last7') {
        const sevenDaysAgo = new Date(startOfToday);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        return txDate >= sevenDaysAgo && txDate <= startOfToday;
      }

      if (dateFilter === 'thisMonth') {
        return (
          txDate.getFullYear() === now.getFullYear() &&
          txDate.getMonth() === now.getMonth()
        );
      }

      return true;
    });
  }, [transactions, searchTerm, dateFilter]);

  const handleToggleTransactionsPanel = () => {
    if (!isTransactionsPanelOpen) {
      // Opening: expand panel first, then show content
      setIsTransactionsPanelOpen(true);
      setTimeout(() => {
        setShowTransactionsContent(true);
      }, 180);
    } else {
      // Closing: collapse panel first (with content visible), then hide content
      setIsTransactionsFilterOpen(false);
      setIsTransactionsPanelOpen(false);
      setTimeout(() => {
        setShowTransactionsContent(false);
      }, 220); // slightly longer than width transition so it disappears at the end
    }
  };

  const handleSelectTransaction = async (tx: TransactionRow) => {
    // Restrict transaction selection to users with returns.process permission
    if (!canProcessReturns) {
      setModalState({
        type: 'info',
        title: 'Not allowed',
        message: 'You do not have permission to process returns.',
      });
      return;
    }

    setSelectedTransactionId(tx.id);
    setSelectedTransaction(tx);
    // Auto-open accordion when transaction is selected
    setIsReturnDetailsExpanded(true);

    try {
      // Step 2a: load line items for this transaction
      const itemsCollection = collection(db, 'transactionItems');
      const itemsQuery = query(itemsCollection, where('transactionId', '==', tx.id));
      const itemsSnap = await getDocs(itemsQuery);

      const items: any[] = [];
      itemsSnap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        items.push({ id: docSnap.id, ...data });
      });
      setTransactionItems(items);

      // Step: load existing returnItems for this transaction (for alreadyReturned/maxReturn only)
      const returnItemsCollection = collection(db, 'returnItems');
      const returnItemsQuery = query(returnItemsCollection, where('transactionId', '==', tx.id));
      const returnItemsSnap = await getDocs(returnItemsQuery);

      const alreadyReturnedByItem: Record<string, number> = {};

      returnItemsSnap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const transactionItemId = String(data.transactionItemId ?? '');
        if (!transactionItemId) return;

        const qty = Number(data.qtyReturned ?? 0);
        if (qty && !Number.isNaN(qty)) {
          alreadyReturnedByItem[transactionItemId] = (alreadyReturnedByItem[transactionItemId] || 0) + qty;
        }
      });

      // Initialize returnLines state from loaded items, applying alreadyReturned/maxReturn
      const initialLines = items.map((it) => {
        const quantityBought = Number(it.quantity ?? 0);
        const alreadyReturned = alreadyReturnedByItem[it.id] || 0;
        const maxReturn = Math.max(quantityBought - alreadyReturned, 0);

        return {
          id: it.id,
          itemName: String(it.itemName ?? ''),
          quantity: quantityBought,
          totalAmount: Number(it.totalAmount ?? 0),
          alreadyReturned,
          maxReturn,
          selected: maxReturn > 0 ? false : false,
          qtyToReturn: 0,
          reason: '',
        };
      });
      setReturnLines(initialLines);
    } catch (err) {
      console.error('Error loading transactionItems/returnItems for returns:', err);
      setTransactionItems([]);
      setReturnLines([]);
    }
  };



  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: 'linear-gradient(109deg, #1e88e5 0%, #1e88e5 50%, #0d47a1 50%, #0d47a1 100%)',
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Background gradient overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -1,
          background: 'linear-gradient(109deg, #1e88e5 0%, #1e88e5 50%, #0d47a1 50%, #0d47a1 100%)',
          backgroundSize: 'cover',
          backgroundAttachment: 'fixed',
        }}
      />

      <div
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
          width: '100%',
          zIndex: 5,
          padding: '1.5rem 1.5rem 2rem 1.5rem',
          flex: 1,
        }}
      >
        {/* Header */}
        <header
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            padding: '1rem 2rem',
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '1.25rem',
            position: 'sticky',
            top: '1rem',
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              maxWidth: '1560px',
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
                  title="Back to Dashboard"
                  style={{
                    height: '100%',
                    width: 'auto',
                    objectFit: 'contain',
                  }}
                />
              </div>
              <h1
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#1e40af',
                  margin: 0,
                }}
              >
                Returns & Refunds
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem' }}>
                <span style={{ color: '#374151', fontSize: '0.9rem' }}>
                  Welcome, {user?.name || 'Guest'}
                </span>
              </div>
            </div>

            {/* Right: search bar, Logout, navbar toggle */}
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  marginRight: '1rem',
                }}
              >
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
                  placeholder="Search returns..."
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

        {/* Main content */}
        <main>
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.85)',
              borderRadius: '1rem',
              padding: '1.75rem',
              boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
              position: 'relative',
              overflow: 'visible',
            }}
          >
            {/* Action Bar */}
            <section style={{ marginBottom: '1rem' }}>
              <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showFilters ? '1rem' : 0 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {canExportReturns && (
                      <button type="button" onClick={() => {
                        const rows = previousReturns;
                        if (!rows.length) return;
                        const headers = ['Return Code', 'Date', 'Customer', 'Transaction', 'Items Returned', 'Total Refunded'];
                        const escapeCell = (v: unknown) => { const s = (v ?? '').toString(); return s.includes('"') || s.includes(',') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
                        const csv = [headers.join(','), ...rows.map(r => [r.id, r.date, r.customerName, r.transactionCode, r.itemsReturned, r.returnedTotal].map(escapeCell).join(','))].join('\r\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `returns_${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
                      }} style={{ backgroundColor: '#059669', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, fontSize: '0.875rem', height: '40px' }}>
                        Export to CSV <FaFileExcel />
                      </button>
                    )}
                    {canArchiveReturns && (
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
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button type="button" onClick={() => setShowFilters(!showFilters)} style={{ backgroundColor: '#1e40af', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, fontSize: '0.875rem', height: '40px' }}>
                      Filters <FaFilter />
                    </button>
                    <button type="button" onClick={() => { setDateFilter('all'); setShowArchived(false); }} style={{ backgroundColor: '#6b7280', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', height: '40px' }}>
                      Clear Filters
                    </button>
                  </div>
                </div>
                {showFilters && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#4b5563' }}>Date Filter</label>
                      <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#111827' }}>
                        <option value="all">All dates</option>
                        <option value="today">Today</option>
                        <option value="last7">Last 7 days</option>
                        <option value="thisMonth">This month</option>
                      </select>
                    </div>
                    {canViewArchivedReturns && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" id="showArchived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                        <label htmlFor="showArchived" style={{ fontSize: '0.875rem', color: '#4b5563', cursor: 'pointer' }}>Show Archived</label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
            {/* Slide-out Transactions List panel */}
            <section
              style={{
                backgroundColor: isTransactionsPanelOpen ? 'white' : 'transparent',
                borderRadius: isTransactionsPanelOpen ? '0 0.75rem 0.75rem 0' : '0.75rem 0 0 0.75rem',
                padding: isTransactionsPanelOpen ? '1.25rem 1.5rem' : '0',
                border: isTransactionsPanelOpen ? '1px solid #e5e7eb' : 'none',
                boxShadow: isTransactionsPanelOpen ? '0 8px 20px rgba(15, 23, 42, 0.2)' : 'none',
                maxHeight: '70vh',
                height: isTransactionsPanelOpen ? 'auto' : '70vh',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                position: 'absolute',
                top: '1rem',
                left: 0,
                width: isTransactionsPanelOpen ? 480 : 40,
                zIndex: 210,
                transition: 'width 0.3s ease, border-radius 0.3s ease, background-color 0.2s ease',
              }}
            >
              {/* Vertical tab toggle */}
              <button
                type="button"
                onClick={handleToggleTransactionsPanel}
                style={{
                  position: 'absolute',
                  right: isTransactionsPanelOpen ? -32 : 8,
                  top: '0.75rem',
                  transform: 'none',
                  padding: '0.5rem 0.4rem',
                  borderRadius: '0 0.75rem 0.75rem 0',
                  border: '1px solid #e5e7eb',
                  borderLeft: 'none',
                  backgroundColor: '#1d4ed8',
                  color: 'white',
                  cursor: 'pointer',
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  boxShadow: '0 4px 10px rgba(15, 23, 42, 0.25)',
                }}
              >
                {isTransactionsPanelOpen ? 'Hide Transactions' : 'Transactions List'}
              </button>
              {showTransactionsContent && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      marginBottom: '0.75rem',
                      position: 'relative',
                    }}
                  >
                    <h2
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#111827',
                        margin: 0,
                      }}
                    >
                      Transactions List
                    </h2>

                    {/* Search bar + filter button for transactions */}
                    <div
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '0.4rem',
                        flex: 1,
                        maxWidth: '260px',
                      }}
                    >
                      {/* Date filter trigger */}
                      <button
                        type="button"
                        onClick={() => setIsTransactionsFilterOpen(prev => !prev)}
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '9999px',
                          border: 'none',
                          backgroundColor: '#1d4ed8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <FaFilter size={12} />
                      </button>

                      <div
                        style={{
                          position: 'relative',
                          flex: 1,
                        }}
                      >
                        <FaSearch
                          style={{
                            position: 'absolute',
                            left: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#9ca3af',
                            fontSize: '0.75rem',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Search transactions..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.35rem 0.6rem 0.35rem 1.6rem',
                            borderRadius: '9999px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.8rem',
                            outline: 'none',
                            backgroundColor: 'white',
                            color: '#111827',
                          }}
                        />

                        <div
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: '110%',
                            backgroundColor: 'white',
                            borderRadius: '0.5rem',
                            boxShadow:
                              '0 10px 25px rgba(15, 23, 42, 0.18)',
                            border: '1px solid #e5e7eb',
                            padding: '0.4rem 0.4rem',
                            minWidth: '180px',
                            zIndex: 220,
                            opacity: isTransactionsFilterOpen ? 1 : 0,
                            transform: isTransactionsFilterOpen
                              ? 'translateY(0)'
                              : 'translateY(-4px)',
                            pointerEvents: isTransactionsFilterOpen ? 'auto' : 'none',
                            transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: '#4b5563',
                              marginBottom: '0.25rem',
                            }}
                          >
                            Date Filter
                          </div>
                          {[
                            { key: 'all', label: 'All dates' },
                            { key: 'today', label: 'Today' },
                            { key: 'last7', label: 'Last 7 days' },
                            { key: 'thisMonth', label: 'This month' },
                          ].map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => {
                                setDateFilter(opt.key as any);
                                setIsTransactionsFilterOpen(false);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.3rem 0.45rem',
                                borderRadius: '0.375rem',
                                border: 'none',
                                backgroundColor:
                                  dateFilter === opt.key ? '#eff6ff' : 'white',
                                color:
                                  dateFilter === opt.key ? '#1d4ed8' : '#374151',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                marginBottom: '0.2rem',
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: '0.5rem',
                      border: '1px solid #e5e7eb',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        maxHeight: '100%',
                        overflowY: 'auto',
                        overflowX: 'auto',
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#d1d5db #f3f4f6',
                      }}
                    >
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          tableLayout: 'auto',
                          fontSize: '0.8rem',
                          color: '#111827',
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              backgroundColor: '#f9fafb',
                              borderBottom: '1px solid #e5e7eb',
                            }}
                          >
                            <th
                              style={{
                                padding: '0.4rem 0.5rem',
                                textAlign: 'center',
                                fontWeight: 600,
                                color: '#6b7280',
                              }}
                            >
                              Customer
                            </th>
                            <th
                              style={{
                                padding: '0.4rem 0.5rem',
                                textAlign: 'center',
                                fontWeight: 600,
                                color: '#6b7280',
                              }}
                            >
                              Date
                            </th>
                            <th
                              style={{
                                padding: '0.4rem 0.5rem',
                                textAlign: 'center',
                                fontWeight: 600,
                                color: '#6b7280',
                                width: '8%',
                              }}
                            >
                              Type
                            </th>
                            <th
                              style={{
                                padding: '0.4rem 0.5rem',
                                textAlign: 'center',
                                fontWeight: 600,
                                color: '#6b7280',
                                width: 'auto',
                              }}
                            >
                              Total
                            </th>
                            <th
                              style={{
                                padding: '0.4rem 0.5rem',
                                textAlign: 'center',
                                fontWeight: 600,
                                color: '#6b7280',
                                width: 'auto',
                              }}
                            >
                              Payment
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactionsLoading && (
                            <tr>
                              <td
                                colSpan={5}
                                style={{
                                  padding: '0.75rem 0.75rem',
                                  fontSize: '0.8rem',
                                  color: '#6b7280',
                                  textAlign: 'center',
                                }}
                              >
                                Loading transactions...
                              </td>
                            </tr>
                          )}
                          {!transactionsLoading && filteredTransactions.length === 0 && (
                            <tr>
                              <td
                                colSpan={5}
                                style={{
                                  padding: '0.75rem 0.75rem',
                                  fontSize: '0.8rem',
                                  color: '#6b7280',
                                  textAlign: 'center',
                                }}
                              >
                                No matching transactions.
                              </td>
                            </tr>
                          )}
                          {!transactionsLoading &&
                            filteredTransactions.map((tx) => (
                              <tr
                                key={tx.id}
                                onClick={() => handleSelectTransaction(tx)}
                                style={{
                                  cursor: 'pointer',
                                  backgroundColor:
                                    selectedTransactionId === tx.id ? '#eff6ff' : 'white',
                                  borderBottom: '1px solid #e5e7eb',
                                }}
                              >
                                <td
                                  style={{
                                    padding: '0.4rem 0.5rem',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                    whiteSpace: 'normal',
                                    wordBreak: 'break-word',
                                    overflowWrap: 'break-word',
                                  }}
                                >
                                  {tx.customerName || 'Walk-in Customer'}
                                </td>
                                <td
                                  style={{
                                    padding: '0.4rem 0.5rem',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {(() => {
                                    const raw = tx.date || '';
                                    const parts = raw.split('-'); // expect YYYY-MM-DD
                                    if (parts.length === 3) {
                                      const [yyyy, mm, dd] = parts;
                                      const yy = yyyy.slice(-2);
                                      return `${dd}/${mm}/${yy}`;
                                    }
                                    return raw;
                                  })()}
                                </td>
                                <td
                                  style={{
                                    padding: '0.4rem 0.5rem',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {(() => {
                                    const t = (tx.transactionType || '').toLowerCase();
                                    let label = 'N/A';
                                    let bg = '#e5e7eb';
                                    let fg = '#374151';

                                    if (t.includes('parts') && t.includes('service')) {
                                      label = 'PS';
                                      bg = '#f3e8ff'; // light purple
                                      fg = '#7c3aed'; // purple text
                                    } else if (t.includes('parts')) {
                                      label = 'P';
                                      bg = '#dbeafe'; // light blue
                                      fg = '#1d4ed8'; // blue text
                                    } else if (t.includes('service')) {
                                      label = 'S';
                                      bg = '#dcfce7'; // light green
                                      fg = '#15803d'; // green text
                                    }

                                    return (
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: '0.15rem 0.6rem',
                                          borderRadius: '9999px',
                                          fontSize: '0.7rem',
                                          fontWeight: 600,
                                          backgroundColor: bg,
                                          color: fg,
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {label}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td
                                  style={{
                                    padding: '0.4rem 0.5rem',
                                    textAlign: 'right',
                                    verticalAlign: 'middle',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  ₱{tx.total.toFixed(2)}
                                </td>
                                <td
                                  style={{
                                    padding: '0.4rem 0.5rem',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {(() => {
                                    const p = (tx.paymentType || '').toLowerCase();
                                    let label = 'N/A';
                                    let bg = '#e5e7eb';
                                    let fg = '#374151';

                                    if (p === 'cash') {
                                      label = 'C';
                                      bg = '#dcfce7'; // light green
                                      fg = '#15803d'; // green text
                                    } else if (p === 'gcash') {
                                      label = 'G';
                                      bg = '#e0f2fe'; // light gcash-like blue
                                      fg = '#0369a1'; // blue text
                                    }

                                    return (
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: '0.15rem 0.6rem',
                                          borderRadius: '9999px',
                                          fontSize: '0.7rem',
                                          fontWeight: 600,
                                          backgroundColor: bg,
                                          color: fg,
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {label}
                                      </span>
                                    );
                                  })()}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </section>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                alignItems: 'flex-start',
              }}
            >
              {/* Right column: Return Details + Previous Returns */}
              <section
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.5rem',
                }}
              >
                {/* Return Details accordion */}
                <div
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '0.75rem',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 10px rgba(15, 23, 42, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setIsReturnDetailsExpanded((prev) => !prev)}
                    style={{
                      width: '100%',
                      padding: '0.85rem 1.25rem',
                      backgroundColor: '#f3f4f6',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          color: '#1e40af',
                        }}
                      >
                        Return Details
                      </span>
                      {hasPreviousReturns && (
                        <span
                          style={{
                            padding: '0.15rem 0.55rem',
                            borderRadius: '999px',
                            backgroundColor: '#ecfdf5',
                            color: '#166534',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          Has previous returns
                        </span>
                      )}
                    </div>
                    <FaChevronDown
                      style={{
                        color: '#1e40af',
                        transform: isReturnDetailsExpanded
                          ? 'rotate(180deg)'
                          : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </button>

                  {isReturnDetailsExpanded && (
                    <div style={{ padding: '1.25rem 1.5rem 1.5rem 1.5rem' }}>
                      {/* First row: Return ID / Handled By / Transaction ID / Return Date */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          gap: '1.25rem',
                          marginBottom: '1rem',
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: 'block',
                              marginBottom: '0.35rem',
                              fontSize: '0.85rem',
                              fontWeight: 500,
                              color: '#374151',
                            }}
                          >
                            Return ID
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={selectedTransactionId ? 'Auto-generated' : ''}
                            placeholder="Auto-generated"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: '#f9fafb',
                              color: '#6b7280',
                            }}
                          />
                          <label
                            style={{
                              display: 'block',
                              marginTop: '0.5rem',
                              marginBottom: '0.35rem',
                              fontSize: '0.85rem',
                              fontWeight: 500,
                              color: '#374151',
                            }}
                          >
                            Handled By
                          </label>
                          <select
                            value={handledBy}
                            onChange={(e) => setHandledBy(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: 'white',
                              color: '#111827',
                              fontSize: '0.875rem',
                            }}
                          >
                            <option value="">Select employee</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            style={{
                              display: 'block',
                              marginBottom: '0.35rem',
                              fontSize: '0.85rem',
                              fontWeight: 500,
                              color: '#374151',
                            }}
                          >
                            Transaction ID
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={selectedTransaction?.transactionCode || ''}
                            placeholder="Select a transaction from the left"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: '#f9fafb',
                              color: '#6b7280',
                            }}
                          />
                          <label
                            style={{
                              display: 'block',
                              marginTop: '0.5rem',
                              marginBottom: '0.35rem',
                              fontSize: '0.85rem',
                              fontWeight: 500,
                              color: '#374151',
                            }}
                          >
                            Date
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={returnDate}
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: '#f9fafb',
                              color: '#6b7280',
                            }}
                          />
                        </div>
                      </div>

                      {/* Summary row */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
                          gap: '1rem',
                          marginBottom: '1.25rem',
                        }}
                      >
                        {["Customer Name", "Original Date", "Original Total", "Payment Type"].map(
                          (label) => (
                            <div key={label}>
                              <label
                                style={{
                                  display: 'block',
                                  marginBottom: '0.35rem',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  color: '#4b5563',
                                }}
                              >
                                {label}
                              </label>
                              <div
                                style={{
                                  padding: '0.45rem 0.75rem',
                                  borderRadius: '0.375rem',
                                  border: '1px solid #e5e7eb',
                                  backgroundColor: '#f9fafb',
                                  fontSize: '0.85rem',
                                  color: '#6b7280',
                                }}
                              >
                                {selectedTransaction && (
                                  (() => {
                                    if (label === 'Customer Name') {
                                      return selectedTransaction.customerName || 'Walk-in Customer';
                                    }
                                    if (label === 'Original Date') {
                                      const raw = selectedTransaction.date || '';
                                      const parts = raw.split('-');
                                      if (parts.length === 3) {
                                        const [yyyy, mm, dd] = parts;
                                        const yy = yyyy.slice(-2);
                                        return `${dd}/${mm}/${yy}`;
                                      }
                                      return raw;
                                    }
                                    if (label === 'Original Total') {
                                      return `₱${selectedTransaction.total.toFixed(2)}`;
                                    }
                                    if (label === 'Payment Type') {
                                      const p = (selectedTransaction.paymentType || '').toLowerCase();
                                      if (p === 'cash') return 'Cash';
                                      if (p === 'gcash') return 'GCash';
                                      return selectedTransaction.paymentType || 'N/A';
                                    }
                                    return '';
                                  })()
                                )}
                              </div>
                            </div>
                          ),
                        )}
                      </div>

                      {/* Items table */}
                      <div
                        style={{
                          marginBottom: '1.25rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #e5e7eb',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: '#f9fafb',
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#6b7280',
                            display: 'grid',
                            gridTemplateColumns:
                              '40px 2.2fr 0.9fr 0.9fr 1fr 1fr 1.3fr',
                            columnGap: '0.35rem',
                          }}
                        >
                          <span />
                          <span>Item</span>
                          <span>Qty Bought</span>
                          <span>Qty Returned</span>
                          <span>Max Return</span>
                          <span>Qty To Return</span>
                          <span>Line Refund / Reason</span>
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                          {returnLines.map((line, index) => (
                            <div
                              key={line.id}
                              style={{
                                padding: '0.45rem 0.75rem',
                                borderBottom: '1px solid #e5e7eb',
                                display: 'grid',
                                gridTemplateColumns:
                                  '40px 2.2fr 0.9fr 0.9fr 1fr 1fr 1.3fr',
                                columnGap: '0.35rem',
                                fontSize: '0.8rem',
                                alignItems: 'center',
                              }}
                            >
                              <input
                                type="checkbox"
                                disabled={line.maxReturn <= 0}
                                checked={line.selected}
                                onChange={(e) => {
                                  if (line.maxReturn <= 0) return;
                                  const checked = e.target.checked;
                                  setReturnLines((prev) => {
                                    const next = [...prev];
                                    const current = next[index];
                                    // If selecting and qtyToReturn is falsy, auto-fill with max; if unselecting, reset qty
                                    const nextLine = checked
                                      ? {
                                        ...current,
                                        selected: true,
                                        qtyToReturn:
                                          !current.qtyToReturn && current.qtyToReturn !== 0
                                            ? current.maxReturn
                                            : Math.min(current.qtyToReturn || current.maxReturn, current.maxReturn),
                                      }
                                      : {
                                        ...current,
                                        selected: false,
                                        qtyToReturn: 0,
                                      };
                                    next[index] = nextLine;
                                    return next;
                                  });
                                }}
                              />
                              <span style={{ color: '#111827' }}>{line.itemName}</span>
                              <span style={{ color: '#111827' }}>{line.quantity}</span>
                              <span style={{ color: '#111827' }}>{line.alreadyReturned}</span>
                              <span style={{ color: '#111827' }}>{line.maxReturn}</span>
                              <input
                                type="number"
                                min={0}
                                max={line.maxReturn}
                                value={Number.isNaN(line.qtyToReturn) ? '' : line.qtyToReturn}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setReturnLines((prev) => {
                                    const next = [...prev];
                                    if (value === '') {
                                      next[index] = { ...next[index], qtyToReturn: Number.NaN };
                                      return next;
                                    }
                                    const numeric = Number(value);
                                    const clamped = Math.max(0, Math.min(line.maxReturn, numeric || 0));
                                    next[index] = { ...next[index], qtyToReturn: clamped };
                                    return next;
                                  });
                                }}
                                style={{
                                  width: '100%',
                                  padding: '0.25rem 0.4rem',
                                  borderRadius: '0.25rem',
                                  border: '1px solid #d1d5db',
                                  backgroundColor: 'white',
                                  color: '#111827',
                                }}
                                disabled={line.maxReturn <= 0}
                              />
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.25rem',
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: '#111827',
                                  }}
                                >
                                  ₱{Number(line.totalAmount ?? 0).toFixed(2)}
                                </div>
                                <input
                                  type="text"
                                  placeholder="Reason (optional)"
                                  style={{
                                    width: '100%',
                                    padding: '0.25rem 0.4rem',
                                    borderRadius: '0.25rem',
                                    border: '1px solid #d1d5db',
                                    fontSize: '0.75rem',
                                    backgroundColor: 'white',
                                    color: '#111827',
                                  }}
                                  value={line.reason}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setReturnLines((prev) => {
                                      const next = [...prev];
                                      next[index] = { ...next[index], reason: value };
                                      return next;
                                    });
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Overall notes and totals */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
                          gap: '1.25rem',
                          alignItems: 'flex-start',
                          marginBottom: '1.5rem',
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: 'block',
                              marginBottom: '0.35rem',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                              color: '#4b5563',
                            }}
                          >
                            Overall Reason / Notes
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Add any additional notes about this return..."
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              resize: 'vertical',
                              fontSize: '0.85rem',
                              backgroundColor: 'white',
                              color: '#111827',
                            }}
                          />
                        </div>
                        <div
                          style={{
                            backgroundColor: '#f9fafb',
                            borderRadius: '0.75rem',
                            padding: '0.75rem 1rem',
                            border: '1px solid #e5e7eb',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.35rem',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.85rem',
                              color: '#4b5563',
                            }}
                          >
                            <span>Total Refund Amount</span>
                            <span
                              style={{
                                fontWeight: 700,
                                color: '#111827',
                                fontSize: '1.1rem',
                              }}
                            >
                              ₱{totalRefundAmount.toFixed(2)}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginTop: '0.25rem',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '0.8rem',
                                color: '#6b7280',
                              }}
                            >
                              Refund Method
                            </span>
                            <select
                              value={refundMethod}
                              onChange={(e) => {
                                const value = e.target.value as 'cash' | 'gcash';
                                setRefundMethod(value);
                                // Reset method-specific confirmations when switching
                                setCashConfirmed(false);
                                setGcashRef('');
                              }}
                              style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #d1d5db',
                                fontSize: '0.8rem',
                                backgroundColor: 'white',
                                color: '#111827',
                              }}
                            >
                              <option value="cash">Cash</option>
                              <option value="gcash">GCash</option>
                            </select>
                          </div>
                          {refundMethod === 'cash' && (
                            <div
                              style={{
                                marginTop: '0.4rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                fontSize: '0.8rem',
                                color: '#4b5563',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={cashConfirmed}
                                onChange={(e) => setCashConfirmed(e.target.checked)}
                              />
                              <span>Confirmed cash refund was handed to customer</span>
                            </div>
                          )}
                          {refundMethod === 'gcash' && (
                            <div
                              style={{
                                marginTop: '0.4rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.25rem',
                                fontSize: '0.8rem',
                                color: '#4b5563',
                              }}
                            >
                              <span>GCash Reference Code</span>
                              <input
                                type="text"
                                value={gcashRef}
                                onChange={(e) => setGcashRef(e.target.value)}
                                placeholder="Enter GCash reference number"
                                style={{
                                  width: '100%',
                                  padding: '0.35rem 0.5rem',
                                  borderRadius: '0.375rem',
                                  border: '1px solid #d1d5db',
                                  backgroundColor: 'white',
                                  color: '#111827',
                                  fontSize: '0.8rem',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.75rem',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <button
                          type="button"
                          style={{
                            padding: '0.5rem 1.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            color: '#374151',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          style={{
                            padding: '0.5rem 1.75rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            backgroundColor: (canProcessReturns && ((refundMethod === 'cash' && cashConfirmed) || (refundMethod === 'gcash' && gcashRef.trim()))) ? '#1d4ed8' : '#9ca3af',
                            color: 'white',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            cursor:
                              (!canProcessReturns || isProcessingReturn || !((refundMethod === 'cash' && cashConfirmed) || (refundMethod === 'gcash' && gcashRef.trim()))) ? 'not-allowed' : 'pointer',
                            opacity: isProcessingReturn ? 0.7 : 1,
                          }}
                          disabled={!canProcessReturns || isProcessingReturn || !((refundMethod === 'cash' && cashConfirmed) || (refundMethod === 'gcash' && gcashRef.trim()))}
                          onClick={handleProcessReturn}
                        >
                          Process Return
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Previous Returns table */}
                <div
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '0.75rem',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 10px rgba(15, 23, 42, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '0.85rem 1.25rem',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <h2
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#1e40af',
                        margin: 0,
                      }}
                    >
                      Previous Returns
                    </h2>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.85rem',
                        color: '#111827',
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            backgroundColor: '#f9fafb',
                            borderBottom: '1px solid #e5e7eb',
                            textAlign: 'left',
                          }}
                        >
                          {isSelectMode && (
                            <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', width: '40px' }}>
                              <input type="checkbox" checked={selectedItems.size === previousReturns.length && previousReturns.length > 0} onChange={(e) => { if (e.target.checked) { setSelectedItems(new Set(previousReturns.map(r => r.returnDocId))); } else { setSelectedItems(new Set()); } }} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                            </th>
                          )}
                          <th style={{ padding: '0.6rem 1rem' }}>Return ID</th>
                          <th style={{ padding: '0.6rem 1rem' }}>Date</th>
                          <th style={{ padding: '0.6rem 1rem' }}>Customer</th>
                          <th style={{ padding: '0.6rem 1rem' }}>Transaction ID</th>
                          <th style={{ padding: '0.6rem 1rem' }}>Items Returned</th>
                          <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                            Returned Total
                          </th>
                          <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previousReturns.length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              style={{
                                padding: '0.75rem 1rem',
                                fontSize: '0.85rem',
                                color: '#6b7280',
                                textAlign: 'center',
                              }}
                            >
                              No previous returns to display.
                            </td>
                          </tr>
                        )}
                        {getFilteredReturns.map((ret) => (
                            <tr
                              key={ret.id}
                              onClick={() => {
                                if (isSelectMode) {
                                  setSelectedItems(prev => {
                                    const next = new Set(prev);
                                    if (next.has(ret.returnDocId)) {
                                      next.delete(ret.returnDocId);
                                    } else {
                                      next.add(ret.returnDocId);
                                    }
                                    return next;
                                  });
                                }
                              }}
                              style={{
                                borderBottom: '1px solid #e5e7eb',
                                opacity: ret.status === 'archived' ? 0.6 : 1,
                                cursor: isSelectMode ? 'pointer' : 'default',
                                backgroundColor: isSelectMode && selectedItems.has(ret.returnDocId) ? '#eff6ff' : 'white',
                              }}
                            >
                              {isSelectMode && (
                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                                  <input type="checkbox" checked={selectedItems.has(ret.returnDocId)} onChange={() => {}} onClick={(e) => { e.stopPropagation(); setSelectedItems(prev => { const next = new Set(prev); if (next.has(ret.returnDocId)) { next.delete(ret.returnDocId); } else { next.add(ret.returnDocId); } return next; }); }} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                                </td>
                              )}
                              <td style={{ padding: '0.6rem 1rem' }}>{ret.id}</td>
                              <td style={{ padding: '0.6rem 1rem' }}>{ret.date}</td>
                              <td style={{ padding: '0.6rem 1rem' }}>{ret.customerName || 'Walk-in Customer'}</td>
                              <td style={{ padding: '0.6rem 1rem' }}>{ret.transactionCode}</td>
                              <td style={{ padding: '0.6rem 1rem' }}>
                                {ret.itemsReturned} item{ret.itemsReturned === 1 ? '' : 's'}
                              </td>
                              <td
                                style={{
                                  padding: '0.6rem 1rem',
                                  textAlign: 'right',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                ₱{ret.returnedTotal.toFixed(2)}
                              </td>
                              <td
                                style={{
                                  padding: '0.6rem 1rem',
                                  textAlign: 'right',
                                  display: 'flex',
                                  gap: '0.5rem',
                                  justifyContent: 'flex-end',
                                }}
                              >
                                {ret.status !== 'archived' && canArchiveReturns && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleArchiveReturn(ret.returnDocId, ret.status)
                                    }
                                    style={{
                                      padding: '0.25rem 0.75rem',
                                      borderRadius: '999px',
                                      border: '1px solid #fecaca',
                                      backgroundColor: '#fee2e2',
                                      color: '#b91c1c',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Archive
                                  </button>
                                )}
                                {ret.status === 'archived' && canUnarchiveReturns && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleArchiveReturn(ret.returnDocId, ret.status)
                                    }
                                    style={{
                                      padding: '0.25rem 0.75rem',
                                      borderRadius: '999px',
                                      border: '1px solid #93c5fd',
                                      backgroundColor: '#dbeafe',
                                      color: '#1d4ed8',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Unarchive
                                  </button>
                                )}
                                {ret.status === 'archived' && canDeleteReturns && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModalState({
                                        type: 'info',
                                        title: 'Delete Return',
                                        message: 'Delete functionality for returns is not yet implemented.',
                                      });
                                    }}
                                    style={{
                                      padding: '0.25rem 0.75rem',
                                      borderRadius: '999px',
                                      border: '1px solid #fca5a5',
                                      backgroundColor: '#fef2f2',
                                      color: '#dc2626',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <FaTrash size={12} style={{ display: 'inline', marginRight: '0.25rem' }} /> Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>

      <Footer />

      {modalState && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.25rem 1.5rem',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.35)',
              border: '1px solid #e5e7eb',
            }}
          >
            <h3
              style={{
                margin: 0,
                marginBottom: '0.5rem',
                fontSize: '1.05rem',
                fontWeight: 600,
                color: '#111827',
              }}
            >
              {modalState.title}
            </h3>
            <p
              style={{
                margin: 0,
                marginBottom: '1rem',
                fontSize: '0.9rem',
                color: '#4b5563',
              }}
            >
              {modalState.message}
            </p>

            {modalState.type === 'info' && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setModalState(null)}
                  style={{
                    padding: '0.4rem 1.1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#111827',
                    color: 'white',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            )}

            {modalState.type === 'confirm-archive' && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setModalState(null)}
                  style={{
                    padding: '0.4rem 1.1rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    backgroundColor: 'white',
                    color: '#374151',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (modalState.type === 'confirm-archive') {
                      await handleToggleArchiveReturn(modalState.returnDocId, modalState.currentStatus);
                      setModalState(null);
                    }
                  }}
                  style={{
                    padding: '0.4rem 1.1rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    backgroundColor: '#b91c1c',
                    color: 'white',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Confirm
                </button>
              </div>
            )}

            {modalState.type === 'returns-settings' && (
              <>
                <div
                  style={{
                    marginTop: '0.5rem',
                    marginBottom: '0.75rem',
                    padding: '0.75rem 0.75rem',
                    borderRadius: '0.5rem',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Actions (RCAB)
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#6b7280',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Configure which roles can perform each action. (Behavior wiring TBD.)
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.8rem',
                        color: '#111827',
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              textAlign: 'left',
                              padding: '0.4rem 0.25rem',
                              fontWeight: 600,
                            }}
                          >
                            Action
                          </th>
                          <th style={{ padding: '0.4rem 0.25rem' }}>Admin</th>
                          <th style={{ padding: '0.4rem 0.25rem' }}>Employee</th>
                          <th style={{ padding: '0.4rem 0.25rem' }}>Mechanic</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '0.35rem 0.25rem' }}>Process Refund</td>
                          {(['admin', 'employee', 'mechanic'] as const).map((role) => (
                            <td
                              key={role}
                              style={{
                                padding: '0.35rem 0.25rem',
                                textAlign: 'center',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={rcabSettings.processRefund[role]}
                                onChange={(e) =>
                                  setRcabSettings((prev) => ({
                                    ...prev,
                                    processRefund: {
                                      ...prev.processRefund,
                                      [role]: e.target.checked,
                                    },
                                  }))
                                }
                              />
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={{ padding: '0.35rem 0.25rem' }}>Archive (return transaction)</td>
                          {(['admin', 'employee', 'mechanic'] as const).map((role) => (
                            <td
                              key={role}
                              style={{
                                padding: '0.35rem 0.25rem',
                                textAlign: 'center',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={rcabSettings.archiveReturn[role]}
                                onChange={(e) =>
                                  setRcabSettings((prev) => ({
                                    ...prev,
                                    archiveReturn: {
                                      ...prev.archiveReturn,
                                      [role]: e.target.checked,
                                    },
                                  }))
                                }
                              />
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={{ padding: '0.35rem 0.25rem' }}>Delete (actual delete)</td>
                          {(['admin', 'employee', 'mechanic'] as const).map((role) => (
                            <td
                              key={role}
                              style={{
                                padding: '0.35rem 0.25rem',
                                textAlign: 'center',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={rcabSettings.deleteReturn[role]}
                                onChange={(e) =>
                                  setRcabSettings((prev) => ({
                                    ...prev,
                                    deleteReturn: {
                                      ...prev.deleteReturn,
                                      [role]: e.target.checked,
                                    },
                                  }))
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.5rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setModalState(null)}
                    style={{
                      padding: '0.4rem 1.1rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      backgroundColor: '#111827',
                      color: 'white',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
