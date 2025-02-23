import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt, Loader2 } from "lucide-react";
import type { Invoice } from "@shared/schema";

export default function ThankYou() {
  // Get invoice ID from URL params
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('invoice');

  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/public/invoices/${invoiceId}`],
    enabled: !!invoiceId,
    queryFn: async () => {
      const res = await fetch(`/api/public/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Invoice not found");
      const json = await res.json();
      return json.invoice as Invoice & { customer: { name: string; email: string; phone?: string } };
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-center text-red-600">Invoice Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center">Sorry, we couldn't find the requested invoice.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-center text-green-600">Thank You for Your Payment!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center mb-6">
            <p className="text-lg">Your payment has been processed successfully.</p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Payment Details:</h3>
            <p>Invoice Number: {data.number}</p>
            <p>Amount Paid: ${Number(data.amount).toFixed(2)}</p>
            <p>Date: {new Date(data.createdAt).toLocaleDateString()}</p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Customer Information:</h3>
            <p>Name: {data.customer.name}</p>
            <p>Email: {data.customer.email}</p>
            {data.customer.phone && <p>Phone: {data.customer.phone}</p>}
          </div>

          <div className="mt-6 text-center">
            {data.stripeReceiptUrl ? (
              <a 
                href={data.stripeReceiptUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-block"
              >
                <Button className="w-full sm:w-auto" variant="default">
                  <Receipt className="mr-2 h-5 w-5" />
                  View Receipt
                </Button>
              </a>
            ) : (
              <p className="text-sm text-gray-500">Receipt processing, please check your email.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}