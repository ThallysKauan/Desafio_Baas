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

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('123456');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [wallet, setWallet] = useState<Record<string, unknown> | null>(null);
  const [transactions, setTransactions] = useState<unknown[]>([]);
  const [form, setForm] = useState({
    description: 'Pedido teste',
    amountCents: 1990,
    method: 'PIX',
    installments: 1,
    feePercent: 0,
    brand: 'VISA'
  });
  const [withdrawal, setWithdrawal] = useState({ amountCents: 1000, pixKey: '' });

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);
  const approvedCount = checkouts.filter((item) => item.status === 'APPROVED').length;
  const pendingCount = checkouts.filter((item) => item.status === 'PENDING').length;

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${apiBase}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Erro inesperado');
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
      const [checkoutData, walletData, transactionData] = await Promise.all([
        request('/checkout-links', { headers }),
        request('/wallet', { headers }).catch((error) => ({ error: error.message })),
        request('/wallet/transactions?limit=20', { headers }).catch(() => [])
      ]);
      setCheckouts(checkoutData);
      setWallet(walletData);
      setTransactions(Array.isArray(transactionData) ? transactionData : transactionData.items || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  async function createCheckout() {
    try {
      setLoading(true);
      const payload = {
        description: form.description,
        amountCents: Number(form.amountCents),
        method: form.method,
        installments: form.method === 'CARD' ? Number(form.installments) : undefined,
        feePercent: form.method === 'CARD' ? Number(form.feePercent) : undefined,
        brand: form.method === 'CARD' ? form.brand : undefined
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
          <a className="active"><Wallet size={18} /> Dashboard</a>
          <a href="/docs"><Activity size={18} /> API Docs</a>
          <a><ShieldCheck size={18} /> Webhooks</a>
        </nav>
        <button className="quiet-action" onClick={logout}><LogOut size={17} /> Sair</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Gateway Lera Box</span>
            <h1>Welcome, Merchant</h1>
          </div>
          <button className="secondary-action" onClick={loadDashboard} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
            Atualizar
          </button>
        </header>

        {message && <div className="notice">{message}</div>}

        <section className="metrics-grid">
          <Metric icon={<Wallet size={22} />} label="Carteira" value={walletValue(wallet)} detail="Saldo do gateway" />
          <Metric icon={<LinkIcon size={22} />} label="Links" value={String(checkouts.length)} detail={`${pendingCount} pendentes`} />
          <Metric icon={<CreditCard size={22} />} label="Aprovados" value={String(approvedCount)} detail={`${transactions.length} transacoes`} />
        </section>

        <section className="performance-card">
          <div className="history-head">
            <div>
              <span className="eyebrow">Portfolio performance</span>
              <h2>Movimento operacional</h2>
            </div>
            <div className="range-tabs">
              <span>1D</span>
              <span>1W</span>
              <span className="selected">1M</span>
              <span>1Y</span>
            </div>
          </div>
          <div className="chart-panel" aria-hidden="true">
            <div className="chart-line"></div>
            <div className="chart-glow"></div>
            <span className="chart-tag"><BarChart3 size={14} /> Sync OK</span>
          </div>
        </section>

        <section className="operations-grid">
          <div className="operation-card main-operation">
            <div className="section-heading">
              <span className="icon-chip"><QrCode size={18} /></span>
              <div>
                <h2>Criar cobranca</h2>
                <p>Gera link Pix ou cartao com referencia conciliavel.</p>
              </div>
            </div>

            <div className="form-grid">
              <label>Descricao<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <label>Valor em centavos<input type="number" value={form.amountCents} onChange={(e) => setForm({ ...form, amountCents: Number(e.target.value) })} /></label>
              <label>Metodo<select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option>PIX</option><option>CARD</option></select></label>
              {form.method === 'CARD' && (
                <>
                  <label>Parcelas<input type="number" min="1" max="21" value={form.installments} onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })} /></label>
                  <label>Taxa percentual<input type="number" value={form.feePercent} onChange={(e) => setForm({ ...form, feePercent: Number(e.target.value) })} /></label>
                  <label>Bandeira<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label>
                </>
              )}
            </div>

            <button className="primary-action" onClick={createCheckout} disabled={loading}>
              <LinkIcon size={18} />
              Criar link de pagamento
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

          {checkouts.length === 0 ? (
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
                  {item.qrCodeBase64 && <img src={`data:image/png;base64,${item.qrCodeBase64}`} alt="QR Code Pix" />}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
