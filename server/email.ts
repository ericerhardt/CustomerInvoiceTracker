import sgMail from '@sendgrid/mail';

interface SendInvoiceEmailParams {
  to: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  paymentUrl: string;
  pdfBuffer?: Buffer;
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

    // Reset the API key to ensure we're using the latest one
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to,
      from: {
        email: process.env.SEND_FROM_EMAIL || 'eric.erhardt@e3dev.solutions',
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

    console.log('Attempting to send email to:', to);
    console.log('Using sender email:', process.env.SEND_FROM_EMAIL || 'eric.erhardt@e3dev.solutions');
    await sgMail.send(msg);
    console.log(`Email sent successfully to ${to} for invoice ${invoiceNumber}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    if (error instanceof Error) {
      const errorMessage = error.message;
      console.error('SendGrid Error Details:', errorMessage);

      if (errorMessage.includes('Forbidden')) {
        throw new Error('SendGrid API key is not authorized. Please verify your API key and sender email settings.');
      }

      throw new Error(`Failed to send invoice email: ${errorMessage}`);
    }
    throw new Error('Failed to send invoice email');
  }
}