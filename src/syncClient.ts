import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import type { ClientDocument } from './nosqlClientTable';
import type { EmployeeDocument, SalaryDocument } from './nosqlEmployeeTable';
import type { ExpenseDocument } from './nosqlExpenseTable';
import type { PaymentDocument } from './nosqlPaymentTable';
import type { ProductDocument } from './nosqlProductTable';
import type { PurchaseDocument } from './nosqlPurchaseTable';
import type { SupplierPaymentDocument } from './nosqlSupplierPaymentTable';
import type { SupplierDocument } from './nosqlSupplierTable';
import type { NoSqlUserTable } from './nosqlUserTable';
import type { ManagerWorkbook } from './screens/ManagerNonGstBillScreen';
import type { SavedInvoiceDocument } from './types';

const SYNC_DEVICE_ID_STORAGE_KEY = 'lucky-traders.syncDeviceId.v1';
const SYNC_FILE_DIR = 'lucky-traders-sync-files';

export type SyncDatabaseSnapshot = {
  userTable: NoSqlUserTable;
  clients: ClientDocument[];
  suppliers: SupplierDocument[];
  products: ProductDocument[];
  purchases: PurchaseDocument[];
  employees: EmployeeDocument[];
  salaries: SalaryDocument[];
  expenses: ExpenseDocument[];
  payments: PaymentDocument[];
  supplierPayments: SupplierPaymentDocument[];
  nextInvoiceSequence: number;
  savedInvoices: SavedInvoiceDocument[];
  managerNonGstSequence: number;
  managerWorkbook: ManagerWorkbook;
};

export type SyncServerResponse = {
  revision: number;
  updatedAt: string;
  mode?: 'empty' | 'replace' | 'merge' | 'read';
  data: SyncDatabaseSnapshot | null;
};

export function getSyncServerUrl() {
  const extra = (Constants.expoConfig?.extra || {}) as { syncServerUrl?: string };
  if (extra.syncServerUrl?.trim()) {
    return extra.syncServerUrl.trim().replace(/\/+$/, '');
  }

  const constants = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  };
  const hostUri =
    constants.expoConfig?.hostUri ||
    constants.manifest2?.extra?.expoClient?.hostUri ||
    constants.manifest?.debuggerHost ||
    '';
  const host = hostUri.split(':')[0];

  return `http://${host || '127.0.0.1'}:8095`;
}

export async function getSyncDeviceId() {
  const stored = await AsyncStorage.getItem(SYNC_DEVICE_ID_STORAGE_KEY);
  if (stored) return stored;

  const deviceId = `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await AsyncStorage.setItem(SYNC_DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

export async function fetchSyncSnapshot() {
  const response = await fetch(`${getSyncServerUrl()}/sync`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Sync server returned ${response.status}.`);
  }

  return (await response.json()) as SyncServerResponse;
}

export async function pushSyncSnapshot(snapshot: SyncDatabaseSnapshot, baseRevision: number, deviceId: string) {
  const response = await fetch(`${getSyncServerUrl()}/sync`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      baseRevision,
      deviceId,
      data: snapshot,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sync server returned ${response.status}.`);
  }

  return (await response.json()) as SyncServerResponse;
}

export async function uploadSnapshotFiles(snapshot: SyncDatabaseSnapshot) {
  const uploads: Promise<unknown>[] = [];

  snapshot.purchases.forEach((purchase) => {
    if (!purchase.sourceFileUri) return;
    uploads.push(uploadSyncFile({
      kind: 'purchase',
      id: purchase.id,
      uri: purchase.sourceFileUri,
      fileName: purchase.sourceFileName || `${purchase.invoiceNo || purchase.id}.pdf`,
      mimeType: 'application/pdf',
    }));
  });

  snapshot.expenses.forEach((expense) => {
    if (!expense.receiptFileUri) return;
    uploads.push(uploadSyncFile({
      kind: 'expense',
      id: expense.id,
      uri: expense.receiptFileUri,
      fileName: expense.receiptFileName || `${expense.category || expense.id}`,
      mimeType: expense.receiptMimeType || 'application/octet-stream',
    }));
  });

  await Promise.allSettled(uploads);
}

export async function hydrateSnapshotFiles(snapshot: SyncDatabaseSnapshot) {
  let changed = false;
  const purchases = await Promise.all(snapshot.purchases.map(async (purchase) => {
    if (!purchase.id || !purchase.sourceFileName) return purchase;
    if (purchase.sourceFileUri && await localFileExists(purchase.sourceFileUri)) return purchase;

    const downloadedUri = await downloadSyncFile('purchase', purchase.id, purchase.sourceFileName);
    if (!downloadedUri) return purchase;

    changed = true;
    return { ...purchase, sourceFileUri: downloadedUri };
  }));
  const expenses = await Promise.all(snapshot.expenses.map(async (expense) => {
    if (!expense.id || !expense.receiptFileName) return expense;
    if (expense.receiptFileUri && await localFileExists(expense.receiptFileUri)) return expense;

    const downloadedUri = await downloadSyncFile('expense', expense.id, expense.receiptFileName);
    if (!downloadedUri) return expense;

    changed = true;
    return { ...expense, receiptFileUri: downloadedUri };
  }));

  return {
    changed,
    snapshot: {
      ...snapshot,
      purchases,
      expenses,
    },
  };
}

async function uploadSyncFile({
  kind,
  id,
  uri,
  fileName,
  mimeType,
}: {
  kind: string;
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
}) {
  if (!(await localFileExists(uri))) return;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const response = await fetch(`${getSyncServerUrl()}/file`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind,
      id,
      fileName,
      mimeType,
      base64,
    }),
  });

  if (!response.ok) {
    throw new Error(`File sync returned ${response.status}.`);
  }
}

async function downloadSyncFile(kind: string, id: string, fallbackFileName: string) {
  try {
    const response = await fetch(`${getSyncServerUrl()}/file?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return '';

    const payload = await response.json() as {
      fileName?: string;
      base64?: string;
    };
    if (!payload.base64) return '';

    const directoryUri = await ensureSyncFileDirectory();
    const fileName = safeFileName(payload.fileName || fallbackFileName || `${kind}-${id}`);
    const targetUri = `${directoryUri}/${kind}-${safeFileName(id)}-${fileName}`;

    await FileSystem.writeAsStringAsync(targetUri, payload.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return targetUri;
  } catch {
    return '';
  }
}

async function ensureSyncFileDirectory() {
  const baseDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDirectory) {
    throw new Error('No local file directory is available for sync files.');
  }

  const directoryUri = `${baseDirectory}${SYNC_FILE_DIR}`;
  const info = await FileSystem.getInfoAsync(directoryUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  }

  return directoryUri;
}

async function localFileExists(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '').slice(0, 160) || 'file';
}
