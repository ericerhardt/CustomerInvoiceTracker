import React from 'react';
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Customer } from "@shared/schema";

interface InvoicePDFProps {
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  customer?: Customer;
  dueDate: string;
  invoiceNumber: string;
  settings?: {
    companyName: string;
    companyAddress: string;
    companyEmail: string;
    taxRate?: number;
  };
}

// Styles remain unchanged
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  section: {
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  columnLeft: {
    flex: 2,
  },
  columnRight: {
    flex: 1,
    textAlign: "right",
  },
  bold: {
    fontWeight: "bold",
  },
  total: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 5,
  },
  totalLabel: {
    width: "30%",
    textAlign: "right",
    paddingRight: 10,
  },
  totalValue: {
    width: "20%",
    textAlign: "right",
  },
});

export function InvoicePDF({ items, customer, dueDate, invoiceNumber, settings }: InvoicePDFProps) {
  // Ensure all numeric calculations are properly handled
  const subtotal = items.reduce((sum, item) => {
    return sum + (Number(item.quantity) * Number(item.unitPrice));
  }, 0);

  const taxRate = settings?.taxRate ? Number(settings.taxRate) / 100 : 0.1;
  const tax = Number((subtotal * taxRate).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>INVOICE</Text>
            <Text>Invoice Number: {invoiceNumber}</Text>
            <Text>Due Date: {new Date(dueDate).toLocaleDateString()}</Text>
          </View>
          <View>
            <Text style={styles.bold}>{settings?.companyName || 'Your Company Name'}</Text>
            <Text>{settings?.companyAddress || '123 Business Street'}</Text>
            <Text>{settings?.companyEmail || 'contact@company.com'}</Text>
          </View>
        </View>

        {customer && (
          <View style={styles.section}>
            <Text style={styles.bold}>Bill To:</Text>
            <Text>{customer.name}</Text>
            <Text>{customer.address}</Text>
            <Text>{customer.email}</Text>
            <Text>{customer.phone}</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={[styles.row, styles.bold]}>
            <Text style={styles.columnLeft}>Description</Text>
            <Text style={styles.columnRight}>Quantity</Text>
            <Text style={styles.columnRight}>Unit Price</Text>
            <Text style={styles.columnRight}>Amount</Text>
          </View>

          {items.map((item, index) => (
            <View key={index} style={styles.row}>
              <Text style={styles.columnLeft}>{item.description}</Text>
              <Text style={styles.columnRight}>{item.quantity}</Text>
              <Text style={styles.columnRight}>${Number(item.unitPrice).toFixed(2)}</Text>
              <Text style={styles.columnRight}>
                ${(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)}
              </Text>
            </View>
          ))}

          <View style={styles.total}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal:</Text>
              <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({(taxRate * 100).toFixed(2)}%):</Text>
              <Text style={styles.totalValue}>${tax.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, styles.bold]}>Total:</Text>
              <Text style={[styles.totalValue, styles.bold]}>${total.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.bold}>Payment Terms</Text>
          <Text>Please pay within 30 days of receiving this invoice.</Text>
        </View>
      </Page>
    </Document>
  );
}