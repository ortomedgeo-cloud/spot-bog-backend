// Единая точка отправки уведомлений персоналу.
//
// Смысл слоя: вызывающий код (заказы, просьбы, оплаты) не знает, куда именно
// уходит сообщение — он просто зовёт notify(text). Добавить канал, сменить
// провайдера или включить/выключить канал из админки — правка только здесь.
// Это же нужно при переносе логики в другой проект: меняется реализация
// канала, вызовы остаются как есть. Файл нарочно не знает про столы, брони
// или меню — только текст, каналы и настройки.
//
// Канал срабатывает, только если ОБА условия верны: для него заданы все
// нужные переменные окружения (isConfigured) И он включён в таблице
// notify_settings (enabled !== false). Отсутствующая строка в таблице
// считается включённым каналом — так система работает и до того, как
// db/notify.sql выполнят вручную в Neon.
//
// notify() никогда не бросает исключение: заказ/бронь уже сохранены и видны
// в дашборде, упавшее уведомление не должно ронять запрос гостя.

import { sendTelegramMessage } from "./telegram.js";
import { sendWhatsappNotification } from "./greenapi.js";
import { sendEmailNotification } from "./email.js";
import { getNotifySettings } from "./db.js";

export const CHANNELS = {
  telegram: {
    title: "Telegram",
    env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    send: (text, opts) => sendTelegramMessage(text, opts)
  },
  whatsapp: {
    title: "WhatsApp",
    env: ["GREEN_API_ID_INSTANCE", "GREEN_API_TOKEN", "GREEN_API_CHAT_ID"],
    send: (text) => sendWhatsappNotification(text)
  },
  email: {
    title: "Почта",
    env: ["RESEND_API_KEY", "NOTIFY_EMAIL_TO"],
    send: (text, opts) => sendEmailNotification(text, opts)
  }
};

function missingEnv(channel) {
  return CHANNELS[channel].env.filter((name) => !process.env[name]);
}

export function isConfigured(channel) {
  return !!CHANNELS[channel] && missingEnv(channel).length === 0;
}

// Читает флаги включения из БД. Если чтение упадёт — вызывающий код
// (channelStatus/notify) трактует это как "все настроенные каналы включены",
// а не как повод молчать.
async function readEnabledMap() {
  const rows = await getNotifySettings();
  return new Map(rows.map((r) => [r.channel, r.enabled]));
}

// Для админки: полное состояние каждого канала.
export async function channelStatus() {
  let enabledMap = null;
  try {
    enabledMap = await readEnabledMap();
  } catch (e) {
    console.error("channelStatus: не удалось прочитать notify_settings", e);
  }

  return Object.entries(CHANNELS).map(([channel, def]) => {
    const configured = isConfigured(channel);
    const enabled = enabledMap && enabledMap.has(channel) ? enabledMap.get(channel) !== false : true;
    return {
      channel,
      title: def.title,
      configured,
      enabled,
      missing: missingEnv(channel)
    };
  });
}

export async function notify(text, options = {}) {
  const { only } = options;

  if (only && !CHANNELS[only]) {
    console.warn(`notify: неизвестный канал "${only}"`);
    return { sent: false, results: [] };
  }

  const candidates = only ? [only] : Object.keys(CHANNELS);

  let enabledMap = null;
  let settingsFailed = false;
  try {
    enabledMap = await readEnabledMap();
  } catch (e) {
    settingsFailed = true;
    console.error("notify: не удалось прочитать notify_settings, шлём во все настроенные каналы", e);
  }

  const targets = candidates.filter((channel) => {
    if (!isConfigured(channel)) return false;
    if (settingsFailed) return true;
    const enabled = enabledMap.has(channel) ? enabledMap.get(channel) !== false : true;
    return enabled;
  });

  if (!targets.length) {
    console.warn("notify: нет ни одного активного канала уведомлений");
    return { sent: false, results: [] };
  }

  const results = [];
  for (const channel of targets) {
    try {
      await CHANNELS[channel].send(text, options);
      results.push({ channel, ok: true });
    } catch (e) {
      console.error(`notify: канал "${channel}" не отправил сообщение`, e);
      results.push({ channel, ok: false, error: String(e?.message || e) });
    }
  }

  return { sent: results.some((r) => r.ok), results };
}
