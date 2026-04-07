import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// Role → route mapping
export const ROLE_ROUTES = {
  staff: '/staff',
  hod: '/department',
  'faculty-dean': '/faculty-dean',
  'executive-dean': '/executive-dean',
  'university-dean': '/university',
};

// Role display labels
export const ROLE_LABELS = {
  staff: 'Staff',
  hod: 'Head of Department',
  'faculty-dean': 'Faculty Dean',
  'executive-dean': 'Executive Dean',
  'university-dean': 'University Dean',
};

// Seed default accounts into localStorage (run once)
const DEFAULT_ACCOUNTS = [
  { username: 'staff', password: 'staff123', role: 'staff', name: 'Dr. Anita Sharma', department: 'ECE Department' },
  { username: 'hod', password: 'hod123', role: 'hod', name: 'Dr. Rajesh Patil', department: 'CSE Department' },
  { username: 'facultydean', password: 'fdean123', role: 'faculty-dean', name: 'Dr. Meena Kulkarni', department: 'Faculty of Engineering' },
  { username: 'executivedean', password: 'edean123', role: 'executive-dean', name: 'Dr. Sunil Desai', department: 'Campus - Belagavi' },
  { username: 'dean', password: 'dean123', role: 'university-dean', name: 'Dr. Prabhakar Kore', department: 'KLE Technological University' },
];

function seedAccounts() {
  if (!localStorage.getItem('kle_rd_accounts')) {
    localStorage.setItem('kle_rd_accounts', JSON.stringify(DEFAULT_ACCOUNTS));
  }
}

function getAccounts() {
  const raw = localStorage.getItem('kle_rd_accounts');
  return raw ? JSON.parse(raw) : [];
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Seed accounts & restore session on mount
  useEffect(() => {
    seedAccounts();
    const saved = localStorage.getItem('kle_rd_session');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {
        localStorage.removeItem('kle_rd_session');
      }
    }
    setLoading(false);
  }, []);

  const login = (username, password) => {
    const accounts = getAccounts();
    const account = accounts.find(
      (a) => a.username === username && a.password === password
    );
    if (!account) {
      return { success: false, message: 'Invalid username or password' };
    }
    const session = {
      username: account.username,
      name: account.name,
      role: account.role,
      department: account.department,
    };
    localStorage.setItem('kle_rd_session', JSON.stringify(session));
    setUser(session);
    return { success: true };
  };

  const logout = () => {
    localStorage.removeItem('kle_rd_session');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
