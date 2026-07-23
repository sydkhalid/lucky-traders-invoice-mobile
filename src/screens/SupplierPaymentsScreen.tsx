import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Card, DatePickerField, Field, SegmentedControl } from '../components/common';
import { formatDate, getDisplayDateTime, money } from '../invoiceCore';
import type { PurchaseDocument } from '../nosqlPurchaseTable';
import type { SupplierPaymentDocument, SupplierPaymentMode } from '../nosqlSupplierPaymentTable';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { styles } from '../styles';

const PURCHASE_PAYABLE_ROWS_PER_PAGE = 10;
const SUPPLIER_PAYMENTS_PER_PAGE = 10;

type SupplierPaymentStatusFilter = 'all' | 'payable' | 'partial' | 'paid' | 'recent';

type SupplierPaymentDraft = {
  id: string;
  purchaseId: string;
  paymentDate: string;
  amount: string;
  paymentMode: SupplierPaymentMode;
  referenceNo: string;
  note: string;
};

type PurchasePaymentSummary = {
  purchase: PurchaseDocument;
  paid: number;
  balance: number;
  status: 'payable' | 'partial' | 'paid';
  paymentCount: number;
};

const supplierPaymentFilters: { key: SupplierPaymentStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'payable', label: 'Payable' },
  { key: 'partial', label: 'Partial' },
  { key: 'paid', label: 'Paid' },
  { key: 'recent', label: 'Recent' },
];

const supplierPaymentModes: { label: string; value: SupplierPaymentMode }[] = [
  { label: 'Cash', value: 'cash' },
  { label: 'Bank', value: 'bank' },
  { label: 'UPI', value: 'upi' },
  { label: 'Cheque', value: 'cheque' },
  { label: 'Card', value: 'card' },
];

export function SupplierPaymentsScreen({
  user,
  purchases,
  supplierPayments,
  saveSupplierPayment,
  deleteSupplierPayment,
}: {
  user: AuthenticatedUser;
  purchases: PurchaseDocument[];
  supplierPayments: SupplierPaymentDocument[];
  saveSupplierPayment: (payment: SupplierPaymentDocument) => boolean;
  deleteSupplierPayment: (payment: SupplierPaymentDocument) => void;
}) {
  const [formVisible, setFormVisible] = useState(false);
  const [draft, setDraft] = useState<SupplierPaymentDraft>(() => makeSupplierPaymentDraft());
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [filter, setFilter] = useState<SupplierPaymentStatusFilter>('all');
  const [purchasePage, setPurchasePage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);

  const orderedPurchases = useMemo(
    () => [...purchases].sort((a, b) => getDisplayDateTime(b.invoiceDate) - getDisplayDateTime(a.invoiceDate) || b.savedAt.localeCompare(a.savedAt)),
    [purchases],
  );
  const orderedSupplierPayments = useMemo(
    () => [...supplierPayments].sort((a, b) => getDisplayDateTime(b.paymentDate) - getDisplayDateTime(a.paymentDate) || b.createdAt.localeCompare(a.createdAt)),
    [supplierPayments],
  );
  const purchaseSummaries = useMemo(
    () => orderedPurchases.map((purchase) => buildPurchasePaymentSummary(purchase, supplierPayments)),
    [orderedPurchases, supplierPayments],
  );
  const selectedPurchase = useMemo(
    () => purchases.find((purchase) => purchase.id === draft.purchaseId),
    [draft.purchaseId, purchases],
  );
  const selectedSummary = selectedPurchase ? buildPurchasePaymentSummary(selectedPurchase, supplierPayments) : null;
  const editingPayment = supplierPayments.find((payment) => payment.id === draft.id);
  const availableBalance = selectedSummary
    ? selectedSummary.balance + (editingPayment && editingPayment.purchaseId === selectedSummary.purchase.id ? editingPayment.amount : 0)
    : 0;
  const filteredPurchases = useMemo(() => {
    const query = purchaseSearch.trim().toLowerCase();
    let result = purchaseSummaries.filter((summary) => {
      const matchesSearch = !query || [
        summary.purchase.invoiceNo,
        summary.purchase.invoiceDate,
        summary.purchase.supplier.name,
        summary.purchase.supplier.gstin,
        summary.purchase.supplier.phone,
        summary.status,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesFilter = filter === 'all' || filter === 'recent' || summary.status === filter;

      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, PURCHASE_PAYABLE_ROWS_PER_PAGE);
    }

    return result;
  }, [filter, purchaseSearch, purchaseSummaries]);
  const filteredSupplierPayments = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    return orderedSupplierPayments.filter((payment) => !query || [
      payment.purchaseInvoiceNo,
      payment.purchaseDate,
      payment.supplierName,
      payment.supplierGstin,
      payment.supplierPhone,
      payment.paymentDate,
      payment.paymentMode,
      payment.referenceNo,
      payment.note,
    ].some((value) => value.toLowerCase().includes(query)));
  }, [orderedSupplierPayments, paymentSearch]);
  const purchasePages = Math.max(1, Math.ceil(filteredPurchases.length / PURCHASE_PAYABLE_ROWS_PER_PAGE));
  const paymentPages = Math.max(1, Math.ceil(filteredSupplierPayments.length / SUPPLIER_PAYMENTS_PER_PAGE));
  const visiblePurchases = useMemo(() => {
    const start = (purchasePage - 1) * PURCHASE_PAYABLE_ROWS_PER_PAGE;
    return filteredPurchases.slice(start, start + PURCHASE_PAYABLE_ROWS_PER_PAGE);
  }, [filteredPurchases, purchasePage]);
  const visibleSupplierPayments = useMemo(() => {
    const start = (paymentPage - 1) * SUPPLIER_PAYMENTS_PER_PAGE;
    return filteredSupplierPayments.slice(start, start + SUPPLIER_PAYMENTS_PER_PAGE);
  }, [filteredSupplierPayments, paymentPage]);
  const totalPurchaseAmount = purchaseSummaries.reduce((sum, summary) => sum + summary.purchase.totalAmount, 0);
  const totalPaid = purchaseSummaries.reduce((sum, summary) => sum + summary.paid, 0);
  const totalPayable = purchaseSummaries.reduce((sum, summary) => sum + summary.balance, 0);
  const payableSuppliers = new Set(
    purchaseSummaries
      .filter((summary) => summary.balance > 0.009)
      .map((summary) => summary.purchase.supplier.name.trim().toLowerCase()),
  ).size;
  const partialCount = purchaseSummaries.filter((summary) => summary.status === 'partial').length;
  const paidCount = purchaseSummaries.filter((summary) => summary.status === 'paid').length;

  useEffect(() => {
    setPurchasePage(1);
  }, [filter, purchaseSearch]);

  useEffect(() => {
    setPaymentPage(1);
  }, [paymentSearch]);

  useEffect(() => {
    setPurchasePage((page) => Math.min(page, purchasePages));
  }, [purchasePages]);

  useEffect(() => {
    setPaymentPage((page) => Math.min(page, paymentPages));
  }, [paymentPages]);

  function openAddSupplierPayment(purchase?: PurchaseDocument) {
    const summary = purchase ? buildPurchasePaymentSummary(purchase, supplierPayments) : null;
    setDraft({
      ...makeSupplierPaymentDraft(),
      purchaseId: purchase?.id || '',
      amount: summary && summary.balance > 0 ? numberToField(summary.balance) : '',
    });
    if (purchase) setExpandedPurchaseId(purchase.id);
    setFormVisible(true);
  }

  function startEditSupplierPayment(payment: SupplierPaymentDocument) {
    setDraft({
      id: payment.id,
      purchaseId: payment.purchaseId,
      paymentDate: payment.paymentDate,
      amount: numberToField(payment.amount),
      paymentMode: payment.paymentMode,
      referenceNo: payment.referenceNo,
      note: payment.note,
    });
    setExpandedPaymentId(payment.id);
    setFormVisible(true);
  }

  function closeForm() {
    setDraft(makeSupplierPaymentDraft());
    setFormVisible(false);
  }

  function updateDraft(field: keyof SupplierPaymentDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function selectPurchase(purchase: PurchaseDocument) {
    const summary = buildPurchasePaymentSummary(purchase, supplierPayments);
    setDraft((current) => ({
      ...current,
      purchaseId: purchase.id,
      amount: current.id ? current.amount : numberToField(summary.balance > 0 ? summary.balance : purchase.totalAmount),
    }));
    setExpandedPurchaseId(purchase.id);
  }

  function submitSupplierPayment() {
    const purchase = purchases.find((record) => record.id === draft.purchaseId);
    const amount = parseAmount(draft.amount);

    if (!purchase) {
      Alert.alert('Purchase required', 'Select a purchase bill before saving supplier payment.');
      return;
    }
    if (amount <= 0) {
      Alert.alert('Amount required', 'Enter a valid paid amount.');
      return;
    }
    if (amount - availableBalance > 0.009) {
      Alert.alert('Amount too high', `This purchase bill balance is ${money(availableBalance)}. Save only the payable balance amount.`);
      return;
    }

    const now = formatDate(new Date());
    const existing = supplierPayments.find((payment) => payment.id === draft.id);
    const payment: SupplierPaymentDocument = existing
      ? {
          ...existing,
          purchaseId: purchase.id,
          purchaseInvoiceNo: purchase.invoiceNo,
          purchaseDate: purchase.invoiceDate,
          supplierName: purchase.supplier.name,
          supplierGstin: purchase.supplier.gstin,
          supplierPhone: purchase.supplier.phone,
          purchaseTotal: purchase.totalAmount,
          paymentDate: draft.paymentDate,
          amount,
          paymentMode: draft.paymentMode,
          referenceNo: draft.referenceNo.trim(),
          note: draft.note.trim(),
          updatedAt: now,
          updatedBy: user.name,
          updatedByRole: user.role,
        }
      : {
          id: `supplier-payment-${Date.now()}`,
          purchaseId: purchase.id,
          purchaseInvoiceNo: purchase.invoiceNo,
          purchaseDate: purchase.invoiceDate,
          supplierName: purchase.supplier.name,
          supplierGstin: purchase.supplier.gstin,
          supplierPhone: purchase.supplier.phone,
          purchaseTotal: purchase.totalAmount,
          paymentDate: draft.paymentDate,
          amount,
          paymentMode: draft.paymentMode,
          referenceNo: draft.referenceNo.trim(),
          note: draft.note.trim(),
          createdAt: now,
          createdBy: user.name,
          createdByRole: user.role,
        };

    if (saveSupplierPayment(payment)) {
      closeForm();
      Alert.alert('Supplier payment saved', `${money(amount)} paid for ${purchase.invoiceNo}.`);
    }
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>SUPPLIER PAYMENTS</Text>
          <Text style={styles.pageTitle}>Supplier Payments</Text>
          <Text style={styles.pageSubtitle}>
            {supplierPayments.length} payments | {payableSuppliers} payable suppliers | {money(totalPayable)} balance
          </Text>
        </View>
        <Pressable style={styles.pagePrimaryButton} onPress={() => openAddSupplierPayment()}>
          <MaterialCommunityIcons name="cash-plus" size={18} color="#ffffff" />
          <Text style={styles.pagePrimaryButtonText}>Add Payment</Text>
        </Pressable>
      </View>

      <Card title="Payable summary" icon="cash-multiple">
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Purchase total</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalPurchaseAmount)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statLabel]}>Paid</Text>
            <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalPaid)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Balance payable</Text>
            <Text style={[styles.statValue, totalPayable > 0 ? styles.statValueRed : styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalPayable)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Payable suppliers</Text>
            <Text style={styles.statValue}>{payableSuppliers}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Partial bills</Text>
            <Text style={styles.statValue}>{partialCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Paid bills</Text>
            <Text style={[styles.statValue, styles.statValueGreen]}>{paidCount}</Text>
          </View>
        </View>
      </Card>

      {formVisible ? (
        <Card
          title={draft.id ? 'Edit supplier payment' : 'Add supplier payment'}
          icon={draft.id ? 'cash-edit' : 'cash-plus'}
          action={
            <View style={styles.clientFormActions}>
              <Pressable style={styles.cancelEditButton} onPress={closeForm}>
                <MaterialCommunityIcons name="close" size={16} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={submitSupplierPayment}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
                <Text style={styles.smallButtonText}>{draft.id ? 'Update' : 'Save'}</Text>
              </Pressable>
            </View>
          }
        >
          {purchases.length === 0 ? (
            <Text style={styles.mutedText}>No purchase bills available. Upload a purchase before adding supplier payment.</Text>
          ) : (
            <>
              <Text style={styles.inputLabel}>Purchase Bill</Text>
              <View style={styles.filterChipRow}>
                {purchaseSummaries.map((summary) => {
                  const selected = draft.purchaseId === summary.purchase.id;
                  return (
                    <Pressable
                      key={summary.purchase.id}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                      onPress={() => selectPurchase(summary.purchase)}
                    >
                      <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                        {summary.purchase.invoiceNo} | {money(summary.balance)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {selectedSummary ? (
                <View style={styles.reportGrid}>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>Purchase</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {money(selectedSummary.purchase.totalAmount)}
                    </Text>
                  </View>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>Paid</Text>
                    <Text style={[styles.reportValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {money(selectedSummary.paid)}
                    </Text>
                  </View>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>Can pay</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {money(availableBalance)}
                    </Text>
                  </View>
                </View>
              ) : null}
              <DatePickerField label="Payment Date" value={draft.paymentDate} onChange={(value) => updateDraft('paymentDate', value)} />
              <Field label="Paid Amount" value={draft.amount} onChangeText={(value) => updateDraft('amount', value)} keyboardType="decimal-pad" />
              <SegmentedControl
                label="Payment Mode"
                value={draft.paymentMode}
                options={supplierPaymentModes}
                onChange={(value) => updateDraft('paymentMode', value as SupplierPaymentMode)}
              />
              <Field label="Reference No" value={draft.referenceNo} onChangeText={(value) => updateDraft('referenceNo', value)} />
              <Field label="Note" value={draft.note} onChangeText={(value) => updateDraft('note', value)} multiline />
            </>
          )}
        </Card>
      ) : null}

      <Card title="Purchase bill balances" icon="cart-check">
        {purchases.length === 0 ? (
          <Text style={styles.mutedText}>No purchase bills yet. Supplier balances will appear after purchases are saved.</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
              <TextInput
                style={styles.searchInput}
                value={purchaseSearch}
                onChangeText={setPurchaseSearch}
                placeholder="Search bill, supplier, GSTIN, phone, or date"
                placeholderTextColor="#98a2b3"
                autoCapitalize="none"
              />
              {purchaseSearch ? (
                <Pressable onPress={() => setPurchaseSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#98a2b3" />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.filterChipRow}>
              {supplierPaymentFilters.map((item) => {
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
                <Text style={styles.listToolbarTitle}>Supplier payable status</Text>
                <Text style={styles.listToolbarMeta}>Page {purchasePage} of {purchasePages}</Text>
              </View>
              <Text style={styles.listCountBadge}>{filteredPurchases.length} showing</Text>
            </View>

            {filteredPurchases.length === 0 ? (
              <Text style={styles.mutedText}>No purchase bills match this search or filter.</Text>
            ) : (
              <View style={styles.invoiceList}>
                {visiblePurchases.map((summary) => (
                  <View style={styles.savedInvoiceCard} key={summary.purchase.id}>
                    <Pressable
                      style={styles.invoiceCollapsedRow}
                      onPress={() => setExpandedPurchaseId((current) => (current === summary.purchase.id ? null : summary.purchase.id))}
                    >
                      <View style={styles.quickActionText}>
                        <Text style={styles.savedInvoiceNo} numberOfLines={1}>{summary.purchase.invoiceNo}</Text>
                        <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                          {summary.purchase.supplier.name}
                        </Text>
                      </View>
                      <View style={styles.savedInvoiceTotalBadge}>
                        <Text style={styles.savedInvoiceStatus}>{summary.status.toUpperCase()}</Text>
                        <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {money(summary.balance)}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name={expandedPurchaseId === summary.purchase.id ? 'chevron-up' : 'chevron-down'}
                        size={22}
                        color="#667085"
                      />
                    </Pressable>

                    {expandedPurchaseId === summary.purchase.id ? (
                      <View style={styles.invoiceExpandedDetails}>
                        <View style={styles.reportGrid}>
                          <View style={styles.reportTile}>
                            <Text style={styles.reportLabel}>Purchase total</Text>
                            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                              {money(summary.purchase.totalAmount)}
                            </Text>
                          </View>
                          <View style={styles.reportTile}>
                            <Text style={styles.reportLabel}>Paid</Text>
                            <Text style={[styles.reportValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                              {money(summary.paid)}
                            </Text>
                          </View>
                          <View style={styles.reportTile}>
                            <Text style={styles.reportLabel}>Payable</Text>
                            <Text style={[styles.reportValue, summary.balance > 0 ? styles.statValueRed : styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                              {money(summary.balance)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.clientInvoiceList}>
                          <Text style={styles.clientMeta}>Supplier: {summary.purchase.supplier.name}</Text>
                          <Text style={styles.clientMeta}>Purchase Date: {summary.purchase.invoiceDate}</Text>
                          <Text style={styles.clientMeta}>GSTIN: {summary.purchase.supplier.gstin || '-'}</Text>
                          <Text style={styles.clientMeta}>Phone: {summary.purchase.supplier.phone || '-'}</Text>
                          <Text style={styles.clientMeta}>Payments: {summary.paymentCount}</Text>
                        </View>

                        <View style={styles.invoiceActionRow}>
                          <Pressable
                            style={styles.invoicePreviewButton}
                            onPress={() => openAddSupplierPayment(summary.purchase)}
                            disabled={summary.balance <= 0.009}
                          >
                            <MaterialCommunityIcons name="cash-plus" size={17} color="#163a5f" />
                            <Text style={styles.invoicePreviewButtonText}>
                              {summary.balance <= 0.009 ? 'Paid' : 'Add Payment'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            <Pagination
              page={purchasePage}
              pages={purchasePages}
              onPrevious={() => setPurchasePage((page) => Math.max(1, page - 1))}
              onNext={() => setPurchasePage((page) => Math.min(purchasePages, page + 1))}
            />
          </>
        )}
      </Card>

      <Card title="Supplier ledger" icon="book-open-page-variant-outline">
        {supplierPayments.length === 0 ? (
          <Text style={styles.mutedText}>No supplier payments saved yet.</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
              <TextInput
                style={styles.searchInput}
                value={paymentSearch}
                onChangeText={setPaymentSearch}
                placeholder="Search payment, bill, supplier, mode, reference"
                placeholderTextColor="#98a2b3"
                autoCapitalize="none"
              />
              {paymentSearch ? (
                <Pressable onPress={() => setPaymentSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#98a2b3" />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.listToolbar}>
              <View>
                <Text style={styles.listToolbarTitle}>Latest supplier payments</Text>
                <Text style={styles.listToolbarMeta}>Page {paymentPage} of {paymentPages}</Text>
              </View>
              <Text style={styles.listCountBadge}>{money(filteredSupplierPayments.reduce((sum, payment) => sum + payment.amount, 0))}</Text>
            </View>

            {filteredSupplierPayments.length === 0 ? (
              <Text style={styles.mutedText}>No supplier payments match this search.</Text>
            ) : (
              <View style={styles.invoiceList}>
                {visibleSupplierPayments.map((payment) => (
                  <View style={styles.savedInvoiceCard} key={payment.id}>
                    <Pressable
                      style={styles.invoiceCollapsedRow}
                      onPress={() => setExpandedPaymentId((current) => (current === payment.id ? null : payment.id))}
                    >
                      <View style={styles.quickActionText}>
                        <Text style={styles.savedInvoiceNo} numberOfLines={1}>{payment.purchaseInvoiceNo}</Text>
                        <Text style={styles.savedInvoiceMeta} numberOfLines={1}>{payment.supplierName}</Text>
                      </View>
                      <View style={styles.savedInvoiceTotalBadge}>
                        <Text style={styles.savedInvoiceStatus}>{payment.paymentMode.toUpperCase()}</Text>
                        <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {money(payment.amount)}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name={expandedPaymentId === payment.id ? 'chevron-up' : 'chevron-down'}
                        size={22}
                        color="#667085"
                      />
                    </Pressable>

                    {expandedPaymentId === payment.id ? (
                      <View style={styles.invoiceExpandedDetails}>
                        <View style={styles.clientInvoiceList}>
                          <Text style={styles.clientMeta}>Payment Date: {payment.paymentDate}</Text>
                          <Text style={styles.clientMeta}>Purchase Date: {payment.purchaseDate}</Text>
                          <Text style={styles.clientMeta}>Reference: {payment.referenceNo || '-'}</Text>
                          <Text style={styles.clientMeta}>Note: {payment.note || '-'}</Text>
                          <Text style={styles.clientAudit}>Saved by {payment.createdBy} on {payment.createdAt}</Text>
                        </View>
                        <View style={styles.invoiceActionRow}>
                          <Pressable style={styles.editClientButton} onPress={() => startEditSupplierPayment(payment)}>
                            <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                            <Text style={styles.editClientButtonText}>Edit</Text>
                          </Pressable>
                          {user.role === 'admin' ? (
                            <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteSupplierPayment(payment)}>
                              <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                              <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            <Pagination
              page={paymentPage}
              pages={paymentPages}
              onPrevious={() => setPaymentPage((page) => Math.max(1, page - 1))}
              onNext={() => setPaymentPage((page) => Math.min(paymentPages, page + 1))}
            />
          </>
        )}
      </Card>
    </View>
  );
}

function Pagination({
  page,
  pages,
  onPrevious,
  onNext,
}: {
  page: number;
  pages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.paginationBar}>
      <Pressable
        style={[styles.paginationButton, page === 1 && styles.navButtonDisabled]}
        onPress={onPrevious}
        disabled={page === 1}
      >
        <MaterialCommunityIcons name="chevron-left" size={18} color="#163a5f" />
        <Text style={styles.paginationButtonText}>Previous</Text>
      </Pressable>
      <Text style={styles.paginationText}>{page} / {pages}</Text>
      <Pressable
        style={[styles.paginationButton, page === pages && styles.navButtonDisabled]}
        onPress={onNext}
        disabled={page === pages}
      >
        <Text style={styles.paginationButtonText}>Next</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color="#163a5f" />
      </Pressable>
    </View>
  );
}

function makeSupplierPaymentDraft(): SupplierPaymentDraft {
  return {
    id: '',
    purchaseId: '',
    paymentDate: formatDate(new Date()),
    amount: '',
    paymentMode: 'bank',
    referenceNo: '',
    note: '',
  };
}

export function buildPurchasePaymentSummary(
  purchase: PurchaseDocument,
  supplierPayments: SupplierPaymentDocument[],
): PurchasePaymentSummary {
  const purchasePayments = supplierPayments.filter(
    (payment) => payment.purchaseId === purchase.id || payment.purchaseInvoiceNo === purchase.invoiceNo,
  );
  const paid = purchasePayments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(0, purchase.totalAmount - paid);
  const status = balance <= 0.009 ? 'paid' : paid > 0 ? 'partial' : 'payable';

  return {
    purchase,
    paid,
    balance,
    status,
    paymentCount: purchasePayments.length,
  };
}

function parseAmount(value: string) {
  const amount = Number.parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(amount) ? amount : 0;
}

function numberToField(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return String(Math.max(0, value).toFixed(2));
}
