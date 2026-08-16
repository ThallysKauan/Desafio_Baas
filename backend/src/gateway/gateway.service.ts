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
    if (current && await this.isDefaultAccountForNonDemoUser(userId, current)) {
      await this.gatewayAccounts.update({ id: current.id }, {
        document: null,
        password: null,
        customerCode: null,
        storeKey: null,
        accessToken: null
      });
    } else if (current?.accessToken) {
      return current.accessToken;
    }
    return this.loginGateway(userId);
  }

  async loginGateway(userId: string) {
    const account = await this.gatewayAccounts.findOne({ where: { userId } });
    const user = await this.getUser(userId);
    const isDemo = user?.email === 'admin@demo.com';
    const defaultDocument = this.config.get<string>('GATEWAY_DOCUMENT');
    const defaultPassword = this.config.get<string>('GATEWAY_PASSWORD');
    
    let document = account?.document;
    let password = account?.password;

    if (account && !isDemo && this.matchesDefaultCredentials(account, defaultDocument, defaultPassword)) {
      await this.gatewayAccounts.update({ id: account.id }, {
        document: null,
        password: null,
        customerCode: null,
        storeKey: null,
        accessToken: null
      });
      document = undefined;
      password = undefined;
    }

    if (isDemo && (!document || !password)) {
      document = defaultDocument;
      password = defaultPassword;
    }

    if (!document || !password) {
      throw new InternalServerErrorException('Configure suas credenciais do Gateway no final da página para visualizar seu saldo e transações.');
    }

    const { data } = await this.gatewayRequest(() =>
      firstValueFrom(this.http.post(`${this.baseUrl}/auth/login`, { document, password }))
    );

    const token = data.access_token || data.accessToken || data.token;
    if (!token) {
      throw new InternalServerErrorException('Gateway não retornou access token');
    }

    await this.gatewayAccounts.save({
      id: account?.id,
      userId,
      document,
      password,
      accessToken: token,
      customerCode: data.CodigoCliente || data.codigoCliente || this.config.get('GATEWAY_CUSTOMER_CODE'),
      storeKey: data.ChaveLoja || data.chaveLoja || this.config.get('GATEWAY_STORE_KEY')
    });

    return token;
  }

  async saveCredentials(userId: string, dto: { document: string; password: string }) {
    let account = await this.gatewayAccounts.findOne({ where: { userId } });
    if (!account) {
      account = this.gatewayAccounts.create({ userId });
    }
    account.document = dto.document;
    account.password = dto.password;
    account.accessToken = null; // force re-login with new credentials
    await this.gatewayAccounts.save(account);
    await this.loginGateway(userId);
    return { success: true, message: 'Credenciais do gateway atualizadas com sucesso' };
  }

  async getCredentials(userId: string) {
    const account = await this.gatewayAccounts.findOne({ where: { userId } });
    const user = await this.getUser(userId);
    const isDemo = user?.email === 'admin@demo.com';
    const isDefaultForNonDemo = account ? await this.isDefaultAccountForNonDemoUser(userId, account) : false;
    const isConfigured = Boolean(!isDefaultForNonDemo && (account?.document || (isDemo && this.config.get('GATEWAY_DOCUMENT'))));
    return {
      document: account?.document && !isDefaultForNonDemo ? `${account.document.substring(0, 3)}***` : (isDemo ? 'Configurado (padrão demo)' : ''),
      isConfigured
    };
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

  private async getUser(userId: string) {
    return this.gatewayAccounts.manager.findOne('User' as any, { where: { id: userId } }) as Promise<{ email?: string } | null>;
  }

  private async isDefaultAccountForNonDemoUser(userId: string, account: GatewayAccount) {
    const user = await this.getUser(userId);
    return user?.email !== 'admin@demo.com'
      && this.matchesDefaultCredentials(
        account,
        this.config.get<string>('GATEWAY_DOCUMENT'),
        this.config.get<string>('GATEWAY_PASSWORD')
      );
  }

  private matchesDefaultCredentials(account: GatewayAccount, defaultDocument?: string, defaultPassword?: string) {
    return Boolean(
      defaultDocument
      && defaultPassword
      && account.document === defaultDocument
      && account.password === defaultPassword
    );
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
