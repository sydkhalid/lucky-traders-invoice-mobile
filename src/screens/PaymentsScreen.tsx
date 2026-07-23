import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Card, DatePickerField, Field, SegmentedControl } from '../components/common';
import { formatDate, getDisplayDateTime, money, sortSavedInvoicesByInvoiceDate } from '../invoiceCore';
import type { PaymentDocument, ReceiptPaymentMode } from '../nosqlPaymentTable';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { styles } from '../styles';
import type { SavedInvoiceDocument } from '../types';

const INVOICE_PAYMENT_ROWS_PER_PAGE = 10;
const RECEIPTS_PER_PAGE = 10;

type PaymentStatusFilter = 'all' | 'pending' | 'partial' | 'paid' | 'recent';

type PaymentDraft = {
  id: string;
  invoiceId: string;
  paymentDate: string;
  amount: string;
  paymentMode: ReceiptPaymentMode;
  referenceNo: string;
  note: string;
};

type InvoicePaymentSummary = {
  invoice: SavedInvoiceDocument;
  paid: number;
  balance: number;
  status: 'pending' | 'partial' | 'paid';
  receiptCount: number;
};

const paymentFilters: { key: PaymentStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'partial', label: 'Partial' },
  { key: 'paid', label: 'Paid' },
  { key: 'recent', label: 'Recent' },
];

const paymentModes: { label: string; value: ReceiptPaymentMode }[] = [
  { label: 'Cash', value: 'cash' },
  { label: 'Bank', value: 'bank' },
  { label: 'UPI', value: 'upi' },
  { label: 'Cheque', value: 'cheque' },
  { label: 'Card', value: 'card' },
];

export function PaymentsScreen({
  user,
  savedInvoices,
  payments,
  savePayment,
  deletePayment,
}: {
  user: AuthenticatedUser;
  savedInvoices: SavedInvoiceDocument[];
  payments: PaymentDocument[];
  savePayment: (payment: PaymentDocument) => boolean;
  deletePayment: (payment: PaymentDocument) => void;
}) {
  const [formVisible, setFormVisible] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft>(() => makePaymentDraft());
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [receiptSearch, setReceiptSearch] = useState('');
  const [filter, setFilter] = useState<PaymentStatusFilter>('all');
  const [invoicePage, setInvoicePage] = useState(1);
  const [receiptPage, setReceiptPage] = useState(1);

  const orderedInvoices = useMemo(() => sortSavedInvoicesByInvoiceDate(savedInvoices), [savedInvoices]);
  const orderedPayments = useMemo(
    () => [...payments].sort((a, b) => getDisplayDateTime(b.paymentDate) - getDisplayDateTime(a.paymentDate) || b.createdAt.localeCompare(a.createdAt)),
    [payments],
  );
  const invoiceSummaries = useMemo(
    () => orderedInvoices.map((invoice) => buildInvoicePaymentSummary(invoice, payments)),
    [orderedInvoices, payments],
  );
  const selectedInvoice = useMemo(
    () => savedInvoices.find((invoice) => invoice.id === draft.invoiceId),
    [draft.invoiceId, savedInvoices],
  );
  const selectedSummary = selectedInvoice ? buildInvoicePaymentSummary(selectedInvoice, payments) : null;
  const editingPayment = payments.find((payment) => payment.id === draft.id);
  const availableBalance = selectedSummary
    ? selectedSummary.balance + (editingPayment && editingPayment.invoiceId === selectedSummary.invoice.id ? editingPayment.amount : 0)
    : 0;
  const filteredInvoices = useMemo(() => {
    const query = invoiceSearch.trim().toLowerCase();
    let result = invoiceSummaries.filter((summary) => {
      const matchesSearch = !query || [
        summary.invoice.invoiceNo,
        summary.invoice.invoice.toName,
        summary.invoice.invoice.toGstin,
        summary.invoice.invoice.toPhone,
        summary.invoice.invoice.invoiceDate,
        summary.status,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesFilter = filter === 'all' || filter === 'recent' || summary.status === filter;

      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, INVOICE_PAYMENT_ROWS_PER_PAGE);
    }

    return result;
  }, [filter, invoiceSearch, invoiceSummaries]);
  const filteredPayments = useMemo(() => {
    const query = receiptSearch.trim().toLowerCase();
    return orderedPayments.filter((payment) => !query || [
      payment.invoiceNo,
      payment.clientName,
      payment.clientGstin,
      payment.clientPhone,
      payment.paymentDate,
      payment.paymentMode,
      payment.referenceNo,
      payment.note,
    ].some((value) => value.toLowerCase().includes(query)));
  }, [orderedPayments, receiptSearch]);
  const invoicePages = Math.max(1, Math.ceil(filteredInvoices.length / INVOICE_PAYMENT_ROWS_PER_PAGE));
  const receiptPages = Math.max(1, Math.ceil(filteredPayments.length / RECEIPTS_PER_PAGE));
  const visibleInvoices = useMemo(() => {
    const start = (invoicePage - 1) * INVOICE_PAYMENT_ROWS_PER_PAGE;
    return filteredInvoices.slice(start, start + INVOICE_PAYMENT_ROWS_PER_PAGE);
  }, [filteredInvoices, invoicePage]);
  const visiblePayments = useMemo(() => {
    const start = (receiptPage - 1) * RECEIPTS_PER_PAGE;
    return filteredPayments.slice(start, start + RECEIPTS_PER_PAGE);
  }, [filteredPayments, receiptPage]);
  const totalInvoiceAmount = invoiceSummaries.reduce((sum, summary) => sum + summary.invoice.totals.total, 0);
  const totalReceived = invoiceSummaries.reduce((sum, summary) => sum + summary.paid, 0);
  const totalBalance = invoiceSummaries.reduce((sum, summary) => sum + summary.balance, 0);
  const pendingClients = new Set(invoiceSummaries.filter((summary) => summary.balance > 0.009).map((summary) => summary.invoice.invoice.toName.trim().toLowerCase())).size;
  const partialCount = invoiceSummaries.filter((summary) => summary.status === 'partial').length;
  const paidCount = invoiceSummaries.filter((summary) => summary.status === 'paid').length;

  useEffect(() => {
    setInvoicePage(1);
  }, [filter, invoiceSearch]);

  useEffect(() => {
    setReceiptPage(1);
  }, [receiptSearch]);

  useEffect(() => {
    setInvoicePage((page) => Math.min(page, invoicePages));
  }, [invoicePages]);

  useEffect(() => {
    setReceiptPage((page) => Math.min(page, receiptPages));
  }, [receiptPages]);

  function openAddPayment(invoice?: SavedInvoiceDocument) {
    const summary = invoice ? buildInvoicePaymentSummary(invoice, payments) : null;
    setDraft({
      ...makePaymentDraft(),
      invoiceId: invoice?.id || '',
      amount: summary && summary.balance > 0 ? numberToField(summary.balance) : '',
    });
    if (invoice) setExpandedInvoiceId(invoice.id);
    setFormVisible(true);
  }

  function startEditPayment(payment: PaymentDocument) {
    setDraft({
      id: payment.id,
      invoiceId: payment.invoiceId,
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
    setDraft(makePaymentDraft());
    setFormVisible(false);
  }

  function updateDraft(field: keyof PaymentDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function selectInvoice(invoice: SavedInvoiceDocument) {
    const summary = buildInvoicePaymentSummary(invoice, payments);
    setDraft((current) => ({
      ...current,
      invoiceId: invoice.id,
      amount: current.id ? current.amount : numberToField(summary.balance > 0 ? summary.balance : invoice.totals.total),
    }));
    setExpandedInvoiceId(invoice.id);
  }

  function submitPayment() {
    const invoice = savedInvoices.find((record) => record.id === draft.invoiceId);
    const amount = parseAmount(draft.amount);

    if (!invoice) {
      Alert.alert('Invoice required', 'Select an invoice before saving receipt.');
      return;
    }
    if (amount <= 0) {
      Alert.alert('Amount required', 'Enter a valid received amount.');
      return;
    }
    if (amount - availableBalance > 0.009) {
      Alert.alert('Amount too high', `This invoice balance is ${money(availableBalance)}. Save only the received balance amount.`);
      return;
    }

    const now = formatDate(new Date());
    const existing = payments.find((payment) => payment.id === draft.id);
    const payment: PaymentDocument = existing
      ? {
          ...existing,
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          invoiceDate: invoice.invoice.invoiceDate,
          clientName: invoice.invoice.toName,
          clientGstin: invoice.invoice.toGstin,
          clientPhone: invoice.invoice.toPhone,
          invoiceTotal: invoice.totals.total,
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
          id: `payment-${Date.now()}`,
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          invoiceDate: invoice.invoice.invoiceDate,
          clientName: invoice.invoice.toName,
          clientGstin: invoice.invoice.toGstin,
          clientPhone: invoice.invoice.toPhone,
          invoiceTotal: invoice.totals.total,
          paymentDate: draft.paymentDate,
          amount,
          paymentMode: draft.paymentMode,
          referenceNo: draft.referenceNo.trim(),
          note: draft.note.trim(),
          createdAt: now,
          createdBy: user.name,
          createdByRole: user.role,
        };

    if (savePayment(payment)) {
      closeForm();
      Alert.alert('Receipt saved', `${money(amount)} received for ${invoice.invoiceNo}.`);
    }
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>PAYMENTS</Text>
          <Text style={styles.pageTitle}>Payments / Receipts</Text>
          <Text style={styles.pageSubtitle}>
            {payments.length} receipts | {pendingClients} pending clients | {money(totalBalance)} balance
          </Text>
        </View>
        <Pressable style={styles.pagePrimaryButton} onPress={() => openAddPayment()}>
          <MaterialCommunityIcons name="cash-plus" size={18} color="#ffffff" />
          <Text style={styles.pagePrimaryButtonText}>Add Receipt</Text>
        </Pressable>
      </View>

      <Card title="Collection summary" icon="cash-check">
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Invoice total</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalInvoiceAmount)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Received</Text>
            <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalReceived)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Balance</Text>
            <Text style={[styles.statValue, totalBalance > 0 ? styles.statValueRed : styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalBalance)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Pending clients</Text>
            <Text style={styles.statValue}>{pendingClients}</Text>
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
          title={draft.id ? 'Edit receipt' : 'Add receipt'}
          icon={draft.id ? 'receipt-text-edit-outline' : 'receipt-text-plus-outline'}
          action={
            <View style={styles.clientFormActions}>
              <Pressable style={styles.cancelEditButton} onPress={closeForm}>
                <MaterialCommunityIcons name="close" size={16} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={submitPayment}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
                <Text style={styles.smallButtonText}>{draft.id ? 'Update' : 'Save'}</Text>
              </Pressable>
            </View>
          }
        >
          {savedInvoices.length === 0 ? (
            <Text style={styles.mutedText}>No saved invoices available. Create an invoice before adding receipt.</Text>
          ) : (
            <>
              <Text style={styles.inputLabel}>Invoice</Text>
              <View style={styles.filterChipRow}>
                {invoiceSummaries.map((summary) => {
                  const selected = draft.invoiceId === summary.invoice.id;
                  return (
                    <Pressable
                      key={summary.invoice.id}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                      onPress={() => selectInvoice(summary.invoice)}
                    >
                      <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                        {summary.invoice.invoiceNo} | {money(summary.balance)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {selectedSummary ? (
                <View style={styles.reportGrid}>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>Invoice</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {money(selectedSummary.invoice.totals.total)}
                    </Text>
                  </View>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>Received</Text>
                    <Text style={[styles.reportValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {money(selectedSummary.paid)}
                    </Text>
                  </View>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>Can receive</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {money(availableBalance)}
                    </Text>
                  </View>
                </View>
              ) : null}
              <DatePickerField label="Payment Date" value={draft.paymentDate} onChange={(value) => updateDraft('paymentDate', value)} />
              <Field label="Received Amount" value={draft.amount} onChangeText={(value) => updateDraft('amount', value)} keyboardType="decimal-pad" />
              <SegmentedControl
                label="Payment Mode"
                value={draft.paymentMode}
                options={paymentModes}
                onChange={(value) => updateDraft('paymentMode', value as ReceiptPaymentMode)}
              />
              <Field label="Reference No" value={draft.referenceNo} onChangeText={(value) => updateDraft('referenceNo', value)} />
              <Field label="Note" value={draft.note} onChangeText={(value) => updateDraft('note', value)} multiline />
            </>
          )}
        </Card>
      ) : null}

      <Card title="Invoice balances" icon="file-document-multiple-outline">
        {savedInvoices.length === 0 ? (
          <Text style={styles.mutedText}>No saved invoices yet. Payment balances will appear after invoices are saved.</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
              <TextInput
                style={styles.searchInput}
                value={invoiceSearch}
                onChangeText={setInvoiceSearch}
                placeholder="Search invoice, client, GSTIN, phone, or date"
                placeholderTextColor="#98a2b3"
                autoCapitalize="none"
              />
              {invoiceSearch ? (
                <Pressable onPress={() => setInvoiceSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#98a2b3" />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.filterChipRow}>
              {paymentFilters.map((item) => {
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
                <Text style={styles.listToolbarTitle}>Invoice payment status</Text>
                <Text style={styles.listToolbarMeta}>Page {invoicePage} of {invoicePages}</Text>
              </View>
              <Text style={styles.listCountBadge}>{filteredInvoices.length} showing</Text>
            </View>

            {filteredInvoices.length === 0 ? (
              <Text style={styles.mutedText}>No invoices match this search or filter.</Text>
            ) : (
              <View style={styles.invoiceList}>
                {visibleInvoices.map((summary) => (
                  <View style={styles.savedInvoiceCard} key={summary.invoice.id}>
                    <Pressable
                      style={styles.invoiceCollapsedRow}
                      onPress={() => setExpandedInvoiceId((current) => (current === summary.invoice.id ? null : summary.invoice.id))}
                    >
                      <View style={styles.quickActionText}>
                        <Text style={styles.savedInvoiceNo} numberOfLines={1}>{summary.invoice.invoiceNo}</Text>
                        <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                          {summary.invoice.invoice.toName}
                        </Text>
                      </View>
                      <View style={styles.savedInvoiceTotalBadge}>
                        <Text style={styles.savedInvoiceStatus}>{summary.status.toUpperCase()}</Text>
                        <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {money(summary.balance)}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name={expandedInvoiceId === summary.invoice.id ? 'chevron-up' : 'chevron-down'}
                        size={22}
                        color="#667085"
                      />
                    </Pressable>

                    {expandedInvoiceId === summary.invoice.id ? (
                      <View style={styles.invoiceExpandedDetails}>
                        <View style={styles.reportGrid}>
                          <View style={styles.reportTile}>
                            <Text style={styles.reportLabel}>Invoice total</Text>
                            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                              {money(summary.invoice.totals.total)}
                            </Text>
                          </View>
                          <View style={styles.reportTile}>
                            <Text style={styles.reportLabel}>Received</Text>
                            <Text style={[styles.reportValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                              {money(summary.paid)}
                            </Text>
                          </View>
                          <View style={styles.reportTile}>
                            <Text style={styles.reportLabel}>Balance</Text>
                            <Text style={[styles.reportValue, summary.balance > 0 ? styles.statValueRed : styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                              {money(summary.balance)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.clientInvoiceList}>
                          <Text style={styles.clientMeta}>Client: {summary.invoice.invoice.toName}</Text>
                          <Text style={styles.clientMeta}>Invoice Date: {summary.invoice.invoice.invoiceDate}</Text>
                          <Text style={styles.clientMeta}>GSTIN: {summary.invoice.invoice.toGstin || '-'}</Text>
                          <Text style={styles.clientMeta}>Phone: {summary.invoice.invoice.toPhone || '-'}</Text>
                          <Text style={styles.clientMeta}>Receipts: {summary.receiptCount}</Text>
                        </View>

                        <View style={styles.invoiceActionRow}>
                          <Pressable
                            style={styles.invoicePreviewButton}
                            onPress={() => openAddPayment(summary.invoice)}
                            disabled={summary.balance <= 0.009}
                          >
                            <MaterialCommunityIcons name="cash-plus" size={17} color="#163a5f" />
                            <Text style={styles.invoicePreviewButtonText}>
                              {summary.balance <= 0.009 ? 'Paid' : 'Add Receipt'}
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
              page={invoicePage}
              pages={invoicePages}
              onPrevious={() => setInvoicePage((page) => Math.max(1, page - 1))}
              onNext={() => setInvoicePage((page) => Math.min(invoicePages, page + 1))}
            />
          </>
        )}
      </Card>

      <Card title="Receipt ledger" icon="receipt-text-outline">
        {payments.length === 0 ? (
          <Text style={styles.mutedText}>No receipts saved yet.</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
              <TextInput
                style={styles.searchInput}
                value={receiptSearch}
                onChangeText={setReceiptSearch}
                placeholder="Search receipt, invoice, client, mode, reference"
                placeholderTextColor="#98a2b3"
                autoCapitalize="none"
              />
              {receiptSearch ? (
                <Pressable onPress={() => setReceiptSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#98a2b3" />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.listToolbar}>
              <View>
                <Text style={styles.listToolbarTitle}>Latest receipts</Text>
                <Text style={styles.listToolbarMeta}>Page {receiptPage} of {receiptPages}</Text>
              </View>
              <Text style={styles.listCountBadge}>{money(filteredPayments.reduce((sum, payment) => sum + payment.amount, 0))}</Text>
            </View>

            {filteredPayments.length === 0 ? (
              <Text style={styles.mutedText}>No receipts match this search.</Text>
            ) : (
              <View style={styles.invoiceList}>
                {visiblePayments.map((payment) => (
                  <View style={styles.savedInvoiceCard} key={payment.id}>
                    <Pressable
                      style={styles.invoiceCollapsedRow}
                      onPress={() => setExpandedPaymentId((current) => (current === payment.id ? null : payment.id))}
                    >
                      <View style={styles.quickActionText}>
                        <Text style={styles.savedInvoiceNo} numberOfLines={1}>{payment.invoiceNo}</Text>
                        <Text style={styles.savedInvoiceMeta} numberOfLines={1}>{payment.clientName}</Text>
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
                          <Text style={styles.clientMeta}>Invoice Date: {payment.invoiceDate}</Text>
                          <Text style={styles.clientMeta}>Reference: {payment.referenceNo || '-'}</Text>
                          <Text style={styles.clientMeta}>Note: {payment.note || '-'}</Text>
                          <Text style={styles.clientAudit}>Saved by {payment.createdBy} on {payment.createdAt}</Text>
                        </View>
                        <View style={styles.invoiceActionRow}>
                          <Pressable style={styles.editClientButton} onPress={() => startEditPayment(payment)}>
                            <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                            <Text style={styles.editClientButtonText}>Edit</Text>
                          </Pressable>
                          {user.role === 'admin' ? (
                            <Pressable style={styles.deleteInvoiceButton} onPress={() => deletePayment(payment)}>
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
              page={receiptPage}
              pages={receiptPages}
              onPrevious={() => setReceiptPage((page) => Math.max(1, page - 1))}
              onNext={() => setReceiptPage((page) => Math.min(receiptPages, page + 1))}
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

function makePaymentDraft(): PaymentDraft {
  return {
    id: '',
    invoiceId: '',
    paymentDate: formatDate(new Date()),
    amount: '',
    paymentMode: 'bank',
    referenceNo: '',
    note: '',
  };
}

function buildInvoicePaymentSummary(invoice: SavedInvoiceDocument, payments: PaymentDocument[]): InvoicePaymentSummary {
  const invoicePayments = payments.filter((payment) => payment.invoiceId === invoice.id || payment.invoiceNo === invoice.invoiceNo);
  const paid = invoicePayments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(0, invoice.totals.total - paid);
  const status = balance <= 0.009 ? 'paid' : paid > 0 ? 'partial' : 'pending';

  return {
    invoice,
    paid,
    balance,
    status,
    receiptCount: invoicePayments.length,
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
