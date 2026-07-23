import type { GstMode, GstType } from './types';

export const SETTINGS_STORAGE_KEY = 'lucky-traders.settings.v1';

export type BusinessSettings = {
  companyName: string;
  companyAddress: string;
  companyGstin: string;
  companyPhone: string;
  companyEmail: string;
  logoUri: string;
  logoFileName: string;
  signatureUri: string;
  signatureFileName: string;
  bankName: string;
  bankAccountNo: string;
  bankBranch: string;
  bankIfsc: string;
  invoicePrefix: string;
  invoicePadding: number;
  financialYearStartMonth: number;
  gstRatePercent: number;
  defaultGstMode: GstMode;
  defaultGstType: GstType;
  updatedAt: string;
  updatedBy: string;
  updatedByRole: string;
};

export type SettingsDraft = {
  companyName: string;
  companyAddress: string;
  companyGstin: string;
  companyPhone: string;
  companyEmail: string;
  logoUri: string;
  logoFileName: string;
  signatureUri: string;
  signatureFileName: string;
  bankName: string;
  bankAccountNo: string;
  bankBranch: string;
  bankIfsc: string;
  invoicePrefix: string;
  invoicePadding: string;
  financialYearStartMonth: string;
  gstRatePercent: string;
  defaultGstMode: GstMode;
  defaultGstType: GstType;
};

export const defaultBusinessSettings: BusinessSettings = {
  companyName: 'LUCKY TRADERS',
  companyAddress: '2/164/14 Line KollaiVenkatapuram\nKrishnagiri Tamil Nadu - India. -635002',
  companyGstin: '33CJHPM0971N1ZV',
  companyPhone: '+91 7418287561',
  companyEmail: '',
  logoUri: '',
  logoFileName: '',
  signatureUri: '',
  signatureFileName: '',
  bankName: 'UNION BANK',
  bankAccountNo: '558701010230709',
  bankBranch: 'Krishnagiri',
  bankIfsc: 'UBIN0555878',
  invoicePrefix: '#LT',
  invoicePadding: 3,
  financialYearStartMonth: 4,
  gstRatePercent: 18,
  defaultGstMode: 'excluded',
  defaultGstType: 'split',
  updatedAt: '',
  updatedBy: '',
  updatedByRole: '',
};

export function normalizeBusinessSettings(value: Partial<BusinessSettings> | null | undefined): BusinessSettings {
  const source = value || {};
  return {
    ...defaultBusinessSettings,
    ...source,
    companyName: cleanString(source.companyName, defaultBusinessSettings.companyName),
    companyAddress: cleanString(source.companyAddress, defaultBusinessSettings.companyAddress),
    companyGstin: cleanString(source.companyGstin, defaultBusinessSettings.companyGstin),
    companyPhone: cleanString(source.companyPhone, defaultBusinessSettings.companyPhone),
    companyEmail: cleanString(source.companyEmail, ''),
    logoUri: cleanString(source.logoUri, ''),
    logoFileName: cleanString(source.logoFileName, ''),
    signatureUri: cleanString(source.signatureUri, ''),
    signatureFileName: cleanString(source.signatureFileName, ''),
    bankName: cleanString(source.bankName, defaultBusinessSettings.bankName),
    bankAccountNo: cleanString(source.bankAccountNo, defaultBusinessSettings.bankAccountNo),
    bankBranch: cleanString(source.bankBranch, defaultBusinessSettings.bankBranch),
    bankIfsc: cleanString(source.bankIfsc, defaultBusinessSettings.bankIfsc),
    invoicePrefix: cleanString(source.invoicePrefix, defaultBusinessSettings.invoicePrefix),
    invoicePadding: clampInteger(source.invoicePadding, 1, 6, defaultBusinessSettings.invoicePadding),
    financialYearStartMonth: clampInteger(source.financialYearStartMonth, 1, 12, defaultBusinessSettings.financialYearStartMonth),
    gstRatePercent: clampNumber(source.gstRatePercent, 0, 28, defaultBusinessSettings.gstRatePercent),
    defaultGstMode: source.defaultGstMode === 'included' ? 'included' : 'excluded',
    defaultGstType: source.defaultGstType === 'igst' ? 'igst' : 'split',
    updatedAt: cleanString(source.updatedAt, ''),
    updatedBy: cleanString(source.updatedBy, ''),
    updatedByRole: cleanString(source.updatedByRole, ''),
  };
}

export function settingsToDraft(settings: BusinessSettings): SettingsDraft {
  return {
    companyName: settings.companyName,
    companyAddress: settings.companyAddress,
    companyGstin: settings.companyGstin,
    companyPhone: settings.companyPhone,
    companyEmail: settings.companyEmail,
    logoUri: settings.logoUri,
    logoFileName: settings.logoFileName,
    signatureUri: settings.signatureUri,
    signatureFileName: settings.signatureFileName,
    bankName: settings.bankName,
    bankAccountNo: settings.bankAccountNo,
    bankBranch: settings.bankBranch,
    bankIfsc: settings.bankIfsc,
    invoicePrefix: settings.invoicePrefix,
    invoicePadding: String(settings.invoicePadding),
    financialYearStartMonth: String(settings.financialYearStartMonth),
    gstRatePercent: String(settings.gstRatePercent),
    defaultGstMode: settings.defaultGstMode,
    defaultGstType: settings.defaultGstType,
  };
}

export function draftToSettings(draft: SettingsDraft, current: BusinessSettings, audit: Pick<BusinessSettings, 'updatedAt' | 'updatedBy' | 'updatedByRole'>): BusinessSettings {
  return normalizeBusinessSettings({
    ...current,
    ...draft,
    invoicePadding: Number.parseInt(draft.invoicePadding, 10),
    financialYearStartMonth: Number.parseInt(draft.financialYearStartMonth, 10),
    gstRatePercent: Number.parseFloat(draft.gstRatePercent),
    updatedAt: audit.updatedAt,
    updatedBy: audit.updatedBy,
    updatedByRole: audit.updatedByRole,
  });
}

export function splitCompanyAddress(settings: BusinessSettings) {
  return settings.companyAddress
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function cleanString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.trim() : fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value || ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
