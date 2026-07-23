import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logo } from '../assets';
import { authenticateUser } from '../nosqlUserTable';
import type { AuthenticatedUser, NoSqlUserTable } from '../nosqlUserTable';
import { styles } from '../styles';

export function LoginScreen({
  userTable,
  usersReady,
  onLogin,
}: {
  userTable: NoSqlUserTable;
  usersReady: boolean;
  onLogin: (user: AuthenticatedUser) => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submitLogin() {
    if (!usersReady) {
      setError('User table is loading. Try again in a moment.');
      return;
    }

    const user = authenticateUser(userTable, identifier, password);
    if (!user) {
      setError('Invalid username or password.');
      return;
    }

    setError('');
    onLogin(user);
  }

  function loginAsRole(role: 'admin' | 'manager') {
    if (!usersReady) {
      setError('User table is loading. Try again in a moment.');
      return;
    }

    const records = role === 'admin' ? Object.values(userTable.admin_users) : Object.values(userTable.manager_users);
    const user = records.find((record) => record.status === 'active');
    const roleLabel = role === 'admin' ? 'Admin' : 'Manager';

    if (!user) {
      setError(`No active ${roleLabel.toLowerCase()} account found.`);
      return;
    }

    const authenticatedUser = authenticateUser(userTable, user.username, user.password);
    if (!authenticatedUser) {
      setIdentifier(user.username);
      setPassword('');
      setError(`${roleLabel} account needs manual password entry.`);
      return;
    }

    setIdentifier(user.username);
    setPassword('');
    setError('');
    onLogin(authenticatedUser);
  }

  return (
    <SafeAreaView style={styles.loginSafeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.loginBrandBlock}>
            <View style={styles.loginLogoFrame}>
              <Image source={logo} style={styles.loginLogo} />
            </View>
            <Text style={styles.loginKicker}>LUCKY TRADERS</Text>
            <Text style={styles.loginTitle}>Sign in</Text>
            <Text style={styles.loginSubtitle}>Admin and manager access</Text>
          </View>

          <View style={styles.loginCard}>
            <View style={styles.loginFormHeader}>
              <View style={styles.cardIconBadge}>
                <MaterialCommunityIcons name="account-lock-outline" size={18} color="#ffffff" />
              </View>
              <View style={styles.quickActionText}>
                <Text style={styles.loginFormTitle}>Account access</Text>
                <Text style={styles.loginFormHint}>Enter your username or email to continue.</Text>
              </View>
            </View>

            <View style={styles.loginForm}>
              <View style={styles.field}>
                <Text style={styles.inputLabel}>Username or Email</Text>
                <TextInput
                  style={styles.input}
                  value={identifier}
                  onChangeText={(value) => {
                    setIdentifier(value);
                    setError('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Username or email"
                  placeholderTextColor="#8a94a6"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setError('');
                  }}
                  secureTextEntry
                  placeholder="Password"
                  placeholderTextColor="#8a94a6"
                />
              </View>

              {error ? <Text style={styles.loginError}>{error}</Text> : null}
              {!usersReady ? <Text style={styles.mutedText}>Loading local user table...</Text> : null}

              <Pressable style={[styles.loginButton, !usersReady && styles.navButtonDisabled]} onPress={submitLogin} disabled={!usersReady}>
                <MaterialCommunityIcons name="login" size={19} color="#ffffff" />
                <Text style={styles.loginButtonText}>Sign In</Text>
              </Pressable>

              <View style={styles.loginRoleButtons}>
                <Pressable
                  style={[styles.loginRoleButton, !usersReady && styles.navButtonDisabled]}
                  onPress={() => loginAsRole('admin')}
                  disabled={!usersReady}
                >
                  <MaterialCommunityIcons name="shield-account-outline" size={18} color="#163a5f" />
                  <Text style={styles.loginRoleButtonText}>Admin Login</Text>
                </Pressable>
                <Pressable
                  style={[styles.loginRoleButton, !usersReady && styles.navButtonDisabled]}
                  onPress={() => loginAsRole('manager')}
                  disabled={!usersReady}
                >
                  <MaterialCommunityIcons name="account-tie-outline" size={18} color="#163a5f" />
                  <Text style={styles.loginRoleButtonText}>Manager Login</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
