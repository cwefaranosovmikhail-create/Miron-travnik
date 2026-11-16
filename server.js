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

console.log('Файлы в корне проекта:', fs.readdirSync(root));

const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN || 'MironTravnikAltai';
const productAmount = '199.00';

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

  console.log('--- ПР