import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Card, DatePickerField, Field } from '../components/common';
import { money, numberFormat } from '../invoiceCore';
import type { PurchaseDocument, PurchaseImportResult } from '../nosqlPurchaseTable';
import {
  purchaseItemQtyKg as itemQtyForDisplay,
  purchaseItemRatePerKg as itemRateForDisplay,
  purchaseItemUomForDisplay as itemUomForDisplay,
  purchaseQtyKg,
} from '../purchaseMetrics';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { extractPurchaseFromPdfBase64 } from '../purchasePdf';
import { styles } from '../styles';

const PURCHASES_PER_PAGE = 10;
const PURCHASE_REFERENCE_DIR = 'purchase-pdfs';

type PurchaseFilter = 'all' | 'gst' | 'igst' | 'recent';
type PendingPurchase = {
  purchase: PurchaseImportResult;
  sourceFileName: string;
  sourceUri: string;
  sourceFileSize?: number;
};
type PurchaseEditDraft = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  supplierName: string;
  supplierAddress: string;
  supplierGstin: string;
  supplierPhone: string;
  supplierEmail: string;
  itemDescription: string;
  itemHsn: string;
  itemQty: string;
  itemUom: string;
  itemRate: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalGst: string;
  roundOff: string;
  totalAmount: string;
  ewayBillNo: string;
  vehicleNo: string;
};

const purchaseFilters: { key: PurchaseFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gst', label: 'GST' },
  { key: 'igst', label: 'IGST' },
  { key: 'recent', label: 'Recent' },
];

export function PurchasesScreen({
  user,
  purchases,
  savePurchaseFromImport,
  updatePurchase,
  deletePurchase,
}: {
  user: AuthenticatedUser;
  purchases: PurchaseDocument[];
  savePurchaseFromImport: (
    purchase: PurchaseImportResult,
    sourceFileName: string,
    sourceFileUri?: string,
    sourceFileSize?: number,
  ) => boolean;
  updatePurchase: (purchase: PurchaseDocument) => boolean;
  deletePurchase: (purchase: PurchaseDocument) => void;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<PendingPurchase | null>(null);
  const [editingDraft, setEditingDraft] = useState<PurchaseEditDraft | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PurchaseFilter>('all');
  const orderedPurchases = useMemo(() => [...purchases].sort((a, b) => getDateTime(b.invoiceDate) - getDateTime(a.invoiceDate)), [purchases]);
  const filteredPurchases = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = orderedPurchases.filter((purchase) => {
      const productText = purchase.items.map((item) => `${item.description} ${item.hsn}`).join(' ');
      const matchesSearch = !query || [
        purchase.invoiceNo,
        purchase.invoiceDate,
        purchase.supplier.name,
        purchase.supplier.gstin,
        purchase.supplier.phone,
        purchase.sourceFileName,
        productText,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesFilter =
        filter === 'all' ||
        filter === 'recent' ||
        (filter === 'igst' && purchase.igst > 0) ||
        (filter === 'gst' && purchase.totalGst > 0);

      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, PURCHASES_PER_PAGE);
    }

    return result;
  }, [filter, orderedPurchases, search]);
  const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / PURCHASES_PER_PAGE));
  const visiblePurchases = useMemo(() => {
    const start = (currentPage - 1) * PURCHASES_PER_PAGE;
    return filteredPurchases.slice(start, start + PURCHASES_PER_PAGE);
  }, [currentPage, filteredPurchases]);
  const totalPurchaseValue = filteredPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);
  const totalQty = filteredPurchases.reduce((sum, purchase) => sum + purchaseQtyKg(purchase), 0);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  async function importPurchasePdf() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const parsed = extractPurchaseFromPdfBase64(base64, asset.name);
      setPendingPurchase({
        purchase: parsed,
        sourceFileName: asset.name,
        sourceUri: asset.uri,
        sourceFileSize: asset.size,
      });
    } catch (error) {
      Alert.alert('Purchase PDF failed', error instanceof Error ? error.message : 'Unable to read this purchase PDF.');
    }
  }

  async function savePendingPurchase() {
    if (!pendingPurchase) return;

    try {
      const referenceUri = await persistReferencePdf(pendingPurchase.sourceUri, pendingPurchase.sourceFileName);
      const saved = savePurchaseFromImport(
        pendingPurchase.purchase,
        pendingPurchase.sourceFileName,
        referenceUri,
        pendingPurchase.sourceFileSize,
      );

      if (saved) {
        setPendingPurchase(null);
        Alert.alert(
          'Purchase saved',
          `${pendingPurchase.purchase.invoiceNo || pendingPurchase.sourceFileName} was saved with the uploaded PDF reference.`,
        );
      }
    } catch (error) {
      Alert.alert('Reference PDF failed', error instanceof Error ? error.message : 'Unable to save the uploaded PDF reference.');
    }
  }

  async function openReferencePdf(purchase: PurchaseDocument) {
    if (!purchase.sourceFileUri) {
      Alert.alert('No reference PDF', 'This purchase was saved before PDF references were stored.');
      return;
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(purchase.sourceFileUri);
      if (!fileInfo.exists) {
        Alert.alert('Reference missing', 'The saved PDF file is no longer available on this device.');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(purchase.sourceFileUri, {
          mimeType: 'application/pdf',
          dialogTitle: purchase.sourceFileName,
        });
      } else {
        Alert.alert('Reference PDF', purchase.sourceFileUri);
      }
    } catch (error) {
      Alert.alert('Reference failed', error instanceof Error ? error.message : 'Unable to open the reference PDF.');
    }
  }

  function startEditPurchase(purchase: PurchaseDocument) {
    setPendingPurchase(null);
    setEditingDraft(purchaseToDraft(purchase));
    setExpandedPurchaseId(purchase.id);
  }

  function updateEditingDraft(field: keyof PurchaseEditDraft, value: string) {
    setEditingDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function saveEditingPurchase() {
    if (!editingDraft) return;

    const originalPurchase = purchases.find((purchase) => purchase.id === editingDraft.id);
    if (!originalPurchase) {
      Alert.alert('Purchase missing', 'This purchase is no longer available.');
      setEditingDraft(null);
      return;
    }

    const updated = draftToPurchase(editingDraft, originalPurchase);
    if (updatePurchase(updated)) {
      setEditingDraft(null);
      Alert.alert('Purchase updated', `${updated.invoiceNo} has been updated.`);
    }
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>PURCHASE DATABASE</Text>
          <Text style={styles.pageTitle}>Purchases</Text>
          <Text style={styles.pageSubtitle}>
            {purchases.length} saved | {filteredPurchases.length} showing | PDF import
          </Text>
        </View>
        <Pressable style={styles.pagePrimaryButton} onPress={importPurchasePdf}>
          <MaterialCommunityIcons name="file-upload-outline" size={18} color="#ffffff" />
          <Text style={styles.pagePrimaryButtonText}>Upload Purchase</Text>
        </Pressable>
      </View>

      {pendingPurchase ? (
        <PurchaseImportPreview
          pendingPurchase={pendingPurchase}
          onSave={savePendingPurchase}
          onCancel={() => setPendingPurchase(null)}
        />
      ) : null}

      {editingDraft ? (
        <PurchaseEditForm
          draft={editingDraft}
          updateDraft={updateEditingDraft}
          onSave={saveEditingPurchase}
          onCancel={() => setEditingDraft(null)}
        />
      ) : null}

      <Card title="Purchase summary" icon="cart-outline">
        <View style={styles.reportGrid}>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>Purchase value</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalPurchaseValue)}
            </Text>
          </View>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>Purchases</Text>
            <Text style={styles.reportValue}>{filteredPurchases.length}</Text>
          </View>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>Qty (Kg)</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {numberFormat(totalQty)}
            </Text>
          </View>
        </View>
      </Card>

      <Card title="Purchase list" icon="format-list-bulleted-square">
        {purchases.length === 0 ? (
          <Text style={styles.mutedText}>No purchase invoices saved yet. Upload a supplier purchase PDF to start.</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search purchase no, supplier, GSTIN, date, or product"
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
              {purchaseFilters.map((item) => {
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
                <Text style={styles.listToolbarTitle}>Latest purchases</Text>
                <Text style={styles.listToolbarMeta}>Page {currentPage} of {totalPages}</Text>
              </View>
              <Text style={styles.listCountBadge}>{money(totalPurchaseValue)}</Text>
            </View>

            {filteredPurchases.length === 0 ? (
              <Text style={styles.mutedText}>No purchases match this search or filter.</Text>
            ) : (
              <View style={styles.invoiceList}>
                {visiblePurchases.map((purchase) => {
                  const qty = purchaseQtyKg(purchase);
                  return (
                    <View style={styles.savedInvoiceCard} key={purchase.id}>
                      <Pressable
                        style={styles.invoiceCollapsedRow}
                        onPress={() => setExpandedPurchaseId((current) => (current === purchase.id ? null : purchase.id))}
                      >
                        <View style={styles.quickActionText}>
                          <Text style={styles.savedInvoiceNo} numberOfLines={1}>
                            {purchase.invoiceNo || purchase.sourceFileName}
                          </Text>
                          <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                            {purchase.supplier.name}
                          </Text>
                          <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                            Qty (Kg): {numberFormat(qty)}
                          </Text>
                        </View>
                        <View style={styles.savedInvoiceTotalBadge}>
                          <Text style={styles.savedInvoiceStatus}>{purchase.invoiceDate || 'NO DATE'}</Text>
                          <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {money(purchase.totalAmount)}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={expandedPurchaseId === purchase.id ? 'chevron-up' : 'chevron-down'}
                          size={22}
                          color="#667085"
                        />
                      </Pressable>

                      {expandedPurchaseId === purchase.id ? (
                        <View style={styles.invoiceExpandedDetails}>
                          <View style={styles.reportGrid}>
                            <View style={styles.reportTile}>
                              <Text style={styles.reportLabel}>Taxable</Text>
                              <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                                {money(purchase.taxableValue)}
                              </Text>
                            </View>
                            <View style={styles.reportTile}>
                              <Text style={styles.reportLabel}>GST</Text>
                              <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                                {money(purchase.totalGst)}
                              </Text>
                            </View>
                            <View style={styles.reportTile}>
                              <Text style={styles.reportLabel}>Qty (Kg)</Text>
                              <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                {numberFormat(qty)}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.clientInvoiceList}>
                            <Text style={styles.clientMeta}>Supplier: {purchase.supplier.name}</Text>
                            <Text style={styles.clientMeta}>GSTIN: {purchase.supplier.gstin || '-'}</Text>
                            <Text style={styles.clientMeta}>Phone: {purchase.supplier.phone || '-'}</Text>
                            <Text style={styles.clientMeta}>Invoice Date: {purchase.invoiceDate || '-'}</Text>
                            <Text style={styles.clientMeta}>Vehicle: {purchase.vehicleNo || '-'}</Text>
                            <Text style={styles.clientAudit}>Source PDF: {purchase.sourceFileName}</Text>
                            {purchase.sourceFileSize ? <Text style={styles.clientAudit}>File Size: {formatBytes(purchase.sourceFileSize)}</Text> : null}
                          </View>

                          <View style={styles.reportList}>
                            {purchase.items.map((item, index) => (
                              <View style={styles.reportRow} key={`${purchase.id}-${item.hsn}-${index}`}>
                                <View style={styles.quickActionText}>
                                  <Text style={styles.reportRowTitle}>{item.description}</Text>
                                  <Text style={styles.reportRowMeta}>
                                    HSN: {item.hsn || '-'} | Qty: {numberFormat(itemQtyForDisplay(item))} {itemUomForDisplay(item)} | Rate: {numberFormat(itemRateForDisplay(item))}/{itemUomForDisplay(item)}
                                  </Text>
                                </View>
                                <Text style={styles.reportRowAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                  {money(item.totalAmount)}
                                </Text>
                              </View>
                            ))}
                          </View>

                          <View style={styles.invoiceActionRow}>
                            <Pressable
                              style={[styles.invoicePreviewButton, !purchase.sourceFileUri && styles.navButtonDisabled]}
                              onPress={() => openReferencePdf(purchase)}
                              disabled={!purchase.sourceFileUri}
                            >
                              <MaterialCommunityIcons name="file-pdf-box" size={17} color="#163a5f" />
                              <Text style={styles.invoicePreviewButtonText}>Reference PDF</Text>
                            </Pressable>
                            <Pressable style={styles.editClientButton} onPress={() => startEditPurchase(purchase)}>
                              <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                              <Text style={styles.editClientButtonText}>Edit</Text>
                            </Pressable>
                            {user.role === 'admin' ? (
                              <Pressable style={styles.deleteInvoiceButton} onPress={() => deletePurchase(purchase)}>
                                <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                                <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.paginationBar}>
              <Pressable
                style={[styles.paginationButton, currentPage === 1 && styles.navButtonDisabled]}
                onPress={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                <MaterialCommunityIcons name="chevron-left" size={18} color="#163a5f" />
                <Text style={styles.paginationButtonText}>Previous</Text>
              </Pressable>
              <Text style={styles.paginationText}>{currentPage} / {totalPages}</Text>
              <Pressable
                style={[styles.paginationButton, currentPage === totalPages && styles.navButtonDisabled]}
                onPress={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                <Text style={styles.paginationButtonText}>Next</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#163a5f" />
              </Pressable>
            </View>
          </>
        )}
      </Card>
    </View>
  );
}

function PurchaseImportPreview({
  pendingPurchase,
  onSave,
  onCancel,
}: {
  pendingPurchase: PendingPurchase;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { purchase, sourceFileName, sourceFileSize } = pendingPurchase;
  const issues = getPurchaseIssues(purchase);
  const blockingIssues = issues.filter((issue) => issue.kind === 'error');
  const primaryItem = purchase.items[0];

  return (
    <Card
      title="Purchase preview"
      icon="file-eye-outline"
      action={
        <View style={styles.clientFormActions}>
          <Pressable style={styles.cancelEditButton} onPress={onCancel}>
            <MaterialCommunityIcons name="close" size={16} color="#b42318" />
            <Text style={styles.cancelEditButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.smallButton, blockingIssues.length > 0 && styles.navButtonDisabled]}
            onPress={onSave}
            disabled={blockingIssues.length > 0}
          >
            <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
            <Text style={styles.smallButtonText}>Save</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.editingNotice}>
        <MaterialCommunityIcons name="file-pdf-box" size={18} color="#163a5f" />
        <Text style={styles.editingNoticeText} numberOfLines={2}>
          Uploaded PDF: {sourceFileName}{sourceFileSize ? ` (${formatBytes(sourceFileSize)})` : ''}
        </Text>
      </View>

      {issues.length > 0 ? (
        <View style={styles.clientInvoiceList}>
          {issues.map((issue) => (
            <Text key={issue.message} style={issue.kind === 'error' ? styles.loginError : styles.clientAudit}>
              {issue.kind === 'error' ? 'Error: ' : 'Check: '}{issue.message}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.mutedText}>All key fields were read. Check the preview and press Save.</Text>
      )}

      <View style={styles.reportGrid}>
        <View style={styles.reportTile}>
          <Text style={styles.reportLabel}>Invoice No</Text>
          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
            {purchase.invoiceNo || '-'}
          </Text>
        </View>
        <View style={styles.reportTile}>
          <Text style={styles.reportLabel}>Date</Text>
          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {purchase.invoiceDate || '-'}
          </Text>
        </View>
        <View style={styles.reportTile}>
          <Text style={styles.reportLabel}>Total</Text>
          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
            {money(purchase.totalAmount)}
          </Text>
        </View>
      </View>

      <View style={styles.clientInvoiceList}>
        <Text style={styles.clientMeta}>Supplier: {purchase.supplier.name || '-'}</Text>
        <Text style={styles.clientMeta}>GSTIN: {purchase.supplier.gstin || '-'}</Text>
        <Text style={styles.clientMeta}>Phone: {purchase.supplier.phone || '-'}</Text>
        <Text style={styles.clientMeta}>Email: {purchase.supplier.email || '-'}</Text>
        <Text style={styles.clientMeta}>Address: {purchase.supplier.address || '-'}</Text>
      </View>

      <View style={styles.reportGrid}>
        <View style={styles.reportTile}>
          <Text style={styles.reportLabel}>Taxable</Text>
          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
            {money(purchase.taxableValue)}
          </Text>
        </View>
        <View style={styles.reportTile}>
          <Text style={styles.reportLabel}>GST</Text>
          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
            {money(purchase.totalGst)}
          </Text>
        </View>
        <View style={styles.reportTile}>
          <Text style={styles.reportLabel}>Round off</Text>
          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
            {money(purchase.roundOff)}
          </Text>
        </View>
      </View>

      {primaryItem ? (
        <View style={styles.reportRow}>
          <View style={styles.quickActionText}>
            <Text style={styles.reportRowTitle}>{primaryItem.description || '-'}</Text>
            <Text style={styles.reportRowMeta}>
              HSN: {primaryItem.hsn || '-'} | Qty: {numberFormat(itemQtyForDisplay(primaryItem))} {itemUomForDisplay(primaryItem)} | Rate: {numberFormat(itemRateForDisplay(primaryItem))}/{itemUomForDisplay(primaryItem)}
            </Text>
          </View>
          <Text style={styles.reportRowAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {money(primaryItem.totalAmount)}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function PurchaseEditForm({
  draft,
  updateDraft,
  onSave,
  onCancel,
}: {
  draft: PurchaseEditDraft;
  updateDraft: (field: keyof PurchaseEditDraft, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Card
      title="Edit purchase"
      icon="pencil-outline"
      action={
        <View style={styles.clientFormActions}>
          <Pressable style={styles.cancelEditButton} onPress={onCancel}>
            <MaterialCommunityIcons name="close" size={16} color="#b42318" />
            <Text style={styles.cancelEditButtonText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.smallButton} onPress={onSave}>
            <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
            <Text style={styles.smallButtonText}>Update</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.editingNotice}>
        <MaterialCommunityIcons name="pencil-outline" size={18} color="#163a5f" />
        <Text style={styles.editingNoticeText}>Editing purchase {draft.invoiceNo || draft.id}</Text>
      </View>

      <Field label="Purchase Invoice No" value={draft.invoiceNo} onChangeText={(value) => updateDraft('invoiceNo', value)} />
      <DatePickerField label="Purchase Date" value={draft.invoiceDate} onChange={(value) => updateDraft('invoiceDate', value)} />
      <Field label="Supplier Name" value={draft.supplierName} onChangeText={(value) => updateDraft('supplierName', value)} />
      <Field label="Supplier Address" value={draft.supplierAddress} onChangeText={(value) => updateDraft('supplierAddress', value)} multiline />
      <Field label="Supplier GSTIN" value={draft.supplierGstin} onChangeText={(value) => updateDraft('supplierGstin', value)} autoCapitalize="characters" />
      <Field label="Supplier Phone" value={draft.supplierPhone} onChangeText={(value) => updateDraft('supplierPhone', value)} keyboardType="phone-pad" />
      <Field label="Supplier Email" value={draft.supplierEmail} onChangeText={(value) => updateDraft('supplierEmail', value)} autoCapitalize="none" keyboardType="email-address" />

      <View style={styles.clientInvoiceList}>
        <Text style={styles.reportSectionTitle}>Item</Text>
        <Field label="Product" value={draft.itemDescription} onChangeText={(value) => updateDraft('itemDescription', value)} multiline />
        <Field label="HSN" value={draft.itemHsn} onChangeText={(value) => updateDraft('itemHsn', value)} keyboardType="number-pad" />
        <Field label="Qty (Kg)" value={draft.itemQty} onChangeText={(value) => updateDraft('itemQty', value)} keyboardType="decimal-pad" />
        <Field label="UOM" value={draft.itemUom} onChangeText={(value) => updateDraft('itemUom', value)} autoCapitalize="characters" />
        <Field label="Rate" value={draft.itemRate} onChangeText={(value) => updateDraft('itemRate', value)} keyboardType="decimal-pad" />
      </View>

      <View style={styles.clientInvoiceList}>
        <Text style={styles.reportSectionTitle}>Totals</Text>
        <Field label="Taxable Value" value={draft.taxableValue} onChangeText={(value) => updateDraft('taxableValue', value)} keyboardType="decimal-pad" />
        <Field label="CGST" value={draft.cgst} onChangeText={(value) => updateDraft('cgst', value)} keyboardType="decimal-pad" />
        <Field label="SGST" value={draft.sgst} onChangeText={(value) => updateDraft('sgst', value)} keyboardType="decimal-pad" />
        <Field label="IGST" value={draft.igst} onChangeText={(value) => updateDraft('igst', value)} keyboardType="decimal-pad" />
        <Field label="Total GST" value={draft.totalGst} onChangeText={(value) => updateDraft('totalGst', value)} keyboardType="decimal-pad" />
        <Field label="Round Off" value={draft.roundOff} onChangeText={(value) => updateDraft('roundOff', value)} keyboardType="decimal-pad" />
        <Field label="Grand Total" value={draft.totalAmount} onChangeText={(value) => updateDraft('totalAmount', value)} keyboardType="decimal-pad" />
      </View>

      <Field label="E-Way Bill No" value={draft.ewayBillNo} onChangeText={(value) => updateDraft('ewayBillNo', value)} keyboardType="number-pad" />
      <Field label="Vehicle No" value={draft.vehicleNo} onChangeText={(value) => updateDraft('vehicleNo', value)} autoCapitalize="characters" />
    </Card>
  );
}

async function persistReferencePdf(sourceUri: string, sourceFileName: string) {
  const baseDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDirectory) {
    throw new Error('No local storage directory is available for PDF references.');
  }

  const directoryUri = `${baseDirectory}${PURCHASE_REFERENCE_DIR}/`;
  const directoryInfo = await FileSystem.getInfoAsync(directoryUri);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  }

  const targetFileName = `${Date.now()}-${safeFileName(sourceFileName)}`;
  const targetUri = `${directoryUri}${targetFileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
}

function getPurchaseIssues(purchase: PurchaseImportResult) {
  const issues: { kind: 'error' | 'warning'; message: string }[] = [];

  if (!purchase.supplier.name.trim()) issues.push({ kind: 'error', message: 'Supplier name was not read.' });
  if (!purchase.invoiceNo.trim()) issues.push({ kind: 'error', message: 'Purchase invoice number was not read.' });
  if (!purchase.totalAmount || purchase.totalAmount <= 0) issues.push({ kind: 'error', message: 'Total amount was not read.' });
  if (!purchase.invoiceDate.trim()) issues.push({ kind: 'warning', message: 'Invoice date is missing.' });
  if (!purchase.supplier.gstin.trim()) issues.push({ kind: 'warning', message: 'Supplier GSTIN is missing.' });
  if (!purchase.items.length) {
    issues.push({ kind: 'warning', message: 'No item rows were read.' });
  } else {
    const incompleteItem = purchase.items.find((item) => !item.description || !item.hsn || !item.qty || !item.rate);
    if (incompleteItem) issues.push({ kind: 'warning', message: 'One or more item fields need checking.' });
  }
  if (purchase.warning) issues.push({ kind: 'warning', message: purchase.warning });

  return issues;
}

function safeFileName(fileName: string) {
  const cleaned = fileName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'purchase-reference.pdf';
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 KB';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function purchaseToDraft(purchase: PurchaseDocument): PurchaseEditDraft {
  const item = purchase.items[0];

  return {
    id: purchase.id,
    invoiceNo: purchase.invoiceNo,
    invoiceDate: purchase.invoiceDate,
    supplierName: purchase.supplier.name,
    supplierAddress: purchase.supplier.address,
    supplierGstin: purchase.supplier.gstin,
    supplierPhone: purchase.supplier.phone,
    supplierEmail: purchase.supplier.email,
    itemDescription: item?.description || '',
    itemHsn: item?.hsn || '',
    itemQty: numberToField(item ? itemQtyForDisplay(item) : undefined),
    itemUom: item ? itemUomForDisplay(item) : 'Kg',
    itemRate: numberToField(item ? itemRateForDisplay(item) : undefined),
    taxableValue: numberToField(purchase.taxableValue),
    cgst: numberToField(purchase.cgst),
    sgst: numberToField(purchase.sgst),
    igst: numberToField(purchase.igst),
    totalGst: numberToField(purchase.totalGst),
    roundOff: numberToField(purchase.roundOff),
    totalAmount: numberToField(purchase.totalAmount),
    ewayBillNo: purchase.ewayBillNo,
    vehicleNo: purchase.vehicleNo,
  };
}

function draftToPurchase(draft: PurchaseEditDraft, original: PurchaseDocument): PurchaseDocument {
  const taxableValue = parseFieldNumber(draft.taxableValue);
  const cgst = parseFieldNumber(draft.cgst);
  const sgst = parseFieldNumber(draft.sgst);
  const igst = parseFieldNumber(draft.igst);
  const totalGst = parseFieldNumber(draft.totalGst) || cgst + sgst + igst;
  const roundOff = parseFieldNumber(draft.roundOff);
  const totalAmount = parseFieldNumber(draft.totalAmount) || taxableValue + totalGst + roundOff;
  const originalItem = original.items[0];

  return {
    ...original,
    invoiceNo: draft.invoiceNo.trim(),
    invoiceDate: draft.invoiceDate.trim(),
    supplier: {
      name: draft.supplierName.trim(),
      address: draft.supplierAddress.trim(),
      gstin: draft.supplierGstin.trim(),
      phone: draft.supplierPhone.trim(),
      email: draft.supplierEmail.trim(),
    },
    items: [
      {
        description: draft.itemDescription.trim(),
        hsn: draft.itemHsn.trim(),
        qty: parseFieldNumber(draft.itemQty),
        uom: draft.itemUom.trim() || 'Kg',
        rate: parseFieldNumber(draft.itemRate),
        taxableAmount: taxableValue,
        gstRate: originalItem?.gstRate || 18,
        gstAmount: totalGst,
        totalAmount,
      },
      ...original.items.slice(1),
    ],
    taxableValue,
    cgst,
    sgst,
    igst,
    totalGst,
    roundOff,
    totalAmount,
    ewayBillNo: draft.ewayBillNo.trim(),
    vehicleNo: draft.vehicleNo.trim(),
  };
}

function numberToField(value?: number) {
  if (!Number.isFinite(value)) return '';
  return String(value);
}

function parseFieldNumber(value: string) {
  const number = Number.parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : 0;
}

function getDateTime(value: string) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return 0;
  const [, day, month, year] = match;
  const time = new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  return Number.isNaN(time) ? 0 : time;
}
