import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient";

type User = {
  id: number;
  email: string;
  name: string;
  phone?: string;
  role: string;
};

type AuthContext = {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  isLawyer: boolean;
  isOwner: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; phone?: string; birthDate: string; postalCode: string; addressLine1: string; addressLine2?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["auth"],
    queryFn: () => apiRequest("/api/auth/me"),
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });

  const registerMutation = useMutation({
    mutationFn: (data: { email: string; password: string; name: string; phone?: string; birthDate: string; postalCode: string; addressLine1: string; addressLine2?: string }) =>
      apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/logout", { method: "POST" }),
    // 로그아웃 후 /api/auth/me 는 401 → invalidate(재요청)하면 react-query 가 이전 user 를
    // 그대로 유지해 화면이 안 바뀜. 캐시를 직접 null 로 세팅해 즉시 로그아웃 반영.
    onSuccess: () => queryClient.setQueryData(["auth"], null),
  });

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        isAdmin: user?.role === "admin" || user?.role === "owner",
        // owner·admin 은 변호사 전용 기능(서면 패키지)도 접근
        isLawyer: user?.role === "lawyer" || user?.role === "admin" || user?.role === "owner",
        isOwner: user?.role === "owner",
        login: async (email, password) => { await loginMutation.mutateAsync({ email, password }); },
        register: async (data) => { await registerMutation.mutateAsync(data); },
        logout: async () => { await logoutMutation.mutateAsync(); },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
