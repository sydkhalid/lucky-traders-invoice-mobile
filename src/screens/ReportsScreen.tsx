import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card } from '../components/common';
import { formatDate, getDisplayDateTime, getInvoiceGstRatePercent, money, numberFormat, sortSavedInvoicesByInvoiceDate } from '../invoiceCore';
import type { ExpenseDocument } from '../nosqlExpenseTable';
import type { PaymentDocument } from '../nosqlPaymentTable';
import type { PurchaseDocument } from '../nosqlPurchaseTable';
import type { SupplierPaymentDocument } from '../nosqlSupplierPaymentTable';
import { purchaseItemQtyKg } from '../purchaseMetrics';
import { styles } from '../styles';
import type { SavedInvoiceDocument } from '../types';

type ReportPeriod = 'businessYear' | 'today' | 'month';

type ProductSaleRow = {
  qty: number;
  grossAmount: number;
  taxableAmount: number;
};

const reportPeriods: { key: ReportPeriod; label: string }[] = [
  { key: 'businessYear', label: 'Business Year' },
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'This Month' },
];

export function ReportsScreen({
  savedInvoices,
  purchases,
  expenses,
  payments,
  supplierPayments,
}: {
  savedInvoices: SavedInvoiceDocument[];
  purchases: PurchaseDocument[];
  expenses: ExpenseDocument[];
  payments: PaymentDocument[];
  supplierPayments: SupplierPaymentDocument[];
}) {
  const [period, setPeriod] = useState<ReportPeriod>('businessYear');
  const today = new Date();
  const todayText = formatDate(today);
  const businessYearLabel = getBusinessYearLabel(today);
  const orderedInvoices = useMemo(() => sortSavedInvoicesByInvoiceDate(savedInvoices), [savedInvoices]);
  const orderedPurchases = useMemo(
    () => [...purchases].sort((a, b) => getDisplayDateTime(b.invoiceDate) - getDisplayDateTime(a.invoiceDate)),
    [purchases],
  );
  const orderedExpenses = useMemo(
    () => [...expenses].sort((a, b) => getDisplayDateTime(b.expenseDate) - getDisplayDateTime(a.expenseDate)),
    [expenses],
  );
  const orderedPayments = useMemo(
    () => [...payments].sort((a, b) => getDisplayDateTime(b.paymentDate) - getDisplayDateTime(a.paymentDate) || b.createdAt.localeCompare(a.createdAt)),
    [payments],
  );
  const orderedSupplierPayments = useMemo(
    () => [...supplierPayments].sort((a, b) => getDisplayDateTime(b.paymentDate) - getDisplayDateTime(a.paymentDate) || b.createdAt.localeCompare(a.createdAt)),
    [supplierPayments],
  );
  const filteredInvoices = useMemo(
    () => orderedInvoices.filter((savedInvoice) => matchesDatePeriod(savedInvoice.invoice.invoiceDate, period, today)),
    [orderedInvoices, period, todayText],
  );
  const filteredPurchases = useMemo(
    () => orderedPurchases.filter((purchase) => matchesDatePeriod(purchase.invoiceDate, period, today)),
    [orderedPurchases, period, todayText],
  );
  const filteredExpenses = useMemo(
    () => orderedExpenses.filter((expense) => matchesDatePeriod(expense.expenseDate, period, today)),
    [orderedExpenses, period, todayText],
  );
  const filteredPayments = useMemo(
    () => orderedPayments.filter((payment) => matchesDatePeriod(payment.paymentDate, period, today)),
    [orderedPayments, period, todayText],
  );
  const filteredSupplierPayments = useMemo(
    () => orderedSupplierPayments.filter((payment) => matchesDatePeriod(payment.paymentDate, period, today)),
    [orderedSupplierPayments, period, todayText],
  );
  const productRows = filteredInvoices.flatMap((savedInvoice) =>
    savedInvoice.totals.rows
      .filter((row) => row.kind === 'product')
      .map((row) => {
        const gstRate = (row.gstRatePercent ?? getInvoiceGstRatePercent(savedInvoice.invoice)) / 100;
        return {
          qty: row.qty || 0,
          grossAmount: row.gstMode === 'included' ? row.amount : row.amount * (1 + gstRate),
          taxableAmount: row.gstMode === 'included' ? row.amount / (1 + gstRate) : row.amount,
        };
      }),
  );
  const purchaseRows = filteredPurchases.flatMap((purchase) =>
    purchase.items.map((item) => {
      const qty = purchaseItemQtyKg(item);
      return {
        qty,
        taxableAmount: item.taxableAmount || (qty && item.rate ? qty * item.rate : 0),
      };
    }),
  );

  const totalSales = filteredInvoices.reduce((sum, savedInvoice) => sum + savedInvoice.totals.total, 0);
  const taxableSales = filteredInvoices.reduce((sum, savedInvoice) => sum + savedInvoice.totals.taxable, 0);
  const totalGst = filteredInvoices.reduce((sum, savedInvoice) => sum + savedInvoice.totals.gst, 0);
  const totalRoundOff = filteredInvoices.reduce((sum, savedInvoice) => sum + savedInvoice.totals.roundOff, 0);
  const totalQty = productRows.reduce((sum, row) => sum + row.qty, 0);
  const productGrossSales = productRows.reduce((sum, row) => sum + row.grossAmount, 0);
  const productTaxableSales = productRows.reduce((sum, row) => sum + row.taxableAmount, 0);
  const totalPurchaseValue = filteredPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);
  const purchaseStockValue = purchaseRows.reduce((sum, row) => sum + row.taxableAmount, 0);
  const totalPurchasedQty = purchaseRows.reduce((sum, row) => sum + row.qty, 0);
  const stockLeftQty = totalPurchasedQty - totalQty;
  const averagePurchaseRate = totalPurchasedQty ? purchaseStockValue / totalPurchasedQty : 0;
  const averagePurchaseWithGst = totalPurchasedQty ? totalPurchaseValue / totalPurchasedQty : 0;
  const estimatedStockValue = stockLeftQty > 0 ? stockLeftQty * averagePurchaseRate : 0;
  const averageSalesWithoutGst = totalQty ? productTaxableSales / totalQty : 0;
  const averageSalesWithGst = totalQty ? productGrossSales / totalQty : 0;
  const estimatedCostOfSoldStock = totalQty * averagePurchaseRate;
  const estimatedProfit = productTaxableSales - estimatedCostOfSoldStock;
  const estimatedProfitMargin = productTaxableSales ? (estimatedProfit / productTaxableSales) * 100 : 0;
  const totalExpense = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const expenseGst = filteredExpenses.reduce((sum, expense) => sum + expense.gstAmount, 0);
  const expenseCost = filteredExpenses.reduce((sum, expense) => sum + Math.max(0, expense.amount - expense.gstAmount), 0);
  const receiptCount = filteredExpenses.filter((expense) => expense.receiptFileUri).length;
  const netProfit = estimatedProfit - expenseCost;
  const netProfitMargin = productTaxableSales ? (netProfit / productTaxableSales) * 100 : 0;
  const gstBreakup = buildGstBreakup(filteredInvoices);
  const purchaseGstBreakup = buildPurchaseGstBreakup(filteredPurchases);
  const purchaseInputGst = purchaseGstBreakup.total;
  const inputGst = purchaseInputGst + expenseGst;
  const outputGst = totalGst;
  const netGst = outputGst - inputGst;
  const gstPayable = Math.max(0, netGst);
  const gstCredit = Math.max(0, -netGst);
  const salesClientCount = countSalesClients(filteredInvoices);
  const filteredInvoiceIds = new Set(filteredInvoices.map((savedInvoice) => savedInvoice.id));
  const filteredInvoiceNos = new Set(filteredInvoices.map((savedInvoice) => savedInvoice.invoiceNo));
  const receivedForPeriodInvoices = payments
    .filter((payment) => filteredInvoiceIds.has(payment.invoiceId) || filteredInvoiceNos.has(payment.invoiceNo))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const collectedInPeriod = filteredPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const pendingSalesBalance = Math.max(0, totalSales - receivedForPeriodInvoices);
  const pendingSalesClients = new Set(
    filteredInvoices
      .filter((savedInvoice) => {
        const invoiceReceived = payments
          .filter((payment) => payment.invoiceId === savedInvoice.id || payment.invoiceNo === savedInvoice.invoiceNo)
          .reduce((sum, payment) => sum + payment.amount, 0);
        return savedInvoice.totals.total - invoiceReceived > 0.009;
      })
      .map((savedInvoice) => savedInvoice.invoice.toName.trim().toLowerCase()),
  ).size;
  const filteredPurchaseIds = new Set(filteredPurchases.map((purchase) => purchase.id));
  const filteredPurchaseNos = new Set(filteredPurchases.map((purchase) => purchase.invoiceNo));
  const paidForPeriodPurchases = supplierPayments
    .filter((payment) => filteredPurchaseIds.has(payment.purchaseId) || filteredPurchaseNos.has(payment.purchaseInvoiceNo))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const supplierPaidInPeriod = filteredSupplierPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const supplierBalancePayable = Math.max(0, totalPurchaseValue - paidForPeriodPurchases);
  const payableSupplierCount = new Set(
    filteredPurchases
      .filter((purchase) => {
        const purchasePaid = supplierPayments
          .filter((payment) => payment.purchaseId === purchase.id || payment.purchaseInvoiceNo === purchase.invoiceNo)
          .reduce((sum, payment) => sum + payment.amount, 0);
        return purchase.totalAmount - purchasePaid > 0.009;
      })
      .map((purchase) => purchase.supplier.name.trim().toLowerCase()),
  ).size;
  const periodLabel = reportPeriods.find((item) => item.key === period)?.label || 'Business Year';

  if (savedInvoices.length === 0 && purchases.length === 0 && expenses.length === 0 && payments.length === 0 && supplierPayments.length === 0) {
    return (
      <View style={styles.stack}>
        <Card title="Reports" icon="file-chart-outline">
          <Text style={styles.mutedText}>No saved purchases or invoices yet. Reports will appear after stock purchase and sales data are saved.</Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>REPORTS</Text>
          <Text style={styles.pageTitle}>Sales report</Text>
          <Text style={styles.pageSubtitle}>
            {periodLabel} | {businessYearLabel} | {filteredInvoices.length} sale bill{filteredInvoices.length === 1 ? '' : 's'} | {filteredPurchases.length} purchase bill{filteredPurchases.length === 1 ? '' : 's'} | {filteredExpenses.length} expense{filteredExpenses.length === 1 ? '' : 's'} | {filteredPayments.length} receipt{filteredPayments.length === 1 ? '' : 's'} | {filteredSupplierPayments.length} supplier payment{filteredSupplierPayments.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <Card title="Report period" icon="calendar-filter-outline">
        <View style={styles.filterChipRow}>
          {reportPeriods.map((item) => {
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

      {filteredInvoices.length === 0 && filteredPurchases.length === 0 && filteredExpenses.length === 0 && filteredPayments.length === 0 && filteredSupplierPayments.length === 0 ? (
        <Card title="No data" icon="database-off-outline">
          <Text style={styles.mutedText}>No purchase, sales, or expense entries found for this report period.</Text>
        </Card>
      ) : (
        <>
          <Card title="Stock summary" icon="warehouse">
            <View style={styles.statGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Purchase stock</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {numberFormat(totalPurchasedQty)}
                </Text>
                <Text style={styles.reportSubValue}>Kg</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Sales stock</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {numberFormat(totalQty)}
                </Text>
                <Text style={styles.reportSubValue}>Kg</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Stock left</Text>
                <Text
                  style={[styles.statValue, stockLeftQty >= 0 ? styles.statValueGreen : styles.statValueRed]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {numberFormat(stockLeftQty)}
                </Text>
                <Text style={styles.reportSubValue}>Kg</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Purchase bills</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(totalPurchaseValue)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Sales bills</Text>
                <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(totalSales)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Stock value</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(estimatedStockValue)}
                </Text>
                <Text style={styles.reportSubValue}>At avg cost {money(averagePurchaseRate)}/Kg</Text>
              </View>
            </View>
          </Card>

          <Card title="Purchase summary" icon="cart-arrow-down">
            <View style={styles.statGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Purchase with GST</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(totalPurchaseValue)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Purchase without GST</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(purchaseStockValue)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Purchase GST</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(purchaseInputGst)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Purchase qty</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {numberFormat(totalPurchasedQty)}
                </Text>
                <Text style={styles.reportSubValue}>Kg</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Avg with GST</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(averagePurchaseWithGst)}
                </Text>
                <Text style={styles.reportSubValue}>Per Kg</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Avg without GST</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(averagePurchaseRate)}
                </Text>
                <Text style={styles.reportSubValue}>Per Kg</Text>
              </View>
            </View>
          </Card>

          {filteredPurchases.length > 0 || filteredSupplierPayments.length > 0 ? (
            <Card title="Supplier payable summary" icon="cash-multiple">
              <View style={styles.statGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Purchase bills</Text>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {money(totalPurchaseValue)}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Paid for purchases</Text>
                  <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {money(paidForPeriodPurchases)}
                  </Text>
                  <Text style={styles.reportSubValue}>All payments against period purchases</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Balance payable</Text>
                  <Text style={[styles.statValue, supplierBalancePayable > 0 ? styles.statValueRed : styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {money(supplierBalancePayable)}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Paid in period</Text>
                  <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {money(supplierPaidInPeriod)}
                  </Text>
                  <Text style={styles.reportSubValue}>By payment date</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Supplier payments</Text>
                  <Text style={styles.statValue}>{filteredSupplierPayments.length}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Payable suppliers</Text>
                  <Text style={[styles.statValue, payableSupplierCount > 0 && styles.statValueRed]}>{payableSupplierCount}</Text>
                </View>
              </View>
            </Card>
          ) : null}

          <Card title="Profit summary" icon="chart-line">
            <View style={styles.statGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Sales without GST</Text>
                <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(productTaxableSales)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Sold stock cost</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(estimatedCostOfSoldStock)}
                </Text>
                <Text style={styles.reportSubValue}>Avg purchase cost x sold Kg</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Estimated profit</Text>
                <Text
                  style={[styles.statValue, estimatedProfit >= 0 ? styles.statValueGreen : styles.statValueRed]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {money(estimatedProfit)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Gross margin</Text>
                <Text
                  style={[styles.statValue, estimatedProfitMargin >= 0 ? styles.statValueGreen : styles.statValueRed]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {numberFormat(estimatedProfitMargin)}%
                </Text>
                <Text style={styles.reportSubValue}>On sales without GST</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Expense cost</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(expenseCost)}
                </Text>
                <Text style={styles.reportSubValue}>Expense minus GST</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Net profit</Text>
                <Text
                  style={[styles.statValue, netProfit >= 0 ? styles.statValueGreen : styles.statValueRed]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {money(netProfit)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Net margin</Text>
                <Text
                  style={[styles.statValue, netProfitMargin >= 0 ? styles.statValueGreen : styles.statValueRed]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {numberFormat(netProfitMargin)}%
                </Text>
                <Text style={styles.reportSubValue}>After expenses</Text>
              </View>
            </View>
          </Card>

          <Card title="Expense summary" icon="wallet-outline">
            <View style={styles.statGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total expense</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(totalExpense)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Expense GST</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(expenseGst)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Expense cost</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(expenseCost)}
                </Text>
                <Text style={styles.reportSubValue}>Without GST</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Expense bills</Text>
                <Text style={styles.statValue}>{filteredExpenses.length}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Receipts</Text>
                <Text style={styles.statValue}>{receiptCount}</Text>
              </View>
            </View>
          </Card>

          <Card title="GST ledger" icon="book-open-page-variant-outline">
            <View style={styles.reportGrid}>
              <View style={styles.reportTile}>
                <Text style={styles.reportLabel}>Total GST collected</Text>
                <Text style={[styles.reportValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(outputGst)}
                </Text>
                <Text style={styles.reportSubValue}>Sales output GST</Text>
              </View>
              <View style={styles.reportTile}>
                <Text style={styles.reportLabel}>Total GST paid</Text>
                <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(inputGst)}
                </Text>
                <Text style={styles.reportSubValue}>Purchase + expense GST</Text>
              </View>
              <View style={styles.reportTile}>
                <Text style={styles.reportLabel}>GST payable</Text>
                <Text
                  style={[styles.reportValue, gstPayable > 0 && styles.statValueRed]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {money(gstPayable)}
                </Text>
                <Text style={styles.reportSubValue}>Collected minus paid</Text>
              </View>
              <View style={styles.reportTile}>
                <Text style={styles.reportLabel}>Credit ledger</Text>
                <Text
                  style={[styles.reportValue, gstCredit > 0 && styles.statValueGreen]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {money(gstCredit)}
                </Text>
                <Text style={styles.reportSubValue}>Extra GST paid</Text>
              </View>
              <View style={styles.reportTile}>
                <Text style={styles.reportLabel}>Purchase CGST / SGST</Text>
                <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {money(purchaseGstBreakup.cgst + purchaseGstBreakup.sgst)}
                </Text>
                <Text style={styles.reportSubValue}>CGST {money(purchaseGstBreakup.cgst)} | SGST {money(purchaseGstBreakup.sgst)}</Text>
              </View>
              <View style={styles.reportTile}>
                <Text style={styles.reportLabel}>Paid IGST</Text>
                <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {money(purchaseGstBreakup.igst)}
                </Text>
                <Text style={styles.reportSubValue}>Purchase IGST credit</Text>
              </View>
            </View>
          </Card>

          {filteredInvoices.length > 0 || filteredPayments.length > 0 ? (
            <Card title="Collection summary" icon="cash-check">
              <View style={styles.statGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Sales bills</Text>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {money(totalSales)}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Received for sales</Text>
                  <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {money(receivedForPeriodInvoices)}
                  </Text>
                  <Text style={styles.reportSubValue}>All receipts against period invoices</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Pending balance</Text>
                  <Text style={[styles.statValue, pendingSalesBalance > 0 ? styles.statValueRed : styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {money(pendingSalesBalance)}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Collected in period</Text>
                  <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {money(collectedInPeriod)}
                  </Text>
                  <Text style={styles.reportSubValue}>By payment date</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Receipts</Text>
                  <Text style={styles.statValue}>{filteredPayments.length}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Pending clients</Text>
                  <Text style={[styles.statValue, pendingSalesClients > 0 && styles.statValueRed]}>{pendingSalesClients}</Text>
                </View>
              </View>
            </Card>
          ) : null}

          {filteredInvoices.length > 0 ? (
            <>
              <Card title="Sales summary" icon="chart-box-outline">
                <View style={styles.statGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Total sales</Text>
                    <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {money(totalSales)}
                    </Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Invoices</Text>
                    <Text style={styles.statValue}>{filteredInvoices.length}</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Clients</Text>
                    <Text style={styles.statValue}>{salesClientCount}</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Qty sold</Text>
                    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {numberFormat(totalQty)}
                    </Text>
                    <Text style={styles.reportSubValue}>Kg</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Avg with GST</Text>
                    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {money(averageSalesWithGst)}
                    </Text>
                    <Text style={styles.reportSubValue}>Per Kg</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Avg without GST</Text>
                    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {money(averageSalesWithoutGst)}
                    </Text>
                    <Text style={styles.reportSubValue}>Per Kg</Text>
                  </View>
                </View>
              </Card>

              <Card title="GST and tax report" icon="calculator-variant-outline">
                <View style={styles.reportGrid}>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>Taxable value</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {money(taxableSales)}
                    </Text>
                  </View>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>CGST</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {money(gstBreakup.cgst)}
                    </Text>
                  </View>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>SGST</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {money(gstBreakup.sgst)}
                    </Text>
                  </View>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>IGST</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {money(gstBreakup.igst)}
                    </Text>
                  </View>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>Total GST</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {money(totalGst)}
                    </Text>
                  </View>
                  <View style={styles.reportTile}>
                    <Text style={styles.reportLabel}>Round off</Text>
                    <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                      {money(totalRoundOff)}
                    </Text>
                  </View>
                </View>
              </Card>
            </>
          ) : (
            <Card title="Sales report" icon="chart-box-outline">
              <Text style={styles.mutedText}>No sales invoices found for this report period.</Text>
            </Card>
          )}
        </>
      )}
    </View>
  );
}

function matchesDatePeriod(dateValue: string, period: ReportPeriod, today: Date) {
  const invoiceTime = getDisplayDateTime(dateValue);
  if (!invoiceTime) return false;

  const invoiceDate = new Date(invoiceTime);
  if (period === 'businessYear') {
    const { startTime, endTime } = getBusinessYearRange(today);
    return invoiceTime >= startTime && invoiceTime < endTime;
  }
  if (period === 'today') {
    return invoiceDate.getFullYear() === today.getFullYear() &&
      invoiceDate.getMonth() === today.getMonth() &&
      invoiceDate.getDate() === today.getDate();
  }

  return invoiceDate.getFullYear() === today.getFullYear() && invoiceDate.getMonth() === today.getMonth();
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

function buildGstBreakup(savedInvoices: SavedInvoiceDocument[]) {
  return savedInvoices.reduce(
    (sum, savedInvoice) => {
      if (savedInvoice.invoice.gstType === 'igst') {
        sum.igst += savedInvoice.totals.gst;
      } else {
        sum.cgst += savedInvoice.totals.gst / 2;
        sum.sgst += savedInvoice.totals.gst / 2;
      }

      return sum;
    },
    { cgst: 0, sgst: 0, igst: 0 },
  );
}

function buildPurchaseGstBreakup(purchases: PurchaseDocument[]) {
  return purchases.reduce(
    (sum, purchase) => {
      sum.cgst += purchase.cgst || 0;
      sum.sgst += purchase.sgst || 0;
      sum.igst += purchase.igst || 0;
      sum.total += purchase.totalGst || purchase.cgst + purchase.sgst + purchase.igst;
      return sum;
    },
    { cgst: 0, sgst: 0, igst: 0, total: 0 },
  );
}

function countSalesClients(savedInvoices: SavedInvoiceDocument[]) {
  const clientKeys = new Set<string>();

  savedInvoices.forEach((savedInvoice) => {
    const name = savedInvoice.invoice.toName || 'Unknown client';
    const gstin = savedInvoice.invoice.toGstin || '';
    const phone = savedInvoice.invoice.toPhone || '';
    const normalizedGstin = gstin.trim().toLowerCase();
    const normalizedPhone = phone.replace(/\D/g, '');
    const key = normalizedGstin && normalizedGstin !== 'urp'
      ? `gst:${normalizedGstin}`
      : normalizedPhone
        ? `phone:${normalizedPhone}`
        : `name:${name.trim().toLowerCase()}`;

    clientKeys.add(key);
  });

  return clientKeys.size;
}
