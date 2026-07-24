import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logo } from './src/assets';
import {
  CLIENT_STORAGE_KEY,
  EMPLOYEE_STORAGE_KEY,
  EXPENSE_STORAGE_KEY,
  INVOICE_IMPORT_STORAGE_KEY,
  INVOICE_SEQUENCE_STORAGE_KEY,
  INVOICE_TABLE_STORAGE_KEY,
  PAYMENT_STORAGE_KEY,
  PRODUCT_STORAGE_KEY,
  PURCHASE_TABLE_STORAGE_KEY,
  SALARY_STORAGE_KEY,
  SUPPLIER_PAYMENT_STORAGE_KEY,
  SUPPLIER_STORAGE_KEY,
  appMenus,
  buildPrintableHtml,
  calculateInvoice,
  emptyManagerUserForm,
  emptyPasswordForm,
  formatDate,
  formatInvoiceNumber,
  getInvoiceSequenceNumber,
  getNextInvoiceSequenceFromInvoices,
  makeInvoiceState,
  makeProductRow,
  money,
  sections,
  sortSavedInvoicesByInvoiceDate,
} from './src/invoiceCore';
import { seedClientDocuments } from './src/nosqlClientTable';
import type { ClientDocument, ClientForm } from './src/nosqlClientTable';
import { seedEmployeeDocuments, seedSalaryDocuments } from './src/nosqlEmployeeTable';
import type { EmployeeDocument, SalaryDocument } from './src/nosqlEmployeeTable';
import { seedExpenseDocuments } from './src/nosqlExpenseTable';
import type { ExpenseDocument } from './src/nosqlExpenseTable';
import { seedInvoiceDocuments } from './src/nosqlInvoiceTable';
import { seedPaymentDocuments } from './src/nosqlPaymentTable';
import type { PaymentDocument } from './src/nosqlPaymentTable';
import { seedProductDocuments } from './src/nosqlProductTable';
import type { ProductDocument } from './src/nosqlProductTable';
import { seedPurchaseDocuments } from './src/nosqlPurchaseTable';
import type { PurchaseDocument, PurchaseImportResult } from './src/nosqlPurchaseTable';
import { seedSupplierPaymentDocuments } from './src/nosqlSupplierPaymentTable';
import type { SupplierPaymentDocument } from './src/nosqlSupplierPaymentTable';
import { seedSupplierDocuments } from './src/nosqlSupplierTable';
import type { SupplierDocument, SupplierForm } from './src/nosqlSupplierTable';
import {
  USER_TABLE_STORAGE_KEY,
  createSeedUserTable,
  flattenUsers,
  normalizeUserTable,
  toAuthenticatedUser,
} from './src/nosqlUserTable';
import type { AuthenticatedUser, NoSqlUserTable, UserDocument } from './src/nosqlUserTable';
import { AccountScreen } from './src/screens/AccountScreen';
import { ClientsScreen } from './src/screens/ClientsScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DeviceSharingScreen } from './src/screens/DeviceSharingScreen';
import { DocumentsScreen } from './src/screens/DocumentsScreen';
import { EmployeesScreen } from './src/screens/EmployeesScreen';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { GstFilingScreen } from './src/screens/GstFilingScreen';
import { InvoicesScreen } from './src/screens/InvoicesScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import {
  CustomerSection,
  EwaySection,
  InvoiceSection,
  ItemsSection,
  PreviewSection,
} from './src/screens/InvoiceWorkflowScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import {
  MANAGER_NON_GST_SEQUENCE_KEY,
  MANAGER_WORKBOOK_KEY,
  ManagerNonGstBillScreen,
  createDefaultManagerWorkbook,
  normalizeManagerWorkbook,
} from './src/screens/ManagerNonGstBillScreen';
import type { ManagerWorkbook } from './src/screens/ManagerNonGstBillScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';
import { PurchasesScreen } from './src/screens/PurchasesScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { SuppliersScreen } from './src/screens/SuppliersScreen';
import { SupplierPaymentsScreen } from './src/screens/SupplierPaymentsScreen';
import { UsersScreen } from './src/screens/UsersScreen';
import { styles } from './src/styles';
import {
  fetchSyncSnapshot,
  getSyncDeviceId,
  getSyncServerUrl,
  getStoredSyncDeviceId,
  hydrateSnapshotFiles,
  pushSyncSnapshot,
  uploadSnapshotFiles,
} from './src/syncClient';
import type { SyncDatabaseSnapshot } from './src/syncClient';
import type { AppMenuKey, InvoiceState, ManagerUserForm, PasswordForm, ProductRow, ProfileForm, SavedInvoiceDocument } from './src/types';

const emptyClientForm: ClientForm = {
  name: '',
  address: '',
  gstin: '',
  phone: '',
};

const emptySupplierForm: SupplierForm = {
  name: '',
  address: '',
  gstin: '',
  phone: '',
  email: '',
};

const NEW_DEVICE_SERVER_PULL_PENDING_KEY = 'lucky-traders.newDeviceServerPullPending.v1';

const emptyProfileForm: ProfileForm = {
  name: '',
  email: '',
  phone: '',
};

function parseStoredStringList(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeClientName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeClientGstin(value: string) {
  return value.trim().toLowerCase();
}

function normalizeClientPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `91${digits}` : digits;
}

function getClientDedupeKey(client: ClientDocument) {
  const clientGstin = normalizeClientGstin(client.gstin);
  const clientPhone = normalizeClientPhone(client.phone);
  const clientName = normalizeClientName(client.name);

  if (isRealGstin(clientGstin)) {
    return `gstin:${clientGstin}`;
  }

  if (clientPhone) {
    return `phone:${clientPhone}`;
  }

  return clientName ? `name:${clientName}` : `id:${client.id}`;
}

function mergeClientRecords(existing: ClientDocument, incoming: ClientDocument) {
  const merged: ClientDocument = { ...existing };

  if (!merged.name.trim() && incoming.name.trim()) {
    merged.name = incoming.name.trim();
  }

  if (!merged.address.trim() && incoming.address.trim()) {
    merged.address = incoming.address.trim();
  }

  const existingGstin = normalizeClientGstin(existing.gstin);
  const incomingGstin = normalizeClientGstin(incoming.gstin);
  if ((existingGstin === '' || existingGstin === 'urp') && isRealGstin(incomingGstin)) {
    merged.gstin = incoming.gstin.trim();
  }

  if (!normalizeClientPhone(existing.phone) && normalizeClientPhone(incoming.phone)) {
    merged.phone = incoming.phone.trim();
  }

  if (incoming.updatedAt && !merged.updatedAt) {
    merged.updatedAt = incoming.updatedAt;
    merged.updatedBy = incoming.updatedBy;
    merged.updatedByRole = incoming.updatedByRole;
  }

  return merged;
}

function dedupeClientsByIdentity(clients: ClientDocument[]) {
  const map = new Map<string, ClientDocument>();
  const order: string[] = [];

  for (const client of clients) {
    const key = getClientDedupeKey(client);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, client);
      order.push(key);
      continue;
    }

    map.set(key, mergeClientRecords(existing, client));
  }

  return order.map((key) => map.get(key)).filter((item): item is ClientDocument => Boolean(item));
}

function isRealGstin(value: string) {
  return Boolean(value && value !== 'urp');
}

function makeInvoiceClientId(name: string, existingCount: number) {
  const slug = normalizeClientName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';
  return `client-invoice-${slug}-${Date.now()}-${existingCount}`;
}

function findInvoiceClientIndex(clients: ClientDocument[], invoice: InvoiceState) {
  const invoiceName = normalizeClientName(invoice.toName);
  const invoiceGstin = normalizeClientGstin(invoice.toGstin);
  const invoicePhone = normalizeClientPhone(invoice.toPhone);

  return clients.findIndex((client) => {
    const clientGstin = normalizeClientGstin(client.gstin);
    const clientPhone = normalizeClientPhone(client.phone);
    const clientName = normalizeClientName(client.name);
    const sameGstin = isRealGstin(invoiceGstin) && clientGstin === invoiceGstin;
    const samePhone = Boolean(invoicePhone && clientPhone === invoicePhone);
    const sameName = Boolean(invoiceName && clientName === invoiceName);
    return sameGstin || samePhone || sameName;
  });
}

function upsertClientFromInvoice(
  currentClients: ClientDocument[],
  invoice: InvoiceState,
  actorName: string,
  actorRole: string,
) {
  const name = invoice.toName.trim();
  const address = invoice.toAddress.trim();
  const gstin = invoice.toGstin.trim();
  const phone = invoice.toPhone.trim();

  if (!name) return currentClients;

  const existingIndex = findInvoiceClientIndex(currentClients, invoice);
  const today = formatDate(new Date());

  if (existingIndex >= 0) {
    const existingClient = currentClients[existingIndex];
    const nextClient: ClientDocument = {
      ...existingClient,
      address: existingClient.address.trim() || address,
      gstin: (!existingClient.gstin.trim() || normalizeClientGstin(existingClient.gstin) === 'urp') && isRealGstin(normalizeClientGstin(gstin))
        ? gstin
        : existingClient.gstin,
      phone: normalizeClientPhone(existingClient.phone) ? existingClient.phone : phone,
    };
    const changed =
      nextClient.address !== existingClient.address ||
      nextClient.gstin !== existingClient.gstin ||
      nextClient.phone !== existingClient.phone;

    if (!changed) return currentClients;

    nextClient.updatedAt = today;
    nextClient.updatedBy = actorName;
    nextClient.updatedByRole = actorRole;

    return dedupeClientsByIdentity(currentClients.map((client, index) => (index === existingIndex ? nextClient : client)));
  }

  const newClient: ClientDocument = {
    id: makeInvoiceClientId(name, currentClients.length),
    name,
    address,
    gstin,
    phone,
    createdAt: today,
    createdBy: actorName,
    createdByRole: actorRole,
  };

  return dedupeClientsByIdentity([newClient, ...currentClients]);
}

function upsertClientsFromSavedInvoices(
  currentClients: ClientDocument[],
  savedInvoices: SavedInvoiceDocument[],
  actorName: string,
  actorRole: string,
) {
  return savedInvoices.reduce(
    (nextClients, savedInvoice) => upsertClientFromInvoice(nextClients, savedInvoice.invoice, actorName, actorRole),
    currentClients,
  );
}

function normalizeSupplierName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findSupplierIndex(suppliers: SupplierDocument[], supplierForm: SupplierForm) {
  const supplierName = normalizeSupplierName(supplierForm.name);
  const supplierGstin = supplierForm.gstin.trim().toLowerCase();
  const supplierPhone = supplierForm.phone.replace(/\D/g, '');
  const supplierEmail = supplierForm.email.trim().toLowerCase();

  return suppliers.findIndex((supplier) => {
    const recordGstin = supplier.gstin.trim().toLowerCase();
    const recordPhone = supplier.phone.replace(/\D/g, '');
    const recordEmail = supplier.email.trim().toLowerCase();
    const recordName = normalizeSupplierName(supplier.name);
    const sameGstin = supplierGstin && supplierGstin !== 'urp' && recordGstin === supplierGstin;
    const samePhone = supplierPhone.length >= 8 && recordPhone === supplierPhone;
    const sameEmail = supplierEmail && recordEmail === supplierEmail;
    const sameName = supplierName && recordName === supplierName;
    return sameGstin || samePhone || sameEmail || sameName;
  });
}

function upsertSupplierFromPurchase(
  currentSuppliers: SupplierDocument[],
  supplierForm: SupplierForm,
  sourceFileName: string,
  actorName: string,
  actorRole: string,
) {
  const name = supplierForm.name.trim();
  if (!name) return currentSuppliers;

  const today = formatDate(new Date());
  const existingIndex = findSupplierIndex(currentSuppliers, supplierForm);

  if (existingIndex >= 0) {
    const existingSupplier = currentSuppliers[existingIndex];
    const nextSupplier: SupplierDocument = {
      ...existingSupplier,
      address: existingSupplier.address.trim() || supplierForm.address.trim(),
      gstin: existingSupplier.gstin.trim() || supplierForm.gstin.trim(),
      phone: existingSupplier.phone.trim() || supplierForm.phone.trim(),
      email: existingSupplier.email.trim() || supplierForm.email.trim(),
      sourceFileName: existingSupplier.sourceFileName || sourceFileName,
    };
    const changed =
      nextSupplier.address !== existingSupplier.address ||
      nextSupplier.gstin !== existingSupplier.gstin ||
      nextSupplier.phone !== existingSupplier.phone ||
      nextSupplier.email !== existingSupplier.email ||
      nextSupplier.sourceFileName !== existingSupplier.sourceFileName;

    if (!changed) return currentSuppliers;

    nextSupplier.updatedAt = today;
    nextSupplier.updatedBy = actorName;
    nextSupplier.updatedByRole = actorRole;

    return currentSuppliers.map((supplier, index) => (index === existingIndex ? nextSupplier : supplier));
  }

  const newSupplier: SupplierDocument = {
    id: `supplier-purchase-${Date.now()}`,
    name,
    address: supplierForm.address.trim(),
    gstin: supplierForm.gstin.trim(),
    phone: supplierForm.phone.trim(),
    email: supplierForm.email.trim(),
    sourceFileName,
    createdAt: today,
    createdBy: actorName,
    createdByRole: actorRole,
  };

  return [newSupplier, ...currentSuppliers];
}

export default function App() {
  const [signedInUser, setSignedInUser] = useState<AuthenticatedUser | null>(null);
  const [activeMenu, setActiveMenu] = useState<AppMenuKey>('dashboard');
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [userTable, setUserTable] = useState<NoSqlUserTable>(() => createSeedUserTable());
  const [nextInvoiceSequence, setNextInvoiceSequence] = useState(1);
  const [invoice, setInvoice] = useState<InvoiceState>(() => makeInvoiceState(formatInvoiceNumber(1), seedProductDocuments));
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoiceDocument[]>([]);
  const [products, setProducts] = useState<ProductDocument[]>(seedProductDocuments);
  const [purchases, setPurchases] = useState<PurchaseDocument[]>(seedPurchaseDocuments);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [previewingInvoiceId, setPreviewingInvoiceId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientDocument[]>(seedClientDocuments);
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierDocument[]>(seedSupplierDocuments);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplierForm);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierSourceFileName, setSupplierSourceFileName] = useState('');
  const [employees, setEmployees] = useState<EmployeeDocument[]>(seedEmployeeDocuments);
  const [salaries, setSalaries] = useState<SalaryDocument[]>(seedSalaryDocuments);
  const [expenses, setExpenses] = useState<ExpenseDocument[]>(seedExpenseDocuments);
  const [payments, setPayments] = useState<PaymentDocument[]>(seedPaymentDocuments);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPaymentDocument[]>(seedSupplierPaymentDocuments);
  const [managerNonGstSequence, setManagerNonGstSequence] = useState(1);
  const [managerWorkbook, setManagerWorkbook] = useState<ManagerWorkbook>(() => createDefaultManagerWorkbook());
  const [managerUserForm, setManagerUserForm] = useState<ManagerUserForm>(emptyManagerUserForm);
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [userDatabaseHydrated, setUserDatabaseHydrated] = useState(false);
  const [clientsHydrated, setClientsHydrated] = useState(false);
  const [suppliersHydrated, setSuppliersHydrated] = useState(false);
  const [productsHydrated, setProductsHydrated] = useState(false);
  const [purchasesHydrated, setPurchasesHydrated] = useState(false);
  const [employeesHydrated, setEmployeesHydrated] = useState(false);
  const [salariesHydrated, setSalariesHydrated] = useState(false);
  const [expensesHydrated, setExpensesHydrated] = useState(false);
  const [paymentsHydrated, setPaymentsHydrated] = useState(false);
  const [supplierPaymentsHydrated, setSupplierPaymentsHydrated] = useState(false);
  const [invoiceDatabaseHydrated, setInvoiceDatabaseHydrated] = useState(false);
  const [managerWorkbookHydrated, setManagerWorkbookHydrated] = useState(false);
  const [invoiceClientsSynced, setInvoiceClientsSynced] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [syncRevision, setSyncRevision] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'checking' | 'online' | 'offline' | 'syncing'>('checking');
  const [syncDeviceId, setSyncDeviceId] = useState('');
  const [manualSyncAction, setManualSyncAction] = useState<'send' | 'receive' | null>(null);
  const syncRevisionRef = useRef(0);
  const syncApplyingRemoteRef = useRef(false);
  const syncStartedRef = useRef(false);
  const syncPushingRef = useRef(false);
  const syncDirtyRef = useRef(false);
  const syncSnapshotRef = useRef<SyncDatabaseSnapshot | null>(null);
  const syncLastSnapshotRef = useRef('');

  const totals = useMemo(() => calculateInvoice(invoice, products), [invoice, products]);
  const users = useMemo(() => flattenUsers(userTable), [userTable]);
  const visibleAppMenus = useMemo(
    () => appMenus.filter((menu) => menu.key !== 'users' || signedInUser?.role === 'admin'),
    [signedInUser?.role],
  );
  const localDatabasesHydrated =
    userDatabaseHydrated &&
    clientsHydrated &&
    suppliersHydrated &&
    productsHydrated &&
    purchasesHydrated &&
    employeesHydrated &&
    salariesHydrated &&
    expensesHydrated &&
    paymentsHydrated &&
    supplierPaymentsHydrated &&
    invoiceDatabaseHydrated &&
    managerWorkbookHydrated;
  const syncSnapshot = useMemo<SyncDatabaseSnapshot>(
    () => ({
      userTable,
      clients,
      suppliers,
      products,
      purchases,
      employees,
      salaries,
      expenses,
      payments,
      supplierPayments,
      nextInvoiceSequence,
      savedInvoices,
      managerNonGstSequence,
      managerWorkbook,
    }),
    [
      clients,
      employees,
      expenses,
      managerNonGstSequence,
      managerWorkbook,
      nextInvoiceSequence,
      payments,
      products,
      purchases,
      salaries,
      savedInvoices,
      supplierPayments,
      suppliers,
      userTable,
    ],
  );

  useEffect(() => {
    syncSnapshotRef.current = syncSnapshot;
  }, [syncSnapshot]);

  function getSyncSnapshotFingerprint(snapshot: SyncDatabaseSnapshot) {
    return JSON.stringify(snapshot);
  }

  function rememberSyncedSnapshot(snapshot: SyncDatabaseSnapshot) {
    syncLastSnapshotRef.current = getSyncSnapshotFingerprint(snapshot);
  }

  function isSyncedSnapshot(snapshot: SyncDatabaseSnapshot) {
    return syncLastSnapshotRef.current === getSyncSnapshotFingerprint(snapshot);
  }

  useEffect(() => {
    let cancelled = false;
    getSyncDeviceId()
      .then((deviceId) => {
        if (!cancelled) setSyncDeviceId(deviceId);
      })
      .catch((error) => {
        console.warn('Unable to load sync device id', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function applySyncSnapshot(snapshot: SyncDatabaseSnapshot) {
    syncApplyingRemoteRef.current = true;
    const syncedInvoices = sortSavedInvoicesByInvoiceDate(Array.isArray(snapshot.savedInvoices) ? snapshot.savedInvoices : []);
    const syncedNextSequence = getNextInvoiceSequenceFromInvoices(syncedInvoices, Math.max(1, Number(snapshot.nextInvoiceSequence) || 1));
    setUserTable(normalizeUserTable(snapshot.userTable));
    setClients(dedupeClientsByIdentity(Array.isArray(snapshot.clients) ? snapshot.clients : []));
    setSuppliers(Array.isArray(snapshot.suppliers) ? snapshot.suppliers : []);
    setProducts(Array.isArray(snapshot.products) && snapshot.products.length > 0 ? snapshot.products : seedProductDocuments);
    setPurchases(Array.isArray(snapshot.purchases) ? snapshot.purchases : []);
    setEmployees(Array.isArray(snapshot.employees) ? snapshot.employees : []);
    setSalaries(Array.isArray(snapshot.salaries) ? snapshot.salaries : []);
    setExpenses(Array.isArray(snapshot.expenses) ? snapshot.expenses : []);
    setPayments(Array.isArray(snapshot.payments) ? snapshot.payments : []);
    setSupplierPayments(Array.isArray(snapshot.supplierPayments) ? snapshot.supplierPayments : []);
    setNextInvoiceSequence(syncedNextSequence);
    setSavedInvoices(syncedInvoices);
    if (!editingInvoiceId) {
      setInvoice(makeInvoiceState(formatInvoiceNumber(syncedNextSequence), Array.isArray(snapshot.products) && snapshot.products.length > 0 ? snapshot.products : seedProductDocuments));
    }
    setManagerNonGstSequence(Math.max(1, Number(snapshot.managerNonGstSequence) || 1));
    setManagerWorkbook(normalizeManagerWorkbook(snapshot.managerWorkbook));
    if (signedInUser) {
      const currentUser = snapshot.userTable?.[signedInUser.collection]?.[signedInUser.id];
      if (currentUser) {
        setSignedInUser(toAuthenticatedUser(currentUser));
      }
    }
    hydrateSnapshotFiles(snapshot)
      .then((result) => {
        if (!result.changed) return;
        setPurchases(result.snapshot.purchases);
        setExpenses(result.snapshot.expenses);
      })
      .catch((error) => {
        console.warn('Unable to restore synced files', error);
      })
      .finally(() => {
        setTimeout(() => {
          syncApplyingRemoteRef.current = false;
        }, 700);
      });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      try {
        const storedUsers = await AsyncStorage.getItem(USER_TABLE_STORAGE_KEY);
        if (!cancelled && storedUsers) {
          setUserTable(normalizeUserTable(JSON.parse(storedUsers)));
        }
      } catch (error) {
        console.warn('Unable to load user database', error);
      } finally {
        if (!cancelled) setUserDatabaseHydrated(true);
      }
    }

    loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userDatabaseHydrated) return;
    AsyncStorage.setItem(USER_TABLE_STORAGE_KEY, JSON.stringify(userTable)).catch((error) => {
      console.warn('Unable to save user database', error);
    });
  }, [userDatabaseHydrated, userTable]);

  useEffect(() => {
    let cancelled = false;

    async function loadClients() {
      try {
        const storedClients = await AsyncStorage.getItem(CLIENT_STORAGE_KEY);
        if (!cancelled && storedClients) {
          const parsedClients = JSON.parse(storedClients) as ClientDocument[];
          if (Array.isArray(parsedClients) && parsedClients.length > 0) {
            setClients(dedupeClientsByIdentity(parsedClients));
          }
        }
      } catch (error) {
        console.warn('Unable to load client database', error);
      } finally {
        if (!cancelled) setClientsHydrated(true);
      }
    }

    loadClients();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clientsHydrated) return;
    AsyncStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify(clients)).catch((error) => {
      console.warn('Unable to save client database', error);
    });
  }, [clients, clientsHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadSuppliers() {
      try {
        const storedSuppliers = await AsyncStorage.getItem(SUPPLIER_STORAGE_KEY);
        if (!cancelled && storedSuppliers) {
          const parsedSuppliers = JSON.parse(storedSuppliers) as SupplierDocument[];
          if (Array.isArray(parsedSuppliers)) {
            setSuppliers(parsedSuppliers);
          }
        }
      } catch (error) {
        console.warn('Unable to load supplier database', error);
      } finally {
        if (!cancelled) setSuppliersHydrated(true);
      }
    }

    loadSuppliers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!suppliersHydrated) return;
    AsyncStorage.setItem(SUPPLIER_STORAGE_KEY, JSON.stringify(suppliers)).catch((error) => {
      console.warn('Unable to save supplier database', error);
    });
  }, [suppliers, suppliersHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        const storedProducts = await AsyncStorage.getItem(PRODUCT_STORAGE_KEY);
        if (!cancelled && storedProducts) {
          const parsedProducts = JSON.parse(storedProducts) as ProductDocument[];
          if (Array.isArray(parsedProducts) && parsedProducts.length > 0) {
            setProducts(parsedProducts);
          }
        }
      } catch (error) {
        console.warn('Unable to load product master', error);
      } finally {
        if (!cancelled) setProductsHydrated(true);
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!productsHydrated) return;
    AsyncStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(products)).catch((error) => {
      console.warn('Unable to save product master', error);
    });
  }, [products, productsHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadPurchases() {
      try {
        const storedPurchases = await AsyncStorage.getItem(PURCHASE_TABLE_STORAGE_KEY);
        if (!cancelled && storedPurchases) {
          const parsedPurchases = JSON.parse(storedPurchases) as PurchaseDocument[];
          if (Array.isArray(parsedPurchases)) {
            setPurchases(parsedPurchases);
          }
        }
      } catch (error) {
        console.warn('Unable to load purchase database', error);
      } finally {
        if (!cancelled) setPurchasesHydrated(true);
      }
    }

    loadPurchases();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!purchasesHydrated) return;
    AsyncStorage.setItem(PURCHASE_TABLE_STORAGE_KEY, JSON.stringify(purchases)).catch((error) => {
      console.warn('Unable to save purchase database', error);
    });
  }, [purchases, purchasesHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      try {
        const storedEmployees = await AsyncStorage.getItem(EMPLOYEE_STORAGE_KEY);
        if (!cancelled && storedEmployees) {
          const parsedEmployees = JSON.parse(storedEmployees) as EmployeeDocument[];
          if (Array.isArray(parsedEmployees)) {
            setEmployees(parsedEmployees);
          }
        }
      } catch (error) {
        console.warn('Unable to load employee database', error);
      } finally {
        if (!cancelled) setEmployeesHydrated(true);
      }
    }

    loadEmployees();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!employeesHydrated) return;
    AsyncStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employees)).catch((error) => {
      console.warn('Unable to save employee database', error);
    });
  }, [employees, employeesHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadSalaries() {
      try {
        const storedSalaries = await AsyncStorage.getItem(SALARY_STORAGE_KEY);
        if (!cancelled && storedSalaries) {
          const parsedSalaries = JSON.parse(storedSalaries) as SalaryDocument[];
          if (Array.isArray(parsedSalaries)) {
            setSalaries(parsedSalaries);
          }
        }
      } catch (error) {
        console.warn('Unable to load salary database', error);
      } finally {
        if (!cancelled) setSalariesHydrated(true);
      }
    }

    loadSalaries();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!salariesHydrated) return;
    AsyncStorage.setItem(SALARY_STORAGE_KEY, JSON.stringify(salaries)).catch((error) => {
      console.warn('Unable to save salary database', error);
    });
  }, [salaries, salariesHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadExpenses() {
      try {
        const storedExpenses = await AsyncStorage.getItem(EXPENSE_STORAGE_KEY);
        if (!cancelled && storedExpenses) {
          const parsedExpenses = JSON.parse(storedExpenses) as ExpenseDocument[];
          if (Array.isArray(parsedExpenses)) {
            setExpenses(parsedExpenses);
          }
        }
      } catch (error) {
        console.warn('Unable to load expense database', error);
      } finally {
        if (!cancelled) setExpensesHydrated(true);
      }
    }

    loadExpenses();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!expensesHydrated) return;
    AsyncStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(expenses)).catch((error) => {
      console.warn('Unable to save expense database', error);
    });
  }, [expenses, expensesHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadPayments() {
      try {
        const storedPayments = await AsyncStorage.getItem(PAYMENT_STORAGE_KEY);
        if (!cancelled && storedPayments) {
          const parsedPayments = JSON.parse(storedPayments) as PaymentDocument[];
          if (Array.isArray(parsedPayments)) {
            setPayments(parsedPayments);
          }
        }
      } catch (error) {
        console.warn('Unable to load payment database', error);
      } finally {
        if (!cancelled) setPaymentsHydrated(true);
      }
    }

    loadPayments();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!paymentsHydrated) return;
    AsyncStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(payments)).catch((error) => {
      console.warn('Unable to save payment database', error);
    });
  }, [payments, paymentsHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadSupplierPayments() {
      try {
        const storedSupplierPayments = await AsyncStorage.getItem(SUPPLIER_PAYMENT_STORAGE_KEY);
        if (!cancelled && storedSupplierPayments) {
          const parsedSupplierPayments = JSON.parse(storedSupplierPayments) as SupplierPaymentDocument[];
          if (Array.isArray(parsedSupplierPayments)) {
            setSupplierPayments(parsedSupplierPayments);
          }
        }
      } catch (error) {
        console.warn('Unable to load supplier payment database', error);
      } finally {
        if (!cancelled) setSupplierPaymentsHydrated(true);
      }
    }

    loadSupplierPayments();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supplierPaymentsHydrated) return;
    AsyncStorage.setItem(SUPPLIER_PAYMENT_STORAGE_KEY, JSON.stringify(supplierPayments)).catch((error) => {
      console.warn('Unable to save supplier payment database', error);
    });
  }, [supplierPayments, supplierPaymentsHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadInvoiceDatabase() {
      try {
        const [storedSequence, storedInvoices, storedImportedInvoiceIds] = await Promise.all([
          AsyncStorage.getItem(INVOICE_SEQUENCE_STORAGE_KEY),
          AsyncStorage.getItem(INVOICE_TABLE_STORAGE_KEY),
          AsyncStorage.getItem(INVOICE_IMPORT_STORAGE_KEY),
        ]);
        const parsedSequence = Number.parseInt(storedSequence || '1', 10);
        const storedNextSequence = Number.isFinite(parsedSequence) && parsedSequence > 0 ? parsedSequence : 1;
        let parsedInvoices: SavedInvoiceDocument[] = [];
        const importedInvoiceIds = new Set(parseStoredStringList(storedImportedInvoiceIds));

        if (storedInvoices) {
          const storedInvoiceList = JSON.parse(storedInvoices) as SavedInvoiceDocument[];
          if (Array.isArray(storedInvoiceList)) {
            parsedInvoices = storedInvoiceList;
          }
        }

        const invoiceIdsToMarkImported = new Set(importedInvoiceIds);
        const pendingImportedInvoices = seedInvoiceDocuments.filter((importedInvoice) => {
          const alreadySaved = parsedInvoices.some(
            (savedInvoice) => savedInvoice.id === importedInvoice.id || savedInvoice.invoiceNo === importedInvoice.invoiceNo,
          );
          if (alreadySaved) invoiceIdsToMarkImported.add(importedInvoice.id);
          return !importedInvoiceIds.has(importedInvoice.id) && !alreadySaved;
        });
        pendingImportedInvoices.forEach((importedInvoice) => invoiceIdsToMarkImported.add(importedInvoice.id));

        const mergedInvoices = sortSavedInvoicesByInvoiceDate([...pendingImportedInvoices, ...parsedInvoices]);
        const nextSequence = getNextInvoiceSequenceFromInvoices(mergedInvoices, storedNextSequence);

        if (!cancelled) {
          setNextInvoiceSequence(nextSequence);
          setInvoice(makeInvoiceState(formatInvoiceNumber(nextSequence), products));
          setSavedInvoices(mergedInvoices);
        }

        if (pendingImportedInvoices.length > 0 || invoiceIdsToMarkImported.size !== importedInvoiceIds.size) {
          AsyncStorage.setItem(INVOICE_IMPORT_STORAGE_KEY, JSON.stringify(Array.from(invoiceIdsToMarkImported))).catch((error) => {
            console.warn('Unable to save imported invoice markers', error);
          });
        }
      } catch (error) {
        console.warn('Unable to load invoice database', error);
      } finally {
        if (!cancelled) setInvoiceDatabaseHydrated(true);
      }
    }

    loadInvoiceDatabase();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!invoiceDatabaseHydrated) return;
    Promise.all([
      AsyncStorage.setItem(INVOICE_SEQUENCE_STORAGE_KEY, String(nextInvoiceSequence)),
      AsyncStorage.setItem(INVOICE_TABLE_STORAGE_KEY, JSON.stringify(savedInvoices)),
    ]).catch((error) => {
      console.warn('Unable to save invoice database', error);
    });
  }, [invoiceDatabaseHydrated, nextInvoiceSequence, savedInvoices]);

  useEffect(() => {
    let cancelled = false;

    async function loadManagerWorkbook() {
      try {
        const [storedSequence, storedWorkbook] = await Promise.all([
          AsyncStorage.getItem(MANAGER_NON_GST_SEQUENCE_KEY),
          AsyncStorage.getItem(MANAGER_WORKBOOK_KEY),
        ]);
        const parsedSequence = Number.parseInt(storedSequence || '1', 10);
        if (!cancelled) {
          setManagerNonGstSequence(Number.isFinite(parsedSequence) && parsedSequence > 0 ? parsedSequence : 1);
          setManagerWorkbook(normalizeManagerWorkbook(storedWorkbook ? JSON.parse(storedWorkbook) : null));
        }
      } catch (error) {
        console.warn('Unable to load manager workbook', error);
      } finally {
        if (!cancelled) setManagerWorkbookHydrated(true);
      }
    }

    loadManagerWorkbook();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!managerWorkbookHydrated) return;
    Promise.all([
      AsyncStorage.setItem(MANAGER_NON_GST_SEQUENCE_KEY, String(managerNonGstSequence)),
      AsyncStorage.setItem(MANAGER_WORKBOOK_KEY, JSON.stringify(managerWorkbook)),
    ]).catch((error) => {
      console.warn('Unable to save manager workbook', error);
    });
  }, [managerNonGstSequence, managerWorkbook, managerWorkbookHydrated]);

  useEffect(() => {
    if (!clientsHydrated || !invoiceDatabaseHydrated || invoiceClientsSynced) return;
    setClients((current) => upsertClientsFromSavedInvoices(current, savedInvoices, 'Invoice Import', 'system'));
    setInvoiceClientsSynced(true);
  }, [clientsHydrated, invoiceClientsSynced, invoiceDatabaseHydrated, savedInvoices]);

  useEffect(() => {
    if (!localDatabasesHydrated || syncStartedRef.current) return;
    syncStartedRef.current = true;
    let cancelled = false;

    async function initialSync() {
      try {
        setSyncStatus('syncing');
        const storedDeviceId = await getStoredSyncDeviceId();
        const pendingInitialPull = await AsyncStorage.getItem(NEW_DEVICE_SERVER_PULL_PENDING_KEY);
        const shouldPullServerFirst = !storedDeviceId || pendingInitialPull === '1';
        if (!storedDeviceId) {
          await AsyncStorage.setItem(NEW_DEVICE_SERVER_PULL_PENDING_KEY, '1');
        }
        const deviceId = storedDeviceId || await getSyncDeviceId();
        if (!syncDeviceId) setSyncDeviceId(deviceId);

        let baseRevision = syncRevisionRef.current;
        if (shouldPullServerFirst) {
          const remote = await fetchSyncSnapshot();
          if (cancelled) return;

          syncRevisionRef.current = remote.revision;
          setSyncRevision(remote.revision);
          baseRevision = remote.revision;
          if (remote.data) {
            rememberSyncedSnapshot(remote.data);
            applySyncSnapshot(remote.data);
            syncDirtyRef.current = false;
            await AsyncStorage.removeItem(NEW_DEVICE_SERVER_PULL_PENDING_KEY);
            setSyncStatus('online');
            setSyncReady(true);
            return;
          }
        }

        const response = await pushSyncSnapshot(syncSnapshot, baseRevision, deviceId);
        if (cancelled) return;

        const syncedSnapshot = response.data || syncSnapshot;
        rememberSyncedSnapshot(syncedSnapshot);
        uploadSnapshotFiles(syncedSnapshot).catch((error) => {
          console.warn('Unable to upload synced files', error);
        });
        syncRevisionRef.current = response.revision;
        setSyncRevision(response.revision);
        if (response.data) {
          applySyncSnapshot(response.data);
        }
        syncDirtyRef.current = false;
        if (shouldPullServerFirst) {
          await AsyncStorage.removeItem(NEW_DEVICE_SERVER_PULL_PENDING_KEY);
        }
        setSyncStatus('online');
        setSyncReady(true);
      } catch (error) {
        console.warn(`Common sync is offline at ${getSyncServerUrl()}`, error);
        if (!cancelled) {
          syncDirtyRef.current = true;
          setSyncStatus('offline');
          setSyncReady(true);
        }
      }
    }

    initialSync();
    return () => {
      cancelled = true;
    };
  }, [localDatabasesHydrated, syncSnapshot]);

  useEffect(() => {
    if (!localDatabasesHydrated || !syncReady || syncApplyingRemoteRef.current) return;

    const timer = setTimeout(async () => {
      if (syncApplyingRemoteRef.current || syncPushingRef.current) return;
      if (isSyncedSnapshot(syncSnapshot)) {
        syncDirtyRef.current = false;
        setSyncStatus('online');
        return;
      }

      try {
        syncDirtyRef.current = true;
        syncPushingRef.current = true;
        setSyncStatus('syncing');
        const deviceId = await getSyncDeviceId();
        const response = await pushSyncSnapshot(syncSnapshot, syncRevisionRef.current, deviceId);
        const syncedSnapshot = response.data || syncSnapshot;
        rememberSyncedSnapshot(syncedSnapshot);
        uploadSnapshotFiles(syncedSnapshot).catch((error) => {
          console.warn('Unable to upload synced files', error);
        });
        syncRevisionRef.current = response.revision;
        setSyncRevision(response.revision);
        if (response.mode === 'merge' && response.data) {
          applySyncSnapshot(response.data);
        }
        syncDirtyRef.current = false;
        setSyncStatus('online');
      } catch (error) {
        console.warn(`Unable to push common sync to ${getSyncServerUrl()}`, error);
        setSyncStatus('offline');
      } finally {
        syncPushingRef.current = false;
      }
    }, 1200);

    return () => {
      clearTimeout(timer);
    };
  }, [localDatabasesHydrated, syncReady, syncSnapshot]);

  useEffect(() => {
    if (!syncReady) return;

    const timer = setInterval(async () => {
      if (syncApplyingRemoteRef.current || syncPushingRef.current) return;

      try {
        const response = await fetchSyncSnapshot();
        if (response.revision > syncRevisionRef.current && response.data) {
          syncRevisionRef.current = response.revision;
          setSyncRevision(response.revision);
          rememberSyncedSnapshot(response.data);
          applySyncSnapshot(response.data);
        }
        if (syncDirtyRef.current && syncSnapshotRef.current && !syncApplyingRemoteRef.current && !isSyncedSnapshot(syncSnapshotRef.current)) {
          syncPushingRef.current = true;
          const deviceId = await getSyncDeviceId();
          const pushed = await pushSyncSnapshot(syncSnapshotRef.current, syncRevisionRef.current, deviceId);
          const syncedSnapshot = pushed.data || syncSnapshotRef.current;
          rememberSyncedSnapshot(syncedSnapshot);
          uploadSnapshotFiles(syncedSnapshot).catch((error) => {
            console.warn('Unable to upload synced files', error);
          });
          syncRevisionRef.current = pushed.revision;
          setSyncRevision(pushed.revision);
          if (pushed.mode === 'merge' && pushed.data) {
            applySyncSnapshot(pushed.data);
          }
          syncDirtyRef.current = false;
          syncPushingRef.current = false;
        }
        setSyncStatus('online');
      } catch (error) {
        console.warn(`Unable to pull common sync from ${getSyncServerUrl()}`, error);
        setSyncStatus('offline');
      } finally {
        if (syncDirtyRef.current) {
          syncPushingRef.current = false;
        }
      }
    }, 8000);

    return () => {
      clearInterval(timer);
    };
  }, [syncReady]);

  useEffect(() => {
    if (!signedInUser) {
      setProfileForm(emptyProfileForm);
      return;
    }

    setProfileForm({
      name: signedInUser.name,
      email: signedInUser.email,
      phone: signedInUser.phone,
    });
  }, [signedInUser]);

  if (!signedInUser) {
    return <LoginScreen userTable={userTable} usersReady={userDatabaseHydrated} onLogin={setSignedInUser} />;
  }

  if (signedInUser.role === 'manager') {
    return (
      <ManagerNonGstBillScreen
        user={signedInUser}
        managerWorkbook={managerWorkbook}
        managerSequence={managerNonGstSequence}
        managerWorkbookReady={managerWorkbookHydrated}
        onWorkbookChange={setManagerWorkbook}
        onSequenceChange={setManagerNonGstSequence}
        syncStatus={syncStatus}
        syncRevision={syncRevision}
        syncServerUrl={getSyncServerUrl()}
        syncDeviceId={syncDeviceId}
        manualSyncAction={manualSyncAction}
        onSendDeviceShare={sendDeviceShareData}
        onReceiveDeviceShare={receiveDeviceShareData}
        onLogout={() => {
          setActiveMenu('dashboard');
          setActiveStep(0);
          setSideMenuOpen(false);
          setSignedInUser(null);
        }}
      />
    );
  }

  function openMenu(menu: AppMenuKey) {
    setActiveMenu(menu);
    setSideMenuOpen(false);
  }

  async function sendDeviceShareData() {
    if (!localDatabasesHydrated || syncPushingRef.current) return;

    try {
      syncDirtyRef.current = true;
      syncPushingRef.current = true;
      setManualSyncAction('send');
      setSyncStatus('syncing');
      const deviceId = syncDeviceId || await getSyncDeviceId();
      if (!syncDeviceId) setSyncDeviceId(deviceId);
      const response = await pushSyncSnapshot(syncSnapshotRef.current || syncSnapshot, syncRevisionRef.current, deviceId);
      const syncedSnapshot = response.data || syncSnapshotRef.current || syncSnapshot;
      rememberSyncedSnapshot(syncedSnapshot);
      uploadSnapshotFiles(syncedSnapshot).catch((error) => {
        console.warn('Unable to upload synced files', error);
      });
      syncRevisionRef.current = response.revision;
      setSyncRevision(response.revision);
      if (response.mode === 'merge' && response.data) {
        applySyncSnapshot(response.data);
      }
      syncDirtyRef.current = false;
      setSyncStatus('online');
      Alert.alert('Data sent', `Sharing revision ${response.revision} is ready.`);
    } catch (error) {
      syncDirtyRef.current = true;
      setSyncStatus('offline');
      Alert.alert('Send failed', error instanceof Error ? error.message : 'Unable to send data.');
    } finally {
      syncPushingRef.current = false;
      setManualSyncAction(null);
    }
  }

  async function receiveDeviceShareData() {
    if (!syncReady || syncPushingRef.current) return;

    try {
      syncPushingRef.current = true;
      setManualSyncAction('receive');
      setSyncStatus('syncing');
      const response = await fetchSyncSnapshot();
      syncRevisionRef.current = response.revision;
      setSyncRevision(response.revision);
      if (response.data) {
        rememberSyncedSnapshot(response.data);
        applySyncSnapshot(response.data);
      }
      syncDirtyRef.current = false;
      setSyncStatus('online');
      Alert.alert('Data received', `Sharing revision ${response.revision} is now on this device.`);
    } catch (error) {
      setSyncStatus('offline');
      Alert.alert('Receive failed', error instanceof Error ? error.message : 'Unable to receive data.');
    } finally {
      syncPushingRef.current = false;
      setManualSyncAction(null);
    }
  }

  function update<K extends keyof InvoiceState>(field: K, value: InvoiceState[K]) {
    setInvoice((current) => ({ ...current, [field]: value }));
  }

  function updateProduct(id: string, field: keyof ProductRow, value: string) {
    setInvoice((current) => ({
      ...current,
      products: current.products.map((row) => {
        if (row.id !== id) return row;
        if (field === 'productKey') {
          const product = products.find((item) => item.key === value);
          return {
            ...row,
            productKey: value,
            hsn: product?.hsn || '',
            price: product?.price || '',
          };
        }
        return { ...row, [field]: value };
      }),
    }));
  }

  function addProduct() {
    setInvoice((current) => {
      const used = new Set(current.products.map((row) => row.productKey));
      const nextProduct = products.find((item) => !used.has(item.key));
      if (!nextProduct) return current;
      return { ...current, products: [...current.products, makeProductRow(nextProduct.key, products)] };
    });
  }

  function removeProduct(id: string) {
    setInvoice((current) => ({
      ...current,
      products: current.products.length === 1 ? current.products : current.products.filter((row) => row.id !== id),
    }));
  }

  function updateClientForm(field: keyof ClientForm, value: string) {
    setClientForm((current) => ({ ...current, [field]: value }));
  }

  function updateSupplierForm(field: keyof SupplierForm, value: string) {
    setSupplierForm((current) => ({ ...current, [field]: value }));
  }

  function updateManagerUserForm(field: keyof ManagerUserForm, value: string) {
    setManagerUserForm((current) => ({ ...current, [field]: value }));
  }

  function updatePasswordForm(field: keyof PasswordForm, value: string) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  }

  function updateProfileForm(field: keyof ProfileForm, value: string) {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  function saveClient() {
    if (!signedInUser) return;
    const name = clientForm.name.trim();
    const address = clientForm.address.trim();
    const gstin = clientForm.gstin.trim();
    const phone = clientForm.phone.trim();
    const normalizedGstin = normalizeClientGstin(gstin);
    const normalizedPhone = normalizeClientPhone(phone);
    const normalizedName = normalizeClientName(name);
    const duplicateClient = clients.find((client) => {
      if (editingClientId && client.id === editingClientId) return false;
      const clientGstin = client.gstin.trim().toLowerCase();
      const clientPhone = normalizeClientPhone(client.phone);
      const clientName = normalizeClientName(client.name);
      const sameGstin = normalizedGstin && normalizedGstin !== 'urp' && clientGstin === normalizedGstin;
      const samePhone = Boolean(normalizedPhone && clientPhone && clientPhone === normalizedPhone);
      const sameNameWithoutIdentifiers = !normalizedGstin && !normalizedPhone && clientName && clientName === normalizedName;
      return sameGstin || samePhone || sameNameWithoutIdentifiers;
    });

    if (!name) {
      Alert.alert('Client required', 'Enter a client name before saving.');
      return;
    }
    if (duplicateClient) {
      Alert.alert('Duplicate client', `${duplicateClient.name} already exists in client list.`);
      return;
    }

    if (editingClientId) {
      setClients((current) =>
        dedupeClientsByIdentity(
          current.map((client) =>
            client.id === editingClientId
              ? {
                  ...client,
                  name,
                  address,
                  gstin,
                  phone,
                  updatedAt: formatDate(new Date()),
                  updatedBy: signedInUser.name,
                  updatedByRole: signedInUser.role,
                }
              : client,
          ),
        ),
      );
      setClientForm(emptyClientForm);
      setEditingClientId(null);
      return;
    }

    const newClient: ClientDocument = {
      id: `client-${Date.now()}`,
      name,
      address,
      gstin,
      phone,
      createdAt: formatDate(new Date()),
      createdBy: signedInUser.name,
      createdByRole: signedInUser.role,
    };

    setClients((current) => dedupeClientsByIdentity([newClient, ...current]));
    setClientForm(emptyClientForm);
  }

  function startEditClient(client: ClientDocument) {
    setEditingClientId(client.id);
    setClientForm({
      name: client.name,
      address: client.address,
      gstin: client.gstin,
      phone: client.phone,
    });
  }

  function cancelEditClient() {
    setEditingClientId(null);
    setClientForm(emptyClientForm);
  }

  function deleteClient(client: ClientDocument) {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can delete clients.');
      return;
    }

    const usedInvoiceCount = savedInvoices.filter((savedInvoice) => {
      const sameGstin = Boolean(client.gstin && client.gstin.toLowerCase() !== 'urp' && savedInvoice.invoice.toGstin.toLowerCase() === client.gstin.toLowerCase());
      const sameName = client.name.trim().toLowerCase() === savedInvoice.invoice.toName.trim().toLowerCase();
      return sameGstin || sameName;
    }).length;
    const invoiceMessage = usedInvoiceCount
      ? `\n\nThis client is used in ${usedInvoiceCount} saved invoice${usedInvoiceCount === 1 ? '' : 's'}. Saved invoices will remain unchanged.`
      : '';

    Alert.alert('Delete client', `Delete ${client.name}?${invoiceMessage}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setClients((current) => current.filter((record) => record.id !== client.id));
          if (editingClientId === client.id) {
            setEditingClientId(null);
            setClientForm(emptyClientForm);
          }
        },
      },
    ]);
  }

  function useClientForInvoice(client: ClientDocument) {
    setInvoice((current) => ({
      ...current,
      toName: client.name,
      toAddress: client.address,
      toGstin: client.gstin,
      toPhone: client.phone,
    }));
    setActiveMenu('invoice');
    setActiveStep(1);
  }

  function startAddSupplier() {
    setEditingSupplierId(null);
    setSupplierSourceFileName('');
    setSupplierForm(emptySupplierForm);
  }

  function startEditSupplier(supplier: SupplierDocument) {
    setEditingSupplierId(supplier.id);
    setSupplierSourceFileName(supplier.sourceFileName || '');
    setSupplierForm({
      name: supplier.name,
      address: supplier.address,
      gstin: supplier.gstin,
      phone: supplier.phone,
      email: supplier.email,
    });
  }

  function cancelEditSupplier() {
    setEditingSupplierId(null);
    setSupplierSourceFileName('');
    setSupplierForm(emptySupplierForm);
  }

  function importSupplierFromPdf(form: SupplierForm, sourceFileName: string) {
    setEditingSupplierId(null);
    setSupplierSourceFileName(sourceFileName);
    setSupplierForm(form);
  }

  function saveSupplier() {
    if (!signedInUser) return;

    const name = supplierForm.name.trim();
    const address = supplierForm.address.trim();
    const gstin = supplierForm.gstin.trim();
    const phone = supplierForm.phone.trim();
    const email = supplierForm.email.trim();
    const normalizedGstin = gstin.toLowerCase();
    const normalizedPhone = phone.replace(/\D/g, '');
    const normalizedEmail = email.toLowerCase();
    const duplicateSupplier = suppliers.find((supplier) => {
      if (editingSupplierId && supplier.id === editingSupplierId) return false;
      const supplierGstin = supplier.gstin.trim().toLowerCase();
      const supplierPhone = supplier.phone.replace(/\D/g, '');
      const supplierEmail = supplier.email.trim().toLowerCase();
      const sameGstin = normalizedGstin && normalizedGstin !== 'urp' && supplierGstin === normalizedGstin;
      const samePhone = normalizedPhone.length >= 6 && supplierPhone === normalizedPhone;
      const sameEmail = normalizedEmail && supplierEmail === normalizedEmail;
      return sameGstin || samePhone || sameEmail;
    });

    if (!name) {
      Alert.alert('Supplier required', 'Enter a supplier name before saving.');
      return;
    }
    if (duplicateSupplier) {
      Alert.alert('Duplicate supplier', `${duplicateSupplier.name} already uses this GSTIN, phone, or email.`);
      return;
    }

    if (editingSupplierId) {
      setSuppliers((current) =>
        current.map((supplier) =>
          supplier.id === editingSupplierId
            ? {
                ...supplier,
                name,
                address,
                gstin,
                phone,
                email,
                sourceFileName: supplierSourceFileName || supplier.sourceFileName,
                updatedAt: formatDate(new Date()),
                updatedBy: signedInUser.name,
                updatedByRole: signedInUser.role,
              }
            : supplier,
        ),
      );
      cancelEditSupplier();
      return;
    }

    const newSupplier: SupplierDocument = {
      id: `supplier-${Date.now()}`,
      name,
      address,
      gstin,
      phone,
      email,
      sourceFileName: supplierSourceFileName || undefined,
      createdAt: formatDate(new Date()),
      createdBy: signedInUser.name,
      createdByRole: signedInUser.role,
    };

    setSuppliers((current) => [newSupplier, ...current]);
    cancelEditSupplier();
  }

  function deleteSupplier(supplier: SupplierDocument) {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can delete suppliers.');
      return;
    }

    Alert.alert('Delete supplier', `Delete ${supplier.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setSuppliers((current) => current.filter((record) => record.id !== supplier.id));
          if (editingSupplierId === supplier.id) {
            cancelEditSupplier();
          }
        },
      },
    ]);
  }

  function saveProduct(product: ProductDocument) {
    if (!signedInUser) return false;

    const label = product.label.trim();
    const hsn = product.hsn.trim();
    const price = product.price.trim();
    const duplicateProduct = products.find((record) => {
      if (record.key === product.key) return false;
      return record.label.trim().toLowerCase() === label.toLowerCase();
    });

    if (!label) {
      Alert.alert('Product required', 'Enter product name before saving.');
      return false;
    }
    if (!hsn) {
      Alert.alert('HSN required', 'Enter HSN / code before saving.');
      return false;
    }
    if (!price || Number.parseFloat(price) <= 0) {
      Alert.alert('Rate required', 'Enter a valid default sales rate.');
      return false;
    }
    if (duplicateProduct) {
      Alert.alert('Duplicate product', `${duplicateProduct.label} already exists in product master.`);
      return false;
    }

    const nextProduct: ProductDocument = {
      ...product,
      label,
      hsn,
      price,
    };
    const exists = products.some((record) => record.key === product.key);
    setProducts((current) =>
      exists
        ? current.map((record) => (record.key === product.key ? nextProduct : record))
        : [nextProduct, ...current],
    );
    return true;
  }

  function deleteProduct(product: ProductDocument) {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can delete products.');
      return;
    }

    const usedInCurrentInvoice = invoice.products.some((row) => row.productKey === product.key);
    const usedInSavedInvoice = savedInvoices.some((savedInvoice) =>
      savedInvoice.invoice.products.some((row) => row.productKey === product.key),
    );
    if (usedInCurrentInvoice || usedInSavedInvoice) {
      Alert.alert('Product in use', `${product.label} is already used in invoices. Edit it instead of deleting.`);
      return;
    }

    Alert.alert('Delete product', `Delete ${product.label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setProducts((current) => current.filter((record) => record.key !== product.key));
        },
      },
    ]);
  }

  function saveEmployee(employee: EmployeeDocument) {
    if (!signedInUser) return false;

    const name = employee.name.trim();
    const role = employee.role.trim();
    const phone = employee.phone.trim();
    const phoneDigits = phone.replace(/\D/g, '');
    const duplicateEmployee = employees.find((record) => {
      if (record.id === employee.id) return false;
      const recordPhone = record.phone.replace(/\D/g, '');
      const samePhone = phoneDigits.length >= 6 && recordPhone === phoneDigits;
      const sameName = record.name.trim().toLowerCase() === name.toLowerCase();
      return samePhone || sameName;
    });

    if (!name) {
      Alert.alert('Employee required', 'Enter employee name before saving.');
      return false;
    }
    if (!role) {
      Alert.alert('Role required', 'Enter employee role before saving.');
      return false;
    }
    if (!employee.baseSalary || employee.baseSalary <= 0) {
      Alert.alert('Salary required', 'Enter a valid salary amount.');
      return false;
    }
    if (duplicateEmployee) {
      Alert.alert('Duplicate employee', `${duplicateEmployee.name} already uses this name or phone number.`);
      return false;
    }

    const nextEmployee: EmployeeDocument = {
      ...employee,
      name,
      role,
      phone,
    };
    const exists = employees.some((record) => record.id === employee.id);
    setEmployees((current) =>
      exists
        ? current.map((record) => (record.id === employee.id ? nextEmployee : record))
        : [nextEmployee, ...current],
    );
    return true;
  }

  function deleteEmployee(employee: EmployeeDocument) {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can delete employee records.');
      return;
    }

    const salaryCount = salaries.filter((salary) => salary.employeeId === employee.id).length;
    const salaryMessage = salaryCount
      ? `\n\n${salaryCount} salary entr${salaryCount === 1 ? 'y' : 'ies'} will remain in the salary ledger for history.`
      : '';

    Alert.alert('Delete employee', `Delete ${employee.name}?${salaryMessage}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setEmployees((current) => current.filter((record) => record.id !== employee.id));
        },
      },
    ]);
  }

  function saveSalary(salary: SalaryDocument) {
    if (!signedInUser) return false;

    if (!salary.employeeName.trim()) {
      Alert.alert('Employee required', 'Select an employee before saving salary.');
      return false;
    }
    if (!salary.period.trim()) {
      Alert.alert('Period required', 'Enter the salary period before saving.');
      return false;
    }
    if (!salary.baseAmount || salary.baseAmount <= 0) {
      Alert.alert('Salary required', 'Enter a valid salary amount.');
      return false;
    }

    const exists = salaries.some((record) => record.id === salary.id);
    setSalaries((current) =>
      exists
        ? current.map((record) => (record.id === salary.id ? salary : record))
        : [salary, ...current],
    );
    return true;
  }

  function deleteSalary(salary: SalaryDocument) {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can delete salary records.');
      return;
    }

    Alert.alert('Delete salary', `Delete ${salary.period} salary for ${salary.employeeName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setSalaries((current) => current.filter((record) => record.id !== salary.id));
        },
      },
    ]);
  }

  function saveExpense(expense: ExpenseDocument) {
    if (!signedInUser) return false;

    if (!expense.category.trim()) {
      Alert.alert('Category required', 'Enter expense category before saving.');
      return false;
    }
    if (!expense.amount || expense.amount <= 0) {
      Alert.alert('Amount required', 'Enter a valid expense amount.');
      return false;
    }

    const exists = expenses.some((record) => record.id === expense.id);
    setExpenses((current) =>
      exists
        ? current.map((record) => (record.id === expense.id ? expense : record))
        : [expense, ...current],
    );
    return true;
  }

  function deleteExpense(expense: ExpenseDocument) {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can delete expense records.');
      return;
    }

    Alert.alert('Delete expense', `Delete ${expense.category} expense?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setExpenses((current) => current.filter((record) => record.id !== expense.id));
        },
      },
    ]);
  }

  function savePayment(payment: PaymentDocument) {
    if (!signedInUser) return false;

    if (!payment.invoiceId || !payment.invoiceNo.trim()) {
      Alert.alert('Invoice required', 'Select an invoice before saving receipt.');
      return false;
    }
    if (!payment.amount || payment.amount <= 0) {
      Alert.alert('Amount required', 'Enter a valid received amount.');
      return false;
    }

    const nextPayment: PaymentDocument = {
      ...payment,
      referenceNo: payment.referenceNo.trim(),
      note: payment.note.trim(),
    };
    const exists = payments.some((record) => record.id === payment.id);
    setPayments((current) =>
      exists
        ? current.map((record) => (record.id === payment.id ? nextPayment : record))
        : [nextPayment, ...current],
    );
    return true;
  }

  function deletePayment(payment: PaymentDocument) {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can delete receipt records.');
      return;
    }

    Alert.alert('Delete receipt', `Delete ${payment.invoiceNo} receipt for ${money(payment.amount)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setPayments((current) => current.filter((record) => record.id !== payment.id));
        },
      },
    ]);
  }

  function saveSupplierPayment(payment: SupplierPaymentDocument) {
    if (!signedInUser) return false;

    if (!payment.purchaseId || !payment.purchaseInvoiceNo.trim()) {
      Alert.alert('Purchase required', 'Select a purchase bill before saving supplier payment.');
      return false;
    }
    if (!payment.amount || payment.amount <= 0) {
      Alert.alert('Amount required', 'Enter a valid paid amount.');
      return false;
    }

    const nextPayment: SupplierPaymentDocument = {
      ...payment,
      referenceNo: payment.referenceNo.trim(),
      note: payment.note.trim(),
    };
    const exists = supplierPayments.some((record) => record.id === payment.id);
    setSupplierPayments((current) =>
      exists
        ? current.map((record) => (record.id === payment.id ? nextPayment : record))
        : [nextPayment, ...current],
    );
    return true;
  }

  function deleteSupplierPayment(payment: SupplierPaymentDocument) {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can delete supplier payment records.');
      return;
    }

    Alert.alert('Delete supplier payment', `Delete ${payment.purchaseInvoiceNo} payment for ${money(payment.amount)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setSupplierPayments((current) => current.filter((record) => record.id !== payment.id));
        },
      },
    ]);
  }

  function savePurchaseFromImport(
    purchaseImport: PurchaseImportResult,
    sourceFileName: string,
    sourceFileUri?: string,
    sourceFileSize?: number,
  ) {
    if (!signedInUser) return false;

    const invoiceNo = purchaseImport.invoiceNo.trim();
    const supplierName = purchaseImport.supplier.name.trim();
    const supplierGstin = purchaseImport.supplier.gstin.trim().toLowerCase();
    const duplicatePurchase = purchases.find((purchase) => {
      const sameInvoiceNo = invoiceNo && purchase.invoiceNo.trim().toLowerCase() === invoiceNo.toLowerCase();
      const sameSupplierGstin = supplierGstin && purchase.supplier.gstin.trim().toLowerCase() === supplierGstin;
      const sameSupplierName = supplierName && normalizeSupplierName(purchase.supplier.name) === normalizeSupplierName(supplierName);
      return sameInvoiceNo && (sameSupplierGstin || sameSupplierName);
    });

    if (!supplierName) {
      Alert.alert('Supplier missing', 'This purchase PDF did not contain a supplier name. Check the PDF and try again.');
      return false;
    }
    if (!invoiceNo) {
      Alert.alert('Invoice number missing', 'This purchase PDF did not contain a purchase invoice number.');
      return false;
    }
    if (duplicatePurchase) {
      Alert.alert('Purchase already saved', `${duplicatePurchase.invoiceNo} from ${duplicatePurchase.supplier.name} is already in Purchases.`);
      return false;
    }

    const { rawText, warning, ...purchaseData } = purchaseImport;
    const savedPurchase: PurchaseDocument = {
      ...purchaseData,
      id: `purchase-${Date.now()}`,
      sourceFileName,
      sourceFileUri,
      sourceFileSize,
      savedAt: formatDate(new Date()),
      savedBy: signedInUser.name,
      savedByRole: signedInUser.role,
    };

    setPurchases((current) => [savedPurchase, ...current]);
    setSuppliers((current) => upsertSupplierFromPurchase(current, purchaseImport.supplier, sourceFileName, signedInUser.name, signedInUser.role));
    return true;
  }

  function updatePurchase(updatedPurchase: PurchaseDocument) {
    if (!signedInUser) return false;

    const invoiceNo = updatedPurchase.invoiceNo.trim();
    const supplierName = updatedPurchase.supplier.name.trim();
    const supplierGstin = updatedPurchase.supplier.gstin.trim().toLowerCase();
    const duplicatePurchase = purchases.find((purchase) => {
      if (purchase.id === updatedPurchase.id) return false;
      const sameInvoiceNo = invoiceNo && purchase.invoiceNo.trim().toLowerCase() === invoiceNo.toLowerCase();
      const sameSupplierGstin = supplierGstin && purchase.supplier.gstin.trim().toLowerCase() === supplierGstin;
      const sameSupplierName = supplierName && normalizeSupplierName(purchase.supplier.name) === normalizeSupplierName(supplierName);
      return sameInvoiceNo && (sameSupplierGstin || sameSupplierName);
    });

    if (!supplierName) {
      Alert.alert('Supplier required', 'Enter supplier name before updating this purchase.');
      return false;
    }
    if (!invoiceNo) {
      Alert.alert('Invoice number required', 'Enter purchase invoice number before updating.');
      return false;
    }
    if (!updatedPurchase.totalAmount || updatedPurchase.totalAmount <= 0) {
      Alert.alert('Total required', 'Enter a valid purchase total before updating.');
      return false;
    }
    if (duplicatePurchase) {
      Alert.alert('Duplicate purchase', `${duplicatePurchase.invoiceNo} from ${duplicatePurchase.supplier.name} is already in Purchases.`);
      return false;
    }

    const nextPurchase: PurchaseDocument = {
      ...updatedPurchase,
      invoiceNo,
      supplier: {
        name: supplierName,
        address: updatedPurchase.supplier.address.trim(),
        gstin: updatedPurchase.supplier.gstin.trim(),
        phone: updatedPurchase.supplier.phone.trim(),
        email: updatedPurchase.supplier.email.trim(),
      },
      updatedAt: formatDate(new Date()),
      updatedBy: signedInUser.name,
      updatedByRole: signedInUser.role,
    };

    setPurchases((current) => current.map((purchase) => (purchase.id === nextPurchase.id ? nextPurchase : purchase)));
    setSuppliers((current) =>
      upsertSupplierFromPurchase(current, nextPurchase.supplier, nextPurchase.sourceFileName, signedInUser.name, signedInUser.role),
    );
    return true;
  }

  function deletePurchase(purchase: PurchaseDocument) {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can delete purchase records.');
      return;
    }

    Alert.alert('Delete purchase', `Delete ${purchase.invoiceNo} from ${purchase.supplier.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setPurchases((current) => current.filter((record) => record.id !== purchase.id));
        },
      },
    ]);
  }

  function saveManagerUser() {
    if (!signedInUser || signedInUser.role !== 'admin') {
      Alert.alert('Admin only', 'Only admin users can add manager accounts.');
      return;
    }

    const name = managerUserForm.name.trim();
    const username = managerUserForm.username.trim();
    const email = managerUserForm.email.trim();
    const phone = managerUserForm.phone.trim();
    const password = managerUserForm.password.trim();
    const confirmPassword = managerUserForm.confirmPassword.trim();

    if (!name || !username || !email || !password) {
      Alert.alert('Manager details required', 'Enter name, username, email, and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters for the manager password.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Manager password and confirm password must match.');
      return;
    }

    const usernameExists = users.some((user) => user.username.toLowerCase() === username.toLowerCase());
    const emailExists = users.some((user) => user.email.toLowerCase() === email.toLowerCase());
    if (usernameExists || emailExists) {
      Alert.alert('User already exists', usernameExists ? 'This username is already used.' : 'This email is already used.');
      return;
    }

    const newManager: UserDocument = {
      id: `manager-${Date.now()}`,
      collection: 'manager_users',
      username,
      email,
      phone,
      name,
      role: 'manager',
      status: 'active',
      password,
      createdAt: formatDate(new Date()),
      createdBy: signedInUser.name,
    };

    setUserTable((current) => ({
      ...current,
      manager_users: {
        [newManager.id]: newManager,
        ...current.manager_users,
      },
    }));
    setManagerUserForm(emptyManagerUserForm);
    Alert.alert('Manager added', `${newManager.name} can now sign in with username ${newManager.username}.`);
  }

  function changePassword() {
    if (!signedInUser) return;

    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();
    const currentUser = userTable[signedInUser.collection][signedInUser.id];

    if (!currentUser) {
      Alert.alert('User not found', 'Sign out and sign in again before changing password.');
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Password required', 'Enter current password, new password, and confirmation.');
      return;
    }
    if (currentUser.password !== currentPassword) {
      Alert.alert('Wrong password', 'Current password is not correct.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters for the new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Password mismatch', 'New password and confirm password must match.');
      return;
    }

    const updatedUser: UserDocument = { ...currentUser, password: newPassword };
    setUserTable((current) => ({
      ...current,
      [signedInUser.collection]: {
        ...current[signedInUser.collection],
        [signedInUser.id]: updatedUser,
      },
    }));
    setSignedInUser(toAuthenticatedUser(updatedUser));
    setPasswordForm(emptyPasswordForm);
    Alert.alert('Password changed', 'Your password has been updated.');
  }

  function saveProfile() {
    if (!signedInUser) return;

    const name = profileForm.name.trim();
    const email = profileForm.email.trim();
    const phone = profileForm.phone.trim();
    const currentUser = userTable[signedInUser.collection][signedInUser.id];

    if (!currentUser) {
      Alert.alert('User not found', 'Sign out and sign in again before updating your profile.');
      return;
    }
    if (!name || !email) {
      Alert.alert('Profile required', 'Name and email are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    const duplicateEmail = users.some(
      (record) => record.id !== signedInUser.id && record.email.trim().toLowerCase() === email.toLowerCase(),
    );
    if (duplicateEmail) {
      Alert.alert('Email already used', 'Another user already uses this email address.');
      return;
    }

    const updatedUser: UserDocument = {
      ...currentUser,
      name,
      email,
      phone,
    };

    setUserTable((current) => ({
      ...current,
      [signedInUser.collection]: {
        ...current[signedInUser.collection],
        [signedInUser.id]: updatedUser,
      },
    }));
    setSignedInUser(toAuthenticatedUser(updatedUser));
    setProfileForm({ name, email, phone });
    Alert.alert('Profile updated', 'Your account profile has been updated.');
  }

  function startNewInvoice() {
    setEditingInvoiceId(null);
    setPreviewingInvoiceId(null);
    setInvoice(makeInvoiceState(formatInvoiceNumber(nextInvoiceSequence), products));
    setActiveMenu('invoice');
    setActiveStep(0);
  }

  function saveInvoiceAndPrepareNext(status: SavedInvoiceDocument['status']) {
    if (!signedInUser) return;

    if (editingInvoiceId) {
      const updatedAt = formatDate(new Date());
      setSavedInvoices((current) =>
        sortSavedInvoicesByInvoiceDate(
          current.map((savedInvoice) =>
            savedInvoice.id === editingInvoiceId
              ? {
                  ...savedInvoice,
                  invoiceNo: invoice.invoiceNo,
                  invoice: { ...invoice },
                  totals,
                  savedAt: updatedAt,
                  savedBy: signedInUser.name,
                  savedByRole: signedInUser.role,
                  status,
                }
              : savedInvoice,
          ),
        ),
      );
      setClients((current) => upsertClientFromInvoice(current, invoice, signedInUser.name, signedInUser.role));
      setEditingInvoiceId(null);
      setInvoice(makeInvoiceState(formatInvoiceNumber(nextInvoiceSequence), products));
      setActiveMenu('invoices');
      setActiveStep(0);
      Alert.alert('Invoice updated', `${invoice.invoiceNo} updated and returned to the invoice list.`);
      return;
    }

    const resolvedNextSequence = getNextInvoiceSequenceFromInvoices(savedInvoices, nextInvoiceSequence);
    const draftSequence = getInvoiceSequenceNumber(invoice.invoiceNo);
    const currentInvoiceNo = draftSequence > 0 && draftSequence < resolvedNextSequence ? formatInvoiceNumber(resolvedNextSequence) : invoice.invoiceNo;
    const invoiceToSave = currentInvoiceNo === invoice.invoiceNo ? invoice : { ...invoice, invoiceNo: currentInvoiceNo };
    const nextSequence = Math.max(resolvedNextSequence, getInvoiceSequenceNumber(currentInvoiceNo) + 1);
    const nextInvoiceNo = formatInvoiceNumber(nextSequence);
    const savedInvoice: SavedInvoiceDocument = {
      id: `invoice-${Date.now()}`,
      invoiceNo: currentInvoiceNo,
      invoice: { ...invoiceToSave },
      totals,
      savedAt: formatDate(new Date()),
      savedBy: signedInUser.name,
      savedByRole: signedInUser.role,
      status,
    };

    setSavedInvoices((current) => sortSavedInvoicesByInvoiceDate([savedInvoice, ...current]));
    setClients((current) => upsertClientFromInvoice(current, invoice, signedInUser.name, signedInUser.role));
    setNextInvoiceSequence(nextSequence);
    setInvoice(makeInvoiceState(nextInvoiceNo, products));
    setActiveMenu('invoices');
    setActiveStep(0);
    Alert.alert('Invoice saved', `${currentInvoiceNo} saved. Next invoice is ${nextInvoiceNo}.`);
  }

  function previewSavedInvoice(savedInvoice: SavedInvoiceDocument) {
    setPreviewingInvoiceId((current) => (current === savedInvoice.id ? null : savedInvoice.id));
    setActiveMenu('invoices');
  }

  function editSavedInvoice(savedInvoice: SavedInvoiceDocument) {
    setInvoice({ ...savedInvoice.invoice });
    setEditingInvoiceId(savedInvoice.id);
    setPreviewingInvoiceId(null);
    setActiveMenu('invoice');
    setActiveStep(0);
  }

  function deleteSavedInvoice(savedInvoice: SavedInvoiceDocument) {
    Alert.alert('Delete invoice', `Delete ${savedInvoice.invoiceNo}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setSavedInvoices((current) => current.filter((record) => record.id !== savedInvoice.id));
          setPreviewingInvoiceId((current) => (current === savedInvoice.id ? null : current));
          if (editingInvoiceId === savedInvoice.id) {
            setEditingInvoiceId(null);
            setInvoice(makeInvoiceState(formatInvoiceNumber(nextInvoiceSequence), products));
            setActiveStep(0);
          }
        },
      },
    ]);
  }

  function updateSavedInvoiceStatus(savedInvoiceId: string, status: SavedInvoiceDocument['status']) {
    setSavedInvoices((current) =>
      current.map((record) => (record.id === savedInvoiceId ? { ...record, status } : record)),
    );
  }

  async function printSavedInvoice(savedInvoice: SavedInvoiceDocument) {
    try {
      const html = await buildPrintableHtml(savedInvoice.invoice, savedInvoice.totals);
      await Print.printAsync({ html });
      updateSavedInvoiceStatus(savedInvoice.id, 'printed');
    } catch (error) {
      Alert.alert('Print failed', error instanceof Error ? error.message : 'Unable to open print preview.');
    }
  }

  async function shareSavedInvoice(savedInvoice: SavedInvoiceDocument) {
    try {
      const html = await buildPrintableHtml(savedInvoice.invoice, savedInvoice.totals);
      const result = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Share invoice PDF' });
      } else {
        Alert.alert('PDF created', result.uri);
      }
      updateSavedInvoiceStatus(savedInvoice.id, 'shared');
    } catch (error) {
      Alert.alert('Share failed', error instanceof Error ? error.message : 'Unable to create PDF.');
    }
  }

  async function printInvoice() {
    try {
      const html = await buildPrintableHtml(invoice, totals);
      await Print.printAsync({ html });
      saveInvoiceAndPrepareNext('printed');
    } catch (error) {
      Alert.alert('Print failed', error instanceof Error ? error.message : 'Unable to open print preview.');
    }
  }

  async function shareInvoice() {
    try {
      const html = await buildPrintableHtml(invoice, totals);
      const result = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Share invoice PDF' });
      } else {
        Alert.alert('PDF created', result.uri);
      }
      saveInvoiceAndPrepareNext('shared');
    } catch (error) {
      Alert.alert('Share failed', error instanceof Error ? error.message : 'Unable to create PDF.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable style={styles.menuButton} onPress={() => setSideMenuOpen(true)}>
            <MaterialCommunityIcons name="menu" size={24} color="#ffffff" />
          </Pressable>
          <Image source={logo} style={styles.headerLogo} />
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>LUCKY TRADERS</Text>
            <Text style={styles.signedInLine} numberOfLines={1}>{signedInUser.name} - {signedInUser.role.toUpperCase()}</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={[
              styles.syncStatusBadge,
              syncStatus === 'online' && styles.syncStatusBadgeOnline,
              syncStatus === 'offline' && styles.syncStatusBadgeOffline,
            ]}>
              <MaterialCommunityIcons
                name={syncStatus === 'offline' ? 'cloud-off-outline' : 'cloud-sync-outline'}
                size={16}
                color={syncStatus === 'offline' ? '#fda29b' : '#9bd7ca'}
              />
              <Text style={styles.syncStatusText} numberOfLines={1}>
                {syncStatus === 'online' ? `Sync ${syncRevision}` : syncStatus}
              </Text>
            </View>
            <Pressable
              style={styles.logoutButton}
              onPress={() => {
                setActiveMenu('dashboard');
                setActiveStep(0);
                setSideMenuOpen(false);
                setSignedInUser(null);
              }}
            >
              <MaterialCommunityIcons name="logout" size={18} color="#fda29b" />
            </Pressable>
          </View>
        </View>

        {activeMenu === 'invoice' && (
          <View style={styles.stepBar}>
            {sections.map((section, index) => (
              <Pressable
                key={section.key}
                style={[styles.stepButton, activeStep === index && styles.stepButtonActive]}
                onPress={() => setActiveStep(index)}
              >
                <MaterialCommunityIcons name={section.icon} size={18} color={activeStep === index ? '#ffffff' : '#586273'} />
                <Text style={[styles.stepButtonText, activeStep === index && styles.stepButtonTextActive]} numberOfLines={1}>
                  {section.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
          {activeMenu === 'dashboard' && (
            <DashboardScreen
              user={signedInUser}
              clients={clients}
              suppliers={suppliers}
              products={products}
              purchases={purchases}
              employees={employees}
              salaries={salaries}
              expenses={expenses}
              payments={payments}
              supplierPayments={supplierPayments}
              savedInvoices={savedInvoices}
              onOpenClients={() => setActiveMenu('clients')}
              onOpenInvoice={() => setActiveMenu('invoices')}
              onOpenPurchases={() => setActiveMenu('purchases')}
              onOpenPayments={() => setActiveMenu('payments')}
              onOpenSupplierPayments={() => setActiveMenu('supplierPayments')}
              onOpenExpenses={() => setActiveMenu('expenses')}
              onOpenEmployees={() => setActiveMenu('employees')}
              onOpenSuppliers={() => setActiveMenu('suppliers')}
              onOpenInventory={() => setActiveMenu('inventory')}
              onOpenDocuments={() => setActiveMenu('documents')}
              onOpenGstFiling={() => setActiveMenu('gstFiling')}
              onOpenReports={() => setActiveMenu('reports')}
            />
          )}
          {activeMenu === 'clients' && (
            <ClientsScreen
              user={signedInUser}
              clients={clients}
              savedInvoices={savedInvoices}
              clientForm={clientForm}
              editingClientId={editingClientId}
              updateClientForm={updateClientForm}
              saveClient={saveClient}
              startEditClient={startEditClient}
              cancelEditClient={cancelEditClient}
              useClientForInvoice={useClientForInvoice}
              deleteClient={deleteClient}
            />
          )}
          {activeMenu === 'suppliers' && (
            <SuppliersScreen
              user={signedInUser}
              suppliers={suppliers}
              supplierForm={supplierForm}
              editingSupplierId={editingSupplierId}
              supplierSourceFileName={supplierSourceFileName}
              startAddSupplier={startAddSupplier}
              updateSupplierForm={updateSupplierForm}
              saveSupplier={saveSupplier}
              startEditSupplier={startEditSupplier}
              cancelEditSupplier={cancelEditSupplier}
              deleteSupplier={deleteSupplier}
              importSupplierFromPdf={importSupplierFromPdf}
            />
          )}
          {activeMenu === 'purchases' && (
            <PurchasesScreen
              user={signedInUser}
              purchases={purchases}
              savePurchaseFromImport={savePurchaseFromImport}
              updatePurchase={updatePurchase}
              deletePurchase={deletePurchase}
            />
          )}
          {activeMenu === 'inventory' && (
            <InventoryScreen
              user={signedInUser}
              products={products}
              purchases={purchases}
              savedInvoices={savedInvoices}
              saveProduct={saveProduct}
              deleteProduct={deleteProduct}
            />
          )}
          {activeMenu === 'supplierPayments' && (
            <SupplierPaymentsScreen
              user={signedInUser}
              purchases={purchases}
              supplierPayments={supplierPayments}
              saveSupplierPayment={saveSupplierPayment}
              deleteSupplierPayment={deleteSupplierPayment}
            />
          )}
          {activeMenu === 'invoice' && activeStep === 0 && <InvoiceSection invoice={invoice} update={update} />}
          {activeMenu === 'invoice' && editingInvoiceId ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Editing saved invoice {invoice.invoiceNo}</Text>
            </View>
          ) : null}
          {activeMenu === 'invoice' && activeStep === 1 && (
            <CustomerSection invoice={invoice} update={update} clients={clients} useClientForInvoice={useClientForInvoice} />
          )}
          {activeMenu === 'invoice' && activeStep === 2 && (
            <ItemsSection
              invoice={invoice}
              update={update}
              updateProduct={updateProduct}
              addProduct={addProduct}
              removeProduct={removeProduct}
              products={products}
            />
          )}
          {activeMenu === 'invoice' && activeStep === 3 && <EwaySection invoice={invoice} update={update} />}
          {activeMenu === 'invoice' && activeStep === 4 && (
            <PreviewSection
              invoice={invoice}
              totals={totals}
              isEditing={Boolean(editingInvoiceId)}
              onSave={() => saveInvoiceAndPrepareNext('saved')}
              onPrint={printInvoice}
              onShare={shareInvoice}
            />
          )}
          {activeMenu === 'invoices' && (
            <InvoicesScreen
              savedInvoices={savedInvoices}
              previewingInvoiceId={previewingInvoiceId}
              previewSavedInvoice={previewSavedInvoice}
              editSavedInvoice={editSavedInvoice}
              deleteSavedInvoice={deleteSavedInvoice}
              printSavedInvoice={printSavedInvoice}
              shareSavedInvoice={shareSavedInvoice}
              addInvoice={startNewInvoice}
            />
          )}
          {activeMenu === 'payments' && (
            <PaymentsScreen
              user={signedInUser}
              savedInvoices={savedInvoices}
              payments={payments}
              savePayment={savePayment}
              deletePayment={deletePayment}
            />
          )}
          {activeMenu === 'reports' && (
            <ReportsScreen
              savedInvoices={savedInvoices}
              purchases={purchases}
              expenses={expenses}
              payments={payments}
              supplierPayments={supplierPayments}
            />
          )}
          {activeMenu === 'gstFiling' && (
            <GstFilingScreen
              savedInvoices={savedInvoices}
              purchases={purchases}
              expenses={expenses}
            />
          )}
          {activeMenu === 'documents' && (
            <DocumentsScreen
              savedInvoices={savedInvoices}
              purchases={purchases}
              expenses={expenses}
              employees={employees}
              salaries={salaries}
            />
          )}
          {activeMenu === 'expenses' && (
            <ExpensesScreen
              user={signedInUser}
              expenses={expenses}
              saveExpense={saveExpense}
              deleteExpense={deleteExpense}
            />
          )}
          {activeMenu === 'employees' && (
            <EmployeesScreen
              user={signedInUser}
              employees={employees}
              salaries={salaries}
              saveEmployee={saveEmployee}
              deleteEmployee={deleteEmployee}
              saveSalary={saveSalary}
              deleteSalary={deleteSalary}
            />
          )}
          {activeMenu === 'users' && (
            <UsersScreen
              user={signedInUser}
              users={users}
              managerUserForm={managerUserForm}
              updateManagerUserForm={updateManagerUserForm}
              saveManagerUser={saveManagerUser}
            />
          )}
          {activeMenu === 'deviceSharing' && (
            <DeviceSharingScreen
              status={syncStatus}
              revision={syncRevision}
              serverUrl={getSyncServerUrl()}
              deviceId={syncDeviceId}
              busyAction={manualSyncAction}
              onSend={sendDeviceShareData}
              onReceive={receiveDeviceShareData}
              counts={[
                { label: 'Clients', value: clients.length },
                { label: 'Suppliers', value: suppliers.length },
                { label: 'Products', value: products.length },
                { label: 'Purchases', value: purchases.length },
                { label: 'Invoices', value: savedInvoices.length },
                { label: 'Payments', value: payments.length },
                { label: 'Expenses', value: expenses.length },
                { label: 'Employees', value: employees.length },
              ]}
            />
          )}
          {activeMenu === 'account' && (
            <AccountScreen
              user={signedInUser}
              clients={clients}
              savedInvoices={savedInvoices}
              users={users}
              profileForm={profileForm}
              passwordForm={passwordForm}
              updateProfileForm={updateProfileForm}
              updatePasswordForm={updatePasswordForm}
              saveProfile={saveProfile}
              changePassword={changePassword}
            />
          )}
        </ScrollView>

        {activeMenu === 'invoice' && (
          <View style={styles.footerNav}>
            <Pressable
              style={[styles.navButton, activeStep === 0 && styles.navButtonDisabled]}
              onPress={() => setActiveStep((current) => Math.max(0, current - 1))}
              disabled={activeStep === 0}
            >
              <MaterialCommunityIcons name="arrow-left" size={18} color="#374153" />
              <Text style={styles.navButtonText}>Previous</Text>
            </Pressable>
            <Pressable
              style={styles.primaryNavButton}
              onPress={() => {
                if (activeStep === 3 && !invoice.hasEway) {
                  setActiveStep(4);
                  return;
                }
                setActiveStep((current) => Math.min(sections.length - 1, current + 1));
              }}
            >
              <Text style={styles.primaryNavText}>{activeStep === sections.length - 1 ? 'Done' : 'Next'}</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#ffffff" />
            </Pressable>
          </View>
        )}

        {sideMenuOpen ? (
          <View style={styles.sideMenuLayer}>
            <Pressable style={styles.sideMenuBackdrop} onPress={() => setSideMenuOpen(false)} />
            <View style={styles.sideMenuPanel}>
              <View style={styles.sideMenuHeader}>
                <Image source={logo} style={styles.sideMenuLogo} />
                <View style={styles.quickActionText}>
                  <Text style={styles.sideMenuKicker}>LUCKY TRADERS</Text>
                  <Text style={styles.sideMenuTitle}>{signedInUser.name}</Text>
                  <Text style={styles.sideMenuRole}>{signedInUser.role.toUpperCase()}</Text>
                </View>
                <Pressable style={styles.sideMenuClose} onPress={() => setSideMenuOpen(false)}>
                  <MaterialCommunityIcons name="close" size={20} color="#ffffff" />
                </Pressable>
              </View>

              <ScrollView style={styles.sideMenuScroll} contentContainerStyle={styles.sideMenuScrollContent} showsVerticalScrollIndicator>
                <View style={styles.sideMenuItems}>
                  {visibleAppMenus.map((menu) => {
                    const selected = activeMenu === menu.key || (activeMenu === 'invoice' && menu.key === 'invoices');
                    return (
                      <Pressable
                        key={menu.key}
                        style={[styles.sideMenuItem, selected && styles.sideMenuItemActive]}
                        onPress={() => openMenu(menu.key)}
                      >
                        <MaterialCommunityIcons name={menu.icon} size={22} color={selected ? '#ffffff' : '#516071'} />
                        <Text style={[styles.sideMenuItemText, selected && styles.sideMenuItemTextActive]}>{menu.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <Pressable
                style={styles.sideMenuLogout}
                onPress={() => {
                  setActiveMenu('dashboard');
                  setActiveStep(0);
                  setSideMenuOpen(false);
                  setSignedInUser(null);
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
