import sgMail from '@sendgrid/mail';

interface SendInvoiceEmailParams {
  to: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  paymentUrl: string;
}

export async function sendInvoiceEmail({
  to,
  invoiceNumber,
  amount,
  dueDate,
  paymentUrl,
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
      from: process.env.FROM_EMAIL || 'noreply@example.com',
      to,
      subject: `Invoice ${invoiceNumber} - Payment Required`,
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
    };

    await sgMail.send(msg);
    console.log(`Email sent successfully to ${to} for invoice ${invoiceNumber}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to send invoice email: ${error.message}`);
    }
    throw new Error('Failed to send invoice email');
  }
}