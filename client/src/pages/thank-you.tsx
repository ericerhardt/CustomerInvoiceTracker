import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt, Loader2 } from "lucide-react";
import { Customer, Invoice } from "@shared/schema";

export default function ThankYou() {
  // Get invoice ID from URL params
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('invoice');

  const { data: invoice, isLoading: isLoadingInvoice } = useQuery<Invoice>({
    queryKey: [`/api/public/invoices/${invoiceId}`],
    enabled: !!invoiceId,
  });

  const { data: customer, isLoading: isLoadingCustomer } = useQuery<Customer>({
    queryKey: [`/api/public/customers/${invoice?.customerId}`],
    enabled: !!invoice?.customerId,
  });

  if (isLoadingInvoice || isLoadingCustomer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invoice || !customer) {
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
            <p>Invoice Number: {invoice.number}</p>
            <p>Amount Paid: ${Number(invoice.amount).toFixed(2)}</p>
            <p>Date: {new Date(invoice.createdAt).toLocaleDateString()}</p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Customer Information:</h3>
            <p>Name: {customer.name}</p>
            <p>Email: {customer.email}</p>
            {customer.phone && <p>Phone: {customer.phone}</p>}
          </div>

          {invoice.stripeReceiptUrl && (
            <div className="mt-6 text-center">
              <a 
                href={invoice.stripeReceiptUrl} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button>
                  <Receipt className="mr-2 h-4 w-4" />
                  View Receipt
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
