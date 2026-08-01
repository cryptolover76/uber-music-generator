import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[Telegram] Bot token or chat ID not configured - skipping message');
    return { success: false, error: 'Not configured' };
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const response = await axios.post(url, {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    });

    if (response.data && response.data.ok) {
      console.log('[Telegram] Message sent successfully');
      return { success: true };
    }
    return { success: false, error: response.data?.description || 'Unknown error' };
  } catch (error) {
    console.error('[Telegram] Error:', error.message);
    return { success: false, error: error.message };
  }
}

export function formatMusicMessage({ passageiroNome, shareLink, estilo }) {
  return `🎵 <b>Música pronta para ${passageiroNome}!</b>\n\n` +
    `🎸 Estilo: ${estilo || 'N/A'}\n` +
    `🔗 <a href="${shareLink}">Tocar música</a>\n\n` +
    `Link direto: ${shareLink}`;
}
