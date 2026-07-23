import { MaterialCommunityIcons } from '@expo/vector-icons';

export type GstMode = 'excluded' | 'included';
export type GstType = 'split' | 'igst';

export type Product = {
  key: string;
  label: string;
  hsn: string;
  price: string;
};

export type ProductRow = {
  id: string;
  productKey: string;
  hsn: string;
  qty: string;
  price: string;
};

export type InvoiceState = {
  sellerName?: string;
  sellerAddressLines?: string[];
  sellerGstin?: string;
  sellerPhone?: string;
  gstRatePercent?: number;
  invoiceNo: string;
  invoiceDate: string;
  toName: string;
  toAddress: string;
  toGstin: string;
  toPhone: string;
  gstMode: GstMode;
  gstType: GstType;
  products: ProductRow[];
  transportCharge: string;
  transportChargeMode: GstMode;
  loadingCharge: string;
  loadingChargeMode: GstMode;
  hasEway: boolean;
  eway: string;
  ewayDate: string;
  validDate: string;
  driver: string;
  vehicle: string;
  mobile: string;
};

export type InvoiceRow = {
  index: number;
  kind: 'product' | 'charge';
  description: string;
  hsn: string;
  qty: number | null;
  price: number | null;
  amount: number;
  gstMode: GstMode;
  gstRatePercent?: number;
};

export type InvoiceTotals = {
  rows: InvoiceRow[];
  taxable: number;
  gst: number;
  roundOff: number;
  total: number;
};

export type SavedInvoiceDocument = {
  id: string;
  invoiceNo: string;
  invoice: InvoiceState;
  totals: InvoiceTotals;
  savedAt: string;
  savedBy: string;
  savedByRole: string;
  status: 'saved' | 'printed' | 'shared';
};

export type ManagerUserForm = {
  name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

export type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type ProfileForm = {
  name: string;
  email: string;
  phone: string;
};

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type AppMenuKey = 'dashboard' | 'clients' | 'suppliers' | 'purchases' | 'inventory' | 'supplierPayments' | 'invoice' | 'invoices' | 'payments' | 'reports' | 'gstFiling' | 'documents' | 'expenses' | 'employees' | 'users' | 'deviceSharing' | 'account';
