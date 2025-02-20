import { useState } from "react";
import { Navigation } from "@/components/navigation";
import { CustomerForm } from "@/components/customer-form";
import { InvoiceForm } from "@/components/invoice-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CreateInvoice() {
  const [activeTab, setActiveTab] = useState("invoice");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Create Invoice</h1>

        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="invoice">Create Invoice</TabsTrigger>
                <TabsTrigger value="customer">New Customer</TabsTrigger>
              </TabsList>

              <TabsContent value="invoice">
                <InvoiceForm onSuccess={() => setActiveTab("invoice")} />
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
