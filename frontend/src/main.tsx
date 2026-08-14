import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CreditCard, Landmark, Link as LinkIcon, LogIn, RefreshCcw, Wallet } from 'lucide-react';
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

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('123456');
  const [message, setMessage] = useState('');
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

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${apiBase}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Erro inesperado');
    }
    return data;
  }

  async function login() {
    try {
      const data = await request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem('token', data.accessToken);
      setToken(data.accessToken);
      setMessage('Login realizado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro no login');
    }
  }

  async function loadDashboard() {
    if (!token) return;
    try {
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
    }
  }

  async function createCheckout() {
    try {
      const payload = {
        description: form.description,
        amountCents: Number(form.amountCents),
        method: form.method,
        installments: form.method === 'CARD' ? Number(form.installments) : undefined,
        feePercent: form.method === 'CARD' ? Number(form.feePercent) : undefined,
        brand: form.method === 'CARD' ? form.brand : undefined
      };
      await request('/checkout-links', { method: 'POST', headers, body: JSON.stringify(payload) });
      setMessage('Link criado.');
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao criar link');
    }
  }

  async function createWithdrawal() {
    try {
      await request('/withdrawals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ amountCents: Number(withdrawal.amountCents), pixKey: withdrawal.pixKey })
      });
      setMessage('Saque solicitado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao solicitar saque');
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [token]);

  if (!token) {
    return (
      <main className="auth">
        <section className="login-panel">
          <div className="brand">BaaS Checkout</div>
          <h1>Entrar no painel do lojista</h1>
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button onClick={login}><LogIn size={18} /> Entrar</button>
          {message && <p className="message">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <header>
        <div>
          <span className="brand">BaaS Checkout</span>
          <h1>Painel do lojista</h1>
        </div>
        <button className="ghost" onClick={loadDashboard}><RefreshCcw size={18} /> Atualizar</button>
      </header>

      {message && <div className="notice">{message}</div>}

      <section className="metrics">
        <div>
          <Wallet size={22} />
          <span>Carteira</span>
          <strong>{wallet ? JSON.stringify(wallet) : 'Configure o gateway'}</strong>
        </div>
        <div>
          <LinkIcon size={22} />
          <span>Links criados</span>
          <strong>{checkouts.length}</strong>
        </div>
        <div>
          <CreditCard size={22} />
          <span>Transações</span>
          <strong>{transactions.length}</strong>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Criar link</h2>
          <label>Descrição<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Valor em centavos<input type="number" value={form.amountCents} onChange={(e) => setForm({ ...form, amountCents: Number(e.target.value) })} /></label>
          <label>Metodo<select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option>PIX</option><option>CARD</option></select></label>
          {form.method === 'CARD' && (
            <>
              <label>Parcelas<input type="number" min="1" max="21" value={form.installments} onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })} /></label>
              <label>Taxa %<input type="number" value={form.feePercent} onChange={(e) => setForm({ ...form, feePercent: Number(e.target.value) })} /></label>
              <label>Bandeira<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label>
            </>
          )}
          <button onClick={createCheckout}><LinkIcon size={18} /> Criar cobrança</button>
        </div>

        <div className="panel">
          <h2>Solicitar saque</h2>
          <label>Valor em centavos<input type="number" value={withdrawal.amountCents} onChange={(e) => setWithdrawal({ ...withdrawal, amountCents: Number(e.target.value) })} /></label>
          <label>Chave Pix<input value={withdrawal.pixKey} onChange={(e) => setWithdrawal({ ...withdrawal, pixKey: e.target.value })} /></label>
          <button onClick={createWithdrawal}><Landmark size={18} /> Sacar</button>
        </div>
      </section>

      <section className="table-section">
        <h2>Links de checkout</h2>
        <div className="table">
          {checkouts.map((item) => (
            <article key={item.id}>
              <strong>{item.description}</strong>
              <span>{item.method}</span>
              <span>{money(item.amountCents)}</span>
              <span>{item.status}</span>
              <small>{item.externalReference}</small>
              {item.emv && <textarea readOnly value={item.emv} />}
              {item.qrCodeBase64 && <img src={`data:image/png;base64,${item.qrCodeBase64}`} alt="QR Code Pix" />}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
