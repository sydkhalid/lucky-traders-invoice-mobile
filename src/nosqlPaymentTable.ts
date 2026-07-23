export type ReceiptPaymentMode = 'cash' | 'bank' | 'upi' | 'cheque' | 'card';

export type PaymentDocument = {
  id: string;
  invoiceId: string;
  invoiceNo: string;
  invoiceDate: string;
  clientName: string;
  clientGstin: string;
  clientPhone: string;
  invoiceTotal: number;
  paymentDate: string;
  amount: number;
  paymentMode: ReceiptPaymentMode;
  referenceNo: string;
  note: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
};

export const seedPaymentDocuments: PaymentDocument[] = [];
