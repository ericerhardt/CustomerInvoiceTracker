import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/navigation";
import { CustomerForm } from "@/components/customer-form";
import { InvoiceForm } from "@/components/invoice-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

export default function CreateInvoice() {
  const [activeTab, setActiveTab] = useState("invoice");
  const { id } = useParams();

  const { data: invoice, isLoading } = useQuery({
    queryKey: [`/api/invoices/${id}`],
    queryFn: async () => {
      if (!id) return null;
      const res = await apiRequest("GET", `/api/invoices/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to fetch invoice');
      }
      const data = await res.json();
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-border" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">
          {id ? "Edit Invoice" : "Create Invoice"}
        </h1>

        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="invoice">
                  {id ? "Edit Invoice" : "Create Invoice"}
                </TabsTrigger>
                <TabsTrigger value="customer">New Customer</TabsTrigger>
              </TabsList>

              <TabsContent value="invoice">
                <InvoiceForm 
                  onSuccess={() => setActiveTab("invoice")} 
                  invoice={invoice}
                />
              </TabsContent>

              <TabsContent value="customer">
                <CustomerForm onSuccess={() => setActiveTab("invoice")} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}