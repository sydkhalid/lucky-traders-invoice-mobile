export type UserRole = 'admin' | 'manager';
export type UserCollection = 'admin_users' | 'manager_users';

export type UserDocument = {
  id: string;
  collection: UserCollection;
  username: string;
  email: string;
  phone: string;
  name: string;
  role: UserRole;
  status: 'active' | 'blocked';
  password: string;
  createdAt: string;
  createdBy: string;
};

export type NoSqlUserTable = Record<UserCollection, Record<string, UserDocument>>;
export type AuthenticatedUser = Omit<UserDocument, 'password'>;

export const USER_TABLE_STORAGE_KEY = 'lucky-traders.users.v1';

export function createSeedUserTable(): NoSqlUserTable {
  return {
    admin_users: {
      'admin-001': {
        id: 'admin-001',
        collection: 'admin_users',
        username: 'sydkhalid007',
        email: 'sydkhalid7@gmail.com',
        phone: '+917904721979',
        name: 'Syed Khalid Ahamed',
        role: 'admin',
        status: 'active',
        password: 'Sydkhalid7@321',
        createdAt: '14-07-2026',
        createdBy: 'System Seed',
      },
    },
    manager_users: {
      'manager-001': {
        id: 'manager-001',
        collection: 'manager_users',
        username: 'manager',
        email: 'manager@luckytraders.local',
        phone: '',
        name: 'Manager',
        role: 'manager',
        status: 'active',
        password: 'manager123',
        createdAt: '14-07-2026',
        createdBy: 'System Seed',
      },
    },
  };
}

export const demoLoginCredentials = [
  { role: 'Admin', username: 'sydkhalid007', password: 'Sydkhalid7@321' },
  { role: 'Manager', username: 'manager', password: 'manager123' },
];

export function normalizeUserTable(value: unknown): NoSqlUserTable {
  const seed = createSeedUserTable();
  const normalized: NoSqlUserTable = {
    admin_users: { ...seed.admin_users },
    manager_users: { ...seed.manager_users },
  };

  if (!value || typeof value !== 'object') return normalized;
  const incoming = value as Partial<NoSqlUserTable>;

  (['admin_users', 'manager_users'] as const).forEach((collection) => {
    const records = incoming[collection];
    if (!records || typeof records !== 'object') return;

    Object.values(records).forEach((record) => {
      if (!isUserDocument(record)) return;
      if (record.id === 'admin-001' && isLegacyAdmin(record)) {
        normalized.admin_users['admin-001'] = seed.admin_users['admin-001'];
        return;
      }
      normalized[record.collection][record.id] = record;
    });
  });

  return normalized;
}

export function flattenUsers(table: NoSqlUserTable) {
  return Object.values(table).flatMap((collection) => Object.values(collection));
}

export function authenticateUser(table: NoSqlUserTable, identifier: string, password: string): AuthenticatedUser | null {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const normalizedPassword = password.trim();
  const user = flattenUsers(table).find(
    (record) =>
      record.username.toLowerCase() === normalizedIdentifier ||
      record.email.toLowerCase() === normalizedIdentifier,
  );

  if (!user || user.status !== 'active' || user.password !== normalizedPassword) {
    return null;
  }

  return toAuthenticatedUser(user);
}

export function toAuthenticatedUser(user: UserDocument): AuthenticatedUser {
  const { password: _password, ...authenticatedUser } = user;
  return authenticatedUser;
}

function isUserDocument(value: unknown): value is UserDocument {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<UserDocument>;
  return Boolean(
    record.id &&
      record.collection &&
      (record.collection === 'admin_users' || record.collection === 'manager_users') &&
      record.username &&
      record.email !== undefined &&
      record.phone !== undefined &&
      record.name &&
      record.role &&
      (record.role === 'admin' || record.role === 'manager') &&
      record.status &&
      (record.status === 'active' || record.status === 'blocked') &&
      record.password &&
      record.createdAt &&
      record.createdBy,
  );
}

function isLegacyAdmin(user: UserDocument) {
  return (
    user.username === 'admin' &&
    user.email === 'admin@luckytraders.local' &&
    user.password === 'admin123'
  );
}
