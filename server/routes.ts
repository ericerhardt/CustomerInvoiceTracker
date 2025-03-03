import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import Stripe from "stripe";
import type { InvoiceItem } from "@shared/schema";
import express from "express";
import { users } from "@shared/schema";
import { db } from "./db";
import { sendInvoiceEmail } from "./email";
import PDFDocument from 'pdfkit';

// Helper function for generating PDF
async function generateInvoicePDF(items: InvoiceItem[], customer: any, invoice: any, settings: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      console.log('Starting PDF generation with data:', {
        itemsCount: items?.length,
        customerInfo: customer ? {
          name: customer.name,
          email: customer.email
        } : null,
        invoiceInfo: invoice ? {
          number: invoice.number,
          dueDate: invoice.dueDate
        } : null,
        settingsInfo: settings ? {
          companyName: settings.companyName,
          taxRate: settings.taxRate
        } : null
      });

      // Validate required data
      if (!items?.length) throw new Error('No invoice items provided');
      if (!invoice?.number) throw new Error('Invalid invoice number');
      if (!customer?.name) throw new Error('Invalid customer information');

      // Create a new PDF document
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4',
        info: {
          Title: `Invoice ${invoice.number}`,
          Author: settings?.companyName || 'Invoice System'
        }
      });

      // Create a buffer to store the PDF
      const chunks: Buffer[] = [];
      doc.on('data', chunk => {
        console.log('Received PDF chunk of size:', chunk.length);
        chunks.push(chunk);
      });

      doc.on('end', () => {
        const finalBuffer = Buffer.concat(chunks);
        console.log('PDF generation completed. Total size:', finalBuffer.length);
        resolve(finalBuffer);
      });

      doc.on('error', (error) => {
        console.error('PDFKit error:', error);
        reject(error);
      });

      // Add company information
      doc.fontSize(24).text('INVOICE', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12);

      // Company details
      doc.text(settings?.companyName || 'Your Company Name');
      doc.text(settings?.companyAddress || '');
      doc.text(settings?.companyEmail || '');
      doc.moveDown();

      // Invoice details
      doc.text(`Invoice Number: ${invoice.number}`);
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`);
      doc.moveDown();

      // Customer information
      doc.text('Bill To:');
      doc.text(customer.name);
      doc.text(customer.address || '');
      doc.text(customer.email);
      doc.moveDown();

      // Invoice items table
      const tableTop = doc.y;
      const itemX = 50;
      const quantityX = 300;
      const priceX = 400;
      const amountX = 500;

      // Draw table headers
      doc
        .fontSize(10)
        .text('Description', itemX, tableTop)
        .text('Quantity', quantityX, tableTop)
        .text('Price', priceX, tableTop)
        .text('Amount', amountX, tableTop);

      let y = tableTop + 20;

      // Table content
      let subtotal = 0;
      items.forEach(item => {
        const amount = Number(item.quantity) * Number(item.unitPrice);
        subtotal += amount;

        doc
          .fontSize(10)
          .text(item.description, itemX, y)
          .text(item.quantity.toString(), quantityX, y)
          .text(`$${Number(item.unitPrice).toFixed(2)}`, priceX, y)
          .text(`$${amount.toFixed(2)}`, amountX, y);

        y += 20;
      });

      // Add spacing
      y += 20;

      // Calculate totals
      const taxRate = settings?.taxRate ? Number(settings.taxRate) / 100 : 0.1;
      const tax = subtotal * taxRate;
      const total = subtotal + tax;

      // Display totals
      doc
        .fontSize(10)
        .text('Subtotal:', 400, y)
        .text(`$${subtotal.toFixed(2)}`, amountX, y);
      y += 20;

      doc
        .text(`Tax (${(taxRate * 100).toFixed(1)}%):`, 400, y)
        .text(`$${tax.toFixed(2)}`, amountX, y);
      y += 20;

      doc
        .fontSize(12)
        .text('Total:', 400, y)
        .text(`$${total.toFixed(2)}`, amountX, y);

      // Add payment terms
      y += 40;
      doc
        .fontSize(10)
        .text('Payment Terms:', itemX, y)
        .text('Please pay within 30 days of receiving this invoice.', itemX, y + 20);

      // Draw a line under the headers
      doc
        .moveTo(itemX, tableTop + 15)
        .lineTo(amountX + 50, tableTop + 15)
        .stroke();

      console.log('Finalizing PDF document');
      doc.end();

    } catch (error) {
      console.error('PDF generation failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      reject(error);
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create a separate router for the webhook endpoint
  const webhookRouter = express.Router();
  // Configure raw body handling specifically for webhook route
  webhookRouter.use(express.raw({ type: 'application/json' }));

  // Mount webhook router BEFORE auth middleware and other routes
  app.use('/webhook', webhookRouter);

  // Handle Stripe webhook
  webhookRouter.post("/", async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'];

      console.log('Webhook request received:', {
        method: req.method,
        path: req.path,
        headers: req.headers,
        bodyType: typeof req.body,
        isBuffer: Buffer.isBuffer(req.body),
        bodyLength: req.body ? req.body.length : 0
      });

      if (!sig) {
        console.error('Missing webhook signature');
        return res.status(400).send('Webhook signature missing');
      }

      // Get settings from first user (webhook doesn't have user context)
      const [firstUser] = await db.select().from(users).limit(1);
      if (!firstUser) {
        throw new Error('No users found to get Stripe settings');
      }

      const settings = await storage.getSettingsByUserId(firstUser.id);
      if (!settings?.stripeWebhookSecret) {
        throw new Error('Stripe webhook secret not configured in settings');
      }

      const stripeInstance = await getStripe(firstUser.id);

      let event;
      try {
        event = stripeInstance.webhooks.constructEvent(
          req.body,
          sig,
          settings.stripeWebhookSecret
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

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const invoiceId = session.metadata?.invoiceId;

          console.log('Processing checkout.session.completed:', {
            sessionId: session.id,
            invoiceId,
            metadata: session.metadata,
            paymentStatus: session.payment_status,
            paymentIntent: session.payment_intent
          });

          if (invoiceId) {
            try {
              // Add receipt URL parameter
              await storage.updateInvoiceStatus(
                parseInt(invoiceId),
                'paid',
                session.receipt_url || '' // Add the missing receipt URL parameter
              );
              console.log(`Successfully updated invoice ${invoiceId} status to paid (via checkout)`);
            } catch (updateError) {
              console.error(`Failed to update invoice ${invoiceId} status:`, updateError);
              throw updateError;
            }
          } else {
            console.warn('No invoiceId found in checkout session metadata');
          }
          break;
        }
        case 'charge.updated': {
          const session = event.data.object as Stripe.Charge;
          break;
        }
        case 'charge.succeeded': {
          const session = event.data.object as Stripe.Charge;
          break;
        }
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const latestCharge = paymentIntent.latest_charge?.toString();

          const charge = await stripeInstance.charges.retrieve(latestCharge!, {
            expand: ['data.payment_intent', 'data.reciept_url']
          });

          await storage.getInvoice(19).then((invoice) => {
            if (invoice) {
              console.log(`update Invoice: ${invoice.id}`);
              storage.updateInvoiceReceipt(invoice.id, charge.receipt_url!);
            }
          });;
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

  // Add test endpoint for PDF generation
  app.get('/api/test-pdf', async (req, res) => {
    try {
      console.log('Testing PDF generation...');
      const testData = {
        items: [{
          description: 'Test Item',
          quantity: 1,
          unitPrice: '10.00'
        }],
        customer: {
          name: 'Test Customer',
          email: 'test@example.com',
          address: '123 Test St'
        },
        invoice: {
          number: 'TEST-001',
          dueDate: new Date(),
        },
        settings: {
          companyName: 'Test Company',
          companyAddress: '456 Company St',
          companyEmail: 'company@example.com',
          taxRate: '10.00'
        }
      };

      const pdfBuffer = await generateInvoicePDF(
        testData.items,
        testData.customer,
        testData.invoice,
        testData.settings
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=test.pdf');
      res.send(pdfBuffer);
    } catch (error) {
      console.error('PDF test endpoint failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({
        error: 'PDF generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add this public endpoint before setupAuth(app)
  app.get("/api/public/invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) {
        console.log(`Invoice not found: ${req.params.id}`);
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const items = await storage.getInvoiceItems(invoice.id);
      const customer = await storage.getCustomer(invoice.customerId);
      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' });
      }

      res.json({
        invoice: {
          ...invoice,
          items,
          customer: {
            name: customer.name,
            email: customer.email,
            address: customer.address
          }
        }
      });
    } catch (error) {
      console.error('Error fetching public invoice:', error);
      res.status(500).json({
        message: 'Failed to fetch invoice',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Setup auth middleware AFTER webhook route
  setupAuth(app);

  // Customers
  app.get("/api/customers", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const customers = await storage.getCustomersByUserId(req.user.id);
    res.json(customers);
  });

  app.post("/api/customers", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const customer = await storage.createCustomer({
        ...req.body,
        userId: req.user.id,
      });
      res.status(201).json(customer);
    } catch (error) {
      console.error('Failed to create customer:', error);
      res.status(500).json({
        message: 'Failed to create customer',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
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
        error: error instanceof Error ? error.message : 'Unknown error'
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
        error: error instanceof Error ? error.message : 'Unknown error'
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
    if (customer?.userId !== req.user.id) return res.sendStatus(403);

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

      let paymentLink;
      // Only create Stripe payment link for credit card payments
      if (invoice.paymentMethod === 'credit_card') {
        const stripeInstance = await getStripe(req.user.id);
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

        const baseUrl = process.env.PUBLIC_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
        const redirectUrl = new URL(`/thank-you?invoice=${invoice.id}`, baseUrl).toString();
        console.log('Creating new payment link with redirect URL:', redirectUrl);

        paymentLink = await stripeInstance.paymentLinks.create({
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
        await storage.updateInvoicePayment(
          invoice.id,
          paymentLink.id,
          paymentLink.url
        );
      }

      // Get customer and settings for PDF generation
      const customer = await storage.getCustomer(invoice.customerId);
      const settings = await storage.getSettingsByUserId(req.user.id);

      // Generate PDF
      let pdfBuffer: Buffer | undefined;
      try {
        const items = await storage.getInvoiceItems(invoice.id);
        pdfBuffer = await generateInvoicePDF(items, customer, invoice, settings);
        console.log('Generated PDF buffer:', !!pdfBuffer, 'size:', pdfBuffer?.length);
        if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
          console.error('PDF generation produced invalid buffer');
        }
      } catch (pdfError) {
        console.error('Failed to generate PDF:', pdfError);
      }

      // Send email to customer if settings are configured
      if (customer && settings?.sendGridApiKey) {
        try {
          await sendInvoiceEmail({
            to: customer.email,
            invoiceNumber: invoice.number,
            amount: Number(invoice.amount),
            dueDate: invoice.dueDate,
            paymentUrl: paymentLink?.url,
            pdfBuffer,
            userId: req.user.id,
            paymentMethod: invoice.paymentMethod as 'credit_card' | 'check'
          });
        } catch (emailError) {
          console.error('Failed to send invoice email:', emailError);
          return res.status(200).json({
            ...invoice,
            emailError: emailError instanceof Error ? emailError.message : 'Unknown email error'
          });
        }
      }

      res.status(201).json(invoice);
    } catch (error) {
      console.error('Invoice creation failed:', error);
      res.status(500).json({
        message: 'Failed to create invoice',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Update resend invoice endpoint to use settings consistently
  app.post("/api/invoices/:id/resend", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      console.log('Processing resend invoice request:', {
        invoiceId: req.params.id,
        userId: req.user.id
      });

      const invoice = await storage.getInvoice(parseInt(req.params.id));
      if (!invoice) {
        console.error('Invoice not found:', req.params.id);
        return res.sendStatus(404);
      }
      if (invoice.userId !== req.user.id) return res.sendStatus(403);

      // Get invoice items and customer
      const items = await storage.getInvoiceItems(invoice.id);
      const customer = await storage.getCustomer(invoice.customerId);
      const settings = await storage.getSettingsByUserId(req.user.id);

      if (!customer) {
        console.error('Customer not found for invoice:', invoice.id);
        throw new Error('Customer not found');
      }

      console.log('Retrieved customer and settings:', {
        customerId: customer.id,
        hasSettings: !!settings,
        customerEmail: customer.email,
        hasStripeKey: !!settings?.stripeSecretKey,
        hasSendGridKey: !!settings?.sendGridApiKey
      });

      let paymentLink;
      // Only handle Stripe for credit card payments
      if (invoice.paymentMethod === 'credit_card') {
        const stripeInstance = await getStripe(req.user.id);
        // Deactivate old payment link if it exists
        if (invoice.stripePaymentId) {
          try {
            await stripeInstance.paymentLinks.update(invoice.stripePaymentId, {
              active: false
            });
            console.log('Deactivated old payment link:', invoice.stripePaymentId);
          } catch (stripeError) {
            console.error('Failed to deactivate old payment link:', stripeError);
          }
        }

        // Create new payment link
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

        const baseUrl = process.env.PUBLIC_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
        const redirectUrl = new URL(`/thank-you?invoice=${invoice.id}`, baseUrl).toString();

        console.log('Creating new payment link with redirect URL:', redirectUrl);

        paymentLink = await stripeInstance.paymentLinks.create({
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

        console.log('Created new payment link:', paymentLink.url);

        // Update invoice with new payment link
        await storage.updateInvoicePayment(
          invoice.id,
          paymentLink.id,
          paymentLink.url
        );
      }

      // Generate PDF
      let pdfBuffer: Buffer | undefined;
      try {
        const items = await storage.getInvoiceItems(invoice.id);
        pdfBuffer = await generateInvoicePDF(items, customer, invoice, settings);
        console.log('Generated PDF buffer:', !!pdfBuffer, 'size:', pdfBuffer?.length);
        if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
          console.error('PDF generation produced invalid buffer');
        }
      } catch (pdfError) {
        console.error('Failed to generate PDF:', pdfError);
      }

      // Send email to customer if settings are configured
      if (settings?.sendGridApiKey) {
        try {
          await sendInvoiceEmail({
            to: customer.email,
            invoiceNumber: invoice.number,
            amount: Number(invoice.amount),
            dueDate: invoice.dueDate,
            paymentUrl: paymentLink?.url,
            pdfBuffer,
            userId: req.user.id,
            paymentMethod: invoice.paymentMethod as 'credit_card' | 'check'
          });
          console.log('Successfully sent invoice email');
          res.json(invoice);
        } catch (emailError) {
          console.error('Failed to send invoice email:', emailError);
          res.status(200).json({
            ...invoice,
            emailError: emailError instanceof Error ? emailError.message : 'Unknown email error'
          });
        }
      } else {
        console.log('SendGrid API key not configured, skipping email send');
        res.status(200).json({
          ...invoice,
          emailError: 'SendGrid API key not configured'
        });
      }
    } catch (error) {
      console.error('Failed to resend invoice:', error);
      res.status(500).json({
        message: 'Failed to resend invoice',
        error: error instanceof Error ? error.message : 'Unknown error'
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

      // Get existing settings first
      const existingSettings = await storage.getSettingsByUserId(req.user.id);

      // Merge existing settings with new settings
      const updatedSettings = {
        ...existingSettings,
        ...req.body,
        userId: req.user.id,
      };

      // Basic format validation
      if (updatedSettings.sendGridApiKey && !updatedSettings.sendGridApiKey.startsWith('SG.')) {
        throw new Error('Invalid SendGrid API key format. Must start with "SG."');
      }

      // Validate Stripe key format if provided
      if (updatedSettings.stripeSecretKey && !updatedSettings.stripeSecretKey.startsWith('sk_')) {
        throw new Error('Invalid Stripe secret key format. Must start with "sk_"');
      }

      // Ensure all required fields are present
      const settings = await storage.upsertSettings({
        companyName: updatedSettings.companyName || '',
        companyAddress: updatedSettings.companyAddress || '',
        companyEmail: updatedSettings.companyEmail || '',
        stripeSecretKey: updatedSettings.stripeSecretKey || '',
        stripePublicKey: updatedSettings.stripePublicKey || '',
        stripeWebhookSecret: updatedSettings.stripeWebhookSecret || null,
        sendGridApiKey: updatedSettings.sendGridApiKey || '',
        sendGridFromEmail: updatedSettings.sendGridFromEmail || '',
        resetLinkUrl: updatedSettings.resetLinkUrl || 'http://localhost:5001/reset-password',
        taxRate: updatedSettings.taxRate || '10.00',
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

//Helper function for getStripe
async function getStripe(userId: number) {
  const settings = await storage.getSettingsByUserId(userId);
  if (!settings?.stripeSecretKey) {
    throw new Error("Stripe secret key not configured. Please add it in settings.");
  }

  if (!settings.stripeSecretKey.startsWith('sk_')) {
    throw new Error("Invalid Stripe secret key format. Must start with 'sk_'");
  }

  return new Stripe(settings.stripeSecretKey, {
    apiVersion: '2024-12-18.acacia' as any,
    typescript: true,
  });
}