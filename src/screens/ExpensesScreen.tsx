import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Card, DatePickerField, Field, SegmentedControl } from '../components/common';
import { formatDate, getDisplayDateTime, money } from '../invoiceCore';
import type { ExpenseDocument, ExpensePaymentMode } from '../nosqlExpenseTable';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { styles } from '../styles';

const EXPENSES_PER_PAGE = 10;
const EXPENSE_RECEIPT_DIR = 'expense-receipts';

type ExpenseFilter = 'all' | 'gst' | 'receipt' | 'recent';
type ExpenseDraft = {
  id: string;
  expenseDate: string;
  category: string;
  vendor: string;
  description: string;
  amount: string;
  gstAmount: string;
  paymentMode: ExpensePaymentMode;
  referenceNo: string;
  receiptFileName: string;
  receiptFileUri?: string;
  receiptFileSize?: number;
  receiptMimeType?: string;
  pendingReceiptUri?: string;
};

const expenseFilters: { key: ExpenseFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gst', label: 'GST' },
  { key: 'receipt', label: 'Receipt' },
  { key: 'recent', label: 'Recent' },
];

const paymentModes: { label: string; value: ExpensePaymentMode }[] = [
  { label: 'Cash', value: 'cash' },
  { label: 'Bank', value: 'bank' },
  { label: 'UPI', value: 'upi' },
  { label: 'Card', value: 'card' },
];

export function ExpensesScreen({
  user,
  expenses,
  saveExpense,
  deleteExpense,
}: {
  user: AuthenticatedUser;
  expenses: ExpenseDocument[];
  saveExpense: (expense: ExpenseDocument) => boolean;
  deleteExpense: (expense: ExpenseDocument) => void;
}) {
  const [formVisible, setFormVisible] = useState(false);
  const [draft, setDraft] = useState<ExpenseDraft>(() => makeExpenseDraft());
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ExpenseFilter>('all');
  const orderedExpenses = useMemo(
    () => [...expenses].sort((a, b) => getDisplayDateTime(b.expenseDate) - getDisplayDateTime(a.expenseDate) || b.createdAt.localeCompare(a.createdAt)),
    [expenses],
  );
  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = orderedExpenses.filter((expense) => {
      const matchesSearch = !query || [
        expense.expenseDate,
        expense.category,
        expense.vendor,
        expense.description,
        expense.paymentMode,
        expense.referenceNo,
        expense.receiptFileName || '',
      ].some((value) => value.toLowerCase().includes(query));
      const matchesFilter =
        filter === 'all' ||
        filter === 'recent' ||
        (filter === 'gst' && expense.gstAmount > 0) ||
        (filter === 'receipt' && Boolean(expense.receiptFileUri));

      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, EXPENSES_PER_PAGE);
    }

    return result;
  }, [filter, orderedExpenses, search]);
  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / EXPENSES_PER_PAGE));
  const visibleExpenses = useMemo(() => {
    const start = (currentPage - 1) * EXPENSES_PER_PAGE;
    return filteredExpenses.slice(start, start + EXPENSES_PER_PAGE);
  }, [currentPage, filteredExpenses]);
  const totalExpense = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalGst = filteredExpenses.reduce((sum, expense) => sum + expense.gstAmount, 0);
  const receiptCount = filteredExpenses.filter((expense) => expense.receiptFileUri).length;
  const thisMonthExpense = filteredExpenses
    .filter((expense) => isThisMonth(expense.expenseDate))
    .reduce((sum, expense) => sum + expense.amount, 0);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  function openAddForm() {
    setDraft(makeExpenseDraft());
    setFormVisible(true);
  }

  function startEditExpense(expense: ExpenseDocument) {
    setDraft(expenseToDraft(expense));
    setExpandedExpenseId(expense.id);
    setFormVisible(true);
  }

  function closeForm() {
    setDraft(makeExpenseDraft());
    setFormVisible(false);
  }

  function updateDraft(field: keyof ExpenseDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function pickReceipt() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setDraft((current) => ({
        ...current,
        receiptFileName: asset.name,
        receiptFileSize: asset.size,
        receiptMimeType: asset.mimeType,
        pendingReceiptUri: asset.uri,
      }));
    } catch (error) {
      Alert.alert('Receipt upload failed', error instanceof Error ? error.message : 'Unable to upload this receipt.');
    }
  }

  async function submitExpense() {
    const category = draft.category.trim();
    const vendor = draft.vendor.trim();
    const amount = parseAmount(draft.amount);
    const gstAmount = parseAmount(draft.gstAmount);

    if (!category) {
      Alert.alert('Category required', 'Enter an expense category before saving.');
      return;
    }
    if (amount <= 0) {
      Alert.alert('Amount required', 'Enter a valid expense amount.');
      return;
    }

    try {
      const receiptFileUri = draft.pendingReceiptUri
        ? await persistReceiptFile(draft.pendingReceiptUri, draft.receiptFileName)
        : draft.receiptFileUri;
      const now = formatDate(new Date());
      const existing = expenses.find((expense) => expense.id === draft.id);
      const expense: ExpenseDocument = existing
        ? {
            ...existing,
            expenseDate: draft.expenseDate,
            category,
            vendor,
            description: draft.description.trim(),
            amount,
            gstAmount,
            paymentMode: draft.paymentMode,
            referenceNo: draft.referenceNo.trim(),
            receiptFileName: draft.receiptFileName.trim() || existing.receiptFileName,
            receiptFileUri,
            receiptFileSize: draft.receiptFileSize ?? existing.receiptFileSize,
            receiptMimeType: draft.receiptMimeType || existing.receiptMimeType,
            updatedAt: now,
            updatedBy: user.name,
            updatedByRole: user.role,
          }
        : {
            id: `expense-${Date.now()}`,
            expenseDate: draft.expenseDate,
            category,
            vendor,
            description: draft.description.trim(),
            amount,
            gstAmount,
            paymentMode: draft.paymentMode,
            referenceNo: draft.referenceNo.trim(),
            receiptFileName: draft.receiptFileName.trim() || undefined,
            receiptFileUri,
            receiptFileSize: draft.receiptFileSize,
            receiptMimeType: draft.receiptMimeType,
            createdAt: now,
            createdBy: user.name,
            createdByRole: user.role,
          };

      if (saveExpense(expense)) {
        closeForm();
        Alert.alert('Expense saved', `${category} expense was saved${receiptFileUri ? ' with receipt.' : '.'}`);
      }
    } catch (error) {
      Alert.alert('Receipt save failed', error instanceof Error ? error.message : 'Unable to save the receipt file.');
    }
  }

  async function openReceipt(expense: ExpenseDocument) {
    if (!expense.receiptFileUri) {
      Alert.alert('No receipt', 'This expense does not have a saved receipt.');
      return;
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(expense.receiptFileUri);
      if (!fileInfo.exists) {
        Alert.alert('Receipt missing', 'The saved receipt file is no longer available on this device.');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(expense.receiptFileUri, {
          mimeType: expense.receiptMimeType || undefined,
          dialogTitle: expense.receiptFileName || 'Expense receipt',
        });
      } else {
        Alert.alert('Receipt file', expense.receiptFileUri);
      }
    } catch (error) {
      Alert.alert('Receipt failed', error instanceof Error ? error.message : 'Unable to open the receipt file.');
    }
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>EXPENSE LEDGER</Text>
          <Text style={styles.pageTitle}>Expenses</Text>
          <Text style={styles.pageSubtitle}>
            {expenses.length} expenses | {receiptCount} receipts | {money(totalExpense)}
          </Text>
        </View>
        <Pressable style={styles.pagePrimaryButton} onPress={openAddForm}>
          <MaterialCommunityIcons name="receipt-text-plus-outline" size={18} color="#ffffff" />
          <Text style={styles.pagePrimaryButtonText}>Add Expense</Text>
        </Pressable>
      </View>

      <Card title="Expense summary" icon="wallet-outline">
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total expense</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalExpense)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>GST paid</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalGst)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>This month</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(thisMonthExpense)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Receipts</Text>
            <Text style={styles.statValue}>{receiptCount}</Text>
          </View>
        </View>
      </Card>

      {formVisible ? (
        <Card
          title={draft.id ? 'Edit expense' : 'Add expense'}
          icon={draft.id ? 'pencil-outline' : 'receipt-text-plus-outline'}
          action={
            <View style={styles.clientFormActions}>
              <Pressable style={styles.cancelEditButton} onPress={closeForm}>
                <MaterialCommunityIcons name="close" size={16} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={submitExpense}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
                <Text style={styles.smallButtonText}>{draft.id ? 'Update' : 'Save'}</Text>
              </Pressable>
            </View>
          }
        >
          <DatePickerField label="Expense Date" value={draft.expenseDate} onChange={(value) => updateDraft('expenseDate', value)} />
          <Field label="Category" value={draft.category} onChangeText={(value) => updateDraft('category', value)} />
          <Field label="Vendor / Paid To" value={draft.vendor} onChangeText={(value) => updateDraft('vendor', value)} />
          <Field label="Description" value={draft.description} onChangeText={(value) => updateDraft('description', value)} multiline />
          <Field label="Amount" value={draft.amount} onChangeText={(value) => updateDraft('amount', value)} keyboardType="decimal-pad" />
          <Field label="GST Paid" value={draft.gstAmount} onChangeText={(value) => updateDraft('gstAmount', value)} keyboardType="decimal-pad" />
          <SegmentedControl
            label="Payment Mode"
            value={draft.paymentMode}
            options={paymentModes}
            onChange={(value) => setDraft((current) => ({ ...current, paymentMode: value as ExpensePaymentMode }))}
          />
          <Field label="Reference No" value={draft.referenceNo} onChangeText={(value) => updateDraft('referenceNo', value)} />

          <View style={styles.clientInvoiceList}>
            <Text style={styles.reportSectionTitle}>Receipt / Bill</Text>
            <Pressable style={styles.invoicePreviewButton} onPress={pickReceipt}>
              <MaterialCommunityIcons name="file-upload-outline" size={17} color="#163a5f" />
              <Text style={styles.invoicePreviewButtonText}>{draft.receiptFileName ? 'Change Receipt' : 'Upload Receipt'}</Text>
            </Pressable>
            <Text style={styles.clientMeta}>File: {draft.receiptFileName || '-'}</Text>
            {draft.receiptFileSize ? <Text style={styles.clientAudit}>Size: {formatBytes(draft.receiptFileSize)}</Text> : null}
          </View>
        </Card>
      ) : null}

      <Card title="Expense list" icon="format-list-bulleted-square">
        {expenses.length === 0 ? (
          <Text style={styles.mutedText}>No expenses saved yet. Use Add Expense to save the first bill.</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search category, vendor, date, mode, reference, or receipt"
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
              {expenseFilters.map((item) => {
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
                <Text style={styles.listToolbarTitle}>Latest expenses</Text>
                <Text style={styles.listToolbarMeta}>Page {currentPage} of {totalPages}</Text>
              </View>
              <Text style={styles.listCountBadge}>{money(totalExpense)}</Text>
            </View>

            {filteredExpenses.length === 0 ? (
              <Text style={styles.mutedText}>No expenses match this search or filter.</Text>
            ) : (
              <View style={styles.invoiceList}>
                {visibleExpenses.map((expense) => (
                  <View style={styles.savedInvoiceCard} key={expense.id}>
                    <Pressable
                      style={styles.invoiceCollapsedRow}
                      onPress={() => setExpandedExpenseId((current) => (current === expense.id ? null : expense.id))}
                    >
                      <View style={styles.quickActionText}>
                        <Text style={styles.savedInvoiceNo} numberOfLines={1}>
                          {expense.category}
                        </Text>
                        <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                          {expense.vendor || 'No vendor'} | {expense.expenseDate}
                        </Text>
                      </View>
                      <View style={styles.savedInvoiceTotalBadge}>
                        <Text style={styles.savedInvoiceStatus}>{expense.paymentMode.toUpperCase()}</Text>
                        <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {money(expense.amount)}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name={expandedExpenseId === expense.id ? 'chevron-up' : 'chevron-down'}
                        size={22}
                        color="#667085"
                      />
                    </Pressable>

                    {expandedExpenseId === expense.id ? (
                      <View style={styles.invoiceExpandedDetails}>
                        <View style={styles.reportGrid}>
                          <View style={styles.reportTile}>
                            <Text style={styles.reportLabel}>Amount</Text>
                            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                              {money(expense.amount)}
                            </Text>
                          </View>
                          <View style={styles.reportTile}>
                            <Text style={styles.reportLabel}>GST</Text>
                            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                              {money(expense.gstAmount)}
                            </Text>
                          </View>
                          <View style={styles.reportTile}>
                            <Text style={styles.reportLabel}>Receipt</Text>
                            <Text style={styles.reportValue}>{expense.receiptFileUri ? 'YES' : 'NO'}</Text>
                          </View>
                        </View>
                        <Text style={styles.clientMeta}>Vendor: {expense.vendor || '-'}</Text>
                        <Text style={styles.clientMeta}>Description: {expense.description || '-'}</Text>
                        <Text style={styles.clientMeta}>Reference: {expense.referenceNo || '-'}</Text>
                        <Text style={styles.clientMeta}>Receipt: {expense.receiptFileName || '-'}</Text>
                        <Text style={styles.clientAudit}>Saved by {expense.createdBy} on {expense.createdAt}</Text>

                        <View style={styles.invoiceActionRow}>
                          <Pressable
                            style={[styles.invoicePreviewButton, !expense.receiptFileUri && styles.navButtonDisabled]}
                            onPress={() => openReceipt(expense)}
                            disabled={!expense.receiptFileUri}
                          >
                            <MaterialCommunityIcons name="file-document-outline" size={17} color="#163a5f" />
                            <Text style={styles.invoicePreviewButtonText}>Receipt</Text>
                          </Pressable>
                          <Pressable style={styles.editClientButton} onPress={() => startEditExpense(expense)}>
                            <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                            <Text style={styles.editClientButtonText}>Edit</Text>
                          </Pressable>
                          {user.role === 'admin' ? (
                            <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteExpense(expense)}>
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

async function persistReceiptFile(sourceUri: string, sourceFileName: string) {
  const baseDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDirectory) {
    throw new Error('No local storage directory is available for expense receipts.');
  }

  const directoryUri = `${baseDirectory}${EXPENSE_RECEIPT_DIR}/`;
  const directoryInfo = await FileSystem.getInfoAsync(directoryUri);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  }

  const targetFileName = `${Date.now()}-${safeFileName(sourceFileName)}`;
  const targetUri = `${directoryUri}${targetFileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
}

function makeExpenseDraft(): ExpenseDraft {
  return {
    id: '',
    expenseDate: formatDate(new Date()),
    category: '',
    vendor: '',
    description: '',
    amount: '',
    gstAmount: '0',
    paymentMode: 'cash',
    referenceNo: '',
    receiptFileName: '',
  };
}

function expenseToDraft(expense: ExpenseDocument): ExpenseDraft {
  return {
    id: expense.id,
    expenseDate: expense.expenseDate,
    category: expense.category,
    vendor: expense.vendor,
    description: expense.description,
    amount: numberToField(expense.amount),
    gstAmount: numberToField(expense.gstAmount),
    paymentMode: expense.paymentMode,
    referenceNo: expense.referenceNo,
    receiptFileName: expense.receiptFileName || '',
    receiptFileUri: expense.receiptFileUri,
    receiptFileSize: expense.receiptFileSize,
    receiptMimeType: expense.receiptMimeType,
  };
}

function parseAmount(value: string) {
  const amount = Number.parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(amount) ? amount : 0;
}

function numberToField(value?: number) {
  if (!Number.isFinite(value)) return '';
  return String(value);
}

function safeFileName(fileName: string) {
  const cleaned = fileName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'expense-receipt';
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 KB';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isThisMonth(value: string) {
  const time = getDisplayDateTime(value);
  if (!time) return false;
  const date = new Date(time);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}
