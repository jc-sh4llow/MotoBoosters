import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUser, FaLock, FaEnvelope } from 'react-icons/fa';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';

import { auth, db } from '../../lib/firebase';

export function SignUp() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [modalState, setModalState] = useState<{
    type: 'error' | 'info' | null;
    title: string;
    message: string;
  }>({ type: null, title: '', message: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName || !username || !email || !password || !confirmPassword) {
      setModalState({
        type: 'error',
        title: 'Missing Information',
        message: 'Please fill in all fields.',
      });
      return;
    }

    if (password !== confirmPassword) {
      setModalState({
        type: 'error',
        title: 'Password Mismatch',
        message: 'Password and confirm password do not match.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
      const uid = credential.user.uid;

      await addDoc(collection(db, 'users'), {
        authUid: uid,
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        role: 'pending',
        status: 'inactive',
        createdAt: new Date().toISOString(),
      });

      setModalState({
        type: 'info',
        title: 'Account Created',
        message: 'Your account has been created and is pending approval. An admin will activate your access.',
      });
    } catch (error: any) {
      console.error('Sign up failed', error);
      let message = 'Sign up failed. Please try again.';
      if (error?.code === 'auth/email-already-in-use') {
        message = 'That email is already in use. If this is you, try logging in or resetting your password.';
      }
      setModalState({ type: 'error', title: 'Sign Up Failed', message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e88e5 0%, #0d47a1 100%)',
      padding: '1rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
      }}>
        <div style={{
          backgroundColor: '#1e88e5',
          color: 'white',
          padding: '1.5rem',
          textAlign: 'center',
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 600,
          }}>
            Create Your Account
          </h1>
          <p style={{
            margin: '0.5rem 0 0',
            opacity: 0.9,
            fontSize: '0.9rem',
          }}>
            Employees can sign up here. An admin will review and activate your access.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}>
                <FaUser />
              </div>
              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.5rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}>
                <FaUser />
              </div>
              <input
                type="text"
                placeholder="Preferred Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.5rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}>
                <FaEnvelope />
              </div>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.5rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
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
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}>
                <FaLock />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 2.5rem 0.75rem 2.5rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
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
                  fontSize: '0.85rem',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
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
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1976d2')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e88e5')}
          >
            {isSubmitting ? 'Creating Account...' : 'Sign Up'}
          </button>

          <div style={{
            marginTop: '1rem',
            textAlign: 'center',
            color: '#64748b',
            fontSize: '0.9rem',
          }}>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                margin: 0,
                color: '#1e88e5',
                textDecoration: 'none',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Login
            </button>
          </div>
        </form>
      </div>

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
              marginBottom: '1.25rem',
              fontSize: '0.9rem',
              color: '#4b5563',
            }}>
              {modalState.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setModalState({ type: null, title: '', message: '' });
                  if (modalState.type === 'info') {
                    navigate('/login');
                  }
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
