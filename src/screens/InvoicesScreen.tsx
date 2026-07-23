import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { money, numberFormat, sortSavedInvoicesByInvoiceDate } from '../invoiceCore';
import { Card } from '../components/common';
import { InvoiceBillPreview } from '../components/InvoiceBillPreview';
import { styles } from '../styles';
import type { SavedInvoiceDocument } from '../types';

const INVOICES_PER_PAGE = 10;
type InvoiceFilter = 'all' | 'saved' | 'printed' | 'shared' | 'recent';

const invoiceFilters: { key: InvoiceFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'saved', label: 'Saved' },
  { key: 'printed', label: 'Printed' },
  { key: 'shared', label: 'Shared' },
  { key: 'recent', label: 'Recent' },
];

export function InvoicesScreen({
  savedInvoices,
  previewingInvoiceId,
  previewSavedInvoice,
  editSavedInvoice,
  deleteSavedInvoice,
  printSavedInvoice,
  shareSavedInvoice,
  addInvoice,
}: {
  savedInvoices: SavedInvoiceDocument[];
  previewingInvoiceId: string | null;
  previewSavedInvoice: (savedInvoice: SavedInvoiceDocument) => void;
  editSavedInvoice: (savedInvoice: SavedInvoiceDocument) => void;
  deleteSavedInvoice: (savedInvoice: SavedInvoiceDocument) => void;
  printSavedInvoice: (savedInvoice: SavedInvoiceDocument) => void;
  shareSavedInvoice: (savedInvoice: SavedInvoiceDocument) => void;
  addInvoice: () => void;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const orderedInvoices = useMemo(() => sortSavedInvoicesByInvoiceDate(savedInvoices), [savedInvoices]);
  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = orderedInvoices.filter((savedInvoice) => {
      const productText = savedInvoice.totals.rows.map((row) => row.description).join(' ');
      const matchesSearch = !query || [
        savedInvoice.invoiceNo,
        savedInvoice.invoice.toName,
        savedInvoice.invoice.toGstin,
        savedInvoice.invoice.toPhone,
        savedInvoice.invoice.invoiceDate,
        savedInvoice.savedAt,
        productText,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesFilter = filter === 'all' || filter === 'recent' || savedInvoice.status === filter;
      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, INVOICES_PER_PAGE);
    }

    return result;
  }, [filter, orderedInvoices, search]);
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / INVOICES_PER_PAGE));
  const visibleInvoices = useMemo(() => {
    const start = (currentPage - 1) * INVOICES_PER_PAGE;
    return filteredInvoices.slice(start, start + INVOICES_PER_PAGE);
  }, [currentPage, filteredInvoices]);
  const totalValue = filteredInvoices.reduce((sum, savedInvoice) => sum + savedInvoice.totals.total, 0);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>INVOICE DATABASE</Text>
          <Text style={styles.pageTitle}>Invoices</Text>
          <Text style={styles.pageSubtitle}>
            {savedInvoices.length} saved | {filteredInvoices.length} showing | Latest 10 per page
          </Text>
        </View>
        <Pressable style={styles.pagePrimaryButton} onPress={addInvoice}>
          <MaterialCommunityIcons name="plus" size={18} color="#ffffff" />
          <Text style={styles.pagePrimaryButtonText}>Add Invoice</Text>
        </Pressable>
      </View>

      <Card title="Invoice list" icon="format-list-bulleted-square">
        {savedInvoices.length === 0 ? (
          <Text style={styles.mutedText}>No saved invoices yet. Use Add Invoice to create the first bill.</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search invoice no, client, GSTIN, date, or product"
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
              {invoiceFilters.map((item) => {
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
                <Text style={styles.listToolbarTitle}>Latest invoices</Text>
                <Text style={styles.listToolbarMeta}>Page {currentPage} of {totalPages}</Text>
              </View>
              <Text style={styles.listCountBadge}>{money(totalValue)}</Text>
            </View>

            {filteredInvoices.length === 0 ? (
              <Text style={styles.mutedText}>No invoices match this search or filter.</Text>
            ) : (
              <View style={styles.invoiceList}>
                {visibleInvoices.map((savedInvoice) => {
                  const qty = savedInvoice.totals.rows.reduce(
                    (sum, row) => sum + (row.kind === 'product' ? row.qty || 0 : 0),
                    0,
                  );
                  return (
                    <View style={styles.savedInvoiceCard} key={savedInvoice.id}>
                      <Pressable
                        style={styles.invoiceCollapsedRow}
                        onPress={() => setExpandedInvoiceId((current) => (current === savedInvoice.id ? null : savedInvoice.id))}
                      >
                        <View style={styles.quickActionText}>
                          <Text style={styles.savedInvoiceNo} numberOfLines={1}>
                            {savedInvoice.invoiceNo}
                          </Text>
                          <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                            {savedInvoice.invoice.toName}
                          </Text>
                        </View>
                        <View style={styles.savedInvoiceTotalBadge}>
                          <Text style={styles.savedInvoiceStatus}>{savedInvoice.status.toUpperCase()}</Text>
                          <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {money(savedInvoice.totals.total)}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={expandedInvoiceId === savedInvoice.id ? 'chevron-up' : 'chevron-down'}
                          size={22}
                          color="#667085"
                        />
                      </Pressable>

                      {expandedInvoiceId === savedInvoice.id ? (
                        <View style={styles.invoiceExpandedDetails}>
                          <View style={styles.reportGrid}>
                            <View style={styles.reportTile}>
                              <Text style={styles.reportLabel}>Total</Text>
                              <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                                {money(savedInvoice.totals.total)}
                              </Text>
                            </View>
                            <View style={styles.reportTile}>
                              <Text style={styles.reportLabel}>Qty</Text>
                              <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                {numberFormat(qty)}
                              </Text>
                              <Text style={styles.reportSubValue}>Kg</Text>
                            </View>
                            <View style={styles.reportTile}>
                              <Text style={styles.reportLabel}>GST</Text>
                              <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                                {money(savedInvoice.totals.gst)}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.clientInvoiceList}>
                            <Text style={styles.clientMeta}>Client: {savedInvoice.invoice.toName}</Text>
                            <Text style={styles.clientMeta}>Date: {savedInvoice.invoice.invoiceDate} | Saved: {savedInvoice.savedAt}</Text>
                            <Text style={styles.clientMeta}>GSTIN: {savedInvoice.invoice.toGstin || '-'}</Text>
                            <Text style={styles.clientMeta}>Phone: {savedInvoice.invoice.toPhone || '-'}</Text>
                          </View>

                          <View style={styles.invoiceActionRow}>
                            <Pressable style={styles.invoicePreviewButton} onPress={() => previewSavedInvoice(savedInvoice)}>
                              <MaterialCommunityIcons name="eye-outline" size={17} color="#163a5f" />
                              <Text style={styles.invoicePreviewButtonText}>
                                {previewingInvoiceId === savedInvoice.id ? 'Hide' : 'Preview'}
                              </Text>
                            </Pressable>
                            <Pressable style={styles.editClientButton} onPress={() => editSavedInvoice(savedInvoice)}>
                              <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                              <Text style={styles.editClientButtonText}>Edit</Text>
                            </Pressable>
                            <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteSavedInvoice(savedInvoice)}>
                              <MaterialCommunityIcons name="trash-can-outline" size={17} color="#a62835" />
                              <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                            </Pressable>
                          </View>

                          {previewingInvoiceId === savedInvoice.id ? (
                            <SavedInvoicePreview
                              savedInvoice={savedInvoice}
                              onPrint={() => printSavedInvoice(savedInvoice)}
                              onShare={() => shareSavedInvoice(savedInvoice)}
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
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

function SavedInvoicePreview({
  savedInvoice,
  onPrint,
  onShare,
}: {
  savedInvoice: SavedInvoiceDocument;
  onPrint: () => void;
  onShare: () => void;
}) {
  return (
    <View style={styles.savedInvoicePreview}>
      <InvoiceBillPreview invoice={savedInvoice.invoice} totals={savedInvoice.totals} />
      <View style={styles.actionGrid}>
        <Pressable style={styles.printButton} onPress={onPrint}>
          <MaterialCommunityIcons name="printer" size={20} color="#ffffff" />
          <Text style={styles.printButtonText}>Print</Text>
        </Pressable>
        <Pressable style={styles.shareButton} onPress={onShare}>
          <MaterialCommunityIcons name="share-variant" size={20} color="#163a5f" />
          <Text style={styles.shareButtonText}>Share PDF</Text>
        </Pressable>
      </View>
    </View>
  );
}
