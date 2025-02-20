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

  // Customer operations
  getCustomersByUserId(userId: number): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer & { userId: number }): Promise<Customer>;
  getCustomer(id: number): Promise<Customer | undefined>;

  // Invoice operations
  createInvoice(invoice: InsertInvoice & { userId: number }): Promise<Invoice>;
  getInvoicesByUserId(userId: number): Promise<Invoice[]>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  updateInvoiceStatus(id: number, status: string): Promise<Invoice>;
  updateInvoicePayment(id: number, paymentId: string, paymentUrl: string): Promise<Invoice>;
  updateInvoice(id: number, invoice: InsertInvoice & { userId: number }): Promise<Invoice>;
  deleteInvoice(id: number): Promise<void>; // Add this new method

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

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

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

  async createInvoice(invoice: InsertInvoice & { userId: number }): Promise<Invoice> {
    const number = `INV-${Date.now()}`;
    const [newInvoice] = await db
      .insert(invoices)
      .values({
        ...invoice,
        number,
        status: 'pending',
        createdAt: new Date(),
        stripePaymentId: null,
        stripePaymentUrl: null,
        dueDate: new Date(invoice.dueDate), 
      })
      .returning();
    return newInvoice;
  }

  async getInvoicesByUserId(userId: number): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.userId, userId));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async updateInvoiceStatus(id: number, status: string): Promise<Invoice> {
    const [invoice] = await db
      .update(invoices)
      .set({ status })
      .where(eq(invoices.id, id))
      .returning();
    return invoice;
  }

  async updateInvoicePayment(id: number, paymentId: string, paymentUrl: string): Promise<Invoice> {
    const [invoice] = await db
      .update(invoices)
      .set({ 
        stripePaymentId: paymentId,
        stripePaymentUrl: paymentUrl
      })
      .where(eq(invoices.id, id))
      .returning();
    return invoice;
  }

  async updateInvoice(id: number, invoice: InsertInvoice & { userId: number }): Promise<Invoice> {
    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        ...invoice,
        dueDate: new Date(invoice.dueDate),
      })
      .where(eq(invoices.id, id))
      .returning();
    return updatedInvoice;
  }

  async deleteInvoice(id: number): Promise<void> {
    // First delete all invoice items
    await this.deleteInvoiceItems(id);
    // Then delete the invoice
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  async createInvoiceItem(item: InsertInvoiceItem & { invoiceId: number }): Promise<InvoiceItem> {
    const [newItem] = await db
      .insert(invoiceItems)
      .values({
        ...item,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })
      .returning();
    return newItem;
  }

  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async deleteInvoiceItems(invoiceId: number): Promise<void> {
    await db
      .delete(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async getSettingsByUserId(userId: number): Promise<Settings | undefined> {
    const [userSettings] = await db.select().from(settings).where(eq(settings.userId, userId));
    return userSettings;
  }

  async upsertSettings(settingsData: InsertSettings & { userId: number }): Promise<Settings> {
    const existing = await this.getSettingsByUserId(settingsData.userId);

    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({
          ...settingsData,
          taxRate: String(settingsData.taxRate), // Convert number to string for decimal column
        })
        .where(eq(settings.userId, settingsData.userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(settings)
        .values({
          ...settingsData,
          taxRate: String(settingsData.taxRate), // Convert number to string for decimal column
        })
        .returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();