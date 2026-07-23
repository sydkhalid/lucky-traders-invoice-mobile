import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { AuthenticatedUser, UserDocument } from '../nosqlUserTable';
import { Card, Field } from '../components/common';
import { styles } from '../styles';
import type { ManagerUserForm } from '../types';

const USERS_PER_PAGE = 10;
type UserFilter = 'all' | 'admin' | 'manager' | 'active' | 'blocked' | 'recent';

const userFilters: { key: UserFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'admin', label: 'Admins' },
  { key: 'manager', label: 'Managers' },
  { key: 'active', label: 'Active' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'recent', label: 'Recent' },
];

export function UsersScreen({
  user,
  users,
  managerUserForm,
  updateManagerUserForm,
  saveManagerUser,
}: {
  user: AuthenticatedUser;
  users: UserDocument[];
  managerUserForm: ManagerUserForm;
  updateManagerUserForm: (field: keyof ManagerUserForm, value: string) => void;
  saveManagerUser: () => void;
}) {
  const [formVisible, setFormVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = users.filter((record) => {
      const matchesSearch = !query || [
        record.name,
        record.username,
        record.email,
        record.phone,
        record.role,
        record.status,
        record.collection,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesFilter =
        filter === 'all' ||
        filter === 'recent' ||
        record.role === filter ||
        record.status === filter;

      return matchesSearch && matchesFilter;
    });

    if (filter === 'recent') {
      result = result.slice(0, USERS_PER_PAGE);
    }

    return result;
  }, [filter, search, users]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const visibleUsers = useMemo(() => {
    const start = (currentPage - 1) * USERS_PER_PAGE;
    return filteredUsers.slice(start, start + USERS_PER_PAGE);
  }, [currentPage, filteredUsers]);
  const adminCount = users.filter((record) => record.role === 'admin').length;
  const managerCount = users.filter((record) => record.role === 'manager').length;
  const activeCount = users.filter((record) => record.status === 'active').length;

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
          <Text style={styles.pageKicker}>USER MANAGEMENT</Text>
          <Text style={styles.pageTitle}>Users</Text>
          <Text style={styles.pageSubtitle}>
            {users.length} users | {managerCount} managers | {activeCount} active
          </Text>
        </View>
        {user.role === 'admin' ? (
          <Pressable style={styles.pagePrimaryButton} onPress={() => setFormVisible(true)}>
            <MaterialCommunityIcons name="account-plus-outline" size={18} color="#ffffff" />
            <Text style={styles.pagePrimaryButtonText}>Add Manager</Text>
          </Pressable>
        ) : null}
      </View>

      {formVisible && user.role === 'admin' ? (
        <Card
          title="Add manager user"
          icon="account-plus-outline"
          action={
            <View style={styles.clientFormActions}>
              <Pressable style={styles.cancelEditButton} onPress={() => setFormVisible(false)}>
                <MaterialCommunityIcons name="close" size={16} color="#b42318" />
                <Text style={styles.cancelEditButtonText}>Close</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={saveManagerUser}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
                <Text style={styles.smallButtonText}>Save</Text>
              </Pressable>
            </View>
          }
        >
          <Field label="Manager Name" value={managerUserForm.name} onChangeText={(value) => updateManagerUserForm('name', value)} />
          <Field label="Username" value={managerUserForm.username} onChangeText={(value) => updateManagerUserForm('username', value)} autoCapitalize="none" />
          <Field label="Email" value={managerUserForm.email} onChangeText={(value) => updateManagerUserForm('email', value)} autoCapitalize="none" keyboardType="email-address" />
          <Field label="Phone" value={managerUserForm.phone} onChangeText={(value) => updateManagerUserForm('phone', value)} keyboardType="phone-pad" />
          <Field label="Password" value={managerUserForm.password} onChangeText={(value) => updateManagerUserForm('password', value)} secureTextEntry />
          <Field label="Confirm Password" value={managerUserForm.confirmPassword} onChangeText={(value) => updateManagerUserForm('confirmPassword', value)} secureTextEntry />
        </Card>
      ) : null}

      {user.role !== 'admin' ? (
        <Card title="Admin only" icon="shield-lock-outline">
          <Text style={styles.mutedText}>Only admin users can add manager accounts.</Text>
        </Card>
      ) : null}

      <Card title="User accounts" icon="account-key-outline">
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#667085" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, username, email, phone, role, or status"
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
          {userFilters.map((item) => {
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
            <Text style={styles.listToolbarTitle}>Latest users</Text>
            <Text style={styles.listToolbarMeta}>Page {currentPage} of {totalPages}</Text>
          </View>
          <Text style={styles.listCountBadge}>{visibleUsers.length} showing</Text>
        </View>

        {filteredUsers.length === 0 ? (
          <Text style={styles.mutedText}>No users match this search or filter.</Text>
        ) : (
          <View style={styles.clientList}>
            {visibleUsers.map((record) => (
              <View style={styles.clientCard} key={record.id}>
                <Pressable
                  style={styles.clientCollapsedRow}
                  onPress={() => setExpandedUserId((current) => (current === record.id ? null : record.id))}
                >
                  <Text style={styles.clientCollapsedName} numberOfLines={1}>
                    {record.name}
                  </Text>
                  <MaterialCommunityIcons
                    name={expandedUserId === record.id ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color="#667085"
                  />
                </Pressable>

                {expandedUserId === record.id ? (
                  <View style={styles.clientExpandedDetails}>
                    <View style={styles.accountUserHeader}>
                      <View style={styles.quickActionText}>
                        <Text style={styles.clientName}>{record.name}</Text>
                        <Text style={styles.clientMeta}>{record.role.toUpperCase()} | {record.status.toUpperCase()}</Text>
                      </View>
                      {record.id === user.id ? <Text style={styles.currentUserBadge}>YOU</Text> : null}
                    </View>

                    <View style={styles.reportGrid}>
                      <View style={styles.reportTile}>
                        <Text style={styles.reportLabel}>Role</Text>
                        <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                          {record.role.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.reportTile}>
                        <Text style={styles.reportLabel}>Status</Text>
                        <Text style={styles.reportValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                          {record.status.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.reportTile}>
                        <Text style={styles.reportLabel}>Admins</Text>
                        <Text style={styles.reportValue}>{adminCount}</Text>
                      </View>
                    </View>

                    <Text style={styles.clientMeta}>Username: {record.username}</Text>
                    <Text style={styles.clientMeta}>Email: {record.email || '-'}</Text>
                    <Text style={styles.clientMeta}>Phone: {record.phone || '-'}</Text>
                    <Text style={styles.clientMeta}>Collection: {record.collection}</Text>
                    <Text style={styles.clientAudit}>Created by {record.createdBy} on {record.createdAt}</Text>
                  </View>
                ) : null}
              </View>
            ))}
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
      </Card>
    </View>
  );
}
