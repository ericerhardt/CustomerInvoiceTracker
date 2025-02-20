import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { sendInvoiceEmail } from "./email";
import Stripe from "stripe";
import sgMail from '@sendgrid/mail';
import ReactPDF from '@react-pdf/renderer';
import { InvoicePDF } from '../client/src/components/InvoicePDF';

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

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

    if (!stripe || stripe._config.apiKey !== settings.stripeSecretKey) {
      stripe = new Stripe(settings.stripeSecretKey, {
        apiVersion: '2023-10-16',
        typescript: true,
      });
    }

    return stripe;
  }

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

      // Create Stripe payment link with better error handling
      let paymentLink;
      try {
        // First create a price
        const price = await stripeInstance.prices.create({
          currency: 'usd',
          unit_amount: Math.round(Number(invoice.amount) * 100),
          product_data: {
            name: `Invoice ${invoice.number}`,
          },
        });

        // Then create payment link with the price ID
        paymentLink = await stripeInstance.paymentLinks.create({
          line_items: [{
            price: price.id,
            quantity: 1,
          }],
          metadata: {
            invoiceId: invoice.id.toString(),
          },
        });
      } catch (error) {
        console.error('Stripe payment link creation failed:', error);
        if (error instanceof Stripe.errors.StripeError) {
          console.error('Stripe Error Type:', error.type);
          console.error('Stripe Error Message:', error.message);
        }
        throw new Error('Failed to create payment link');
      }

      // Update invoice with Stripe payment details
      const updatedInvoice = await storage.updateInvoicePayment(
        invoice.id,
        paymentLink.id,
        paymentLink.url
      );

      // Send email to customer using settings
      const customer = await storage.getCustomer(invoice.customerId);
      if (customer) {
        const settings = await storage.getSettingsByUserId(req.user.id);
        if (settings?.sendGridApiKey) {
          process.env.SENDGRID_API_KEY = settings.sendGridApiKey;
          await sendInvoiceEmail({
            to: customer.email,
            invoiceNumber: invoice.number,
            amount: Number(invoice.amount),
            dueDate: invoice.dueDate,
            paymentUrl: paymentLink.url,
          });
        }
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

      // Create new Stripe payment link
      const price = await stripeInstance.prices.create({
        currency: 'usd',
        unit_amount: Math.round(Number(invoice.amount) * 100),
        product_data: {
          name: `Invoice ${invoice.number}`,
        },
      });

      const paymentLink = await stripeInstance.paymentLinks.create({
        line_items: [{
          price: price.id,
          quantity: 1,
        }],
        metadata: {
          invoiceId: invoice.id.toString(),
        },
      });

      // Update invoice with new payment link
      const updatedInvoice = await storage.updateInvoicePayment(
        invoice.id,
        paymentLink.id,
        paymentLink.url
      );

      // Generate PDF
      try {
        const pdfBuffer = await ReactPDF.renderToBuffer(
          InvoicePDF({
            items,
            customer,
            dueDate: invoice.dueDate.toISOString(),
            invoiceNumber: invoice.number,
            settings: {
              companyName: settings?.companyName || '',
              companyAddress: settings?.companyAddress || '',
              companyEmail: settings?.companyEmail || '',
            },
          })
        );

        // Send email with PDF attachment
        if (settings?.sendGridApiKey) {
          process.env.SENDGRID_API_KEY = settings.sendGridApiKey;
          await sendInvoiceEmail({
            to: customer.email,
            invoiceNumber: invoice.number,
            amount: Number(invoice.amount),
            dueDate: invoice.dueDate,
            paymentUrl: paymentLink.url,
            pdfBuffer,
          });
        }
      } catch (pdfError) {
        console.error('Failed to generate PDF:', pdfError);
        // Continue without PDF if generation fails
        if (settings?.sendGridApiKey) {
          process.env.SENDGRID_API_KEY = settings.sendGridApiKey;
          await sendInvoiceEmail({
            to: customer.email,
            invoiceNumber: invoice.number,
            amount: Number(invoice.amount),
            dueDate: invoice.dueDate,
            paymentUrl: paymentLink.url,
          });
        }
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

      // Delete the payment link in Stripe if it exists
      if (invoice.stripePaymentId) {
        await stripeInstance.paymentLinks.del(invoice.stripePaymentId);
      }

      // Update invoice to remove payment link
      const updatedInvoice = await storage.updateInvoicePayment(
        invoice.id,
        null,
        null
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

  app.post("/api/webhook/stripe", async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).send('Webhook signature or secret missing');
    }

    try {
      const stripeInstance = stripe || new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2023-10-16',
        typescript: true,
      });

      const event = stripeInstance.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const invoiceId = paymentIntent.metadata?.invoiceId;

        if (invoiceId) {
          await storage.updateInvoiceStatus(parseInt(invoiceId), 'paid');
        }
      }

      res.json({ received: true });
    } catch (err) {
      const error = err as Error;
      console.error('Webhook Error:', error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
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

      res.json(settings);
    } catch (error) {
      console.error('Failed to update settings:', error);
      res.status(500).json({
        message: 'Failed to update settings',
        error: (error as Error).message
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}