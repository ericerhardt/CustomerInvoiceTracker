import { Customer, Settings } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface InvoiceTemplateProps {
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  customer?: Customer;
  dueDate: string;
  invoiceNumber?: string;
}

export function InvoiceTemplate({ items, customer, dueDate, invoiceNumber = "DRAFT" }: InvoiceTemplateProps) {
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const subtotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const price = Number(item.unitPrice);
    return sum + (quantity * price);
  }, 0);

  const taxRate = settings?.taxRate ? Number(settings.taxRate) / 100 : 0.1;
  const tax = Number((subtotal * taxRate).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`/api/invoices/${invoiceNumber}/pdf`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Failed to download PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
    }
  };

  return (
    <Card className="bg-white">
      <CardHeader className="border-b">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl font-bold text-primary mb-2">
              INVOICE
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Invoice Number: {invoiceNumber}<br />
              Due Date: {new Date(dueDate).toLocaleDateString()}
            </p>
          </div>
          <div className="space-y-4">
            <div className="text-right">
              <h3 className="font-semibold">{settings?.companyName || 'Your Company Name'}</h3>
              <p className="text-sm text-muted-foreground">
                {settings?.companyAddress || '123 Business Street'}<br />
                {settings?.companyEmail || 'contact@company.com'}
              </p>
            </div>
            <Button onClick={handleDownloadPDF} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {customer && (
          <div className="border-b pb-4">
            <h3 className="font-semibold mb-2">Bill To:</h3>
            <p className="text-sm">
              {customer.name}<br />
              {customer.address}<br />
              {customer.email}<br />
              {customer.phone}
            </p>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Description</TableHead>
              <TableHead className="w-[20%] text-right">Quantity</TableHead>
              <TableHead className="w-[20%] text-right">Unit Price</TableHead>
              <TableHead className="w-[20%] text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={index}>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right">{Number(item.quantity)}</TableCell>
                <TableCell className="text-right">
                  ${Number(item.unitPrice).toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  ${(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="space-y-2">
          <div className="flex justify-end">
            <span className="w-32 text-muted-foreground">Subtotal:</span>
            <span className="w-32 text-right">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-end">
            <span className="w-32 text-muted-foreground">Tax ({(taxRate * 100).toFixed(2)}%):</span>
            <span className="w-32 text-right">${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-end font-bold">
            <span className="w-32">Total:</span>
            <span className="w-32 text-right">${total.toFixed(2)}</span>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t text-sm text-muted-foreground">
          <p className="font-semibold mb-2">Payment Terms</p>
          <p>Please pay within 30 days of receiving this invoice.</p>
        </div>
      </CardContent>
    </Card>
  );
}