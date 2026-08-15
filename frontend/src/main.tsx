import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Copy,
  CreditCard,
  Landmark,
  Link as LinkIcon,
  Loader2,
  LogIn,
  LogOut,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Wifi,
  Check,
  LockKeyhole,
  Filter,
  Radio,
  Trash2,
  ReceiptText,
  ExternalLink,
  AlertCircle,
  Wallet
} from 'lucide-react';
import './styles.css';

const apiBase = '/api';

type Checkout = {
  id: string;
  description: string;
  amountCents: number;
  method: 'PIX' | 'CARD' | 'BOTH';
  status: string;
  externalReference: string;
  emv?: string;
  qrCodeBase64?: string;
  installments?: number;
  feePercent?: string;
  failureReason?: string;
  attempts?: number;
  customerEmail?: string;
};

type GatewayTransaction = Record<string, unknown>;
type GatewayWebhook = { id?: string; event?: string; type?: string; url?: string; active?: boolean };
type Withdrawal = { id: string; amountCents: number; pixKey: string; status: string; gatewayWithdrawalId?: string; createdAt?: string };

function money(cents?: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
}

function statusLabel(status?: string) {
  const value = (status || 'PENDING').toUpperCase();
  const labels: Record<string, string> = {
    PENDING: 'Pendente',
    OPEN: 'Aguardando cliente',
    APPROVED: 'Aprovado',
    DENIED: 'Negado',
    EXPIRED: 'Expirado',
    CANCELLED: 'Cancelado'
  };
  return labels[value] || value;
}

function walletValue(wallet: Record<string, unknown> | null) {
  if (!wallet) return 'Indisponivel';
  const candidate = wallet.balance ?? wallet.balanceCents ?? wallet.amount ?? wallet.availableBalance;
  return typeof candidate === 'number' ? money(candidate) : 'Conectado';
}

function qrCodeSrc(value?: string) {
  if (!value) return '';
  return value.startsWith('data:image') ? value : `data:image/png;base64,${value}`;
}

function cardDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 16);
}

function formattedCardNumber(value: string) {
  const digits = cardDigits(value);
  const filled = `${digits}${'•'.repeat(16 - digits.length)}`;
  return filled.match(/.{1,4}/g)?.join(' ') || '•••• •••• •••• ••••';
}

function cardBrand(value: string) {
  const digits = cardDigits(value);
  if (/^4/.test(digits)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'MASTERCARD';
  if (/^3[47]/.test(digits)) return 'AMEX';
  if (/^(636368|438935|504175|451416)/.test(digits)) return 'ELO';
  return 'CARD';
}

function checkoutUrl(id: string) {
  return `${window.location.origin}/checkout/${id}`;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('123456');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [wallet, setWallet] = useState<Record<string, unknown> | null>(null);
  const [transactions, setTransactions] = useState<unknown[]>([]);
  const [transactionFilters, setTransactionFilters] = useState({ status: '', type: '', limit: 20 });
  const [webhooks, setWebhooks] = useState<GatewayWebhook[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [webhookForm, setWebhookForm] = useState({ event: 'PAYMENT_PIX', url: `${window.location.origin}/api/webhooks/payment-pix` });
  const [createdLink, setCreatedLink] = useState('');
  const [form, setForm] = useState({
    description: 'Pedido teste',
    amountCents: 1990,
    method: 'BOTH',
    installments: 1,
    feePercent: 2.49,
    brand: 'VISA',
    payerDocument: '12345678901',
    cardNumber: '4111111111111111',
    cardHolder: 'Cliente Teste',
    expiryMonth: '12',
    expiryYear: '2030',
    cvv: '123'
  });
  const [withdrawal, setWithdrawal] = useState({ amountCents: 1000, pixKey: '' });

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);
  const approvedCount = checkouts.filter((item) => item.status === 'APPROVED').length;
  const pendingCount = checkouts.filter((item) => item.status === 'PENDING').length;

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${apiBase}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = Array.isArray(data.message)
        ? data.message.join(', ')
        : typeof data.message === 'object'
          ? data.message.message || JSON.stringify(data.message)
          : data.message;
      throw new Error(message || 'Erro inesperado');
    }
    return data;
  }

  async function login() {
    try {
      setLoading(true);
      const data = await request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem('token', data.accessToken);
      setToken(data.accessToken);
      setMessage('Sessao iniciada com sucesso.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro no login');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('token');
    setToken('');
    setCheckouts([]);
    setWallet(null);
    setTransactions([]);
  }

  async function loadDashboard() {
    if (!token) return;
    try {
      setLoading(true);
      const query = new URLSearchParams({ limit: String(transactionFilters.limit) });
      if (transactionFilters.status) query.set('status', transactionFilters.status);
      if (transactionFilters.type) query.set('type', transactionFilters.type);
      const [checkoutData, walletData, transactionData, webhookData, withdrawalData] = await Promise.all([
        request('/checkout-links', { headers }),
        request('/wallet', { headers }).catch((error) => ({ error: error.message })),
        request(`/wallet/transactions?${query}`, { headers }).catch(() => []),
        request('/gateway/webhooks', { headers }).catch(() => []),
        request('/withdrawals', { headers }).catch(() => [])
      ]);
      setCheckouts(checkoutData);
      setWallet(walletData);
      setTransactions(Array.isArray(transactionData) ? transactionData : transactionData.items || []);
      setWebhooks(Array.isArray(webhookData) ? webhookData : webhookData.items || webhookData.webhooks || []);
      setWithdrawals(Array.isArray(withdrawalData) ? withdrawalData : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  async function createGatewayWebhook() {
    try {
      setLoading(true);
      await request('/gateway/webhooks', { method: 'POST', headers, body: JSON.stringify(webhookForm) });
      setMessage('Webhook cadastrado no gateway.');
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao cadastrar webhook');
    } finally { setLoading(false); }
  }

  async function deleteGatewayWebhook(id: string) {
    try {
      setLoading(true);
      await request(`/gateway/webhooks/${id}`, { method: 'DELETE', headers });
      setMessage('Webhook removido.');
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao remover webhook');
    } finally { setLoading(false); }
  }

  async function createCheckout() {
    try {
      setLoading(true);
      const payload = {
        description: form.description,
        amountCents: Number(form.amountCents),
        method: form.method
      };
      const checkout = await request('/checkout-links', { method: 'POST', headers, body: JSON.stringify(payload) });
      setCreatedLink(checkoutUrl(checkout.id));
      setMessage('Link de pagamento criado.');
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao criar link');
    } finally {
      setLoading(false);
    }
  }

  async function createWithdrawal() {
    try {
      setLoading(true);
      await request('/withdrawals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ amountCents: Number(withdrawal.amountCents), pixKey: withdrawal.pixKey })
      });
      setMessage('Saque solicitado.');
      setWithdrawal((current) => ({ ...current, pixKey: '' }));
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao solicitar saque');
    } finally {
      setLoading(false);
    }
  }

  async function refreshWithdrawal(id: string) {
    try {
      setLoading(true);
      await request(`/withdrawals/${id}`, { headers });
      setMessage('Status do saque atualizado.');
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao consultar saque');
    } finally { setLoading(false); }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage('Codigo copiado.');
  }

  useEffect(() => {
    loadDashboard();
  }, [token]);


  if (!token) {
    return (
      <main className="auth-shell">
        <section className="auth-visual">
          <div className="brand-lockup">
            <span className="brand-mark"><Sparkles size={18} /></span>
            <span>StoneVest BaaS</span>
          </div>
          <h1>Carteira, checkout e gateway em um cockpit financeiro.</h1>
          <p>Painel BaaS conectado ao Lera Box para Pix, cartao, saques, extrato e conciliacao.</p>
          <div className="trust-row">
            <span><ShieldCheck size={16} /> Tokens no backend</span>
            <span><BadgeCheck size={16} /> MySQL proprio</span>
          </div>
        </section>

        <section className="login-card">
          <div>
            <span className="eyebrow">Acesso do lojista</span>
            <h2>Entrar no painel</h2>
          </div>
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="primary-action" onClick={login} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}
            Entrar
          </button>
          {message && <p className="message">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span>StoneVest BaaS</span>
        </div>
        <nav>
          <a className="active" href="#overview"><Wallet size={18} /> Visao geral</a>
          <a href="#checkout"><CreditCard size={18} /> Pagamentos</a>
          <a href="#transactions"><ReceiptText size={18} /> Transacoes</a>
          <a href="#webhooks"><Radio size={18} /> Webhooks</a>
          <a href="/docs"><Activity size={18} /> API Docs</a>
        </nav>
        <button className="quiet-action" onClick={logout}><LogOut size={17} /> Sair</button>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div>
            <span className="eyebrow">Gateway Lera Box</span>
            <h1>Central de pagamentos</h1>
          </div>
          <button className="secondary-action" onClick={loadDashboard} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
            Atualizar
          </button>
        </header>

        {message && <div className="notice"><Check size={16} />{message}</div>}

        <section className="metrics-grid">
          <Metric loading={loading && !checkouts.length} icon={<Wallet size={22} />} label="Carteira" value={walletValue(wallet)} detail="Saldo do gateway" />
          <Metric loading={loading && !checkouts.length} icon={<LinkIcon size={22} />} label="Links" value={String(checkouts.length)} detail={`${pendingCount} pendentes`} />
          <Metric loading={loading && !checkouts.length} icon={<CreditCard size={22} />} label="Aprovados" value={String(approvedCount)} detail={`${transactions.length} transacoes`} />
        </section>

        <section className="operations-grid checkout-studio" id="checkout">
          <div className="operation-card main-operation">
            <div className="section-heading">
              <span className="icon-chip"><QrCode size={18} /></span>
              <div>
                <h2>Criar cobranca</h2>
                <p>Gera link Pix ou cartao com referencia conciliavel.</p>
              </div>
            </div>

            <div className="method-switch" role="tablist" aria-label="Metodo de pagamento">
              <button className={form.method === 'BOTH' ? 'selected' : ''} onClick={() => setForm({ ...form, method: 'BOTH' })}><Wallet size={16} /> Pix e cartao</button>
              <button className={form.method === 'PIX' ? 'selected' : ''} onClick={() => setForm({ ...form, method: 'PIX' })}><QrCode size={16} /> Pix</button>
              <button className={form.method === 'CARD' ? 'selected' : ''} onClick={() => setForm({ ...form, method: 'CARD' })}><CreditCard size={16} /> Cartao</button>
            </div>

            <div className="link-builder-stage">
              <div className="stage-copy">
                <span className="live-status"><i></i> Checkout hospedado</span>
                <h3>Crie o link. O cliente conclui.</h3>
                <p>Os dados de CPF e cartao sao preenchidos pelo pagador em uma pagina publica e segura.</p>
              </div>
              <div className="link-builder-visual"><LinkIcon size={28}/><span>checkout seguro</span><strong>{money(Number(form.amountCents))}</strong><small>{form.method === 'BOTH' ? 'Pix ou cartao' : form.method}</small></div>
            </div>

            <div className="form-grid">
              <label>Descricao<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <label>Valor em centavos<input type="number" value={form.amountCents} onChange={(e) => setForm({ ...form, amountCents: Number(e.target.value) })} /></label>
            </div>

            <div className="payment-preview">
              <div>
                <span>Total da cobranca</span>
                <strong>{money(Number(form.amountCents))}</strong>
              </div>
              <div>
                <span>Metodo</span>
                <strong>{form.method === 'BOTH' ? 'Pix + Cartao' : form.method}</strong>
              </div>
              <div>
                <span>Dados do pagador</span>
                <strong>No checkout</strong>
              </div>
            </div>

            {createdLink && <div className="created-link"><div><span>Link pronto para compartilhar</span><strong>{createdLink}</strong></div><button className="icon-action" title="Copiar link" onClick={() => copyText(createdLink)}><Copy size={16}/></button><a className="icon-action" href={createdLink} target="_blank" title="Abrir checkout"><ExternalLink size={16}/></a></div>}

            <button className="primary-action" onClick={createCheckout} disabled={loading || form.description.trim().length < 3 || form.amountCents < 100}>
              {loading ? <Loader2 className="spin" size={18} /> : <LinkIcon size={18} />}
              {loading ? 'Criando checkout' : 'Criar link de pagamento'}
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="operation-card withdrawal-card">
            <div className="section-heading">
              <span className="icon-chip"><Landmark size={18} /></span>
              <div>
                <h2>Saque Pix</h2>
                <p>Solicita retirada para chave Pix externa.</p>
              </div>
            </div>
            <div className="withdrawal-balance"><span>Valor da retirada</span><strong>{money(withdrawal.amountCents)}</strong><small>Transferencia para chave Pix</small></div>
            <label>Valor em centavos<input type="number" min="100" step="100" value={withdrawal.amountCents} onChange={(e) => setWithdrawal({ ...withdrawal, amountCents: Number(e.target.value) })} /></label>
            <label>Chave Pix<input placeholder="CPF, e-mail, telefone ou chave aleatoria" value={withdrawal.pixKey} onChange={(e) => setWithdrawal({ ...withdrawal, pixKey: e.target.value })} /></label>
            <button className="secondary-action fill" onClick={createWithdrawal} disabled={loading || withdrawal.amountCents < 100 || !withdrawal.pixKey.trim()}><Banknote size={18} /> Solicitar saque</button>
            <div className="withdrawal-history">
              <div className="mini-heading"><span>Saques recentes</span><small>{withdrawals.length}</small></div>
              {withdrawals.slice(0, 3).map((item) => <article key={item.id}><div><strong>{money(item.amountCents)}</strong><small>{item.pixKey}</small></div><span className={`status-badge ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span><button className="refresh-mini" title="Consultar status" onClick={() => refreshWithdrawal(item.id)}><RefreshCcw size={13}/></button></article>)}
              {!withdrawals.length && <p>Nenhum saque solicitado.</p>}
            </div>
          </div>
        </section>

        <section className="history-card">
          <div className="history-head">
            <div>
              <span className="eyebrow">Conciliacao</span>
              <h2>Links de checkout</h2>
            </div>
            <span className="pill">{checkouts.length} registros</span>
          </div>

          {loading && checkouts.length === 0 ? (
            <div className="checkout-list">
              <div className="skeleton-row"></div>
              <div className="skeleton-row"></div>
              <div className="skeleton-row"></div>
            </div>
          ) : checkouts.length === 0 ? (
            <div className="empty-state">
              <QrCode size={28} />
              <strong>Nenhum link criado ainda</strong>
              <span>Crie uma cobranca para visualizar status, referencia externa e QR Pix.</span>
            </div>
          ) : (
            <div className="checkout-list">
              {checkouts.map((item) => (
                <article className="checkout-row" key={item.id}>
                  <div className="checkout-main">
                    <strong>{item.description}</strong>
                    <span>{checkoutUrl(item.id)}</span>
                    {item.failureReason && <small className="checkout-failure"><AlertCircle size={12}/>{item.failureReason}</small>}
                  </div>
                  <span className="method-badge">{item.method}</span>
                  <span>{money(item.amountCents)}</span>
                  <span className={`status-badge ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>
                  <div className="checkout-actions"><button className="icon-action" title="Copiar link" onClick={() => copyText(checkoutUrl(item.id))}><Copy size={16}/></button><a className="icon-action" title="Abrir checkout" href={checkoutUrl(item.id)} target="_blank"><ExternalLink size={16}/></a></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="history-card ledger-card" id="transactions">
          <div className="history-head ledger-head">
            <div>
              <span className="eyebrow">Fluxo financeiro</span>
              <h2>Extrato do gateway</h2>
            </div>
            <div className="ledger-filters">
              <label><Filter size={14} /> Status
                <select value={transactionFilters.status} onChange={(e) => setTransactionFilters({ ...transactionFilters, status: e.target.value })}>
                  <option value="">Todos</option><option value="APPROVED">Aprovados</option><option value="DENIED">Negados</option><option value="EXPIRED">Expirados</option><option value="CANCELLED">Cancelados</option><option value="PENDING">Pendentes</option>
                </select>
              </label>
              <label>Tipo<select value={transactionFilters.type} onChange={(e) => setTransactionFilters({ ...transactionFilters, type: e.target.value })}><option value="">Todos</option><option value="PIX">Pix</option><option value="CARD">Cartao</option><option value="WITHDRAWAL">Saque</option></select></label>
              <label>Limite<select value={transactionFilters.limit} onChange={(e) => setTransactionFilters({ ...transactionFilters, limit: Number(e.target.value) })}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label>
              <button className="secondary-action" onClick={loadDashboard}><RefreshCcw size={16} /> Aplicar</button>
            </div>
          </div>
          {transactions.length ? <div className="ledger-table">
            <div className="ledger-row ledger-labels"><span>Transacao</span><span>Tipo</span><span>Data</span><span>Status</span><span>Valor</span></div>
            {(transactions as GatewayTransaction[]).map((transaction, index) => <TransactionRow key={String(transaction.id ?? index)} transaction={transaction} />)}
          </div> : <div className="empty-state compact"><ReceiptText size={25} /><strong>Nenhuma transacao neste filtro</strong><span>Altere os filtros ou processe uma nova cobranca.</span></div>}
        </section>

        <section className="webhook-console" id="webhooks">
          <div className="webhook-intro">
            <span className="eyebrow">Eventos assincronos</span>
            <h2>Webhooks do gateway</h2>
            <p>Cadastre callbacks para receber o resultado definitivo de pagamentos e saques.</p>
            <div className="signal-visual"><span></span><span></span><span></span><Radio size={26} /></div>
          </div>
          <div className="webhook-manager">
            <div className="webhook-form">
              <label>Evento<select value={webhookForm.event} onChange={(e) => { const event = e.target.value; const slug = event === 'PAYMENT_PIX' ? 'payment-pix' : event === 'PAYMENT_CARD' ? 'payment-card' : 'withdrawal'; setWebhookForm({ event, url: `${window.location.origin}/api/webhooks/${slug}` }); }}><option>PAYMENT_PIX</option><option>PAYMENT_CARD</option><option>WITHDRAWAL</option></select></label>
              <label className="webhook-url">URL publica<input value={webhookForm.url} onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })} /></label>
              <button className="primary-action" onClick={createGatewayWebhook} disabled={loading}><Radio size={17} /> Cadastrar</button>
            </div>
            <div className="webhook-list">
              {webhooks.length ? webhooks.map((webhook, index) => <article className="webhook-item" key={webhook.id || index}><span className="webhook-signal"></span><div><strong>{webhook.event || webhook.type || 'EVENTO'}</strong><small>{webhook.url || 'URL registrada no gateway'}</small></div><span className="webhook-active">Ativo</span>{webhook.id && <button className="icon-action danger-action" title="Remover webhook" onClick={() => deleteGatewayWebhook(webhook.id || '')}><Trash2 size={15} /></button>}</article>) : <div className="empty-webhooks"><Radio size={20} /><span>Nenhum callback cadastrado no gateway.</span></div>}
            </div>
          </div>
        </section>
      </section>
      {loading && <div className="gateway-loader" role="status"><div className="loader-core"><span></span><LockKeyhole size={24} /></div><strong>Conectando ao gateway</strong><small>Criptografando e validando a transacao</small></div>}
    </main>
  );
}

function PublicCheckout({ id }: { id: string }) {
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [method, setMethod] = useState<'PIX' | 'CARD'>('PIX');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeField, setActiveField] = useState('');
  const [form, setForm] = useState({ email: '', payerDocument: '', amountCents: 0, cardNumber: '', cardHolder: '', expiryMonth: '', expiryYear: '', cvv: '', installments: 1 });

  async function loadCheckout() {
    const response = await fetch(`${apiBase}/checkout-links/${id}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Checkout nao encontrado');
    setCheckout(data);
    setForm((current) => ({ ...current, email: current.email || data.customerEmail || '', amountCents: current.amountCents || data.amountCents || 0 }));
    if (data.method === 'CARD') setMethod('CARD');
    if (data.method === 'PIX') setMethod('PIX');
    return data as Checkout;
  }

  useEffect(() => {
    loadCheckout().catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }, [id]);

  async function pay() {
    try {
      setLoading(true);
      setError('');
      const payload = {
        method,
        email: form.email,
        amountCents: Number(form.amountCents),
        payerDocument: form.payerDocument.replace(/\D/g, ''),
        cardNumber: method === 'CARD' ? cardDigits(form.cardNumber) : undefined,
        cardHolder: method === 'CARD' ? form.cardHolder : undefined,
        expiryMonth: method === 'CARD' ? form.expiryMonth.padStart(2, '0') : undefined,
        expiryYear: method === 'CARD' ? form.expiryYear : undefined,
        cvv: method === 'CARD' ? form.cvv : undefined,
        installments: method === 'CARD' ? Number(form.installments) : undefined,
        brand: method === 'CARD' ? cardBrand(form.cardNumber) : undefined
      };
      const response = await fetch(`${apiBase}/checkout-links/${id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Pagamento nao autorizado');
      setCheckout(data.checkout);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pagamento nao autorizado');
      await loadCheckout().catch(() => undefined);
    } finally { setLoading(false); }
  }

  if (loading && !checkout) return <main className="public-checkout-shell"><div className="checkout-loading"><Loader2 className="spin"/><strong>Carregando checkout seguro</strong></div></main>;
  if (!checkout) return <main className="public-checkout-shell"><div className="checkout-not-found"><AlertCircle/><h1>Link indisponivel</h1><p>{error}</p></div></main>;

  const allowedPix = checkout.method === 'PIX' || checkout.method === 'BOTH';
  const allowedCard = checkout.method === 'CARD' || checkout.method === 'BOTH';
  const paid = checkout.status === 'APPROVED';
  const checkoutAmountCents = Number(form.amountCents || checkout.amountCents);
  const pixGenerated = method === 'PIX' && checkout.status === 'PENDING' && !!(checkout.emv || checkout.qrCodeBase64);
  const canPay = checkoutAmountCents >= 100 && form.email.includes('@') && [11, 14].includes(form.payerDocument.replace(/\D/g, '').length) && (method === 'PIX' || (cardDigits(form.cardNumber).length >= 13 && form.cardHolder.length >= 3 && form.expiryMonth.length === 2 && form.expiryYear.length === 4 && form.cvv.length >= 3));

  return <main className="public-checkout-shell">
    <header className="checkout-brand"><span className="brand-mark"><Sparkles size={18}/></span><strong>StoneVest Checkout</strong><span><LockKeyhole size={14}/> Ambiente seguro</span></header>
    <section className="public-checkout-card">
      <aside className="order-summary"><span className="eyebrow">Resumo do pedido</span><h1>{checkout.description}</h1><div className="checkout-total"><span>Total</span><strong>{money(checkoutAmountCents)}</strong></div><div className="order-safe"><ShieldCheck size={19}/><div><strong>Pagamento protegido</strong><small>Seus dados seguem direto para o processador.</small></div></div><small className="order-id">Pedido {checkout.id.slice(0, 8)}</small></aside>
      <section className="customer-payment">
        {paid ? <div className="payment-result approved-result"><span><Check size={28}/></span><h2>Pagamento aprovado</h2><p>Enviamos a atualizacao para {checkout.customerEmail}.</p></div> : pixGenerated ? <div className="pix-result"><span className="eyebrow">Pix gerado</span><h2>Escaneie para pagar</h2>{checkout.qrCodeBase64 && <img src={qrCodeSrc(checkout.qrCodeBase64)} alt="QR Code Pix"/>}{checkout.emv && <><textarea readOnly value={checkout.emv}/><button className="secondary-action" onClick={() => navigator.clipboard.writeText(checkout.emv || '')}><Copy size={16}/> Copiar codigo Pix</button></>}<p>Esta pagina sera atualizada quando o pagamento for confirmado.</p></div> : <>
          <div className="checkout-title"><div><span className="eyebrow">Dados do pagamento</span><h2>Como deseja pagar?</h2></div><span className={`status-badge ${checkout.status.toLowerCase()}`}>{statusLabel(checkout.status)}</span></div>
          {(checkout.failureReason || error) && <div className="decline-notice"><AlertCircle size={19}/><div><strong>Pagamento nao aprovado</strong><p>{checkout.failureReason || error}</p><small>Revise os dados e tente novamente neste mesmo link.</small></div></div>}
          <div className="method-switch customer-methods">{allowedPix && <button className={method === 'PIX' ? 'selected' : ''} onClick={() => setMethod('PIX')}><QrCode size={17}/> Pix</button>}{allowedCard && <button className={method === 'CARD' ? 'selected' : ''} onClick={() => setMethod('CARD')}><CreditCard size={17}/> Cartao</button>}</div>
          {method === 'CARD' && <InteractiveCard form={form} activeField={activeField}/>} 
          <div className="customer-fields">
            <label>E-mail para notificacoes<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/></label>
            <label>Valor em centavos<input type="number" min="100" step="100" value={form.amountCents} onChange={(e) => setForm({ ...form, amountCents: Number(e.target.value) })}/></label>
            <label>CPF ou CNPJ<input inputMode="numeric" placeholder="Somente numeros" value={form.payerDocument} onChange={(e) => setForm({ ...form, payerDocument: e.target.value.replace(/\D/g, '').slice(0, 14) })}/></label>
            {method === 'CARD' && <><label className="full-field">Numero do cartao<input inputMode="numeric" value={form.cardNumber.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim()} onFocus={() => setActiveField('number')} onBlur={() => setActiveField('')} onChange={(e) => setForm({ ...form, cardNumber: cardDigits(e.target.value) })}/></label><label className="full-field">Nome no cartao<input value={form.cardHolder} onFocus={() => setActiveField('holder')} onBlur={() => setActiveField('')} onChange={(e) => setForm({ ...form, cardHolder: e.target.value.toUpperCase().slice(0, 26) })}/></label><label>Validade (mes)<input inputMode="numeric" placeholder="MM" value={form.expiryMonth} onFocus={() => setActiveField('expiry')} onBlur={() => setActiveField('')} onChange={(e) => setForm({ ...form, expiryMonth: e.target.value.replace(/\D/g, '').slice(0, 2) })}/></label><label>Validade (ano)<input inputMode="numeric" placeholder="AAAA" value={form.expiryYear} onFocus={() => setActiveField('expiry')} onBlur={() => setActiveField('')} onChange={(e) => setForm({ ...form, expiryYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}/></label><label>CVV<input type="password" inputMode="numeric" value={form.cvv} onFocus={() => setActiveField('cvv')} onBlur={() => setActiveField('')} onChange={(e) => setForm({ ...form, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}/></label><label>Parcelas<select value={form.installments} onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })}>{Array.from({length: 12},(_,i)=><option value={i+1} key={i+1}>{i+1}x de {money(Math.ceil(checkoutAmountCents/(i+1)))}</option>)}</select></label></>}
          </div>
          <button className="pay-button" disabled={!canPay || loading} onClick={pay}>{loading ? <Loader2 className="spin" size={18}/> : method === 'PIX' ? <QrCode size={18}/> : <LockKeyhole size={18}/>} {loading ? 'Processando' : method === 'PIX' ? `Gerar Pix de ${money(checkoutAmountCents)}` : `Pagar ${money(checkoutAmountCents)}`}</button>
        </>}
      </section>
    </section>
    <footer className="checkout-footer"><ShieldCheck size={14}/> Pagamento processado com conexao segura</footer>
  </main>;
}

function InteractiveCard({ form, activeField }: { form: { cardNumber: string; cardHolder: string; expiryMonth: string; expiryYear: string; cvv: string }; activeField: string }) {
  const brand = cardBrand(form.cardNumber);
  return (
    <div className={`card-scene ${activeField === 'cvv' ? 'is-flipped' : ''}`}>
      <div className="bank-card">
        <div className="card-face card-front">
          <div className="card-top"><span className="card-chip"><i></i><i></i><i></i></span><Wifi size={23} /></div>
          <strong className={`live-card-number ${activeField === 'number' ? 'field-active' : ''}`}>{formattedCardNumber(form.cardNumber)}</strong>
          <div className="card-meta"><div><small>Titular</small><span className={activeField === 'holder' ? 'field-active' : ''}>{form.cardHolder || 'SEU NOME AQUI'}</span></div><div><small>Validade</small><span className={activeField === 'expiry' ? 'field-active' : ''}>{form.expiryMonth || 'MM'}/{form.expiryYear.slice(-2) || 'AA'}</span></div><b>{brand}</b></div>
        </div>
        <div className="card-face card-back"><div className="magnetic-strip"></div><div className="signature"><span>assinatura autorizada</span><b>{form.cvv ? '•'.repeat(form.cvv.length) : 'CVV'}</b></div><p><LockKeyhole size={13} /> Dados protegidos por criptografia</p></div>
      </div>
    </div>
  );
}

function PixOrb({ ready, amount }: { ready: boolean; amount: string }) {
  return <div className={`pix-visual ${ready ? 'is-ready' : ''}`}><div className="pix-ticket"><span className="pix-brand"><i></i> PIX</span><div className="pix-qr-preview"><span></span><span></span><span></span><QrCode size={64}/></div><small>Cobranca instantanea</small></div><div className="pix-amount"><span>Valor da cobranca</span><strong>{amount}</strong><small>{ready ? <><Check size={12}/> Dados prontos para gerar</> : 'Complete os dados da cobranca'}</small></div></div>;
}

function TransactionRow({ transaction }: { transaction: GatewayTransaction }) {
  const status = String(transaction.status ?? 'PENDING');
  const type = String(transaction.type ?? transaction.method ?? transaction.paymentMethod ?? 'TRANSACTION');
  const description = String(transaction.description ?? transaction.externalReference ?? transaction.id ?? 'Operacao do gateway');
  const rawAmount = Number(transaction.amountCents ?? transaction.amount ?? transaction.value ?? 0);
  const dateValue = transaction.createdAt ?? transaction.created_at ?? transaction.date;
  const date = dateValue ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(dateValue))) : '--';
  return <article className="ledger-row"><span className="transaction-name"><i className={type.toLowerCase()}>{type === 'PIX' ? <QrCode size={15} /> : type === 'CARD' ? <CreditCard size={15} /> : <Banknote size={15} />}</i><strong>{description}</strong></span><span>{type}</span><span>{date}</span><span className={`status-badge ${status.toLowerCase()}`}>{statusLabel(status)}</span><strong>{money(rawAmount)}</strong></article>;
}

function Metric({ icon, label, value, detail, loading }: { icon: React.ReactNode; label: string; value: string; detail: string; loading?: boolean }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      {loading ? <div className="skeleton-value"></div> : <strong>{value}</strong>}
      {loading ? <div className="skeleton-detail"></div> : <small>{detail}</small>}
    </article>
  );
}

function Root() {
  const match = window.location.pathname.match(/^\/checkout\/([^/]+)/);
  return match ? <PublicCheckout id={match[1]} /> : <App />;
}

createRoot(document.getElementById('root')!).render(<Root />);
