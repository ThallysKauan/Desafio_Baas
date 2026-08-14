import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
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
  Wallet
} from 'lucide-react';
import './styles.css';

const apiBase = '/api';

type Checkout = {
  id: string;
  description: string;
  amountCents: number;
  method: 'PIX' | 'CARD';
  status: string;
  externalReference: string;
  emv?: string;
  qrCodeBase64?: string;
  installments?: number;
  feePercent?: string;
};

type GatewayTransaction = Record<string, unknown>;
type GatewayWebhook = { id?: string; event?: string; type?: string; url?: string; active?: boolean };

function money(cents?: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
}

function statusLabel(status?: string) {
  const value = status || 'PENDING';
  const labels: Record<string, string> = {
    PENDING: 'Pendente',
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
  const [webhookForm, setWebhookForm] = useState({ event: 'PAYMENT_PIX', url: `${window.location.origin}/api/webhooks/payment-pix` });
  const [feeLoading, setFeeLoading] = useState(false);
  const [form, setForm] = useState({
    description: 'Pedido teste',
    amountCents: 1990,
    method: 'PIX',
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
  const [activeCardField, setActiveCardField] = useState('');

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);
  const approvedCount = checkouts.filter((item) => item.status === 'APPROVED').length;
  const pendingCount = checkouts.filter((item) => item.status === 'PENDING').length;
  const checkoutFee = form.method === 'CARD' ? Math.max(Number(form.feePercent) || 0.01, 0.01) : 0;
  const netAmount = Math.max(Number(form.amountCents) - Math.round(Number(form.amountCents) * (checkoutFee / 100)), 0);
  const completion = form.method === 'CARD'
    ? [cardDigits(form.cardNumber).length === 16, form.cardHolder.trim().length >= 3, !!form.expiryMonth, !!form.expiryYear, form.cvv.length >= 3].filter(Boolean).length * 20
    : [form.description.trim().length >= 3, Number(form.amountCents) > 0, form.payerDocument.replace(/\D/g, '').length >= 11].filter(Boolean).length * (100 / 3);

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
      const [checkoutData, walletData, transactionData, webhookData] = await Promise.all([
        request('/checkout-links', { headers }),
        request('/wallet', { headers }).catch((error) => ({ error: error.message })),
        request(`/wallet/transactions?${query}`, { headers }).catch(() => []),
        request('/gateway/webhooks', { headers }).catch(() => [])
      ]);
      setCheckouts(checkoutData);
      setWallet(walletData);
      setTransactions(Array.isArray(transactionData) ? transactionData : transactionData.items || []);
      setWebhooks(Array.isArray(webhookData) ? webhookData : webhookData.items || webhookData.webhooks || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  async function quoteFee() {
    if (form.method !== 'CARD') return;
    try {
      setFeeLoading(true);
      const quote = await request(`/checkout-links/fees/quote?brand=${encodeURIComponent(form.brand)}&installments=${form.installments}`, { headers });
      setForm((current) => ({ ...current, feePercent: Number(quote.feePercent) }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nao foi possivel consultar a taxa');
    } finally {
      setFeeLoading(false);
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
        method: form.method,
        installments: form.method === 'CARD' ? Number(form.installments) : undefined,
        feePercent: form.method === 'CARD' ? Math.max(Number(form.feePercent) || 0.01, 0.01) : undefined,
        brand: form.method === 'CARD' ? form.brand : undefined,
        payerDocument: form.method === 'PIX' ? form.payerDocument.replace(/\D/g, '') : undefined,
        cardNumber: form.method === 'CARD' ? form.cardNumber.replace(/\D/g, '') : undefined,
        cardHolder: form.method === 'CARD' ? form.cardHolder : undefined,
        expiryMonth: form.method === 'CARD' ? form.expiryMonth.padStart(2, '0') : undefined,
        expiryYear: form.method === 'CARD' ? form.expiryYear : undefined,
        cvv: form.method === 'CARD' ? form.cvv.replace(/\D/g, '') : undefined
      };
      await request('/checkout-links', { method: 'POST', headers, body: JSON.stringify(payload) });
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao solicitar saque');
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage('Codigo copiado.');
  }

  useEffect(() => {
    loadDashboard();
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => quoteFee(), 350);
    return () => window.clearTimeout(timer);
  }, [form.method, form.brand, form.installments]);

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

        <section className="performance-card">
          <div className="history-head">
            <div>
              <span className="eyebrow">Performance da operacao</span>
              <h2>Movimento operacional</h2>
            </div>
            <div className="range-tabs">
              <span>1D</span>
              <span>1W</span>
              <span className="selected">1M</span>
              <span>1Y</span>
            </div>
          </div>
          <OperationalChart transactions={transactions as GatewayTransaction[]} />
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
              <button className={form.method === 'PIX' ? 'selected' : ''} onClick={() => setForm({ ...form, method: 'PIX' })}><QrCode size={16} /> Pix</button>
              <button className={form.method === 'CARD' ? 'selected' : ''} onClick={() => setForm({ ...form, method: 'CARD' })}><CreditCard size={16} /> Cartao</button>
            </div>

            <div className={`gateway-stage ${form.method.toLowerCase()}`}>
              <div className="stage-copy">
                <span className="live-status"><i></i> Ambiente seguro</span>
                <h3>{form.method === 'CARD' ? 'Pagamento por cartao' : 'Pagamento instantaneo'}</h3>
                <p>{form.method === 'CARD' ? 'Os dados aparecem no cartao enquanto voce digita.' : 'Preencha os dados para preparar uma cobranca Pix.'}</p>
                <div className="completion-track"><span style={{ transform: `scaleX(${completion / 100})` }} /></div>
                <small>{Math.round(completion)}% pronto para processar</small>
              </div>
              {form.method === 'CARD' ? (
                <InteractiveCard form={form} activeField={activeCardField} />
              ) : (
                <PixOrb ready={completion >= 99} amount={money(Number(form.amountCents))} />
              )}
            </div>

            <div className="form-grid">
              <label>Descricao<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <label>Valor em centavos<input type="number" value={form.amountCents} onChange={(e) => setForm({ ...form, amountCents: Number(e.target.value) })} /></label>
              {form.method === 'PIX' && (
                <label>CPF/CNPJ pagador<input value={form.payerDocument} onChange={(e) => setForm({ ...form, payerDocument: e.target.value })} /></label>
              )}
              {form.method === 'CARD' && (
                <>
                  <label>Parcelas<input type="number" min="1" max="21" value={form.installments} onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })} /></label>
                  <label>Taxa do gateway<input value={feeLoading ? 'Consultando...' : `${form.feePercent}%`} readOnly tabIndex={-1} /></label>
                  <label className="wide-field">Numero do cartao<input inputMode="numeric" autoComplete="cc-number" value={form.cardNumber.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim()} onFocus={() => setActiveCardField('number')} onBlur={() => setActiveCardField('')} onChange={(e) => { const value = cardDigits(e.target.value); setForm({ ...form, cardNumber: value, brand: cardBrand(value) }); }} /></label>
                  <label className="wide-field">Nome no cartao<input autoComplete="cc-name" value={form.cardHolder} onFocus={() => setActiveCardField('holder')} onBlur={() => setActiveCardField('')} onChange={(e) => setForm({ ...form, cardHolder: e.target.value.toUpperCase().slice(0, 26) })} /></label>
                  <label>Mes<input inputMode="numeric" autoComplete="cc-exp-month" value={form.expiryMonth} onFocus={() => setActiveCardField('expiry')} onBlur={() => setActiveCardField('')} onChange={(e) => setForm({ ...form, expiryMonth: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
                  <label>Ano<input inputMode="numeric" autoComplete="cc-exp-year" value={form.expiryYear} onFocus={() => setActiveCardField('expiry')} onBlur={() => setActiveCardField('')} onChange={(e) => setForm({ ...form, expiryYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
                  <label>CVV<input type="password" inputMode="numeric" autoComplete="cc-csc" value={form.cvv} onFocus={() => setActiveCardField('cvv')} onBlur={() => setActiveCardField('')} onChange={(e) => setForm({ ...form, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
                  <label>Bandeira detectada<input value={cardBrand(form.cardNumber)} readOnly tabIndex={-1} /></label>
                </>
              )}
            </div>

            <div className="payment-preview">
              <div>
                <span>Total da cobranca</span>
                <strong>{money(Number(form.amountCents))}</strong>
              </div>
              <div>
                <span>Metodo</span>
                <strong>{form.method}</strong>
              </div>
              <div>
                <span>Liquido estimado</span>
                <strong>{money(netAmount)}</strong>
              </div>
            </div>

            <button className="primary-action" onClick={createCheckout} disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <LinkIcon size={18} />}
              {loading ? 'Autorizando no gateway' : `Criar cobranca ${form.method === 'PIX' ? 'Pix' : 'no cartao'}`}
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="operation-card">
            <div className="section-heading">
              <span className="icon-chip"><Landmark size={18} /></span>
              <div>
                <h2>Saque Pix</h2>
                <p>Solicita retirada para chave Pix externa.</p>
              </div>
            </div>
            <label>Valor em centavos<input type="number" value={withdrawal.amountCents} onChange={(e) => setWithdrawal({ ...withdrawal, amountCents: Number(e.target.value) })} /></label>
            <label>Chave Pix<input value={withdrawal.pixKey} onChange={(e) => setWithdrawal({ ...withdrawal, pixKey: e.target.value })} /></label>
            <button className="secondary-action fill" onClick={createWithdrawal} disabled={loading}><Banknote size={18} /> Solicitar saque</button>
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
                    <span>{item.externalReference}</span>
                  </div>
                  <span className="method-badge">{item.method}</span>
                  <span>{money(item.amountCents)}</span>
                  <span className={`status-badge ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>
                  {item.emv && (
                    <button className="icon-action" title="Copiar codigo Pix" onClick={() => copyText(item.emv || '')}>
                      <Copy size={16} />
                    </button>
                  )}
                  {item.qrCodeBase64 && <img src={qrCodeSrc(item.qrCodeBase64)} alt="QR Code Pix" />}
                  {item.emv && <textarea className="pix-code" readOnly value={item.emv} />}
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
  return <div className={`pix-visual ${ready ? 'is-ready' : ''}`}><div className="pix-radar"><i></i><i></i><i></i><QrCode size={48} /></div><strong>{amount}</strong><span>{ready ? 'Pronto para gerar' : 'Aguardando dados'}</span></div>;
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

function OperationalChart({ transactions }: { transactions: GatewayTransaction[] }) {
  const fallback = [34, 43, 39, 51, 47, 62, 55, 69, 64, 76, 68, 81, 73, 86];
  const transactionValues = transactions
    .slice(0, 14)
    .reverse()
    .map((item) => Number(item.amountCents ?? item.amount ?? item.value ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const rawValues = transactionValues.length > 2 ? transactionValues : fallback;
  const min = Math.min(...rawValues);
  const max = Math.max(...rawValues);
  const points = rawValues.map((value, index) => {
    const x = 28 + (index / Math.max(rawValues.length - 1, 1)) * 944;
    const normalized = max === min ? .5 : (value - min) / (max - min);
    return { x, y: 174 - normalized * 112, value };
  });
  const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1]?.x || 972} 190 L ${points[0]?.x || 28} 190 Z`;
  const latest = rawValues[rawValues.length - 1] || 0;

  return (
    <div className="chart-panel" aria-label="Grafico do movimento operacional">
      <div className="chart-summary"><span>Volume recente</span><strong>{transactionValues.length > 2 ? money(latest) : 'Ambiente conectado'}</strong></div>
      <svg className="operation-chart" viewBox="0 0 1000 220" preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#238cff" stopOpacity=".34"/><stop offset="1" stopColor="#238cff" stopOpacity="0"/></linearGradient>
          <filter id="chartGlow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <g className="chart-grid"><line x1="28" y1="62" x2="972" y2="62"/><line x1="28" y1="100" x2="972" y2="100"/><line x1="28" y1="138" x2="972" y2="138"/><line x1="28" y1="176" x2="972" y2="176"/></g>
        <path className="chart-area-path" d={areaPath}/>
        <path className="chart-line-path" d={linePath}/>
        {points.map((point, index) => <circle className={index === points.length - 1 ? 'latest-point' : ''} key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4.5 : 2.2}/>) }
      </svg>
      <div className="chart-axis"><span>Inicio</span><span>Meio do periodo</span><span>Agora</span></div>
      <span className="chart-tag"><BarChart3 size={14} /> Sincronizado</span>
    </div>
  );
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

createRoot(document.getElementById('root')!).render(<App />);
