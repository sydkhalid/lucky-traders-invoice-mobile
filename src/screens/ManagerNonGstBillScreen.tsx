import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logo, signature } from '../assets';
import { Card, DatePickerField, Field } from '../components/common';
import { formatDate, getPrintableAssets, money, numberFormat, parseDisplayDate } from '../invoiceCore';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { styles } from '../styles';
import type { IconName } from '../types';
import { DeviceSharingScreen } from './DeviceSharingScreen';

export const MANAGER_NON_GST_SEQUENCE_KEY = 'lucky-traders.managerNonGstSequence.v1';
export const MANAGER_WORKBOOK_KEY = 'lucky-traders.managerWorkbook.v1';
const MANAGER_CUSTOMERS_PER_PAGE = 10;
const MANAGER_CREDITS_PER_PAGE = 10;
const MANAGER_CASHBOOK_PER_PAGE = 10;
const MANAGER_FINANCE_PER_PAGE = 10;

type ManagerTab =
  | 'dashboard'
  | 'customers'
  | 'bill'
  | 'stock'
  | 'summary'
  | 'credit'
  | 'cashbook'
  | 'investments'
  | 'payables'
  | 'financeExpense'
  | 'profitLoss'
  | 'profitSharing'
  | 'deviceSharing';
type BillMode = 'list' | 'form';
type SyncStatus = 'checking' | 'online' | 'offline' | 'syncing';
type SyncAction = 'send' | 'receive' | null;

type NonGstItem = {
  id: string;
  product: string;
  qty: string;
  rate: string;
};

export type ManagerCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string;
};

export type StockEntry = {
  id: string;
  date: string;
  category: string;
  qty: number;
  unitCost: number;
};

export type SaleEntry = {
  id: string;
  billNo: string;
  date: string;
  customer: string;
  category: string;
  qty: number;
  sellingRate: number;
};

export type NonGstBillRecordItem = {
  product: string;
  qty: number;
  rate: number;
};

export type NonGstBillRecord = {
  id: string;
  billNo: string;
  date: string;
  customer: string;
  phone: string;
  address: string;
  vehicleNo: string;
  items: NonGstBillRecordItem[];
  transportCharge: number;
  loadingCharge: number;
  note: string;
  total: number;
};

export type CustomerCreditEntry = {
  id: string;
  date: string;
  customer: string;
  creditAmount: number;
  paidAmount: number;
};

export type CashbookEntry = {
  id: string;
  date: string;
  description: string;
  cashCredit: number;
  cashDebit: number;
  bankCredit: number;
  bankDebit: number;
};

export type PartnerInvestmentEntry = {
  id: string;
  date: string;
  partner: string;
  amount: number;
  mode: string;
  remarks: string;
  status: string;
};

export type LoanPayableEntry = {
  id: string;
  date: string;
  lender: string;
  amount: number;
  paidAmount: number;
  type: string;
  notes: string;
};

export type ManagerExpenseEntry = {
  id: string;
  date: string;
  category: string;
  amount: number;
  mode: string;
  notes: string;
};

export type ProfitSettings = {
  otherProfit: number;
  totalExpense: number;
};

export type ManagerWorkbook = {
  customers: ManagerCustomer[];
  bills: NonGstBillRecord[];
  stockEntries: StockEntry[];
  sales: SaleEntry[];
  credits: CustomerCreditEntry[];
  cashbook: CashbookEntry[];
  investments: PartnerInvestmentEntry[];
  loans: LoanPayableEntry[];
  expenses: ManagerExpenseEntry[];
  profitSettings: ProfitSettings;
};

export type ManagerWorkbookUpdate = ManagerWorkbook | ((current: ManagerWorkbook) => ManagerWorkbook);

const managerTabs: { key: ManagerTab; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'view-dashboard-outline' },
  { key: 'customers', label: 'Customers', icon: 'account-group-outline' },
  { key: 'bill', label: 'Bill Receipt', icon: 'file-document-edit-outline' },
  { key: 'stock', label: 'Stock Entry', icon: 'playlist-plus' },
  { key: 'summary', label: 'Summary', icon: 'chart-box-outline' },
  { key: 'credit', label: 'Credit', icon: 'account-credit-card-outline' },
  { key: 'cashbook', label: 'Cashbook', icon: 'book-open-outline' },
  { key: 'investments', label: 'Partner Investment', icon: 'account-cash-outline' },
  { key: 'payables', label: 'Loans & Payables', icon: 'cash-minus' },
  { key: 'financeExpense', label: 'Finance Expense', icon: 'receipt-text-outline' },
  { key: 'profitLoss', label: 'Profit/Loss', icon: 'finance' },
  { key: 'profitSharing', label: 'Profit Sharing', icon: 'account-group-outline' },
];

const defaultCategories = ['White', 'MS Black', 'Flat/Patta'];

const profitPartners = [
  { name: 'Shafi', mainPercent: 42.5, otherPercent: 25 },
  { name: 'Saqib', mainPercent: 22.5, otherPercent: 25 },
  { name: 'Suhail', mainPercent: 20, otherPercent: 25 },
  { name: 'Syed', mainPercent: 15, otherPercent: 25 },
];

const emptyItem = (): NonGstItem => ({
  id: makeId('bill-item'),
  product: 'White',
  qty: '',
  rate: '',
});

const emptyCustomerForm = () => ({
  name: '',
  phone: '',
  address: '',
});

const emptyStockForm = () => ({
  date: formatDate(new Date()),
  category: 'White',
  qty: '',
  unitCost: '',
});

const emptyCreditForm = () => ({
  date: formatDate(new Date()),
  customer: '',
  creditAmount: '',
  paidAmount: '',
});

const emptyCashForm = () => ({
  date: formatDate(new Date()),
  description: '',
  cashCredit: '',
  cashDebit: '',
  bankCredit: '',
  bankDebit: '',
});

const emptyInvestmentForm = () => ({
  date: formatDate(new Date()),
  partner: '',
  amount: '',
  mode: 'Cash',
  remarks: '',
  status: 'Active',
});

const emptyLoanForm = () => ({
  date: formatDate(new Date()),
  lender: '',
  amount: '',
  paidAmount: '',
  type: 'Payable',
  notes: '',
});

const emptyFinanceExpenseForm = () => ({
  date: formatDate(new Date()),
  category: '',
  amount: '',
  mode: 'Cash',
  notes: '',
});

export function ManagerNonGstBillScreen({
  user,
  onLogout,
  managerWorkbook,
  managerSequence,
  managerWorkbookReady = true,
  onWorkbookChange,
  onSequenceChange,
  syncStatus = 'checking',
  syncRevision = 0,
  syncServerUrl = '',
  syncDeviceId = '',
  manualSyncAction = null,
  onSendDeviceShare,
  onReceiveDeviceShare,
}: {
  user: AuthenticatedUser;
  onLogout: () => void;
  managerWorkbook?: ManagerWorkbook;
  managerSequence?: number;
  managerWorkbookReady?: boolean;
  onWorkbookChange?: (update: ManagerWorkbookUpdate) => void;
  onSequenceChange?: (value: number) => void;
  syncStatus?: SyncStatus;
  syncRevision?: number;
  syncServerUrl?: string;
  syncDeviceId?: string;
  manualSyncAction?: SyncAction;
  onSendDeviceShare?: () => void;
  onReceiveDeviceShare?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ManagerTab>('dashboard');
  const [managerMenuOpen, setManagerMenuOpen] = useState(false);
  const [billMode, setBillMode] = useState<BillMode>('list');
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [editingBillOriginalNo, setEditingBillOriginalNo] = useState<string | null>(null);
  const [localSequence, setLocalSequence] = useState(1);
  const [billNo, setBillNo] = useState(formatNonGstBillNo(1));
  const [billDate, setBillDate] = useState(formatDate(new Date()));
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerDraft, setCustomerDraft] = useState(emptyCustomerForm);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerPage, setCustomerPage] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [items, setItems] = useState<NonGstItem[]>([emptyItem()]);
  const [transportCharge, setTransportCharge] = useState('');
  const [loadingCharge, setLoadingCharge] = useState('');
  const [note, setNote] = useState('');
  const [localWorkbook, setLocalWorkbook] = useState<ManagerWorkbook>(createDefaultWorkbook);
  const [localWorkbookReady, setLocalWorkbookReady] = useState(false);
  const [stockForm, setStockForm] = useState(emptyStockForm);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [creditForm, setCreditForm] = useState(emptyCreditForm);
  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [creditPage, setCreditPage] = useState(1);
  const [cashForm, setCashForm] = useState(emptyCashForm);
  const [editingCashId, setEditingCashId] = useState<string | null>(null);
  const [cashPage, setCashPage] = useState(1);
  const [investmentForm, setInvestmentForm] = useState(emptyInvestmentForm);
  const [editingInvestmentId, setEditingInvestmentId] = useState<string | null>(null);
  const [investmentPage, setInvestmentPage] = useState(1);
  const [loanForm, setLoanForm] = useState(emptyLoanForm);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [loanPage, setLoanPage] = useState(1);
  const [financeExpenseForm, setFinanceExpenseForm] = useState(emptyFinanceExpenseForm);
  const [editingFinanceExpenseId, setEditingFinanceExpenseId] = useState<string | null>(null);
  const [financeExpensePage, setFinanceExpensePage] = useState(1);
  const [otherProfit, setOtherProfit] = useState(String(createDefaultWorkbook().profitSettings.otherProfit));
  const [profitExpense, setProfitExpense] = useState(String(createDefaultWorkbook().profitSettings.totalExpense));
  const usesSyncedManagerData = Boolean(managerWorkbook && onWorkbookChange && onSequenceChange);
  const sequence = managerSequence ?? localSequence;
  const workbook = managerWorkbook ?? localWorkbook;
  const workbookReady = usesSyncedManagerData ? managerWorkbookReady : localWorkbookReady;
  const availableManagerTabs = useMemo(
    () => {
      if (!onSendDeviceShare || !onReceiveDeviceShare || !syncServerUrl) return managerTabs;
      return [...managerTabs, { key: 'deviceSharing' as const, label: 'Device Sharing', icon: 'access-point-network' as IconName }];
    },
    [onReceiveDeviceShare, onSendDeviceShare, syncServerUrl],
  );

  function updateWorkbook(update: ManagerWorkbookUpdate) {
    if (onWorkbookChange) {
      onWorkbookChange(update);
      return;
    }

    setLocalWorkbook(update);
  }

  function updateSequence(value: number) {
    if (onSequenceChange) {
      onSequenceChange(value);
      return;
    }

    setLocalSequence(value);
  }

  useEffect(() => {
    if (usesSyncedManagerData) return;
    let cancelled = false;

    Promise.all([
      AsyncStorage.getItem(MANAGER_NON_GST_SEQUENCE_KEY),
      AsyncStorage.getItem(MANAGER_WORKBOOK_KEY),
    ])
      .then(([storedSequence, storedWorkbook]) => {
        const nextSequence = Math.max(1, Number(storedSequence) || 1);
        const nextWorkbook = normalizeWorkbook(storedWorkbook ? JSON.parse(storedWorkbook) : null);
        if (cancelled) return;
        setLocalSequence(nextSequence);
        setBillNo(formatNonGstBillNo(nextSequence));
        setLocalWorkbook(nextWorkbook);
        setOtherProfit(String(nextWorkbook.profitSettings.otherProfit));
        setProfitExpense(String(nextWorkbook.profitSettings.totalExpense));
        setLocalWorkbookReady(true);
      })
      .catch((error) => {
        console.warn('Unable to load manager workbook', error);
        if (!cancelled) setLocalWorkbookReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [usesSyncedManagerData]);

  useEffect(() => {
    if (usesSyncedManagerData || !localWorkbookReady) return;
    AsyncStorage.setItem(MANAGER_WORKBOOK_KEY, JSON.stringify(localWorkbook)).catch((error) => {
      console.warn('Unable to save manager workbook', error);
    });
  }, [localWorkbook, localWorkbookReady, usesSyncedManagerData]);

  useEffect(() => {
    if (usesSyncedManagerData || !localWorkbookReady) return;
    AsyncStorage.setItem(MANAGER_NON_GST_SEQUENCE_KEY, String(localSequence)).catch((error) => {
      console.warn('Unable to save manager bill sequence', error);
    });
  }, [localSequence, localWorkbookReady, usesSyncedManagerData]);

  useEffect(() => {
    if (billMode === 'list') {
      setBillNo(formatNonGstBillNo(sequence));
    }
  }, [billMode, sequence]);

  const categories = useMemo(() => {
    const names = new Set(defaultCategories);
    workbook.stockEntries.forEach((entry) => names.add(entry.category));
    workbook.sales.forEach((entry) => names.add(entry.category));
    items.forEach((item) => {
      if (item.product.trim()) names.add(item.product.trim());
    });
    return Array.from(names);
  }, [items, workbook.sales, workbook.stockEntries]);
  const savedCustomers = useMemo(() => sortManagerCustomers(workbook.customers), [workbook.customers]);
  const customerPages = Math.max(1, Math.ceil(savedCustomers.length / MANAGER_CUSTOMERS_PER_PAGE));
  const visibleCustomers = useMemo(() => {
    const start = (customerPage - 1) * MANAGER_CUSTOMERS_PER_PAGE;
    return savedCustomers.slice(start, start + MANAGER_CUSTOMERS_PER_PAGE);
  }, [customerPage, savedCustomers]);
  const billRecords = useMemo(() => buildManagerBillRecords(workbook), [workbook]);
  const creditRecords = useMemo(() => sortCreditEntries(workbook.credits), [workbook.credits]);
  const creditPages = Math.max(1, Math.ceil(creditRecords.length / MANAGER_CREDITS_PER_PAGE));
  const visibleCredits = useMemo(() => {
    const start = (creditPage - 1) * MANAGER_CREDITS_PER_PAGE;
    return creditRecords.slice(start, start + MANAGER_CREDITS_PER_PAGE);
  }, [creditPage, creditRecords]);
  const cashRecords = useMemo(() => sortCashbookEntries(workbook.cashbook), [workbook.cashbook]);
  const cashPages = Math.max(1, Math.ceil(cashRecords.length / MANAGER_CASHBOOK_PER_PAGE));
  const visibleCashRecords = useMemo(() => {
    const start = (cashPage - 1) * MANAGER_CASHBOOK_PER_PAGE;
    return cashRecords.slice(start, start + MANAGER_CASHBOOK_PER_PAGE);
  }, [cashPage, cashRecords]);
  const investmentRecords = useMemo(() => sortInvestmentEntries(workbook.investments), [workbook.investments]);
  const investmentPages = Math.max(1, Math.ceil(investmentRecords.length / MANAGER_FINANCE_PER_PAGE));
  const visibleInvestments = useMemo(() => {
    const start = (investmentPage - 1) * MANAGER_FINANCE_PER_PAGE;
    return investmentRecords.slice(start, start + MANAGER_FINANCE_PER_PAGE);
  }, [investmentPage, investmentRecords]);
  const loanRecords = useMemo(() => sortLoanEntries(workbook.loans), [workbook.loans]);
  const loanPages = Math.max(1, Math.ceil(loanRecords.length / MANAGER_FINANCE_PER_PAGE));
  const visibleLoans = useMemo(() => {
    const start = (loanPage - 1) * MANAGER_FINANCE_PER_PAGE;
    return loanRecords.slice(start, start + MANAGER_FINANCE_PER_PAGE);
  }, [loanPage, loanRecords]);
  const financeExpenseRecords = useMemo(() => sortManagerExpenseEntries(workbook.expenses), [workbook.expenses]);
  const financeExpensePages = Math.max(1, Math.ceil(financeExpenseRecords.length / MANAGER_FINANCE_PER_PAGE));
  const visibleFinanceExpenses = useMemo(() => {
    const start = (financeExpensePage - 1) * MANAGER_FINANCE_PER_PAGE;
    return financeExpenseRecords.slice(start, start + MANAGER_FINANCE_PER_PAGE);
  }, [financeExpensePage, financeExpenseRecords]);

  const summaries = useMemo(() => buildCategorySummaries(workbook, categories), [categories, workbook]);
  const totals = useMemo(() => {
    const itemTotal = items.reduce((sum, item) => sum + parseAmount(item.qty) * parseAmount(item.rate), 0);
    const extras = parseAmount(transportCharge) + parseAmount(loadingCharge);
    return {
      itemTotal,
      extras,
      grandTotal: Math.round(itemTotal + extras),
    };
  }, [items, loadingCharge, transportCharge]);
  const workbookTotals = useMemo(() => buildWorkbookTotals(workbook, summaries), [summaries, workbook]);
  const pnl = useMemo(() => buildProfitAndLoss(workbook, workbookTotals), [workbook, workbookTotals]);

  useEffect(() => {
    setCustomerPage((page) => Math.min(page, customerPages));
  }, [customerPages]);

  useEffect(() => {
    setCreditPage((page) => Math.min(page, creditPages));
  }, [creditPages]);

  useEffect(() => {
    setCashPage((page) => Math.min(page, cashPages));
  }, [cashPages]);

  useEffect(() => {
    setInvestmentPage((page) => Math.min(page, investmentPages));
  }, [investmentPages]);

  useEffect(() => {
    setLoanPage((page) => Math.min(page, loanPages));
  }, [loanPages]);

  useEffect(() => {
    setFinanceExpensePage((page) => Math.min(page, financeExpensePages));
  }, [financeExpensePages]);

  function updateItem(id: string, field: keyof NonGstItem, value: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((current) => [...current, emptyItem()]);
  }

  function removeItem(id: string) {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.id !== id)));
  }

  function resetBill(nextSequence = sequence) {
    setEditingBillId(null);
    setEditingBillOriginalNo(null);
    setBillNo(formatNonGstBillNo(nextSequence));
    setBillDate(formatDate(new Date()));
    setSelectedCustomerId(null);
    setCustomerDropdownOpen(false);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setVehicleNo('');
    setItems([emptyItem()]);
    setTransportCharge('');
    setLoadingCharge('');
    setNote('');
  }

  function startNewBill() {
    resetBill(sequence);
    setBillMode('form');
  }

  function showBillList() {
    setCustomerDropdownOpen(false);
    setEditingBillId(null);
    setEditingBillOriginalNo(null);
    setBillMode('list');
  }

  async function prepareNextBill() {
    const nextSequence = sequence + 1;
    updateSequence(nextSequence);
    resetBill(nextSequence);
  }

  function saveBillSales() {
    if (!isBillValid()) return false;

    const billItems = items
      .filter((item) => item.product.trim() && parseAmount(item.qty) > 0 && parseAmount(item.rate) > 0)
      .map<NonGstBillRecordItem>((item) => ({
        product: item.product.trim(),
        qty: parseAmount(item.qty),
        rate: parseAmount(item.rate),
      }));
    const saleRows = billItems.map<SaleEntry>((item) => ({
        id: makeId('sale'),
        billNo,
        date: billDate,
        customer: customerName.trim(),
        category: item.product,
        qty: item.qty,
        sellingRate: item.rate,
      }));
    const billTotal = Math.round(
      billItems.reduce((sum, item) => sum + item.qty * item.rate, 0) + parseAmount(transportCharge) + parseAmount(loadingCharge),
    );

    updateWorkbook((current) => {
      const originalBillNo = editingBillOriginalNo || billNo;
      const existingBill = editingBillId
        ? current.bills.find((record) => record.id === editingBillId) || current.bills.find((record) => record.billNo === originalBillNo)
        : current.bills.find((record) => record.billNo === billNo);
      const billRecord: NonGstBillRecord = {
        id: existingBill?.id || makeId('manager-bill'),
        billNo,
        date: billDate,
        customer: customerName.trim(),
        phone: customerPhone.trim(),
        address: customerAddress.trim(),
        vehicleNo: vehicleNo.trim(),
        items: billItems,
        transportCharge: parseAmount(transportCharge),
        loadingCharge: parseAmount(loadingCharge),
        note: note.trim(),
        total: billTotal,
      };

      return {
        ...current,
        customers: upsertManagerCustomer(current.customers, {
          id: selectedCustomerId || makeId('customer'),
          name: customerName.trim(),
          phone: customerPhone.trim(),
          address: customerAddress.trim(),
        }),
        bills: [
          billRecord,
          ...current.bills.filter((record) => record.id !== billRecord.id && record.billNo !== billNo && record.billNo !== originalBillNo),
        ],
        sales: [...saleRows, ...current.sales.filter((entry) => entry.billNo !== billNo && entry.billNo !== originalBillNo)],
      };
    });
    return true;
  }

  function editBillRecord(record: NonGstBillRecord) {
    const selectedCustomer = findManagerCustomerMatch(savedCustomers, { name: record.customer, phone: record.phone });
    setEditingBillId(record.id);
    setEditingBillOriginalNo(record.billNo);
    setBillNo(record.billNo);
    setBillDate(record.date);
    setSelectedCustomerId(selectedCustomer?.id || null);
    setCustomerDropdownOpen(false);
    setCustomerName(record.customer);
    setCustomerPhone(record.phone);
    setCustomerAddress(record.address);
    setVehicleNo(record.vehicleNo);
    setItems(record.items.length ? record.items.map((item) => ({
      id: makeId('bill-item'),
      product: item.product,
      qty: formatFormNumber(item.qty),
      rate: formatFormNumber(item.rate),
    })) : [emptyItem()]);
    setTransportCharge(record.transportCharge ? formatFormNumber(record.transportCharge) : '');
    setLoadingCharge(record.loadingCharge ? formatFormNumber(record.loadingCharge) : '');
    setNote(record.note);
    setBillMode('form');
  }

  function deleteBillRecord(record: NonGstBillRecord) {
    Alert.alert('Delete bill receipt', `Delete ${record.billNo}? This will remove it from sales and stock reports.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateWorkbook((current) => ({
            ...current,
            bills: current.bills.filter((billRecord) => billRecord.id !== record.id && billRecord.billNo !== record.billNo),
            sales: current.sales.filter((sale) => sale.billNo !== record.billNo),
          }));
          if (editingBillId === record.id || editingBillOriginalNo === record.billNo) {
            resetBill(sequence);
            setBillMode('list');
          }
        },
      },
    ]);
  }

  function selectCustomer(customer: ManagerCustomer) {
    setSelectedCustomerId(customer.id);
    setCustomerDropdownOpen(false);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setCustomerAddress(customer.address);
  }

  function saveCustomerEntry() {
    const name = customerDraft.name.trim();
    if (!name) {
      Alert.alert('Customer required', 'Enter customer name before saving.');
      return;
    }

    const nextCustomer: ManagerCustomer = {
      id: editingCustomerId || makeId('customer'),
      name,
      phone: customerDraft.phone.trim(),
      address: customerDraft.address.trim(),
    };

    updateWorkbook((current) => ({
      ...current,
      customers: editingCustomerId
        ? current.customers.map((customer) => (customer.id === editingCustomerId ? nextCustomer : customer))
        : upsertManagerCustomer(current.customers, nextCustomer),
    }));
    if (!editingCustomerId) setCustomerPage(1);
    if (selectedCustomerId === nextCustomer.id) {
      selectCustomer(nextCustomer);
    }
    setCustomerDraft(emptyCustomerForm());
    setEditingCustomerId(null);
  }

  function editCustomerEntry(customer: ManagerCustomer) {
    setEditingCustomerId(customer.id);
    setCustomerDraft({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
    });
  }

  function cancelCustomerEdit() {
    setEditingCustomerId(null);
    setCustomerDraft(emptyCustomerForm());
  }

  function deleteCustomerEntry(customer: ManagerCustomer) {
    Alert.alert('Delete customer', `Delete ${customer.name}? Existing receipts will stay unchanged.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateWorkbook((current) => ({
            ...current,
            customers: current.customers.filter((record) => record.id !== customer.id),
          }));
          if (selectedCustomerId === customer.id) {
            setSelectedCustomerId(null);
            setCustomerName('');
            setCustomerPhone('');
            setCustomerAddress('');
          }
          if (editingCustomerId === customer.id) {
            cancelCustomerEdit();
          }
        },
      },
    ]);
  }

  async function saveBillOnly() {
    if (!saveBillSales()) return;
    const wasEditing = Boolean(editingBillId);
    if (wasEditing) {
      setEditingBillId(null);
      setEditingBillOriginalNo(null);
    } else {
      await prepareNextBill();
    }
    setBillMode('list');
    Alert.alert(wasEditing ? 'Bill updated' : 'Bill saved', `${billNo} ${wasEditing ? 'updated' : 'saved'} into Sales ledger.`);
  }

  async function printBill() {
    if (!isBillValid()) return;

    try {
      await Print.printAsync({ html: await buildNonGstBillHtml() });
      const wasEditing = Boolean(editingBillId);
      saveBillSales();
      if (wasEditing) {
        setEditingBillId(null);
        setEditingBillOriginalNo(null);
      } else {
        await prepareNextBill();
      }
      setBillMode('list');
    } catch (error) {
      Alert.alert('Print failed', error instanceof Error ? error.message : 'Unable to open print preview.');
    }
  }

  async function shareBill() {
    if (!isBillValid()) return;

    try {
      const result = await Print.printToFileAsync({ html: await buildNonGstBillHtml() });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Share bill receipt' });
      } else {
        Alert.alert('PDF created', result.uri);
      }
      const wasEditing = Boolean(editingBillId);
      saveBillSales();
      if (wasEditing) {
        setEditingBillId(null);
        setEditingBillOriginalNo(null);
      } else {
        await prepareNextBill();
      }
      setBillMode('list');
    } catch (error) {
      Alert.alert('Share failed', error instanceof Error ? error.message : 'Unable to create PDF.');
    }
  }

  function isBillValid() {
    const hasItem = items.some((item) => item.product.trim() && parseAmount(item.qty) > 0 && parseAmount(item.rate) > 0);
    if (!selectedCustomerId || !customerName.trim()) {
      Alert.alert('Customer required', 'Select a saved customer before saving bill receipt.');
      return false;
    }
    if (!hasItem) {
      Alert.alert('Item required', 'Enter at least one item with quantity and rate.');
      return false;
    }
    return true;
  }

  function saveStockEntry() {
    const qty = parseAmount(stockForm.qty);
    const unitCost = parseAmount(stockForm.unitCost);
    const category = stockForm.category.trim();
    if (!category || qty <= 0 || unitCost <= 0) {
      Alert.alert('Stock required', 'Enter category, quantity, and unit cost.');
      return;
    }

    const entry: StockEntry = {
      id: editingStockId || makeId('stock'),
      date: stockForm.date,
      category,
      qty,
      unitCost,
    };

    updateWorkbook((current) => ({
      ...current,
      stockEntries: editingStockId
        ? current.stockEntries.map((stockEntry) => (stockEntry.id === editingStockId ? entry : stockEntry))
        : [entry, ...current.stockEntries],
    }));
    setStockForm(emptyStockForm());
    setEditingStockId(null);
  }

  function editStockEntry(entry: StockEntry) {
    setEditingStockId(entry.id);
    setStockForm({
      date: entry.date,
      category: entry.category,
      qty: formatFormNumber(entry.qty),
      unitCost: formatFormNumber(entry.unitCost),
    });
  }

  function cancelStockEdit() {
    setEditingStockId(null);
    setStockForm(emptyStockForm());
  }

  function saveCreditEntry() {
    const customer = creditForm.customer.trim();
    const creditAmount = parseAmount(creditForm.creditAmount);
    if (!customer || creditAmount <= 0) {
      Alert.alert('Credit required', 'Enter customer and credit amount.');
      return;
    }

    const entry: CustomerCreditEntry = {
      id: editingCreditId || makeId('credit'),
      date: creditForm.date,
      customer,
      creditAmount,
      paidAmount: parseAmount(creditForm.paidAmount),
    };

    updateWorkbook((current) => ({
      ...current,
      credits: editingCreditId
        ? current.credits.map((credit) => (credit.id === editingCreditId ? entry : credit))
        : [entry, ...current.credits],
    }));
    if (!editingCreditId) setCreditPage(1);
    setCreditForm(emptyCreditForm());
    setEditingCreditId(null);
  }

  function editCreditEntry(entry: CustomerCreditEntry) {
    setEditingCreditId(entry.id);
    setCreditForm({
      date: entry.date,
      customer: entry.customer,
      creditAmount: formatFormNumber(entry.creditAmount),
      paidAmount: entry.paidAmount ? formatFormNumber(entry.paidAmount) : '',
    });
  }

  function cancelCreditEdit() {
    setEditingCreditId(null);
    setCreditForm(emptyCreditForm());
  }

  function deleteCreditEntry(entry: CustomerCreditEntry) {
    Alert.alert('Delete credit', `Delete ${entry.customer} credit entry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateWorkbook((current) => ({
            ...current,
            credits: current.credits.filter((credit) => credit.id !== entry.id),
          }));
          if (editingCreditId === entry.id) {
            cancelCreditEdit();
          }
        },
      },
    ]);
  }

  function saveCashEntry() {
    const hasAmount = parseAmount(cashForm.cashCredit) || parseAmount(cashForm.cashDebit) || parseAmount(cashForm.bankCredit) || parseAmount(cashForm.bankDebit);
    if (!cashForm.description.trim() || !hasAmount) {
      Alert.alert('Cashbook required', 'Enter description and one cash/bank amount.');
      return;
    }

    const entry: CashbookEntry = {
      id: editingCashId || makeId('cash'),
      date: cashForm.date,
      description: cashForm.description.trim(),
      cashCredit: parseAmount(cashForm.cashCredit),
      cashDebit: parseAmount(cashForm.cashDebit),
      bankCredit: parseAmount(cashForm.bankCredit),
      bankDebit: parseAmount(cashForm.bankDebit),
    };

    updateWorkbook((current) => ({
      ...current,
      cashbook: editingCashId
        ? current.cashbook.map((cashEntry) => (cashEntry.id === editingCashId ? entry : cashEntry))
        : [entry, ...current.cashbook],
    }));
    if (!editingCashId) setCashPage(1);
    setCashForm(emptyCashForm());
    setEditingCashId(null);
  }

  function editCashEntry(entry: CashbookEntry) {
    setEditingCashId(entry.id);
    setCashForm({
      date: entry.date,
      description: entry.description,
      cashCredit: entry.cashCredit ? formatFormNumber(entry.cashCredit) : '',
      cashDebit: entry.cashDebit ? formatFormNumber(entry.cashDebit) : '',
      bankCredit: entry.bankCredit ? formatFormNumber(entry.bankCredit) : '',
      bankDebit: entry.bankDebit ? formatFormNumber(entry.bankDebit) : '',
    });
  }

  function cancelCashEdit() {
    setEditingCashId(null);
    setCashForm(emptyCashForm());
  }

  function deleteCashEntry(entry: CashbookEntry) {
    Alert.alert('Delete cashbook', `Delete ${entry.description} entry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateWorkbook((current) => ({
            ...current,
            cashbook: current.cashbook.filter((cashEntry) => cashEntry.id !== entry.id),
          }));
          if (editingCashId === entry.id) {
            cancelCashEdit();
          }
        },
      },
    ]);
  }

  function saveInvestmentEntry() {
    const partner = investmentForm.partner.trim();
    const amount = parseAmount(investmentForm.amount);
    if (!partner || amount <= 0) {
      Alert.alert('Investment required', 'Enter partner name and amount.');
      return;
    }

    const entry: PartnerInvestmentEntry = {
      id: editingInvestmentId || makeId('investment'),
      date: investmentForm.date,
      partner,
      amount,
      mode: investmentForm.mode.trim() || 'Cash',
      remarks: investmentForm.remarks.trim(),
      status: investmentForm.status.trim() || 'Active',
    };

    updateWorkbook((current) => ({
      ...current,
      investments: editingInvestmentId
        ? current.investments.map((investment) => (investment.id === editingInvestmentId ? entry : investment))
        : [entry, ...current.investments],
    }));
    if (!editingInvestmentId) setInvestmentPage(1);
    setInvestmentForm(emptyInvestmentForm());
    setEditingInvestmentId(null);
  }

  function editInvestmentEntry(entry: PartnerInvestmentEntry) {
    setEditingInvestmentId(entry.id);
    setInvestmentForm({
      date: entry.date,
      partner: entry.partner,
      amount: formatFormNumber(entry.amount),
      mode: entry.mode,
      remarks: entry.remarks,
      status: entry.status,
    });
  }

  function cancelInvestmentEdit() {
    setEditingInvestmentId(null);
    setInvestmentForm(emptyInvestmentForm());
  }

  function deleteInvestmentEntry(entry: PartnerInvestmentEntry) {
    Alert.alert('Delete investment', `Delete ${entry.partner} investment?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateWorkbook((current) => ({
            ...current,
            investments: current.investments.filter((investment) => investment.id !== entry.id),
          }));
          if (editingInvestmentId === entry.id) {
            cancelInvestmentEdit();
          }
        },
      },
    ]);
  }

  function saveLoanEntry() {
    const lender = loanForm.lender.trim();
    const amount = parseAmount(loanForm.amount);
    if (!lender || amount <= 0) {
      Alert.alert('Loan required', 'Enter lender name and amount.');
      return;
    }

    const entry: LoanPayableEntry = {
      id: editingLoanId || makeId('loan'),
      date: loanForm.date,
      lender,
      amount,
      paidAmount: parseAmount(loanForm.paidAmount),
      type: loanForm.type.trim() || 'Payable',
      notes: loanForm.notes.trim(),
    };

    updateWorkbook((current) => ({
      ...current,
      loans: editingLoanId
        ? current.loans.map((loan) => (loan.id === editingLoanId ? entry : loan))
        : [entry, ...current.loans],
    }));
    if (!editingLoanId) setLoanPage(1);
    setLoanForm(emptyLoanForm());
    setEditingLoanId(null);
  }

  function editLoanEntry(entry: LoanPayableEntry) {
    setEditingLoanId(entry.id);
    setLoanForm({
      date: entry.date,
      lender: entry.lender,
      amount: formatFormNumber(entry.amount),
      paidAmount: entry.paidAmount ? formatFormNumber(entry.paidAmount) : '',
      type: entry.type,
      notes: entry.notes,
    });
  }

  function cancelLoanEdit() {
    setEditingLoanId(null);
    setLoanForm(emptyLoanForm());
  }

  function deleteLoanEntry(entry: LoanPayableEntry) {
    Alert.alert('Delete payable', `Delete ${entry.lender} payable?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateWorkbook((current) => ({
            ...current,
            loans: current.loans.filter((loan) => loan.id !== entry.id),
          }));
          if (editingLoanId === entry.id) {
            cancelLoanEdit();
          }
        },
      },
    ]);
  }

  function saveFinanceExpenseEntry() {
    const category = financeExpenseForm.category.trim();
    const amount = parseAmount(financeExpenseForm.amount);
    if (!category || amount <= 0) {
      Alert.alert('Expense required', 'Enter expense category and amount.');
      return;
    }

    const entry: ManagerExpenseEntry = {
      id: editingFinanceExpenseId || makeId('finance-expense'),
      date: financeExpenseForm.date,
      category,
      amount,
      mode: financeExpenseForm.mode.trim() || 'Cash',
      notes: financeExpenseForm.notes.trim(),
    };

    updateWorkbook((current) => ({
      ...current,
      expenses: editingFinanceExpenseId
        ? current.expenses.map((expense) => (expense.id === editingFinanceExpenseId ? entry : expense))
        : [entry, ...current.expenses],
    }));
    if (!editingFinanceExpenseId) setFinanceExpensePage(1);
    setFinanceExpenseForm(emptyFinanceExpenseForm());
    setEditingFinanceExpenseId(null);
  }

  function editFinanceExpenseEntry(entry: ManagerExpenseEntry) {
    setEditingFinanceExpenseId(entry.id);
    setFinanceExpenseForm({
      date: entry.date,
      category: entry.category,
      amount: formatFormNumber(entry.amount),
      mode: entry.mode,
      notes: entry.notes,
    });
  }

  function cancelFinanceExpenseEdit() {
    setEditingFinanceExpenseId(null);
    setFinanceExpenseForm(emptyFinanceExpenseForm());
  }

  function deleteFinanceExpenseEntry(entry: ManagerExpenseEntry) {
    Alert.alert('Delete expense', `Delete ${entry.category} expense?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateWorkbook((current) => ({
            ...current,
            expenses: current.expenses.filter((expense) => expense.id !== entry.id),
          }));
          if (editingFinanceExpenseId === entry.id) {
            cancelFinanceExpenseEdit();
          }
        },
      },
    ]);
  }

  function saveProfitSettings() {
    updateWorkbook((current) => ({
      ...current,
      profitSettings: {
        otherProfit: parseAmount(otherProfit),
        totalExpense: parseAmount(profitExpense),
      },
    }));
    Alert.alert('Profit sharing updated', 'Other profit and expense values updated.');
  }

  async function buildNonGstBillHtml() {
    const { logoDataUri, signatureDataUri } = await getPrintableAssets();
    const rows = items
      .filter((item) => item.product.trim() || parseAmount(item.qty) || parseAmount(item.rate))
      .map((item, index) => {
        const qty = parseAmount(item.qty);
        const rate = parseAmount(item.rate);
        const amount = qty * rate;
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.product || '-')}</td>
            <td class="right">${numberFormat(qty)}</td>
            <td class="right">${money(rate)}</td>
            <td class="right strong">${money(amount)}</td>
          </tr>
        `;
      })
      .join('');
    const extraRows = [
      parseAmount(transportCharge) > 0 ? `<tr><td>Transport Charge</td><td>${money(parseAmount(transportCharge))}</td></tr>` : '',
      parseAmount(loadingCharge) > 0 ? `<tr><td>Loading Charge</td><td>${money(parseAmount(loadingCharge))}</td></tr>` : '',
    ].join('');

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; }
            .page { width: 760px; margin: 0 auto; padding: 38px 44px 30px; }
            .top { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 3px solid #d0a51f; padding-bottom: 14px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .logo { width: 72px; height: 72px; object-fit: contain; }
            .company { font-size: 22px; font-weight: 900; }
            .sub { margin-top: 3px; font-size: 12px; font-weight: 700; color: #4b5563; }
            .meta { text-align: right; font-size: 18px; line-height: 1.4; }
            .title { margin-top: 24px; padding: 10px 12px; background: #102f35; color: #fff; font-size: 22px; font-weight: 900; text-align: center; }
            .party { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; font-size: 13px; line-height: 1.45; }
            .box { border: 1px solid #d5dbe3; padding: 12px; min-height: 112px; }
            .label { font-size: 11px; font-weight: 900; color: #667085; text-transform: uppercase; }
            .strong { font-weight: 900; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 9px; text-align: left; }
            th { background: #f1f5f9; font-weight: 900; }
            .right { text-align: right; }
            .summary { width: 45%; margin-left: auto; margin-top: 10px; }
            .summary td:first-child { font-weight: 900; text-align: right; }
            .grand td { background: #d0aa21; font-size: 15px; font-weight: 900; }
            .note { margin-top: 18px; padding: 10px; border: 1px dashed #cbd5e1; font-size: 12px; min-height: 38px; }
            .footer { display: flex; justify-content: space-between; margin-top: 34px; font-size: 12px; }
            .sign { text-align: center; font-weight: 900; min-width: 180px; }
            .seal { width: 150px; height: 100px; object-fit: contain; margin: 8px auto 4px; display: block; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="top">
              <div class="brand">
                <img class="logo" src="${logoDataUri}" />
                <div>
                  <div class="company">LUCKY TRADERS</div>
                  <div class="sub">2/164/14 Line Kollai, Krishnagiri, Tamil Nadu - 635002</div>
                  <div class="sub">Phone: +91 7418287561</div>
                </div>
              </div>
              <div class="meta">
                <div><b>Receipt No:</b> ${escapeHtml(billNo)}</div>
                <div><b>Date:</b> ${escapeHtml(billDate)}</div>
              </div>
            </div>
            <div class="title">BILL RECEIPT</div>
            <div class="party">
              <div class="box">
                <div class="label">Customer</div>
                <div class="strong">${escapeHtml(customerName)}</div>
                <div>${escapeHtml(customerAddress || '-')}</div>
                <div>Phone: ${escapeHtml(customerPhone || '-')}</div>
              </div>
              <div class="box">
                <div class="label">Receipt Details</div>
                <div>Vehicle No: ${escapeHtml(vehicleNo || '-')}</div>
                <div>Prepared By: ${escapeHtml(user.name)}</div>
              </div>
            </div>
            <table>
              <thead><tr><th>#</th><th>Category / Product</th><th class="right">Qty (Kg)</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <table class="summary">
              <tr><td>Item Total</td><td class="right">${money(totals.itemTotal)}</td></tr>
              ${extraRows}
              <tr class="grand"><td>Grand Total</td><td class="right">${money(totals.grandTotal)}</td></tr>
            </table>
            <div class="note"><b>Note:</b> ${escapeHtml(note || 'Thank you for your business.')}</div>
            <div class="footer">
              <div>Goods once sold will not be taken back.</div>
              <div class="sign">
                For LUCKY TRADERS
                <img class="seal" src="${signatureDataUri}" />
                Authorized Signatory
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  function renderNonGstBillPreview() {
    const visibleItems = items.filter((item) => item.product.trim() || parseAmount(item.qty) || parseAmount(item.rate));

    return (
      <Card title="Bill preview" icon="file-eye-outline">
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.finalBillScroll}>
          <View style={styles.finalBillPage}>
            <View style={styles.finalBillHeader}>
              <View>
                <Image source={logo} style={styles.finalBillLogo} />
                <Text style={styles.finalBillCompany}>LUCKY TRADERS</Text>
              </View>
              <View style={styles.finalBillMeta}>
                <Text style={styles.finalBillMetaText}>
                  <Text style={styles.finalBillMetaLabel}>Receipt No:</Text> {billNo}
                </Text>
                <Text style={styles.finalBillMetaText}>
                  <Text style={styles.finalBillMetaLabel}>Receipt Date:</Text> {billDate}
                </Text>
              </View>
            </View>
            <View style={styles.finalBillGoldLine} />

            <View style={styles.finalBillParties}>
              <View style={styles.finalBillParty}>
                <Text style={styles.finalBillPartyTitle}>From:</Text>
                <Text style={styles.finalBillPartyStrong}>LUCKY TRADERS</Text>
                <Text style={styles.finalBillText}>2/164/14 Line Kollai, Krishnagiri</Text>
                <Text style={styles.finalBillText}>Tamil Nadu - 635002</Text>
                <Text style={styles.finalBillText}>
                  <Text style={styles.finalBillBold}>Phone:</Text> +91 7418287561
                </Text>
              </View>
              <View style={styles.finalBillParty}>
                <Text style={styles.finalBillPartyTitle}>To:</Text>
                <Text style={styles.finalBillPartyStrong}>{customerName || '-'}</Text>
                <Text style={styles.finalBillText}>{customerAddress || '-'}</Text>
                <Text style={styles.finalBillText}>
                  <Text style={styles.finalBillBold}>Phone:</Text> {customerPhone || '-'}
                </Text>
                <Text style={styles.finalBillText}>
                  <Text style={styles.finalBillBold}>Vehicle:</Text> {vehicleNo || '-'}
                </Text>
              </View>
            </View>

            <View style={styles.finalBillTable}>
              <View style={[styles.finalBillTableRow, styles.finalBillTableHead]}>
                <Text style={[styles.finalBillCell, styles.finalBillColNo]}>#</Text>
                <Text style={[styles.finalBillCell, { width: 210 }]}>PRODUCT</Text>
                <Text style={[styles.finalBillCell, styles.finalBillColQty]}>QTY (Kg)</Text>
                <Text style={[styles.finalBillCell, styles.finalBillColRate]}>RATE</Text>
                <Text style={[styles.finalBillCell, styles.finalBillColAmount, styles.finalBillRight]}>Amount</Text>
              </View>
              {visibleItems.length ? (
                visibleItems.map((item, index) => {
                  const qty = parseAmount(item.qty);
                  const rate = parseAmount(item.rate);
                  return (
                    <View style={styles.finalBillTableRow} key={item.id}>
                      <Text style={[styles.finalBillCell, styles.finalBillColNo]}>{index + 1}</Text>
                      <Text style={[styles.finalBillCell, { width: 210 }]}>{item.product || '-'}</Text>
                      <Text style={[styles.finalBillCell, styles.finalBillColQty]}>{numberFormat(qty)}</Text>
                      <Text style={[styles.finalBillCell, styles.finalBillColRate]}>{numberFormat(rate)}</Text>
                      <Text style={[styles.finalBillCell, styles.finalBillColAmount, styles.finalBillRight, styles.finalBillBold]}>
                        {money(qty * rate)}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <View style={styles.finalBillTableRow}>
                  <Text style={[styles.finalBillCell, { width: 522 }]}>No items added.</Text>
                </View>
              )}
            </View>

            <View style={styles.finalBillSummary}>
              <View style={styles.finalBillSummaryLine}>
                <Text style={styles.finalBillSummaryLabel}>Item Total:</Text>
                <Text style={styles.finalBillSummaryValue}>{money(totals.itemTotal)}</Text>
              </View>
              {parseAmount(transportCharge) > 0 ? (
                <View style={styles.finalBillSummaryLine}>
                  <Text style={styles.finalBillSummaryLabel}>Transport Charge:</Text>
                  <Text style={styles.finalBillSummaryValue}>{money(parseAmount(transportCharge))}</Text>
                </View>
              ) : null}
              {parseAmount(loadingCharge) > 0 ? (
                <View style={styles.finalBillSummaryLine}>
                  <Text style={styles.finalBillSummaryLabel}>Loading Charge:</Text>
                  <Text style={styles.finalBillSummaryValue}>{money(parseAmount(loadingCharge))}</Text>
                </View>
              ) : null}
              <View style={[styles.finalBillSummaryLine, styles.finalBillGrandLine]}>
                <Text style={[styles.finalBillSummaryLabel, styles.finalBillGrandText]}>Grand Total:</Text>
                <Text style={[styles.finalBillSummaryValue, styles.finalBillGrandText]}>{money(totals.grandTotal)}</Text>
              </View>
            </View>

            <Text style={styles.finalBillWords}>Bill Receipt | {note || 'Thank you for your business.'}</Text>
            <View style={styles.finalBillFooter}>
              <View style={styles.finalBillBank}>
                <Text style={styles.finalBillBankTitle}>CUSTOMER DETAILS</Text>
                <Text style={styles.finalBillText}>Name: {customerName || '-'}</Text>
                <Text style={styles.finalBillText}>Phone: {customerPhone || '-'}</Text>
              </View>
              <View style={styles.finalBillSign}>
                <Text style={styles.finalBillBold}>For LUCKY TRADERS</Text>
                <Image source={signature} style={styles.finalBillSignature} resizeMode="contain" />
                <Text style={styles.finalBillBold}>Authorized Signatory</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </Card>
    );
  }

  function renderCustomersTab() {
    const editingCustomer = Boolean(editingCustomerId);

    return (
      <>
        <Card
          title={editingCustomerId ? 'Edit customer' : 'Add customer'}
          icon="account-plus-outline"
          action={
            editingCustomerId ? (
              <Pressable style={styles.cancelEditButton} onPress={cancelCustomerEdit}>
                <MaterialCommunityIcons name="close" size={15} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Cancel</Text>
              </Pressable>
            ) : null
          }
        >
          {editingCustomerId ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Editing selected customer</Text>
            </View>
          ) : null}
          <Field
            label="Customer Name"
            value={customerDraft.name}
            onChangeText={(value) => setCustomerDraft((current) => ({ ...current, name: value }))}
          />
          <Field
            label="Phone"
            value={customerDraft.phone}
            onChangeText={(value) => setCustomerDraft((current) => ({ ...current, phone: value }))}
            keyboardType="phone-pad"
          />
          <Field
            label="Address"
            value={customerDraft.address}
            onChangeText={(value) => setCustomerDraft((current) => ({ ...current, address: value }))}
            multiline
          />
          <Pressable style={styles.primaryNavButton} onPress={saveCustomerEntry}>
            <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryNavText}>{editingCustomerId ? 'Update Customer' : 'Save Customer'}</Text>
          </Pressable>
        </Card>

        {!editingCustomer ? (
        <Card title="Customer list" icon="account-group-outline">
          {savedCustomers.length ? (
            <>
              <View style={styles.listToolbar}>
                <View>
                  <Text style={styles.listToolbarTitle}>Saved customers</Text>
                  <Text style={styles.listToolbarMeta}>Page {customerPage} of {customerPages}</Text>
                </View>
                <Text style={styles.listCountBadge}>{visibleCustomers.length} showing</Text>
              </View>

              <View style={styles.invoiceList}>
                {visibleCustomers.map((customer) => (
                  <View style={styles.savedInvoiceCard} key={customer.id}>
                    <View style={styles.savedInvoiceHeader}>
                      <View style={styles.quickActionText}>
                        <Text style={styles.savedInvoiceNo}>{customer.name}</Text>
                        <Text style={styles.savedInvoiceMeta}>{customer.phone || 'No phone'}</Text>
                        <Text style={styles.savedInvoiceMeta} numberOfLines={2}>{customer.address || 'No address'}</Text>
                      </View>
                    </View>
                    <View style={styles.invoiceActionRow}>
                      <Pressable style={styles.invoicePreviewButton} onPress={() => editCustomerEntry(customer)}>
                        <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                        <Text style={styles.invoicePreviewButtonText}>Edit</Text>
                      </Pressable>
                      <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteCustomerEntry(customer)}>
                        <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                        <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.paginationBar}>
                <Pressable
                  style={[styles.paginationButton, customerPage === 1 && styles.navButtonDisabled]}
                  onPress={() => setCustomerPage((page) => Math.max(1, page - 1))}
                  disabled={customerPage === 1}
                >
                  <MaterialCommunityIcons name="chevron-left" size={18} color="#163a5f" />
                  <Text style={styles.paginationButtonText}>Previous</Text>
                </Pressable>
                <Text style={styles.paginationText}>{customerPage} / {customerPages}</Text>
                <Pressable
                  style={[styles.paginationButton, customerPage === customerPages && styles.navButtonDisabled]}
                  onPress={() => setCustomerPage((page) => Math.min(customerPages, page + 1))}
                  disabled={customerPage === customerPages}
                >
                  <Text style={styles.paginationButtonText}>Next</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#163a5f" />
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.mutedText}>No customers saved yet.</Text>
          )}
        </Card>
        ) : null}
      </>
    );
  }

  function renderBillList() {
    return (
      <Card
        title="Bills list"
        icon="file-document-multiple-outline"
        action={
          <Pressable style={styles.smallButton} onPress={startNewBill}>
            <MaterialCommunityIcons name="plus" size={16} color="#163a5f" />
            <Text style={styles.smallButtonText}>Add Bill</Text>
          </Pressable>
        }
      >
        {billRecords.length ? (
          <View style={styles.invoiceList}>
            {billRecords.map((record) => {
              const totalQty = record.items.reduce((sum, item) => sum + item.qty, 0);
              const itemLabel = record.items.length === 1 ? 'item' : 'items';
              const productLine = record.items
                .map((item) => `${item.product} ${numberFormat(item.qty)} Kg`)
                .join(' | ');

              return (
                <View style={styles.savedInvoiceCard} key={record.id}>
                  <View style={styles.savedInvoiceHeader}>
                    <View style={styles.quickActionText}>
                      <Text style={styles.savedInvoiceNo}>{record.billNo}</Text>
                      <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                        {record.customer || 'Walk-in customer'}
                      </Text>
                      <Text style={styles.savedInvoiceMeta}>
                        {record.date} | {record.items.length} {itemLabel} | {numberFormat(totalQty)} Kg
                      </Text>
                    </View>
                    <View style={styles.savedInvoiceTotalBadge}>
                      <Text style={styles.savedInvoiceStatus}>TOTAL</Text>
                      <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {money(record.total)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.savedInvoiceMeta} numberOfLines={2}>
                    {productLine || 'No item details'}
                  </Text>
                  <View style={styles.invoiceActionRow}>
                    <Pressable style={styles.invoicePreviewButton} onPress={() => editBillRecord(record)}>
                      <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                      <Text style={styles.invoicePreviewButtonText}>Edit</Text>
                    </Pressable>
                    <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteBillRecord(record)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                      <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.mutedText}>No bill receipts saved yet. Tap Add Bill to create the first receipt.</Text>
        )}
      </Card>
    );
  }

  function renderBillTab() {
    if (billMode === 'list') return renderBillList();

    return (
      <>
        <Card
          title={editingBillId ? 'Edit bill details' : 'Bill details'}
          icon="file-document-edit-outline"
          action={
            <Pressable style={styles.smallButton} onPress={showBillList}>
              <MaterialCommunityIcons name={editingBillId ? 'close' : 'format-list-bulleted'} size={16} color="#163a5f" />
              <Text style={styles.smallButtonText}>{editingBillId ? 'Cancel' : 'List'}</Text>
            </Pressable>
          }
        >
          {editingBillId ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Editing saved bill receipt</Text>
            </View>
          ) : null}
          <Field label="Receipt No" value={billNo} onChangeText={setBillNo} />
          <DatePickerField label="Receipt Date" value={billDate} onChange={setBillDate} />
          <CustomerDropdown
            customers={savedCustomers}
            selectedCustomerId={selectedCustomerId}
            selectedCustomerName={customerName}
            open={customerDropdownOpen}
            onToggle={() => setCustomerDropdownOpen((current) => !current)}
            onSelect={selectCustomer}
          />
          <Field label="Vehicle No" value={vehicleNo} onChangeText={setVehicleNo} autoCapitalize="characters" />
        </Card>

        <Card
          title="Sales items"
          icon="package-variant-closed"
          action={
            <Pressable style={styles.smallButton} onPress={addItem}>
              <MaterialCommunityIcons name="plus" size={16} color="#163a5f" />
              <Text style={styles.smallButtonText}>Add</Text>
            </Pressable>
          }
        >
          {items.map((item, index) => (
            <View style={styles.productCard} key={item.id}>
              <View style={styles.productHeader}>
                <Text style={styles.productTitle}>Item {index + 1}</Text>
                <Pressable
                  style={[styles.removeButton, items.length === 1 && styles.removeButtonDisabled]}
                  onPress={() => removeItem(item.id)}
                  disabled={items.length === 1}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#b42318" />
                </Pressable>
              </View>
              <CategoryChips categories={categories} selected={item.product} onSelect={(value) => updateItem(item.id, 'product', value)} />
              <Field label="Category / Product" value={item.product} onChangeText={(value) => updateItem(item.id, 'product', value)} />
              <Field label="Qty (Kg)" value={item.qty} onChangeText={(value) => updateItem(item.id, 'qty', value)} keyboardType="decimal-pad" />
              <Field label="Selling Rate" value={item.rate} onChangeText={(value) => updateItem(item.id, 'rate', value)} keyboardType="decimal-pad" />
            </View>
          ))}
        </Card>

        <Card title="Bill total" icon="calculator-variant-outline">
          <Field label="Transport Charge" value={transportCharge} onChangeText={setTransportCharge} keyboardType="decimal-pad" />
          <Field label="Loading Charge" value={loadingCharge} onChangeText={setLoadingCharge} keyboardType="decimal-pad" />
          <Field label="Note" value={note} onChangeText={setNote} multiline />
          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Item Total</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(totals.itemTotal)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Grand Total</Text>
              <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(totals.grandTotal)}</Text>
            </View>
          </View>
        </Card>

        {renderNonGstBillPreview()}
      </>
    );
  }

  function renderDashboardTab() {
    return (
      <>
        <View style={styles.dashboardHero}>
          <View style={styles.dashboardHeroTop}>
            <View style={styles.dashboardIdentity}>
              <View style={styles.dashboardAvatar}>
                <MaterialCommunityIcons name="account-tie-outline" size={26} color="#ffffff" />
              </View>
              <View style={styles.quickActionText}>
                <Text style={styles.dashboardKicker}>MANAGER DASHBOARD</Text>
                <Text style={styles.dashboardTitle}>Workbook overview</Text>
                <Text style={styles.dashboardSubtitle}>
                  {workbook.sales.length} sales | {workbook.stockEntries.length} stock entries | {workbook.credits.length} credits
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.dashboardMetricStrip}>
            <Pressable
              style={styles.dashboardMetric}
              onPress={() => {
                setBillMode('list');
                setActiveTab('bill');
              }}
            >
              <Text style={styles.dashboardMetricLabel}>Sales amount</Text>
              <Text style={styles.dashboardMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                {money(workbookTotals.salesAmount)}
              </Text>
              <Text style={styles.dashboardMetricHint}>{numberFormat(workbookTotals.soldQty)} Kg sold</Text>
            </Pressable>
            <Pressable style={styles.dashboardMetric} onPress={() => setActiveTab('summary')}>
              <Text style={styles.dashboardMetricLabel}>Profit</Text>
              <Text
                style={[styles.dashboardMetricValue, workbookTotals.profit < 0 && styles.dashboardMetricValueRed]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {money(workbookTotals.profit)}
              </Text>
              <Text style={styles.dashboardMetricHint}>Current stock {numberFormat(workbookTotals.currentStock)} Kg</Text>
            </Pressable>
          </View>
        </View>

        <Card title="Quick overview" icon="view-dashboard-outline">
          <View style={styles.statGrid}>
            <Pressable style={styles.statCard} onPress={() => setActiveTab('stock')}>
              <Text style={styles.statLabel}>Total Stock</Text>
              <Text style={styles.statValue}>{numberFormat(workbookTotals.totalStock)}</Text>
              <Text style={styles.reportSubValue}>Kg</Text>
            </Pressable>
            <Pressable style={styles.statCard} onPress={() => setActiveTab('summary')}>
              <Text style={styles.statLabel}>Current Stock</Text>
              <Text style={[styles.statValue, workbookTotals.currentStock >= 0 ? styles.statValueGreen : styles.statValueRed]}>
                {numberFormat(workbookTotals.currentStock)}
              </Text>
              <Text style={styles.reportSubValue}>Kg</Text>
            </Pressable>
            <Pressable style={styles.statCard} onPress={() => setActiveTab('summary')}>
              <Text style={styles.statLabel}>Stock Value</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                {money(workbookTotals.currentStockValue)}
              </Text>
            </Pressable>
            <Pressable style={styles.statCard} onPress={() => setActiveTab('credit')}>
              <Text style={styles.statLabel}>Credit Pending</Text>
              <Text style={[styles.statValue, workbookTotals.creditBalance > 0 && styles.statValueRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                {money(workbookTotals.creditBalance)}
              </Text>
            </Pressable>
            <Pressable style={styles.statCard} onPress={() => setActiveTab('cashbook')}>
              <Text style={styles.statLabel}>Total Cash</Text>
              <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                {money(workbookTotals.totalCash)}
              </Text>
            </Pressable>
            <Pressable style={styles.statCard} onPress={() => setActiveTab('profitLoss')}>
              <Text style={styles.statLabel}>Final Balance</Text>
              <Text style={[styles.statValue, pnl.finalBalance < 0 ? styles.statValueGreen : styles.statValueRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                {money(pnl.finalBalance)}
              </Text>
            </Pressable>
          </View>
        </Card>

        <Card title="Current stock by category" icon="warehouse">
          <View style={styles.reportList}>
            {summaries.map((summary) => (
              <Pressable style={styles.reportRow} key={summary.category} onPress={() => setActiveTab('summary')}>
                <View style={styles.quickActionText}>
                  <Text style={styles.reportRowTitle}>{summary.category}</Text>
                  <Text style={styles.reportRowMeta}>
                    Total {numberFormat(summary.totalStock)} Kg | Sold {numberFormat(summary.soldQty)} Kg | {summary.stockStatus}
                  </Text>
                </View>
                <View style={styles.savedInvoiceTotalBadge}>
                  <Text style={styles.savedInvoiceStatus}>CURRENT</Text>
                  <Text
                    style={[styles.savedInvoiceTotal, summary.currentStock < 0 && styles.reportRowAmountRed]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {numberFormat(summary.currentStock)} Kg
                  </Text>
                  <Text style={styles.reportSubValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {money(summary.currentStockValue)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card title="Actions" icon="gesture-tap-button">
          <View style={styles.actionGrid}>
            <Pressable
              style={styles.saveInvoiceButton}
              onPress={() => {
                setActiveTab('bill');
                startNewBill();
              }}
            >
              <MaterialCommunityIcons name="file-document-edit-outline" size={18} color="#ffffff" />
              <Text style={styles.primaryNavText}>New Bill</Text>
            </Pressable>
            <Pressable style={styles.shareButton} onPress={() => setActiveTab('stock')}>
              <MaterialCommunityIcons name="playlist-plus" size={18} color="#163a5f" />
              <Text style={styles.shareButtonText}>Stock</Text>
            </Pressable>
            <Pressable style={styles.shareButton} onPress={() => setActiveTab('credit')}>
              <MaterialCommunityIcons name="account-credit-card-outline" size={18} color="#163a5f" />
              <Text style={styles.shareButtonText}>Credit</Text>
            </Pressable>
          </View>
        </Card>
      </>
    );
  }

  function renderStockTab() {
    const stockValue = parseAmount(stockForm.qty) * parseAmount(stockForm.unitCost);
    const stockEntries = sortStockEntries(workbook.stockEntries);
    return (
      <>
        <Card
          title={editingStockId ? 'Edit stock entry' : 'Stock entry form'}
          icon="playlist-plus"
          action={
            editingStockId ? (
              <Pressable style={styles.cancelEditButton} onPress={cancelStockEdit}>
                <MaterialCommunityIcons name="close" size={15} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Cancel</Text>
              </Pressable>
            ) : null
          }
        >
          {editingStockId ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Editing selected stock entry</Text>
            </View>
          ) : null}
          <DatePickerField label="Date" value={stockForm.date} onChange={(value) => setStockForm((current) => ({ ...current, date: value }))} />
          <CategoryChips categories={categories} selected={stockForm.category} onSelect={(value) => setStockForm((current) => ({ ...current, category: value }))} />
          <Field label="Category" value={stockForm.category} onChangeText={(value) => setStockForm((current) => ({ ...current, category: value }))} />
          <Field label="Qty / Unit" value={stockForm.qty} onChangeText={(value) => setStockForm((current) => ({ ...current, qty: value }))} keyboardType="decimal-pad" />
          <Field label="Unit Cost" value={stockForm.unitCost} onChangeText={(value) => setStockForm((current) => ({ ...current, unitCost: value }))} keyboardType="decimal-pad" />
          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Stock Price</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(stockValue)}</Text>
            </View>
          </View>
          <Pressable style={styles.primaryNavButton} onPress={saveStockEntry}>
            <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryNavText}>{editingStockId ? 'Update Stock' : 'Submit Stock'}</Text>
          </Pressable>
        </Card>

        {!editingStockId ? (
          <>
            <Card title="Stock totals" icon="warehouse">
              <View style={styles.statGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Total Stock</Text>
                  <Text style={styles.statValue}>{numberFormat(workbookTotals.totalStock)}</Text>
                  <Text style={styles.reportSubValue}>Kg</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Current Stock</Text>
                  <Text style={[styles.statValue, workbookTotals.currentStock >= 0 ? styles.statValueGreen : styles.statValueRed]}>{numberFormat(workbookTotals.currentStock)}</Text>
                  <Text style={styles.reportSubValue}>Kg</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Current Stock Value</Text>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(workbookTotals.currentStockValue)}</Text>
                </View>
              </View>
            </Card>

            <Card title="Stock entries" icon="warehouse">
              {stockEntries.length ? (
                <View style={styles.invoiceList}>
                  {stockEntries.map((entry) => (
                    <View style={styles.savedInvoiceCard} key={entry.id}>
                      <View style={styles.savedInvoiceHeader}>
                        <View style={styles.quickActionText}>
                          <Text style={styles.savedInvoiceNo}>{entry.category}</Text>
                          <Text style={styles.savedInvoiceMeta}>
                            {entry.date} | {numberFormat(entry.qty)} Kg | {money(entry.unitCost)} / Kg
                          </Text>
                        </View>
                        <View style={styles.savedInvoiceTotalBadge}>
                          <Text style={styles.savedInvoiceStatus}>VALUE</Text>
                          <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {money(entry.qty * entry.unitCost)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.invoiceActionRow}>
                        <Pressable style={styles.invoicePreviewButton} onPress={() => editStockEntry(entry)}>
                          <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                          <Text style={styles.invoicePreviewButtonText}>Edit</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.mutedText}>No stock entries saved yet.</Text>
              )}
            </Card>
          </>
        ) : null}
      </>
    );
  }

  function renderSummaryTab() {
    return (
      <>
        <Card title="Stock & sales summary" icon="chart-box-outline">
          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Sales Amount</Text>
              <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(workbookTotals.salesAmount)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Profit</Text>
              <Text style={[styles.statValue, workbookTotals.profit >= 0 ? styles.statValueGreen : styles.statValueRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(workbookTotals.profit)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Sold Qty</Text>
              <Text style={styles.statValue}>{numberFormat(workbookTotals.soldQty)}</Text>
              <Text style={styles.reportSubValue}>Kg</Text>
            </View>
          </View>
        </Card>

        {summaries.map((summary) => (
          <Card title={summary.category} icon="cube-outline" key={summary.category}>
            <View style={styles.reportGrid}>
              <SummaryTile label="Total Stock" value={numberFormat(summary.totalStock)} sub="Kg" />
              <SummaryTile label="Sales Qty" value={numberFormat(summary.soldQty)} sub="Kg" />
              <SummaryTile label="Current Stock" value={numberFormat(summary.currentStock)} sub="Kg" danger={summary.currentStock < 0} />
              <SummaryTile label="% Sold" value={`${numberFormat(summary.percentSold)}%`} />
              <SummaryTile label="Avg Cost" value={money(summary.avgCost)} sub="Per Kg" />
              <SummaryTile label="Current Stock Value" value={money(summary.currentStockValue)} />
              <SummaryTile label="Avg Sale Price" value={money(summary.avgSalePrice)} sub="Per Kg" />
              <SummaryTile label="Sales Amount" value={money(summary.salesAmount)} />
              <SummaryTile label="Stock Cost Sold" value={money(summary.stockCostSold)} />
              <SummaryTile label="Profit" value={money(summary.profit)} success={summary.profit >= 0} danger={summary.profit < 0} />
              <SummaryTile label="Profit %" value={`${numberFormat(summary.profitPercent)}%`} />
              <SummaryTile label="Stock Status" value={summary.stockStatus} danger={summary.stockStatus === 'OVER SOLD'} success={summary.stockStatus === 'OK'} />
            </View>
          </Card>
        ))}
      </>
    );
  }

  function renderCreditTab() {
    const editingCredit = Boolean(editingCreditId);

    return (
      <>
        <Card
          title={editingCredit ? 'Edit customer credit' : 'Customer credit'}
          icon="account-credit-card-outline"
          action={
            editingCredit ? (
              <Pressable style={styles.cancelEditButton} onPress={cancelCreditEdit}>
                <MaterialCommunityIcons name="close" size={15} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Cancel</Text>
              </Pressable>
            ) : null
          }
        >
          {editingCredit ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Editing selected credit entry</Text>
            </View>
          ) : null}
          <DatePickerField label="Date" value={creditForm.date} onChange={(value) => setCreditForm((current) => ({ ...current, date: value }))} />
          <Field label="Customer Name" value={creditForm.customer} onChangeText={(value) => setCreditForm((current) => ({ ...current, customer: value }))} />
          <Field label="Credit Amount" value={creditForm.creditAmount} onChangeText={(value) => setCreditForm((current) => ({ ...current, creditAmount: value }))} keyboardType="decimal-pad" />
          <Field label="Paid Amount" value={creditForm.paidAmount} onChangeText={(value) => setCreditForm((current) => ({ ...current, paidAmount: value }))} keyboardType="decimal-pad" />
          <Pressable style={styles.primaryNavButton} onPress={saveCreditEntry}>
            <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryNavText}>{editingCredit ? 'Update Credit' : 'Save Credit'}</Text>
          </Pressable>
        </Card>

        {!editingCredit ? (
        <Card title="Credit summary" icon="cash-clock">
          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Receivable</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(workbookTotals.creditAmount)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Pending Balance</Text>
              <Text style={[styles.statValue, workbookTotals.creditBalance > 0 && styles.statValueRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(workbookTotals.creditBalance)}</Text>
            </View>
          </View>
          {creditRecords.length ? (
            <>
              <View style={styles.listToolbar}>
                <View>
                  <Text style={styles.listToolbarTitle}>Credit entries</Text>
                  <Text style={styles.listToolbarMeta}>Page {creditPage} of {creditPages}</Text>
                </View>
                <Text style={styles.listCountBadge}>{visibleCredits.length} showing</Text>
              </View>

              <View style={styles.invoiceList}>
                {visibleCredits.map((credit) => {
                  const balance = credit.creditAmount - credit.paidAmount;
                  return (
                    <View style={styles.savedInvoiceCard} key={credit.id}>
                      <View style={styles.savedInvoiceHeader}>
                        <View style={styles.quickActionText}>
                          <Text style={styles.savedInvoiceNo}>{credit.customer}</Text>
                          <Text style={styles.savedInvoiceMeta}>{credit.date} | Paid {money(credit.paidAmount)}</Text>
                        </View>
                        <View style={styles.savedInvoiceTotalBadge}>
                          <Text style={styles.savedInvoiceStatus}>BALANCE</Text>
                          <Text
                            style={[styles.savedInvoiceTotal, balance > 0 && styles.reportRowAmountRed]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                          >
                            {money(balance)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.invoiceActionRow}>
                        <Pressable style={styles.invoicePreviewButton} onPress={() => editCreditEntry(credit)}>
                          <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                          <Text style={styles.invoicePreviewButtonText}>Edit</Text>
                        </Pressable>
                        <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteCreditEntry(credit)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                          <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.paginationBar}>
                <Pressable
                  style={[styles.paginationButton, creditPage === 1 && styles.navButtonDisabled]}
                  onPress={() => setCreditPage((page) => Math.max(1, page - 1))}
                  disabled={creditPage === 1}
                >
                  <MaterialCommunityIcons name="chevron-left" size={18} color="#163a5f" />
                  <Text style={styles.paginationButtonText}>Previous</Text>
                </Pressable>
                <Text style={styles.paginationText}>{creditPage} / {creditPages}</Text>
                <Pressable
                  style={[styles.paginationButton, creditPage === creditPages && styles.navButtonDisabled]}
                  onPress={() => setCreditPage((page) => Math.min(creditPages, page + 1))}
                  disabled={creditPage === creditPages}
                >
                  <Text style={styles.paginationButtonText}>Next</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#163a5f" />
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.mutedText}>No credit entries saved yet.</Text>
          )}
        </Card>
        ) : null}
      </>
    );
  }

  function renderCashbookTab() {
    const editingCash = Boolean(editingCashId);

    return (
      <>
        <Card
          title={editingCash ? 'Edit cashbook' : 'Cashbook'}
          icon="book-open-outline"
          action={
            editingCash ? (
              <Pressable style={styles.cancelEditButton} onPress={cancelCashEdit}>
                <MaterialCommunityIcons name="close" size={15} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Cancel</Text>
              </Pressable>
            ) : null
          }
        >
          {editingCash ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Editing selected cashbook entry</Text>
            </View>
          ) : null}
          <DatePickerField label="Date" value={cashForm.date} onChange={(value) => setCashForm((current) => ({ ...current, date: value }))} />
          <Field label="Description" value={cashForm.description} onChangeText={(value) => setCashForm((current) => ({ ...current, description: value }))} />
          <Field label="Cash In Hand Credit" value={cashForm.cashCredit} onChangeText={(value) => setCashForm((current) => ({ ...current, cashCredit: value }))} keyboardType="decimal-pad" />
          <Field label="Cash In Hand Debit" value={cashForm.cashDebit} onChangeText={(value) => setCashForm((current) => ({ ...current, cashDebit: value }))} keyboardType="decimal-pad" />
          <Field label="Bank Credit" value={cashForm.bankCredit} onChangeText={(value) => setCashForm((current) => ({ ...current, bankCredit: value }))} keyboardType="decimal-pad" />
          <Field label="Bank Debit" value={cashForm.bankDebit} onChangeText={(value) => setCashForm((current) => ({ ...current, bankDebit: value }))} keyboardType="decimal-pad" />
          <Pressable style={styles.primaryNavButton} onPress={saveCashEntry}>
            <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryNavText}>{editingCash ? 'Update Cashbook' : 'Save Cashbook'}</Text>
          </Pressable>
        </Card>

        {!editingCash ? (
        <Card title="Cash position" icon="wallet-outline">
          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Cash in Hand</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(workbookTotals.cashBalance)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Cash in Bank</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(workbookTotals.bankBalance)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Cash</Text>
              <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{money(workbookTotals.totalCash)}</Text>
            </View>
          </View>
          {cashRecords.length ? (
            <>
              <View style={styles.listToolbar}>
                <View>
                  <Text style={styles.listToolbarTitle}>Cashbook entries</Text>
                  <Text style={styles.listToolbarMeta}>Page {cashPage} of {cashPages}</Text>
                </View>
                <Text style={styles.listCountBadge}>{visibleCashRecords.length} showing</Text>
              </View>

              <View style={styles.invoiceList}>
                {visibleCashRecords.map((entry) => {
                  const cashAmount = entry.cashCredit - entry.cashDebit;
                  const bankAmount = entry.bankCredit - entry.bankDebit;
                  const totalAmount = cashAmount + bankAmount;
                  return (
                    <View style={styles.savedInvoiceCard} key={entry.id}>
                      <View style={styles.savedInvoiceHeader}>
                        <View style={styles.quickActionText}>
                          <Text style={styles.savedInvoiceNo}>{entry.description}</Text>
                          <Text style={styles.savedInvoiceMeta}>{entry.date} | Cash {money(cashAmount)} | Bank {money(bankAmount)}</Text>
                        </View>
                        <View style={styles.savedInvoiceTotalBadge}>
                          <Text style={styles.savedInvoiceStatus}>TOTAL</Text>
                          <Text
                            style={[styles.savedInvoiceTotal, totalAmount < 0 && styles.reportRowAmountRed]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                          >
                            {money(totalAmount)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.invoiceActionRow}>
                        <Pressable style={styles.invoicePreviewButton} onPress={() => editCashEntry(entry)}>
                          <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                          <Text style={styles.invoicePreviewButtonText}>Edit</Text>
                        </Pressable>
                        <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteCashEntry(entry)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                          <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.paginationBar}>
                <Pressable
                  style={[styles.paginationButton, cashPage === 1 && styles.navButtonDisabled]}
                  onPress={() => setCashPage((page) => Math.max(1, page - 1))}
                  disabled={cashPage === 1}
                >
                  <MaterialCommunityIcons name="chevron-left" size={18} color="#163a5f" />
                  <Text style={styles.paginationButtonText}>Previous</Text>
                </Pressable>
                <Text style={styles.paginationText}>{cashPage} / {cashPages}</Text>
                <Pressable
                  style={[styles.paginationButton, cashPage === cashPages && styles.navButtonDisabled]}
                  onPress={() => setCashPage((page) => Math.min(cashPages, page + 1))}
                  disabled={cashPage === cashPages}
                >
                  <Text style={styles.paginationButtonText}>Next</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#163a5f" />
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.mutedText}>No cashbook entries saved yet.</Text>
          )}
        </Card>
        ) : null}
      </>
    );
  }

  function renderManagerPagination(page: number, pages: number, onPrevious: () => void, onNext: () => void) {
    return (
      <View style={styles.paginationBar}>
        <Pressable style={[styles.paginationButton, page === 1 && styles.navButtonDisabled]} onPress={onPrevious} disabled={page === 1}>
          <MaterialCommunityIcons name="chevron-left" size={18} color="#163a5f" />
          <Text style={styles.paginationButtonText}>Previous</Text>
        </Pressable>
        <Text style={styles.paginationText}>{page} / {pages}</Text>
        <Pressable style={[styles.paginationButton, page === pages && styles.navButtonDisabled]} onPress={onNext} disabled={page === pages}>
          <Text style={styles.paginationButtonText}>Next</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color="#163a5f" />
        </Pressable>
      </View>
    );
  }

  function renderInvestmentTab() {
    const editingInvestment = Boolean(editingInvestmentId);

    return (
      <>
        <Card
          title={editingInvestment ? 'Edit investment' : 'Partner investment'}
          icon="account-cash-outline"
          action={
            editingInvestment ? (
              <Pressable style={styles.cancelEditButton} onPress={cancelInvestmentEdit}>
                <MaterialCommunityIcons name="close" size={15} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Cancel</Text>
              </Pressable>
            ) : null
          }
        >
          {editingInvestment ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Editing selected investment</Text>
            </View>
          ) : null}
          <DatePickerField label="Date" value={investmentForm.date} onChange={(value) => setInvestmentForm((current) => ({ ...current, date: value }))} />
          <Field label="Partner Name" value={investmentForm.partner} onChangeText={(value) => setInvestmentForm((current) => ({ ...current, partner: value }))} />
          <Field label="Investment Amount" value={investmentForm.amount} onChangeText={(value) => setInvestmentForm((current) => ({ ...current, amount: value }))} keyboardType="decimal-pad" />
          <Field label="Mode" value={investmentForm.mode} onChangeText={(value) => setInvestmentForm((current) => ({ ...current, mode: value }))} />
          <Field label="Remarks" value={investmentForm.remarks} onChangeText={(value) => setInvestmentForm((current) => ({ ...current, remarks: value }))} />
          <Pressable style={styles.primaryNavButton} onPress={saveInvestmentEntry}>
            <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryNavText}>{editingInvestment ? 'Update Investment' : 'Save Investment'}</Text>
          </Pressable>
        </Card>

        {!editingInvestment ? (
          <Card title="Investment list" icon="account-cash-outline">
            {investmentRecords.length ? (
              <>
                <View style={styles.listToolbar}>
                  <View>
                    <Text style={styles.listToolbarTitle}>Investments</Text>
                    <Text style={styles.listToolbarMeta}>Page {investmentPage} of {investmentPages}</Text>
                  </View>
                  <Text style={styles.listCountBadge}>{money(workbookTotals.totalInvestment)}</Text>
                </View>

                <View style={styles.invoiceList}>
                  {visibleInvestments.map((entry) => (
                    <View style={styles.savedInvoiceCard} key={entry.id}>
                      <View style={styles.savedInvoiceHeader}>
                        <View style={styles.quickActionText}>
                          <Text style={styles.savedInvoiceNo}>{entry.partner}</Text>
                          <Text style={styles.savedInvoiceMeta}>{entry.date} | {entry.mode} | {entry.status}</Text>
                          <Text style={styles.savedInvoiceMeta} numberOfLines={2}>{entry.remarks || 'No remarks'}</Text>
                        </View>
                        <View style={styles.savedInvoiceTotalBadge}>
                          <Text style={styles.savedInvoiceStatus}>AMOUNT</Text>
                          <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{money(entry.amount)}</Text>
                        </View>
                      </View>
                      <View style={styles.invoiceActionRow}>
                        <Pressable style={styles.invoicePreviewButton} onPress={() => editInvestmentEntry(entry)}>
                          <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                          <Text style={styles.invoicePreviewButtonText}>Edit</Text>
                        </Pressable>
                        <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteInvestmentEntry(entry)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                          <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>

                {renderManagerPagination(
                  investmentPage,
                  investmentPages,
                  () => setInvestmentPage((page) => Math.max(1, page - 1)),
                  () => setInvestmentPage((page) => Math.min(investmentPages, page + 1)),
                )}
              </>
            ) : (
              <Text style={styles.mutedText}>No investments saved yet.</Text>
            )}
          </Card>
        ) : null}
      </>
    );
  }

  function renderPayablesTab() {
    const editingLoan = Boolean(editingLoanId);

    return (
      <>
        <Card
          title={editingLoan ? 'Edit payable' : 'Loans and payables'}
          icon="cash-minus"
          action={
            editingLoan ? (
              <Pressable style={styles.cancelEditButton} onPress={cancelLoanEdit}>
                <MaterialCommunityIcons name="close" size={15} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Cancel</Text>
              </Pressable>
            ) : null
          }
        >
          {editingLoan ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Editing selected payable</Text>
            </View>
          ) : null}
          <DatePickerField label="Date" value={loanForm.date} onChange={(value) => setLoanForm((current) => ({ ...current, date: value }))} />
          <Field label="Lender Name" value={loanForm.lender} onChangeText={(value) => setLoanForm((current) => ({ ...current, lender: value }))} />
          <Field label="Amount" value={loanForm.amount} onChangeText={(value) => setLoanForm((current) => ({ ...current, amount: value }))} keyboardType="decimal-pad" />
          <Field label="Paid Amount" value={loanForm.paidAmount} onChangeText={(value) => setLoanForm((current) => ({ ...current, paidAmount: value }))} keyboardType="decimal-pad" />
          <Field label="Type" value={loanForm.type} onChangeText={(value) => setLoanForm((current) => ({ ...current, type: value }))} />
          <Field label="Notes" value={loanForm.notes} onChangeText={(value) => setLoanForm((current) => ({ ...current, notes: value }))} />
          <Pressable style={styles.primaryNavButton} onPress={saveLoanEntry}>
            <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryNavText}>{editingLoan ? 'Update Payable' : 'Save Payable'}</Text>
          </Pressable>
        </Card>

        {!editingLoan ? (
          <Card title="Payables list" icon="cash-minus">
            {loanRecords.length ? (
              <>
                <View style={styles.listToolbar}>
                  <View>
                    <Text style={styles.listToolbarTitle}>Loans and payables</Text>
                    <Text style={styles.listToolbarMeta}>Page {loanPage} of {loanPages}</Text>
                  </View>
                  <Text style={styles.listCountBadge}>{money(workbookTotals.loanBalance)}</Text>
                </View>

                <View style={styles.invoiceList}>
                  {visibleLoans.map((entry) => {
                    const balance = entry.amount - entry.paidAmount;
                    return (
                      <View style={styles.savedInvoiceCard} key={entry.id}>
                        <View style={styles.savedInvoiceHeader}>
                          <View style={styles.quickActionText}>
                            <Text style={styles.savedInvoiceNo}>{entry.lender}</Text>
                            <Text style={styles.savedInvoiceMeta}>{entry.date} | {entry.type} | Paid {money(entry.paidAmount)}</Text>
                            <Text style={styles.savedInvoiceMeta} numberOfLines={2}>{entry.notes || 'No notes'}</Text>
                          </View>
                          <View style={styles.savedInvoiceTotalBadge}>
                            <Text style={styles.savedInvoiceStatus}>BALANCE</Text>
                            <Text style={[styles.savedInvoiceTotal, balance > 0 && styles.reportRowAmountRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{money(balance)}</Text>
                          </View>
                        </View>
                        <View style={styles.invoiceActionRow}>
                          <Pressable style={styles.invoicePreviewButton} onPress={() => editLoanEntry(entry)}>
                            <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                            <Text style={styles.invoicePreviewButtonText}>Edit</Text>
                          </Pressable>
                          <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteLoanEntry(entry)}>
                            <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                            <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {renderManagerPagination(
                  loanPage,
                  loanPages,
                  () => setLoanPage((page) => Math.max(1, page - 1)),
                  () => setLoanPage((page) => Math.min(loanPages, page + 1)),
                )}
              </>
            ) : (
              <Text style={styles.mutedText}>No loans or payables saved yet.</Text>
            )}
          </Card>
        ) : null}
      </>
    );
  }

  function renderFinanceExpenseTab() {
    const editingFinanceExpense = Boolean(editingFinanceExpenseId);

    return (
      <>
        <Card
          title={editingFinanceExpense ? 'Edit expense' : 'Finance expense'}
          icon="receipt-text-outline"
          action={
            editingFinanceExpense ? (
              <Pressable style={styles.cancelEditButton} onPress={cancelFinanceExpenseEdit}>
                <MaterialCommunityIcons name="close" size={15} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Cancel</Text>
              </Pressable>
            ) : null
          }
        >
          {editingFinanceExpense ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Editing selected expense</Text>
            </View>
          ) : null}
          <DatePickerField label="Date" value={financeExpenseForm.date} onChange={(value) => setFinanceExpenseForm((current) => ({ ...current, date: value }))} />
          <Field label="Expense Category" value={financeExpenseForm.category} onChangeText={(value) => setFinanceExpenseForm((current) => ({ ...current, category: value }))} />
          <Field label="Amount" value={financeExpenseForm.amount} onChangeText={(value) => setFinanceExpenseForm((current) => ({ ...current, amount: value }))} keyboardType="decimal-pad" />
          <Field label="Mode" value={financeExpenseForm.mode} onChangeText={(value) => setFinanceExpenseForm((current) => ({ ...current, mode: value }))} />
          <Field label="Notes" value={financeExpenseForm.notes} onChangeText={(value) => setFinanceExpenseForm((current) => ({ ...current, notes: value }))} multiline />
          <Pressable style={styles.primaryNavButton} onPress={saveFinanceExpenseEntry}>
            <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryNavText}>{editingFinanceExpense ? 'Update Expense' : 'Save Expense'}</Text>
          </Pressable>
        </Card>

        {!editingFinanceExpense ? (
          <Card title="Expense list" icon="receipt-text-outline">
            {financeExpenseRecords.length ? (
              <>
                <View style={styles.listToolbar}>
                  <View>
                    <Text style={styles.listToolbarTitle}>Finance expenses</Text>
                    <Text style={styles.listToolbarMeta}>Page {financeExpensePage} of {financeExpensePages}</Text>
                  </View>
                  <Text style={styles.listCountBadge}>{money(workbookTotals.financeExpenseAmount)}</Text>
                </View>

                <View style={styles.invoiceList}>
                  {visibleFinanceExpenses.map((entry) => (
                    <View style={styles.savedInvoiceCard} key={entry.id}>
                      <View style={styles.savedInvoiceHeader}>
                        <View style={styles.quickActionText}>
                          <Text style={styles.savedInvoiceNo}>{entry.category}</Text>
                          <Text style={styles.savedInvoiceMeta}>{entry.date} | {entry.mode}</Text>
                          <Text style={styles.savedInvoiceMeta} numberOfLines={2}>{entry.notes || 'No notes'}</Text>
                        </View>
                        <View style={styles.savedInvoiceTotalBadge}>
                          <Text style={styles.savedInvoiceStatus}>EXPENSE</Text>
                          <Text style={[styles.savedInvoiceTotal, styles.reportRowAmountRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{money(entry.amount)}</Text>
                        </View>
                      </View>
                      <View style={styles.invoiceActionRow}>
                        <Pressable style={styles.invoicePreviewButton} onPress={() => editFinanceExpenseEntry(entry)}>
                          <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                          <Text style={styles.invoicePreviewButtonText}>Edit</Text>
                        </Pressable>
                        <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteFinanceExpenseEntry(entry)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                          <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>

                {renderManagerPagination(
                  financeExpensePage,
                  financeExpensePages,
                  () => setFinanceExpensePage((page) => Math.max(1, page - 1)),
                  () => setFinanceExpensePage((page) => Math.min(financeExpensePages, page + 1)),
                )}
              </>
            ) : (
              <Text style={styles.mutedText}>No finance expenses saved yet.</Text>
            )}
          </Card>
        ) : null}
      </>
    );
  }

  function renderProfitLossTab() {
    return (
      <Card title="Profit and loss summary" icon="finance">
        <View style={styles.reportGrid}>
          <SummaryTile label="Total Investment" value={money(pnl.totalInvestment)} />
          <SummaryTile label="Bill Profit" value={money(pnl.billProfit)} success={pnl.billProfit >= 0} danger={pnl.billProfit < 0} />
          <SummaryTile label="Other Profit" value={money(pnl.otherProfit)} />
          <SummaryTile label="Expenses" value={money(pnl.totalExpense)} danger={pnl.totalExpense > 0} />
          <SummaryTile label="Net Profit" value={money(pnl.netProfit)} success={pnl.netProfit >= 0} danger={pnl.netProfit < 0} />
          <SummaryTile label="Customer Credit" value={money(pnl.customerCredit)} danger={pnl.customerCredit > 0} />
          <SummaryTile label="Current Stock Value" value={money(pnl.currentStockValue)} />
          <SummaryTile label="Final Balance" value={money(pnl.finalBalance)} success={pnl.finalBalance < 0} danger={pnl.finalBalance >= 0} />
          <SummaryTile label="Status" value={pnl.status} success={pnl.finalBalance < 0} danger={pnl.finalBalance >= 0} />
          <SummaryTile label="Loan Amount" value={money(workbookTotals.loanAmount)} />
          <SummaryTile label="Loan Pending" value={money(workbookTotals.loanBalance)} danger={workbookTotals.loanBalance > 0} />
        </View>
      </Card>
    );
  }

  function renderProfitSharingTab() {
    return (
      <Card title="Profit sharing" icon="account-group-outline">
        <Field label="Other Profit" value={otherProfit} onChangeText={setOtherProfit} keyboardType="decimal-pad" />
        <Field label="Expense Adjustment" value={profitExpense} onChangeText={setProfitExpense} keyboardType="decimal-pad" />
        <Pressable style={styles.primaryNavButton} onPress={saveProfitSettings}>
          <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
          <Text style={styles.primaryNavText}>Update Sharing</Text>
        </Pressable>
        {profitPartners.map((partner) => {
          const mainShare = pnl.billProfit * (partner.mainPercent / 100);
          const otherShare = pnl.otherProfit * (partner.otherPercent / 100);
          const expenseShare = pnl.totalExpense * (partner.otherPercent / 100);
          const netShare = mainShare + otherShare - expenseShare;
          return (
            <LedgerRow
              key={partner.name}
              title={partner.name}
              meta={`Main ${partner.mainPercent}% | Other ${partner.otherPercent}% | Expense ${money(expenseShare)}`}
              amount={netShare}
              danger={netShare < 0}
            />
          );
        })}
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable style={styles.menuButton} onPress={() => setManagerMenuOpen(true)}>
            <MaterialCommunityIcons name="menu" size={24} color="#ffffff" />
          </Pressable>
          <Image source={logo} style={styles.headerLogo} />
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>LUCKY TRADERS</Text>
            <Text style={styles.signedInLine} numberOfLines={1}>{user.name} - MANAGER WORKBOOK</Text>
          </View>
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <MaterialCommunityIcons name="logout" size={18} color="#fda29b" />
          </Pressable>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
          <View style={styles.stack}>
            <View style={styles.pageHero}>
              <View style={styles.quickActionText}>
                <Text style={styles.pageKicker}>MANAGER WORKBOOK</Text>
                <Text style={styles.pageTitle}>{availableManagerTabs.find((tab) => tab.key === activeTab)?.label}</Text>
                <Text style={styles.pageSubtitle}>{activeTab === 'deviceSharing' ? 'Nearby transfer for manager data' : 'Excel workflow inside manager login'}</Text>
              </View>
            </View>

            {!workbookReady ? <Text style={styles.mutedText}>Loading manager workbook...</Text> : null}
            {activeTab === 'dashboard' ? renderDashboardTab() : null}
            {activeTab === 'customers' ? renderCustomersTab() : null}
            {activeTab === 'bill' ? renderBillTab() : null}
            {activeTab === 'stock' ? renderStockTab() : null}
            {activeTab === 'summary' ? renderSummaryTab() : null}
            {activeTab === 'credit' ? renderCreditTab() : null}
            {activeTab === 'cashbook' ? renderCashbookTab() : null}
            {activeTab === 'investments' ? renderInvestmentTab() : null}
            {activeTab === 'payables' ? renderPayablesTab() : null}
            {activeTab === 'financeExpense' ? renderFinanceExpenseTab() : null}
            {activeTab === 'profitLoss' ? renderProfitLossTab() : null}
            {activeTab === 'profitSharing' ? renderProfitSharingTab() : null}
            {activeTab === 'deviceSharing' && onSendDeviceShare && onReceiveDeviceShare ? (
              <DeviceSharingScreen
                status={syncStatus}
                revision={syncRevision}
                serverUrl={syncServerUrl}
                deviceId={syncDeviceId}
                busyAction={manualSyncAction}
                onSend={onSendDeviceShare}
                onReceive={onReceiveDeviceShare}
                counts={[
                  { label: 'Customers', value: workbook.customers.length },
                  { label: 'Bills', value: workbook.bills.length },
                  { label: 'Stock', value: workbook.stockEntries.length },
                  { label: 'Sales', value: workbook.sales.length },
                  { label: 'Credits', value: workbook.credits.length },
                  { label: 'Cashbook', value: workbook.cashbook.length },
                  { label: 'Investments', value: workbook.investments.length },
                  { label: 'Expenses', value: workbook.expenses.length },
                ]}
              />
            ) : null}
          </View>
        </ScrollView>

        {activeTab === 'bill' && billMode === 'form' ? (
          <View style={styles.footerNav}>
            <Pressable style={styles.saveInvoiceButton} onPress={saveBillOnly}>
              <MaterialCommunityIcons name="content-save-outline" size={18} color="#ffffff" />
              <Text style={styles.primaryNavText}>{editingBillId ? 'Update' : 'Save'}</Text>
            </Pressable>
            <Pressable style={styles.printButton} onPress={printBill}>
              <MaterialCommunityIcons name="printer-outline" size={18} color="#ffffff" />
              <Text style={styles.printButtonText}>Print</Text>
            </Pressable>
            <Pressable style={styles.shareButton} onPress={shareBill}>
              <MaterialCommunityIcons name="share-variant-outline" size={18} color="#163a5f" />
              <Text style={styles.shareButtonText}>Share</Text>
            </Pressable>
          </View>
        ) : null}

        {managerMenuOpen ? (
          <View style={styles.sideMenuLayer}>
            <Pressable style={styles.sideMenuBackdrop} onPress={() => setManagerMenuOpen(false)} />
            <View style={styles.sideMenuPanel}>
              <View style={styles.sideMenuHeader}>
                <Image source={logo} style={styles.sideMenuLogo} />
                <View style={styles.quickActionText}>
                  <Text style={styles.sideMenuKicker}>LUCKY TRADERS</Text>
                  <Text style={styles.sideMenuTitle}>{user.name}</Text>
                  <Text style={styles.sideMenuRole}>MANAGER</Text>
                </View>
                <Pressable style={styles.sideMenuClose} onPress={() => setManagerMenuOpen(false)}>
                  <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
                </Pressable>
              </View>

              <ScrollView style={styles.sideMenuScroll} contentContainerStyle={styles.sideMenuScrollContent} showsVerticalScrollIndicator>
                <View style={styles.sideMenuItems}>
                  {availableManagerTabs.map((tab) => {
                    const selected = activeTab === tab.key;
                    return (
                      <Pressable
                        key={tab.key}
                        style={[styles.sideMenuItem, selected && styles.sideMenuItemActive]}
                        onPress={() => {
                          if (tab.key === 'bill') setBillMode('list');
                          setActiveTab(tab.key);
                          setManagerMenuOpen(false);
                        }}
                      >
                        <MaterialCommunityIcons name={tab.icon} size={22} color={selected ? '#ffffff' : '#516071'} />
                        <Text style={[styles.sideMenuItemText, selected && styles.sideMenuItemTextActive]}>{tab.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <Pressable
                style={styles.sideMenuLogout}
                onPress={() => {
                  setManagerMenuOpen(false);
                  onLogout();
                }}
              >
                <MaterialCommunityIcons name="logout" size={19} color="#8a1f2d" />
                <Text style={styles.sideMenuLogoutText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CategoryChips({
  categories,
  selected,
  onSelect,
}: {
  categories: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.filterChipRow}>
      {categories.map((category) => {
        const active = category === selected;
        return (
          <Pressable key={category} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => onSelect(category)}>
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{category}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CustomerDropdown({
  customers,
  selectedCustomerId,
  selectedCustomerName,
  open,
  onToggle,
  onSelect,
}: {
  customers: ManagerCustomer[];
  selectedCustomerId: string | null;
  selectedCustomerName: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (customer: ManagerCustomer) => void;
}) {
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>Select Customer</Text>
      <Pressable style={styles.datePickerButton} onPress={onToggle}>
        <MaterialCommunityIcons name="account-outline" size={19} color="#163a5f" />
        <Text style={styles.datePickerText} numberOfLines={1}>
          {selectedCustomer?.name || selectedCustomerName || 'Select customer'}
        </Text>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#687386" />
      </Pressable>
      {open ? (
        <View style={styles.managerDropdownList}>
          <ScrollView nestedScrollEnabled style={styles.managerDropdownScroll}>
            {customers.length > 0 ? (
              customers.map((customer) => {
                const active = customer.id === selectedCustomerId;
                return (
                  <Pressable
                    key={customer.id}
                    style={[styles.managerDropdownItem, active && styles.managerDropdownItemActive]}
                    onPress={() => onSelect(customer)}
                  >
                    <View style={styles.quickActionText}>
                      <Text style={[styles.clientCollapsedName, active && styles.sideMenuItemTextActive]} numberOfLines={1}>
                        {customer.name}
                      </Text>
                      <Text style={[styles.reportRowMeta, active && styles.sideMenuItemTextActive]} numberOfLines={1}>
                        {customer.phone || customer.address || 'Saved customer'}
                      </Text>
                    </View>
                    {active ? <MaterialCommunityIcons name="check-circle" size={20} color="#ffffff" /> : null}
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.mutedText}>No saved customers yet.</Text>
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  success,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  success?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={styles.reportTile}>
      <Text style={styles.reportLabel}>{label}</Text>
      <Text
        style={[styles.reportValue, success && styles.statValueGreen, danger && styles.statValueRed]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      {sub ? <Text style={styles.reportSubValue}>{sub}</Text> : null}
    </View>
  );
}

function LedgerRow({
  title,
  meta,
  amount,
  danger,
}: {
  title: string;
  meta: string;
  amount: number;
  danger?: boolean;
}) {
  return (
    <View style={styles.reportRow}>
      <View style={styles.quickActionText}>
        <Text style={styles.reportRowTitle}>{title}</Text>
        <Text style={styles.reportRowMeta}>{meta}</Text>
      </View>
      <Text style={[styles.reportRowAmount, danger && styles.reportRowAmountRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {money(amount)}
      </Text>
    </View>
  );
}

function createDefaultWorkbook(): ManagerWorkbook {
  return {
    customers: [
      { id: 'customer-shanawaz', name: 'Shanawaz', phone: '', address: '' },
      { id: 'customer-fayaz', name: 'Fayaz', phone: '', address: '' },
      { id: 'customer-ajju', name: 'Ajju', phone: '', address: '' },
      { id: 'customer-karimangalam', name: 'Karimangalam', phone: '', address: '' },
      { id: 'customer-ali', name: 'Ali', phone: '', address: '' },
      { id: 'customer-suhail-mama', name: 'Suhail Mama', phone: '', address: '' },
      { id: 'customer-big-water-cans', name: 'Big Water Cans', phone: '', address: '' },
      { id: 'customer-saqib', name: 'Saqib', phone: '', address: '' },
    ],
    stockEntries: [
      { id: 'opening-white', date: '01-04-2026', category: 'White', qty: 21634, unitCost: 1454453.82 / 21634 },
      { id: 'opening-ms-black', date: '01-04-2026', category: 'MS Black', qty: 8317, unitCost: 537361.37 / 8317 },
      { id: 'opening-flat-patta', date: '01-04-2026', category: 'Flat/Patta', qty: 9350, unitCost: 579700 / 9350 },
    ],
    bills: [],
    sales: [],
    credits: [
      { id: 'credit-shanawaz', date: '25-05-2026', customer: 'Shanawaz', creditAmount: 8100, paidAmount: 0 },
      { id: 'credit-fayaz', date: '26-05-2026', customer: 'Fayaz', creditAmount: 19000, paidAmount: 0 },
      { id: 'credit-ajju', date: '27-05-2026', customer: 'Ajju', creditAmount: 20000, paidAmount: 0 },
      { id: 'credit-karimangalam', date: '28-05-2026', customer: 'Karimangalam', creditAmount: 10000, paidAmount: 0 },
      { id: 'credit-ali', date: '29-05-2026', customer: 'Ali', creditAmount: 177000, paidAmount: 0 },
      { id: 'credit-suhail-mama', date: '30-05-2026', customer: 'Suhail Mama', creditAmount: 25000, paidAmount: 0 },
      { id: 'credit-big-water-cans', date: '02-06-2026', customer: 'Big Water Cans', creditAmount: 54600, paidAmount: 0 },
      { id: 'credit-saqib', date: '03-06-2026', customer: 'Saqib', creditAmount: 149032.66, paidAmount: 0 },
    ],
    cashbook: [
      { id: 'cash-opening', date: '23-05-2026', description: 'Cash', cashCredit: 15000, cashDebit: 0, bankCredit: 0, bankDebit: 0 },
    ],
    investments: [
      { id: 'investment-shafi', date: '07-05-2026', partner: 'Shafi', amount: 1170000, mode: 'Cash', remarks: 'Capital investment', status: 'Active' },
      { id: 'investment-suhail', date: '07-05-2026', partner: 'Suhail', amount: 535000, mode: 'Cash', remarks: 'Capital investment', status: 'Active' },
    ],
    loans: [],
    expenses: [],
    profitSettings: {
      otherProfit: 44000,
      totalExpense: 10000,
    },
  };
}

export function createDefaultManagerWorkbook() {
  return createDefaultWorkbook();
}

function normalizeWorkbook(value: unknown): ManagerWorkbook {
  const fallback = createDefaultWorkbook();
  if (!value || typeof value !== 'object') return fallback;
  const incoming = value as Partial<ManagerWorkbook>;
  const normalizedSales = Array.isArray(incoming.sales) ? incoming.sales.map(normalizeSaleReceiptNo) : fallback.sales;

  return {
    customers: Array.isArray(incoming.customers) ? incoming.customers : fallback.customers,
    stockEntries: Array.isArray(incoming.stockEntries) ? incoming.stockEntries : fallback.stockEntries,
    sales: normalizedSales,
    bills: Array.isArray(incoming.bills)
      ? normalizeManagerBills(incoming.bills, normalizedSales)
      : buildManagerBillsFromSales(normalizedSales),
    credits: Array.isArray(incoming.credits) ? incoming.credits : fallback.credits,
    cashbook: Array.isArray(incoming.cashbook) ? incoming.cashbook : fallback.cashbook,
    investments: Array.isArray(incoming.investments) ? incoming.investments : fallback.investments,
    loans: Array.isArray(incoming.loans) ? incoming.loans : fallback.loans,
    expenses: Array.isArray(incoming.expenses) ? incoming.expenses : fallback.expenses,
    profitSettings: {
      otherProfit: Number(incoming.profitSettings?.otherProfit) || fallback.profitSettings.otherProfit,
      totalExpense: Number(incoming.profitSettings?.totalExpense) || fallback.profitSettings.totalExpense,
    },
  };
}

export function normalizeManagerWorkbook(value: unknown) {
  return normalizeWorkbook(value);
}

function buildManagerCustomers(workbook: ManagerWorkbook) {
  const customers = [...workbook.customers];

  workbook.sales.forEach((sale) => {
    customers.push({ id: `customer-sale-${normalizeCustomerName(sale.customer)}`, name: sale.customer, phone: '', address: '' });
  });
  workbook.credits.forEach((credit) => {
    customers.push({ id: `customer-credit-${normalizeCustomerName(credit.customer)}`, name: credit.customer, phone: '', address: '' });
  });

  return customers.reduce<ManagerCustomer[]>((list, customer) => upsertManagerCustomer(list, customer), []);
}

function buildManagerBillRecords(workbook: ManagerWorkbook) {
  const billNos = new Set(workbook.bills.map((record) => record.billNo));
  const derivedBills = buildManagerBillsFromSales(workbook.sales).filter((record) => !billNos.has(record.billNo));
  return sortManagerBills([...workbook.bills, ...derivedBills]);
}

function normalizeManagerBills(records: unknown[], salesRows: SaleEntry[]) {
  const derivedBills = buildManagerBillsFromSales(salesRows);

  const normalized = records
    .map((value) => {
      if (!value || typeof value !== 'object') return null;

      const record = value as Partial<NonGstBillRecord>;
      const billNo = normalizeReceiptNo(typeof record.billNo === 'string' ? record.billNo : '');
      if (!billNo) return null;

      const fallback = derivedBills.find((item) => item.billNo === billNo);
      const items = Array.isArray(record.items)
        ? record.items
            .map((item) => ({
              product: typeof item.product === 'string' ? item.product.trim() : '',
              qty: Number(item.qty) || 0,
              rate: Number(item.rate) || 0,
            }))
            .filter((item) => item.product && item.qty > 0 && item.rate > 0)
        : fallback?.items || [];
      const transportCharge = Number(record.transportCharge) || 0;
      const loadingCharge = Number(record.loadingCharge) || 0;
      const computedTotal = Math.round(items.reduce((sum, item) => sum + item.qty * item.rate, 0) + transportCharge + loadingCharge);
      const savedTotal = Number(record.total);

      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id : `manager-bill-${billNo}`,
        billNo,
        date: typeof record.date === 'string' && record.date.trim() ? record.date : fallback?.date || formatDate(new Date()),
        customer: typeof record.customer === 'string' && record.customer.trim() ? record.customer.trim() : fallback?.customer || '',
        phone: typeof record.phone === 'string' ? record.phone.trim() : '',
        address: typeof record.address === 'string' ? record.address.trim() : '',
        vehicleNo: typeof record.vehicleNo === 'string' ? record.vehicleNo.trim() : '',
        items,
        transportCharge,
        loadingCharge,
        note: typeof record.note === 'string' ? record.note.trim() : '',
        total: Number.isFinite(savedTotal) ? savedTotal : computedTotal,
      };
    })
    .filter((record): record is NonGstBillRecord => Boolean(record));

  const normalizedBillNos = new Set(normalized.map((record) => record.billNo));
  return sortManagerBills([...normalized, ...derivedBills.filter((record) => !normalizedBillNos.has(record.billNo))]);
}

function buildManagerBillsFromSales(salesRows: SaleEntry[]) {
  const grouped = new Map<string, SaleEntry[]>();

  salesRows.forEach((sale) => {
    const billNo = normalizeReceiptNo(sale.billNo);
    if (!billNo) return;
    grouped.set(billNo, [...(grouped.get(billNo) || []), sale]);
  });

  return Array.from(grouped.entries()).map<NonGstBillRecord>(([billNo, rows]) => {
    const firstRow = rows[0];
    const items = rows.map((row) => ({
      product: row.category,
      qty: row.qty,
      rate: row.sellingRate,
    }));

    return {
      id: `manager-bill-${billNo}`,
      billNo,
      date: firstRow?.date || formatDate(new Date()),
      customer: firstRow?.customer || '',
      phone: '',
      address: '',
      vehicleNo: '',
      items,
      transportCharge: 0,
      loadingCharge: 0,
      note: '',
      total: Math.round(items.reduce((sum, item) => sum + item.qty * item.rate, 0)),
    };
  });
}

function sortManagerBills(records: NonGstBillRecord[]) {
  return [...records].sort((a, b) => {
    const dateDiff = parseDisplayDate(b.date).getTime() - parseDisplayDate(a.date).getTime();
    if (dateDiff) return dateDiff;
    return extractBillSequence(b.billNo) - extractBillSequence(a.billNo);
  });
}

function sortStockEntries(records: StockEntry[]) {
  return [...records].sort((a, b) => {
    const dateDiff = parseDisplayDate(b.date).getTime() - parseDisplayDate(a.date).getTime();
    if (dateDiff) return dateDiff;
    return a.category.localeCompare(b.category);
  });
}

function sortCreditEntries(records: CustomerCreditEntry[]) {
  return [...records].sort((a, b) => {
    const dateDiff = parseDisplayDate(b.date).getTime() - parseDisplayDate(a.date).getTime();
    if (dateDiff) return dateDiff;
    return a.customer.localeCompare(b.customer);
  });
}

function sortCashbookEntries(records: CashbookEntry[]) {
  return [...records].sort((a, b) => {
    const dateDiff = parseDisplayDate(b.date).getTime() - parseDisplayDate(a.date).getTime();
    if (dateDiff) return dateDiff;
    return a.description.localeCompare(b.description);
  });
}

function sortInvestmentEntries(records: PartnerInvestmentEntry[]) {
  return [...records].sort((a, b) => {
    const dateDiff = parseDisplayDate(b.date).getTime() - parseDisplayDate(a.date).getTime();
    if (dateDiff) return dateDiff;
    return a.partner.localeCompare(b.partner);
  });
}

function sortLoanEntries(records: LoanPayableEntry[]) {
  return [...records].sort((a, b) => {
    const dateDiff = parseDisplayDate(b.date).getTime() - parseDisplayDate(a.date).getTime();
    if (dateDiff) return dateDiff;
    return a.lender.localeCompare(b.lender);
  });
}

function sortManagerExpenseEntries(records: ManagerExpenseEntry[]) {
  return [...records].sort((a, b) => {
    const dateDiff = parseDisplayDate(b.date).getTime() - parseDisplayDate(a.date).getTime();
    if (dateDiff) return dateDiff;
    return a.category.localeCompare(b.category);
  });
}

function sortManagerCustomers(records: ManagerCustomer[]) {
  return [...records].sort((a, b) => a.name.localeCompare(b.name));
}

function findManagerCustomerMatch(customers: ManagerCustomer[], incoming: Pick<ManagerCustomer, 'name' | 'phone'>) {
  const incomingPhone = normalizePhone(incoming.phone);
  const incomingName = normalizeCustomerName(incoming.name);

  return customers.find((customer) => {
    const samePhone = incomingPhone && normalizePhone(customer.phone) === incomingPhone;
    const sameName = incomingName && normalizeCustomerName(customer.name) === incomingName;
    return Boolean(samePhone || sameName);
  });
}

function upsertManagerCustomer(customers: ManagerCustomer[], incoming: ManagerCustomer) {
  const name = incoming.name.trim();
  if (!name) return customers;

  const incomingPhone = normalizePhone(incoming.phone);
  const incomingName = normalizeCustomerName(name);
  const existingIndex = customers.findIndex((customer) => {
    const samePhone = incomingPhone && normalizePhone(customer.phone) === incomingPhone;
    const sameName = normalizeCustomerName(customer.name) === incomingName;
    return samePhone || sameName || customer.id === incoming.id;
  });

  const nextCustomer: ManagerCustomer = {
    id: incoming.id,
    name,
    phone: incoming.phone.trim(),
    address: incoming.address.trim(),
  };

  if (existingIndex < 0) return [nextCustomer, ...customers];

  return customers.map((customer, index) => {
    if (index !== existingIndex) return customer;
    return {
      ...customer,
      name: nextCustomer.name || customer.name,
      phone: nextCustomer.phone || customer.phone,
      address: nextCustomer.address || customer.address,
    };
  });
}

function buildCategorySummaries(workbook: ManagerWorkbook, categories: string[]) {
  return categories.map((category) => {
    const stockRows = workbook.stockEntries.filter((entry) => entry.category === category);
    const salesRows = workbook.sales.filter((entry) => entry.category === category);
    const totalStock = stockRows.reduce((sum, entry) => sum + entry.qty, 0);
    const totalStockPrice = stockRows.reduce((sum, entry) => sum + entry.qty * entry.unitCost, 0);
    const soldQty = salesRows.reduce((sum, entry) => sum + entry.qty, 0);
    const currentStock = totalStock - soldQty;
    const avgCost = totalStock ? totalStockPrice / totalStock : 0;
    const currentStockValue = currentStock * avgCost;
    const salesAmount = salesRows.reduce((sum, entry) => sum + entry.qty * entry.sellingRate, 0);
    const avgSalePrice = soldQty ? salesAmount / soldQty : 0;
    const stockCostSold = soldQty * avgCost;
    const profit = salesAmount - stockCostSold;
    const profitPercent = stockCostSold ? (profit / stockCostSold) * 100 : 0;
    const percentSold = totalStock ? (soldQty / totalStock) * 100 : 0;
    const stockStatus = currentStock < 0 ? 'OVER SOLD' : percentSold >= 80 ? 'LOW STOCK' : percentSold >= 50 ? 'FAST MOVING' : 'OK';

    return {
      category,
      totalStock,
      soldQty,
      currentStock,
      percentSold,
      avgCost,
      currentStockValue,
      avgSalePrice,
      salesAmount,
      stockCostSold,
      profit,
      profitPercent,
      stockStatus,
    };
  });
}

function buildWorkbookTotals(workbook: ManagerWorkbook, summaries: ReturnType<typeof buildCategorySummaries>) {
  const totalStock = summaries.reduce((sum, item) => sum + item.totalStock, 0);
  const soldQty = summaries.reduce((sum, item) => sum + item.soldQty, 0);
  const currentStock = summaries.reduce((sum, item) => sum + item.currentStock, 0);
  const currentStockValue = summaries.reduce((sum, item) => sum + item.currentStockValue, 0);
  const salesAmount = summaries.reduce((sum, item) => sum + item.salesAmount, 0);
  const profit = summaries.reduce((sum, item) => sum + item.profit, 0);
  const creditAmount = workbook.credits.reduce((sum, entry) => sum + entry.creditAmount, 0);
  const creditPaid = workbook.credits.reduce((sum, entry) => sum + entry.paidAmount, 0);
  const cashBalance = workbook.cashbook.reduce((sum, entry) => sum + entry.cashCredit - entry.cashDebit, 0);
  const bankBalance = workbook.cashbook.reduce((sum, entry) => sum + entry.bankCredit - entry.bankDebit, 0);
  const totalInvestment = workbook.investments
    .filter((entry) => entry.status.trim().toLowerCase() !== 'inactive')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const loanAmount = workbook.loans.reduce((sum, entry) => sum + entry.amount, 0);
  const loanPaid = workbook.loans.reduce((sum, entry) => sum + entry.paidAmount, 0);
  const financeExpenseAmount = workbook.expenses.reduce((sum, entry) => sum + entry.amount, 0);
  const expenseAdjustment = workbook.profitSettings.totalExpense;
  const totalExpense = financeExpenseAmount + expenseAdjustment;

  return {
    totalStock,
    soldQty,
    currentStock,
    currentStockValue,
    salesAmount,
    profit,
    creditAmount,
    creditPaid,
    creditBalance: creditAmount - creditPaid,
    cashBalance,
    bankBalance,
    totalCash: cashBalance + bankBalance,
    totalInvestment,
    loanAmount,
    loanPaid,
    loanBalance: loanAmount - loanPaid,
    financeExpenseAmount,
    expenseAdjustment,
    totalExpense,
  };
}

function buildProfitAndLoss(workbook: ManagerWorkbook, totals: ReturnType<typeof buildWorkbookTotals>) {
  const totalInvestment = totals.totalInvestment;
  const billProfit = totals.profit;
  const otherProfit = workbook.profitSettings.otherProfit;
  const totalExpense = totals.totalExpense;
  const netProfit = billProfit + otherProfit - totalExpense;
  const customerCredit = totals.creditBalance;
  const currentStockValue = totals.currentStockValue;
  const finalBalance = (totalInvestment + netProfit) - (customerCredit + currentStockValue);
  const status = finalBalance < 0 ? `MORE / SURPLUS by ${money(Math.abs(finalBalance))}` : `SHORT by ${money(finalBalance)}`;

  return {
    totalInvestment,
    billProfit,
    currentProfit: netProfit,
    otherProfit,
    financeExpenseAmount: totals.financeExpenseAmount,
    expenseAdjustment: totals.expenseAdjustment,
    totalExpense,
    netProfit,
    customerCredit,
    currentStockValue,
    finalBalance,
    status,
  };
}

function formatNonGstBillNo(sequence: number) {
  return `RCPT${String(Math.max(1, Math.trunc(sequence))).padStart(3, '0')}`;
}

function normalizeReceiptNo(value: string) {
  return value.trim().replace(/^NGB/i, 'RCPT');
}

function normalizeSaleReceiptNo(entry: SaleEntry): SaleEntry {
  return {
    ...entry,
    billNo: normalizeReceiptNo(entry.billNo),
  };
}

function extractBillSequence(value: string) {
  const matches = value.match(/\d+/g);
  return matches ? Number(matches[matches.length - 1]) || 0 : 0;
}

function parseAmount(value: string) {
  return Number.parseFloat(value.replace(/,/g, '')) || 0;
}

function formatFormNumber(value: number) {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(2)));
}

function normalizeCustomerName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}
