import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { money, numberFormat, sortSavedInvoicesByInvoiceDate } from '../invoiceCore';
import type { ClientDocument, ClientForm } from '../nosqlClientTable';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { Card, ClientSummary, Field } from '../components/common';
import { styles } from '../styles';
import type { SavedInvoiceDocument } from '../types';

const CLIENTS_PER_PAGE = 10;

type ClientFilter = 'all' | 'gst' | 'urp' | 'recent';

const clientFilters: { key: ClientFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gst', label: 'GST' },
  { key: 'urp', label: 'URP' },
  { key: 'recent', label: 'Recent' },
];

export function ClientsScreen({
  user,
  clients,
  savedInvoices,
  clientForm,
  editingClientId,
  updateClientForm,
  saveClient,
  startEditClient,
  cancelEditClient,
  useClientForInvoice,
  deleteClient,
}: {
  user: AuthenticatedUser;
  clients: ClientDocument[];
  savedInvoices: SavedInvoiceDocument[];
  clientForm: ClientForm;
  editingClientId: string | null;
  updateClientForm: (field: keyof ClientForm, value: string) => void;
  saveClient: () => void;
  startEditClient: (client: ClientDocument) => void;
  cancelEditClient: () => void;
  useClientForInvoice: (client: ClientDocument) => void;
  deleteClient: (client: ClientDocument) => void;
}) {
  const [formVisible, setFormVisible] = useState(Boolean(editingClientId));
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [invoiceListClientId, setInvoiceListClientId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const clientStats = useMemo(() => buildClientStats(clients, savedInvoices), [clients, savedInvoices]);
  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = clients.filter((client) => {
      const matchesSearch = !query || [client.name, client.gstin, client.phone, client.address]
        .some((value) => value.toLowerCase().includes(query));
      const gstin = client.gstin.trim().toLowerCase();
      const matchesFilter =
        filter === 'all' ||
        (filter === 'gst' && Boolean(gstin && gstin !== 'urp')) ||
        (filter === 'urp' && (!gstin || gstin === 'urp')) ||
        filter === 'recent';

      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, CLIENTS_PER_PAGE);
    }

    return result;
  }, [clients, filter, search]);
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / CLIENTS_PER_PAGE));
  const visibleClients = useMemo(() => {
    const start = (currentPage - 1) * CLIENTS_PER_PAGE;
    return filteredClients.slice(start, start + CLIENTS_PER_PAGE);
  }, [currentPage, filteredClients]);

  useEffect(() => {
    if (editingClientId) {
      setFormVisible(true);
      setExpandedClientId(editingClientId);
    }
  }, [editingClientId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  function closeForm() {
    cancelEditClient();
    setFormVisible(false);
  }

  function openAddForm() {
    cancelEditClient();
    setFormVisible(true);
  }

  function callClient(client: ClientDocument) {
    const phone = normalizePhone(client.phone);
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch((error) => console.warn('Unable to open phone dialer', error));
  }

  function whatsappClient(client: ClientDocument) {
    const phone = normalizePhone(client.phone);
    if (!phone) return;
    Linking.openURL(`https://wa.me/${phone}`).catch((error) => console.warn('Unable to open WhatsApp', error));
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>CLIENT DATABASE</Text>
          <Text style={styles.pageTitle}>Clients</Text>
          <Text style={styles.pageSubtitle}>
            {clients.length} saved | {filteredClients.length} showing | Latest 10 per page
          </Text>
        </View>
        <Pressable style={styles.pagePrimaryButton} onPress={openAddForm}>
          <MaterialCommunityIcons name="account-plus-outline" size={18} color="#ffffff" />
          <Text style={styles.pagePrimaryButtonText}>Add Client</Text>
        </Pressable>
      </View>

      {formVisible ? (
        <Card
          title={editingClientId ? 'Edit client' : 'Add client'}
          icon={editingClientId ? 'account-edit-outline' : 'account-plus-outline'}
          action={
            <View style={styles.clientFormActions}>
              <Pressable style={styles.cancelEditButton} onPress={closeForm}>
                <MaterialCommunityIcons name="close" size={16} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={saveClient}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
                <Text style={styles.smallButtonText}>{editingClientId ? 'Update' : 'Save'}</Text>
              </Pressable>
            </View>
          }
        >
          <Field label="Client Name" value={clientForm.name} onChangeText={(value) => updateClientForm('name', value)} />
          <Field label="Address" value={clientForm.address} onChangeText={(value) => updateClientForm('address', value)} multiline />
          <Field label="GSTIN" value={clientForm.gstin} onChangeText={(value) => updateClientForm('gstin', value)} autoCapitalize="characters" />
          <Field label="Phone" value={clientForm.phone} onChangeText={(value) => updateClientForm('phone', value)} keyboardType="phone-pad" />
        </Card>
      ) : null}

      <Card title="Saved clients" icon="account-group-outline">
        {clients.length === 0 ? (
          <Text style={styles.mutedText}>No clients saved yet. Use Add Client to create the first client.</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search name, GSTIN, phone, or place"
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
              {clientFilters.map((item) => {
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
                <Text style={styles.listToolbarTitle}>Latest clients</Text>
                <Text style={styles.listToolbarMeta}>Page {currentPage} of {totalPages}</Text>
              </View>
              <Text style={styles.listCountBadge}>{visibleClients.length} showing</Text>
            </View>

            {filteredClients.length === 0 ? (
              <Text style={styles.mutedText}>No clients match this search or filter.</Text>
            ) : (
              <View style={styles.clientList}>
                {visibleClients.map((client) => {
                  const stats = clientStats.get(client.id) || emptyClientStats;
                  const phoneAvailable = Boolean(normalizePhone(client.phone));
                  return (
                    <View style={[styles.clientCard, editingClientId === client.id && styles.clientCardEditing]} key={client.id}>
                      <Pressable
                        style={styles.clientCollapsedRow}
                        onPress={() => setExpandedClientId((current) => (current === client.id ? null : client.id))}
                      >
                        <Text style={styles.clientCollapsedName} numberOfLines={1}>
                          {client.name}
                        </Text>
                        <MaterialCommunityIcons
                          name={expandedClientId === client.id ? 'chevron-up' : 'chevron-down'}
                          size={22}
                          color="#667085"
                        />
                      </Pressable>

                      {expandedClientId === client.id ? (
                        <View style={styles.clientExpandedDetails}>
                          <ClientSummary client={client} />

                          <View style={styles.reportGrid}>
                            <View style={styles.reportTile}>
                              <Text style={styles.reportLabel}>Sales</Text>
                              <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                                {money(stats.totalAmount)}
                              </Text>
                            </View>
                            <View style={styles.reportTile}>
                              <Text style={styles.reportLabel}>Invoices</Text>
                              <Text style={styles.reportValue}>{stats.invoiceCount}</Text>
                            </View>
                            <View style={styles.reportTile}>
                              <Text style={styles.reportLabel}>Qty</Text>
                              <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                {numberFormat(stats.qty)}
                              </Text>
                              <Text style={styles.reportSubValue}>Kg</Text>
                            </View>
                          </View>
                          <Text style={styles.clientAudit}>Last invoice: {stats.latestInvoice?.invoice.invoiceDate || '-'}</Text>

                          <View style={styles.clientUtilityRow}>
                            <Pressable
                              style={[styles.clientUtilityButton, !phoneAvailable && styles.navButtonDisabled]}
                              onPress={() => callClient(client)}
                              disabled={!phoneAvailable}
                            >
                              <MaterialCommunityIcons name="phone-outline" size={17} color="#163a5f" />
                              <Text style={styles.clientUtilityButtonText}>Call</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.clientUtilityButton, !phoneAvailable && styles.navButtonDisabled]}
                              onPress={() => whatsappClient(client)}
                              disabled={!phoneAvailable}
                            >
                              <MaterialCommunityIcons name="whatsapp" size={17} color="#0f5f45" />
                              <Text style={styles.clientUtilityButtonText}>WhatsApp</Text>
                            </Pressable>
                            <Pressable
                              style={styles.clientUtilityButton}
                              onPress={() => setInvoiceListClientId((current) => (current === client.id ? null : client.id))}
                            >
                              <MaterialCommunityIcons name="receipt-text-outline" size={17} color="#163a5f" />
                              <Text style={styles.clientUtilityButtonText}>Invoices</Text>
                            </Pressable>
                          </View>

                          {invoiceListClientId === client.id ? (
                            <View style={styles.clientInvoiceList}>
                              {stats.invoices.length > 0 ? (
                                stats.invoices.map((savedInvoice) => (
                                  <View style={styles.clientInvoiceRow} key={savedInvoice.id}>
                                    <View style={styles.quickActionText}>
                                      <Text style={styles.reportRowTitle}>{savedInvoice.invoiceNo}</Text>
                                      <Text style={styles.reportRowMeta}>
                                        {savedInvoice.invoice.invoiceDate} | {savedInvoice.status.toUpperCase()}
                                      </Text>
                                    </View>
                                    <Text style={styles.reportRowAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                                      {money(savedInvoice.totals.total)}
                                    </Text>
                                  </View>
                                ))
                              ) : (
                                <Text style={styles.mutedText}>No invoices saved for this client.</Text>
                              )}
                            </View>
                          ) : null}

                          <View style={styles.clientActionRow}>
                            <Pressable style={styles.editClientButton} onPress={() => startEditClient(client)}>
                              <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                              <Text style={styles.editClientButtonText}>Edit</Text>
                            </Pressable>
                            <Pressable style={styles.useClientButton} onPress={() => useClientForInvoice(client)}>
                              <MaterialCommunityIcons name="file-import-outline" size={17} color="#ffffff" />
                              <Text style={styles.useClientButtonText}>Use for Invoice</Text>
                            </Pressable>
                            {user.role === 'admin' ? (
                              <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteClient(client)}>
                                <MaterialCommunityIcons name="trash-can-outline" size={17} color="#b42318" />
                                <Text style={styles.deleteInvoiceButtonText}>Delete</Text>
                              </Pressable>
                            ) : null}
                          </View>
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

const emptyClientStats = {
  invoiceCount: 0,
  totalAmount: 0,
  qty: 0,
  invoices: [] as SavedInvoiceDocument[],
  latestInvoice: undefined as SavedInvoiceDocument | undefined,
};

function buildClientStats(clients: ClientDocument[], savedInvoices: SavedInvoiceDocument[]) {
  const stats = new Map<string, typeof emptyClientStats>();

  clients.forEach((client) => {
    const invoices = sortSavedInvoicesByInvoiceDate(savedInvoices.filter((savedInvoice) => matchesClientInvoice(client, savedInvoice)));
    stats.set(client.id, {
      invoiceCount: invoices.length,
      totalAmount: invoices.reduce((sum, savedInvoice) => sum + savedInvoice.totals.total, 0),
      qty: invoices.reduce(
        (sum, savedInvoice) =>
          sum + savedInvoice.totals.rows.reduce((rowSum, row) => rowSum + (row.kind === 'product' ? row.qty || 0 : 0), 0),
        0,
      ),
      invoices,
      latestInvoice: invoices[0],
    });
  });

  return stats;
}

function matchesClientInvoice(client: ClientDocument, savedInvoice: SavedInvoiceDocument) {
  const clientGstin = client.gstin.trim().toLowerCase();
  const invoiceGstin = savedInvoice.invoice.toGstin.trim().toLowerCase();
  const sameGstin = Boolean(clientGstin && clientGstin !== 'urp' && invoiceGstin === clientGstin);
  const sameName = client.name.trim().toLowerCase() === savedInvoice.invoice.toName.trim().toLowerCase();
  return sameGstin || sameName;
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `91${digits}` : digits;
}
