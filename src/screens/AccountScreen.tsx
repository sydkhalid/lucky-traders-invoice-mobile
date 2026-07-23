import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { ClientDocument } from '../nosqlClientTable';
import type { AuthenticatedUser, UserDocument } from '../nosqlUserTable';
import { Card, Field } from '../components/common';
import { styles } from '../styles';
import type { PasswordForm, ProfileForm, SavedInvoiceDocument } from '../types';

export function AccountScreen({
  user,
  clients,
  savedInvoices,
  users,
  profileForm,
  passwordForm,
  updateProfileForm,
  updatePasswordForm,
  saveProfile,
  changePassword,
}: {
  user: AuthenticatedUser;
  clients: ClientDocument[];
  savedInvoices: SavedInvoiceDocument[];
  users: UserDocument[];
  profileForm: ProfileForm;
  passwordForm: PasswordForm;
  updateProfileForm: (field: keyof ProfileForm, value: string) => void;
  updatePasswordForm: (field: keyof PasswordForm, value: string) => void;
  saveProfile: () => void;
  changePassword: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Card title="Account" icon="account-circle-outline">
        <View style={styles.accountBadge}>
          <MaterialCommunityIcons name={user.role === 'admin' ? 'shield-account-outline' : 'account-tie-outline'} size={34} color="#163a5f" />
          <View style={styles.quickActionText}>
            <Text style={styles.accountName}>{user.name}</Text>
            <Text style={styles.accountRole}>{user.role.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.accountLine}>Username: {user.username}</Text>
        <Text style={styles.accountLine}>Email: {user.email}</Text>
        <Text style={styles.accountLine}>Phone: {user.phone || '-'}</Text>
        <Text style={styles.accountLine}>Collection: {user.collection}</Text>
        <Text style={styles.accountLine}>Users in app: {users.length}</Text>
        <Text style={styles.accountLine}>Clients in app: {clients.length}</Text>
        <Text style={styles.accountLine}>Saved invoices: {savedInvoices.length}</Text>
      </Card>

      <Card
        title="Edit profile"
        icon="account-edit-outline"
        action={
          <Pressable style={styles.smallButton} onPress={saveProfile}>
            <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
            <Text style={styles.smallButtonText}>Save</Text>
          </Pressable>
        }
      >
        <Field label="Name" value={profileForm.name} onChangeText={(value) => updateProfileForm('name', value)} />
        <Field label="Email" value={profileForm.email} onChangeText={(value) => updateProfileForm('email', value)} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Phone" value={profileForm.phone} onChangeText={(value) => updateProfileForm('phone', value)} keyboardType="phone-pad" />
      </Card>

      <Card
        title="Change password"
        icon="lock-reset"
        action={
          <Pressable style={styles.smallButton} onPress={changePassword}>
            <MaterialCommunityIcons name="content-save-outline" size={16} color="#163a5f" />
            <Text style={styles.smallButtonText}>Update</Text>
          </Pressable>
        }
      >
        <Field label="Current Password" value={passwordForm.currentPassword} onChangeText={(value) => updatePasswordForm('currentPassword', value)} secureTextEntry />
        <Field label="New Password" value={passwordForm.newPassword} onChangeText={(value) => updatePasswordForm('newPassword', value)} secureTextEntry />
        <Field label="Confirm Password" value={passwordForm.confirmPassword} onChangeText={(value) => updatePasswordForm('confirmPassword', value)} secureTextEntry />
      </Card>
    </View>
  );
}
