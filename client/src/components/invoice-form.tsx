import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { insertInvoiceSchema, type InsertInvoice, type Customer, type Invoice } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InvoiceTemplate } from "./invoice-template";
import { useState, useEffect } from "react";

interface InvoiceFormProps {
  onSuccess?: () => void;
  invoice?: Invoice & { items: Array<{ description: string; quantity: number; unitPrice: number; }> };
}

export function InvoiceForm({ onSuccess, invoice }: InvoiceFormProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [items, setItems] = useState([{ description: "", quantity: 1, unitPrice: 0 }]);

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  useEffect(() => {
    if (invoice?.items) {
      setItems(invoice.items);
    }
  }, [invoice]);

  const form = useForm<InsertInvoice>({
    resolver: zodResolver(insertInvoiceSchema),
    defaultValues: {
      customerId: invoice?.customerId || 0,
      amount: invoice?.amount || 0,
      dueDate: invoice?.dueDate 
        ? new Date(invoice.dueDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    },
  });

  const createInvoice = useMutation({
    mutationFn: async (data: InsertInvoice) => {
      const res = await apiRequest(
        invoice ? "PATCH" : "POST",
        invoice ? `/api/invoices/${invoice.id}` : "/api/invoices",
        { 
          ...data,
          items: items.map(item => ({
            ...item,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice)
          }))
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to save invoice');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: invoice ? "Invoice updated successfully" : "Invoice created successfully",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unitPrice: 0 }]);
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);

    // Update total amount
    const total = newItems.reduce((sum, item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      return sum + (quantity * unitPrice);
    }, 0);

    form.setValue("amount", total);
  };

  return (
    <div className="space-y-8">
      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => createInvoice.mutate(data))} className="space-y-4">
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(parseInt(value))}
                  value={field.value.toString()}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {customers?.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id.toString()}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due Date</FormLabel>
                <FormControl>
                  <Input 
                    type="date" 
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Items</h3>
              <Button type="button" variant="outline" onClick={addItem}>
                Add Item
              </Button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-3 gap-4">
                <Input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Quantity"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Unit Price"
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                />
              </div>
            ))}
          </div>

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total Amount</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    {...field}
                    value={field.value}
                    readOnly 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={createInvoice.isPending}>
            {createInvoice.isPending 
              ? (invoice ? "Updating..." : "Creating...") 
              : (invoice ? "Update Invoice" : "Create Invoice")}
          </Button>
        </form>
      </Form>

      <InvoiceTemplate
        items={items}
        customer={customers?.find(c => c.id === form.getValues("customerId"))}
        dueDate={form.getValues("dueDate")}
        invoiceNumber={invoice?.number}
      />
    </div>
  );
}