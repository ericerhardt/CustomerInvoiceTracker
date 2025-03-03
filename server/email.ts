import sgMail from '@sendgrid/mail';
import { storage } from './storage';

interface SendInvoiceEmailParams {
  to: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  paymentUrl?: string;
  pdfBuffer?: Buffer;
  userId: number;
  paymentMethod: 'credit_card' | 'check';
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
  paymentMethod,
}: SendInvoiceEmailParams) {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long'
  }).format(new Date(dueDate));

  try {
    console.log('Starting invoice email process:', {
      to,
      invoiceNumber,
      hasPDF: !!pdfBuffer,
      pdfSize: pdfBuffer?.length || 0
    });

    // Get settings from database
    const settings = await storage.getSettingsByUserId(userId);
    if (!settings?.sendGridApiKey) {
      throw new Error('SendGrid API key not configured in settings');
    }
    if (!settings?.sendGridFromEmail) {
      throw new Error('SendGrid sender email not configured in settings');
    }

    const apiKey = settings.sendGridApiKey;
    const fromEmail = settings.sendGridFromEmail;
    const companyName = settings.companyName || 'Invoice System';

    console.log('Configuring SendGrid with API key for:', fromEmail);
    sgMail.setApiKey(apiKey);

    const paymentInstructions = paymentMethod === 'check'
      ? `Please make your check payable to "${companyName}" and mail it to:\n${settings.companyAddress}`
      : paymentUrl ? `Pay now: ${paymentUrl}` : 'Payment link will be sent separately';

    // Prepare email
    const msg: any = {
      to,
      from: {
        email: fromEmail,
        name: companyName
      },
      subject: `Invoice ${invoiceNumber} - Payment Required`,
      text: `Amount due: ${formattedAmount}\nDue date: ${formattedDate}\n\n${paymentInstructions}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Invoice ${invoiceNumber}</h2>
          <p>Amount due: ${formattedAmount}</p>
          <p>Due date: ${formattedDate}</p>
          ${paymentMethod === 'credit_card' && paymentUrl
            ? `<a href="${paymentUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 16px;">Pay Now</a>`
            : `<div style="margin-top: 16px; padding: 12px; background-color: #f5f5f5; border-radius: 4px;">
                <p style="margin: 0;">Please make check payable to:</p>
                <p style="margin: 8px 0; font-weight: bold;">${companyName}</p>
                <p style="margin: 0;">Mail to:</p>
                <p style="margin: 8px 0;">${settings.companyAddress}</p>
              </div>`
          }
        </div>
      `
    };

    // Add PDF attachment if buffer exists
    if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
      try {
        const base64Content = pdfBuffer.toString('base64');
        if (!base64Content) {
          throw new Error("Failed to convert buffer to base64");
        }

        msg.attachments = [{
          content: base64Content,
          filename: `invoice-${invoiceNumber}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }];
        console.log('Added PDF attachment to email, size:', pdfBuffer.length);
      } catch (base64Error) {
        console.error('Failed to convert PDF to base64:', base64Error);
      }
    } else {
      console.warn('No PDF buffer available for attachment', {
        bufferExists: !!pdfBuffer,
        isBuffer: pdfBuffer ? Buffer.isBuffer(pdfBuffer) : false,
        bufferLength: pdfBuffer ? pdfBuffer.length : 0
      });
    }

    // Send email
    const [response] = await sgMail.send(msg);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log('Email sent successfully:', {
        to,
        invoiceNumber,
        hasPDFAttachment: !!msg.attachments
      });
      return true;
    } else {
      throw new Error(`Unexpected SendGrid status code: ${response.statusCode}`);
    }
  } catch (error) {
    console.error('Failed to send invoice email:', error);
    throw error;
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

    // Get settings from database
    const settings = await storage.getSettingsByUserId(userId);
    if (!settings?.sendGridApiKey) {
      throw new Error('SendGrid API key not configured in settings');
    }
    if (!settings?.sendGridFromEmail) {
      throw new Error('SendGrid sender email not configured in settings');
    }
    if (!settings.sendGridApiKey.startsWith('SG.')) {
      throw new Error('Invalid SendGrid API key format in settings. Must start with "SG."');
    }

    const apiKey = settings.sendGridApiKey;
    const fromEmail = settings.sendGridFromEmail;

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

    console.log('Sending password reset email...', { to });
    const [response] = await sgMail.send(msg);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log('Password reset email sent successfully:', {
        statusCode: response.statusCode,
        to
      });
      return true;
    } else {
      throw new Error(`Unexpected SendGrid status code: ${response.statusCode}`);
    }
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    if (error instanceof Error) {
      console.error('SendGrid Error Details:', error.message);
      if (error.message.includes('authorization') || error.message.includes('forbidden')) {
        throw new Error('SendGrid API key in settings is invalid or has insufficient permissions');
      }
      if (error.message.includes('verified Sender Identity')) {
        throw new Error('Email sender in settings not verified with SendGrid. Please verify your sender email.');
      }
    }
    throw new Error('Failed to send password reset email');
  }
}