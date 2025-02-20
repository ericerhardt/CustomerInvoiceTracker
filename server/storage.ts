import { User, Customer, Invoice, InvoiceItem, InsertUser, InsertCustomer, InsertInvoice, InsertInvoiceItem } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

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

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private customers: Map<number, Customer>;
  private invoices: Map<number, Invoice>;
  private invoiceItems: Map<number, InvoiceItem>;
  private currentId: { [key: string]: number };
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.customers = new Map();
    this.invoices = new Map();
    this.invoiceItems = new Map();
    this.currentId = { users: 1, customers: 1, invoices: 1, invoiceItems: 1 };
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId.users++;
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getCustomersByUserId(userId: number): Promise<Customer[]> {
    return Array.from(this.customers.values()).filter(
      (customer) => customer.userId === userId,
    );
  }

  async createCustomer(customer: InsertCustomer & { userId: number }): Promise<Customer> {
    const id = this.currentId.customers++;
    const newCustomer = { ...customer, id };
    this.customers.set(id, newCustomer);
    return newCustomer;
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async createInvoice(invoice: InsertInvoice & { userId: number }): Promise<Invoice> {
    const id = this.currentId.invoices++;
    const number = `INV-${String(id).padStart(6, '0')}`;
    const newInvoice = { 
      ...invoice, 
      id, 
      number,
      status: 'pending',
      createdAt: new Date(),
      stripePaymentId: null,
      stripePaymentUrl: null
    };
    this.invoices.set(id, newInvoice);
    return newInvoice;
  }

  async getInvoicesByUserId(userId: number): Promise<Invoice[]> {
    return Array.from(this.invoices.values()).filter(
      (invoice) => invoice.userId === userId,
    );
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    return this.invoices.get(id);
  }

  async updateInvoiceStatus(id: number, status: string): Promise<Invoice> {
    const invoice = await this.getInvoice(id);
    if (!invoice) throw new Error('Invoice not found');
    const updatedInvoice = { ...invoice, status };
    this.invoices.set(id, updatedInvoice);
    return updatedInvoice;
  }

  async updateInvoicePayment(id: number, paymentId: string, paymentUrl: string): Promise<Invoice> {
    const invoice = await this.getInvoice(id);
    if (!invoice) throw new Error('Invoice not found');
    const updatedInvoice = { 
      ...invoice, 
      stripePaymentId: paymentId,
      stripePaymentUrl: paymentUrl
    };
    this.invoices.set(id, updatedInvoice);
    return updatedInvoice;
  }

  async createInvoiceItem(item: InsertInvoiceItem & { invoiceId: number }): Promise<InvoiceItem> {
    const id = this.currentId.invoiceItems++;
    const newItem = { ...item, id };
    this.invoiceItems.set(id, newItem);
    return newItem;
  }

  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    return Array.from(this.invoiceItems.values()).filter(
      (item) => item.invoiceId === invoiceId,
    );
  }
}

export const storage = new MemStorage();
