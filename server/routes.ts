import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { sendInvoiceEmail } from "./email";
import Stripe from "stripe";

// Validate Stripe secret key and format
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  throw new Error("STRIPE_SECRET_KEY environment variable is required");
}
if (!stripeKey.startsWith('sk_')) {
  throw new Error("Invalid Stripe secret key format. Must start with 'sk_'");
}

// Initialize Stripe with proper configuration
const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
  typescript: true,
  maxNetworkRetries: 2, // Add retry logic
});

// Verify Stripe configuration on startup
(async function validateStripeConfig() {
  try {
    // Make a test API call to verify the key
    await stripe.paymentMethods.list({ limit: 1 });
    console.log('Stripe configuration validated successfully');
  } catch (error) {
    console.error('Stripe configuration error:', error);
    if (error instanceof Stripe.errors.StripeError) {
      console.error('Stripe Error Type:', error.type);
      console.error('Stripe Error Message:', error.message);
    }
    throw error;
  }
})();

export async function registerRoutes(app: Express): Promise<Server> {
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

  app.post("/api/invoices", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
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
        const price = await stripe.prices.create({
          currency: 'usd',
          unit_amount: Math.round(Number(invoice.amount) * 100),
          product_data: {
            name: `Invoice ${invoice.number}`,
          },
        });

        // Then create payment link with the price ID
        paymentLink = await stripe.paymentLinks.create({
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

      // Send email to customer
      const customer = await storage.getCustomer(invoice.customerId);
      if (customer) {
        await sendInvoiceEmail({
          to: customer.email,
          invoiceNumber: invoice.number,
          amount: Number(invoice.amount),
          dueDate: invoice.dueDate,
          paymentUrl: paymentLink.url,
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
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) return res.sendStatus(404);
      if (invoice.userId !== req.user.id) return res.sendStatus(403);

      // Create new Stripe payment link
      const price = await stripe.prices.create({
        currency: 'usd',
        unit_amount: Math.round(Number(invoice.amount) * 100),
        product_data: {
          name: `Invoice ${invoice.number}`,
        },
      });

      const paymentLink = await stripe.paymentLinks.create({
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

      // Resend email to customer
      const customer = await storage.getCustomer(invoice.customerId);
      if (customer) {
        await sendInvoiceEmail({
          to: customer.email,
          invoiceNumber: invoice.number,
          amount: Number(invoice.amount),
          dueDate: invoice.dueDate,
          paymentUrl: paymentLink.url,
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
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) return res.sendStatus(404);
      if (invoice.userId !== req.user.id) return res.sendStatus(403);

      // Delete the payment link in Stripe if it exists
      if (invoice.stripePaymentId) {
        await stripe.paymentLinks.del(invoice.stripePaymentId);
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
      const event = stripe.webhooks.constructEvent(
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

  // Add this endpoint to handle settings updates
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
      const settings = await storage.upsertSettings({
        ...req.body,
        userId: req.user.id,
      });

      // Update stripe configuration
      if (settings.stripeSecretKey !== process.env.STRIPE_SECRET_KEY) {
        process.env.STRIPE_SECRET_KEY = settings.stripeSecretKey;
        stripe.setApiKey(settings.stripeSecretKey);
      }

      // Update SendGrid configuration if needed
      if (settings.sendGridApiKey !== process.env.SENDGRID_API_KEY) {
        process.env.SENDGRID_API_KEY = settings.sendGridApiKey;
      }

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