const express = require('express');
const { Bot } = require('@maxhub/max-bot-api');
const { dbHelpers } = require('../db');

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

// Add new account
router.post('/', async (req, res) => {
  const { name, bot_token } = req.body;
  
  if (!name || !bot_token) {
    return res.status(400).json({ error: 'Имя и токен бота обязательны' });
  }

  try {
    // Test the bot token
    const bot = new Bot(bot_token);
    await bot.api.getMe();
    
    const result = await dbHelpers.run(
      'INSERT INTO accounts (name, bot_token) VALUES (?, ?)',
      [name, bot_token]
    );
    
    res.status(201).json({
      id: result.id,
      name,
      message: 'Аккаунт успешно добавлен'
    });
    
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Токен бота уже используется' });
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