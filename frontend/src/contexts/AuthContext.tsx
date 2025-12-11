// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { DEVELOPER_ROLE_ID } from '../config/permissions';

export interface AuthUser {
  id: string;
  name: string;
  // New: array of role IDs (Discord-style)
  roles: string[];
  // Legacy: single role string (kept for backward compatibility during migration)
  role?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  initializing: boolean;
  // Helper to check if current user is Developer
  isDeveloper: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  const STORAGE_KEY = 'motobooster_auth_user';

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Handle migration: if old format (role string), convert to new format (roles array)
        const migratedUser: AuthUser = {
          id: parsed.id,
          name: parsed.name,
          roles: parsed.roles || (parsed.role ? [parsed.role] : []),
          role: parsed.role, // Keep for backward compatibility
        };
        setUser(migratedUser);
      }
    } catch (err) {
      console.error('Failed to read auth user from storage', err);
    } finally {
      setInitializing(false);
    }
  }, []);

  const login = (userData: AuthUser) => {
    // Ensure roles array exists
    const normalizedUser: AuthUser = {
      ...userData,
      roles: userData.roles || (userData.role ? [userData.role] : []),
    };
    setUser(normalizedUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedUser));
    } catch (err) {
      console.error('Failed to persist auth user to storage', err);
    }
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Failed to clear auth user from storage', err);
    }
  };

  // Check if user has Developer role
  const isDeveloper = user?.roles?.includes(DEVELOPER_ROLE_ID) ?? false;

  return (
    <AuthContext.Provider value={{ user, login, logout, initializing, isDeveloper }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}