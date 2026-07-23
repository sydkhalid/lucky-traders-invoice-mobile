export type SupplierDocument = {
  id: string;
  name: string;
  address: string;
  gstin: string;
  phone: string;
  email: string;
  sourceFileName?: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
};

export type SupplierForm = Pick<SupplierDocument, 'name' | 'address' | 'gstin' | 'phone' | 'email'>;

export const seedSupplierDocuments: SupplierDocument[] = [];
