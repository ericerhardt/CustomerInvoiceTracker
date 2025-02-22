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

  // Implement User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  // Implement Customer operations
  async getCustomersByUserId(userId: number): Promise<Customer[]> {
    return await db.select().from(customers).where(eq(customers.userId, userId));
  }

  async createCustomer(customer: InsertCustomer & { userId: number }): Promise<Customer> {
    const [newCustomer] = await db.insert(customers).values(customer).returning();
    return newCustomer;
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async updateCustomer(id: number, customer: InsertCustomer & { userId: number }): Promise<Customer> {
    const [updatedCustomer] = await db
      .update(customers)
      .set(customer)
      .where(eq(customers.id, id))
      .returning();
    return updatedCustomer;
  }

  async deleteCustomer(id: number): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id));
  }

  // Implement Invoice operations
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

  async createInvoice(invoice: InsertInvoice & { userId: number }): Promise<Invoice> {
    const [newInvoice] = await db.insert(invoices).values(invoice).returning();
    return newInvoice;
  }

  async getInvoicesByUserId(userId: number): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.userId, userId));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async updateInvoicePayment(id: number, paymentId: string, paymentUrl: string): Promise<Invoice> {
    const [updatedInvoice] = await db
      .update(invoices)
      .set({ stripePaymentId: paymentId, stripePaymentUrl: paymentUrl })
      .where(eq(invoices.id, id))
      .returning();
    return updatedInvoice;
  }

  async updateInvoice(id: number, invoice: InsertInvoice & { userId: number }): Promise<Invoice> {
    const [updatedInvoice] = await db
      .update(invoices)
      .set(invoice)
      .where(eq(invoices.id, id))
      .returning();
    return updatedInvoice;
  }

  async deleteInvoice(id: number): Promise<void> {
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  // Implement Invoice items operations
  async createInvoiceItem(item: InsertInvoiceItem & { invoiceId: number }): Promise<InvoiceItem> {
    const [newItem] = await db.insert(invoiceItems).values(item).returning();
    return newItem;
  }

  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async deleteInvoiceItems(invoiceId: number): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  // Implement Settings operations
  async getSettingsByUserId(userId: number): Promise<Settings | undefined> {
    const [userSettings] = await db.select().from(settings).where(eq(settings.userId, userId));
    return userSettings;
  }

  async upsertSettings(settings: InsertSettings & { userId: number }): Promise<Settings> {
    // First try to update
    const [updated] = await db
      .update(settings)
      .set(settings)
      .where(eq(settings.userId, settings.userId))
      .returning();

    if (updated) return updated;

    // If no update happened, insert
    const [inserted] = await db.insert(settings).values(settings).returning();
    return inserted;
  }
}

// Export a single instance of DatabaseStorage
export const storage = new DatabaseStorage();