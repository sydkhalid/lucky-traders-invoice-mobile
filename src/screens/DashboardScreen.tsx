import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Card } from '../components/common';
import { formatDate, getDisplayDateTime, getInvoiceGstRatePercent, money, numberFormat } from '../invoiceCore';
import type { ClientDocument } from '../nosqlClientTable';
import type { EmployeeDocument, SalaryDocument } from '../nosqlEmployeeTable';
import type { ExpenseDocument } from '../nosqlExpenseTable';
import type { PaymentDocument } from '../nosqlPaymentTable';
import type { ProductDocument } from '../nosqlProductTable';
import type { PurchaseDocument } from '../nosqlPurchaseTable';
import type { SupplierPaymentDocument } from '../nosqlSupplierPaymentTable';
import type { SupplierDocument } from '../nosqlSupplierTable';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { purchaseItemQtyKg } from '../purchaseMetrics';
import { styles } from '../styles';
import type { SavedInvoiceDocument } from '../types';

export function DashboardScreen({
  user,
  clients,
  suppliers,
  products,
  purchases,
  employees,
  salaries,
  expenses,
  payments,
  supplierPayments,
  savedInvoices,
  onOpenClients,
  onOpenInvoice,
  onOpenPurchases,
  onOpenPayments,
  onOpenSupplierPayments,
  onOpenExpenses,
  onOpenEmployees,
  onOpenSuppliers,
  onOpenInventory,
  onOpenDocuments,
  onOpenGstFiling,
  onOpenReports,
}: {
  user: AuthenticatedUser;
  clients: ClientDocument[];
  suppliers: SupplierDocument[];
  products: ProductDocument[];
  purchases: PurchaseDocument[];
  employees: EmployeeDocument[];
  salaries: SalaryDocument[];
  expenses: ExpenseDocument[];
  payments: PaymentDocument[];
  supplierPayments: SupplierPaymentDocument[];
  savedInvoices: SavedInvoiceDocument[];
  onOpenClients: () => void;
  onOpenInvoice: () => void;
  onOpenPurchases: () => void;
  onOpenPayments: () => void;
  onOpenSupplierPayments: () => void;
  onOpenExpenses: () => void;
  onOpenEmployees: () => void;
  onOpenSuppliers: () => void;
  onOpenInventory: () => void;
  onOpenDocuments: () => void;
  onOpenGstFiling: () => void;
  onOpenReports: () => void;
}) {
  const today = new Date();
  const todayText = formatDate(today);
  const businessYearLabel = getBusinessYearLabel(today);
  const { width } = useWindowDimensions();
  const isCompactPhone = width < 420;
  const isVeryCompactPhone = width < 360;
  const compactCardStyle = [
    styles.statCard,
    isVeryCompactPhone && styles.statCardCompact,
    isCompactPhone && !isVeryCompactPhone && styles.statCardTwoColumn,
  ];

  const fyInvoices = savedInvoices.filter((invoice) => matchesBusinessYear(invoice.invoice.invoiceDate, today));
  const fyPurchases = purchases.filter((purchase) => matchesBusinessYear(purchase.invoiceDate, today));
  const fyExpenses = expenses.filter((expense) => matchesBusinessYear(expense.expenseDate, today));
  const fyPayments = payments.filter((payment) => matchesBusinessYear(payment.paymentDate, today));
  const fySupplierPayments = supplierPayments.filter((payment) => matchesBusinessYear(payment.paymentDate, today));
  const fySalaries = salaries.filter((salary) => matchesBusinessYear(salary.paymentDate, today));
  const todayInvoices = fyInvoices.filter((invoice) => invoice.invoice.invoiceDate === todayText);
  const activeEmployees = employees.filter((employee) => employee.status === 'active').length;

  const productSaleRows = fyInvoices.flatMap((savedInvoice) =>
    savedInvoice.totals.rows
      .filter((row) => row.kind === 'product')
      .map((row) => {
        const gstRate = (row.gstRatePercent ?? getInvoiceGstRatePercent(savedInvoice.invoice)) / 100;
        return {
          qty: row.qty || 0,
          taxableAmount: row.gstMode === 'included' ? row.amount / (1 + gstRate) : row.amount,
        };
      }),
  );
  const salesQty = productSaleRows.reduce((sum, row) => sum + row.qty, 0);
  const salesTotal = fyInvoices.reduce((sum, invoice) => sum + invoice.totals.total, 0);
  const productTaxableSales = productSaleRows.reduce((sum, row) => sum + row.taxableAmount, 0);
  const outputGst = fyInvoices.reduce((sum, invoice) => sum + invoice.totals.gst, 0);
  const todaySales = todayInvoices.reduce((sum, invoice) => sum + invoice.totals.total, 0);

  const purchaseRows = fyPurchases.flatMap((purchase) =>
    purchase.items.map((item) => {
      const qty = purchaseItemQtyKg(item);
      return {
        qty,
        taxableAmount: item.taxableAmount || (qty && item.rate ? qty * item.rate : 0),
      };
    }),
  );
  const purchaseQty = purchaseRows.reduce((sum, row) => sum + row.qty, 0);
  const purchaseTaxable = purchaseRows.reduce((sum, row) => sum + row.taxableAmount, 0);
  const purchaseTotal = fyPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);
  const purchaseGst = fyPurchases.reduce((sum, purchase) => sum + (purchase.totalGst || purchase.cgst + purchase.sgst + purchase.igst), 0);
  const averagePurchaseRate = purchaseQty ? purchaseTaxable / purchaseQty : 0;
  const stockLeft = purchaseQty - salesQty;
  const stockValue = stockLeft > 0 ? stockLeft * averagePurchaseRate : 0;

  const invoiceIds = new Set(fyInvoices.map((invoice) => invoice.id));
  const invoiceNos = new Set(fyInvoices.map((invoice) => invoice.invoiceNo));
  const receivedAgainstFyInvoices = payments
    .filter((payment) => invoiceIds.has(payment.invoiceId) || invoiceNos.has(payment.invoiceNo))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const pendingReceivable = Math.max(0, salesTotal - receivedAgainstFyInvoices);
  const collectedThisYear = fyPayments.reduce((sum, payment) => sum + payment.amount, 0);

  const purchaseIds = new Set(fyPurchases.map((purchase) => purchase.id));
  const purchaseNos = new Set(fyPurchases.map((purchase) => purchase.invoiceNo));
  const paidAgainstFyPurchases = supplierPayments
    .filter((payment) => purchaseIds.has(payment.purchaseId) || purchaseNos.has(payment.purchaseInvoiceNo))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const pendingPayable = Math.max(0, purchaseTotal - paidAgainstFyPurchases);
  const paidSuppliersThisYear = fySupplierPayments.reduce((sum, payment) => sum + payment.amount, 0);

  const expenseTotal = fyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const expenseGst = fyExpenses.reduce((sum, expense) => sum + expense.gstAmount, 0);
  const expenseCost = fyExpenses.reduce((sum, expense) => sum + Math.max(0, expense.amount - expense.gstAmount), 0);
  const salaryPaid = fySalaries.reduce((sum, salary) => sum + salary.paidAmount, 0);
  const inputGst = purchaseGst + expenseGst;
  const gstBalance = outputGst - inputGst;
  const gstPayable = Math.max(0, gstBalance);
  const gstCredit = Math.max(0, -gstBalance);

  const costOfSoldStock = salesQty * averagePurchaseRate;
  const grossProfit = productTaxableSales - costOfSoldStock;
  const netProfit = grossProfit - expenseCost - salaryPaid;
  const grossMargin = productTaxableSales ? (grossProfit / productTaxableSales) * 100 : 0;
  const netMargin = productTaxableSales ? (netProfit / productTaxableSales) * 100 : 0;
  const uploadedDocumentCount =
    fyPurchases.filter((purchase) => purchase.sourceFileUri).length +
    fyExpenses.filter((expense) => expense.receiptFileUri).length +
    fyInvoices.length +
    fySalaries.length;

  return (
    <View style={styles.stack}>
      <View style={[styles.dashboardHero, isVeryCompactPhone && { padding: 12 }]}>
        <View style={[styles.dashboardHeroTop, isCompactPhone && styles.dashboardHeroTopCompact]}>
          <View style={styles.dashboardIdentity}>
            <View style={styles.dashboardAvatar}>
              <MaterialCommunityIcons name={user.role === 'admin' ? 'shield-account-outline' : 'account-tie-outline'} size={26} color="#ffffff" />
            </View>
            <View style={styles.quickActionText}>
              <Text style={styles.dashboardKicker}>LUCKY TRADERS</Text>
              <Text style={styles.dashboardTitle}>Dashboard</Text>
              <Text style={styles.dashboardSubtitle}>
                {businessYearLabel} | {fyInvoices.length} invoices | {fyPurchases.length} purchases
              </Text>
            </View>
          </View>
          <Text style={[styles.dashboardPill, isCompactPhone && styles.dashboardPillCompact]}>{todayText}</Text>
        </View>

        <View style={[styles.dashboardMetricStrip, isCompactPhone && styles.dashboardMetricStripCompact]}>
          <Pressable style={[styles.dashboardMetric, isCompactPhone && styles.dashboardMetricCompact]} onPress={onOpenReports}>
            <Text style={styles.dashboardMetricLabel}>Net profit</Text>
            <Text
              style={[styles.dashboardMetricValue, netProfit < 0 && styles.dashboardMetricValueRed]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {money(netProfit)}
            </Text>
            <Text style={styles.dashboardMetricHint}>Margin {numberFormat(netMargin)}%</Text>
          </Pressable>
          <Pressable style={[styles.dashboardMetric, isCompactPhone && styles.dashboardMetricCompact]} onPress={onOpenInvoice}>
            <Text style={styles.dashboardMetricLabel}>Today sales</Text>
            <Text style={styles.dashboardMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(todaySales)}
            </Text>
            <Text style={styles.dashboardMetricHint}>{todayInvoices.length} bills today</Text>
          </Pressable>
        </View>
      </View>

      <Card title="Business snapshot" icon="view-dashboard-outline">
        <View style={styles.statGrid}>
          <Pressable style={compactCardStyle} onPress={onOpenInvoice}>
            <Text style={styles.statLabel}>Sales</Text>
            <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(salesTotal)}
            </Text>
            <Text style={styles.reportSubValue}>{numberFormat(salesQty)} Kg | {fyInvoices.length} bills</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenPurchases}>
            <Text style={styles.statLabel}>Purchase</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(purchaseTotal)}
            </Text>
            <Text style={styles.reportSubValue}>{numberFormat(purchaseQty)} Kg | {fyPurchases.length} bills</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenInventory}>
            <Text style={styles.statLabel}>Stock left</Text>
            <Text style={[styles.statValue, stockLeft >= 0 ? styles.statValueGreen : styles.statValueRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {numberFormat(stockLeft)}
            </Text>
            <Text style={styles.reportSubValue}>Kg | {money(stockValue)}</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="Money overview" icon="cash-multiple">
        <View style={styles.statGrid}>
          <Pressable style={compactCardStyle} onPress={onOpenPayments}>
            <Text style={styles.statLabel}>Received</Text>
            <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(collectedThisYear)}
            </Text>
            <Text style={styles.reportSubValue}>Receipts this FY</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenPayments}>
            <Text style={styles.statLabel}>Receivable</Text>
            <Text style={[styles.statValue, pendingReceivable > 0 ? styles.statValueRed : styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(pendingReceivable)}
            </Text>
            <Text style={styles.reportSubValue}>Pending from clients</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenSupplierPayments}>
            <Text style={styles.statLabel}>Supplier payable</Text>
            <Text style={[styles.statValue, pendingPayable > 0 ? styles.statValueRed : styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(pendingPayable)}
            </Text>
            <Text style={styles.reportSubValue}>Paid {money(paidSuppliersThisYear)}</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="Profit and GST" icon="calculator-variant-outline">
        <View style={styles.statGrid}>
          <Pressable style={compactCardStyle} onPress={onOpenReports}>
            <Text style={styles.statLabel}>Sales without GST</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(productTaxableSales)}
            </Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenReports}>
            <Text style={styles.statLabel}>Gross profit</Text>
            <Text style={[styles.statValue, grossProfit >= 0 ? styles.statValueGreen : styles.statValueRed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(grossProfit)}
            </Text>
            <Text style={styles.reportSubValue}>Margin {numberFormat(grossMargin)}%</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenGstFiling}>
            <Text style={styles.statLabel}>GST payable</Text>
            <Text style={[styles.statValue, gstPayable > 0 ? styles.statValueRed : styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(gstPayable)}
            </Text>
            <Text style={styles.reportSubValue}>Credit {money(gstCredit)}</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenGstFiling}>
            <Text style={styles.statLabel}>GST collected</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(outputGst)}
            </Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenGstFiling}>
            <Text style={styles.statLabel}>GST paid</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(inputGst)}
            </Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenExpenses}>
            <Text style={styles.statLabel}>Expense + salary</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(expenseCost + salaryPaid)}
            </Text>
          </Pressable>
        </View>
      </Card>

      <Card title="Operations overview" icon="domain">
        <View style={styles.statGrid}>
          <Pressable style={compactCardStyle} onPress={onOpenClients}>
            <Text style={styles.statLabel}>Clients</Text>
            <Text style={styles.statValue}>{clients.length}</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenSuppliers}>
            <Text style={styles.statLabel}>Suppliers</Text>
            <Text style={styles.statValue}>{suppliers.length}</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenInventory}>
            <Text style={styles.statLabel}>Products</Text>
            <Text style={styles.statValue}>{products.length}</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenEmployees}>
            <Text style={styles.statLabel}>Employees</Text>
            <Text style={styles.statValue}>{activeEmployees}</Text>
            <Text style={styles.reportSubValue}>Active | Salary {money(salaryPaid)}</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenExpenses}>
            <Text style={styles.statLabel}>Expenses</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(expenseTotal)}
            </Text>
            <Text style={styles.reportSubValue}>{fyExpenses.length} bills</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenDocuments}>
            <Text style={styles.statLabel}>Documents</Text>
            <Text style={styles.statValue}>{uploadedDocumentCount}</Text>
            <Text style={styles.reportSubValue}>Invoices, PDFs, receipts, salary slips</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="Current status" icon="chart-timeline-variant">
        <View style={styles.statGrid}>
          <Pressable style={compactCardStyle} onPress={onOpenReports}>
            <Text style={styles.statLabel}>Avg purchase</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(averagePurchaseRate)}
            </Text>
            <Text style={styles.reportSubValue}>Without GST / Kg</Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenReports}>
            <Text style={styles.statLabel}>Cost of sold stock</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(costOfSoldStock)}
            </Text>
          </Pressable>
          <Pressable style={compactCardStyle} onPress={onOpenReports}>
            <Text style={styles.statLabel}>Purchase taxable</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(purchaseTaxable)}
            </Text>
          </Pressable>
        </View>
      </Card>
    </View>
  );
}

function getBusinessYearLabel(today: Date) {
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

function getBusinessYearRange(today: Date) {
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return {
    startTime: new Date(startYear, 3, 1).getTime(),
    endTime: new Date(startYear + 1, 3, 1).getTime(),
  };
}

function matchesBusinessYear(dateValue: string, today: Date) {
  const dateTime = getDisplayDateTime(dateValue);
  if (!dateTime) return false;

  const { startTime, endTime } = getBusinessYearRange(today);
  return dateTime >= startTime && dateTime < endTime;
}
