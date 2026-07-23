import type { PurchaseImportResult, PurchaseItem } from './nosqlPurchaseTable';
import { extractSupplierFromPdfBase64 } from './supplierPdf';

const emptyPurchase: PurchaseImportResult = {
  invoiceNo: '',
  invoiceDate: '',
  supplier: {
    name: '',
    address: '',
    gstin: '',
    phone: '',
    email: '',
  },
  items: [],
  taxableValue: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  totalGst: 0,
  roundOff: 0,
  totalAmount: 0,
  ewayBillNo: '',
  vehicleNo: '',
  rawText: '',
};

export function extractPurchaseFromPdfBase64(base64: string, fileName: string): PurchaseImportResult {
  const supplierResult = extractSupplierFromPdfBase64(base64, fileName);
  const rawText = supplierResult.rawText;
  const lines = rawText.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const supplierName = supplierResult.form.name.toLowerCase();
  const parsed = supplierName.includes('fab pipes')
    ? parseFabPipes(lines)
    : supplierName.includes('inframat')
      ? parseInframat(lines)
      : parseGenericPurchase(lines);

  const result: PurchaseImportResult = {
    ...emptyPurchase,
    ...parsed,
    supplier: supplierResult.form,
    rawText,
    warning: supplierResult.warning,
  };

  if (!result.items.length && result.taxableValue > 0) {
    result.items = [makePurchaseItem(lines, result.taxableValue, result.totalGst, result.totalAmount)];
  }

  if (!result.warning && (!result.invoiceNo || !result.supplier.name || result.totalAmount <= 0)) {
    result.warning = 'Purchase PDF imported, but some fields need checking before saving.';
  }

  return result;
}

function parseInframat(lines: string[]) {
  const invoiceNo = findInvoiceNumber(lines);
  const invoiceDate = findInvoiceDate(lines);
  const hsnIndex = lines.findIndex((line) => /^\d{8}$/.test(line));
  const hsn = hsnIndex >= 0 ? lines[hsnIndex] : '';
  const rawUom = hsnIndex >= 0 ? lines[hsnIndex + 2] || '' : '';
  const rawQty = hsnIndex >= 0 ? toNumber(lines[hsnIndex + 3]) : 0;
  const rawRate = hsnIndex >= 0 ? toNumber(lines[hsnIndex + 4]) : 0;
  const normalizedItem = normalizePurchaseUnit(rawQty, rawRate, rawUom);
  const description = findProductDescription(lines);
  const lineAmount = findNumberAfterIndex(lines, hsnIndex + 4, 8) || normalizedItem.qty * normalizedItem.rate;
  const taxableValue = findNumberAroundLabel(lines, /ass\.?\s*value|taxable amount/i) || lineAmount;
  const totalGst = findNumberAroundLabel(lines, /total gst amount/i, 'before') || 0;
  const totalAmount = findNumberAroundLabel(lines, /total bill amount/i, 'before') || taxableValue + totalGst;
  const roundOff = Number((totalAmount - taxableValue - totalGst).toFixed(2));
  const item: PurchaseItem = {
    description,
    hsn,
    qty: normalizedItem.qty,
    uom: normalizedItem.uom,
    rate: normalizedItem.rate,
    taxableAmount: taxableValue,
    gstRate: 18,
    gstAmount: totalGst,
    totalAmount,
  };

  return {
    invoiceNo,
    invoiceDate,
    items: [item],
    taxableValue,
    cgst: totalGst / 2,
    sgst: totalGst / 2,
    igst: 0,
    totalGst,
    roundOff: Object.is(roundOff, -0) ? 0 : roundOff,
    totalAmount,
    ewayBillNo: findEwayBillNo(lines),
    vehicleNo: findVehicleNo(lines),
  };
}

function parseFabPipes(lines: string[]) {
  const invoiceNo = findInvoiceNumber(lines);
  const invoiceDate = findInvoiceDate(lines);
  const hsn = findFirstHsn(lines);
  const totalGst = findNumberAroundLabel(lines, /tax amount\s*:\s*gst/i) || 0;
  const taxableValue = findNumberNearValue(lines, totalGst, 1, 4) || findLargestNumber(lines.filter((line) => /\d/.test(line) && !/%/.test(line))) || 0;
  const totalAmount = findNumberAroundLabel(lines, /^total$/i) || taxableValue + totalGst;
  const rate = findNumberAroundLabel(lines, /^amount$/i, 'before') || 0;
  const rawQty = rate > 0 && taxableValue > 0 ? Number((taxableValue / rate).toFixed(3)) : findNumberAroundLabel(lines, /^qty$/i) || 0;
  const normalizedItem = normalizePurchaseUnit(rawQty, rate, findLine(lines, /^kgs?$|^mts?$|^pcs$/i) || 'KGS');
  const description = findProductDescription(lines);
  const item: PurchaseItem = {
    description,
    hsn,
    qty: normalizedItem.qty,
    uom: normalizedItem.uom,
    rate: normalizedItem.rate,
    taxableAmount: taxableValue,
    gstRate: 18,
    gstAmount: totalGst,
    totalAmount,
  };

  return {
    invoiceNo,
    invoiceDate,
    items: [item],
    taxableValue,
    cgst: 0,
    sgst: 0,
    igst: totalGst,
    totalGst,
    roundOff: 0,
    totalAmount,
    ewayBillNo: findEwayBillNo(lines),
    vehicleNo: findVehicleNo(lines),
  };
}

function parseGenericPurchase(lines: string[]) {
  const totalGst = findNumberAroundLabel(lines, /total gst|tax amount\s*:\s*gst|igst|cgst|sgst/i) || 0;
  const totalAmount = findNumberAroundLabel(lines, /total bill amount|total amount after tax|grand total|^total$/i) || 0;
  const taxableValue = findNumberAroundLabel(lines, /taxable amount|ass\.?\s*value|total amount before tax/i) || Math.max(0, totalAmount - totalGst);

  return {
    invoiceNo: findInvoiceNumber(lines),
    invoiceDate: findInvoiceDate(lines),
    items: [makePurchaseItem(lines, taxableValue, totalGst, totalAmount)],
    taxableValue,
    cgst: totalGst / 2,
    sgst: totalGst / 2,
    igst: 0,
    totalGst,
    roundOff: Number((totalAmount - taxableValue - totalGst).toFixed(2)),
    totalAmount,
    ewayBillNo: findEwayBillNo(lines),
    vehicleNo: findVehicleNo(lines),
  };
}

function makePurchaseItem(lines: string[], taxableValue: number, totalGst: number, totalAmount: number): PurchaseItem {
  const rate = findNumberAroundLabel(lines, /^rate$/i) || 0;
  const rawQty = rate > 0 && taxableValue > 0 ? Number((taxableValue / rate).toFixed(3)) : 0;
  const normalizedItem = normalizePurchaseUnit(rawQty, rate, findLine(lines, /^kgs?$|^mts?$|^pcs$/i) || 'Kg');

  return {
    description: findProductDescription(lines),
    hsn: findFirstHsn(lines),
    qty: normalizedItem.qty,
    uom: normalizedItem.uom,
    rate: normalizedItem.rate,
    taxableAmount: taxableValue,
    gstRate: 18,
    gstAmount: totalGst,
    totalAmount,
  };
}

function normalizePurchaseUnit(qty: number, rate: number, uom: string) {
  if (isTonneUnit(uom)) {
    return {
      qty: Number((qty * 1000).toFixed(3)),
      rate: Number((rate / 1000).toFixed(3)),
      uom: 'Kg',
    };
  }

  return {
    qty,
    rate,
    uom: isKgUnit(uom) || !uom.trim() ? 'Kg' : uom.trim(),
  };
}

function isTonneUnit(uom: string) {
  const normalized = uom.toLowerCase().replace(/[^a-z]/g, '');
  return ['mt', 'mts', 'metricton', 'metrictons', 'ton', 'tons', 'tonne', 'tonnes'].includes(normalized);
}

function isKgUnit(uom: string) {
  const normalized = uom.toLowerCase().replace(/[^a-z]/g, '');
  return ['kg', 'kgs', 'kilogram', 'kilograms'].includes(normalized);
}

function findInvoiceNumber(lines: string[]) {
  const labelIndex = lines.findIndex((line) => /invoice\s*(number|no\.?)/i.test(line));
  if (labelIndex >= 0) {
    if (/invoice\s*no\.?/i.test(lines[labelIndex])) {
      const before = [...lines.slice(Math.max(0, labelIndex - 7), labelIndex)]
        .reverse()
        .find(isInvoiceNumberCandidate);
      if (before) return before;
    }

    const after = lines.slice(labelIndex + 1, labelIndex + 7).find(isInvoiceNumberCandidate);
    if (after) return after;

    const before = [...lines.slice(Math.max(0, labelIndex - 7), labelIndex)]
      .reverse()
      .find(isInvoiceNumberCandidate);
    if (before) return before;
  }

  return lines.find(isInvoiceNumberCandidate) || '';
}

function findInvoiceDate(lines: string[]) {
  const labelIndex = lines.findIndex((line) => /invoice\s*date|date of supply|date of preparation/i.test(line));
  const dateNearLabel = labelIndex >= 0 ? lines.slice(labelIndex + 1, labelIndex + 12).map(parsePurchaseDate).find(Boolean) : '';
  if (dateNearLabel) return dateNearLabel;

  return lines.map(parsePurchaseDate).find(Boolean) || '';
}

function parsePurchaseDate(value: string) {
  const numeric = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    const [, day, month, year] = numeric;
    if (year.length !== 2 && year.length !== 4) return '';
    if (Number(day) < 1 || Number(day) > 31 || Number(month) < 1 || Number(month) > 12) return '';
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${normalizeYear(year)}`;
  }

  const monthName = value.match(/\b(\d{1,2})[/-]([A-Za-z]{3,})[/-](\d{2,4})\b/);
  if (monthName) {
    const [, day, month, year] = monthName;
    const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month.slice(0, 3).toLowerCase());
    if (monthIndex >= 0) return `${day.padStart(2, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${normalizeYear(year)}`;
  }

  return '';
}

function normalizeYear(year: string) {
  return year.length === 2 ? `20${year}` : year;
}

function isInvoiceNumberCandidate(value: string) {
  if (/date|time|hrs|invoice|preparation|supply|state|gst/i.test(value)) return false;
  if (parsePurchaseDate(value)) return false;
  return /^[A-Z0-9][A-Z0-9/-]{1,24}$/i.test(value);
}

function findProductDescription(lines: string[]) {
  const productIndex = lines.findIndex((line) => /steeltube/i.test(line)) >= 0
    ? lines.findIndex((line) => /steeltube/i.test(line))
    : lines.findIndex((line) => /steel\s*tube/i.test(line) && !/manufacturers?/i.test(line));
  if (productIndex < 0) return 'SteelTube';

  return lines
    .slice(productIndex, productIndex + 4)
    .filter((line) => /[A-Za-z]/.test(line) && !/our bank|bank name|amount|ass\.?\s*value|grand total|qty|rate|hsn/i.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || 'SteelTube';
}

function findFirstHsn(lines: string[]) {
  return lines.find((line) => /^\d{6,8}$/.test(line) && /^7/.test(line)) || '';
}

function findEwayBillNo(lines: string[]) {
  const labelIndex = lines.findIndex((line) => /e-?way bill no/i.test(line));
  if (labelIndex < 0) return '';

  return lines.slice(labelIndex + 1, labelIndex + 8).find((line) => /^\d{8,14}$/.test(line.replace(/\D/g, ''))) || '';
}

function findVehicleNo(lines: string[]) {
  return lines.find((line) => /\b[A-Z]{2}\d{2}[A-Z]{1,3}\s?\d{3,4}\b/i.test(line)) || '';
}

function findNumberAroundLabel(lines: string[], label: RegExp, direction: 'after' | 'before' | 'both' = 'both') {
  const labelIndex = lines.findIndex((line) => label.test(line));
  if (labelIndex < 0) return 0;

  if (direction !== 'before') {
    const after = findNumberAfterIndex(lines, labelIndex, 8);
    if (after) return after;
  }
  if (direction !== 'after') {
    const before = findNumberBeforeIndex(lines, labelIndex, 8);
    if (before) return before;
  }

  return 0;
}

function findNumberNearValue(lines: string[], value: number, startOffset: number, distance: number) {
  const index = lines.findIndex((line) => toNumber(line) === value);
  if (index < 0) return 0;

  return findNumberAfterIndex(lines, index + startOffset - 1, distance);
}

function findNumberAfterIndex(lines: string[], startIndex: number, distance: number) {
  for (let index = startIndex + 1; index < lines.length && index <= startIndex + distance; index += 1) {
    const value = toNumber(lines[index]);
    if (value > 0) return value;
  }

  return 0;
}

function findNumberBeforeIndex(lines: string[], startIndex: number, distance: number) {
  for (let index = startIndex - 1; index >= 0 && index >= startIndex - distance; index -= 1) {
    const value = toNumber(lines[index]);
    if (value > 0) return value;
  }

  return 0;
}

function findLargestNumber(lines: string[]) {
  return lines.reduce((largest, line) => Math.max(largest, toNumber(line)), 0);
}

function findLine(lines: string[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line)) || '';
}

function toNumber(value: string) {
  if (!value) return 0;
  if (/[A-Za-z]/.test(value) && !/^₹?\s*[\d,.-]+$/.test(value)) return 0;
  if (/%/.test(value)) return 0;

  const normalized = value.replace(/[^0-9.-]/g, '');
  if (!normalized || normalized === '-' || normalized === '.') return 0;
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function cleanLine(line: string) {
  return line.replace(/\s+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
}
