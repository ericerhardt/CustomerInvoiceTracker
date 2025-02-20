import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PlusCircle, Trash2, Send, Loader2 } from "lucide-react";
import { Invoice, Customer } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ITEMS_PER_PAGE = 10;

export default function Dashboard() {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);

  const { data: invoices, isLoading: isLoadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const deletePaymentLink = useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await apiRequest("DELETE", `/api/invoices/${invoiceId}/payment-link`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete payment link');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: "Payment link deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resendPaymentLink = useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await apiRequest("POST", `/api/invoices/${invoiceId}/resend`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to resend invoice');
      }
      return res.json();
    },
    onMutate: async (invoiceId) => {
      // Optimistic update
      const previousInvoices = queryClient.getQueryData<Invoice[]>(["/api/invoices"]);

      if (previousInvoices) {
        queryClient.setQueryData<Invoice[]>(["/api/invoices"], (old) =>
          old?.map((invoice) =>
            invoice.id === invoiceId
              ? { ...invoice, isResending: true }
              : invoice
          )
        );
      }

      return { previousInvoices };
    },
    onSuccess: (_, invoiceId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: "Invoice and payment link sent successfully",
      });
    },
    onError: (error: Error, _, context) => {
      // Revert optimistic update on error
      if (context?.previousInvoices) {
        queryClient.setQueryData(["/api/invoices"], context.previousInvoices);
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const totalPages = Math.ceil((invoices?.length || 0) / ITEMS_PER_PAGE);
  const paginatedInvoices = invoices?.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleDelete = async (invoiceId: number) => {
    try {
      await deletePaymentLink.mutateAsync(invoiceId);
    } catch (error) {
      // Error is already handled in the mutation
    }
  };

  if (isLoadingInvoices) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <Link href="/create-invoice">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Total Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{invoices?.length || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{customers?.length || 0}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInvoices?.map((invoice) => {
                  const customer = customers?.find((c) => c.id === invoice.customerId);
                  const isResending = invoice.isResending;
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link href={`/invoice/${invoice.id}`}>
                          <span className="text-primary hover:underline cursor-pointer">
                            {invoice.number}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>{customer?.name}</TableCell>
                      <TableCell>${Number(invoice.amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            invoice.status === "paid"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {invoice.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(invoice.dueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {invoice.status !== "paid" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resendPaymentLink.mutate(invoice.id)}
                                disabled={isResending || resendPaymentLink.isPending}
                              >
                                {isResending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                ) : (
                                  <Send className="h-4 w-4 mr-1" />
                                )}
                                {isResending ? "Sending..." : "Resend"}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    disabled={isResending}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Payment Link</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this payment link? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(invoice.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="py-2 px-4">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}