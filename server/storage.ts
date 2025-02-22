import { users, customers, invoices, invoiceItems, settings } from "@shared/schema";
import type { User, Customer, Invoice, InvoiceItem, InsertUser, InsertCustomer, InsertInvoice, InsertInvoiceItem } from "@shared/schema";
import type { Settings, InsertSettings } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: number, hashedPassword: string): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;

  // Customer operations
  getCustomersByUserId(userId: number): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer & { userId: number }): Promise<Customer>;
  getCustomer(id: number): Promise<Customer | undefined>;
  updateCustomer(id: number, customer: InsertCustomer & { userId: number }): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;

  // Invoice operations
  createInvoice(invoice: InsertInvoice & { userId: number }): Promise<Invoice>;
  getInvoicesByUserId(userId: number): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  updateInvoiceStatus(id: number, status: string): Promise<Invoice>;
  updateInvoicePayment(id: number, paymentId: string, paymentUrl: string): Promise<Invoice>;
  updateInvoice(id: number, invoice: InsertInvoice & { userId: number }): Promise<Invoice>;
  deleteInvoice(id: number): Promise<void>;

  // Invoice items
  createInvoiceItem(item: InsertInvoiceItem & { invoiceId: number }): Promise<InvoiceItem>;
  getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]>;
  deleteInvoiceItems(invoiceId: number): Promise<void>;

  // Settings operations
  getSettingsByUserId(userId: number): Promise<Settings | undefined>;
  upsertSettings(settings: InsertSettings & { userId: number }): Promise<Settings>;

  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
  }

  async updateInvoiceStatus(id: number, status: string): Promise<Invoice> {
    console.log(`Attempting to update invoice ${id} status to ${status}`);
    try {
      const [invoice] = await db
        .update(invoices)
        .set({ status })
        .where(eq(invoices.id, id))
        .returning();

      if (!invoice) {
        console.error(`Failed to update invoice ${id}: Invoice not found`);
        throw new Error(`Invoice ${id} not found`);
      }

      console.log(`Successfully updated invoice ${id} status:`, {
        oldStatus: invoice.status,
        newStatus: status,
        invoiceNumber: invoice.number
      });

      return invoice;
    } catch (error) {
      console.error(`Error updating invoice ${id} status:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        status
      });
      throw error;
    }
  }


  // Placeholder for other methods -  These need to be implemented based on the IStorage interface
  getUser(id: number): Promise<User | undefined> { throw new Error("Method not implemented."); }
  getUserByUsername(username: string): Promise<User | undefined> { throw new Error("Method not implemented."); }
  createUser(user: InsertUser): Promise<User> { throw new Error("Method not implemented."); }
  updateUserPassword(id: number, hashedPassword: string): Promise<User> { throw new Error("Method not implemented."); }
  getUserByEmail(email: string): Promise<User | undefined> { throw new Error("Method not implemented."); }
  getCustomersByUserId(userId: number): Promise<Customer[]> { throw new Error("Method not implemented."); }
  createCustomer(customer: InsertCustomer & { userId: number }): Promise<Customer> { throw new Error("Method not implemented."); }
  getCustomer(id: number): Promise<Customer | undefined> { throw new Error("Method not implemented."); }
  updateCustomer(id: number, customer: InsertCustomer & { userId: number }): Promise<Customer> { throw new Error("Method not implemented."); }
  deleteCustomer(id: number): Promise<void> { throw new Error("Method not implemented."); }
  createInvoice(invoice: InsertInvoice & { userId: number }): Promise<Invoice> { throw new Error("Method not implemented."); }
  getInvoicesByUserId(userId: number): Promise<Invoice[]> { throw new Error("Method not implemented."); }
  getInvoice(id: number): Promise<Invoice | undefined> { throw new Error("Method not implemented."); }
  updateInvoicePayment(id: number, paymentId: string, paymentUrl: string): Promise<Invoice> { throw new Error("Method not implemented."); }
  updateInvoice(id: number, invoice: InsertInvoice & { userId: number }): Promise<Invoice> { throw new Error("Method not implemented."); }
  deleteInvoice(id: number): Promise<void> { throw new Error("Method not implemented."); }
  createInvoiceItem(item: InsertInvoiceItem & { invoiceId: number }): Promise<InvoiceItem> { throw new Error("Method not implemented."); }
  getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> { throw new Error("Method not implemented."); }
  deleteInvoiceItems(invoiceId: number): Promise<void> { throw new Error("Method not implemented."); }
  getSettingsByUserId(userId: number): Promise<Settings | undefined> { throw new Error("Method not implemented."); }
  upsertSettings(settings: InsertSettings & { userId: number }): Promise<Settings> { throw new Error("Method not implemented."); }
}

// Export a single instance of DatabaseStorage
export const storage = new DatabaseStorage();