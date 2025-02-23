import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import Stripe from "stripe";
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { InvoicePDF } from '../client/src/components/InvoicePDF';
import type { InvoiceItem } from "@shared/schema";
import express from "express";
import { users } from "@shared/schema";
import { db } from "./db";

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Stripe with empty config - will be updated when needed
  let stripe: Stripe | null = null;

  // Helper function to get or create Stripe instance
  async function getStripe(userId: number) {
    const settings = await storage.getSettingsByUserId(userId);
    if (!settings?.stripeSecretKey) {
      throw new Error("Stripe secret key not configured. Please add it in settings.");
    }

    if (!settings.stripeSecretKey.startsWith('sk_')) {
      throw new Error("Invalid Stripe secret key format. Must start with 'sk_'");
    }

    stripe = new Stripe(settings.stripeSecretKey, {
      apiVersion: '2024-12-18.acacia' as any, // Cast to any to avoid TypeScript error
      typescript: true,
    });

    return stripe;
  }

  // Create a separate router for the webhook endpoint
  const webhookRouter = express.Router();

  // Configure raw body handling specifically for webhook route
  webhookRouter.use(express.raw({ type: 'application/json' }));

  webhookRouter.post("/", async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'];

      // Enhanced logging for webhook details
      console.log('Webhook request received:', {
        method: req.method,
        path: req.path,
        headers: req.headers,
        bodyType: typeof req.body,
        isBuffer: Buffer.isBuffer(req.body),
        bodyLength: req.body ? req.body.length : 0
      });

      if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
        console.error('Missing webhook requirements:', {
          signature: !!sig,
          secret: !!process.env.STRIPE_WEBHOOK_SECRET
        });
        return res.status(400).send('Webhook signature or secret missing');
      }


      // Get settings from first user (webhook doesn't have user context)
      const [firstUser] = await db.select().from(users).limit(1);
      if (!firstUser) {
        throw new Error('No users found to get Stripe settings');
      }

      const stripeInstance = await getStripe(firstUser.id);

      let event;
      try {
        event = stripeInstance.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );

        console.log('Successfully constructed webhook event:', {
          type: event.type,
          id: event.id
        });
      } catch (err) {
        console.error('Failed to construct webhook event:', {
          error: err instanceof Error ? err.message : 'Unknown error',
          signatureHeader: sig
        });
        return res.status(400).send(`Webhook signature verification failed`);
      }

      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const invoiceId = session.metadata?.invoiceId;
          if (invoiceId) {
            await storage.updateInvoiceStatus(parseInt(invoiceId), 'paid');
            console.log(`Updated invoice ${invoiceId} status to paid`);
          }
          break;
        }
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const invoiceId = paymentIntent.metadata?.invoiceId;
          if (invoiceId) {
            await storage.updateInvoiceStatus(parseInt(invoiceId), 'paid');
            console.log(`Updated invoice ${invoiceId} status to paid`);
          }
          break;
        }
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      const error = err as Error;
      console.error('Webhook processing failed:', {
        error: error.message,
        stack: error.stack
      });
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }
  });

  // Mount webhook router before ANY other middleware or route
  app.use('/webhook', webhookRouter);

  // Setup auth and other middleware AFTER webhook route
  setupAuth(app);

  // Customers
  app.get("/api/customers", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const customers = await storage.getCustomersByUserId(req.user.id);
    res.json(customers);
  });

  app.post("/api/customers", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const customer = await storage.createCustomer({
      ...req.body,
      userId: req.user.id,
    });
    res.status(201).json(customer);
  });

  app.patch("/api/customers/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const customer = await storage.getCustomer(parseInt(req.params.id));
      if (!customer) return res.sendStatus(404);
      if (customer.userId !== req.user.id) return res.sendStatus(403);

      const updatedCustomer = await storage.updateCustomer(customer.id, {
        ...req.body,
        userId: req.user.id,
      });
      res.json(updatedCustomer);
    } catch (error) {
      console.error('Failed to update customer:', error);
      res.status(500).json({
        message: 'Failed to update customer',
        error: (error as Error).message
      });
    }
  });

  app.delete("/api/customers/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const customer = await storage.getCustomer(parseInt(req.params.id));
      if (!customer) return res.sendStatus(404);
      if (customer.userId !== req.user.id) return res.sendStatus(403);

      await storage.deleteCustomer(customer.id);
      res.sendStatus(204);
    } catch (error) {
      console.error('Failed to delete customer:', error);
      res.status(500).json({
        message: 'Failed to delete customer',
        error: (error as Error).message
      });
    }
  });

  // Invoices
  app.get("/api/invoices", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const invoices = await storage.getInvoicesByUserId(req.user.id);
    res.json(invoices);
  });

  app.get("/api/invoices/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const invoice = await storage.getInvoice(parseInt(req.params.id));
    if (!invoice) return res.sendStatus(404);
    if (invoice.userId !== req.user.id) return res.sendStatus(403);

    const items = await storage.getInvoiceItems(invoice.id);
    const customer = await storage.getCustomer(invoice.customerId);

    res.json({ ...invoice, items, customer });
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) return res.sendStatus(404);
      if (invoice.userId !== req.user.id) return res.sendStatus(403);

      const { items, ...invoiceData } = req.body;

      // Update invoice
      const updatedInvoice = await storage.updateInvoice(invoice.id, {
        ...invoiceData,
        userId: req.user.id,
      });

      // Update invoice items
      await storage.deleteInvoiceItems(invoice.id);
      for (const item of items) {
        await storage.createInvoiceItem({
          ...item,
          invoiceId: invoice.id,
        });
      }

      res.json(updatedInvoice);
    } catch (error) {
      console.error('Failed to update invoice:', error);
      res.status(500).json({
        message: 'Failed to update invoice',
        error: (error as Error).message
      });
    }
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) return res.sendStatus(404);
      if (invoice.userId !== req.user.id) return res.sendStatus(403);

      // If there's a Stripe payment link, try to deactivate it
      if (invoice.stripePaymentId) {
        try {
          const stripeInstance = await getStripe(req.user.id);
          await stripeInstance.paymentLinks.update(invoice.stripePaymentId, {
            active: false
          });
        } catch (stripeError) {
          // Log the error but continue with deletion
          console.error('Failed to deactivate Stripe payment link:', stripeError);
        }
      }

      // Delete the invoice and its items from the database
      await storage.deleteInvoice(invoice.id);

      // Return success status
      res.sendStatus(204);
    } catch (error) {
      console.error('Failed to delete invoice:', error);
      res.status(500).json({
        message: 'Failed to delete invoice',
        error: (error as Error).message
      });
    }
  });

  app.post("/api/invoices", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const stripeInstance = await getStripe(req.user.id);
      const { items, ...invoiceData } = req.body;
      const invoice = await storage.createInvoice({
        ...invoiceData,
        userId: req.user.id,
      });

      // Create invoice items
      for (const item of items) {
        await storage.createInvoiceItem({
          ...item,
          invoiceId: invoice.id,
        });
      }

      // Create Stripe payment link with proper metadata
      const price = await stripeInstance.prices.create({
        currency: 'usd',
        unit_amount: Math.round(Number(invoice.amount) * 100),
        product_data: {
          name: `Invoice ${invoice.number}`,
          metadata: {
            invoiceId: invoice.id.toString(),
          },
        },
      });

      // Ensure we have a complete URL for the redirect
      const baseUrl = process.env.PUBLIC_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const redirectUrl = new URL(`/invoice/${invoice.id}`, baseUrl).toString();

      const paymentLink = await stripeInstance.paymentLinks.create({
        line_items: [{
          price: price.id,
          quantity: 1,
        }],
        metadata: {
          invoiceId: invoice.id.toString(),
        },
        after_completion: {
          type: 'redirect',
          redirect: { url: redirectUrl }
        }
      });

      // Update invoice with Stripe payment details
      const updatedInvoice = await storage.updateInvoicePayment(
        invoice.id,
        paymentLink.id,
        paymentLink.url
      );

      // Get customer and settings for PDF generation
      const customer = await storage.getCustomer(invoice.customerId);
      const settings = await storage.getSettingsByUserId(req.user.id);
      let pdfBuffer: Buffer | undefined;

      pdfBuffer = await generateInvoicePDF(items, customer, invoice, settings);


      // Send email to customer using settings
      if (customer && settings?.sendGridApiKey) {
        if (!settings.sendGridApiKey.startsWith('SG.')) {
          throw new Error('Invalid SendGrid API key format');
        }
        process.env.SENDGRID_API_KEY = settings.sendGridApiKey;
        await sendInvoiceEmail({
          to: customer.email,
          invoiceNumber: invoice.number,
          amount: Number(invoice.amount),
          dueDate: invoice.dueDate,
          paymentUrl: paymentLink.url,
          pdfBuffer,
          userId: req.user.id
        });
      }

      res.status(201).json(updatedInvoice);
    } catch (error) {
      console.error('Invoice creation failed:', error);
      res.status(500).json({
        message: 'Failed to create invoice',
        error: (error as Error).message
      });
    }
  });

  app.post("/api/invoices/:id/resend", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const stripeInstance = await getStripe(req.user.id);
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) return res.sendStatus(404);
      if (invoice.userId !== req.user.id) return res.sendStatus(403);

      // Get invoice items and customer
      const items = await storage.getInvoiceItems(invoice.id);
      const customer = await storage.getCustomer(invoice.customerId);
      const settings = await storage.getSettingsByUserId(req.user.id);

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Deactivate old payment link if it exists
      if (invoice.stripePaymentId) {
        try {
          await stripeInstance.paymentLinks.update(invoice.stripePaymentId, {
            active: false
          });
        } catch (stripeError) {
          console.error('Failed to deactivate old payment link:', stripeError);
          // Continue with creating new link even if deactivation fails
        }
      }

      // Create new Stripe payment link
      const price = await stripeInstance.prices.create({
        currency: 'usd',
        unit_amount: Math.round(Number(invoice.amount) * 100),
        product_data: {
          name: `Invoice ${invoice.number}`,
          metadata: {
            invoiceId: invoice.id.toString(),
          },
        },
      });

      // Ensure we have a complete URL for the redirect
      const baseUrl = process.env.PUBLIC_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const redirectUrl = new URL(`/invoice/${invoice.id}`, baseUrl).toString();

      const paymentLink = await stripeInstance.paymentLinks.create({
        line_items: [{
          price: price.id,
          quantity: 1,
        }],
        metadata: {
          invoiceId: invoice.id.toString(),
        },
        after_completion: {
          type: 'redirect',
          redirect: { url: redirectUrl }
        }
      });

      // Update invoice with new payment link
      const updatedInvoice = await storage.updateInvoicePayment(
        invoice.id,
        paymentLink.id,
        paymentLink.url
      );

      let pdfBuffer: Buffer | undefined;
      pdfBuffer = await generateInvoicePDF(items, customer, invoice, settings);

      // Send email with PDF attachment
      if (settings?.sendGridApiKey) {
        if (!settings.sendGridApiKey.startsWith('SG.')) {
          throw new Error('Invalid SendGrid API key format. Must start with "SG."');
        }

        process.env.SENDGRID_API_KEY = settings.sendGridApiKey;
        await sendInvoiceEmail({
          to: customer.email,
          invoiceNumber: invoice.number,
          amount: Number(invoice.amount),
          dueDate: invoice.dueDate,
          paymentUrl: paymentLink.url,
          pdfBuffer,
          userId: req.user.id
        });
      }

      res.json(updatedInvoice);
    } catch (error) {
      console.error('Failed to resend invoice:', error);
      res.status(500).json({
        message: 'Failed to resend invoice',
        error: (error as Error).message
      });
    }
  });

  app.delete("/api/invoices/:id/payment-link", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const stripeInstance = await getStripe(req.user.id);
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) return res.sendStatus(404);
      if (invoice.userId !== req.user.id) return res.sendStatus(403);

      // Expire the payment link in Stripe if it exists
      if (invoice.stripePaymentId) {
        try {
          await stripeInstance.paymentLinks.update(invoice.stripePaymentId, { active: false });
        } catch (stripeError) {
          console.error('Failed to expire Stripe payment link:', stripeError);
          // Continue even if expiration fails
        }
      }

      // Update invoice to remove payment link
      const updatedInvoice = await storage.updateInvoicePayment(
        invoice.id,
        '',  // Empty string instead of null
        ''   // Empty string instead of null
      );

      res.json(updatedInvoice);
    } catch (error) {
      console.error('Failed to delete payment link:', error);
      res.status(500).json({
        message: 'Failed to delete payment link',
        error: (error as Error).message
      });
    }
  });


  // Settings endpoints
  app.get("/api/settings", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const settings = await storage.getSettingsByUserId(req.user.id);
      res.json(settings || {});
    } catch (error) {
      console.error('Failed to get settings:', error);
      res.status(500).json({
        message: 'Failed to get settings',
        error: (error as Error).message
      });
    }
  });

  app.post("/api/settings", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      console.log('Received settings update request:', {
        body: req.body,
        userId: req.user.id
      });

      // Basic format validation only
      if (req.body.sendGridApiKey && !req.body.sendGridApiKey.startsWith('SG.')) {
        throw new Error('Invalid SendGrid API key format. Must start with "SG."');
      }

      // Validate Stripe key format if provided
      if (req.body.stripeSecretKey && !req.body.stripeSecretKey.startsWith('sk_')) {
        throw new Error('Invalid Stripe secret key format. Must start with "sk_"');
      }

      const settings = await storage.upsertSettings({
        ...req.body,
        userId: req.user.id,
      });

      console.log('Settings updated successfully:', {
        userId: req.user.id,
        updatedFields: Object.keys(req.body)
      });

      res.json(settings);
    } catch (error) {
      console.error('Failed to update settings:', error);
      res.status(500).json({
        message: 'Failed to update settings',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function for generating PDF
async function generateInvoicePDF(items: InvoiceItem[], customer: any, invoice: any, settings: any) {
  try {
    const pdfDocument = React.createElement(InvoicePDF, {
      items: items.map(item => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice)
      })),
      customer,
      dueDate: invoice.dueDate.toISOString(),
      invoiceNumber: invoice.number,
      settings: settings ? {
        companyName: settings.companyName || '',
        companyAddress: settings.companyAddress || '',
        companyEmail: settings.companyEmail || '',
        taxRate: Number(settings.taxRate),
      } : undefined
    });

    return await renderToBuffer(pdfDocument);
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    return undefined;
  }
}

async function sendInvoiceEmail(options: any) {
    //Implementation for sending email
}