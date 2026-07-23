import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Card, Field } from '../components/common';
import { GST_RATE, formatDate, money, numberFormat } from '../invoiceCore';
import type { ProductDocument, ProductForm } from '../nosqlProductTable';
import type { PurchaseDocument, PurchaseItem } from '../nosqlPurchaseTable';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { purchaseItemQtyKg, purchaseItemRatePerKg } from '../purchaseMetrics';
import { styles } from '../styles';
import type { InvoiceRow, SavedInvoiceDocument } from '../types';

const INVENTORY_ROWS_PER_PAGE = 10;
const LOW_STOCK_KG = 1000;

type StockFilter = 'all' | 'inStock' | 'low' | 'negative' | 'recent';

type InventoryRow = {
  key: string;
  label: string;
  hsn: string;
  inProductMaster: boolean;
  purchaseQty: number;
  purchaseValue: number;
  soldQty: number;
  soldValue: number;
  stockLeft: number;
  averageCost: number;
  stockValue: number;
};

const stockFilters: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'inStock', label: 'In Stock' },
  { key: 'low', label: 'Low Stock' },
  { key: 'negative', label: 'Negative' },
  { key: 'recent', label: 'Recent' },
];

export function InventoryScreen({
  user,
  products,
  purchases,
  savedInvoices,
  saveProduct,
  deleteProduct,
}: {
  user: AuthenticatedUser;
  products: ProductDocument[];
  purchases: PurchaseDocument[];
  savedInvoices: SavedInvoiceDocument[];
  saveProduct: (product: ProductDocument) => boolean;
  deleteProduct: (product: ProductDocument) => void;
}) {
  const [formVisible, setFormVisible] = useState(false);
  const [editingProductKey, setEditingProductKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductForm>(() => makeProductDraft());
  const [expandedProductKey, setExpandedProductKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [page, setPage] = useState(1);

  const stockRows = useMemo(() => buildInventoryRows(products, purchases, savedInvoices), [products, purchases, savedInvoices]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = stockRows.filter((row) => {
      const matchesSearch = !query || [
        row.label,
        row.hsn,
        row.inProductMaster ? 'product master' : 'unmatched',
      ].some((value) => value.toLowerCase().includes(query));
      const matchesFilter =
        filter === 'all' ||
        filter === 'recent' ||
        (filter === 'inStock' && row.stockLeft > 0) ||
        (filter === 'low' && row.stockLeft > 0 && row.stockLeft <= LOW_STOCK_KG) ||
        (filter === 'negative' && row.stockLeft < 0);

      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, INVENTORY_ROWS_PER_PAGE);
    }

    return result;
  }, [filter, search, stockRows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / INVENTORY_ROWS_PER_PAGE));
  const visibleRows = useMemo(() => {
    const start = (page - 1) * INVENTORY_ROWS_PER_PAGE;
    return filteredRows.slice(start, start + INVENTORY_ROWS_PER_PAGE);
  }, [filteredRows, page]);
  const totalPurchaseQty = stockRows.reduce((sum, row) => sum + row.purchaseQty, 0);
  const totalSoldQty = stockRows.reduce((sum, row) => sum + row.soldQty, 0);
  const totalStockLeft = stockRows.reduce((sum, row) => sum + row.stockLeft, 0);
  const totalStockValue = stockRows.reduce((sum, row) => sum + row.stockValue, 0);
  const negativeRows = stockRows.filter((row) => row.stockLeft < 0).length;
  const lowStockRows = stockRows.filter((row) => row.stockLeft > 0 && row.stockLeft <= LOW_STOCK_KG).length;

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  function openAddProduct() {
    setEditingProductKey(null);
    setDraft(makeProductDraft());
    setFormVisible(true);
  }

  function startEditProduct(product: ProductDocument) {
    setEditingProductKey(product.key);
    setExpandedProductKey(product.key);
    setDraft({
      label: product.label,
      hsn: product.hsn,
      price: product.price,
    });
    setFormVisible(true);
  }

  function closeForm() {
    setEditingProductKey(null);
    setDraft(makeProductDraft());
    setFormVisible(false);
  }

  function updateDraft(field: keyof ProductForm, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submitProduct() {
    const label = draft.label.trim();
    const hsn = draft.hsn.trim();
    const price = draft.price.trim();
    const parsedPrice = parseAmount(price);

    if (!label) {
      Alert.alert('Product required', 'Enter product name before saving.');
      return;
    }
    if (!hsn) {
      Alert.alert('HSN required', 'Enter HSN / code before saving.');
      return;
    }
    if (parsedPrice <= 0) {
      Alert.alert('Rate required', 'Enter a valid default rate.');
      return;
    }

    const existing = products.find((product) => product.key === editingProductKey);
    const now = formatDate(new Date());
    const product: ProductDocument = existing
      ? {
          ...existing,
          label,
          hsn,
          price: numberToField(parsedPrice),
          updatedAt: now,
          updatedBy: user.name,
          updatedByRole: user.role,
        }
      : {
          key: makeProductKey(label, products),
          label,
          hsn,
          price: numberToField(parsedPrice),
          createdAt: now,
          createdBy: user.name,
          createdByRole: user.role,
        };

    if (saveProduct(product)) {
      closeForm();
    }
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>INVENTORY</Text>
          <Text style={styles.pageTitle}>Inventory / Stock</Text>
          <Text style={styles.pageSubtitle}>
            {products.length} products | {numberFormat(totalStockLeft)} Kg stock left | {money(totalStockValue)} stock value
          </Text>
        </View>
        <Pressable style={styles.pagePrimaryButton} onPress={openAddProduct}>
          <MaterialCommunityIcons name="package-variant-plus" size={18} color="#ffffff" />
          <Text style={styles.pagePrimaryButtonText}>Add Product</Text>
        </Pressable>
      </View>

      <Card title="Stock summary" icon="warehouse">
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Product master</Text>
            <Text style={styles.statValue}>{products.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Purchase qty</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {numberFormat(totalPurchaseQty)}
            </Text>
            <Text style={styles.reportSubValue}>Kg</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Sold qty</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {numberFormat(totalSoldQty)}
            </Text>
            <Text style={styles.reportSubValue}>Kg</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Stock left</Text>
            <Text
              style={[styles.statValue, totalStockLeft >= 0 ? styles.statValueGreen : styles.statValueRed]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {numberFormat(totalStockLeft)}
            </Text>
            <Text style={styles.reportSubValue}>Kg</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Stock value</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalStockValue)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Alerts</Text>
            <Text style={[styles.statValue, negativeRows > 0 && styles.statValueRed]}>{negativeRows}</Text>
            <Text style={styles.reportSubValue}>{lowStockRows} low stock</Text>
          </View>
        </View>
      </Card>

      {formVisible ? (
        <Card
          title={editingProductKey ? 'Edit product' : 'Add product'}
          icon={editingProductKey ? 'package-variant-closed' : 'package-variant-plus'}
          action={
            <View style={styles.clientFormActions}>
              <Pressable style={styles.cancelEditButton} onPress={closeForm}>
                <MaterialCommunityIcons name="close" size={16} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={submitProduct}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
                <Text style={styles.smallButtonText}>{editingProductKey ? 'Update' : 'Save'}</Text>
              </Pressable>
            </View>
          }
        >
          <Field label="Product Name" value={draft.label} onChangeText={(value) => updateDraft('label', value)} />
          <Field label="HSN / Code" value={draft.hsn} onChangeText={(value) => updateDraft('hsn', value)} />
          <Field label="Default Sales Rate" value={draft.price} onChangeText={(value) => updateDraft('price', value)} keyboardType="decimal-pad" />
        </Card>
      ) : null}

      <Card title="Product master and stock ledger" icon="package-variant-closed">
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search product, HSN, or stock status"
            placeholderTextColor="#98a2b3"
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#98a2b3" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterChipRow}>
          {stockFilters.map((item) => {
            const selected = filter === item.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => setFilter(item.key)}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.listToolbar}>
          <View>
            <Text style={styles.listToolbarTitle}>Stock rows</Text>
            <Text style={styles.listToolbarMeta}>Page {page} of {totalPages}</Text>
          </View>
          <Text style={styles.listCountBadge}>{filteredRows.length} showing</Text>
        </View>

        {filteredRows.length === 0 ? (
          <Text style={styles.mutedText}>No stock rows match this search or filter.</Text>
        ) : (
          <View style={styles.invoiceList}>
            {visibleRows.map((row) => {
              const product = products.find((item) => item.key === row.key);
              return (
                <View style={styles.savedInvoiceCard} key={row.key}>
                  <Pressable
                    style={styles.invoiceCollapsedRow}
                    onPress={() => setExpandedProductKey((current) => (current === row.key ? null : row.key))}
                  >
                    <View style={styles.quickActionText}>
                      <Text style={styles.savedInvoiceNo} numberOfLines={1}>{row.label}</Text>
                      <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                        HSN: {row.hsn || '-'} | Purchase {numberFormat(row.purchaseQty)} Kg | Sold {numberFormat(row.soldQty)} Kg
                      </Text>
                    </View>
                    <View style={styles.savedInvoiceTotalBadge}>
                      <Text style={styles.savedInvoiceStatus}>{row.stockLeft < 0 ? 'NEGATIVE' : row.stockLeft <= LOW_STOCK_KG && row.stockLeft > 0 ? 'LOW' : 'STOCK'}</Text>
                      <Text
                        style={[styles.savedInvoiceTotal, row.stockLeft < 0 && styles.statValueRed]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        {numberFormat(row.stockLeft)}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name={expandedProductKey === row.key ? 'chevron-up' : 'chevron-down'}
                      size={22}
                      color="#667085"
                    />
                  </Pressable>

                  {expandedProductKey === row.key ? (
                    <View style={styles.invoiceExpandedDetails}>
                      <View style={styles.reportGrid}>
                        <View style={styles.reportTile}>
                          <Text style={styles.reportLabel}>Purchase Qty</Text>
                          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                            {numberFormat(row.purchaseQty)}
                          </Text>
                          <Text style={styles.reportSubValue}>Kg</Text>
                        </View>
                        <View style={styles.reportTile}>
                          <Text style={styles.reportLabel}>Sold Qty</Text>
                          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                            {numberFormat(row.soldQty)}
                          </Text>
                          <Text style={styles.reportSubValue}>Kg</Text>
                        </View>
                        <View style={styles.reportTile}>
                          <Text style={styles.reportLabel}>Stock Left</Text>
                          <Text
                            style={[styles.reportValue, row.stockLeft >= 0 ? styles.statValueGreen : styles.statValueRed]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                          >
                            {numberFormat(row.stockLeft)}
                          </Text>
                          <Text style={styles.reportSubValue}>Kg</Text>
                        </View>
                        <View style={styles.reportTile}>
                          <Text style={styles.reportLabel}>Avg Cost</Text>
                          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                            {money(row.averageCost)}
                          </Text>
                          <Text style={styles.reportSubValue}>Per Kg</Text>
                        </View>
                        <View style={styles.reportTile}>
                          <Text style={styles.reportLabel}>Stock Value</Text>
                          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                            {money(row.stockValue)}
                          </Text>
                        </View>
                        <View style={styles.reportTile}>
                          <Text style={styles.reportLabel}>Sold Value</Text>
                          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                            {money(row.soldValue)}
                          </Text>
                          <Text style={styles.reportSubValue}>Without GST</Text>
                        </View>
                      </View>

                      <View style={styles.clientInvoiceList}>
                        <Text style={styles.clientMeta}>Product master: {row.inProductMaster ? 'Yes' : 'No, found from bills'}</Text>
                        <Text style={styles.clientMeta}>HSN / Code: {row.hsn || '-'}</Text>
                        <Text style={styles.clientMeta}>Purchase value: {money(row.purchaseValue)}</Text>
                      </View>

                      {product ? (
                        <View style={styles.invoiceActionRow}>
                          <Pressable style={styles.editClientButton} onPress={() => startEditProduct(product)}>
                            <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                            <Text style={styles.editClientButtonText}>Edit</Text>
                          </Pressable>
                          {user.role === 'admin' ? (
                            <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteProduct(product)}>
                              <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                              <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.paginationBar}>
          <Pressable
            style={[styles.paginationButton, page === 1 && styles.navButtonDisabled]}
            onPress={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
          >
            <MaterialCommunityIcons name="chevron-left" size={18} color="#163a5f" />
            <Text style={styles.paginationButtonText}>Previous</Text>
          </Pressable>
          <Text style={styles.paginationText}>{page} / {totalPages}</Text>
          <Pressable
            style={[styles.paginationButton, page === totalPages && styles.navButtonDisabled]}
            onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
          >
            <Text style={styles.paginationButtonText}>Next</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#163a5f" />
          </Pressable>
        </View>
      </Card>
    </View>
  );
}

function makeProductDraft(): ProductForm {
  return {
    label: '',
    hsn: '',
    price: '',
  };
}

function buildInventoryRows(
  products: ProductDocument[],
  purchases: PurchaseDocument[],
  savedInvoices: SavedInvoiceDocument[],
) {
  const rows = new Map<string, InventoryRow>();

  products.forEach((product) => {
    rows.set(product.key, {
      key: product.key,
      label: product.label,
      hsn: product.hsn,
      inProductMaster: true,
      purchaseQty: 0,
      purchaseValue: 0,
      soldQty: 0,
      soldValue: 0,
      stockLeft: 0,
      averageCost: 0,
      stockValue: 0,
    });
  });

  purchases.forEach((purchase) => {
    purchase.items.forEach((item) => {
      const productKey = findProductKey(products, item.description, item.hsn);
      const row = getOrCreateInventoryRow(rows, productKey, item.description, item.hsn);
      const qty = purchaseItemQtyKg(item);
      const value = getPurchaseItemValue(item);
      row.purchaseQty += qty;
      row.purchaseValue += value;
    });
  });

  savedInvoices.forEach((savedInvoice) => {
    savedInvoice.totals.rows
      .filter((row) => row.kind === 'product')
      .forEach((invoiceRow) => {
        const productKey = findProductKey(products, invoiceRow.description, invoiceRow.hsn);
        const row = getOrCreateInventoryRow(rows, productKey, invoiceRow.description, invoiceRow.hsn);
        row.soldQty += invoiceRow.qty || 0;
        row.soldValue += getInvoiceRowTaxableValue(invoiceRow);
      });
  });

  return Array.from(rows.values())
    .map((row) => {
      const averageCost = row.purchaseQty ? row.purchaseValue / row.purchaseQty : 0;
      const stockLeft = row.purchaseQty - row.soldQty;
      return {
        ...row,
        averageCost,
        stockLeft,
        stockValue: stockLeft > 0 ? stockLeft * averageCost : 0,
      };
    })
    .sort((a, b) => {
      const movementDiff = b.purchaseQty + b.soldQty - (a.purchaseQty + a.soldQty);
      if (movementDiff !== 0) return movementDiff;
      return a.label.localeCompare(b.label);
    });
}

function getOrCreateInventoryRow(
  rows: Map<string, InventoryRow>,
  productKey: string,
  label: string,
  hsn: string,
) {
  const key = productKey || makeUnknownProductKey(label, hsn);
  const existing = rows.get(key);
  if (existing) return existing;

  const row: InventoryRow = {
    key,
    label: label.trim() || 'Unmatched Product',
    hsn: hsn.trim(),
    inProductMaster: false,
    purchaseQty: 0,
    purchaseValue: 0,
    soldQty: 0,
    soldValue: 0,
    stockLeft: 0,
    averageCost: 0,
    stockValue: 0,
  };
  rows.set(key, row);
  return row;
}

function findProductKey(products: ProductDocument[], description: string, hsn: string) {
  const normalizedDescription = normalizeText(description);
  const normalizedHsn = normalizeText(hsn);
  const exactLabelMatch = products.find((product) => normalizeText(product.label) === normalizedDescription);
  if (exactLabelMatch) return exactLabelMatch.key;

  const labelInDescription = products.find((product) => {
    const productLabel = normalizeText(product.label);
    return productLabel && (normalizedDescription.includes(productLabel) || productLabel.includes(normalizedDescription));
  });
  if (labelInDescription) return labelInDescription.key;

  const hsnMatches = products.filter((product) => normalizeText(product.hsn) === normalizedHsn);
  if (hsnMatches.length === 1) return hsnMatches[0].key;

  return '';
}

function getPurchaseItemValue(item: PurchaseItem) {
  const qty = purchaseItemQtyKg(item);
  if (Number.isFinite(item.taxableAmount) && item.taxableAmount > 0) return item.taxableAmount;
  return qty * purchaseItemRatePerKg(item);
}

function getInvoiceRowTaxableValue(row: InvoiceRow) {
  return row.gstMode === 'included' ? row.amount / (1 + GST_RATE) : row.amount;
}

function makeProductKey(label: string, products: ProductDocument[]) {
  const base = normalizeText(label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
  const used = new Set(products.map((product) => product.key));
  if (!used.has(base)) return base;

  let index = 2;
  while (used.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function makeUnknownProductKey(label: string, hsn: string) {
  const base = normalizeText(`${hsn || 'no-hsn'}-${label || 'unmatched'}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `unmatched-${base || 'product'}`;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseAmount(value: string) {
  const amount = Number.parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(amount) ? amount : 0;
}

function numberToField(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return String(Math.max(0, value).toFixed(2));
}
