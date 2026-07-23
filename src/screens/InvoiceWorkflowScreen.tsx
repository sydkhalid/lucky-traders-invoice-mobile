import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Switch, Text, View } from 'react-native';
import type { ClientDocument } from '../nosqlClientTable';
import type { GstMode, GstType, InvoiceState, InvoiceTotals, Product, ProductRow } from '../types';
import { Card, ClientSummary, DatePickerField, Field, HorizontalChips, SegmentedControl } from '../components/common';
import { InvoiceBillPreview } from '../components/InvoiceBillPreview';
import { styles } from '../styles';

type SectionProps = {
  invoice: InvoiceState;
  update: <K extends keyof InvoiceState>(field: K, value: InvoiceState[K]) => void;
};

export function InvoiceSection({ invoice, update }: SectionProps) {
  return (
    <Card title="Invoice details" icon="receipt-outline">
      <Field label="Invoice No" value={invoice.invoiceNo} onChangeText={(value) => update('invoiceNo', value)} editable={false} />
      <DatePickerField label="Invoice Date" value={invoice.invoiceDate} onChange={(value) => update('invoiceDate', value)} />
    </Card>
  );
}

export function CustomerSection({
  invoice,
  update,
  clients,
  useClientForInvoice,
}: SectionProps & { clients: ClientDocument[]; useClientForInvoice: (client: ClientDocument) => void }) {
  return (
    <View style={styles.stack}>
      <Card title="Customer details" icon="account-outline">
        <Field label="Customer Name" value={invoice.toName} onChangeText={(value) => update('toName', value)} />
        <Field label="Customer Address" value={invoice.toAddress} onChangeText={(value) => update('toAddress', value)} multiline />
        <Field label="Customer GSTIN" value={invoice.toGstin} onChangeText={(value) => update('toGstin', value)} />
        <Field label="Customer Phone" value={invoice.toPhone} onChangeText={(value) => update('toPhone', value)} keyboardType="phone-pad" />
      </Card>

      <Card title="Saved clients" icon="account-group-outline">
        <View style={styles.clientList}>
          {clients.map((client) => (
            <Pressable style={styles.savedClientRow} key={client.id} onPress={() => useClientForInvoice(client)}>
              <ClientSummary client={client} />
              <MaterialCommunityIcons name="chevron-right" size={22} color="#687386" />
            </Pressable>
          ))}
        </View>
      </Card>
    </View>
  );
}

export function ItemsSection({
  invoice,
  update,
  updateProduct,
  addProduct,
  removeProduct,
  products,
}: SectionProps & {
  updateProduct: (id: string, field: keyof ProductRow, value: string) => void;
  addProduct: () => void;
  removeProduct: (id: string) => void;
  products: Product[];
}) {
  const selectedKeys = new Set(invoice.products.map((row) => row.productKey).filter(Boolean));

  return (
    <View style={styles.stack}>
      <Card title="GST settings" icon="percent-outline">
        <SegmentedControl
          label="GST Calculation"
          value={invoice.gstMode}
          options={[
            { label: 'Excluded', value: 'excluded' },
            { label: 'Included', value: 'included' },
          ]}
          onChange={(value) => update('gstMode', value as GstMode)}
        />
        <SegmentedControl
          label="GST Type"
          value={invoice.gstType}
          options={[
            { label: 'CGST + SGST', value: 'split' },
            { label: 'IGST', value: 'igst' },
          ]}
          onChange={(value) => update('gstType', value as GstType)}
        />
      </Card>

      <Card
        title="Products"
        icon="package-variant-closed"
        action={
          <Pressable style={styles.smallButton} onPress={addProduct} disabled={products.length === 0 || invoice.products.length >= products.length}>
            <MaterialCommunityIcons name="plus" size={16} color="#163a5f" />
            <Text style={styles.smallButtonText}>Add</Text>
          </Pressable>
        }
      >
        {products.length === 0 ? (
          <Text style={styles.mutedText}>No products in product master. Add products from Inventory before billing.</Text>
        ) : null}
        {invoice.products.map((row, index) => (
          <View style={styles.productCard} key={row.id}>
            <View style={styles.productHeader}>
              <Text style={styles.productTitle}>Product {index + 1}</Text>
              <Pressable
                style={[styles.removeButton, invoice.products.length === 1 && styles.removeButtonDisabled]}
                onPress={() => removeProduct(row.id)}
                disabled={invoice.products.length === 1}
              >
                <MaterialCommunityIcons name="minus" size={16} color="#a62835" />
              </Pressable>
            </View>
            <Text style={styles.inputLabel}>Product</Text>
            <HorizontalChips>
              {products.map((product) => {
                const selected = row.productKey === product.key;
                const disabled = selectedKeys.has(product.key) && !selected;
                return (
                  <Pressable
                    key={product.key}
                    style={[styles.productChip, selected && styles.productChipActive, disabled && styles.productChipDisabled]}
                    disabled={disabled}
                    onPress={() => updateProduct(row.id, 'productKey', product.key)}
                  >
                    <Text style={[styles.productChipText, selected && styles.productChipTextActive]} numberOfLines={1}>
                      {product.label}
                    </Text>
                  </Pressable>
                );
              })}
            </HorizontalChips>
            <View style={styles.rowFields}>
              <Field label="HSN / Code" value={row.hsn} onChangeText={(value) => updateProduct(row.id, 'hsn', value)} editable={false} />
              <Field label="Qty (Kg)" value={row.qty} onChangeText={(value) => updateProduct(row.id, 'qty', value)} keyboardType="decimal-pad" />
              <Field label="Rate" value={row.price} onChangeText={(value) => updateProduct(row.id, 'price', value)} keyboardType="decimal-pad" />
            </View>
          </View>
        ))}
      </Card>

      <Card title="Additional charges" icon="truck-fast-outline">
        <Field label="Transport Charges" value={invoice.transportCharge} onChangeText={(value) => update('transportCharge', value)} keyboardType="decimal-pad" />
        <SegmentedControl
          label="Transport GST"
          value={invoice.transportChargeMode}
          options={[
            { label: 'Excluded', value: 'excluded' },
            { label: 'Included', value: 'included' },
          ]}
          onChange={(value) => update('transportChargeMode', value as GstMode)}
        />
        <Field label="Loading Charges" value={invoice.loadingCharge} onChangeText={(value) => update('loadingCharge', value)} keyboardType="decimal-pad" />
        <SegmentedControl
          label="Loading GST"
          value={invoice.loadingChargeMode}
          options={[
            { label: 'Excluded', value: 'excluded' },
            { label: 'Included', value: 'included' },
          ]}
          onChange={(value) => update('loadingChargeMode', value as GstMode)}
        />
      </Card>
    </View>
  );
}

export function EwaySection({ invoice, update }: SectionProps) {
  return (
    <Card title="E-Way bill" icon="truck-outline">
      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Has E-Way Bill</Text>
        <Switch
          value={invoice.hasEway}
          onValueChange={(value) => {
            update('hasEway', value);
            if (!value) {
              update('eway', '');
              update('driver', '');
              update('vehicle', '');
              update('mobile', '');
            }
          }}
          trackColor={{ true: '#8fc7a7', false: '#d3d9e1' }}
          thumbColor={invoice.hasEway ? '#0f6d45' : '#ffffff'}
        />
      </View>

      {invoice.hasEway ? (
        <>
          <Field label="E-Way Bill No" value={invoice.eway} onChangeText={(value) => update('eway', value)} />
          <DatePickerField label="Date" value={invoice.ewayDate} onChange={(value) => update('ewayDate', value)} />
          <DatePickerField label="Valid Upto" value={invoice.validDate} onChange={(value) => update('validDate', value)} />
          <Field label="Driver Name" value={invoice.driver} onChangeText={(value) => update('driver', value)} />
          <Field label="Vehicle No" value={invoice.vehicle} onChangeText={(value) => update('vehicle', value)} />
          <Field label="Driver Mobile" value={invoice.mobile} onChangeText={(value) => update('mobile', value)} keyboardType="phone-pad" />
        </>
      ) : (
        <Text style={styles.mutedText}>E-Way section will be skipped in the invoice preview.</Text>
      )}
    </Card>
  );
}

export function PreviewSection({
  invoice,
  totals,
  isEditing,
  onSave,
  onPrint,
  onShare,
}: {
  invoice: InvoiceState;
  totals: InvoiceTotals;
  isEditing: boolean;
  onSave: () => void;
  onPrint: () => void;
  onShare: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Card title="Invoice preview" icon="file-document-outline">
        <InvoiceBillPreview invoice={invoice} totals={totals} />
      </Card>

      <View style={styles.actionGrid}>
        <Pressable style={styles.saveInvoiceButton} onPress={onSave}>
          <MaterialCommunityIcons name="content-save-move-outline" size={20} color="#ffffff" />
          <Text style={styles.printButtonText}>{isEditing ? 'Save Changes' : 'Save Next'}</Text>
        </Pressable>
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
