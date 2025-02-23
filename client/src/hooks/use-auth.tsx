import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  resetPasswordMutation: UseMutationResult<void, Error, { email: string }>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 0,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      console.log('Login successful, invalidating queries...');
      // Clear all existing queries before setting new user data
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], user);
      console.log('Queries invalidated and user data set');
    },
    onError: (error: Error) => {
      console.error('Login failed:', error);
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      console.log('Registration successful, invalidating queries...');
      // Clear all existing queries before setting new user data
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], user);
      console.log('Queries invalidated and user data set');
    },
    onError: (error: Error) => {
      console.error('Registration failed:', error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const res = await apiRequest("POST", "/api/reset-password", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to reset password");
      }
    },
    onSuccess: () => {
      toast({
        title: "Reset link sent",
        description: "Check your email for password reset instructions",
      });
    },
    onError: (error: Error) => {
      console.error('Password reset failed:', error);
      toast({
        title: "Reset failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      console.log('Logout successful, clearing all queries...');
      // Clear all queries and cache on logout
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);
      console.log('All queries cleared and user data reset');
    },
    onError: (error: Error) => {
      console.error('Logout failed:', error);
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        resetPasswordMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}