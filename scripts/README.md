# Scripts BranchPay

## Cadastro no Gateway

Rode na raiz do projeto:

```bash
node scripts/branchpay-register.js
```

O script faz:

1. `POST https://api.branchpay.com.br/api/users`
2. Mostra a resposta da API
3. Opcionalmente testa `POST https://api.branchpay.com.br/api/auth/login`

Se a API responder que algum campo está errado, ajuste o objeto `registerPayload` no arquivo `scripts/branchpay-register.js`.
