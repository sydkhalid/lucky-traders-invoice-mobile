import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { ClientDocument } from '../nosqlClientTable';
import { formatDate, money, parseDisplayDate } from '../invoiceCore';
import { styles } from '../styles';
import type { IconName } from '../types';

export function Card({ title, icon, action, children }: { title: string; icon: IconName; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <View style={styles.cardIconBadge}>
            <MaterialCommunityIcons name={icon} size={18} color="#ffffff" />
          </View>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {action}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const selectedDate = parseDisplayDate(value);

  function handleDateChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS !== 'ios') {
      setShowPicker(false);
    }

    if (event.type === 'dismissed' || !date) return;
    onChange(formatDate(date));
  }

  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Pressable style={styles.datePickerButton} onPress={() => setShowPicker(true)}>
        <MaterialCommunityIcons name="calendar-month-outline" size={19} color="#163a5f" />
        <Text style={styles.datePickerText}>{value}</Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color="#687386" />
      </Pressable>
      {showPicker ? (
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
          />
          {Platform.OS === 'ios' ? (
            <Pressable style={styles.datePickerDoneButton} onPress={() => setShowPicker(false)}>
              <Text style={styles.datePickerDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
  autoCapitalize,
  secureTextEntry,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  editable?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        editable={editable}
      />
    </View>
  );
}

export function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.segmented}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable key={option.value} style={[styles.segment, selected && styles.segmentActive]} onPress={() => onChange(option.value)}>
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function FinalBillSummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.finalBillSummaryLine}>
      <Text style={styles.finalBillSummaryLabel}>{label}</Text>
      <Text style={styles.finalBillSummaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
    </View>
  );
}

export function ClientSummary({ client }: { client: ClientDocument }) {
  return (
    <View style={styles.clientSummary}>
      <Text style={styles.clientName}>{client.name}</Text>
      <Text style={styles.clientMeta}>GSTIN: {client.gstin || '-'}</Text>
      <Text style={styles.clientMeta}>Phone: {client.phone || '-'}</Text>
      <Text style={styles.clientMeta}>{client.address || '-'}</Text>
      <Text style={styles.clientAudit}>Added by {client.createdBy} ({client.createdByRole}) on {client.createdAt}</Text>
      {client.updatedAt ? (
        <Text style={styles.clientAudit}>Updated by {client.updatedBy} ({client.updatedByRole}) on {client.updatedAt}</Text>
      ) : null}
    </View>
  );
}

export function AmountText({ value }: { value: number }) {
  return (
    <Text style={styles.reportRowAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
      {money(value)}
    </Text>
  );
}

export function HorizontalChips({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {children}
    </ScrollView>
  );
}
