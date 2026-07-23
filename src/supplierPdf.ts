import { inflate } from 'pako';
import type { SupplierForm } from './nosqlSupplierTable';

const emptySupplierForm: SupplierForm = {
  name: '',
  address: '',
  gstin: '',
  phone: '',
  email: '',
};

type PdfObject = {
  id: number;
  body: string;
};

type DecodedStream = {
  objectId: number;
  content: string;
};

type UnicodeMap = Map<string, string>;

export type SupplierPdfResult = {
  form: SupplierForm;
  rawText: string;
  warning?: string;
};

export function extractSupplierFromPdfBase64(base64: string, fileName: string): SupplierPdfResult {
  const bytes = decodeBase64ToBytes(base64);
  const binary = bytesToBinary(bytes);
  const pdfObjects = extractPdfObjects(binary);
  const decodedStreams = decodePdfStreams(pdfObjects);
  const fontMaps = buildFontUnicodeMaps(pdfObjects, decodedStreams);
  const decodedText = extractDecodedPdfText(binary, decodedStreams, fontMaps);
  const rawText = normalizePdfText(decodedText.join('\n'));
  const form = extractSupplierForm(rawText, fileName);
  const hasAnyField = Boolean(form.name || form.address || form.gstin || form.phone || form.email);

  return {
    form,
    rawText,
    warning: hasAnyField
      ? undefined
      : 'This PDF does not contain readable text. Scanned/image PDFs need manual entry.',
  };
}

function extractDecodedPdfText(binary: string, decodedStreams: DecodedStream[], fontMaps: Record<string, UnicodeMap>) {
  const textParts: string[] = [];

  for (const stream of decodedStreams) {
    if (hasPdfTextOperators(stream.content)) {
      textParts.push(...extractTextOperations(stream.content, fontMaps));
      textParts.push(...extractLiteralStrings(stream.content));
    }
  }

  if (textParts.length === 0) {
    textParts.push(...extractLiteralStrings(binary));
    textParts.push(...extractHexStrings(binary));
    textParts.push(...extractPrintableRuns(binary));
  }

  return textParts;
}

function extractSupplierForm(rawText: string, fileName: string): SupplierForm {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => cleanLine(line))
    .filter(Boolean);
  const joined = lines.join('\n');
  const gstin = findSupplierGstin(lines);
  const email = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const phone = findSupplierPhone(lines);
  const name = findSupplierName(lines, fileName);
  const address = findSupplierAddress(lines, name, gstin, phone, email);

  return {
    ...emptySupplierForm,
    name,
    address,
    gstin,
    phone,
    email,
  };
}

function findSupplierPhone(lines: string[]) {
  const candidates: { value: string; score: number }[] = [];

  lines.forEach((line, index) => {
    const matches = line.matchAll(/(?:\+?\s*91[\s-]?)?[6-9][\d\s-]{8,14}\d/g);
    for (const match of matches) {
      const value = match[0].replace(/\s+/g, ' ').trim();
      const digits = value.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 12) continue;

      const context = `${lines[index - 1] || ''} ${line} ${lines[index + 1] || ''}`;
      let score = 0;
      if (/\b(phone|mobile|contact|toll free)\b/i.test(context)) score += 10;
      if (/\b(account|acc|bank|ifsc|branch|invoice|eway|e-way)\b/i.test(context)) score -= 12;
      if (/^\d{10}$/.test(digits) || /^91\d{10}$/.test(digits)) score += 4;
      if (/-/.test(value) && !/^\+?\s*91/.test(value)) score -= 5;
      if (index <= 15) score += 2;
      if (context.toLowerCase().includes('lucky traders')) score -= 3;

      candidates.push({ value, score });
    }
  });

  candidates.sort((first, second) => second.score - first.score);
  return candidates[0]?.value || '';
}

function findSupplierGstin(lines: string[]) {
  const joined = lines.join('\n');
  const matches = joined.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi) || [];
  const sellerMarkerIndex = lines.findIndex((line) => /\b(seller|supplier|gstin|gst no|gstn)\b/i.test(line));

  if (sellerMarkerIndex >= 0) {
    const sellerWindow = lines.slice(sellerMarkerIndex, sellerMarkerIndex + 12).join('\n');
    const sellerGstin = sellerWindow.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/i)?.[0];
    if (sellerGstin) return sellerGstin.toUpperCase();
  }

  return matches.find((match) => !isLuckyTradersGstin(match))?.toUpperCase() || matches[0]?.toUpperCase() || '';
}

function findSupplierName(lines: string[], fileName: string) {
  const candidates: { value: string; score: number }[] = [];
  const fileCandidate = supplierNameFromFileName(fileName);

  if (fileCandidate) {
    candidates.push({ value: fileCandidate, score: 4 });
  }

  lines.forEach((line, index) => {
    const normalized = normalizeNameCandidate(line);
    if (!isLikelySupplierName(normalized)) return;

    let score = 0;
    if (index <= 12) score += 5;
    if (/\b(pvt|private|ltd|limited|llp|alloys|pipes|tubes|steels?|cement|hardware|industries|traders|enterprises|systems|plastic)\b/i.test(normalized)) score += 7;
    if (/\b(detail of seller|supplier)\b/i.test(lines[index - 1] || '')) score += 5;
    if (/^for\s+/i.test(line)) score += 4;
    if (lines[index + 1] && /\b(manufacturers?|wholesale trader|works|address|s\.?\s*[fc]\.?no|sy no|door|post|road)\b/i.test(lines[index + 1])) score += 4;
    if (normalized === fileCandidate) score += 4;
    if (/^[A-Z0-9 .,&()/-]+$/.test(normalized) && normalized.length >= 8) score += 1;

    candidates.push({ value: normalized, score });
  });

  candidates.sort((first, second) => second.score - first.score || first.value.length - second.value.length);
  return candidates[0]?.value || fileCandidate || '';
}

function supplierNameFromFileName(fileName: string) {
  const cleaned = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/\([^)]*lucky[^)]*\)/gi, '')
    .replace(/\b(invoice|bill|tax|copy|original|duplicate|triplicate|quadru?plicate)\b/gi, ' ')
    .replace(/\b\d{2}[-_]\d{2}\b/g, ' ')
    .replace(/\b\d{1,4}\b/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || /lucky\s+traders/i.test(cleaned)) return '';
  return titleCaseBusinessName(cleaned);
}

function findSupplierAddress(lines: string[], name: string, gstin: string, phone: string, email: string) {
  const sellerDetailIndex = lines.findIndex((line) => /\bdetail of seller\b|\bseller\s*\/\s*supplier\b|\bsupplier details\b/i.test(line));
  const worksIndex = lines.findIndex((line) => /^\s*(works|address)\s*:/i.test(line));
  const addressMarkerIndex = lines.findIndex((line) => /\b(s\.?\s*[fc]\.?no|sy no|survey no|door\s*no|godown|plot|shed|no\.|#)\b/i.test(line));
  const nameIndex = name ? lines.findIndex((line) => normalizeNameCandidate(line) === name) : -1;
  const start =
    sellerDetailIndex >= 0
      ? sellerDetailIndex + 1
      : worksIndex >= 0
        ? worksIndex
        : addressMarkerIndex >= 0
          ? addressMarkerIndex
          : nameIndex >= 0
            ? nameIndex + 1
            : 0;
  const addressLines: string[] = [];

  for (let index = start; index < lines.length && index < start + 50 && addressLines.length < 5; index += 1) {
    const line = lines[index];
    if (shouldStopAddress(line, name, gstin, phone, email, addressLines.length)) continue;
    if (addressLines.length > 0 && /^[\s,.-]*\d{6}[\s,.-]*$/.test(line)) {
      addressLines.push(stripAddressPrefix(line));
      break;
    }
    if (!isAddressLine(line)) continue;
    addressLines.push(stripAddressPrefix(line));
    if (/\b\d{6}\b/.test(line) && addressLines.length >= 2) break;
  }

  return addressLines.join(', ');
}

function shouldStopAddress(line: string, name: string, gstin: string, phone: string, email: string, collected: number) {
  const normalized = normalizeNameCandidate(line);
  if (name && normalized === name) return true;
  if (gstin && line.toUpperCase().includes(gstin)) return true;
  if (phone && line.includes(phone)) return true;
  if (email && line.toLowerCase().includes(email.toLowerCase())) return true;
  return collected > 0 && /\b(tax invoice|invoice no|invoice date|recipient|billed to|consignee|shipped to|buyer|customer|state code|pan|cin|gstin|gstn|gst no|phone|mobile|email|terms|declaration|signature|transport|vehicle|eway|e-way)\b/i.test(line);
}

function isAddressLine(line: string) {
  if (!/[A-Za-z]/.test(line)) return false;
  if (isNoiseLine(line)) return false;
  if (/^[A-Z]{5}\d{4}[A-Z]$/i.test(line.replace(/\s+/g, ''))) return false;
  if (/%|^\d+(?:[.,]\d+)?$|\b(kgs|mts|pcs|steel ?tube|quality|galvanize|current acc|account type|bank name|sr\.?\s*no|description|uom|qty|rate|amount|total invoice)\b/i.test(line)) return false;
  return /\d/.test(line) ||
    /\b(works|village|post|taluk|district|dist|road|street|nagar|panchayat|tamil nadu|tamilnadu|coimbatore|krishnagiri|salem|hosur|madukkarai|uppupara|shoolagiri|palakkad|dharmapuri)\b/i.test(line);
}

function stripAddressPrefix(line: string) {
  return line.replace(/^\s*(works|address)\s*:\s*/i, '').replace(/\s*,\s*$/, '').trim();
}

function normalizeNameCandidate(line: string) {
  return line
    .replace(/^for\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelySupplierName(line: string) {
  if (line.length < 4 || line.length > 80) return false;
  if (isNoiseLine(line)) return false;
  if (/\b(lucky traders|recipient|consignee|buyer|customer|tax invoice|invoice|original|duplicate|triplicate|quadru?plicate)\b/i.test(line)) return false;
  if (/\d{4,}/.test(line)) return false;
  if (!/[A-Za-z]/.test(line)) return false;

  return /\b(pvt|private|ltd|limited|llp|alloys|pipes|tubes|steels?|cement|hardware|industries|traders|enterprises|systems|plastic|fab)\b/i.test(line) ||
    /^[A-Z][A-Z0-9 .,&()/-]{5,}$/.test(line);
}

function isLuckyTradersGstin(gstin: string) {
  return gstin.toUpperCase() === '33CJHPM0971N1ZV';
}

function isNoiseLine(line: string) {
  return /\b(invoice|bill|tax|gstin|gstn|gst no|phone|mobile|email|date|qty|rate|amount|total|hsn|isn|eway|e-way|bank|account|ifsc|signature|transport|vehicle|driver|state code|pan|cin|iec|range|division|commissionerate|customer id|place of supply|item|description|terms|declaration|authorised|authorized|page)\b/i.test(line);
}

function titleCaseBusinessName(value: string) {
  return value
    .split(' ')
    .map((part) => {
      if (part.length <= 3 && /^[a-z]+$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function extractPdfObjects(binary: string) {
  const objects: PdfObject[] = [];
  const matches = binary.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g);

  for (const match of matches) {
    objects.push({
      id: Number.parseInt(match[1], 10),
      body: match[2],
    });
  }

  return objects;
}

function decodePdfStreams(pdfObjects: PdfObject[]) {
  const streams: DecodedStream[] = [];
  const fontFileObjectIds = findFontFileObjectIds(pdfObjects);

  for (const object of pdfObjects) {
    if (fontFileObjectIds.has(object.id)) continue;

    const streamIndex = object.body.indexOf('stream');
    const endIndex = object.body.lastIndexOf('endstream');
    if (streamIndex < 0 || endIndex <= streamIndex) continue;

    const dictionary = object.body.slice(0, streamIndex);
    if (/\/FontFile\d?\b|\/Length1\b/.test(dictionary)) continue;

    const rawStream = stripStreamNewlines(object.body.slice(streamIndex + 'stream'.length, endIndex));
    const streamBytes = binaryToBytes(rawStream);
    const content = /\/FlateDecode\b/.test(dictionary)
      ? inflatePdfStream(streamBytes)
      : hasBinaryImageFilter(dictionary)
        ? ''
        : rawStream;

    if (content) {
      streams.push({ objectId: object.id, content });
    }
  }

  return streams;
}

function findFontFileObjectIds(pdfObjects: PdfObject[]) {
  const objectIds = new Set<number>();

  for (const object of pdfObjects) {
    const matches = object.body.matchAll(/\/FontFile\d?\s+(\d+)\s+0\s+R/g);
    for (const match of matches) {
      objectIds.add(Number.parseInt(match[1], 10));
    }
  }

  return objectIds;
}

function inflatePdfStream(bytes: Uint8Array) {
  const variants = [bytes, trimTrailingNewlines(bytes)];

  for (const variant of variants) {
    try {
      return bytesToBinary(inflate(variant));
    } catch {
      // Try the next variant. Some generated PDFs include the stream line break in /Length.
    }
  }

  return '';
}

function buildFontUnicodeMaps(pdfObjects: PdfObject[], decodedStreams: DecodedStream[]) {
  const streamByObjectId = new Map(decodedStreams.map((stream) => [stream.objectId, stream.content]));
  const toUnicodeByFontObject = new Map<number, number>();
  const fontObjectByResourceName = new Map<string, number>();
  const fontMaps: Record<string, UnicodeMap> = {};

  for (const object of pdfObjects) {
    const toUnicodeObject = object.body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/)?.[1];
    if (toUnicodeObject) {
      toUnicodeByFontObject.set(object.id, Number.parseInt(toUnicodeObject, 10));
    }

    const fontRefs = object.body.matchAll(/\/([A-Za-z][A-Za-z0-9._-]*)\s+(\d+)\s+0\s+R/g);
    for (const match of fontRefs) {
      if (/^F\d+$/i.test(match[1])) {
        fontObjectByResourceName.set(match[1], Number.parseInt(match[2], 10));
      }
    }
  }

  for (const [resourceName, fontObjectId] of fontObjectByResourceName.entries()) {
    const unicodeObjectId = toUnicodeByFontObject.get(fontObjectId);
    const cmap = unicodeObjectId ? streamByObjectId.get(unicodeObjectId) : '';
    if (cmap) {
      fontMaps[resourceName] = parseUnicodeMap(cmap);
    }
  }

  return fontMaps;
}

function parseUnicodeMap(cmap: string) {
  const map: UnicodeMap = new Map();

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    const charMatches = block[1].matchAll(/<([0-9A-Fa-f]{4,})>\s*<([0-9A-Fa-f]{4,})>/g);
    for (const match of charMatches) {
      map.set(match[1].toUpperCase(), unicodeHexToString(match[2]));
    }
  }

  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const rangeMatches = block[1].matchAll(/<([0-9A-Fa-f]{4,})>\s*<([0-9A-Fa-f]{4,})>\s*<([0-9A-Fa-f]{4,})>/g);
    for (const match of rangeMatches) {
      const start = Number.parseInt(match[1], 16);
      const end = Number.parseInt(match[2], 16);
      const destStart = Number.parseInt(match[3], 16);
      for (let code = start; code <= end && code - start < 256; code += 1) {
        map.set(code.toString(16).padStart(match[1].length, '0').toUpperCase(), String.fromCharCode(destStart + code - start));
      }
    }
  }

  return map;
}

function extractTextOperations(content: string, fontMaps: Record<string, UnicodeMap>) {
  const values: string[] = [];
  let currentFont = '';
  const operationRegex = /\/([A-Za-z][A-Za-z0-9._-]*)\s+[-+]?\d*\.?\d+\s+Tf|\[(.*?)\]\s*TJ|<([0-9A-Fa-f\s]+)>\s*Tj/gs;
  let match: RegExpMatchArray | null;

  while ((match = operationRegex.exec(content))) {
    if (match[1]) {
      currentFont = match[1];
      continue;
    }

    const map = fontMaps[currentFont];
    const hexValues = match[2]
      ? [...match[2].matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((hexMatch) => hexMatch[1])
      : match[3]
        ? [match[3]]
        : [];
    const text = hexValues.map((hex) => decodeHexText(hex, map)).join('');
    if (cleanLine(text)) values.push(text);
  }

  return values;
}

function decodeHexText(hex: string, unicodeMap?: UnicodeMap) {
  const cleaned = hex.replace(/\s+/g, '').toUpperCase();
  let value = '';

  if (unicodeMap) {
    for (let index = 0; index < cleaned.length; index += 4) {
      const key = cleaned.slice(index, index + 4);
      value += unicodeMap.get(key) || '';
    }
    return value;
  }

  for (let index = 0; index < cleaned.length; index += 2) {
    const code = Number.parseInt(cleaned.slice(index, index + 2), 16);
    if (code >= 32 && code <= 126) value += String.fromCharCode(code);
  }

  return value;
}

function unicodeHexToString(hex: string) {
  const cleaned = hex.replace(/\s+/g, '');
  let value = '';
  for (let index = 0; index < cleaned.length; index += 4) {
    const code = Number.parseInt(cleaned.slice(index, index + 4), 16);
    if (Number.isFinite(code)) value += String.fromCharCode(code);
  }
  return value;
}

function hasPdfTextOperators(content: string) {
  return /\bBT\b/.test(content) && /\/[A-Za-z][A-Za-z0-9._-]*\s+[-+]?\d*\.?\d+\s+Tf/.test(content) && /(?:Tj|TJ)\b/.test(content);
}

function hasBinaryImageFilter(dictionary: string) {
  return /\/(?:DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode|RunLengthDecode)\b/i.test(dictionary);
}

function stripStreamNewlines(value: string) {
  return value.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
}

function trimTrailingNewlines(bytes: Uint8Array) {
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 10 || bytes[end - 1] === 13)) {
    end -= 1;
  }
  return bytes.slice(0, end);
}

function extractLiteralStrings(binary: string) {
  const values: string[] = [];

  for (let index = 0; index < binary.length; index += 1) {
    if (binary[index] !== '(') continue;
    let value = '';
    let depth = 1;

    for (index += 1; index < binary.length && depth > 0; index += 1) {
      const char = binary[index];
      if (char === '\\') {
        const next = binary[index + 1];
        if (next) {
          value += decodePdfEscape(next);
          index += 1;
        }
        continue;
      }
      if (char === '(') {
        depth += 1;
        value += char;
        continue;
      }
      if (char === ')') {
        depth -= 1;
        if (depth > 0) value += char;
        continue;
      }
      value += char;
    }

    if (isReadableText(value)) values.push(value);
  }

  return values;
}

function extractHexStrings(binary: string) {
  const values: string[] = [];
  const matches = binary.matchAll(/<([0-9A-Fa-f\s]{8,})>/g);

  for (const match of matches) {
    const hex = match[1].replace(/\s+/g, '');
    if (hex.length % 2 !== 0) continue;
    let value = '';
    for (let index = 0; index < hex.length; index += 2) {
      const code = Number.parseInt(hex.slice(index, index + 2), 16);
      if (code >= 32 && code <= 126) value += String.fromCharCode(code);
    }
    if (isReadableText(value)) values.push(value);
  }

  return values;
}

function extractPrintableRuns(binary: string) {
  return binary.match(/[A-Za-z0-9][A-Za-z0-9 .,#:/@&()_+\-'"]{5,}/g)?.filter(isReadableText) || [];
}

function isReadableText(value: string) {
  const cleaned = cleanLine(value);
  if (cleaned.length < 3) return false;
  const letters = cleaned.replace(/[^A-Za-z0-9]/g, '').length;
  return letters / cleaned.length > 0.35;
}

function cleanLine(line: string) {
  return line.replace(/\s+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
}

function normalizePdfText(text: string) {
  return text
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => cleanLine(line))
    .filter((line, index, lines) => line.length >= 2 && lines.indexOf(line) === index)
    .join('\n');
}

function decodePdfEscape(char: string) {
  switch (char) {
    case 'n':
      return '\n';
    case 'r':
      return '\n';
    case 't':
      return ' ';
    case 'b':
    case 'f':
      return '';
    default:
      return char;
  }
}

function decodeBase64ToBytes(base64: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const output: number[] = [];
  let index = 0;

  while (index < cleanBase64.length) {
    const encoded1 = chars.indexOf(cleanBase64.charAt(index++));
    const encoded2 = chars.indexOf(cleanBase64.charAt(index++));
    const encoded3 = chars.indexOf(cleanBase64.charAt(index++));
    const encoded4 = chars.indexOf(cleanBase64.charAt(index++));

    const chr1 = (encoded1 << 2) | (encoded2 >> 4);
    const chr2 = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    const chr3 = ((encoded3 & 3) << 6) | encoded4;

    if (encoded1 >= 0 && encoded2 >= 0) output.push(chr1 & 255);
    if (encoded3 !== 64 && encoded3 !== -1) output.push(chr2 & 255);
    if (encoded4 !== 64 && encoded4 !== -1) output.push(chr3 & 255);
  }

  return new Uint8Array(output);
}

function bytesToBinary(bytes: Uint8Array | number[]) {
  let output = '';
  for (let index = 0; index < bytes.length; index += 1) {
    output += String.fromCharCode(bytes[index]);
  }
  return output;
}

function binaryToBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 255;
  }
  return bytes;
}
