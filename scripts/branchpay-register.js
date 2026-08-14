const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

const BASE_URL = process.env.BRANCHPAY_BASE_URL || 'https://api.branchpay.com.br/api';

async function post(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

async function ask(rl, label, fallback = '') {
  const suffix = fallback ? ` (${fallback})` : '';
  const value = await rl.question(`${label}${suffix}: `);
  return value.trim() || fallback;
}

function printResult(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`HTTP ${result.status}`);
  console.dir(result.data, { depth: null, colors: true });
}

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log('BranchPay/Lera Box - cadastro e login via POST');
  console.log(`Base URL: ${BASE_URL}\n`);

  const personType = await ask(rl, 'Tipo de pessoa PF ou PJ', 'PF');
  const name = await ask(rl, 'Nome', 'Usuario Teste');
  const email = await ask(rl, 'Email real');
  const phone = (await ask(rl, 'Telefone real, somente numeros')).replace(/\D/g, '');
  const document = (await ask(rl, 'CPF/CNPJ, pode ser ficticio')).replace(/\D/g, '');
  const zipCode = (await ask(rl, 'CEP com 8 digitos', '01001000')).replace(/\D/g, '');
  const address = await ask(rl, 'Endereco', 'Praca da Se');
  const number = await ask(rl, 'Numero', '100');
  const neighborhood = await ask(rl, 'Bairro', 'Se');
  const city = await ask(rl, 'Cidade', 'Sao Paulo');
  const state = (await ask(rl, 'UF com 2 letras', 'SP')).replace(/[^a-z]/gi, '').toUpperCase();

  const registerPayload = {
    personType,
    name,
    email,
    phone,
    document,
    zipCode,
    address,
    number,
    neighborhood,
    city,
    state
  };

  const registerResult = await post('/users', registerPayload);
  printResult('POST /users', registerResult);

  console.log('\nSe o cadastro der certo, veja seu e-mail. A senha costuma chegar por e-mail.');
  const shouldLogin = await ask(rl, 'Quer testar login agora? s/n', 'n');

  if (shouldLogin.toLowerCase() === 's') {
    const loginEmail = await ask(rl, 'Email do login', email);
    const password = await ask(rl, 'Senha recebida por email');

    const loginPayload = {
      document,
      password
    };

    const loginResult = await post('/auth/login', loginPayload);
    printResult('POST /auth/login', loginResult);

    if (loginResult.ok) {
      console.log('\nCopie os dados retornados para backend/.env:');
      console.log(`GATEWAY_EMAIL=${loginEmail}`);
      console.log(`GATEWAY_PASSWORD=${password}`);
      console.log(`GATEWAY_DOCUMENT=${document}`);
      console.log('GATEWAY_CUSTOMER_CODE=preencha_com_CodigoCliente');
      console.log('GATEWAY_STORE_KEY=preencha_com_ChaveLoja');
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error('\nErro ao executar script:');
  console.error(error);
  process.exit(1);
});
