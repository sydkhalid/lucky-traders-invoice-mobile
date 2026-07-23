import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Card, DatePickerField, Field, SegmentedControl } from '../components/common';
import { formatDate, getDisplayDateTime, getPrintableAssets, money } from '../invoiceCore';
import type { EmployeeDocument, EmployeeForm, SalaryDocument, SalaryForm } from '../nosqlEmployeeTable';
import type { AuthenticatedUser } from '../nosqlUserTable';
import { styles } from '../styles';

const EMPLOYEES_PER_PAGE = 10;
const SALARIES_PER_PAGE = 10;

type EmployeeFilter = 'all' | 'active' | 'inactive' | 'recent';

const employeeFilters: { key: EmployeeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'recent', label: 'Recent' },
];

export function EmployeesScreen({
  user,
  employees,
  salaries,
  saveEmployee,
  deleteEmployee,
  saveSalary,
  deleteSalary,
}: {
  user: AuthenticatedUser;
  employees: EmployeeDocument[];
  salaries: SalaryDocument[];
  saveEmployee: (employee: EmployeeDocument) => boolean;
  deleteEmployee: (employee: EmployeeDocument) => void;
  saveSalary: (salary: SalaryDocument) => boolean;
  deleteSalary: (salary: SalaryDocument) => void;
}) {
  const [employeeFormVisible, setEmployeeFormVisible] = useState(false);
  const [salaryFormVisible, setSalaryFormVisible] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeForm>(() => makeEmployeeDraft());
  const [salaryDraft, setSalaryDraft] = useState<SalaryForm>(() => makeSalaryDraft(employees[0]));
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [expandedSalaryId, setExpandedSalaryId] = useState<string | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [salarySearch, setSalarySearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState<EmployeeFilter>('all');
  const [employeePage, setEmployeePage] = useState(1);
  const [salaryPage, setSalaryPage] = useState(1);

  const orderedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.name.localeCompare(b.name)),
    [employees],
  );
  const orderedSalaries = useMemo(
    () => [...salaries].sort((a, b) => getDisplayDateTime(b.paymentDate) - getDisplayDateTime(a.paymentDate) || b.createdAt.localeCompare(a.createdAt)),
    [salaries],
  );
  const salaryStats = useMemo(() => buildSalaryStats(salaries), [salaries]);
  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    let result = orderedEmployees.filter((employee) => {
      const matchesSearch = !query || [
        employee.name,
        getEmployeeNumber(employee, employees),
        employee.role,
        employee.phone,
        employee.salaryMode,
        employee.status,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesFilter =
        employeeFilter === 'all' ||
        employeeFilter === 'recent' ||
        employee.status === employeeFilter;

      return matchesSearch && matchesFilter;
    });

    if (employeeFilter === 'recent') {
      result = [...employees].slice(0, EMPLOYEES_PER_PAGE);
    }

    return result;
  }, [employeeFilter, employeeSearch, employees, orderedEmployees]);
  const filteredSalaries = useMemo(() => {
    const query = salarySearch.trim().toLowerCase();
    return orderedSalaries.filter((salary) => {
      const salaryEmployee = employees.find((employee) => employee.id === salary.employeeId);
      const salaryEmployeeNo = salaryEmployee
        ? getEmployeeNumber(salaryEmployee, employees)
        : salary.employeeNo || formatEmployeeNumber(salary.employeeId);

      return !query || [
        salaryEmployeeNo,
        salary.employeeName,
        salary.employeeRole,
        salary.period,
        salary.paymentDate,
        salary.note,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [employees, orderedSalaries, salarySearch]);
  const employeePages = Math.max(1, Math.ceil(filteredEmployees.length / EMPLOYEES_PER_PAGE));
  const salaryPages = Math.max(1, Math.ceil(filteredSalaries.length / SALARIES_PER_PAGE));
  const visibleEmployees = useMemo(() => {
    const start = (employeePage - 1) * EMPLOYEES_PER_PAGE;
    return filteredEmployees.slice(start, start + EMPLOYEES_PER_PAGE);
  }, [employeePage, filteredEmployees]);
  const visibleSalaries = useMemo(() => {
    const start = (salaryPage - 1) * SALARIES_PER_PAGE;
    return filteredSalaries.slice(start, start + SALARIES_PER_PAGE);
  }, [salaryPage, filteredSalaries]);
  const activeEmployees = employees.filter((employee) => employee.status === 'active');
  const payrollBase = activeEmployees.reduce((sum, employee) => sum + employee.baseSalary, 0);
  const totalSalaryPaid = salaries.reduce((sum, salary) => sum + salary.paidAmount, 0);
  const thisMonthLabel = getCurrentPeriod();
  const thisMonthPaid = salaries
    .filter((salary) => salary.period.trim().toLowerCase() === thisMonthLabel.toLowerCase())
    .reduce((sum, salary) => sum + salary.paidAmount, 0);

  useEffect(() => {
    setEmployeePage(1);
  }, [employeeFilter, employeeSearch]);

  useEffect(() => {
    setSalaryPage(1);
  }, [salarySearch]);

  useEffect(() => {
    setEmployeePage((page) => Math.min(page, employeePages));
  }, [employeePages]);

  useEffect(() => {
    setSalaryPage((page) => Math.min(page, salaryPages));
  }, [salaryPages]);

  function openAddEmployee() {
    setEditingEmployeeId(null);
    setEmployeeDraft(makeEmployeeDraft());
    setEmployeeFormVisible(true);
  }

  function startEditEmployee(employee: EmployeeDocument) {
    setEditingEmployeeId(employee.id);
    setExpandedEmployeeId(employee.id);
    setEmployeeDraft({
      name: employee.name,
      role: employee.role,
      phone: employee.phone,
      salaryMode: employee.salaryMode,
      baseSalary: numberToField(employee.baseSalary),
      joinDate: employee.joinDate,
      status: employee.status,
      bankName: employee.bankName || '',
      accountHolderName: employee.accountHolderName || employee.name,
      accountNumber: employee.accountNumber || '',
      ifscCode: employee.ifscCode || '',
      bankBranch: employee.bankBranch || '',
      upiId: employee.upiId || '',
    });
    setEmployeeFormVisible(true);
  }

  function closeEmployeeForm() {
    setEditingEmployeeId(null);
    setEmployeeDraft(makeEmployeeDraft());
    setEmployeeFormVisible(false);
  }

  function openAddSalary(employee?: EmployeeDocument) {
    const selectedEmployee = employee || employees.find((record) => record.status === 'active') || employees[0];
    if (!selectedEmployee) {
      Alert.alert('Employee required', 'Add an employee before adding salary.');
      return;
    }
    setEditingSalaryId(null);
    setSalaryDraft(makeSalaryDraft(selectedEmployee));
    setSalaryFormVisible(true);
  }

  function startEditSalary(salary: SalaryDocument) {
    setEditingSalaryId(salary.id);
    setExpandedSalaryId(salary.id);
    setSalaryDraft({
      employeeId: salary.employeeId,
      period: salary.period,
      paymentDate: salary.paymentDate,
      baseAmount: numberToField(salary.baseAmount),
      advance: numberToField(salary.advance),
      deduction: numberToField(salary.deduction),
      paidAmount: numberToField(salary.paidAmount),
      note: salary.note,
    });
    setSalaryFormVisible(true);
  }

  function closeSalaryForm() {
    setEditingSalaryId(null);
    setSalaryDraft(makeSalaryDraft(employees.find((record) => record.status === 'active') || employees[0]));
    setSalaryFormVisible(false);
  }

  function updateEmployeeDraft(field: keyof EmployeeForm, value: string) {
    setEmployeeDraft((current) => ({ ...current, [field]: value }));
  }

  function updateSalaryDraft(field: keyof SalaryForm, value: string) {
    setSalaryDraft((current) => ({ ...current, [field]: value }));
  }

  function selectSalaryEmployee(employee: EmployeeDocument) {
    setSalaryDraft((current) => ({
      ...current,
      employeeId: employee.id,
      baseAmount: numberToField(employee.baseSalary),
      paidAmount: '',
    }));
  }

  function submitEmployee() {
    const name = employeeDraft.name.trim();
    const role = employeeDraft.role.trim();
    const phone = employeeDraft.phone.trim();
    const baseSalary = parseAmount(employeeDraft.baseSalary);

    if (!name) {
      Alert.alert('Employee required', 'Enter employee name before saving.');
      return;
    }
    if (!role) {
      Alert.alert('Role required', 'Enter employee role or work type.');
      return;
    }
    if (baseSalary <= 0) {
      Alert.alert('Salary required', 'Enter a valid salary amount.');
      return;
    }

    const existing = employees.find((employee) => employee.id === editingEmployeeId);
    const employeeNo = existing ? getEmployeeNumber(existing, employees) : makeNextEmployeeNumber(employees);
    const record: EmployeeDocument = existing
      ? {
          ...existing,
          employeeNo,
          name,
          role,
          phone,
          salaryMode: employeeDraft.salaryMode,
          baseSalary,
          joinDate: employeeDraft.joinDate,
          status: employeeDraft.status,
          bankName: employeeDraft.bankName.trim(),
          accountHolderName: employeeDraft.accountHolderName.trim(),
          accountNumber: employeeDraft.accountNumber.trim(),
          ifscCode: employeeDraft.ifscCode.trim().toUpperCase(),
          bankBranch: employeeDraft.bankBranch.trim(),
          upiId: employeeDraft.upiId.trim(),
          updatedAt: formatDate(new Date()),
          updatedBy: user.name,
          updatedByRole: user.role,
        }
      : {
          id: `employee-${employeeNo}-${Date.now()}`,
          employeeNo,
          name,
          role,
          phone,
          salaryMode: employeeDraft.salaryMode,
          baseSalary,
          joinDate: employeeDraft.joinDate,
          status: employeeDraft.status,
          bankName: employeeDraft.bankName.trim(),
          accountHolderName: employeeDraft.accountHolderName.trim(),
          accountNumber: employeeDraft.accountNumber.trim(),
          ifscCode: employeeDraft.ifscCode.trim().toUpperCase(),
          bankBranch: employeeDraft.bankBranch.trim(),
          upiId: employeeDraft.upiId.trim(),
          createdAt: formatDate(new Date()),
          createdBy: user.name,
          createdByRole: user.role,
        };

    if (saveEmployee(record)) {
      closeEmployeeForm();
    }
  }

  function submitSalary() {
    const employee = employees.find((record) => record.id === salaryDraft.employeeId);
    const existing = salaries.find((salary) => salary.id === editingSalaryId);
    const employeeName = employee?.name || existing?.employeeName || '';
    const employeeRole = employee?.role || existing?.employeeRole || '';
    const employeeNo = employee ? getEmployeeNumber(employee, employees) : existing?.employeeNo || '';
    const period = salaryDraft.period.trim();
    const baseAmount = parseAmount(salaryDraft.baseAmount);
    const advance = parseAmount(salaryDraft.advance);
    const deduction = parseAmount(salaryDraft.deduction);
    const autoPaidAmount = Math.max(0, baseAmount - advance - deduction);
    const paidAmount = salaryDraft.paidAmount.trim() ? parseAmount(salaryDraft.paidAmount) : autoPaidAmount;

    if (!employeeName) {
      Alert.alert('Employee required', 'Select an employee before saving salary.');
      return;
    }
    if (!period) {
      Alert.alert('Period required', 'Enter the salary period, for example Jul 2026.');
      return;
    }
    if (baseAmount <= 0) {
      Alert.alert('Salary required', 'Enter a valid salary amount.');
      return;
    }

    const record: SalaryDocument = existing
      ? {
          ...existing,
          employeeId: salaryDraft.employeeId || existing.employeeId,
          employeeNo,
          employeeName,
          employeeRole,
          period,
          paymentDate: salaryDraft.paymentDate,
          baseAmount,
          advance,
          deduction,
          paidAmount,
          note: salaryDraft.note.trim(),
          updatedAt: formatDate(new Date()),
          updatedBy: user.name,
          updatedByRole: user.role,
        }
      : {
          id: `salary-${Date.now()}`,
          employeeId: salaryDraft.employeeId,
          employeeNo,
          employeeName,
          employeeRole,
          period,
          paymentDate: salaryDraft.paymentDate,
          baseAmount,
          advance,
          deduction,
          paidAmount,
          note: salaryDraft.note.trim(),
          createdAt: formatDate(new Date()),
          createdBy: user.name,
          createdByRole: user.role,
        };

    if (saveSalary(record)) {
      closeSalaryForm();
      Alert.alert('Salary saved', `${record.period} salary for ${record.employeeName} was saved.`, [
        { text: 'Close', style: 'cancel' },
        { text: 'Generate Slip', onPress: () => shareSalarySlip(record, employee || existingEmployeeFromSalary(record, employees), employees) },
      ]);
    }
  }

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>PAYROLL</Text>
          <Text style={styles.pageTitle}>Employees</Text>
          <Text style={styles.pageSubtitle}>
            {employees.length} employees | {activeEmployees.length} active | {salaries.length} salary entries
          </Text>
        </View>
        <View style={styles.clientUtilityRow}>
          <Pressable style={styles.pagePrimaryButton} onPress={openAddEmployee}>
            <MaterialCommunityIcons name="account-plus-outline" size={18} color="#ffffff" />
            <Text style={styles.pagePrimaryButtonText}>Add Employee</Text>
          </Pressable>
          <Pressable style={styles.pagePrimaryButton} onPress={() => openAddSalary()}>
            <MaterialCommunityIcons name="cash-plus" size={18} color="#ffffff" />
            <Text style={styles.pagePrimaryButtonText}>Add Salary</Text>
          </Pressable>
        </View>
      </View>

      <Card title="Payroll summary" icon="cash-multiple">
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Employees</Text>
            <Text style={styles.statValue}>{employees.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Active</Text>
            <Text style={styles.statValue}>{activeEmployees.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Payroll base</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(payrollBase)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Paid total</Text>
            <Text style={[styles.statValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(totalSalaryPaid)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{thisMonthLabel}</Text>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {money(thisMonthPaid)}
            </Text>
          </View>
        </View>
      </Card>

      {employeeFormVisible ? (
        <Card
          title={editingEmployeeId ? 'Edit employee' : 'Add employee'}
          icon={editingEmployeeId ? 'account-edit-outline' : 'account-plus-outline'}
          action={
            <View style={styles.clientFormActions}>
              <Pressable style={styles.cancelEditButton} onPress={closeEmployeeForm}>
                <MaterialCommunityIcons name="close" size={16} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={submitEmployee}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
                <Text style={styles.smallButtonText}>{editingEmployeeId ? 'Update' : 'Save'}</Text>
              </Pressable>
            </View>
          }
        >
          <Field label="Employee Name" value={employeeDraft.name} onChangeText={(value) => updateEmployeeDraft('name', value)} />
          <Field label="Role / Work Type" value={employeeDraft.role} onChangeText={(value) => updateEmployeeDraft('role', value)} />
          <Field label="Phone" value={employeeDraft.phone} onChangeText={(value) => updateEmployeeDraft('phone', value)} keyboardType="phone-pad" />
          <SegmentedControl
            label="Salary Mode"
            value={employeeDraft.salaryMode}
            options={[
              { label: 'Monthly', value: 'monthly' },
              { label: 'Daily', value: 'daily' },
            ]}
            onChange={(value) => updateEmployeeDraft('salaryMode', value)}
          />
          <Field label="Salary Amount" value={employeeDraft.baseSalary} onChangeText={(value) => updateEmployeeDraft('baseSalary', value)} keyboardType="decimal-pad" />
          <DatePickerField label="Join Date" value={employeeDraft.joinDate} onChange={(value) => updateEmployeeDraft('joinDate', value)} />
          <SegmentedControl
            label="Status"
            value={employeeDraft.status}
            options={[
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ]}
            onChange={(value) => updateEmployeeDraft('status', value)}
          />
          <View style={styles.clientInvoiceList}>
            <Text style={styles.reportSectionTitle}>Bank details</Text>
            <Field label="Bank Name" value={employeeDraft.bankName} onChangeText={(value) => updateEmployeeDraft('bankName', value)} />
            <Field label="Account Holder Name" value={employeeDraft.accountHolderName} onChangeText={(value) => updateEmployeeDraft('accountHolderName', value)} />
            <Field label="Account Number" value={employeeDraft.accountNumber} onChangeText={(value) => updateEmployeeDraft('accountNumber', value)} keyboardType="number-pad" />
            <Field label="IFSC Code" value={employeeDraft.ifscCode} onChangeText={(value) => updateEmployeeDraft('ifscCode', value)} autoCapitalize="characters" />
            <Field label="Branch" value={employeeDraft.bankBranch} onChangeText={(value) => updateEmployeeDraft('bankBranch', value)} />
            <Field label="UPI ID" value={employeeDraft.upiId} onChangeText={(value) => updateEmployeeDraft('upiId', value)} autoCapitalize="none" />
          </View>
        </Card>
      ) : null}

      {salaryFormVisible ? (
        <Card
          title={editingSalaryId ? 'Edit salary' : 'Add salary'}
          icon="account-cash-outline"
          action={
            <View style={styles.clientFormActions}>
              <Pressable style={styles.cancelEditButton} onPress={closeSalaryForm}>
                <MaterialCommunityIcons name="close" size={16} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={submitSalary}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
                <Text style={styles.smallButtonText}>{editingSalaryId ? 'Update' : 'Save'}</Text>
              </Pressable>
            </View>
          }
        >
          <Text style={styles.inputLabel}>Employee</Text>
          <View style={styles.filterChipRow}>
            {orderedEmployees.map((employee) => {
              const selected = salaryDraft.employeeId === employee.id;
              const employeeNo = getEmployeeNumber(employee, employees);
              return (
                <Pressable
                  key={employee.id}
                  style={[styles.filterChip, selected && styles.filterChipActive]}
                  onPress={() => selectSalaryEmployee(employee)}
                >
                  <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                    {employeeNo} | {employee.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Field label="Salary Period" value={salaryDraft.period} onChangeText={(value) => updateSalaryDraft('period', value)} />
          <DatePickerField label="Payment Date" value={salaryDraft.paymentDate} onChange={(value) => updateSalaryDraft('paymentDate', value)} />
          <Field label="Base Salary" value={salaryDraft.baseAmount} onChangeText={(value) => updateSalaryDraft('baseAmount', value)} keyboardType="decimal-pad" />
          <Field label="Advance" value={salaryDraft.advance} onChangeText={(value) => updateSalaryDraft('advance', value)} keyboardType="decimal-pad" />
          <Field label="Deduction" value={salaryDraft.deduction} onChangeText={(value) => updateSalaryDraft('deduction', value)} keyboardType="decimal-pad" />
          <Field label="Net Paid" value={salaryDraft.paidAmount} onChangeText={(value) => updateSalaryDraft('paidAmount', value)} keyboardType="decimal-pad" />
          <Text style={styles.clientAudit}>If Net Paid is empty, app saves Base Salary - Advance - Deduction.</Text>
          <Field label="Note" value={salaryDraft.note} onChangeText={(value) => updateSalaryDraft('note', value)} multiline />
        </Card>
      ) : null}

      <Card title="Employee list" icon="account-tie-outline">
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
          <TextInput
            style={styles.searchInput}
            value={employeeSearch}
            onChangeText={setEmployeeSearch}
            placeholder="Search employee, role, phone, or status"
            placeholderTextColor="#98a2b3"
            autoCapitalize="none"
          />
          {employeeSearch ? (
            <Pressable onPress={() => setEmployeeSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#98a2b3" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterChipRow}>
          {employeeFilters.map((item) => {
            const selected = employeeFilter === item.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => setEmployeeFilter(item.key)}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.listToolbar}>
          <View>
            <Text style={styles.listToolbarTitle}>Latest employees</Text>
            <Text style={styles.listToolbarMeta}>Page {employeePage} of {employeePages}</Text>
          </View>
          <Text style={styles.listCountBadge}>{visibleEmployees.length} showing</Text>
        </View>

        {filteredEmployees.length === 0 ? (
          <Text style={styles.mutedText}>No employees match this search or filter.</Text>
        ) : (
          <View style={styles.clientList}>
            {visibleEmployees.map((employee) => {
              const stats = salaryStats.get(employee.id) || { paid: 0, entries: 0, latest: '' };
              const employeeNo = getEmployeeNumber(employee, employees);
              return (
                <View style={[styles.clientCard, editingEmployeeId === employee.id && styles.clientCardEditing]} key={employee.id}>
                  <Pressable
                    style={styles.clientCollapsedRow}
                    onPress={() => setExpandedEmployeeId((current) => (current === employee.id ? null : employee.id))}
                  >
                    <View style={styles.quickActionText}>
                      <Text style={styles.clientCollapsedName} numberOfLines={1}>{employeeNo} | {employee.name}</Text>
                      <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                        ID: {employeeNo} | {employee.role} | {employee.salaryMode.toUpperCase()} | {money(employee.baseSalary)}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name={expandedEmployeeId === employee.id ? 'chevron-up' : 'chevron-down'}
                      size={22}
                      color="#667085"
                    />
                  </Pressable>

                  {expandedEmployeeId === employee.id ? (
                    <View style={styles.clientExpandedDetails}>
                      <View style={styles.accountUserHeader}>
                        <View style={styles.quickActionText}>
                          <Text style={styles.clientName}>{employee.name}</Text>
                          <Text style={styles.clientMeta}>Employee ID: {employeeNo} | {employee.role} | {employee.status.toUpperCase()}</Text>
                        </View>
                        <Text style={styles.currentUserBadge}>{employee.salaryMode.toUpperCase()}</Text>
                      </View>

                      <View style={styles.reportGrid}>
                        <View style={styles.reportTile}>
                          <Text style={styles.reportLabel}>Salary</Text>
                          <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                            {money(employee.baseSalary)}
                          </Text>
                        </View>
                        <View style={styles.reportTile}>
                          <Text style={styles.reportLabel}>Paid</Text>
                          <Text style={[styles.reportValue, styles.statValueGreen]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                            {money(stats.paid)}
                          </Text>
                        </View>
                        <View style={styles.reportTile}>
                          <Text style={styles.reportLabel}>Entries</Text>
                          <Text style={styles.reportValue}>{stats.entries}</Text>
                        </View>
                      </View>

                      <Text style={styles.clientMeta}>Phone: {employee.phone || '-'}</Text>
                      <Text style={styles.clientMeta}>Joined: {employee.joinDate || '-'}</Text>
                      <Text style={styles.clientMeta}>Bank: {employee.bankName || '-'}</Text>
                      <Text style={styles.clientMeta}>Account: {maskAccount(employee.accountNumber)}</Text>
                      <Text style={styles.clientMeta}>IFSC: {employee.ifscCode || '-'}</Text>
                      <Text style={styles.clientMeta}>Last salary: {stats.latest || '-'}</Text>
                      <Text style={styles.clientAudit}>Added by {employee.createdBy} on {employee.createdAt}</Text>

                      <View style={styles.invoiceActionRow}>
                        <Pressable style={styles.invoicePreviewButton} onPress={() => shareJoiningLetter(employee, employees)}>
                          <MaterialCommunityIcons name="file-account-outline" size={17} color="#163a5f" />
                          <Text style={styles.invoicePreviewButtonText}>Offer Letter</Text>
                        </Pressable>
                        <Pressable style={styles.invoicePreviewButton} onPress={() => openAddSalary(employee)}>
                          <MaterialCommunityIcons name="cash-plus" size={17} color="#163a5f" />
                          <Text style={styles.invoicePreviewButtonText}>Add Salary</Text>
                        </Pressable>
                        <Pressable style={styles.editClientButton} onPress={() => startEditEmployee(employee)}>
                          <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                          <Text style={styles.editClientButtonText}>Edit</Text>
                        </Pressable>
                        {user.role === 'admin' ? (
                          <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteEmployee(employee)}>
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
            style={[styles.paginationButton, employeePage === 1 && styles.navButtonDisabled]}
            onPress={() => setEmployeePage((page) => Math.max(1, page - 1))}
            disabled={employeePage === 1}
          >
            <MaterialCommunityIcons name="chevron-left" size={18} color="#163a5f" />
            <Text style={styles.paginationButtonText}>Previous</Text>
          </Pressable>
          <Text style={styles.paginationText}>{employeePage} / {employeePages}</Text>
          <Pressable
            style={[styles.paginationButton, employeePage === employeePages && styles.navButtonDisabled]}
            onPress={() => setEmployeePage((page) => Math.min(employeePages, page + 1))}
            disabled={employeePage === employeePages}
          >
            <Text style={styles.paginationButtonText}>Next</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#163a5f" />
          </Pressable>
        </View>
      </Card>

      <Card title="Salary ledger" icon="cash-register">
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
          <TextInput
            style={styles.searchInput}
            value={salarySearch}
            onChangeText={setSalarySearch}
            placeholder="Search employee, period, date, or note"
            placeholderTextColor="#98a2b3"
            autoCapitalize="none"
          />
          {salarySearch ? (
            <Pressable onPress={() => setSalarySearch('')}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#98a2b3" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.listToolbar}>
          <View>
            <Text style={styles.listToolbarTitle}>Latest salary entries</Text>
            <Text style={styles.listToolbarMeta}>Page {salaryPage} of {salaryPages}</Text>
          </View>
          <Text style={styles.listCountBadge}>{money(filteredSalaries.reduce((sum, salary) => sum + salary.paidAmount, 0))}</Text>
        </View>

        {filteredSalaries.length === 0 ? (
          <Text style={styles.mutedText}>No salary entries saved yet.</Text>
        ) : (
          <View style={styles.invoiceList}>
            {visibleSalaries.map((salary) => {
              const salaryEmployee = employees.find((employee) => employee.id === salary.employeeId);
              const salaryEmployeeNo = salaryEmployee
                ? getEmployeeNumber(salaryEmployee, employees)
                : salary.employeeNo || formatEmployeeNumber(salary.employeeId);

              return (
              <View style={styles.savedInvoiceCard} key={salary.id}>
                <Pressable
                  style={styles.invoiceCollapsedRow}
                  onPress={() => setExpandedSalaryId((current) => (current === salary.id ? null : salary.id))}
                >
                  <View style={styles.quickActionText}>
                    <Text style={styles.savedInvoiceNo} numberOfLines={1}>{salaryEmployeeNo} | {salary.employeeName}</Text>
                    <Text style={styles.savedInvoiceMeta} numberOfLines={1}>
                      ID: {salaryEmployeeNo} | {salary.period} | {salary.paymentDate}
                    </Text>
                  </View>
                  <View style={styles.savedInvoiceTotalBadge}>
                    <Text style={styles.savedInvoiceStatus}>{salary.employeeRole || 'SALARY'}</Text>
                    <Text style={styles.savedInvoiceTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {money(salary.paidAmount)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={expandedSalaryId === salary.id ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color="#667085"
                  />
                </Pressable>

                {expandedSalaryId === salary.id ? (
                  <View style={styles.invoiceExpandedDetails}>
                    <View style={styles.reportGrid}>
                      <View style={styles.reportTile}>
                        <Text style={styles.reportLabel}>Base</Text>
                        <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                          {money(salary.baseAmount)}
                        </Text>
                      </View>
                      <View style={styles.reportTile}>
                        <Text style={styles.reportLabel}>Advance</Text>
                        <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                          {money(salary.advance)}
                        </Text>
                      </View>
                      <View style={styles.reportTile}>
                        <Text style={styles.reportLabel}>Deduction</Text>
                        <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                          {money(salary.deduction)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.clientMeta}>Employee: {salary.employeeName}</Text>
                    <Text style={styles.clientMeta}>Employee ID: {salaryEmployeeNo}</Text>
                    <Text style={styles.clientMeta}>Role: {salary.employeeRole || '-'}</Text>
                    <Text style={styles.clientMeta}>Period: {salary.period}</Text>
                    <Text style={styles.clientMeta}>Payment Date: {salary.paymentDate}</Text>
                    <Text style={styles.clientMeta}>Note: {salary.note || '-'}</Text>
                    <Text style={styles.clientAudit}>Saved by {salary.createdBy} on {salary.createdAt}</Text>

                    <View style={styles.invoiceActionRow}>
                      <Pressable
                        style={styles.invoicePreviewButton}
                        onPress={() => shareSalarySlip(salary, salaryEmployee, employees)}
                      >
                        <MaterialCommunityIcons name="file-document-outline" size={17} color="#163a5f" />
                        <Text style={styles.invoicePreviewButtonText}>Salary Slip</Text>
                      </Pressable>
                      <Pressable style={styles.editClientButton} onPress={() => startEditSalary(salary)}>
                        <MaterialCommunityIcons name="pencil-outline" size={17} color="#163a5f" />
                        <Text style={styles.editClientButtonText}>Edit</Text>
                      </Pressable>
                      {user.role === 'admin' ? (
                        <Pressable style={styles.deleteInvoiceButton} onPress={() => deleteSalary(salary)}>
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
            style={[styles.paginationButton, salaryPage === 1 && styles.navButtonDisabled]}
            onPress={() => setSalaryPage((page) => Math.max(1, page - 1))}
            disabled={salaryPage === 1}
          >
            <MaterialCommunityIcons name="chevron-left" size={18} color="#163a5f" />
            <Text style={styles.paginationButtonText}>Previous</Text>
          </Pressable>
          <Text style={styles.paginationText}>{salaryPage} / {salaryPages}</Text>
          <Pressable
            style={[styles.paginationButton, salaryPage === salaryPages && styles.navButtonDisabled]}
            onPress={() => setSalaryPage((page) => Math.min(salaryPages, page + 1))}
            disabled={salaryPage === salaryPages}
          >
            <Text style={styles.paginationButtonText}>Next</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#163a5f" />
          </Pressable>
        </View>
      </Card>
    </View>
  );
}

function makeEmployeeDraft(): EmployeeForm {
  return {
    name: '',
    role: '',
    phone: '',
    salaryMode: 'monthly',
    baseSalary: '',
    joinDate: formatDate(new Date()),
    status: 'active',
    bankName: '',
    accountHolderName: '',
    accountNumber: '',
    ifscCode: '',
    bankBranch: '',
    upiId: '',
  };
}

function makeSalaryDraft(employee?: EmployeeDocument): SalaryForm {
  return {
    employeeId: employee?.id || '',
    period: getCurrentPeriod(),
    paymentDate: formatDate(new Date()),
    baseAmount: employee ? numberToField(employee.baseSalary) : '',
    advance: '0',
    deduction: '0',
    paidAmount: '',
    note: '',
  };
}

function buildSalaryStats(salaries: SalaryDocument[]) {
  const stats = new Map<string, { paid: number; entries: number; latest: string }>();

  salaries.forEach((salary) => {
    const current = stats.get(salary.employeeId) || { paid: 0, entries: 0, latest: '' };
    current.paid += salary.paidAmount;
    current.entries += 1;
    if (!current.latest || getDisplayDateTime(salary.paymentDate) > getDisplayDateTime(current.latest)) {
      current.latest = salary.paymentDate;
    }
    stats.set(salary.employeeId, current);
  });

  return stats;
}

function getCurrentPeriod(date = new Date()) {
  return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getFullYear()}`;
}

function parseAmount(value: string) {
  const amount = Number.parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(amount) ? amount : 0;
}

function numberToField(value?: number) {
  if (!Number.isFinite(value)) return '';
  return String(value);
}

function makeNextEmployeeNumber(employees: EmployeeDocument[]) {
  const usedNumbers = employees
    .map((employee, index) => {
      const explicitNumber = normalizeEmployeeNumber(employee.employeeNo) || parseEmployeeNumberFromId(employee.id);
      return explicitNumber ? Number(explicitNumber) : index + 1;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  return padEmployeeNumber(usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1);
}

function getEmployeeNumber(employee: EmployeeDocument, employees: EmployeeDocument[] = []) {
  const explicitNumber = normalizeEmployeeNumber(employee.employeeNo) || parseEmployeeNumberFromId(employee.id);
  if (explicitNumber) return explicitNumber;

  const legacyIndex = getLegacyEmployeeIndex(employee, employees);
  return padEmployeeNumber(legacyIndex + 1);
}

function formatEmployeeNumber(value: string) {
  return normalizeEmployeeNumber(value) || parseEmployeeNumberFromId(value) || value;
}

function normalizeEmployeeNumber(value?: string) {
  const match = value?.trim().match(/^#?(?:EMP[-\s]?)?0*(\d{1,3})$/i);
  if (!match) return '';
  return padEmployeeNumber(Number(match[1]));
}

function parseEmployeeNumberFromId(value?: string) {
  const match = value?.trim().match(/^employee-(\d{1,3})(?:-|$)/i);
  if (!match) return '';
  return padEmployeeNumber(Number(match[1]));
}

function getLegacyEmployeeIndex(employee: EmployeeDocument, employees: EmployeeDocument[]) {
  const list = employees.length ? employees : [employee];
  const sorted = list
    .map((record, index) => ({ record, index, sortValue: getLegacyEmployeeSortValue(record, index) }))
    .sort((a, b) => a.sortValue - b.sortValue || a.index - b.index);
  const index = sorted.findIndex((item) => item.record.id === employee.id);
  return Math.max(0, index);
}

function getLegacyEmployeeSortValue(employee: EmployeeDocument, index: number) {
  const timestampMatch = employee.id.match(/^employee-(\d{10,})(?:-|$)/);
  if (timestampMatch) return Number(timestampMatch[1]);

  const createdTime = getDisplayDateTime(employee.createdAt);
  return createdTime || index;
}

function padEmployeeNumber(value: number) {
  return String(Math.max(1, Math.trunc(value))).padStart(3, '0');
}

async function shareJoiningLetter(employee: EmployeeDocument, employees: EmployeeDocument[]) {
  try {
    const html = await buildJoiningLetterHtml(employee, employees);
    await sharePdf(html, `${employee.name} Offer Letter`);
  } catch (error) {
    Alert.alert('Offer letter failed', error instanceof Error ? error.message : 'Unable to generate offer letter.');
  }
}

async function shareSalarySlip(salary: SalaryDocument, employee?: EmployeeDocument, employees: EmployeeDocument[] = []) {
  try {
    const html = await buildSalarySlipHtml(salary, employee, employees);
    await sharePdf(html, `${salary.employeeName} Salary Slip ${salary.period}`);
  } catch (error) {
    Alert.alert('Salary slip failed', error instanceof Error ? error.message : 'Unable to generate salary slip.');
  }
}

async function sharePdf(html: string, title: string) {
  const result = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/pdf',
      dialogTitle: title,
    });
  } else {
    Alert.alert(title, result.uri);
  }
}

export async function buildJoiningLetterHtml(employee: EmployeeDocument, employees: EmployeeDocument[]) {
  const assets = await getPrintableAssets();
  const salaryMode = employee.salaryMode === 'daily' ? 'per day' : 'per month';
  const employeeNo = getEmployeeNumber(employee, employees);

  return buildPayrollHtmlShell(
    'Offer / Joining Letter',
    `
      <div class="meta-row">
        <div><b>Date:</b> ${escapeHtml(formatDate(new Date()))}</div>
        <div><b>Employee ID:</b> ${escapeHtml(employeeNo)}</div>
      </div>
      <p><b>To:</b> ${escapeHtml(employee.name)}${employee.phone ? ` | ${escapeHtml(employee.phone)}` : ''}</p>
      <p>Dear ${escapeHtml(employee.name)},</p>
      <p>
        We are pleased to confirm your joining with <b>LUCKY TRADERS</b> as
        <b>${escapeHtml(employee.role)}</b>, effective from <b>${escapeHtml(employee.joinDate)}</b>.
      </p>
      <p>
        Your salary will be <b>${money(employee.baseSalary)}</b> ${salaryMode}. Salary payments will be made as per company records and attendance/work confirmation.
      </p>
      <table>
        <tr><th colspan="2">Offer Details</th></tr>
        <tr><td>Company</td><td>LUCKY TRADERS</td></tr>
        <tr><td>Offered Position</td><td>${escapeHtml(employee.role)}</td></tr>
        <tr><td>Joining Date</td><td>${escapeHtml(employee.joinDate)}</td></tr>
        <tr><td>Employment Status</td><td>${escapeHtml(employee.status.toUpperCase())}</td></tr>
        <tr><td>Salary</td><td>${money(employee.baseSalary)} ${salaryMode}</td></tr>
      </table>
      <div class="two-table-row">
        <table class="half-table">
          <tr><th colspan="2">Employee Details</th></tr>
          <tr><td>Name</td><td>${escapeHtml(employee.name)}</td></tr>
          <tr><td>Role / Work Type</td><td>${escapeHtml(employee.role)}</td></tr>
          <tr><td>Salary Mode</td><td>${escapeHtml(employee.salaryMode.toUpperCase())}</td></tr>
          <tr><td>Phone</td><td>${escapeHtml(employee.phone || '-')}</td></tr>
        </table>
        <table class="half-table">
          <tr><th colspan="2">Bank Details</th></tr>
          <tr><td>Account Holder</td><td>${escapeHtml(employee.accountHolderName || employee.name || '-')}</td></tr>
          <tr><td>Bank Name</td><td>${escapeHtml(employee.bankName || '-')}</td></tr>
          <tr><td>Account No</td><td>${escapeHtml(employee.accountNumber || '-')}</td></tr>
          <tr><td>IFSC</td><td>${escapeHtml(employee.ifscCode || '-')}</td></tr>
          <tr><td>Branch</td><td>${escapeHtml(employee.bankBranch || '-')}</td></tr>
        </table>
      </div>
      <p class="note-line">Please keep this letter for your records.</p>
      ${signatureBlock(assets)}
    `,
    assets,
  );
}

export async function buildSalarySlipHtml(salary: SalaryDocument, employee?: EmployeeDocument, employees: EmployeeDocument[] = []) {
  const assets = await getPrintableAssets();
  const employeeNo = employee
    ? getEmployeeNumber(employee, employees.length ? employees : [employee])
    : salary.employeeNo || formatEmployeeNumber(salary.employeeId);
  const bankName = employee?.bankName || '-';
  const accountNumber = employee?.accountNumber || '-';
  const ifscCode = employee?.ifscCode || '-';
  const grossPay = salary.baseAmount;
  const totalDeductions = salary.advance + salary.deduction;

  return buildPayrollHtmlShell(
    'Salary Slip',
    `
      <div class="meta-row">
        <div><b>Period:</b> ${escapeHtml(salary.period)}</div>
        <div><b>Payment Date:</b> ${escapeHtml(salary.paymentDate)}</div>
      </div>
      <table>
        <tr><th colspan="2">Employee Details</th></tr>
        <tr><td>Name</td><td>${escapeHtml(salary.employeeName)}</td></tr>
        <tr><td>Role / Work Type</td><td>${escapeHtml(salary.employeeRole || '-')}</td></tr>
        <tr><td>Employee ID</td><td>${escapeHtml(employeeNo)}</td></tr>
        <tr><td>Bank Name</td><td>${escapeHtml(bankName)}</td></tr>
        <tr><td>Account No</td><td>${escapeHtml(accountNumber)}</td></tr>
        <tr><td>IFSC</td><td>${escapeHtml(ifscCode)}</td></tr>
      </table>
      <table>
        <tr><th>Earnings / Deductions</th><th class="right">Amount</th></tr>
        <tr><td>Base Salary</td><td class="right">${money(salary.baseAmount)}</td></tr>
        <tr><td>Advance</td><td class="right">${money(salary.advance)}</td></tr>
        <tr><td>Deduction</td><td class="right">${money(salary.deduction)}</td></tr>
        <tr><td>Total Deductions</td><td class="right">${money(totalDeductions)}</td></tr>
        <tr class="total"><td>Net Paid</td><td class="right">${money(salary.paidAmount)}</td></tr>
      </table>
      <div class="summary-line">
        <div><b>Gross Pay:</b> ${money(grossPay)}</div>
        <div><b>Net Paid:</b> ${money(salary.paidAmount)}</div>
      </div>
      <p><b>Note:</b> ${escapeHtml(salary.note || '-')}</p>
      ${signatureBlock(assets)}
    `,
    assets,
  );
}

function buildPayrollHtmlShell(title: string, body: string, assets: { logoDataUri: string; signatureDataUri: string }) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #111827; background: #ffffff; font-family: Arial, Helvetica, sans-serif; }
          .page { width: 760px; min-height: 1040px; margin: 0 auto; padding: 32px 42px 26px; }
          .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #d0aa21; padding-bottom: 10px; }
          .brand-row { display: flex; align-items: center; gap: 12px; }
          .logo-img { width: 66px; height: 66px; object-fit: contain; display: block; }
          .brand { font-size: 23px; font-weight: 900; color: #102a43; }
          .company { margin-top: 4px; font-size: 11px; line-height: 1.3; color: #374151; }
          .doc-title { text-align: right; font-size: 22px; font-weight: 900; color: #102a43; }
          .content { margin-top: 18px; font-size: 13px; line-height: 1.42; }
          .content p { margin: 7px 0; }
          .note-line { font-weight: 700; }
          .meta-row, .summary-line { display: flex; justify-content: space-between; gap: 20px; margin: 8px 0 14px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
          .two-table-row { display: flex; align-items: flex-start; gap: 12px; margin: 10px 0; }
          .two-table-row table { flex: 1; width: 50%; margin: 0; table-layout: fixed; }
          th, td { border: 1px solid #d7dde5; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #f3f6f9; color: #102a43; font-weight: 900; }
          td:first-child { width: 34%; font-weight: 700; color: #374151; }
          .two-table-row td:first-child { width: 42%; }
          .two-table-row th, .two-table-row td { padding: 6px; font-size: 11.5px; line-height: 1.25; word-break: break-word; }
          .right { text-align: right; }
          .total td { background: #d0aa21; color: #000; font-weight: 900; }
          .doc-footer { margin-top: 18px; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid; }
          .company-bank { width: 48%; font-size: 11.5px; line-height: 1.35; color: #111827; }
          .bank-title { margin-bottom: 8px; font-weight: 900; color: #102a43; }
          .blue { color: #006fc9; text-decoration: underline; }
          .sign-box { width: 210px; text-align: center; font-weight: 900; font-size: 12px; }
          .signature-img { width: 108px; height: 52px; object-fit: contain; display: block; margin: 4px auto 0; }
          .sign-line { border-top: 1px solid #111827; padding-top: 6px; margin-top: 2px; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="top">
            <div class="brand-row">
              <img class="logo-img" src="${assets.logoDataUri}" />
              <div>
                <div class="brand">LUCKY TRADERS</div>
                <div class="company">
                  2/164/14 Line KollaiVenkatapuram<br/>
                  Krishnagiri Tamil Nadu - India. -635002<br/>
                  GSTIN: 33CJHPM0971N1ZV | Phone: +91 7418287561
                </div>
              </div>
            </div>
            <div class="doc-title">${escapeHtml(title)}</div>
          </div>
          <div class="content">${body}</div>
        </div>
      </body>
    </html>
  `;
}

function signatureBlock(assets: { logoDataUri: string; signatureDataUri: string }) {
  return `
    <div class="doc-footer">
      <div class="company-bank">
        <div class="bank-title">BANK DETAILS</div>
        <div><b>Bank Name:</b> UNION BANK</div>
        <div><b>Account No:</b> <span class="blue">558701010230709</span></div>
        <div><b>Branch:</b> Krishnagiri</div>
        <div><b>IFSC Code:</b> UBIN0555878</div>
      </div>
      <div class="sign-box">
        <div>For LUCKY TRADERS</div>
        <img class="signature-img" src="${assets.signatureDataUri}" />
        <div class="sign-line">Authorized Signatory</div>
      </div>
    </div>
  `;
}

function existingEmployeeFromSalary(salary: SalaryDocument, employees: EmployeeDocument[]) {
  return employees.find((employee) => employee.id === salary.employeeId);
}

function maskAccount(value?: string) {
  if (!value) return '-';
  const cleaned = value.replace(/\s+/g, '');
  if (cleaned.length <= 4) return cleaned;
  return `${'*'.repeat(Math.max(0, cleaned.length - 4))}${cleaned.slice(-4)}`;
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
