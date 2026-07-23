import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card } from '../components/common';
import { GST_RATE, formatDate, getDisplayDateTime, money, numberFormat, sortSavedInvoicesByInvoiceDate } from '../invoiceCore';
import type { ExpenseDocument } from '../nosqlExpenseTable';
import type { PurchaseDocument } from '../nosqlPurchaseTable';
import { styles } from '../styles';
import type { InvoiceRow, SavedInvoiceDocument } from '../types';

type GstPeriod = 'businessYear' | 'month' | 'today';

type TaxBreakup = {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  invoiceValue: number;
  roundOff: number;
};

type HsnSummaryRow = {
  key: string;
  hsn: string;
  description: string;
  qty: number;
  taxable: number;
  gst: number;
  invoiceValue: number;
  invoices: Set<string>;
};

const gstPeriods: { key: GstPeriod; label: string }[] = [
  { key: 'businessYear', label: 'Business Year' },
  { key: 'month', label: 'This Month' },
  { key: 'today', label: 'Today' },
];

export function GstFilingScreen({
  savedInvoices,
  purchases,
  expenses,
}: {
  savedInvoices: SavedInvoiceDocument[];
  purchases: PurchaseDocument[];
  expenses: ExpenseDocument[];
}) {
  const [period, setPeriod] = useState<GstPeriod>('businessYear');
  const today = new Date();
  const todayText = formatDate(today);
  const periodLabel = gstPeriods.find((item) => item.key === period)?.label || 'Business Year';
  const businessYearLabel = getBusinessYearLabel(today);

  const filteredInvoices = useMemo(
    () => sortSavedInvoicesByInvoiceDate(savedInvoices).filter((invoice) => matchesGstPeriod(invoice.invoice.invoiceDate, period, today)),
    [period, savedInvoices, todayText],
  );
  const filteredPurchases = useMemo(
    () => [...purchases]
      .sort((a, b) => getDisplayDateTime(b.invoiceDate) - getDisplayDateTime(a.invoiceDate))
      .filter((purchase) => matchesGstPeriod(purchase.invoiceDate, period, today)),
    [period, purchases, todayText],
  );
  const filteredExpenses = useMemo(
    () => [...expenses]
      .sort((a, b) => getDisplayDateTime(b.expenseDate) - getDisplayDateTime(a.expenseDate))
      .filter((expense) => matchesGstPeriod(expense.expenseDate, period, today)),
    [expenses, period, todayText],
  );
  const gstr1 = useMemo(() => buildGstr1Summary(filteredInvoices), [filteredInvoices]);
  const purchaseItc = useMemo(() => buildPurchaseItc(filteredPurchases), [filteredPurchases]);
  const expenseItc = filteredExpenses.reduce((sum, expense) => sum + expense.gstAmount, 0);
  const inputCredit = purchaseItc.totalGst + expenseItc;
  const outputGst = gstr1.totalGst;
  const netGst = outputGst - inputCredit;
  const gstPayable = Math.max(0, netGst);
  const gstCredit = Math.max(0, -netGst);
  const b2bInvoices = filteredInvoices.filter((invoice) => isRegisteredGstin(invoice.invoice.toGstin)).length;
  const urpInvoices = filteredInvoices.length - b2bInvoices;
  const hsnRows = useMemo(() => buildHsnSummary(filteredInvoices), [filteredInvoices]);

  if (savedInvoices.length === 0 && purchases.length === 0 && expenses.length === 0) {
    return (
      <View style={styles.stack}>
        <Card title="GST Filing Summary" icon="calculator-variant-outline">
          <Text style={styles.mutedText}>No sales, purchase, or expense data available for GST filing summary.</Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>GST FILING</Text>
          <Text style={styles.pageTitle}>GST Filing Summary</Text>
          <Text style={styles.pageSubtitle}>
            {periodLabel} | {businessYearLabel} | {filteredInvoices.length} sales | {filteredPurchases.length} purchases | {filteredExpenses.length} expenses
          </Text>
        </View>
      </View>

      <Card title="Filing period" icon="calendar-filter-outline">
        <View style={styles.filterChipRow}>
          {gstPeriods.map((item) => {
            const selected = period === item.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => setPeriod(item.key)}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card title="GSTR-1 sales summary" icon="file-chart-outline">
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Invoice value</Text>
            <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstr1.invoiceValue)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Taxable value</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstr1.taxable)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>GST collected</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstr1.totalGst)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>B2B invoices</Text>
            <Text style={styles.statValue}>{b2bInvoices}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>URP invoices</Text>
            <Text style={styles.statValue}>{urpInvoices}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Round off</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstr1.roundOff)}
            </Text>
          </View>
        </View>
      </Card>

      <Card title="GSTR-1 tax breakup" icon="calculator-variant-outline">
        <View style={styles.reportGrid}>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>CGST</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstr1.cgst)}
            </Text>
          </View>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>SGST</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstr1.sgst)}
            </Text>
          </View>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>IGST</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstr1.igst)}
            </Text>
          </View>
        </View>
      </Card>

      <Card title="GSTR-3B summary" icon="book-open-page-variant-outline">
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Outward taxable</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstr1.taxable)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Output GST</Text>
            <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(outputGst)}
            </Text>
            <Text style={styles.reportSubValue}>GST collected</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Input credit</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(inputCredit)}
            </Text>
            <Text style={styles.reportSubValue}>GST paid</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>GST payable</Text>
            <Text style={[styles.statValue, gstPayable > 0 && styles.statValueRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstPayable)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Credit ledger</Text>
            <Text style={[styles.statValue, gstCredit > 0 && styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstCredit)}
            </Text>
          </View>
        </View>
      </Card>

      <Card title="Input tax credit" icon="cart-arrow-down">
        <View style={styles.reportGrid}>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>Purchase CGST</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(purchaseItc.cgst)}
            </Text>
          </View>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>Purchase SGST</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(purchaseItc.sgst)}
            </Text>
          </View>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>Purchase IGST</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(purchaseItc.igst)}
            </Text>
          </View>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>Expense GST</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(expenseItc)}
            </Text>
          </View>
          <View style={styles.reportTile}>
            <Text style={styles.reportLabel}>Total GST paid</Text>
            <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(inputCredit)}
            </Text>
          </View>
        </View>
      </Card>

      <Card title="HSN sales summary" icon="format-list-bulleted-square">
        {hsnRows.length === 0 ? (
          <Text style={styles.mutedText}>No HSN sales rows found for this period.</Text>
        ) : (
          <View style={styles.reportList}>
            {hsnRows.slice(0, 10).map((row) => (
              <View style={styles.reportRow} key={row.key}>
                <View style={styles.quickActionText}>
                  <Text style={styles.reportRowTitle}>{row.description}</Text>
                  <Text style={styles.reportRowMeta}>
                    HSN: {row.hsn || '-'} | {row.invoices.size} invoice{row.invoices.size === 1 ? '' : 's'} | Qty {numberFormat(row.qty)} Kg
                  </Text>
                  <Text style={styles.reportRowMeta}>Taxable {money(row.taxable)} | GST {money(row.gst)}</Text>
                </View>
                <Text style={styles.reportRowAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {money(row.invoiceValue)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

function matchesGstPeriod(dateValue: string, period: GstPeriod, today: Date) {
  const itemTime = getDisplayDateTime(dateValue);
  if (!itemTime) return false;

  const itemDate = new Date(itemTime);
  if (period === 'businessYear') {
    const { startTime, endTime } = getBusinessYearRange(today);
    return itemTime >= startTime && itemTime < endTime;
  }
  if (period === 'today') {
    return itemDate.getFullYear() === today.getFullYear() &&
      itemDate.getMonth() === today.getMonth() &&
      itemDate.getDate() === today.getDate();
  }

  return itemDate.getFullYear() === today.getFullYear() && itemDate.getMonth() === today.getMonth();
}

function getBusinessYearRange(today: Date) {
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return {
    startTime: new Date(startYear, 3, 1).getTime(),
    endTime: new Date(startYear + 1, 3, 1).getTime(),
  };
}

function getBusinessYearLabel(today: Date) {
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

function buildGstr1Summary(invoices: SavedInvoiceDocument[]): TaxBreakup {
  return invoices.reduce(
    (sum, savedInvoice) => {
      sum.taxable += savedInvoice.totals.taxable;
      sum.totalGst += savedInvoice.totals.gst;
      sum.invoiceValue += savedInvoice.totals.total;
      sum.roundOff += savedInvoice.totals.roundOff;

      if (savedInvoice.invoice.gstType === 'igst') {
        sum.igst += savedInvoice.totals.gst;
      } else {
        sum.cgst += savedInvoice.totals.gst / 2;
        sum.sgst += savedInvoice.totals.gst / 2;
      }

      return sum;
    },
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0, invoiceValue: 0, roundOff: 0 },
  );
}

function buildPurchaseItc(purchases: PurchaseDocument[]): TaxBreakup {
  return purchases.reduce(
    (sum, purchase) => {
      sum.taxable += purchase.taxableValue || 0;
      sum.cgst += purchase.cgst || 0;
      sum.sgst += purchase.sgst || 0;
      sum.igst += purchase.igst || 0;
      sum.totalGst += purchase.totalGst || 0;
      sum.invoiceValue += purchase.totalAmount || 0;
      sum.roundOff += purchase.roundOff || 0;
      return sum;
    },
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0, invoiceValue: 0, roundOff: 0 },
  );
}

function buildHsnSummary(invoices: SavedInvoiceDocument[]) {
  const rows = new Map<string, HsnSummaryRow>();

  invoices.forEach((savedInvoice) => {
    savedInvoice.totals.rows
      .filter((row) => row.kind === 'product')
      .forEach((row) => {
        const key = `${normalizeValue(row.hsn)}-${normalizeValue(row.description)}`;
        const summary = rows.get(key) || {
          key,
          hsn: row.hsn,
          description: row.description || 'Product',
          qty: 0,
          taxable: 0,
          gst: 0,
          invoiceValue: 0,
          invoices: new Set<string>(),
        };
        const taxable = getRowTaxableValue(row);
        const gst = getRowGstValue(row);
        const invoiceValue = taxable + gst;

        summary.qty += row.qty || 0;
        summary.taxable += taxable;
        summary.gst += gst;
        summary.invoiceValue += invoiceValue;
        summary.invoices.add(savedInvoice.id);
        rows.set(key, summary);
      });
  });

  return Array.from(rows.values()).sort((a, b) => b.invoiceValue - a.invoiceValue);
}

function getRowTaxableValue(row: InvoiceRow) {
  return row.gstMode === 'included' ? row.amount / (1 + GST_RATE) : row.amount;
}

function getRowGstValue(row: InvoiceRow) {
  return row.gstMode === 'included' ? row.amount - row.amount / (1 + GST_RATE) : row.amount * GST_RATE;
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function isRegisteredGstin(value: string) {
  const normalized = value.trim().toUpperCase();
  return Boolean(normalized && normalized !== 'URP' && /^[0-9]{2}[A-Z0-9]{13}$/.test(normalized));
}
