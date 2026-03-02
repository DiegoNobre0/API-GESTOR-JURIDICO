import * as nodemailer from 'nodemailer';

export class MailService {
  private transporter;

  constructor() {

    console.log("Credenciais SMTP:", {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD ? "********" : "VAZIO",
      host: process.env.SMTP_HOST
    });
   this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false, // true para 465, false para outras portas
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async   sendEmail(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: `"RCS Gestão Jurídica" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
      });
      console.log(`📧 E-mail enviado com sucesso para: ${to}`);
    } catch (error) {
      console.error('❌ Erro ao enviar e-mail:', error);
    }
  }
}