import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { Customer } from "@shared/schema";

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
  };
}

// Create styles
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
  column: {
    flex: 1,
  },
  rightAlign: {
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
});

export function InvoicePDF({ items, customer, dueDate, invoiceNumber, settings }: InvoicePDFProps) {
  const subtotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const price = Number(item.unitPrice);
    return sum + (quantity * price);
  }, 0);
  const tax = subtotal * 0.1; // 10% tax
  const total = subtotal + tax;

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
            <Text style={{ flex: 2 }}>Description</Text>
            <Text style={styles.column}>Quantity</Text>
            <Text style={styles.column}>Unit Price</Text>
            <Text style={styles.column}>Amount</Text>
          </View>

          {items.map((item, index) => (
            <View key={index} style={styles.row}>
              <Text style={{ flex: 2 }}>{item.description}</Text>
              <Text style={styles.column}>{Number(item.quantity)}</Text>
              <Text style={styles.column}>${Number(item.unitPrice).toFixed(2)}</Text>
              <Text style={styles.column}>
                ${(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)}
              </Text>
            </View>
          ))}

          <View style={styles.total}>
            <View style={styles.row}>
              <Text style={{ flex: 3 }}>Subtotal:</Text>
              <Text style={styles.column}>${subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={{ flex: 3 }}>Tax (10%):</Text>
              <Text style={styles.column}>${tax.toFixed(2)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[{ flex: 3 }, styles.bold]}>Total:</Text>
              <Text style={[styles.column, styles.bold]}>${total.toFixed(2)}</Text>
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