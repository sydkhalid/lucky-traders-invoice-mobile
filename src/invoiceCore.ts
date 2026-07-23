import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { logo, signature } from './assets';
import { seedClientDocuments } from './nosqlClientTable';
import { defaultBusinessSettings, splitCompanyAddress } from './nosqlSettingsTable';
import type { BusinessSettings } from './nosqlSettingsTable';
import type {
  AppMenuKey,
  GstMode,
  GstType,
  IconName,
  InvoiceRow,
  InvoiceState,
  InvoiceTotals,
  ManagerUserForm,
  PasswordForm,
  Product,
  ProductRow,
  SavedInvoiceDocument,
} from './types';

export const DEFAULT_GST_RATE_PERCENT = 18;
export const GST_RATE = DEFAULT_GST_RATE_PERCENT / 100;
export const CLIENT_STORAGE_KEY = 'lucky-traders.clients.v1';
export const SUPPLIER_STORAGE_KEY = 'lucky-traders.suppliers.v1';
export const PURCHASE_TABLE_STORAGE_KEY = 'lucky-traders.purchases.v1';
export const PRODUCT_STORAGE_KEY = 'lucky-traders.products.v1';
export const EMPLOYEE_STORAGE_KEY = 'lucky-traders.employees.v1';
export const SALARY_STORAGE_KEY = 'lucky-traders.salaries.v1';
export const EXPENSE_STORAGE_KEY = 'lucky-traders.expenses.v1';
export const PAYMENT_STORAGE_KEY = 'lucky-traders.payments.v1';
export const SUPPLIER_PAYMENT_STORAGE_KEY = 'lucky-traders.supplierPayments.v1';
export const INVOICE_SEQUENCE_STORAGE_KEY = 'lucky-traders.invoiceSequence.v1';
export const INVOICE_TABLE_STORAGE_KEY = 'lucky-traders.invoices.v1';
export const INVOICE_IMPORT_STORAGE_KEY = 'lucky-traders.invoiceImports.v1';

export const productCatalog: Product[] = [
  { key: 'steel-tube-galvanize', label: 'SteelTube', hsn: '73061911', price: '74.00' },
  { key: 'ms-angle-25x5a', label: 'MS ANGLE/ISMB/ISMC-721650 25X5A', hsn: '72165000', price: '53.65' },
  { key: 'ms-angle-35x5a', label: 'MS ANGLE/ISMB/ISMC-721650 35X5A', hsn: '72165000', price: '52.55' },
  { key: 'ms-bars-10mm-sq-rod', label: 'Ms Bars-721420 10MM SQ ROD', hsn: '721420', price: '51.30' },
  { key: 'ms-flat-32x6f', label: 'Ms Flat - 721114 32X6F', hsn: '721114', price: '51.30' },
  { key: 'ms-flat-40x6f', label: 'Ms Flat - 721114 40X6F', hsn: '721114', price: '52.10' },
  { key: 'ms-bars-16mm-r-rod', label: 'Ms Bars-721420 16MM R ROD', hsn: '721420', price: '52.55' },
];

export const sections = [
  { key: 'invoice', label: 'Invoice', icon: 'receipt-text-outline' },
  { key: 'customer', label: 'Customer', icon: 'account-outline' },
  { key: 'items', label: 'Items', icon: 'package-variant-closed' },
  { key: 'eway', label: 'E-Way', icon: 'truck-outline' },
  { key: 'preview', label: 'Preview', icon: 'file-document-outline' },
] as const;

export const appMenus: { key: AppMenuKey; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'view-dashboard-outline' },
  { key: 'clients', label: 'Clients', icon: 'account-group-outline' },
  { key: 'suppliers', label: 'Suppliers', icon: 'storefront-outline' },
  { key: 'purchases', label: 'Purchases', icon: 'cart-outline' },
  { key: 'inventory', label: 'Inventory', icon: 'warehouse' },
  { key: 'supplierPayments', label: 'Supplier Payments', icon: 'cash-multiple' },
  { key: 'invoices', label: 'Invoices', icon: 'format-list-bulleted-square' },
  { key: 'payments', label: 'Payments', icon: 'cash-check' },
  { key: 'reports', label: 'Reports', icon: 'file-chart-outline' },
  { key: 'gstFiling', label: 'GST Filing', icon: 'calculator-variant-outline' },
  { key: 'documents', label: 'Documents', icon: 'file-document-multiple-outline' },
  { key: 'expenses', label: 'Expenses', icon: 'receipt-text-outline' },
  { key: 'employees', label: 'Employees', icon: 'account-tie-outline' },
  { key: 'users', label: 'Users', icon: 'account-key-outline' },
  { key: 'deviceSharing', label: 'Device Sharing', icon: 'access-point-network' },
  { key: 'account', label: 'Account', icon: 'account-circle-outline' },
];

export const emptyManagerUserForm: ManagerUserForm = {
  name: '',
  username: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

export const emptyPasswordForm: PasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const defaultInvoiceClient = seedClientDocuments[0];
let printableAssetsPromise: Promise<{ logoDataUri: string; signatureDataUri: string }> | null = null;

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-GB').replace(/\//g, '-');
}

export function parseDisplayDate(value: string) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return new Date();

  const [, day, month, year] = match;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

export function getDisplayDateTime(value: string) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return 0;

  const [, day, month, year] = match;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
  const time = parsedDate.getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortSavedInvoicesByInvoiceDate(invoices: SavedInvoiceDocument[]) {
  return [...invoices].sort((a, b) => {
    const dateDiff = getDisplayDateTime(b.invoice.invoiceDate) - getDisplayDateTime(a.invoice.invoiceDate);
    if (dateDiff !== 0) return dateDiff;

    return b.invoiceNo.localeCompare(a.invoiceNo, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function formatInvoiceNumber(
  sequence: number,
  prefix = defaultBusinessSettings.invoicePrefix,
  padding = defaultBusinessSettings.invoicePadding,
) {
  const safePrefix = prefix.trim() || defaultBusinessSettings.invoicePrefix;
  const safePadding = Number.isFinite(padding) ? Math.min(6, Math.max(1, Math.trunc(padding))) : defaultBusinessSettings.invoicePadding;
  return `${safePrefix}${String(Math.max(1, sequence)).padStart(safePadding, '0')}`;
}

export function getNextInvoiceSequenceFromInvoices(
  invoices: Pick<SavedInvoiceDocument, 'invoiceNo' | 'invoice'>[],
  fallbackSequence: number,
  prefix = defaultBusinessSettings.invoicePrefix,
) {
  const highest = invoices.reduce((max, savedInvoice) => {
    const directSequence = getInvoiceSequenceNumber(savedInvoice.invoiceNo, prefix);
    const nestedSequence = getInvoiceSequenceNumber(savedInvoice.invoice?.invoiceNo, prefix);
    return Math.max(max, directSequence, nestedSequence);
  }, 0);

  return Math.max(1, fallbackSequence, highest + 1);
}

export function getInvoiceSequenceNumber(invoiceNo: string | undefined, prefix = defaultBusinessSettings.invoicePrefix) {
  const safePrefix = prefix.trim();
  if (!invoiceNo || !safePrefix) return 0;

  const normalizedInvoiceNo = invoiceNo.trim().toUpperCase();
  const normalizedPrefix = safePrefix.toUpperCase();
  if (!normalizedInvoiceNo.startsWith(normalizedPrefix)) return 0;

  const suffix = normalizedInvoiceNo.slice(normalizedPrefix.length).trim();
  const match = suffix.match(/^0*(\d+)$/);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

export function makeProductRow(productKey = 'steel-tube-galvanize', products: Product[] = productCatalog): ProductRow {
  const catalog = products.length ? products : productCatalog;
  const product = catalog.find((item) => item.key === productKey) || catalog[0];

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    productKey: product.key,
    hsn: product.hsn,
    qty: '500.00',
    price: product.price,
  };
}

export function makeInvoiceState(
  invoiceNo: string,
  products: Product[] = productCatalog,
  settings: BusinessSettings = defaultBusinessSettings,
): InvoiceState {
  const today = formatDate(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    invoiceNo,
    invoiceDate: today,
    sellerName: settings.companyName,
    sellerAddressLines: splitCompanyAddress(settings),
    sellerGstin: settings.companyGstin,
    sellerPhone: settings.companyPhone,
    gstRatePercent: settings.gstRatePercent,
    toName: defaultInvoiceClient.name,
    toAddress: defaultInvoiceClient.address,
    toGstin: defaultInvoiceClient.gstin,
    toPhone: defaultInvoiceClient.phone,
    gstMode: settings.defaultGstMode,
    gstType: settings.defaultGstType,
    products: [makeProductRow(undefined, products)],
    transportCharge: '0',
    transportChargeMode: 'excluded',
    loadingCharge: '0',
    loadingChargeMode: 'excluded',
    hasEway: false,
    eway: '',
    ewayDate: today,
    validDate: formatDate(tomorrow),
    driver: '',
    vehicle: '',
    mobile: '',
  };
}

export function getInvoiceSeller(invoice: InvoiceState, settings: BusinessSettings = defaultBusinessSettings) {
  return {
    name: invoice.sellerName || settings.companyName || defaultBusinessSettings.companyName,
    addressLines: invoice.sellerAddressLines?.length ? invoice.sellerAddressLines : splitCompanyAddress(settings),
    gstin: invoice.sellerGstin || settings.companyGstin || defaultBusinessSettings.companyGstin,
    phone: invoice.sellerPhone || settings.companyPhone || defaultBusinessSettings.companyPhone,
    email: settings.companyEmail,
    bankName: settings.bankName || defaultBusinessSettings.bankName,
    bankAccountNo: settings.bankAccountNo || defaultBusinessSettings.bankAccountNo,
    bankBranch: settings.bankBranch || defaultBusinessSettings.bankBranch,
    bankIfsc: settings.bankIfsc || defaultBusinessSettings.bankIfsc,
  };
}

export function money(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function numberFormat(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function getInvoiceGstRatePercent(invoice?: Pick<InvoiceState, 'gstRatePercent'>, settings?: BusinessSettings) {
  const rawRate = invoice?.gstRatePercent ?? settings?.gstRatePercent ?? defaultBusinessSettings.gstRatePercent;
  if (!Number.isFinite(rawRate)) return defaultBusinessSettings.gstRatePercent;
  return Math.min(28, Math.max(0, Number(rawRate)));
}

export function getGstRateLabel(ratePercent: number) {
  const safeRate = Number.isFinite(ratePercent) ? ratePercent : defaultBusinessSettings.gstRatePercent;
  return `${Number.isInteger(safeRate) ? safeRate : safeRate.toFixed(2)}%`;
}

export function words(input: number) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const num = Math.trunc(Number(input));
  const twoDigitWords = (value: string) => {
    const numeric = Number(value);
    return ones[numeric] || `${tens[Number(value[0])]} ${ones[Number(value[1])]}`;
  };

  if (num === 0) return 'Rupees Zero Only';
  if (!Number.isFinite(num) || num > 999999999) return 'Overflow';

  const parts = `000000000${num}`.slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!parts) return 'Rupees Zero Only';

  let output = '';
  output += Number(parts[1]) ? `${twoDigitWords(parts[1])} Crore ` : '';
  output += Number(parts[2]) ? `${twoDigitWords(parts[2])} Lakh ` : '';
  output += Number(parts[3]) ? `${twoDigitWords(parts[3])} Thousand ` : '';
  output += Number(parts[4]) ? `${twoDigitWords(parts[4])} Hundred ` : '';
  output += Number(parts[5]) ? `${output ? 'and ' : ''}${twoDigitWords(parts[5])} ` : '';

  return `Rupees ${output.trim()} Only`;
}

export function calculateInvoice(invoice: InvoiceState, products: Product[] = productCatalog) {
  const catalog = products.length ? products : productCatalog;
  const gstRatePercent = getInvoiceGstRatePercent(invoice);
  const gstRate = gstRatePercent / 100;
  const productRows: InvoiceRow[] = invoice.products
    .map((row) => {
      const product = catalog.find((item) => item.key === row.productKey);
      const qty = Number.parseFloat(row.qty || '0') || 0;
      const price = Number.parseFloat(row.price || '0') || 0;

      return {
        index: 0,
        kind: 'product' as const,
        description: product?.label || '',
        hsn: row.hsn,
        qty,
        price,
        amount: qty * price,
        gstMode: invoice.gstMode,
        gstRatePercent,
      };
    })
    .filter((row) => row.description || row.hsn || row.qty || row.price);

  const charges: InvoiceRow[] = [
    {
      index: 0,
      kind: 'charge' as const,
      description: 'Transport Charges',
      hsn: '',
      qty: null,
      price: Number.parseFloat(invoice.transportCharge || '0') || 0,
      amount: Number.parseFloat(invoice.transportCharge || '0') || 0,
      gstMode: invoice.transportChargeMode,
      gstRatePercent,
    },
    {
      index: 0,
      kind: 'charge' as const,
      description: 'Loading Charges',
      hsn: '',
      qty: null,
      price: Number.parseFloat(invoice.loadingCharge || '0') || 0,
      amount: Number.parseFloat(invoice.loadingCharge || '0') || 0,
      gstMode: invoice.loadingChargeMode,
      gstRatePercent,
    },
  ].filter((row) => row.amount > 0);

  const rows = [...productRows, ...charges].map((row, index) => ({ ...row, index: index + 1 }));
  const totals = rows.reduce(
    (sum, row) => {
      if (row.gstMode === 'included') {
        const taxable = row.amount / (1 + gstRate);
        sum.taxable += taxable;
        sum.gst += row.amount - taxable;
      } else {
        sum.taxable += row.amount;
        sum.gst += row.amount * gstRate;
      }

      return sum;
    },
    { taxable: 0, gst: 0 },
  );
  const grand = totals.taxable + totals.gst;
  const total = Math.round(grand);
  const roundOff = Number((total - grand).toFixed(2));

  return {
    rows,
    taxable: totals.taxable,
    gst: totals.gst,
    roundOff: Object.is(roundOff, -0) ? 0 : roundOff,
    total,
  };
}

async function imageAssetToDataUri(assetModule: number) {
  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error(`Unable to load ${asset.name}.${asset.type} for PDF output.`);
  }

  const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return `data:image/png;base64,${base64}`;
}

async function imageUriToDataUri(uri: string, fileName: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const mimeType = getImageMimeType(fileName || uri);

  return `data:${mimeType};base64,${base64}`;
}

function getImageMimeType(value: string) {
  const lowered = value.toLowerCase();
  if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) return 'image/jpeg';
  if (lowered.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

export function getPrintableAssets(settings?: Pick<BusinessSettings, 'logoUri' | 'logoFileName' | 'signatureUri' | 'signatureFileName'>) {
  if (settings?.logoUri || settings?.signatureUri) {
    return Promise.all([
      settings.logoUri ? imageUriToDataUri(settings.logoUri, settings.logoFileName) : imageAssetToDataUri(logo),
      settings.signatureUri ? imageUriToDataUri(settings.signatureUri, settings.signatureFileName) : imageAssetToDataUri(signature),
    ]).then(([logoDataUri, signatureDataUri]) => ({ logoDataUri, signatureDataUri }));
  }

  if (!printableAssetsPromise) {
    printableAssetsPromise = Promise.all([imageAssetToDataUri(logo), imageAssetToDataUri(signature)])
      .then(([logoDataUri, signatureDataUri]) => ({ logoDataUri, signatureDataUri }));
  }

  return printableAssetsPromise;
}

export async function buildPrintableHtml(invoice: InvoiceState, totals: InvoiceTotals, settings: BusinessSettings = defaultBusinessSettings) {
  const { logoDataUri, signatureDataUri } = await getPrintableAssets(settings);
  const seller = getInvoiceSeller(invoice, settings);
  const gstRatePercent = getInvoiceGstRatePercent(invoice, settings);
  const splitRateLabel = getGstRateLabel(gstRatePercent / 2);
  const gstRateLabel = getGstRateLabel(gstRatePercent);
  const taxRows = invoice.gstType === 'igst'
    ? `<tr><td>IGST (${gstRateLabel}):</td><td>${money(totals.gst)}</td></tr>`
    : `<tr><td>CGST (${splitRateLabel}):</td><td>${money(totals.gst / 2)}</td></tr><tr><td>SGST (${splitRateLabel}):</td><td>${money(totals.gst / 2)}</td></tr>`;

  const itemRows = totals.rows.map((row) => `
    <tr>
      <td>${row.index}</td>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.hsn || '-')}</td>
      <td>${row.qty === null ? '-' : numberFormat(row.qty)}</td>
      <td>${row.price === null ? '-' : numberFormat(row.price)}</td>
      <td>${getGstRateLabel(row.gstRatePercent ?? gstRatePercent)} (${row.gstMode === 'included' ? 'Included' : 'Excluded'})</td>
      <td class="right strong">${money(row.amount)}</td>
    </tr>
  `).join('');

  const eway = invoice.hasEway && invoice.eway.trim()
    ? `<div class="eway-box">
        <div><b>E-Way Bill No:</b> <span>${escapeHtml(invoice.eway)}</span></div>
        <div><b>Date:</b> <span>${escapeHtml(invoice.ewayDate)}</span></div>
        <div><b>Driver Name:</b> <span>${escapeHtml(invoice.driver || '-')}</span></div>
        <div><b>Vehicle No:</b> <span>${escapeHtml(invoice.vehicle || '-')}</span></div>
        <div><b>Mobile No:</b> <span>${escapeHtml(invoice.mobile || '-')}</span></div>
        <div><b>Valid Upto:</b> <span>${escapeHtml(invoice.validDate)}</span></div>
      </div>`
    : '';

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
          .page { width: 760px; margin: 0 auto; padding: 42px 46px 30px; }
          .top { display: flex; justify-content: space-between; align-items: flex-end; }
          .logo-img { width: 78px; height: 78px; margin-left: 28px; object-fit: contain; display: block; }
          .brand { margin-top: 4px; font-size: 18px; font-weight: 900; }
          .meta { text-align: right; padding-bottom: 10px; font-size: 25px; line-height: 1.15; }
          .meta b { font-weight: 900; }
          .gold-line { height: 2px; background: #d0a51f; margin-top: 8px; }
          .party-row { display: flex; justify-content: space-between; gap: 70px; margin-top: 34px; }
          .party { width: 50%; font-size: 12px; line-height: 1.35; }
          .party-title { display: block; margin-bottom: 5px; font-size: 17px; font-weight: 500; }
          .strong { font-weight: 900; }
          .blue { color: #006fc9; text-decoration: underline; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .items { margin-top: 18px; }
          th, td { border: 1px solid #c9c9c9; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f3f3f3; font-weight: 900; }
          .right { text-align: right; }
          .summary { margin-top: 6px; }
          .summary td:first-child { width: 84%; text-align: right; font-weight: 900; }
          .summary td:last-child { width: 16%; text-align: right; }
          .grand td { background: #d0aa21; font-weight: 900; }
          .words { margin-top: 6px; padding: 10px; border: 1px dashed #c9c9c9; text-align: center; font-size: 12px; font-weight: 900; }
          .eway-box { display: grid; grid-template-columns: 1fr 1fr; row-gap: 12px; padding: 10px 8px 13px; border: 1px solid #c9c9c9; border-top: 0; font-size: 12px; }
          .eway-box b { display: inline-block; min-width: 92px; }
          .footer { display: flex; justify-content: space-between; margin-top: 24px; font-size: 12px; }
          .bank { width: 48%; padding-left: 8px; line-height: 1.35; }
          .bank-title { margin-bottom: 18px; font-weight: 900; }
          .sign { width: 160px; text-align: center; font-weight: 900; }
          .signature-img { width: 130px; height: 86px; margin: 8px auto 2px; object-fit: contain; display: block; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="top">
            <div>
              <img class="logo-img" src="${logoDataUri}" alt="Lucky Traders logo" />
              <div class="brand">${escapeHtml(seller.name)}</div>
            </div>
            <div class="meta">
              <div><b>Invoice No:</b> ${escapeHtml(invoice.invoiceNo)}</div>
              <div><b>Invoice Date:</b> ${escapeHtml(invoice.invoiceDate)}</div>
            </div>
          </div>
          <div class="gold-line"></div>

          <div class="party-row">
            <div class="party">
              <span class="party-title">From:</span>
              <div class="strong">${escapeHtml(seller.name)}</div>
              ${seller.addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
              <div>GSTIN: ${escapeHtml(seller.gstin)}</div>
              <div><b>Phone:</b> <span class="blue">${escapeHtml(seller.phone)}</span></div>
              ${seller.email ? `<div><b>Email:</b> ${escapeHtml(seller.email)}</div>` : ''}
            </div>
            <div class="party">
              <span class="party-title">To:</span>
              <div class="strong">${escapeHtml(invoice.toName)}</div>
              <div>${escapeHtml(invoice.toAddress)}</div>
              <div><b>GSTIN:</b> ${escapeHtml(invoice.toGstin)}</div>
              <div><b>Phone:</b> ${escapeHtml(invoice.toPhone || '-')}</div>
            </div>
          </div>

          <table class="items">
            <thead><tr><th>#</th><th>PRODUCT</th><th>HSN / CODE</th><th>QTY (Kg)</th><th>RATE</th><th>TAX %</th><th class="right">Amount</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <table class="summary">
            <tr><td>Taxable Value:</td><td>${money(totals.taxable)}</td></tr>
            ${taxRows}
            <tr><td>Total GST:</td><td>${money(totals.gst)}</td></tr>
            <tr><td>Round Off:</td><td>${money(totals.roundOff)}</td></tr>
            <tr class="grand"><td>Grand Total:</td><td>${money(totals.total)}</td></tr>
          </table>
          <div class="words">Amount in Words: ${words(totals.total)}</div>
          ${eway}
          <div class="footer">
            <div class="bank">
              <div class="bank-title">BANK DETAILS</div>
              <div><b>Bank Name:</b> ${escapeHtml(seller.bankName)}</div>
              <div><b>Account No:</b> <span class="blue">${escapeHtml(seller.bankAccountNo)}</span></div>
              <div><b>Branch:</b> ${escapeHtml(seller.bankBranch)}</div>
              <div><b>IFSC Code:</b> ${escapeHtml(seller.bankIfsc)}</div>
            </div>
            <div class="sign">
              <div>For ${escapeHtml(seller.name)}</div>
              <img class="signature-img" src="${signatureDataUri}" alt="Authorized signature" />
              <div>Authorized Signatory</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}
