import sgMail from '@sendgrid/mail';
import { storage } from './storage';

interface SendInvoiceEmailParams {
  to: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  paymentUrl: string;
  pdfBuffer?: Buffer;
  userId: number;
}

interface SendPasswordResetEmailParams {
  to: string;
  resetToken: string;
  resetUrl: string;
  userId: number;
}

export async function sendInvoiceEmail({
  to,
  invoiceNumber,
  amount,
  dueDate,
  paymentUrl,
  pdfBuffer,
  userId,
}: SendInvoiceEmailParams) {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long'
  }).format(new Date(dueDate));

  try {
    // Get settings from database first
    const settings = await storage.getSettingsByUserId(userId);

    // Use API key from settings or environment variable
    const apiKey = settings?.sendGridApiKey || process.env.SENDGRID_API_KEY;
    const fromEmail = settings?.sendGridFromEmail || process.env.SENDGRID_FROM_EMAIL;
    const companyName = settings?.companyName || 'Invoice System';

    if (!apiKey) {
      throw new Error('SendGrid API key not configured');
    }

    if (!fromEmail) {
      throw new Error('SendGrid sender email not configured');
    }

    console.log('Configuring SendGrid with API key...');
    sgMail.setApiKey(apiKey);

    console.log('Sending invoice email with parameters:', {
      to,
      from: fromEmail,
      invoiceNumber,
      hasAttachment: !!pdfBuffer
    });

    const msg = {
      to,
      from: {
        email: fromEmail,
        name: companyName
      },
      subject: `Invoice ${invoiceNumber} - Payment Required`,
      text: `Amount due: ${formattedAmount}\nDue date: ${formattedDate}\nPay now: ${paymentUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Invoice ${invoiceNumber}</h2>
          <p>Amount due: ${formattedAmount}</p>
          <p>Due date: ${formattedDate}</p>
          <p>
            <a href="${paymentUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 16px;">
              Pay Now
            </a>
          </p>
        </div>
      `,
      attachments: pdfBuffer ? [
        {
          content: pdfBuffer.toString('base64'),
          filename: `invoice-${invoiceNumber}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ] : undefined,
    };

    const [response] = await sgMail.send(msg);
    console.log('SendGrid API Response:', response.statusCode, response.headers);
    return true;
  } catch (error) {
    console.error('Failed to send invoice email:', error);
    if (error instanceof Error) {
      console.error('SendGrid Error Details:', error.message);
      throw new Error(`Failed to send invoice email: ${error.message}`);
    }
    throw new Error('Failed to send invoice email');
  }
}

export async function sendPasswordResetEmail({
  to,
  resetToken,
  resetUrl,
  userId,
}: SendPasswordResetEmailParams) {
  try {
    console.log('Starting password reset email process for:', to);

    // Get settings from database first
    const settings = await storage.getSettingsByUserId(userId);

    // Determine API key and sender email with fallback to environment variables
    const apiKey = settings?.sendGridApiKey || process.env.SENDGRID_API_KEY;
    const fromEmail = settings?.sendGridFromEmail || process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey) {
      throw new Error('SendGrid API key not configured');
    }

    if (!fromEmail) {
      throw new Error('SendGrid sender email not configured');
    }

    console.log('Configuring SendGrid with API key...');
    sgMail.setApiKey(apiKey);

    const msg = {
      to,
      from: {
        email: fromEmail,
        name: 'Invoice System Password Reset'
      },
      subject: 'Password Reset Request',
      text: `Click this link to reset your password: ${resetUrl}?token=${resetToken}\nThis link will expire in 24 hours.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Click the button below to reset your password:</p>
          <p>
            <a href="${resetUrl}?token=${resetToken}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 16px;">
              Reset Password
            </a>
          </p>
          <p style="margin-top: 16px; color: #666;">
            This link will expire in 24 hours. If you didn't request this reset, please ignore this email.
          </p>
        </div>
      `,
    };

    console.log('Attempting to send password reset email...');
    const [response] = await sgMail.send(msg);
    console.log('SendGrid API Response:', response.statusCode);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    if (error instanceof Error) {
      console.error('SendGrid Error Details:', error.message);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
    throw new Error('Failed to send password reset email');
  }
}