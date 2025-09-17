const express = require('express');
const { Bot } = require('@maxhub/max-bot-api');
const { dbHelpers } = require('../db');
const smsService = require('../utils/smsService');
const rateLimiter = require('../utils/rateLimiter');

const router = express.Router();

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const accounts = await dbHelpers.all('SELECT * FROM accounts ORDER BY created_at DESC');
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Request verification code for phone
router.post('/request-verification', async (req, res) => {
  const { phone } = req.body;
  
  if (!phone) {
    return res.status(400).json({ error: 'Номер телефона обязателен' });
  }

  // Validate phone number format
  if (!smsService.validatePhoneNumber(phone)) {
    return res.status(400).json({ 
      error: 'Неверный формат номера. Используйте формат +7xxxxxxxxxx (Россия) или +375xxxxxxxxx (Беларусь)' 
    });
  }

  // Check rate limits for SMS requests
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  const phoneRateCheck = rateLimiter.checkSMSRateLimit(phone);
  if (!phoneRateCheck.allowed) {
    return res.status(429).json({ 
      error: phoneRateCheck.reason,
      retryAfter: phoneRateCheck.retryAfter
    });
  }
  
  const ipRateCheck = rateLimiter.checkIPRateLimit(clientIP);
  if (!ipRateCheck.allowed) {
    return res.status(429).json({ 
      error: ipRateCheck.reason,
      retryAfter: ipRateCheck.retryAfter
    });
  }

  try {
    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Store verification code in database
    await dbHelpers.run(
      'INSERT OR REPLACE INTO phone_verifications (phone, code, expires_at) VALUES (?, ?, ?)',
      [phone, verificationCode, expiresAt.toISOString()]
    );
    
    // Send SMS with verification code
    if (smsService.isConfigured()) {
      try {
        const smsResult = await smsService.sendVerificationCode(phone, verificationCode);
        console.log(`SMS sent successfully to ${smsService.formatPhoneNumberForDisplay(phone)}`);
        
        res.json({
          message: `Код подтверждения отправлен на номер ${smsService.formatPhoneNumberForDisplay(phone)}`,
          phone_display: smsService.formatPhoneNumberForDisplay(phone)
        });
      } catch (smsError) {
        // SMS failed, but still allow verification for development
        console.error('SMS sending failed:', smsError.message);
        
        // In development mode, show the code
        const isDevelopment = process.env.NODE_ENV !== 'production';
        
        res.json({
          message: isDevelopment 
            ? `SMS не отправлен (ошибка сервиса), но код для тестирования: ${verificationCode}` 
            : 'Ошибка отправки SMS. Попробуйте позже.',
          error: isDevelopment ? smsError.message : undefined,
          debug_code: isDevelopment ? verificationCode : undefined
        });
      }
    } else {
      // SMS not configured - development mode
      console.log(`Verification code for ${phone}: ${verificationCode}`);
      
      res.json({
        message: 'SMS-сервис не настроен. Код для тестирования:',
        debug_code: verificationCode,
        info: 'Для настройки SMS добавьте переменные окружения TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN и TWILIO_PHONE_NUMBER'
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify phone and add account
router.post('/', async (req, res) => {
  const { name, bot_token, phone, verification_code } = req.body;
  
  if (!name || !bot_token || !phone || !verification_code) {
    return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
  }

  try {
    // Check verification attempt limits
    const verificationCheck = rateLimiter.checkVerificationAttempts(phone);
    if (!verificationCheck.allowed) {
      return res.status(429).json({ 
        error: verificationCheck.reason,
        retryAfter: verificationCheck.retryAfter
      });
    }

    // Verify the phone code
    const verification = await dbHelpers.get(
      'SELECT * FROM phone_verifications WHERE phone = ? AND code = ?',
      [phone, verification_code]
    );
    
    if (!verification) {
      // Record failed attempt
      rateLimiter.recordFailedVerification(phone);
      return res.status(400).json({ error: 'Неверный код подтверждения' });
    }
    
    if (new Date() > new Date(verification.expires_at)) {
      return res.status(400).json({ error: 'Код подтверждения истек' });
    }
    
    // Test the bot token
    const bot = new Bot(bot_token);
    await bot.api.getMe();
    
    // Add account with verified phone
    const result = await dbHelpers.run(
      'INSERT INTO accounts (name, bot_token, phone, phone_verified) VALUES (?, ?, ?, ?)',
      [name, bot_token, phone, 1]
    );
    
    // Clean up used verification code and clear rate limiting
    await dbHelpers.run(
      'DELETE FROM phone_verifications WHERE phone = ?',
      [phone]
    );
    
    rateLimiter.clearVerificationAttempts(phone);
    
    res.status(201).json({
      id: result.id,
      name,
      phone,
      message: 'Аккаунт успешно добавлен с подтвержденным номером'
    });
    
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      if (error.message.includes('phone')) {
        res.status(400).json({ error: 'Номер телефона уже используется' });
      } else {
        res.status(400).json({ error: 'Токен бота уже используется' });
      }
    } else if (error.message.includes('bot')) {
      res.status(400).json({ error: 'Неверный токен бота: ' + error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Update account
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, bot_token, is_active } = req.body;
  
  if (!name && !bot_token && is_active === undefined) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  try {
    // If bot_token is provided, test it
    if (bot_token) {
      const bot = new Bot(bot_token);
      await bot.api.getMe();
    }
    
    let updateFields = [];
    let values = [];
    
    if (name) {
      updateFields.push('name = ?');
      values.push(name);
    }
    if (bot_token) {
      updateFields.push('bot_token = ?');
      values.push(bot_token);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }
    
    values.push(id);
    
    const result = await dbHelpers.run(
      `UPDATE accounts SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    res.json({ message: 'Аккаунт успешно обновлен' });
    
  } catch (error) {
    if (error.message.includes('bot')) {
      res.status(400).json({ error: 'Неверный токен бота: ' + error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Delete account
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await dbHelpers.run('DELETE FROM accounts WHERE id = ?', [id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    res.json({ message: 'Аккаунт успешно удален' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test bot token
router.post('/test', async (req, res) => {
  const { bot_token } = req.body;
  
  if (!bot_token) {
    return res.status(400).json({ error: 'Токен бота обязателен' });
  }

  try {
    const bot = new Bot(bot_token);
    const botInfo = await bot.api.getMe();
    res.json({
      success: true,
      bot_info: botInfo,
      message: 'Токен бота действителен'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Неверный токен бота: ' + error.message
    });
  }
});

module.exports = router;