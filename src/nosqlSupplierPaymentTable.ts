export type SupplierPaymentMode = 'cash' | 'bank' | 'upi' | 'cheque' | 'card';

export type SupplierPaymentDocument = {
  id: string;
  purchaseId: string;
  purchaseInvoiceNo: string;
  purchaseDate: string;
  supplierName: string;
  supplierGstin: string;
  supplierPhone: string;
  purchaseTotal: number;
  paymentDate: string;
  amount: number;
  paymentMode: SupplierPaymentMode;
  referenceNo: string;
  note: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
};

export const seedSupplierPaymentDocuments: SupplierPaymentDocument[] = [];
