import { pgTable, text, serial, integer, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
  userId: integer("user_id").notNull(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  number: text("number").notNull(),
  customerId: integer("customer_id").notNull(),
  userId: integer("user_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  dueDate: timestamp("due_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  stripePaymentId: text("stripe_payment_id"),
  stripePaymentUrl: text("stripe_payment_url"),
});

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
});

export const insertCustomerSchema = createInsertSchema(customers).pick({
  name: true,
  email: true,
  address: true,
  phone: true,
}).extend({
  phone: z.string().nullable(),
});

export const insertInvoiceSchema = createInsertSchema(invoices)
  .pick({
    customerId: true,
    amount: true,
    dueDate: true,
  })
  .extend({
    dueDate: z.coerce.date(),
    amount: z.coerce.number().positive(),
  });

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems)
  .pick({
    description: true,
    quantity: true,
    unitPrice: true,
  })
  .extend({
    quantity: z.coerce.number().int().positive(),
    unitPrice: z.coerce.number().positive(),
  });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  companyName: text("company_name").notNull(),
  companyAddress: text("company_address").notNull(),
  companyEmail: text("company_email").notNull(),
  stripeSecretKey: text("stripe_secret_key").notNull(),
  stripePublicKey: text("stripe_public_key").notNull(),
  sendGridApiKey: text("sendgrid_api_key").notNull(),
  sendGridFromEmail: text("sendgrid_from_email").notNull(),
  resetLinkUrl: text("reset_link_url").notNull().default("http://localhost:5000/reset-password"),
  taxRate: decimal("tax_rate").notNull().default('10'), 
});

export const insertSettingsSchema = createInsertSchema(settings)
  .pick({
    companyName: true,
    companyAddress: true,
    companyEmail: true,
    stripeSecretKey: true,
    stripePublicKey: true,
    sendGridApiKey: true,
    sendGridFromEmail: true,
    resetLinkUrl: true,
    taxRate: true,
  })
  .extend({
    taxRate: z.coerce.number().min(0).max(100),
    resetLinkUrl: z.string().url("Must be a valid URL"),
  });

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;