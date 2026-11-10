const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN || 'MironTravnikAltai';
const productAmount = '10.00';
const sentInvoices = new Set();

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

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 32 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex').toUpperCase();
}

function buildRobokassaSignature(outSum, invId, password, extra = {}) {
  const extras = Object.entries(extra)
    .filter(([key]) => key.toLowerCase().startsWith('shp_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  return md5([outSum, invId, password, ...extras].join(':'));
}

function verifyRobokassaSignature(data) {
  const password2 = (process.env.ROBOKASSA_PASSWORD2 || '').trim();
  if (!password2 || !data.OutSum || !data.InvId || !data.SignatureValue) return false;

  const extras = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().startsWith('shp_')) extras[key] = value;
  }

  const expected = buildRobokassaSignature(String(data.OutSum), String(data.InvId), password2, extras);
  const received = String(data.SignatureValue).trim().toUpperCase();

  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254;
}

async function sendOrderEmail(email, invId) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const pdfUrl = process.env.PDF_DOWNLOAD_URL;

  if (!host || !user || !pass || !from || !pdfUrl) {
    console.warn('SMTP or PDF_DOWNLOAD_URL is not configured. Email was not sent.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Оплата подтверждена — книга «150 народных рецептов»',
    text: `Спасибо за покупку! Заказ №${invId} оплачен. Скачать книгу: ${pdfUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1b3022;">Оплата подтверждена</h2>
        <p>Спасибо! Ваш заказ №${invId} успешно оплачен.</p>
        <p><a href="${pdfUrl}">Скачать PDF-книгу</a></p>
      </div>
    `
  });
}

async function handleCreatePayment(req, res) {
  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim();
    const password1 = (process.env.ROBOKASSA_PASSWORD1 || '').trim();

    if (!validEmail(email)) {
      json(res, 400, { error: 'Укажите корректный email' });
      return;
    }

    if (!password1) {
      json(res, 503, { error: 'Платёжная система временно недоступна' });
      return;
    }

    const invId = String(Date.now() + Math.floor(Math.random() * 100000));
    const extra = { Shp_email: email };
    const signature = buildRobokassaSignature(productAmount, invId, password1, extra);

    const paymentUrl = new URL('https://auth.robokassa.ru/Merchant/Index.aspx');
    paymentUrl.searchParams.set('MerchantLogin', merchantLogin);
    paymentUrl.searchParams.set('OutSum', productAmount);
    paymentUrl.searchParams.set('InvId', invId);
    paymentUrl.searchParams.set('Desc', 'Книга 150 народных рецептов');
    paymentUrl.searchParams.set('Email', email);
    paymentUrl.searchParams.set('SignatureValue', signature);
    paymentUrl.searchParams.set('Shp_email', email);

    json(res, 200, { paymentUrl: paymentUrl.toString() });
  } catch (error) {
    console.error('create-payment error:', error);
    json(res, 500, { error: 'Не удалось создать оплату' });
  }
}

async function handleRobokassaResult(req, res) {
  try {
    const raw = await readJsonBody(req);
    const data = Object.fromEntries(new URLSearchParams(raw));

    if (!verifyRobokassaSignature(data)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad signature');
      return;
    }

    const invId = String(data.InvId || '');
    const email = String(data.Shp_email || data.Email || '').trim();

    if (!invId || !validEmail(email)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing payment data');
      return;
    }

    if (!sentInvoices.has(invId)) {
      await sendOrderEmail(email, invId);
      sentInvoices.add(invId);
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`OK ${invId}`);
  } catch (error) {
    console.error('robokassa result error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Temporary processing error');
  }
}

function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Internal server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'POST' && url.pathname === '/create-payment') {
      await handleCreatePayment(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/robokassa/result') {
      await handleRobokassaResult(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { status: 'ok' });
      return;
    }

    const relativePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.resolve(root, `.${relativePath}`);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    serveStaticFile(filePath, res);
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Listening on 0.0.0.0:${port}`);
});
