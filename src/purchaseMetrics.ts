import type { PurchaseItem } from './nosqlPurchaseTable';

type PurchaseQtyItem = Pick<PurchaseItem, 'qty' | 'uom'>;
type PurchaseRateItem = Pick<PurchaseItem, 'rate' | 'uom'>;

export function isTonneUnit(uom: string) {
  const normalized = uom.toLowerCase().replace(/[^a-z]/g, '');
  return ['mt', 'mts', 'metricton', 'metrictons', 'ton', 'tons', 'tonne', 'tonnes'].includes(normalized);
}

export function isKgUnit(uom: string) {
  const normalized = uom.toLowerCase().replace(/[^a-z]/g, '');
  return ['kg', 'kgs', 'kilogram', 'kilograms'].includes(normalized);
}

export function purchaseItemQtyKg(item: PurchaseQtyItem) {
  if (!Number.isFinite(item.qty)) return 0;
  return isTonneUnit(item.uom) ? item.qty * 1000 : item.qty;
}

export function purchaseItemRatePerKg(item: PurchaseRateItem) {
  if (!Number.isFinite(item.rate)) return 0;
  return isTonneUnit(item.uom) ? item.rate / 1000 : item.rate;
}

export function purchaseItemUomForDisplay(item: Pick<PurchaseItem, 'uom'>) {
  if (isTonneUnit(item.uom) || isKgUnit(item.uom) || !item.uom.trim()) return 'Kg';
  return item.uom.trim();
}

export function purchaseQtyKg(purchase: { items: PurchaseQtyItem[] }) {
  return purchase.items.reduce((sum, item) => sum + purchaseItemQtyKg(item), 0);
}
