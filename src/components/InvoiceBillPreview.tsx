import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { logo, signature } from '../assets';
import { getInvoiceSeller, getPrintableAssets, money, numberFormat, words } from '../invoiceCore';
import { styles } from '../styles';
import type { InvoiceState, InvoiceTotals } from '../types';
import { FinalBillSummaryLine } from './common';

export function InvoiceBillPreview({ invoice, totals }: { invoice: InvoiceState; totals: InvoiceTotals }) {
  const [previewAssets, setPreviewAssets] = useState<{ logoDataUri: string; signatureDataUri: string } | null>(null);
  const seller = getInvoiceSeller(invoice);
  const taxRows = invoice.gstType === 'igst'
    ? [{ label: 'IGST (18%)', amount: totals.gst }]
    : [
        { label: 'CGST (9%)', amount: totals.gst / 2 },
        { label: 'SGST (9%)', amount: totals.gst / 2 },
      ];

  useEffect(() => {
    let cancelled = false;

    getPrintableAssets()
      .then((assets) => {
        if (!cancelled) setPreviewAssets(assets);
      })
      .catch((error) => {
        console.warn('Unable to load preview invoice assets', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.finalBillScroll}>
      <View style={styles.finalBillPage}>
        <View style={styles.finalBillHeader}>
          <View>
            <Image
              source={previewAssets ? { uri: previewAssets.logoDataUri } : logo}
              style={styles.finalBillLogo}
              resizeMode="contain"
            />
            <Text style={styles.finalBillCompany}>{seller.name}</Text>
          </View>
          <View style={styles.finalBillMeta}>
            <Text style={styles.finalBillMetaText}>
              <Text style={styles.finalBillMetaLabel}>Invoice No: </Text>
              {invoice.invoiceNo}
            </Text>
            <Text style={styles.finalBillMetaText}>
              <Text style={styles.finalBillMetaLabel}>Invoice Date: </Text>
              {invoice.invoiceDate}
            </Text>
          </View>
        </View>

        <View style={styles.finalBillGoldLine} />

        <View style={styles.finalBillParties}>
          <View style={styles.finalBillParty}>
            <Text style={styles.finalBillPartyTitle}>From:</Text>
            <Text style={styles.finalBillPartyStrong}>{seller.name}</Text>
            {seller.addressLines.map((line) => (
              <Text style={styles.finalBillText} key={line}>{line}</Text>
            ))}
            <Text style={styles.finalBillText}>{seller.gstin}</Text>
            <Text style={styles.finalBillText}>
              <Text style={styles.finalBillPartyStrong}>Phone: </Text>
              <Text style={styles.finalBillBlue}>{seller.phone}</Text>
            </Text>
          </View>
          <View style={styles.finalBillParty}>
            <Text style={styles.finalBillPartyTitle}>To:</Text>
            <Text style={styles.finalBillPartyStrong}>{invoice.toName}</Text>
            <Text style={styles.finalBillText}>{invoice.toAddress}</Text>
            <Text style={styles.finalBillText}>
              <Text style={styles.finalBillPartyStrong}>GSTIN: </Text>
              {invoice.toGstin}
            </Text>
            <Text style={styles.finalBillText}>
              <Text style={styles.finalBillPartyStrong}>Phone: </Text>
              {invoice.toPhone || '-'}
            </Text>
          </View>
        </View>

        <View style={styles.finalBillTable}>
          <View style={[styles.finalBillTableRow, styles.finalBillTableHead]}>
            <Text style={[styles.finalBillCell, styles.finalBillColNo]}>#</Text>
            <Text style={[styles.finalBillCell, styles.finalBillColProduct]}>PRODUCT</Text>
            <Text style={[styles.finalBillCell, styles.finalBillColHsn]}>HSN / CODE</Text>
            <Text style={[styles.finalBillCell, styles.finalBillColQty]}>QTY (Kg)</Text>
            <Text style={[styles.finalBillCell, styles.finalBillColRate]}>RATE</Text>
            <Text style={[styles.finalBillCell, styles.finalBillColTax]}>TAX %</Text>
            <Text style={[styles.finalBillCell, styles.finalBillColAmount, styles.finalBillRight]}>Amount</Text>
          </View>
          {totals.rows.map((row) => (
            <View style={styles.finalBillTableRow} key={`${row.index}-${row.description}`}>
              <Text style={[styles.finalBillCell, styles.finalBillColNo]}>{row.index}</Text>
              <Text style={[styles.finalBillCell, styles.finalBillColProduct]}>{row.description}</Text>
              <Text style={[styles.finalBillCell, styles.finalBillColHsn]}>{row.hsn || '-'}</Text>
              <Text style={[styles.finalBillCell, styles.finalBillColQty]}>{row.qty === null ? '-' : numberFormat(row.qty)}</Text>
              <Text style={[styles.finalBillCell, styles.finalBillColRate]}>{row.price === null ? '-' : numberFormat(row.price)}</Text>
              <Text style={[styles.finalBillCell, styles.finalBillColTax]}>18% ({row.gstMode === 'included' ? 'Included' : 'Excluded'})</Text>
              <Text style={[styles.finalBillCell, styles.finalBillColAmount, styles.finalBillRight, styles.finalBillBold]}>{money(row.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.finalBillSummary}>
          <FinalBillSummaryLine label="Taxable Value:" value={money(totals.taxable)} />
          {taxRows.map((row) => <FinalBillSummaryLine key={row.label} label={`${row.label}:`} value={money(row.amount)} />)}
          <FinalBillSummaryLine label="Total GST:" value={money(totals.gst)} />
          <FinalBillSummaryLine label="Round Off:" value={money(totals.roundOff)} />
          <View style={[styles.finalBillSummaryLine, styles.finalBillGrandLine]}>
            <Text style={[styles.finalBillSummaryLabel, styles.finalBillGrandText]}>Grand Total:</Text>
            <Text
              style={[styles.finalBillSummaryValue, styles.finalBillGrandText]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {money(totals.total)}
            </Text>
          </View>
        </View>

        <Text style={styles.finalBillWords}>Amount in Words: {words(totals.total)}</Text>

        {invoice.hasEway && invoice.eway.trim() ? (
          <View style={styles.finalBillEway}>
            <View style={styles.finalBillEwayRow}>
              <Text style={styles.finalBillEwayCell}><Text style={styles.finalBillBold}>E-Way Bill No: </Text>{invoice.eway}</Text>
              <Text style={styles.finalBillEwayCell}><Text style={styles.finalBillBold}>Date: </Text>{invoice.ewayDate}</Text>
            </View>
            <View style={styles.finalBillEwayRow}>
              <Text style={styles.finalBillEwayCell}><Text style={styles.finalBillBold}>Driver Name: </Text>{invoice.driver || '-'}</Text>
              <Text style={styles.finalBillEwayCell}><Text style={styles.finalBillBold}>Vehicle No: </Text>{invoice.vehicle || '-'}</Text>
            </View>
            <View style={styles.finalBillEwayRow}>
              <Text style={styles.finalBillEwayCell}><Text style={styles.finalBillBold}>Mobile No: </Text>{invoice.mobile || '-'}</Text>
              <Text style={styles.finalBillEwayCell}><Text style={styles.finalBillBold}>Valid Upto: </Text>{invoice.validDate}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.finalBillFooter}>
          <View style={styles.finalBillBank}>
            <Text style={styles.finalBillBankTitle}>BANK DETAILS</Text>
            <Text style={styles.finalBillText}><Text style={styles.finalBillBold}>Bank Name:</Text> UNION BANK</Text>
            <Text style={styles.finalBillText}>
              <Text style={styles.finalBillBold}>Account No: </Text>
              <Text style={styles.finalBillBlue}>558701010230709</Text>
            </Text>
            <Text style={styles.finalBillText}><Text style={styles.finalBillBold}>Branch:</Text> Krishnagiri</Text>
            <Text style={styles.finalBillText}><Text style={styles.finalBillBold}>IFSC Code:</Text> UBIN0555878</Text>
          </View>
          <View style={styles.finalBillSign}>
            <Text style={styles.finalBillPartyStrong}>For {seller.name}</Text>
            <Image
              source={previewAssets ? { uri: previewAssets.signatureDataUri } : signature}
              style={styles.finalBillSignature}
              resizeMode="contain"
            />
            <Text style={styles.finalBillPartyStrong}>Authorized Signatory</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
