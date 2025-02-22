import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import CreateInvoice from "@/pages/create-invoice";
import Settings from "@/pages/settings";
import Customers from "@/pages/customers";
import Invoices from "@/pages/invoices";
import { ProtectedRoute } from "./lib/protected-route";

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute path="/" component={Dashboard} />} />
      <Route path="/create-invoice" component={() => <ProtectedRoute path="/create-invoice" component={CreateInvoice} />} />
      <Route path="/invoice/:id" component={() => <ProtectedRoute path="/invoice/:id" component={CreateInvoice} />} />
      <Route path="/settings" component={() => <ProtectedRoute path="/settings" component={Settings} />} />
      <Route path="/customers" component={() => <ProtectedRoute path="/customers" component={Customers} />} />
      <Route path="/invoices" component={() => <ProtectedRoute path="/invoices" component={Invoices} />} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;