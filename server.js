<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Михаил Добрый — Алтайский травник</title>
    <style>
        :root {
            --bg-color: #f7f5f0;
            --card-bg: #ffffff;
            --primary-dark: #1b3022;
            --accent-orange: #f28b1e;
            --text-main: #1b1b1b;
            --text-muted: #5e5e5e;
            --border-radius: 16px;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-main);
            line-height: 1.5;
            padding: 16px;
            display: flex;
            justify-content: center;
        }

        .wrapper {
            width: 100%;
            max-width: 480px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .card {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.03);
        }

        .card-dark {
            background-color: var(--primary-dark);
            color: #ffffff;
            border-radius: var(--border-radius);
            padding: 24px;
        }

        .badge {
            display: inline-block;
            background-color: #eee9dc;
            color: var(--text-main);
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .card-dark .badge {
            background-color: rgba(255,255,255,0.1);
            color: #f28b1e;
        }

        h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 12px;
            line-height: 1.2;
        }

        p {
            font-size: 15px;
            color: var(--text-muted);
            margin-bottom: 16px;
        }

        .card-dark p {
            color: #d1d1d1;
        }

        .features-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin: 20px 0;
        }

        .features-list li {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            font-size: 14px;
            color: var(--text-main);
        }

        .features-list li::before {
            content: "✓";
            color: var(--primary-dark);
            font-weight: bold;
            background: #e6ede8;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 12px;
        }

        .price-box {
            text-align: center;
            margin: 20px 0;
        }

        .old-price {
            font-size: 18px;
            color: #999;
            text-decoration: line-through;
        }

        .new-price {
            font-size: 32px;
            font-weight: 800;
            color: var(--text-main);
        }

        .payment-note {
            font-size: 13px;
            color: var(--text-muted);
            text-align: center;
            margin-bottom: 16px;
        }

        .btn-primary {
            display: block;
            width: 100%;
            background-color: #f7931e;
            color: #ffffff;
            border: none;
            border-radius: 12px;
            padding: 16px;
            font-size: 16px;
            font-weight: 600;
            text-align: center;
            cursor: pointer;
            text-decoration: none;
            box-shadow: 0 4px 12px rgba(247, 147, 30, 0.3);
            transition: background 0.2s;
        }

        .btn-primary:hover {
            background-color: #e08216;
        }
        
        .btn-primary:disabled {
            background-color: #ccc;
            cursor: not-allowed;
            box-shadow: none;
        }

        .btn-sub {
            display: block;
            width: 100%;
            background-color: transparent;
            color: var(--text-main);
            border: 1px solid #ddd;
            border-radius: 12px;
            padding: 12px;
            font-size: 14px;
            font-weight: 500;
            text-align: center;
            cursor: pointer;
            text-decoration: none;
            margin-top: 12px;
        }

        .divider {
            text-align: center;
            font-size: 12px;
            color: #999;
            margin: 16px 0;
            position: relative;
        }

        .security-text {
            font-size: 12px;
            color: #777;
            text-align: center;
            margin-top: 10px;
        }

        .situation-item {
            background: #ffffff;
            border: 1px solid #eee;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 10px;
        }

        .situation-item h3 {
            font-size: 15px;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .situation-item h3 span {
            background: #eee9dc;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 13px;
        }

        .faq-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #ffffff;
            padding: 16px;
            border-radius: 12px;
            margin-bottom: 10px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
        }

        .faq-item span {
            font-size: 18px;
            color: #666;
        }

        .footer-links {
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 14px;
            margin: 16px 0;
        }

        .footer-links a {
            color: #d1d1d1;
            text-decoration: none;
        }

        .footer-contacts {
            font-size: 14px;
            color: #d1d1d1;
            margin-bottom: 12px;
        }

        .copyright {
            font-size: 12px;
            color: #888;
        }

        /* Модальное окно */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.65);
            backdrop-filter: blur(4px);
            justify-content: center;
            align-items: center;
            z-index: 1000;
            padding: 16px;
        }

        .modal-content {
            background: #ffffff;
            padding: 24px;
            border-radius: 20px;
            width: 100%;
            max-width: 420px;
            color: #1b1b1b;
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        }

        .payment-summary {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 12px;
            padding: 14px;
            margin: 12px 0 16px 0;
        }

        .payment-methods-badge {
            display: flex;
            gap: 6px;
            align-items: center;
            margin-top: 8px;
            flex-wrap: wrap;
        }

        .method-tag {
            font-size: 11px;
            background: #eef2ff;
            color: #3b82f6;
            padding: 4px 8px;
            border-radius: 6px;
            font-weight: 600;
        }

        .modal-content input[type="email"] {
            width: 100%;
            padding: 14px;
            margin: 8px 0 16px 0;
            border: 1px solid #d1d5db;
            border-radius: 10px;
            font-size: 15px;
            outline: none;
        }

        .modal-content input[type="email"]:focus {
            border-color: #f7931e;
        }
    </style>
</head>
<body>

<div class="wrapper">

    <div class="card-dark">
        <p style="color: #f28b1e; font-size: 13px; font-weight: 600; text-transform: uppercase; margin-bottom: 8px;">Специальная цена для читателей блога</p>
        <div class="badge">Электронный справочник</div>
        <h1>Алтайский травник</h1>
        <p>Полная цифровая энциклопедия домашнего оздоровления без агрессивной химии.</p>
        
        <ul class="features-list">
            <li>Удобный формат PDF — легко читать со смартфона или распечатать</li>
            <li>Рецепты для 11 систем тела — от давления и суставов до сна и иммунитета</li>
            <li>Точные дозировки и предостережения к каждому рецепту</li>
            <li>Личные заметки Михаила с объяснением природного механизма</li>
            <li>Бессрочный доступ — файл сохраняется на ваших устройствах навсегда</li>
        </ul>

        <div class="price-box">
            <div class="old-price">2 990 ₽</div>
            <div class="new-price">1 ₽</div>
        </div>
        <div class="payment-note" style="color: #aaa;">Оплата единоразово, без подписок</div>

        <button class="btn-primary" onclick="openPaymentModal()">Получить книгу за 1 ₽</button>
        <div class="security-text" style="color: #aaa;">Ссылка на скачивание придет на вашу почту</div>

        <div class="divider">если карта не подошла</div>
        <button class="btn-sub" style="color: #fff; border-color: rgba(255,255,255,0.2);" onclick="openPaymentModal()">🌍 Оплатить зарубежной картой (1 ₽)</button>
    </div>

    <div class="card">
        <div class="badge">Для кого эта книга</div>
        <h2 style="font-size: 20px; margin-bottom: 16px;">Узнаете себя в этих ситуациях?</h2>
        <p style="font-size: 14px; margin-bottom: 20px;">Книга создана для тех, кто ищет проверенные и бережные решения для здоровья без лишних таблеток.</p>

        <div class="situation-item">
            <h3><span>01</span> Болят суставы, спина или скачет давление</h3>
            <p style="font-size: 13px; margin-bottom: 0;">Таблетки дают только временный эффект или раздражают желудок, а хочется найти природные рецепты для регулярной поддержки тела.</p>
        </div>

        <div class="situation-item">
            <h3><span>02</span> Тревога, бессонница и хроническая усталость</h3>
            <p style="font-size: 13px; margin-bottom: 0;">Постоянный стресс мешает глубокому сну. Нужны мягкие успокаивающие настои и вечерние практики.</p>
        </div>

        <div class="situation-item">
            <h3><span>03</span> Хотите знать, что дать ребенку при простуде</h3>
            <p style="font-size: 13px; margin-bottom: 0;">Когда поднимается температура или начинается кашель, важно иметь под рукой безопасные домашние средства.</p>
        </div>
    </div>

    <div class="card">
        <div style="color: #f28b1e; font-size: 18px; margin-bottom: 8px;">★★★★★</div>
        <p style="font-size: 14px; font-style: italic; color: var(--text-main);">«Давно слежу за блогом Михаила, книгу очень ждала. Поразило, насколько всё разложено по полочкам — без воды, без эзотерики и заумных терминов.»</p>
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 12px;">
            <div style="background: #e6ede8; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px;">НК</div>
            <div style="font-size: 14px; font-weight: 600;">Наталья Кузнецова</div>
        </div>
    </div>

    <div class="card">
        <div class="badge">Частые вопросы</div>
        <h2 style="font-size: 20px; margin-bottom: 16px;">Ответы на популярные вопросы</h2>
        
        <div class="faq-item">В каком формате я получу книгу и как быстро? <span>+</span></div>
        <div class="faq-item">Нужно ли искать редкие или дорогие травы? <span>+</span></div>
        <div class="faq-item">Смогу ли я приготовить рецепты без специальных навыков? <span>+</span></div>
        <div class="faq-item">Заменяют ли эти рецепты визит к врачу? <span>+</span></div>
    </div>

    <div class="card">
        <div style="color: #f28b1e; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 6px;">Служба заботы</div>
        <h3 style="font-size: 18px; margin-bottom: 10px;">Не пришло письмо или остались вопросы по оплате?</h3>
        <p style="font-size: 13px;">Ссылка доставляется за 1–2 минуты. Если письма нет во входящих и в папке «Спам», напишите нам.</p>
        <a href="https://t.me/" target="_blank" class="btn-primary" style="background-color: var(--primary-dark); margin-top: 16px;">Написать в поддержку</a>
    </div>

    <div class="card-dark" style="font-size: 13px;">
        <div style="color: #f28b1e; font-weight: 600; margin-bottom: 4px;">Будьте здоровы</div>
        <div style="font-size: 18px; font-weight: bold; margin-bottom: 16px;">Михаил Добрый</div>
        
        <div class="footer-contacts">
            Фролова Елизавета Александровна<br>
            ИНН 730208831852
        </div>

        <div class="footer-links">
            <a href="#">Политика конфиденциальности</a>
            <a href="#">Публичная оферта</a>
            <a href="#">Написать в поддержку</a>
        </div>

        <div style="margin-top: 16px; color: #aaa;">
            +7 (995) 681-58-36<br>
            mihail.dobry88@gmail.com
        </div>

        <div class="copyright" style="margin-top: 20px;">© 2026 Все права защищены.</div>
    </div>

</div>

<!-- Модальное окно оплаты -->
<div id="paymentModal" class="modal-overlay">
    <div class="modal-content">
        <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">Безопасная оплата</h3>
        <p style="font-size: 13px; color: #666;">Введите почту для мгновенной доставки PDF-книги (1 ₽):</p>

        <div class="payment-summary">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 14px; font-weight: 600;">Книга «Алтайский травник»</span>
                <span style="font-size: 16px; font-weight: 800; color: #1b3022;">1 ₽</span>
            </div>
            <div class="payment-methods-badge">
                <span class="method-tag" style="background: #ecfdf5; color: #059669;">⚡ СБП</span>
                <span class="method-tag">💳 Карта РФ</span>
                <span class="method-tag" style="background: #fff7ed; color: #ea580c;">MIR Pay</span>
            </div>
        </div>
        
        <!-- Форма больше не содержит скрытых полей Робокассы, их генерирует сервер -->
        <form id="paymentForm">
            <label style="font-size: 12px; font-weight: 600; color: #374151;">Ваш Email:</label>
            <input type="email" id="emailField" required placeholder="example@mail.ru">

            <button type="submit" id="submitBtn" class="btn-primary" style="font-size: 15px; padding: 14px;">Перейти к выбору способа оплаты</button>
            <p style="font-size: 11px; color: #9ca3af; text-align: center; margin-top: 8px;">🔒 Защищено SSL-шифрованием</p>
            <button type="button" onclick="closePaymentModal()" style="width: 100%; background: none; border: none; margin-top: 10px; color: #888; font-size: 13px; cursor: pointer;">Вернуться назад</button>
        </form>
    </div>
</div>

<script>
    function openPaymentModal() {
        document.getElementById('paymentModal').style.display = 'flex';
    }

    function closePaymentModal() {
        document.getElementById('paymentModal').style.display = 'none';
    }

    // Отправка формы на сервер для получения ссылки на оплату
    document.getElementById('paymentForm').addEventListener('submit', async function(e) {
        e.preventDefault(); 

        const submitBtn = document.getElementById('submitBtn');
        const email = document.getElementById('emailField').value;
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Подготовка к оплате...';

        try {
            // Отправляем email на наш сервер (относительный путь, без домена)
            const response = await fetch('/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });

            // Если сервер вернул ошибку (400, 500 и т.д.), пытаемся прочитать её текст
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
            }

            const data = await response.json();
            
            // Перенаправляем на Робокассу по ссылке, которую вернул сервер
            window.location.href = data.paymentUrl;

        } catch (error) {
            console.error('Ошибка:', error);
            // Показываем реальную причину
            alert('Ошибка: ' + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Перейти к выбору способа оплаты';
        }
    });
</script>

</body>
</html>
