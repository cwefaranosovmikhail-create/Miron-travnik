const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

// Настройки сервера
const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN || 'MironTravnikAltai';
const productAmount = '1.00';

// Хранилище отправленных счетов (чтобы не дублировать письма при повторных запросах от Робокассы)
const sentInvoices = new Set(); 

// MIME-типы для отдачи статики
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

// Файлы, которые НЕЛЬЗЯ скачивать напрямую через браузер (защита контента)
const restrictedFiles = [
  'Алтайский травник.pdf', 
  '.env', 
  'server.js', 
  'package.json', 
  'package-lock.json'
];

// Вспомогательная функция для отправки JSON-ответа
function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

// Чтение JSON из тела запроса (для API)
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

// Чтение сырых данных из тела запроса (для Webhook Робокассы, т.к. она шлет form-urlencoded)
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) { // 1MB limit
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Вычисление MD5-хеша
function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex').toUpperCase();
}

// Подпись для СОЗДАНИЯ платежа (Пароль #1)
// Формула: MD5(MerchantLogin:OutSum:InvId:Пароль1:Shp_...)
function buildSignature1(outSum, invId, password, extra = {}) {
  const extras = Object.entries(extra)
    .filter(([key]) => key.toLowerCase().startsWith('shp_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  return md5([merchantLogin, outSum, invId, password, ...extras].join(':'));
}

// Подпись для ПРОВЕРКИ Webhook (Пароль #2)
// Формула: MD5(OutSum:InvId:Пароль2:Shp_...)
function buildSignature2(outSum, invId, password, extra = {}) {
  const extras = Object.entries(extra)
    .filter(([key]) => key.toLowerCase().startsWith('shp_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  return md5([outSum, invId, password, ...extras].join(':'));
}

// Проверка подписи от Робокассы
function verifyRobokassaSignature(data) {
  const password2 = (process.env.ROBOKASSA_PASSWORD2 || '').trim();
  if (!password2 || !data.OutSum || !data.InvId || !data.SignatureValue) return false;

  const extras = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().startsWith('shp_')) extras[key] = value;
  }

  const expected = buildSignature2(String(data.OutSum), String(data.InvId), password2, extras);
  const received = String(data.SignatureValue).trim().toUpperCase();

  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// Валидация Email
function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254;
}

// Отправка письма с вложением
async function sendOrderEmail(email, invId) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  
  // Путь к файлу книги (он должен лежать в корне репозитория)
  const filePath = path.join(root, 'Алтайский травник.pdf');

  if (!host || !user || !pass || !from) {
    console.warn('SMTP is not configured. Email was not sent.');
    return;
  }

  if (!fs.existsSync(filePath)) {
    console.error('ОШИБКА: Файл "Алтайский травник.pdf" не найден в корне проекта!');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true для 465, false для 587
    auth: { user, pass }
  });

  await transporter.sendMail({
    from: `"Михаил Добрый" <${from}>`,
    to: email,
    subject: 'Оплата подтверждена — Алтайский травник',
    text: `Спасибо за покупку! Заказ №${invId} оплачен. Книга "Алтайский травник.pdf" прикреплена к этому письму.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1b3022;">Оплата подтверждена</h2>
        <p>Спасибо! Ваш заказ №${invId} успешно оплачен.</p>
        <p>Файл с книгой <b>Алтайский травник.pdf</b> прикреплен к этому письму.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">Если у вас возникли проблемы со скачиванием, напишите нам в поддержку.</p>
      </div>
    `,
    attachments: [
      {
        filename: 'Алтайский травник.pdf', // Имя файла, которое увидит пользователь
        path: filePath // Путь к файлу на сервере
      }
    ]
  });
}

// Обработчик API для создания платежа
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

    // Генерируем уникальный номер заказа
    const invId = String(Date.now() + Math.floor(Math.random() * 1000));
    const extra = { Shp_email: email };
    
    // Считаем подпись
    const signature = buildSignature1(productAmount, invId, password1, extra);

    // Формируем URL для перенаправления пользователя
    const paymentUrl = new URL('https://auth.robokassa.ru/Merchant/Index.aspx');
    paymentUrl.searchParams.set('MerchantLogin', merchantLogin);
    paymentUrl.searchParams.set('OutSum', productAmount);
    paymentUrl.searchParams.set('InvId', invId);
    paymentUrl.searchParams.set('Desc', 'Книга "Алтайский травник"');
    paymentUrl.searchParams.set('Email', email);
    paymentUrl.searchParams.set('SignatureValue', signature);
    paymentUrl.searchParams.set('Shp_email', email);
    
    // URL для возврата пользователя после оплаты (замените на свои, если нужно)
    paymentUrl.searchParams.set('SuccessUrl', process.env.SUCCESS_URL || 'https://miron-travnik.netlify.app/');
    paymentUrl.searchParams.set('FailUrl', process.env.FAIL_URL || 'https://miron-travnik.netlify.app/');

    json(res, 200, { paymentUrl: paymentUrl.toString() });
  } catch (error) {
    console.error('create-payment error:', error);
    json(res, 500, { error: 'Не удалось создать оплату' });
  }
}

// Обработчик Webhook от Робокассы (ResultURL)
async function handleRobokassaResult(req, res) {
  try {
    // Читаем как сырую строку, так как Робокасса шлет form-urlencoded
    const rawBody = await readRawBody(req);
    const data = Object.fromEntries(new URLSearchParams(rawBody));

    if (!verifyRobokassaSignature(data)) {
      console.warn('Bad signature in webhook');
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

    // Защита от дублирования писем
    if (!sentInvoices.has(invId)) {
      await sendOrderEmail(email, invId);
      sentInvoices.add(invId);
      console.log(`Оплата ${invId} обработана, письмо отправлено на ${email}`);
    }

    // Важно: Робокасса ждет строго "OK" и номер заказа без пробела
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`OK${invId}`);
  } catch (error) {
    console.error('robokassa result error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Temporary processing error');
  }
}

// Функция для отдачи статических файлов
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

// Главный сервер
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // API для создания платежа
    if (req.method === 'POST' && url.pathname === '/create-payment') {
      await handleCreatePayment(req, res);
      return;
    }

    // Webhook от Робокассы
    if ((req.method === 'POST' || req.method === 'GET') && url.pathname === '/robokassa/result') {
      await handleRobokassaResult(req, res);
      return;
    }

    // Проверка статуса сервера
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { status: 'ok' });
      return;
    }

    // Обработка статических файлов
    // decodeURIComponent нужен для корректной обработки кириллицы и пробелов в URL
    const decodedPath = decodeURIComponent(url.pathname);
    const relativePath = decodedPath === '/' ? '/index.html' : decodedPath;
    
    // Блокируем доступ к файлу книги и служебным файлам
    if (restrictedFiles.includes(path.basename(relativePath))) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden: Access denied');
      return;
    }

    const filePath = path.resolve(root, `.${relativePath}`);
    
    // Защита от выхода за пределы директории (Path Traversal)
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

// Запуск сервера
server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${port}`);
});
