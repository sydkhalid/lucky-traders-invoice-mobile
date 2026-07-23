export type ExpensePaymentMode = 'cash' | 'bank' | 'upi' | 'card';

export type ExpenseDocument = {
  id: string;
  expenseDate: string;
  category: string;
  vendor: string;
  description: string;
  amount: number;
  gstAmount: number;
  paymentMode: ExpensePaymentMode;
  referenceNo: string;
  receiptFileName?: string;
  receiptFileUri?: string;
  receiptFileSize?: number;
  receiptMimeType?: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
};

export const seedExpenseDocuments: ExpenseDocument[] = [];
