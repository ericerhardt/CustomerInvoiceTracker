import sgMail from '@sendgrid/mail';

interface SendInvoiceEmailParams {
  to: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  paymentUrl: string;
  pdfBuffer?: Buffer;
}

interface SendPasswordResetEmailParams {
  to: string;
  resetToken: string;
  resetUrl: string;
}

export async function sendInvoiceEmail({
  to,
  invoiceNumber,
  amount,
  dueDate,
  paymentUrl,
  pdfBuffer,
}: SendInvoiceEmailParams) {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long'
  }).format(new Date(dueDate));

  try {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SendGrid API key is not configured');
    }

    if (!process.env.SENDGRID_API_KEY.startsWith('SG.')) {
      throw new Error('Invalid SendGrid API key format. Must start with "SG."');
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@invoicegenerator.com',
        name: 'Invoice System'
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

    console.log('Attempting to send invoice email...', { to, invoiceNumber });
    const [response] = await sgMail.send(msg);
    console.log('SendGrid API Response:', response.statusCode, response.headers);
    console.log(`Invoice email sent successfully to ${to} for invoice ${invoiceNumber}`);
    return true;
  } catch (error) {
    console.error('Failed to send invoice email:', error);
    if (error instanceof Error) {
      console.error('SendGrid Error Details:', error.message);
      if (error.message.includes('Invalid API key')) {
        throw new Error('Invalid SendGrid API key. Please check your configuration.');
      }
      if (error.message.includes('forbidden')) {
        throw new Error('SendGrid API key does not have permission to send emails. Please check your API key permissions.');
      }
      if (error.message.includes('The from address does not match a verified Sender Identity')) {
        throw new Error(`Email sender ${process.env.SENDGRID_FROM_EMAIL || 'noreply@invoicegenerator.com'} not verified with SendGrid. Please verify your sender email in SendGrid dashboard.`);
      }
      throw error;
    }
    throw new Error('Failed to send invoice email');
  }
}

export async function sendPasswordResetEmail({
  to,
  resetToken,
  resetUrl,
}: SendPasswordResetEmailParams) {
  try {
    console.log('Starting password reset email process for:', to);

    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SendGrid API key is not configured');
    }

    if (!process.env.SENDGRID_API_KEY.startsWith('SG.')) {
      throw new Error('Invalid SendGrid API key format. Must start with "SG."');
    }

    if (!process.env.SENDGRID_FROM_EMAIL) {
      throw new Error('SendGrid sender email is not configured');
    }

    console.log('Configuring SendGrid with API key...');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const senderEmail = process.env.SENDGRID_FROM_EMAIL;
    console.log('Using sender email:', senderEmail);

    const msg = {
      to,
      from: {
        email: senderEmail,
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
    console.log('Email configuration:', {
      to,
      from: msg.from.email,
      subject: msg.subject
    });

    const [response] = await sgMail.send(msg);
    console.log('SendGrid API Response:', {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body
    });

    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log('Password reset email sent successfully');
      return true;
    } else {
      throw new Error(`Unexpected status code: ${response.statusCode}`);
    }
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    if (error instanceof Error) {
      console.error('SendGrid Error Details:', error.message);

      if (error.message.includes('The from address does not match a verified Sender Identity')) {
        throw new Error(`Email sender ${process.env.SENDGRID_FROM_EMAIL} not verified with SendGrid. Please verify your sender email in SendGrid dashboard.`);
      }
      if (error.message.includes('Invalid API key')) {
        throw new Error('Invalid SendGrid API key. Please check your configuration.');
      }
      if (error.message.includes('forbidden')) {
        throw new Error('SendGrid API key does not have permission to send emails. Please check your API key permissions.');
      }

      throw error;
    }
    throw new Error('Failed to send password reset email');
  }
}