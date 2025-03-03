import { users, customers, invoices, invoiceItems, settings } from "@shared/schema";
import type { User, Customer, Invoice, InvoiceItem, InsertUser, InsertCustomer, InsertInvoice, InsertInvoiceItem } from "@shared/schema";
import type { Settings, InsertSettings } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
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
  updateInvoiceStatus(id: number, status: string, stripe_reciept_url: string): Promise<Invoice>;
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
  updateInvoiceReceipt(id: number, receiptUrl: string): Promise<Invoice>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
  }

  // User operations
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

  // Customer operations with userId filtering
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
      .where(and(eq(customers.id, id), eq(customers.userId, customer.userId)))
      .returning();
    return updatedCustomer;
  }

  async deleteCustomer(id: number): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id));
  }

  // Invoice operations with userId filtering
  async updateInvoiceStatus(id: number, status: string, stripe_reciept_url: string): Promise<Invoice> {
    console.log(`Attempting to update invoice ${id} status to ${status}`);
    try {
      const [invoice] = await db
        .update(invoices)
        .set({ status: status, stripeReceiptUrl: stripe_reciept_url })
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
    const invoiceNumber = `INV-${Date.now()}`;

    const [newInvoice] = await db.insert(invoices).values({
      number: invoiceNumber,
      userId: invoice.userId,
      customerId: invoice.customerId,
      amount: invoice.amount.toString(),
      status: invoice.paymentMethod === 'check' && invoice.checkReceivedDate ? 'paid' : 'pending',
      dueDate: new Date(invoice.dueDate),
      createdAt: new Date(),
      stripePaymentId: null,
      stripePaymentUrl: null,
      stripeReceiptUrl: null,
      paymentMethod: invoice.paymentMethod,
      checkNumber: invoice.checkNumber,
      checkReceivedDate: invoice.checkReceivedDate ? new Date(invoice.checkReceivedDate) : null
    }).returning();

    return newInvoice;
  }

  async getInvoicesByUserId(userId: number): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.userId, userId));
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoicePaymentId(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.stripePaymentId, id)).limit(1);
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
    const updateData = {
      customerId: invoice.customerId,
      amount: invoice.amount.toString(),
      dueDate: new Date(invoice.dueDate),
      userId: invoice.userId,
      paymentMethod: invoice.paymentMethod,
      checkNumber: invoice.checkNumber,
      checkReceivedDate: invoice.checkReceivedDate ? new Date(invoice.checkReceivedDate) : null,
      // Update status to 'paid' if check is received
      status: invoice.paymentMethod === 'check' && invoice.checkReceivedDate ? 'paid' : 'pending'
    };

    console.log('Updating invoice with data:', {
      id,
      ...updateData,
      checkReceivedDate: updateData.checkReceivedDate?.toISOString(),
      status: updateData.status
    });

    const [updatedInvoice] = await db
      .update(invoices)
      .set(updateData)
      .where(and(eq(invoices.id, id), eq(invoices.userId, invoice.userId)))
      .returning();

    console.log('Updated invoice:', updatedInvoice);
    return updatedInvoice;
  }

  async deleteInvoice(id: number): Promise<void> {
    // First get the invoice to ensure it exists
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (invoice) {
      // Delete related invoice items first
      await this.deleteInvoiceItems(id);
      // Then delete the invoice
      await db.delete(invoices).where(eq(invoices.id, id));
    }
  }

  // Invoice items operations
  async createInvoiceItem(item: InsertInvoiceItem & { invoiceId: number }): Promise<InvoiceItem> {
    const [newItem] = await db.insert(invoiceItems).values({
      invoiceId: item.invoiceId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
    }).returning();
    return newItem;
  }

  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async deleteInvoiceItems(invoiceId: number): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  // Settings operations with userId filtering
  async getSettingsByUserId(userId: number): Promise<Settings | undefined> {
    const [userSettings] = await db.select().from(settings).where(eq(settings.userId, userId));
    return userSettings;
  }

  async upsertSettings(settingsData: InsertSettings & { userId: number }): Promise<Settings> {
    try {
      // First try to get existing settings
      const existingSettings = await this.getSettingsByUserId(settingsData.userId);

      const settingsToUpsert = {
        ...settingsData,
        // Convert taxRate to string since that's what the database expects
        taxRate: settingsData.taxRate.toString(),
        // Ensure all required fields have defaults
        companyName: settingsData.companyName || '',
        companyAddress: settingsData.companyAddress || '',
        companyEmail: settingsData.companyEmail || '',
        stripeSecretKey: settingsData.stripeSecretKey || '',
        stripePublicKey: settingsData.stripePublicKey || '',
        stripeWebhookSecret: settingsData.stripeWebhookSecret || null,
        sendGridApiKey: settingsData.sendGridApiKey || '',
        sendGridFromEmail: settingsData.sendGridFromEmail || '',
        resetLinkUrl: settingsData.resetLinkUrl || 'http://localhost:5000/reset-password',
      };

      if (existingSettings) {
        // If settings exist, update them
        const [updated] = await db
          .update(settings)
          .set(settingsToUpsert)
          .where(eq(settings.userId, settingsData.userId))
          .returning();
        return updated;
      } else {
        // If no settings exist, insert new ones
        const [inserted] = await db
          .insert(settings)
          .values(settingsToUpsert)
          .returning();
        return inserted;
      }
    } catch (error) {
      console.error('Failed to upsert settings:', error);
      throw error;
    }
  }
  async updateInvoiceReceipt(id: number, receiptUrl: string): Promise<Invoice> {
    console.log(`Updating receipt URL for invoice ${id}:`, receiptUrl);
    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        stripeReceiptUrl: receiptUrl,
        status: 'paid' // Also update status to paid when receipt is added
      })
      .where(eq(invoices.id, id))
      .returning();

    if (!updatedInvoice) {
      throw new Error(`Failed to update receipt URL for invoice ${id}`);
    }

    return updatedInvoice;
  }
}

// Export a single instance of DatabaseStorage
export const storage = new DatabaseStorage();