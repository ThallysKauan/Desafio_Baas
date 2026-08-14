# Desafio Tecnico BaaS - VBA Systems / Lera Box

Aplicacao BaaS funcional com backend NestJS, TypeORM, MySQL e frontend React/Vite.

O sistema representa o produto do lojista. O frontend conversa com o backend BaaS, e o backend conversa com o gateway BranchPay/Lera Box por HTTP.

## Stack

- Backend: NestJS, TypeScript, TypeORM, MySQL, Swagger, class-validator
- Frontend: React + Vite
- Banco: MySQL
- Gateway: `https://api.branchpay.com.br/api`
- Deploy recomendado sem Docker local: Railway com MySQL

## Rodar Localmente Sem Docker

1. Crie um banco MySQL local ou use o MySQL da Railway.
2. Configure:

```bash
copy backend\.env.example backend\.env
```

3. Preencha o `backend/.env`.

Para MySQL local:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=baas
DB_PASSWORD=baas
DB_DATABASE=baas
```

Para Railway MySQL:

```env
DATABASE_URL=mysql://usuario:senha@host:porta/banco
```

4. Instale e rode:

```bash
npm run install:all
npm run dev
```

URLs locais:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`

Login demo do painel:

```text
email: admin@demo.com
senha: 123456
```

## Deploy Na Railway

Crie um projeto na Railway com dois recursos:

1. Um servico da aplicacao conectado ao repositorio GitHub.
2. Um banco MySQL.

No servico da aplicacao, configure as variaveis:

```env
APP_PORT=${{PORT}}
JWT_SECRET=troque-por-uma-chave-grande
DATABASE_URL=${{MySQL.MYSQL_URL}}
GATEWAY_BASE_URL=https://api.branchpay.com.br/api
GATEWAY_EMAIL=seu-email-do-gateway
GATEWAY_PASSWORD=sua-senha-do-gateway
GATEWAY_DOCUMENT=seu-documento-do-gateway
GATEWAY_CUSTOMER_CODE=seu-codigo-cliente
GATEWAY_STORE_KEY=sua-chave-loja
WEBHOOK_SECRET=
```

Se o Railway mostrar variaveis separadas em vez de `MYSQL_URL`, monte a URL assim:

```text
mysql://MYSQLUSER:MYSQLPASSWORD@MYSQLHOST:MYSQLPORT/MYSQLDATABASE
```

O projeto possui `railway.json`. A Railway vai usar:

```bash
npm run build
npm start
```

O backend serve tambem o frontend gerado em `frontend/dist`, entao uma unica URL publica abre o painel e tambem a API.

URLs apos deploy:

- Painel: `https://seu-app.up.railway.app`
- Swagger: `https://seu-app.up.railway.app/docs`
- API: `https://seu-app.up.railway.app/api`

## Webhooks

Configure no gateway as URLs publicas:

```text
POST https://seu-app.up.railway.app/api/webhooks/payment-pix
POST https://seu-app.up.railway.app/api/webhooks/payment-card
POST https://seu-app.up.railway.app/api/webhooks/withdrawal
```

O painel possui uma area para cadastrar, listar e remover esses callbacks diretamente no gateway. Os eventos recebidos sao persistidos com uma chave idempotente, portanto uma mesma notificacao repetida nao altera o pedido duas vezes.

## Taxas e extrato

- O backend consulta `GET /api/fees?brand=` antes de criar pagamentos com cartao.
- A taxa correta para a bandeira e quantidade de parcelas e persistida junto ao checkout.
- O painel consulta o extrato com filtros de status, tipo e limite.
- Se o token do gateway expirar, o backend realiza um novo login e repete a chamada uma vez.

## Fluxo Principal

1. Criar conta publica no gateway por `POST /api/users`.
2. Receber por e-mail documento, senha, CodigoCliente e ChaveLoja.
3. Preencher as variaveis do gateway no backend/Railway.
4. Acessar o painel com o login demo.
5. Criar link Pix ou cartao.
6. Consultar saldo e extrato.
7. Solicitar saque.
8. Receber webhooks e atualizar status local.

## Seguranca

- Senha e token do gateway ficam apenas no backend.
- O frontend conversa somente com a API BaaS.
- Valores monetarios sao tratados em centavos.
- `.env` nao deve ser enviado para o GitHub.
- Webhooks sao persistidos para auditoria.

## Observacao

Este projeto foi construido para avaliacao tecnica e aprendizado. Para producao, o ideal seria trocar `synchronize: true` por migrations, criptografar credenciais sensiveis no banco e criar cadastro real de lojistas.
