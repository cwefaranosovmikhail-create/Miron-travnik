const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN || 'MironTravnikAltai';
const paymentAmount = '10.00';
const emailedInvoices = new Set();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function parseRequestBody(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function signatureForPayment(outSum, invId, password, extraParams = {}) {
  const extras = Object.keys(extraParams)
    .filter(key => key.toLowerCase().startsWith('shp_'))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(key => `${key}=${extraParams[key]}`);
  const signatureString = [outSum, invId, password, ...extras].join(':');
  return crypto.createHash('md5').update(signatureString).digest('hex').toUpperCase();
}

function verifyCallback(data) {
  const password2 = process.env.ROBOKASSA_PASSWORD2;
  if (!password2 || !data.OutSum || !data.InvId || !data.SignatureValue) return false;

  const extras = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().startsWith('shp_')) extras[key] = value;
  }
  const expected = signatureForPayment(String(data.OutSum), String(data.InvId), password2, extras);
  const received = String(data.SignatureValue).trim().toUpperCase();
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function createPayment(req, res) {
  let body;
  try {
    body = JSON.parse(await parseRequestBody(req));
  } catch {
    sendJson(res, 400, { error: 'Некорректный запрос' });
    return;
  }

  const email = String(body.email || '').trim();
  const password1 = process.env.ROBOKASSA_PASSWORD1;
  if (!validEmail(email)) {
    sendJson(res, 400, { error: 'Укажите корректный email' });
    return;
  }
  if (!password1) {
    console.error('ROBOKASSA_PASSWORD1 is not configured');
    sendJson(res, 503, { error: 'Оплата временно недоступна' });
    return;
  }

  const invId = crypto.randomInt(100000000, 1000000000).toString();
  const customParams = { Shp_email: email };
  const signature = signatureForPayment(paymentAmount, invId, password1, customParams);
  const paymentUrl = new URL('https://auth.robokassa.ru/Merchant/Index.aspx');
  const params = {
    MerchantLogin: merchantLogin,
    OutSum: paymentAmount,
    InvId: invId,
    Description: 'Книга 150 народных рецептов',
    Email: email,
    SignatureValue: signature,
    Shp_email: email
  };
  for (const [key, value] of Object.entries(params)) paymentUrl.searchParams.set(key, value);

  sendJson(res, 200, { paymentUrl: paymentUrl.toString() });
}

async function sendPaymentEmail(email, invId) {
  const host = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from || !Number.isInteger(smtpPort)) {
    throw new Error('SMTP environment variables are incomplete');
  }

  const downloadUrl = process.env.PDF_DOWNLOAD_URL;
  if (!downloadUrl) throw new Error('PDF_DOWNLOAD_URL is not configured');

  const transporter = nodemailer.createTransport({
    host,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Оплата подтверждена — книга «150 народных рецептов»',
    text: `Спасибо за покупку! Заказ №${invId} оплачен. Скачать книгу: ${downloadUrl}`,
    html: `<p>Спасибо за покупку! Заказ №${invId} оплачен.</p><p><a href="${downloadUrl}">Скачать книгу</a></p>`
  });
}

async function handleRobokassaCallback(req, res) {
  try {
    const raw = await parseRequestBody(req);
    const data = Object.fromEntries(new URLSearchParams(raw));

    if (!verifyCallback(data)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad signature');
      return;
    }

    if (String(data.OutSum) !== paymentAmount) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad amount');
      return;
    }

    const invId = String(data.InvId);
    const email = String(data.Shp_email || data.Email || '').trim();
    if (!validEmail(email)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing signed customer email');
      return;
    }

    if (!emailedInvoices.has(invId)) {
      await sendPaymentEmail(email, invId);
      emailedInvoices.add(invId);
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`OK ${invId}`);
  } catch (error) {
    console.error('Robokassa callback/email error:', error.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Temporary processing error');
  }
}

function transformPaymentPage(html) {
  html = html.replace(/\s*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/crypto-js\/4\.1\.1\/crypto-js\.min\.js"><\/script>/, '');
  html = html.replace('<form action="https://auth.robokassa.ru/Merchant/Index.aspx" method="POST" onsubmit="preparePayment(this)">', '<form id="paymentForm">');

  const clientScript = `<script>
    function openPaymentModal() { document.getElementById('paymentModal').style.display = 'flex'; }
    function closePaymentModal() { document.getElementById('paymentModal').style.display = 'none'; }
    document.getElementById('paymentForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Подготавливаем оплату…';
      try {
        const response = await fetch('/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.querySelector('input[type="email"]').value })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Не удалось создать оплату');
        window.location.assign(result.paymentUrl);
      } catch (error) {
        alert(error.message || 'Ошибка соединения. Попробуйте ещё раз.');
        button.disabled = false;
        button.textContent = 'Перейти к выбору способа оплаты';
      }
    });
  </script>`;
  html = html.replace(/<script>\s*function openPaymentModal\(\)[\s\S]*?<\/script>/, clientScript);
  return html;
}

function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Internal server error');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    if (filePath === path.join(root, 'index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(transformPaymentPage(data.toString('utf8')));
      return;
    }

    res.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (req.method === 'POST' && url.pathname === '/create-payment') {
    await createPayment(req, res);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/robokassa/result') {
    await handleRobokassaCallback(req, res);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD, POST' });
    res.end('Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname || '/');
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  serveStaticFile(filePath, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Listening on 0.0.0.0:${port}`);
});
