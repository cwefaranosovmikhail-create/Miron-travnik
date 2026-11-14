const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

console.log("=========================================");
console.log("=== ЗАПУЩЕНА НОВАЯ ВЕРСИЯ СЕРВЕРА! ===");
console.log("=========================================");

const port = Number(process.env.PORT) || 3000;
const root = __dirname;

// ОТЛАДКА: показываем, какие файлы реально попали в контейнер
console.log('Файлы в корне проекта:', fs.readdirSync(root));

const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN || 'MironTravnikAltai';
const productAmount = '1.00';

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
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

const restrictedFiles = [
  'travnik.pdf',
  'golodanie.pdf',
  '.env',
  'server.js',
  'package.json',
  'package-lock.json'
];

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      resolve(body);
    });
    req.on('error', reject);
  });
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex').toUpperCase();
}

function buildSignature1(outSum, invId, password, extra = {}) {
  const extras = Object.entries(extra)
    .filter(([key]) => key.toLowerCase().startsWith('shp_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  return md5([merchantLogin, outSum, invId, password, ...extras].join(':'));
}

function verifyRobokassaSignature(data) {
  const password2 = (process.env.ROBOKASSA_PASSWORD2 || '').trim();

  if (!password2) {
    console.log('\n!!! ОШИБКА: Переменная ROBOKASSA_PASSWORD2 не задана в Amvera !!!\n');
    return false;
  }

  const normalizedData = { ...data };
  if (!normalizedData.OutSum && normalizedData.out_summ) normalizedData.OutSum = normalizedData.out_summ;
  if (!normalizedData.InvId && normalizedData.inv_id) normalizedData.InvId = normalizedData.inv_id;
  if (!normalizedData.SignatureValue && normalizedData.crc) normalizedData.SignatureValue = normalizedData.crc;

  if (!normalizedData.OutSum || !normalizedData.InvId || !normalizedData.SignatureValue) {
    console.log('\n!!! ОШИБКА: Данные OutSum, InvId или SignatureValue не найдены в запросе !!!');
    console.log('Данные, которые мы получили:', normalizedData);
    return false;
  }

  const extras = {};
  for (const [key, value] of Object.entries(normalizedData)) {
    if (key.toLowerCase().startsWith('shp_')) extras[key] = value;
  }

  const received = String(normalizedData.SignatureValue).trim().toUpperCase();

  const str1 = [String(normalizedData.OutSum), String(normalizedData.InvId), password2, ...Object.entries(extras).map(([k, v]) => `${k}=${v}`)].join(':');
  const hash1 = md5(str1);

  const str2 = [String(normalizedData.OutSum), String(normalizedData.InvId), password2, ...Object.entries(extras).map(([k, v]) => `${k}=${encodeURIComponent(v)}`)].join(':');
  const hash2 = md5(str2);

  console.log('\n\n==================================================');
  console.log('🛑 ДЕБАГ ПОДПИСИ РОБОКАССЫ 🛑');
  console.log('1. Данные:', normalizedData);
  console.log('2. Пароль #2 (первые 3):', password2.substring(0, 3) + '***');
  console.log('3. Строка 1 (декод):', str1);
  console.log('4. Хеш 1:', hash1);
  console.log('7. Хеш от Робокассы:', received);

  if (received === hash1 || received === hash2) {
    console.log('✅ ПОДПИСЬ СОВПАЛА!');
    console.log('==================================================\n\n');
    return true;
  }

  console.log('❌ НЕ СОВПАЛО');
  console.log('==================================================\n\n');
  return false;
}

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254;
}

async function sendOrderEmail(email, invId) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'miron.travnik.altay@gmail.com';

  const filePath = path.join(root, 'travnik.pdf');
  const filePath2 = path.join(root, 'golodanie.pdf');

  console.log('--- ПРОВЕРКА ФАЙЛОВ ПЕРЕД ОТПРАВКОЙ ---');
  console.log('travnik.pdf существует:', fs.existsSync(filePath));
  console.log('golodanie.pdf существует:', fs.existsSync(filePath2));

  if (!host || !user || !pass || !from) {
    console.warn('SMTP is not configured. Email was not sent.');
    return;
  }

  if (!fs.existsSync(filePath)) {
    console.error('ОШИБКА: Файл "travnik.pdf" не найден в корне проекта!');
    return;
  }

  if (!fs.existsSync(filePath2)) {
    console.error('ОШИБКА: Файл "golodanie.pdf" не найден в корне проекта!');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  try {
    await transporter.sendMail({
      from: `"Мирон Травник" <${from}>`,
      to: email,
      subject: 'Оплата подтверждена — комплект пособий',
      text: `Спасибо за покупку! Заказ №${invId} оплачен. К письму прикреплены два пособия: "Алтайский травник Деда Мирона.pdf" и "Пособие по интервальному голоданию.pdf".`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1b3022;">Оплата подтверждена</h2>
          <p>Спасибо! Ваш заказ №${invId} успешно оплачен.</p>
          <p>К письму прикреплены два пособия:</p>
          <ul>
            <li><b>Алтайский травник Деда Мирона</b></li>
            <li><b>Пособие по интервальному голоданию</b></li>
          </ul>
          <p style="color: #666; font-size: 14px;">С уважением, Мирон Травник</p>
        </div>
      `,
      attachments: [
        {
          filename: 'Алтайский травник Деда Мирона.pdf',
          path: filePath
        },
        {
          filename: 'Пособие по интервальному голоданию.pdf',
          path: filePath2
        }
      ]
    });
    console.log('ПИСЬМО РЕАЛЬНО ОТПРАВЛЕНО на', email);
  } catch (err) {
    console.error('ОШИБКА SMTP ПРИ ОТПРАВКЕ:', err);
  }
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
      console.error('ОШИБКА: Переменная ROBOKASSA_PASSWORD1 не задана!');
      json(res, 503, { error: 'Платёжная система временно недоступна' });
      return;
    }

    const invId = String(Date.now() + Math.floor(Math.random() * 1000));
    const extra = { Shp_email: email };
    const signature = buildSignature1(productAmount, invId, password1, extra);

    const paymentUrl = new URL('https://auth.robokassa.ru/Merchant/Index.aspx');
    paymentUrl.searchParams.set('MerchantLogin', merchantLogin);
    paymentUrl.searchParams.set('OutSum', productAmount);
    paymentUrl.searchParams.set('InvId', invId);
    paymentUrl.searchParams.set('Desc', 'Комплект: Алтайский травник + интервальное голодание');
    paymentUrl.searchParams.set('Email', email);
    paymentUrl.searchParams.set('SignatureValue', signature);
    paymentUrl.searchParams.set('Shp_email', email);

    paymentUrl.searchParams.set('SuccessUrl', process.env.SUCCESS_URL || 'https://miron-travnik.netlify.app/');
    paymentUrl.searchParams.set('FailUrl', process.env.FAIL_URL || 'https://miron-travnik.netlify.app/');

    json(res, 200, { paymentUrl: paymentUrl.toString() });
  } catch (error) {
    console.error('create-payment error:', error);
    json(res, 500, { error: 'Ошибка на сервере: ' + error.message });
  }
}

async function handleRobokassaResult(req, res) {
  try {
    console.log(`\n[WEBHOOK] МЕТОД: ${req.method}`);
    console.log(`[WEBHOOK] ПОЛНЫЙ URL: ${req.url}`);

    let rawBody = '';
    if (req.method === 'POST' || req.method === 'PUT') {
      rawBody = await readRawBody(req);
    }
    console.log(`[WEBHOOK] ТЕЛО ЗАПРОСА (RAW): "${rawBody}"`);

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const urlParams = Object.fromEntries(urlObj.searchParams);

    const bodyParams = Object.fromEntries(new URLSearchParams(rawBody));

    const data = { ...bodyParams, ...urlParams };

    console.log('[WEBHOOK] ИТОГОВЫЕ ДАННЫЕ:', data);

    if (!verifyRobokassaSignature(data)) {
      console.warn('Bad signature in webhook.');
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad signature');
      return;
    }

    const invId = String(data.InvId || data.inv_id || '');
    const email = String(data.Shp_email || data.shp_email || data.EMail || data.Email || '').trim();

    if (!invId || !validEmail(email)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing payment data');
      return;
    }

    if (!sentInvoices.has(invId)) {
      await sendOrderEmail(email, invId);
      sentInvoices.add(invId);
      console.log(`Оплата ${invId} обработана`);
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`OK${invId}`);
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

    if (url.pathname === '/robokassa/result') {
      await handleRobokassaResult(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { status: 'ok' });
      return;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const relativePath = decodedPath === '/' ? '/index.html' : decodedPath;

    if (restrictedFiles.includes(path.basename(relativePath))) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden: Access denied');
      return;
    }

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
  console.log(`Server running on 0.0.0.0:${port}`);
});
