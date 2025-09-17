
const { Bot } = require('@maxhub/max-bot-api');

// SMS service using MAX Messenger integration
class SMSService {
  constructor() {
    // We'll use the first available active bot token for SMS sending
    this.bot = null;
  }

  /**
   * Initialize SMS service with an active bot token
   * @param {string} botToken - Bot token to use for SMS
   */
  async initialize(botToken) {
    if (!botToken) return false;
    
    try {
      this.bot = new Bot(botToken);
      // Test the bot
      await this.bot.api.getMe();
      return true;
    } catch (error) {
      console.error('Failed to initialize SMS bot:', error.message);
      this.bot = null;
      return false;
    }
  }

  /**
   * Check if SMS service is properly configured
   */
  isConfigured() {
    return !!this.bot;
  }

  /**
   * Send SMS verification code using MAX Messenger
   * @param {string} phoneNumber - Phone number in international format (+7xxxxxxxxxx)
   * @param {string} verificationCode - 6-digit verification code
   * @param {string} botToken - Bot token to use for sending
   * @returns {Promise<Object>} - Result of SMS sending
   */
  async sendVerificationCode(phoneNumber, verificationCode, botToken = null) {
    // Initialize with provided bot token if needed
    if (botToken && !this.isConfigured()) {
      const initialized = await this.initialize(botToken);
      if (!initialized) {
        throw new Error('Не удалось инициализировать бота для отправки SMS');
      }
    }

    if (!this.isConfigured()) {
      throw new Error('SMS сервис не настроен. Добавьте активный аккаунт бота.');
    }

    try {
      const message = `Ваш код подтверждения для MAX Messenger: ${verificationCode}\n\nКод действителен в течение 10 минут.\nНе передавайте этот код никому!`;
      
      // Use MAX API to send message to phone number
      // In MAX Messenger, we can send to phone number as chat_id
      const result = await this.bot.api.sendMessage(phoneNumber, {
        text: message
      });

      return {
        success: true,
        messageId: result.message_id,
        message: 'SMS успешно отправлен через MAX Messenger'
      };
    } catch (error) {
      console.error('MAX SMS sending error:', error);
      
      // Handle specific MAX API errors
      if (error.message.includes('phone')) {
        throw new Error('Номер телефона не найден в MAX Messenger');
      } else if (error.message.includes('blocked')) {
        throw new Error('Пользователь заблокировал бота или не найден');
      } else {
        throw new Error(`Ошибка отправки SMS через MAX: ${error.message}`);
      }
    }
  }

  /**
   * Get first available bot token from database for SMS sending
   * @param {Object} dbHelpers - Database helpers instance
   * @returns {Promise<string|null>} - Bot token or null
   */
  async getActiveBotToken(dbHelpers) {
    try {
      const activeBot = await dbHelpers.get(
        'SELECT bot_token FROM accounts WHERE is_active = 1 LIMIT 1'
      );
      return activeBot ? activeBot.bot_token : null;
    } catch (error) {
      console.error('Failed to get active bot token:', error);
      return null;
    }
  }

  /**
   * Validate phone number format for Russian/Belarusian numbers
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} - True if valid format
   */
  validatePhoneNumber(phoneNumber) {
    // Russian numbers: +7xxxxxxxxxx (10 digits after +7)
    // Belarusian numbers: +375xxxxxxxxx (9 digits after +375)
    const russianPattern = /^\+7\d{10}$/;
    const belarusianPattern = /^\+375\d{9}$/;
    
    return russianPattern.test(phoneNumber) || belarusianPattern.test(phoneNumber);
  }

  /**
   * Format phone number for display (hide middle digits for security)
   * @param {string} phoneNumber - Phone number to format
   * @returns {string} - Formatted phone number
   */
  formatPhoneNumberForDisplay(phoneNumber) {
    if (!phoneNumber) return '';
    
    if (phoneNumber.startsWith('+7') && phoneNumber.length === 12) {
      // Russian number: +7xxx***xx-xx
      return `${phoneNumber.slice(0, 4)}***${phoneNumber.slice(-4)}`;
    } else if (phoneNumber.startsWith('+375') && phoneNumber.length === 13) {
      // Belarusian number: +375xx***xx-xx
      return `${phoneNumber.slice(0, 6)}***${phoneNumber.slice(-4)}`;
    }
    
    return phoneNumber;
  }
}

module.exports = new SMSService();
