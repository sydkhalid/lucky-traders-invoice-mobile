import type { SupplierForm } from './nosqlSupplierTable';

export type PurchaseItem = {
  description: string;
  hsn: string;
  qty: number;
  uom: string;
  rate: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
};

export type PurchaseDocument = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  supplier: SupplierForm;
  items: PurchaseItem[];
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  roundOff: number;
  totalAmount: number;
  ewayBillNo: string;
  vehicleNo: string;
  sourceFileName: string;
  sourceFileUri?: string;
  sourceFileSize?: number;
  savedAt: string;
  savedBy: string;
  savedByRole: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
};

export type PurchaseImportResult = Omit<PurchaseDocument, 'id' | 'sourceFileName' | 'sourceFileUri' | 'sourceFileSize' | 'savedAt' | 'savedBy' | 'savedByRole'> & {
  rawText: string;
  warning?: string;
};

export const seedPurchaseDocuments: PurchaseDocument[] = [];
