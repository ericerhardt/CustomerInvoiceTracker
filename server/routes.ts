import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { sendInvoiceEmail } from "./email";
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is required");
}

// Update Stripe instantiation with API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16', // Specify the latest stable API version
});

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

      // Create Stripe payment link
      let paymentLink;
      try {
        paymentLink = await stripe.paymentLinks.create({
          line_items: [{
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(Number(invoice.amount) * 100),
              product_data: {
                name: `Invoice ${invoice.number}`,
                description: 'Payment for invoice',
              },
            },
            quantity: 1,
          }],
          metadata: {
            invoiceId: invoice.id.toString(),
          },
        });
      } catch (error) {
        console.error('Stripe payment link creation failed:', error);
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

  const httpServer = createServer(app);
  return httpServer;
}