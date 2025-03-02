import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { PlusCircle, Trash2, Edit, Send, Loader2, Search, ArrowUpDown } from "lucide-react";
import { Invoice, Customer } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ITEMS_PER_PAGE = 10;

type SortField = "number" | "customerName" | "amount" | "status" | "dueDate";
type SortOrder = "asc" | "desc";

export default function InvoicesPage() {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("number");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [resendingInvoiceId, setResendingInvoiceId] = useState<number | null>(null);

  const { data: invoices, isLoading: isLoadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Filter and sort invoices
  const filteredAndSortedInvoices = useMemo(() => {
    if (!invoices) return [];

    let filtered = invoices;

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((invoice) => {
        const customer = customers?.find((c) => c.id === invoice.customerId);
        return (
          invoice.number.toLowerCase().includes(searchLower) ||
          customer?.name.toLowerCase().includes(searchLower) ||
          invoice.amount.toString().includes(searchLower) ||
          invoice.status.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      const multiplier = sortOrder === "asc" ? 1 : -1;

      if (sortField === "customerName") {
        const customerA = customers?.find((c) => c.id === a.customerId)?.name || "";
        const customerB = customers?.find((c) => c.id === b.customerId)?.name || "";
        return customerA.localeCompare(customerB) * multiplier;
      }

      if (sortField === "dueDate") {
        return (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()) * multiplier;
      }

      if (sortField === "amount") {
        return (Number(a.amount) - Number(b.amount)) * multiplier;
      }

      return a[sortField].localeCompare(b[sortField]) * multiplier;
    });
  }, [invoices, customers, searchTerm, sortField, sortOrder]);

  const totalPages = Math.ceil((filteredAndSortedInvoices?.length || 0) / ITEMS_PER_PAGE);
  const paginatedInvoices = filteredAndSortedInvoices.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const deleteInvoice = useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await apiRequest("DELETE", `/api/invoices/${invoiceId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete invoice');
      }
      return res.status === 204 ? undefined : res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: "Invoice deleted successfully",
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
      setResendingInvoiceId(invoiceId);
      try {
        const res = await apiRequest("POST", `/api/invoices/${invoiceId}/resend`);
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Failed to resend invoice');
        }
        return res.json();
      } finally {
        setResendingInvoiceId(null);
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invoice and payment link sent successfully",
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

  const handleDelete = async (invoiceId: number) => {
    try {
      await deleteInvoice.mutateAsync(invoiceId);
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
          <h1 className="text-3xl font-bold">Invoices</h1>
          <Link href="/create-invoice">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Invoice List</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => toggleSort("number")}
                      className="flex items-center gap-2"
                    >
                      Invoice Number
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => toggleSort("customerName")}
                      className="flex items-center gap-2"
                    >
                      Customer
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => toggleSort("amount")}
                      className="flex items-center gap-2"
                    >
                      Amount
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => toggleSort("status")}
                      className="flex items-center gap-2"
                    >
                      Status
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => toggleSort("dueDate")}
                      className="flex items-center gap-2"
                    >
                      Due Date
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInvoices.map((invoice) => {
                  const customer = customers?.find((c) => c.id === invoice.customerId);
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link href={`/create-invoice/${invoice.id}`}>
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
                              : invoice.status === "failed"
                              ? "bg-red-100 text-red-800"
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
                          <Link href={`/create-invoice/${invoice.id}`}>
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4 mr-1" />
                              {invoice.status === "paid" ? "View" : "Edit"}
                            </Button>
                          </Link>
                          {invoice.status !== "paid" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resendPaymentLink.mutate(invoice.id)}
                                disabled={resendingInvoiceId === invoice.id}
                              >
                                {resendingInvoiceId === invoice.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                ) : (
                                  <Send className="h-4 w-4 mr-1" />
                                )}
                                {resendingInvoiceId === invoice.id ? "Sending..." : "Resend"}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this invoice? This action cannot be undone.
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