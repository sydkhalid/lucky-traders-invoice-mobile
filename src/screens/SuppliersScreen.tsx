import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { Card, Field } from '../components/common';
import type { SupplierDocument, SupplierForm } from '../nosqlSupplierTable';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { extractSupplierFromPdfBase64 } from '../supplierPdf';
import { styles } from '../styles';

const SUPPLIERS_PER_PAGE = 10;

type SupplierFilter = 'all' | 'gst' | 'urp' | 'recent';

const supplierFilters: { key: SupplierFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gst', label: 'GST' },
  { key: 'urp', label: 'URP' },
  { key: 'recent', label: 'Recent' },
];

export function SuppliersScreen({
  user,
  suppliers,
  supplierForm,
  editingSupplierId,
  supplierSourceFileName,
  startAddSupplier,
  updateSupplierForm,
  saveSupplier,
  startEditSupplier,
  cancelEditSupplier,
  deleteSupplier,
  importSupplierFromPdf,
}: {
  user: AuthenticatedUser;
  suppliers: SupplierDocument[];
  supplierForm: SupplierForm;
  editingSupplierId: string | null;
  supplierSourceFileName: string;
  startAddSupplier: () => void;
  updateSupplierForm: (field: keyof SupplierForm, value: string) => void;
  saveSupplier: () => void;
  startEditSupplier: (supplier: SupplierDocument) => void;
  cancelEditSupplier: () => void;
  deleteSupplier: (supplier: SupplierDocument) => void;
  importSupplierFromPdf: (form: SupplierForm, sourceFileName: string) => void;
}) {
  const [formVisible, setFormVisible] = useState(Boolean(editingSupplierId));
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SupplierFilter>('all');
  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = suppliers.filter((supplier) => {
      const matchesSearch = !query || [supplier.name, supplier.gstin, supplier.phone, supplier.email, supplier.address]
        .some((value) => value.toLowerCase().includes(query));
      const gstin = supplier.gstin.trim().toLowerCase();
      const matchesFilter =
        filter === 'all' ||
        (filter === 'gst' && Boolean(gstin && gstin !== 'urp')) ||
        (filter === 'urp' && (!gstin || gstin === 'urp')) ||
        filter === 'recent';

      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, SUPPLIERS_PER_PAGE);
    }

    return result;
  }, [filter, search, suppliers]);
  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / SUPPLIERS_PER_PAGE));
  const visibleSuppliers = useMemo(() => {
    const start = (currentPage - 1) * SUPPLIERS_PER_PAGE;
    return filteredSuppliers.slice(start, start + SUPPLIERS_PER_PAGE);
  }, [currentPage, filteredSuppliers]);

  useEffect(() => {
    if (editingSupplierId) {
      setFormVisible(true);
      setExpandedSupplierId(editingSupplierId);
    }
  }, [editingSupplierId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  function openAddForm() {
    startAddSupplier();
    setFormVisible(true);
  }

  function closeForm() {
    cancelEditSupplier();
    setFormVisible(false);
  }

  function callSupplier(supplier: SupplierDocument) {
    const phone = normalizePhone(supplier.phone);
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch((error) => console.warn('Unable to open phone dialer', error));
  }

  function emailSupplier(supplier: SupplierDocument) {
    if (!supplier.email.trim()) return;
    Linking.openURL(`mailto:${supplier.email.trim()}`).catch((error) => console.warn('Unable to open email app', error));
  }

  async function importPdf() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const parsed = extractSupplierFromPdfBase64(base64, asset.name);
      importSupplierFromPdf(parsed.form, asset.name);
      setFormVisible(true);

      Alert.alert(
        parsed.warning ? 'PDF imported manually' : 'PDF imported',
        parsed.warning || 'Supplier details were read from the PDF. Check the fields and press Save.',
      );
    } catch (error) {
      Alert.alert('PDF import failed', error instanceof Error ? error.message : 'Unable to read this PDF.');
    }
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>SUPPLIER DATABASE</Text>
          <Text style={styles.pageTitle}>Suppliers</Text>
          <Text style={styles.pageSubtitle}>
            {suppliers.length} saved | {filteredSuppliers.length} showing | PDF import supported
          </Text>
        </View>
        <View style={styles.clientFormActions}>
          <Pressable style={styles.pagePrimaryButton} onPress={importPdf}>
            <MaterialCommunityIcons name="file-pdf-box" size={18} color="#ffffff" />
            <Text style={styles.pagePrimaryButtonText}>Import PDF</Text>
          </Pressable>
          <Pressable style={styles.pagePrimaryButton} onPress={openAddForm}>
            <MaterialCommunityIcons name="store-plus-outline" size={18} color="#ffffff" />
            <Text style={styles.pagePrimaryButtonText}>Add</Text>
          </Pressable>
        </View>
      </View>

      {formVisible ? (
        <Card
          title={editingSupplierId ? 'Edit supplier' : 'Add supplier'}
          icon={editingSupplierId ? 'store-edit-outline' : 'store-plus-outline'}
          action={
            <View style={styles.clientFormActions}>
              <Pressable style={styles.cancelEditButton} onPress={closeForm}>
                <MaterialCommunityIcons name="close" size={16} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={saveSupplier}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
                <Text style={styles.smallButtonText}>{editingSupplierId ? 'Update' : 'Save'}</Text>
              </Pressable>
            </View>
          }
        >
          {supplierSourceFileName ? (
            <View style={styles.editingNotice}>
              <MaterialCommunityIcons name="file-pdf-box" size={18} color="#163a5f" />
              <Text style={styles.editingNoticeText}>Source PDF: {supplierSourceFileName}</Text>
            </View>
          ) : null}
          <Field label="Supplier Name" value={supplierForm.name} onChangeText={(value) => updateSupplierForm('name', value)} />
          <Field label="Address" value={supplierForm.address} onChangeText={(value) => updateSupplierForm('address', value)} multiline />
          <Field label="GSTIN" value={supplierForm.gstin} onChangeText={(value) => updateSupplierForm('gstin', value)} autoCapitalize="characters" />
          <Field label="Phone" value={supplierForm.phone} onChangeText={(value) => updateSupplierForm('phone', value)} keyboardType="phone-pad" />
          <Field label="Email" value={supplierForm.email} onChangeText={(value) => updateSupplierForm('email', value)} autoCapitalize="none" keyboardType="email-address" />
        </Card>
      ) : null}

      <Card title="Saved suppliers" icon="storefront-outline">
        {suppliers.length === 0 ? (
          <Text style={styles.mutedText}>No suppliers saved yet. Use Import PDF or Add to create the first supplier.</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search supplier, GSTIN, phone, email, or place"
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
              {supplierFilters.map((item) => {
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
                <Text style={styles.listToolbarTitle}>Latest suppliers</Text>
                <Text style={styles.listToolbarMeta}>Page {currentPage} of {totalPages}</Text>
              </View>
              <Text style={styles.listCountBadge}>{visibleSuppliers.length} showing</Text>
            </View>

            {filteredSuppliers.length === 0 ? (
              <Text style={styles.mutedText}>No suppliers match this search or filter.</Text>
            ) : (
              <View style={styles.clientList}>
                {visibleSuppliers.map((supplier) => {
                  const phoneAvailable = Boolean(normalizePhone(supplier.phone));
                  const emailAvailable = Boolean(supplier.email.trim());
                  return (
                    <View style={[styles.clientCard, editingSupplierId === supplier.id && styles.clientCardEditing]} key={supplier.id}>
                      <Pressable
                        style={styles.clientCollapsedRow}
                        onPress={() => setExpandedSupplierId((current) => (current === supplier.id ? null : supplier.id))}
                      >
                        <Text style={styles.clientCollapsedName} numberOfLines={1}>
                          {supplier.name}
                        </Text>
                        <MaterialCommunityIcons
                          name={expandedSupplierId === supplier.id ? 'chevron-up' : 'chevron-down'}
                          size={22}
                          color="#667085"
                        />
                      </Pressable>

                      {expandedSupplierId === supplier.id ? (
                        <View style={styles.clientExpandedDetails}>
                          <View style={styles.clientSummary}>
                            <Text style={styles.clientName}>{supplier.name}</Text>
                            <Text style={styles.clientMeta}>GSTIN: {supplier.gstin || '-'}</Text>
                            <Text style={styles.clientMeta}>Phone: {supplier.phone || '-'}</Text>
                            <Text style={styles.clientMeta}>Email: {supplier.email || '-'}</Text>
                            <Text style={styles.clientMeta}>{supplier.address || '-'}</Text>
                            {supplier.sourceFileName ? <Text style={styles.clientAudit}>Source PDF: {supplier.sourceFileName}</Text> : null}
                            <Text style={styles.clientAudit}>Added by {supplier.createdBy} ({supplier.createdByRole}) on {supplier.createdAt}</Text>
                            {supplier.updatedAt ? (
                              <Text style={styles.clientAudit}>Updated by {supplier.updatedBy} ({supplier.updatedByRole}) on {supplier.updatedAt}</Text>
                            ) : null}
                          </View>

                          <View style={styles.clientUtilityRow}>
                            <Pressable
                              style={[styles.clientUtilityButton, !phoneAvailable && styles.navButtonDisabled]}
                              onPress={() => callSupplier(supplier)}
                              disabled={!phoneAvailable}
                            >
                              <MaterialCommunityIcons name="phone-outline" size={17} color="#163a5f" />
                              <Text style={styles.clientUtilityButtonText}>Call</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.clientUtilityButton, !emailAvailable && styles.navButtonDisabled]}
                              onPress={() => emailSupplier(supplier)}
                              disabled={!emailAvailable}
                            >
                              <MaterialCommunityIcons name="email-outline" size={17} color="#163a5f" />
                              <Text style={styles.clientUtilityButtonText}>Email</Text>
                            </Pressable>
                          </View>

                          <View style={styles.clientActionRow}>
                            <Pressable style={styles.editClientButton} onPress={() => startEditSupplier(supplier)}>
                              <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                              <Text style={styles.editClientButtonText}>Edit</Text>
                            </Pressable>
                            {user.role === 'admin' ? (
                              <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteSupplier(supplier)}>
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

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `91${digits}` : digits;
}
