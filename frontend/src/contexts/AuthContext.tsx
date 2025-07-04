import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import { getCurrentUser, fetchUserAttributes, signIn, signOut } from 'aws-amplify/auth';

// 環境変数から設定を取得
const userPoolId = import.meta.env.VITE_APP_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_APP_USER_POOL_CLIENT_ID;
const region = import.meta.env.VITE_APP_REGION || 'us-east-1';

// Amplify設定
if (userPoolId && userPoolClientId) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        userPoolEndpoint: `https://cognito-idp.${region}.amazonaws.com/`
      }
    }
  });
}

interface UserInfo {
  userId: string;
  username: string;
  email?: string;
  authFlowType?: string;
  loginId?: string;
  attributes?: Record<string, any>;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  signIn: (username: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  checkAuthState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any | null>(null);

  // 認証状態チェック
  async function checkAuthState() {
    try {
      // getCurrentUserでユーザーの基本情報を取得
      const currentUser = await getCurrentUser();
      
      // fetchUserAttributesでユーザー属性を取得
      const attributes = await fetchUserAttributes();
      
      // ユーザー情報を構造化
      const userInfo: UserInfo = {
        userId: currentUser.userId,
        username: currentUser.username,
        email: attributes.email,
        authFlowType: currentUser.signInDetails?.authFlowType,
        loginId: currentUser.signInDetails?.loginId,
        attributes: attributes
      };
      
      setUser(userInfo);
      setIsAuthenticated(true);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }

  // サインイン処理
  async function handleSignIn(username: string, password: string) {
    try {
      const user = await signIn({ username, password });
      await checkAuthState();
      return user;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  // サインアウト処理
  async function handleSignOut() {
    try {
      await signOut();
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  useEffect(() => {
    checkAuthState();
  }, []);

  const value = {
    isAuthenticated,
    isLoading,
    user,
    signIn: handleSignIn,
    signOut: handleSignOut,
    checkAuthState,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
