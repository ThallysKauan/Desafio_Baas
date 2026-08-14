import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { CheckoutLink } from '../common/entities/checkout-link.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendCheckoutLink(checkout: CheckoutLink) {
    if (!checkout.customerEmail) return;
    const baseUrl = this.config.get<string>('APP_PUBLIC_URL');
    if (!baseUrl) {
      this.logger.warn('APP_PUBLIC_URL ausente; e-mail do checkout não enviado');
      return;
    }
    const url = `${baseUrl.replace(/\/$/, '')}/checkout/${checkout.id}`;
    await this.send(checkout.customerEmail, `Link de pagamento - ${checkout.description}`, `Acesse ${url} para pagar ${this.money(checkout.amountCents)} via Pix ou cartão.`);
  }

  async sendPaymentResult(checkout: CheckoutLink) {
    if (!checkout.customerEmail) return;
    const baseUrl = this.config.get<string>('APP_PUBLIC_URL', '');
    const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/checkout/${checkout.id}` : '';
    const approved = checkout.status === 'APPROVED';
    const text = approved
      ? `Pagamento de ${this.money(checkout.amountCents)} aprovado.`
      : checkout.status === 'DENIED'
        ? `Pagamento não aprovado: ${checkout.failureReason || 'não autorizado'}. Você pode tentar novamente pelo mesmo link: ${url}`
        : checkout.emv
          ? `Seu Pix de ${this.money(checkout.amountCents)} foi gerado. Acesse ${url} para visualizar o QR Code e concluir o pagamento.`
          : `Pagamento recebido e aguardando confirmação. Status: ${checkout.status}.`;
    await this.send(checkout.customerEmail, `Atualização do pagamento - ${checkout.description}`, text);
  }

  private async send(to: string, subject: string, text: string) {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn(`SMTP não configurado; e-mail para ${to} não enviado`);
      return;
    }
    const port = Number(this.config.get('SMTP_PORT', 587));
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') }
    });
    await transporter.sendMail({ from: this.config.get<string>('SMTP_FROM', 'pagamentos@stonevest.local'), to, subject, text });
  }

  private money(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  }
}
