import { useState } from 'react';
import Switch from '../../components/ui/Switch';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaUser, FaLock } from 'react-icons/fa';
import { collection, getDocs, query, where, limit, doc, updateDoc, addDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';

import { db, auth } from '../../lib/firebase';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [modalState, setModalState] = useState<{
    type: 'error' | 'info' | 'prompt' | null;
    title: string;
    message: string;
  }>({ type: null, title: '', message: '' });
  const [promptValue, setPromptValue] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      setModalState({
        type: 'error',
        title: 'Missing Information',
        message: 'Please enter both username and password.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const identifier = username.trim();
      const normalizedPassword = password.trim();

      // Determine the email to use with Firebase Auth.
      // If the user typed an email, use it directly.
      // If they typed a username, look up the corresponding email in Firestore.
      let loginEmail = identifier;
      let profileDoc: any | null = null;
      let profileData: any | null = null;

      if (!identifier.includes('@')) {
        // Treat identifier as username; look up its email.
        const userQuery = query(
          collection(db, 'users'),
          where('username', '==', identifier),
          limit(1),
        );
        const userSnapshot = await getDocs(userQuery);

        if (userSnapshot.empty) {
          setModalState({
            type: 'error',
            title: 'Login Failed',
            message: 'Invalid credentials.',
          });
          setIsSubmitting(false);
          return;
        }

        profileDoc = userSnapshot.docs[0];
        profileData = profileDoc.data() as any;

        const emailFromProfile = (profileData.email ?? '').toString().trim();
        if (!emailFromProfile) {
          setModalState({
            type: 'error',
            title: 'Login Failed',
            message: 'This user does not have an email configured. Please contact an administrator.',
          });
          setIsSubmitting(false);
          return;
        }

        loginEmail = emailFromProfile;
      }

      // Sign in with Firebase Auth using the resolved email.
      const credential = await signInWithEmailAndPassword(auth, loginEmail, normalizedPassword);
      const uid = credential.user.uid;

      // If we didn't already load a profile (email login), fetch it by authUid.
      if (!profileDoc) {
        const profileQuery = query(
          collection(db, 'users'),
          where('authUid', '==', uid),
          limit(1),
        );
        const profileSnapshot = await getDocs(profileQuery);

        if (profileSnapshot.empty) {
          setModalState({
            type: 'error',
            title: 'Login Failed',
            message: 'No user profile found for this account. Please contact an administrator.',
          });
          setIsSubmitting(false);
          return;
        }

        profileDoc = profileSnapshot.docs[0];
        profileData = profileDoc.data() as any;
      } else {
        // If profile exists and does not yet have authUid, backfill it.
        const existingAuthUid = (profileData.authUid ?? '').toString();
        if (!existingAuthUid) {
          try {
            const userRef = doc(db, 'users', profileDoc.id);
            await updateDoc(userRef, { authUid: uid });
          } catch (err) {
            console.error('Failed to backfill authUid on user profile', err);
          }
        }
      }

      // Normalize status so minor casing/spacing differences don't break login
      const rawStatus = (profileData?.status ?? '').toString();
      const normalizedStatus = rawStatus.trim().toLowerCase();

      if (normalizedStatus && normalizedStatus !== 'active') {
        setModalState({
          type: 'error',
          title: 'Account Inactive',
          message: 'This account is not active.',
        });
        setIsSubmitting(false);
        return;
      }

      // Record last login timestamp for this user document
      try {
        const userRef = doc(db, 'users', profileDoc.id);
        await updateDoc(userRef, {
          lastLogin: new Date().toISOString(),
        });
      } catch (updateErr) {
        console.error('Failed to update lastLogin', updateErr);
      }

      // Use roles array (new Discord-style) or fall back to single role (legacy)
      const userRoles: string[] = Array.isArray(profileData?.roles) && profileData.roles.length > 0
        ? profileData.roles
        : profileData?.role
          ? [profileData.role]
          : ['staff']; // Default to staff if no role assigned

      login({
        id: profileDoc.id,
        name: profileData?.fullName || profileData?.username || identifier,
        roles: userRoles,
        role: profileData?.role, // Keep for backward compatibility
      });

      navigate('/');
    } catch (error) {
      console.error('Error during login', error);
      setModalState({
        type: 'error',
        title: 'Login Error',
        message: 'Login failed. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    // Show prompt asking which username needs password help
    setPromptValue('');
    setModalState({
      type: 'prompt',
      title: 'Forgot Password',
      message: 'Enter the username that needs password help. An admin will review this request.',
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e88e5 0%, #0d47a1 100%)',
      padding: '1rem'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#1e88e5',
          color: 'white',
          padding: '1.5rem',
          textAlign: 'center'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: '600'
          }}>
            Welcome to MotoBooster
          </h1>
          <p style={{
            margin: '0.5rem 0 0',
            opacity: 0.9,
            fontSize: '0.9rem'
          }}>
            Please sign in to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{
              position: 'relative',
              marginBottom: '1rem'
            }}>
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <FaUser />
              </div>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.5rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                  backgroundColor: '#f9fafb',
                  color: '#111827'
                }}
              />
            </div>

            <div style={{
              position: 'relative',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <FaLock />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 2.5rem 0.75rem 2.5rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                  backgroundColor: '#f9fafb',
                  color: '#111827'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                style={{
                  position: 'absolute',
                  right: '0.9rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  color: '#64748b',
                  fontSize: '0.85rem'
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
              fontSize: '0.9rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Switch
                  checked={false}
                  onChange={() => {}}
                  size="sm"
                />
                <span>Remember me</span>
              </div>
              <button
                type="button"
                onClick={handleForgotPassword}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  color: '#1e88e5',
                  textDecoration: 'none',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                backgroundColor: '#1e88e5',
                color: 'white',
                border: 'none',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1976d2'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1e88e5'}
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>
          </div>

          <div style={{
            textAlign: 'center',
            color: '#64748b',
            fontSize: '0.9rem'
          }}>
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/signup')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                margin: 0,
                color: '#1e88e5',
                textDecoration: 'none',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Sign up
            </button>
          </div>
        </form>
      </div>

      {/* Login Modals */}
      {modalState.type && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem 2rem',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{
              margin: 0,
              marginBottom: '0.75rem',
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#111827',
            }}>
              {modalState.title}
            </h3>
            <p style={{
              margin: 0,
              marginBottom: modalState.type === 'prompt' ? '0.75rem' : '1.25rem',
              fontSize: '0.9rem',
              color: '#4b5563',
            }}>
              {modalState.message}
            </p>

            {modalState.type === 'prompt' && (
              <input
                type="text"
                value={promptValue}
                onChange={e => setPromptValue(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  marginBottom: '1rem',
                  fontSize: '0.9rem',
                  backgroundColor: '#f9fafb',
                  color: '#111827'
                }}
                placeholder="Username needing help"
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              {modalState.type === 'prompt' && (
                <button
                  type="button"
                  onClick={() => {
                    setModalState({ type: null, title: '', message: '' });
                    setPromptValue('');
                  }}
                  style={{
                    padding: '0.4rem 1rem',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    color: '#374151',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (modalState.type === 'prompt') {
                    const trimmed = promptValue.trim();
                    if (!trimmed) {
                      setModalState(prev => ({
                        ...prev,
                        message: 'Please enter the username that needs password help.',
                      }));
                      return;
                    }

                    try {
                      const userQuery = query(
                        collection(db, 'users'),
                        where('username', '==', trimmed),
                        limit(1),
                      );
                      const userSnapshot = await getDocs(userQuery);

                      if (userSnapshot.empty) {
                        setModalState(prev => ({
                          ...prev,
                          message: 'No account found with that username. Please check the spelling and try again.',
                        }));
                        return;
                      }

                      await addDoc(collection(db, 'passwordHelpRequests'), {
                        username: trimmed,
                        createdAt: new Date().toISOString(),
                      });
                    } catch (err) {
                      console.error('Failed to record password help request', err);
                    }

                    setPromptValue('');
                  }
                  setModalState({ type: null, title: '', message: '' });
                }}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}