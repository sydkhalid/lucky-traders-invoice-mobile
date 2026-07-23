import { productCatalog } from './invoiceCore';
import type { Product } from './types';

export type ProductForm = {
  label: string;
  hsn: string;
  price: string;
};

export type ProductDocument = Product & {
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
};

export const seedProductDocuments: ProductDocument[] = productCatalog.map((product) => ({
  ...product,
  createdAt: '14-07-2026',
  createdBy: 'System',
  createdByRole: 'system',
}));
