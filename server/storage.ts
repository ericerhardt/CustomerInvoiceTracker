import { users, customers, invoices, invoiceItems } from "@shared/schema";
import type { User, Customer, Invoice, InvoiceItem, InsertUser, InsertCustomer, InsertInvoice, InsertInvoiceItem } from "@shared/schema";
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

  // Invoice items
  createInvoiceItem(item: InsertInvoiceItem & { invoiceId: number }): Promise<InvoiceItem>;
  getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]>;

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
        dueDate: new Date(invoice.dueDate), // Ensure dueDate is a Date object
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
}

export const storage = new DatabaseStorage();