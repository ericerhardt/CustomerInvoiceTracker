import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { sendInvoiceEmail } from "./email";
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is required");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    
    const { items, ...invoiceData } = req.body;
    const invoice = await storage.createInvoice({
      ...invoiceData,
      userId: req.user.id,
    });

    for (const item of items) {
      await storage.createInvoiceItem({
        ...item,
        invoiceId: invoice.id,
      });
    }

    // Create Stripe payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Invoice ${invoice.number}`,
          },
          unit_amount: Math.round(invoice.amount * 100),
        },
        quantity: 1,
      }],
      metadata: {
        invoiceId: invoice.id.toString(),
      },
    });

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
        amount: invoice.amount,
        dueDate: invoice.dueDate,
        paymentUrl: paymentLink.url,
      });
    }

    res.status(201).json(updatedInvoice);
  });

  app.post("/api/webhook/stripe", async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET as string
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const invoiceId = paymentIntent.metadata.invoiceId;
      
      if (invoiceId) {
        await storage.updateInvoiceStatus(parseInt(invoiceId), 'paid');
      }
    }

    res.json({ received: true });
  });

  const httpServer = createServer(app);
  return httpServer;
}
