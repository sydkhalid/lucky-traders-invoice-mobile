import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card } from '../components/common';
import { styles } from '../styles';
import { fetchDatabaseStatus, getSyncServerUrl } from '../syncClient';
import type { SyncDatabaseStatus } from '../syncClient';

type SyncStatus = 'checking' | 'online' | 'offline' | 'syncing';

const countLabels: Record<string, string> = {
  users: 'Users',
  clients: 'Clients',
  suppliers: 'Suppliers',
  products: 'Products',
  purchases: 'Purchases',
  employees: 'Employees',
  salaries: 'Salaries',
  expenses: 'Expenses',
  payments: 'Payments',
  supplierPayments: 'Supplier Payments',
  savedInvoices: 'Invoices',
  managerCustomers: 'Manager Customers',
  managerBills: 'Manager Bills',
  managerCashbook: 'Manager Cashbook',
};

export function DatabaseStatusScreen({
  syncStatus,
  syncRevision,
  currentCounts,
  creatingServerDatabase = false,
  onCreateServerDatabase,
}: {
  syncStatus: SyncStatus;
  syncRevision: number;
  currentCounts: { label: string; value: number }[];
  creatingServerDatabase?: boolean;
  onCreateServerDatabase?: () => Promise<void> | void;
}) {
  const [status, setStatus] = useState<SyncDatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadStatus() {
    try {
      setLoading(true);
      setError('');
      setStatus(await fetchDatabaseStatus());
    } catch (loadError) {
      setStatus(null);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load database status.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  const usesPostgres = status?.storage === 'postgres';
  const hasServerData = Boolean(status?.hasData);

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>SERVER SOURCE</Text>
          <Text style={styles.pageTitle}>Database Status</Text>
          <Text style={styles.pageSubtitle}>Check which database is active before adding new data</Text>
        </View>
        <View style={[styles.deviceShareSignal, usesPostgres && hasServerData && styles.deviceShareSignalOnline]}>
          <MaterialCommunityIcons
            name={usesPostgres && hasServerData ? 'database-check-outline' : 'database-alert-outline'}
            size={28}
            color={usesPostgres && hasServerData ? '#9bd7ca' : '#fda29b'}
          />
        </View>
      </View>

      <Card
        title="Live Server"
        icon="database-search-outline"
        action={
          <Pressable style={[styles.smallButton, loading && styles.navButtonDisabled]} onPress={loadStatus} disabled={loading}>
            <MaterialCommunityIcons name="refresh" size={16} color="#163a5f" />
            <Text style={styles.smallButtonText}>{loading ? 'Checking' : 'Refresh'}</Text>
          </Pressable>
        }
      >
        <View style={styles.deviceShareStatusGrid}>
          <StatusTile label="App Sync" value={syncStatus.toUpperCase()} tone={syncStatus === 'online' ? 'green' : syncStatus === 'offline' ? 'red' : 'gold'} />
          <StatusTile label="App Revision" value={String(syncRevision)} tone="blue" />
        </View>
        <InfoRow label="Server URL" value={getSyncServerUrl()} />
        <InfoRow label="Data Source" value="Server API /sync" />
        <InfoRow label="Local Business DB" value="Disabled" />
      </Card>

      {error ? (
        <Card title="Database Check Failed" icon="alert-circle-outline">
          <Text style={styles.loginError}>{error}</Text>
          <Text style={styles.mutedText}>
            If this shows on Render, redeploy the latest server code and confirm the API key matches the app.
          </Text>
        </Card>
      ) : null}

      {status ? (
        <Card title="Server Database" icon="database-cog-outline">
          <View style={styles.deviceShareStatusGrid}>
            <StatusTile label="Storage" value={status.storage.toUpperCase()} tone={usesPostgres ? 'green' : 'red'} />
            <StatusTile label="Has Data" value={hasServerData ? 'YES' : 'NO'} tone={hasServerData ? 'green' : 'red'} />
          </View>
          <InfoRow label="Database" value={status.database || '-'} />
          <InfoRow label="Server Revision" value={String(status.revision)} />
          <InfoRow label="Updated At" value={status.updatedAt || '-'} />
          <InfoRow label="Updated By Device" value={status.updatedByDevice || '-'} />
          <InfoRow label="Synced Files" value={String(status.syncedFileCount)} />
          {!usesPostgres ? (
            <Text style={styles.loginError}>This server is not using PostgreSQL. Check Render env `SYNC_STORAGE=postgres` and `DATABASE_URL`.</Text>
          ) : null}
          {!hasServerData ? (
            <Text style={styles.loginError}>Server database has no business data. New records must be saved after this page shows the correct server.</Text>
          ) : null}
          {usesPostgres && !hasServerData && onCreateServerDatabase ? (
            <Pressable
              style={[styles.loginButton, styles.loginSuccessButton, creatingServerDatabase && styles.navButtonDisabled]}
              onPress={onCreateServerDatabase}
              disabled={creatingServerDatabase}
            >
              <MaterialCommunityIcons name="database-plus-outline" size={18} color="#ffffff" />
              <Text style={styles.loginButtonText}>{creatingServerDatabase ? 'Creating Server Database...' : 'Create New Server Database'}</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      <Card title="Server Record Counts" icon="counter">
        <View style={styles.statGrid}>
          {status?.counts
            ? Object.entries(status.counts).map(([key, value]) => (
                <View key={key} style={[styles.statCard, styles.statCardTwoColumn]}>
                  <Text style={styles.statLabel}>{countLabels[key] || key}</Text>
                  <Text style={styles.statValue}>{value}</Text>
                </View>
              ))
            : currentCounts.map((item) => (
                <View key={item.label} style={[styles.statCard, styles.statCardTwoColumn]}>
                  <Text style={styles.statLabel}>{item.label}</Text>
                  <Text style={styles.statValue}>{item.value}</Text>
                </View>
              ))}
        </View>
      </Card>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.deviceShareInfoRow}>
      <Text style={styles.deviceShareInfoLabel}>{label}</Text>
      <Text style={styles.deviceShareInfoValue} selectable>
        {value}
      </Text>
    </View>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'gold' | 'blue' }) {
  return (
    <View style={styles.deviceShareStatusTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.deviceShareStatusValue,
          tone === 'green' && styles.statValueGreen,
          tone === 'red' && styles.statValueRed,
          tone === 'gold' && styles.deviceShareStatusGold,
          tone === 'blue' && styles.deviceShareStatusBlue,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {value}
      </Text>
    </View>
  );
}
