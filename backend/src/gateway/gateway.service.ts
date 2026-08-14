import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { GatewayAccount } from '../common/entities/gateway-account.entity';

@Injectable()
export class GatewayService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectRepository(GatewayAccount)
    private readonly gatewayAccounts: Repository<GatewayAccount>
  ) {
    this.baseUrl = this.config.get('GATEWAY_BASE_URL', 'https://api.branchpay.com.br/api');
  }

  async getAccessToken(userId: string) {
    const current = await this.gatewayAccounts.findOne({ where: { userId } });
    if (current?.accessToken) {
      return current.accessToken;
    }
    return this.loginGateway(userId);
  }

  async loginGateway(userId: string) {
    const document = this.config.get<string>('GATEWAY_DOCUMENT');
    const password = this.config.get<string>('GATEWAY_PASSWORD');

    if (!document || !password) {
      throw new InternalServerErrorException('Credenciais do gateway não configuradas no .env');
    }

    const { data } = await this.gatewayRequest(() =>
      firstValueFrom(this.http.post(`${this.baseUrl}/auth/login`, { document, password }))
    );

    const token = data.access_token || data.accessToken || data.token;
    if (!token) {
      throw new InternalServerErrorException('Gateway não retornou access token');
    }

    const account = await this.gatewayAccounts.findOne({ where: { userId } });
    await this.gatewayAccounts.save({
      id: account?.id,
      userId,
      accessToken: token,
      document: this.config.get('GATEWAY_DOCUMENT'),
      customerCode: data.CodigoCliente || data.codigoCliente || this.config.get('GATEWAY_CUSTOMER_CODE'),
      storeKey: data.ChaveLoja || data.chaveLoja || this.config.get('GATEWAY_STORE_KEY')
    });

    return token;
  }

  async getFees(brand?: string) {
    const { data } = await this.gatewayRequest(() =>
      firstValueFrom(this.http.get(`${this.baseUrl}/fees`, { params: brand ? { brand } : undefined }))
    );
    return data;
  }

  async createPixPayment(userId: string, payload: Record<string, unknown>) {
    return this.postWithAuth(userId, '/payments/pix', payload);
  }

  async createCardPayment(userId: string, payload: Record<string, unknown>) {
    return this.postWithAuth(userId, '/payments/card', payload);
  }

  async getWallet(userId: string) {
    return this.getWithAuth(userId, '/wallet');
  }

  async getWalletTransactions(userId: string, params: Record<string, unknown>) {
    return this.getWithAuth(userId, '/wallet/transactions', params);
  }

  async createWithdrawal(userId: string, payload: Record<string, unknown>) {
    return this.postWithAuth(userId, '/withdrawals', payload);
  }

  async getWithdrawal(userId: string, gatewayWithdrawalId: string) {
    return this.getWithAuth(userId, `/withdrawals/${gatewayWithdrawalId}`);
  }

  async listWebhooks(userId: string) {
    return this.getWithAuth(userId, '/webhooks');
  }

  async createWebhook(userId: string, payload: { url: string; event: string }) {
    return this.postWithAuth(userId, '/webhooks', payload);
  }

  async deleteWebhook(userId: string, webhookId: string) {
    const token = await this.getAccessToken(userId);
    try {
      const { data } = await this.gatewayRequest(() =>
        firstValueFrom(this.http.delete(`${this.baseUrl}/webhooks/${webhookId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }))
      );
      return data;
    } catch (error) {
      if (!this.isUnauthorized(error)) throw error;
      const renewedToken = await this.renewAccessToken(userId);
      const { data } = await this.gatewayRequest(() =>
        firstValueFrom(this.http.delete(`${this.baseUrl}/webhooks/${webhookId}`, {
          headers: { Authorization: `Bearer ${renewedToken}` }
        }))
      );
      return data;
    }
  }

  private async getWithAuth(userId: string, path: string, params?: Record<string, unknown>) {
    const token = await this.getAccessToken(userId);
    try {
      return await this.authenticatedGet(path, token, params);
    } catch (error) {
      if (!this.isUnauthorized(error)) throw error;
      return this.authenticatedGet(path, await this.renewAccessToken(userId), params);
    }
  }

  private async postWithAuth(userId: string, path: string, payload: Record<string, unknown>) {
    const token = await this.getAccessToken(userId);
    try {
      return await this.authenticatedPost(path, token, payload);
    } catch (error) {
      if (!this.isUnauthorized(error)) throw error;
      return this.authenticatedPost(path, await this.renewAccessToken(userId), payload);
    }
  }

  private async authenticatedGet(path: string, token: string, params?: Record<string, unknown>) {
    const { data } = await this.gatewayRequest(() => firstValueFrom(this.http.get(`${this.baseUrl}${path}`, {
      params,
      headers: { Authorization: `Bearer ${token}` }
    })));
    return data;
  }

  private async authenticatedPost(path: string, token: string, payload: Record<string, unknown>) {
    const { data } = await this.gatewayRequest(() => firstValueFrom(this.http.post(`${this.baseUrl}${path}`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    })));
    return data;
  }

  private async renewAccessToken(userId: string) {
    await this.gatewayAccounts.update({ userId }, { accessToken: null });
    return this.loginGateway(userId);
  }

  private isUnauthorized(error: unknown) {
    if (!(error instanceof BadGatewayException)) return false;
    const response = error.getResponse() as { gatewayStatus?: number };
    return response.gatewayStatus === 401;
  }

  private async gatewayRequest<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      const maybeAxiosError = error as {
        response?: { status?: number; data?: { message?: string | string[]; error?: string } };
        message?: string;
      };
      const status = maybeAxiosError.response?.status;
      const data = maybeAxiosError.response?.data;
      const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;

      throw new BadGatewayException({
        message: message || maybeAxiosError.message || 'Falha ao comunicar com o gateway',
        gatewayStatus: status,
        gatewayError: data?.error
      });
    }
  }
}
