import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    const host = process.env.SMTP_HOST || (user ? 'smtp.zoho.com' : undefined);
    const port = Number(process.env.SMTP_PORT) || 465;
    const secure = process.env.SMTP_SECURE === undefined ? port === 465 : process.env.SMTP_SECURE === 'true';

    // Create transporter
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    if (!host || !user || !pass) {
      console.warn('\n==========================================');
      console.warn('⚠️  EMAIL SERVICE: DEVELOPMENT FALLBACK MODE');
      console.warn('SMTP credentials not fully configured.');
      console.warn('Emails will be logged to console instead of sent.');
      console.warn('==========================================\n');
    } else {
      // Verify connection only if configured
      this.verifyConnection();
    }
  }

  private async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('✅ Email service connected successfully');
    } catch (error) {
      console.error('❌ Email service verification failed:', error instanceof Error ? error.message : error);
    }
  }

  async sendOtpEmail(email: string, otp: string, purpose: string = 'registration'): Promise<void> {
    const subject = `Your OTP for ${purpose} - Netwin Tournament`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333; text-align: center;">Netwin Tournament</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #333; margin-bottom: 15px;">Your verification code</h3>
          <p style="color: #666; margin-bottom: 20px;">
            Enter this code to complete your ${purpose}:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 8px; padding: 15px 25px; background: white; border-radius: 8px; border: 2px solid #e9ecef;">
              ${otp}
            </span>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            This code will expire in 5 minutes. If you didn't request this code, please ignore this email.
          </p>
        </div>
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
          <p style="color: #999; font-size: 12px;">
            © 2025 Netwin Tournament. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    const host = process.env.SMTP_HOST || (user ? 'smtp.zoho.com' : undefined);

    const mailOptions = {
      from: {
        name: 'Netwin Tournament',
        address: user || 'noreply@netwin.com'
      },
      to: email,
      subject,
      html,
    };

    // Development Fallback: If no SMTP host or credentials, log the OTP to console and return
    if (!host || host === 'localhost' || !user || !pass) {
      console.log('\n==========================================');
      console.log('📬 DEVELOPMENT OTP FALLBACK');
      console.log(`To: ${email}`);
      console.log(`From: ${mailOptions.from.address}`);
      console.log(`OTP: ${otp}`);
      console.log(`Purpose: ${purpose}`);
      console.log('==========================================\n');
      return;
    }
    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Nodemailer Error Details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      } else {
        console.error('Unknown Nodemailer Error:', error);
      }
      throw error;
    }
  }
}

export const emailService = new EmailService();
