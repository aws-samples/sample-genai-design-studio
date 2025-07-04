import * as React from 'react';
import type { ReactNode } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
}

const LoadingSpinner: React.FC = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh'
  }}>
    <div style={{
      border: '4px solid #f3f3f3',
      borderTop: '4px solid #005276',
      borderRadius: '50%',
      width: '40px',
      height: '40px',
      animation: 'spin 2s linear infinite'
    }} />
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f3f4f6',
        padding: '20px'
      }}>
        <div style={{
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <h2 style={{
            color: '#005276',
            fontSize: '2rem',
            fontWeight: 'bold',
            marginBottom: '10px'
          }}>
            VTO App
          </h2>
          <p style={{
            color: '#666',
            fontSize: '1rem'
          }}>
            サインインしてアプリケーションを使用してください
          </p>
        </div>
        
        <div style={{
          maxWidth: '400px',
          width: '100%'
        }}>
        <Authenticator
          initialState="signIn"
          loginMechanisms={['email']}
          components={{
            SignIn: {
              Header() {
                return (
                  <h3 style={{
                    textAlign: 'center',
                    color: '#005276',
                    marginBottom: '20px'
                  }}>
                    サインイン
                  </h3>
                );
              },
            },
            SignUp: {
              Header() {
                return (
                  <h3 style={{
                    textAlign: 'center',
                    color: '#005276',
                    marginBottom: '20px'
                  }}>
                    アカウント作成
                  </h3>
                );
              },
            }
          }}
        >
          {() => {
            // 認証成功時にリダイレクト（これにより正しいレイアウトでアプリが再読み込みされる）
            window.location.href = "/";
            return <div></div>;
          }}
        </Authenticator>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
