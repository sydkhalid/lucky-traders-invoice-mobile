import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { Card } from '../components/common';
import { styles } from '../styles';

type SharingStatus = 'checking' | 'online' | 'offline' | 'syncing';
type SharingAction = 'send' | 'receive' | null;

type SharingCount = {
  label: string;
  value: number;
};

export function DeviceSharingScreen({
  status,
  revision,
  serverUrl,
  deviceId,
  counts,
  busyAction,
  onSend,
  onReceive,
}: {
  status: SharingStatus;
  revision: number;
  serverUrl: string;
  deviceId: string;
  counts: SharingCount[];
  busyAction: SharingAction;
  onSend: () => void;
  onReceive: () => void;
}) {
  const isBusy = Boolean(busyAction) || status === 'syncing';
  const online = status === 'online';

  return (
    <View style={styles.stack}>
      <View style={styles.pageHero}>
        <View style={styles.quickActionText}>
          <Text style={styles.pageKicker}>SAME WIFI</Text>
          <Text style={styles.pageTitle}>Device Sharing</Text>
          <Text style={styles.pageSubtitle}>Send and receive business data between nearby devices</Text>
        </View>
        <View style={[styles.deviceShareSignal, online && styles.deviceShareSignalOnline]}>
          <MaterialCommunityIcons name={online ? 'access-point-check' : 'access-point-off'} size={28} color={online ? '#9bd7ca' : '#fda29b'} />
        </View>
      </View>

      <Card title="Connection" icon="access-point-network">
        <View style={styles.deviceShareStatusGrid}>
          <StatusTile label="Status" value={status.toUpperCase()} tone={online ? 'green' : status === 'offline' ? 'red' : 'gold'} />
          <StatusTile label="Revision" value={String(revision)} tone="blue" />
        </View>
        <View style={styles.deviceShareInfoRow}>
          <Text style={styles.deviceShareInfoLabel}>Server</Text>
          <Text style={styles.deviceShareInfoValue} selectable>{serverUrl}</Text>
        </View>
        <View style={styles.deviceShareInfoRow}>
          <Text style={styles.deviceShareInfoLabel}>This Device</Text>
          <Text style={styles.deviceShareInfoValue} selectable>{deviceId || 'Loading...'}</Text>
        </View>
      </Card>

      <Card title="Transfer" icon="swap-horizontal-bold">
        <Pressable
          style={[styles.deviceShareAction, isBusy && styles.navButtonDisabled]}
          onPress={onSend}
          disabled={isBusy}
        >
          <View style={styles.deviceShareActionIcon}>
            <MaterialCommunityIcons name="upload-network-outline" size={24} color="#ffffff" />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionTitle}>{busyAction === 'send' ? 'Sending...' : 'Send Data'}</Text>
            <Text style={styles.quickActionSubtitle}>Push this device data to the sharing server</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#516071" />
        </Pressable>

        <Pressable
          style={[styles.deviceShareAction, isBusy && styles.navButtonDisabled]}
          onPress={onReceive}
          disabled={isBusy}
        >
          <View style={[styles.deviceShareActionIcon, styles.deviceShareActionIconReceive]}>
            <MaterialCommunityIcons name="download-network-outline" size={24} color="#ffffff" />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionTitle}>{busyAction === 'receive' ? 'Receiving...' : 'Receive Data'}</Text>
            <Text style={styles.quickActionSubtitle}>Pull the latest data from another synced device</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#516071" />
        </Pressable>
      </Card>

      <Card title="Data Pack" icon="database-outline">
        <View style={styles.statGrid}>
          {counts.map((item) => (
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
