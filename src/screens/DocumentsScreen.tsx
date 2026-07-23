import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Card } from '../components/common';
import { buildPrintableHtml, getDisplayDateTime, money } from '../invoiceCore';
import type { EmployeeDocument, SalaryDocument } from '../nosqlEmployeeTable';
import type { ExpenseDocument } from '../nosqlExpenseTable';
import type { PurchaseDocument } from '../nosqlPurchaseTable';
import { styles } from '../styles';
import type { SavedInvoiceDocument } from '../types';
import { buildJoiningLetterHtml, buildSalarySlipHtml } from './EmployeesScreen';

const DOCUMENTS_PER_PAGE = 10;

type DocumentFilter = 'all' | 'invoices' | 'purchases' | 'expenses' | 'payroll' | 'missing' | 'recent';
type DocumentKind = 'invoice' | 'purchase' | 'expense' | 'offer' | 'salary';

type DocumentRecord = {
  id: string;
  kind: DocumentKind;
  title: string;
  subtitle: string;
  date: string;
  status: string;
  amount?: number;
  hasFile: boolean;
  searchable: string;
};

const documentFilters: { key: DocumentFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'missing', label: 'Missing Files' },
  { key: 'recent', label: 'Recent' },
];

export function DocumentsScreen({
  savedInvoices,
  purchases,
  expenses,
  employees,
  salaries,
}: {
  savedInvoices: SavedInvoiceDocument[];
  purchases: PurchaseDocument[];
  expenses: ExpenseDocument[];
  employees: EmployeeDocument[];
  salaries: SalaryDocument[];
}) {
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DocumentFilter>('all');
  const [page, setPage] = useState(1);

  const records = useMemo(
    () => buildDocumentRecords(savedInvoices, purchases, expenses, employees, salaries),
    [employees, expenses, purchases, salaries, savedInvoices],
  );
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = records.filter((record) => {
      const matchesSearch = !query || record.searchable.includes(query);
      const matchesFilter =
        filter === 'all' ||
        filter === 'recent' ||
        (filter === 'invoices' && record.kind === 'invoice') ||
        (filter === 'purchases' && record.kind === 'purchase') ||
        (filter === 'expenses' && record.kind === 'expense') ||
        (filter === 'payroll' && (record.kind === 'offer' || record.kind === 'salary')) ||
        (filter === 'missing' && !record.hasFile);

      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, DOCUMENTS_PER_PAGE);
    }

    return result;
  }, [filter, records, search]);
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / DOCUMENTS_PER_PAGE));
  const visibleRecords = useMemo(() => {
    const start = (page - 1) * DOCUMENTS_PER_PAGE;
    return filteredRecords.slice(start, start + DOCUMENTS_PER_PAGE);
  }, [filteredRecords, page]);
  const uploadedFiles = records.filter((record) => (record.kind === 'purchase' || record.kind === 'expense') && record.hasFile).length;
  const generatedFiles = records.filter((record) => record.kind === 'invoice' || record.kind === 'offer' || record.kind === 'salary').length;
  const missingFiles = records.filter((record) => !record.hasFile).length;
  const payrollDocs = records.filter((record) => record.kind === 'offer' || record.kind === 'salary').length;

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  async function openDocument(record: DocumentRecord) {
    try {
      if (record.kind === 'invoice') {
        const savedInvoice = savedInvoices.find((item) => `invoice-${item.id}` === record.id);
        if (!savedInvoice) throw new Error('Invoice record is no longer available.');
        const html = await buildPrintableHtml(savedInvoice.invoice, savedInvoice.totals);
        await shareGeneratedPdf(html, `${savedInvoice.invoiceNo} Invoice`);
        return;
      }

      if (record.kind === 'purchase') {
        const purchase = purchases.find((item) => `purchase-${item.id}` === record.id);
        if (!purchase?.sourceFileUri) throw new Error('This purchase does not have a saved PDF reference.');
        await openStoredFile(purchase.sourceFileUri, purchase.sourceFileName || purchase.invoiceNo, 'application/pdf');
        return;
      }

      if (record.kind === 'expense') {
        const expense = expenses.find((item) => `expense-${item.id}` === record.id);
        if (!expense?.receiptFileUri) throw new Error('This expense does not have an uploaded receipt or bill.');
        await openStoredFile(expense.receiptFileUri, expense.receiptFileName || expense.category, expense.receiptMimeType);
        return;
      }

      if (record.kind === 'offer') {
        const employee = employees.find((item) => `offer-${item.id}` === record.id);
        if (!employee) throw new Error('Employee record is no longer available.');
        const html = await buildJoiningLetterHtml(employee, employees);
        await shareGeneratedPdf(html, `${employee.name} Offer Letter`);
        return;
      }

      if (record.kind === 'salary') {
        const salary = salaries.find((item) => `salary-${item.id}` === record.id);
        if (!salary) throw new Error('Salary record is no longer available.');
        const employee = employees.find((item) => item.id === salary.employeeId);
        const html = await buildSalarySlipHtml(salary, employee, employees);
        await shareGeneratedPdf(html, `${salary.employeeName} Salary Slip ${salary.period}`);
      }
    } catch (error) {
      Alert.alert('Document unavailable', error instanceof Error ? error.message : 'Unable to open this document.');
    }
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>DOCUMENTS</Text>
          <Text style={styles.pageTitle}>Documents</Text>
          <Text style={styles.pageSubtitle}>
            {records.length} documents | {uploadedFiles} uploaded | {generatedFiles} generated
          </Text>
        </View>
      </View>

      <Card title="Document summary" icon="file-document-multiple-outline">
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>All documents</Text>
            <Text style={styles.statValue}>{records.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Uploaded files</Text>
            <Text style={[styles.statValue, styles.statValueGreen]}>{uploadedFiles}</Text>
            <Text style={styles.reportSubValue}>Purchase + expense</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Generated PDFs</Text>
            <Text style={styles.statValue}>{generatedFiles}</Text>
            <Text style={styles.reportSubValue}>Invoice + payroll</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Payroll docs</Text>
            <Text style={styles.statValue}>{payrollDocs}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Missing files</Text>
            <Text style={[styles.statValue, missingFiles > 0 && styles.statValueRed]}>{missingFiles}</Text>
          </View>
        </View>
      </Card>

      <Card title="Document library" icon="folder-open-outline">
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search document, client, supplier, employee, date"
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
          {documentFilters.map((item) => {
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
            <Text style={styles.listToolbarTitle}>Saved and generated documents</Text>
            <Text style={styles.listToolbarMeta}>Page {page} of {totalPages}</Text>
          </View>
          <Text style={styles.listCountBadge}>{filteredRecords.length} showing</Text>
        </View>

        {filteredRecords.length === 0 ? (
          <Text style={styles.mutedText}>No documents match this search or filter.</Text>
        ) : (
          <View style={styles.invoiceList}>
            {visibleRecords.map((record) => (
              <View style={styles.savedInvoiceCard} key={record.id}>
                <Pressable
                  style={styles.invoiceCollapsedRow}
                  onPress={() => setExpandedDocumentId((current) => (current === record.id ? null : record.id))}
                >
                  <View style={styles.quickActionText}>
                    <Text style={styles.savedInvoiceNo} numberOfLines={1}>{record.title}</Text>
                    <Text style={styles.savedInvoiceMeta} numberOfLines={1}>{record.subtitle}</Text>
                  </View>
                  <View style={styles.savedInvoiceTotalBadge}>
                    <Text style={styles.savedInvoiceStatus}>{documentKindLabel(record.kind).toUpperCase()}</Text>
                    <Text style={[styles.savedInvoiceTotal, !record.hasFile && styles.statValueRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {record.amount === undefined ? record.status : money(record.amount)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={expandedDocumentId === record.id ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color="#667085"
                  />
                </Pressable>

                {expandedDocumentId === record.id ? (
                  <View style={styles.invoiceExpandedDetails}>
                    <View style={styles.clientInvoiceList}>
                      <Text style={styles.clientMeta}>Type: {documentKindLabel(record.kind)}</Text>
                      <Text style={styles.clientMeta}>Date: {record.date || '-'}</Text>
                      <Text style={styles.clientMeta}>Status: {record.status}</Text>
                      <Text style={styles.clientMeta}>Name: {record.title}</Text>
                      <Text style={styles.clientMeta}>{record.subtitle}</Text>
                    </View>
                    <View style={styles.invoiceActionRow}>
                      <Pressable
                        style={[styles.invoicePreviewButton, !record.hasFile && styles.navButtonDisabled]}
                        onPress={() => openDocument(record)}
                        disabled={!record.hasFile}
                      >
                        <MaterialCommunityIcons name="file-eye-outline" size={17} color="#163a5f" />
                        <Text style={styles.invoicePreviewButtonText}>
                          {record.hasFile ? 'Open / Share' : 'Missing File'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
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

function buildDocumentRecords(
  savedInvoices: SavedInvoiceDocument[],
  purchases: PurchaseDocument[],
  expenses: ExpenseDocument[],
  employees: EmployeeDocument[],
  salaries: SalaryDocument[],
) {
  const invoiceRecords: DocumentRecord[] = savedInvoices.map((savedInvoice) => makeDocumentRecord({
    id: `invoice-${savedInvoice.id}`,
    kind: 'invoice',
    title: `${savedInvoice.invoiceNo} Invoice`,
    subtitle: savedInvoice.invoice.toName,
    date: savedInvoice.invoice.invoiceDate,
    status: 'Generated PDF',
    amount: savedInvoice.totals.total,
    hasFile: true,
  }));

  const purchaseRecords: DocumentRecord[] = purchases.map((purchase) => makeDocumentRecord({
    id: `purchase-${purchase.id}`,
    kind: 'purchase',
    title: purchase.sourceFileName || `${purchase.invoiceNo} Purchase PDF`,
    subtitle: `${purchase.supplier.name} | ${purchase.invoiceNo}`,
    date: purchase.invoiceDate,
    status: purchase.sourceFileUri ? 'Uploaded PDF' : 'Missing reference file',
    amount: purchase.totalAmount,
    hasFile: Boolean(purchase.sourceFileUri),
  }));

  const expenseRecords: DocumentRecord[] = expenses.map((expense) => makeDocumentRecord({
    id: `expense-${expense.id}`,
    kind: 'expense',
    title: expense.receiptFileName || `${expense.category} Expense Bill`,
    subtitle: `${expense.vendor || 'Expense'} | ${expense.category}`,
    date: expense.expenseDate,
    status: expense.receiptFileUri ? 'Uploaded receipt/bill' : 'Missing receipt/bill',
    amount: expense.amount,
    hasFile: Boolean(expense.receiptFileUri),
  }));

  const offerRecords: DocumentRecord[] = employees.map((employee) => makeDocumentRecord({
    id: `offer-${employee.id}`,
    kind: 'offer',
    title: `${employee.name} Offer Letter`,
    subtitle: `${employee.role} | Joined ${employee.joinDate}`,
    date: employee.joinDate,
    status: 'Generated PDF',
    amount: employee.baseSalary,
    hasFile: true,
  }));

  const salaryRecords: DocumentRecord[] = salaries.map((salary) => makeDocumentRecord({
    id: `salary-${salary.id}`,
    kind: 'salary',
    title: `${salary.employeeName} Salary Slip`,
    subtitle: `${salary.period} | ${salary.employeeRole || 'Salary'}`,
    date: salary.paymentDate,
    status: 'Generated PDF',
    amount: salary.paidAmount,
    hasFile: true,
  }));

  return [...invoiceRecords, ...purchaseRecords, ...expenseRecords, ...offerRecords, ...salaryRecords].sort((a, b) => {
    const dateDiff = getDisplayDateTime(b.date) - getDisplayDateTime(a.date);
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title);
  });
}

function makeDocumentRecord(record: Omit<DocumentRecord, 'searchable'>): DocumentRecord {
  return {
    ...record,
    searchable: [
      record.title,
      record.subtitle,
      record.date,
      record.status,
      record.kind,
      documentKindLabel(record.kind),
    ].join(' ').toLowerCase(),
  };
}

function documentKindLabel(kind: DocumentKind) {
  if (kind === 'invoice') return 'Invoice';
  if (kind === 'purchase') return 'Purchase PDF';
  if (kind === 'expense') return 'Expense Bill';
  if (kind === 'offer') return 'Offer Letter';
  return 'Salary Slip';
}

async function openStoredFile(uri: string, title: string, mimeType?: string) {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) {
    throw new Error('The saved file is no longer available on this device.');
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: title,
    });
  } else {
    Alert.alert(title, uri);
  }
}

async function shareGeneratedPdf(html: string, title: string) {
  const result = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/pdf',
      dialogTitle: title,
    });
  } else {
    Alert.alert(title, result.uri);
  }
}
