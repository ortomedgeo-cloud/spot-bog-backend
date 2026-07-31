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
// нужные значения (isConfigured) И он включён в таблице notify_settings
// (enabled !== false). Отсутствующая строка в таблице считается включённым
// каналом — так система работает и до того, как db/notify.sql выполнят
// вручную в Neon.
//
// Значения (токены, ключи) берутся из notify_secrets в БД (введены из
// админки, хранятся зашифрованными — см. lib/secrets.js), а если там пусто —
// из переменных окружения. БД имеет приоритет: она даёт переключить ключ без
// передеплоя. Если чтение секретов/настроек из БД падает — трактуем это как
// "используй только переменные окружения", а не как повод молчать.
//
// notify() никогда не бросает исключение: заказ/бронь уже сохранены и видны
// в дашборде, упавшее уведомление не должно ронять запрос гостя.

import { sendTelegramMessage } from "./telegram.js";
import { sendWhatsappNotification } from "./greenapi.js";
import { sendEmailNotification } from "./email.js";
import { getNotifySettings, getNotifySecrets, setNotifySecret, deleteNotifySecret } from "./db.js";
import { encryptSecret, decryptSecret, secretsEnabled } from "./secrets.js";

const FIELD_LABELS = {
  TELEGRAM_BOT_TOKEN: "Токен бота",
  TELEGRAM_CHAT_ID: "ID чата",
  GREEN_API_ID_INSTANCE: "ID инстанса",
  GREEN_API_TOKEN: "Токен API",
  GREEN_API_CHAT_ID: "ID чата",
  RESEND_API_KEY: "API-ключ Resend",
  NOTIFY_EMAIL_TO: "Получатели (через запятую)",
  NOTIFY_EMAIL_FROM: "Отправитель"
};

export const CHANNELS = {
  telegram: {
    title: "Telegram",
    env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    send: (text, opts, vals) =>
      sendTelegramMessage(text, { ...opts, token: vals.TELEGRAM_BOT_TOKEN, chatId: vals.TELEGRAM_CHAT_ID })
  },
  whatsapp: {
    title: "WhatsApp",
    env: ["GREEN_API_ID_INSTANCE", "GREEN_API_TOKEN", "GREEN_API_CHAT_ID"],
    send: (text, opts, vals) =>
      sendWhatsappNotification(text, {
        idInstance: vals.GREEN_API_ID_INSTANCE,
        token: vals.GREEN_API_TOKEN,
        chatId: vals.GREEN_API_CHAT_ID
      })
  },
  email: {
    title: "Почта",
    env: ["RESEND_API_KEY", "NOTIFY_EMAIL_TO"],
    optionalEnv: ["NOTIFY_EMAIL_FROM"],
    send: (text, opts, vals) =>
      sendEmailNotification(text, {
        ...opts,
        apiKey: vals.RESEND_API_KEY,
        to: vals.NOTIFY_EMAIL_TO,
        from: vals.NOTIFY_EMAIL_FROM
      })
  }
};

function allFieldNames(channel) {
  const def = CHANNELS[channel];
  return [...def.env, ...(def.optionalEnv || [])];
}

// Секреты хранятся зашифрованными, здесь одно чтение всей таблицы и разбор
// по каналам — дешевле, чем читать поле за полем.
async function loadSecretsMap() {
  const rows = await getNotifySecrets();
  const map = {};
  for (const row of rows) {
    if (!map[row.channel]) map[row.channel] = {};
    try {
      map[row.channel][row.name] = decryptSecret(row.value);
    } catch (e) {
      console.error(`notify: не удалось расшифровать ${row.channel}.${row.name}`, e);
    }
  }
  return map;
}

async function readEnabledMap() {
  const rows = await getNotifySettings();
  return new Map(rows.map((r) => [r.channel, r.enabled]));
}

// БД имеет приоритет над переменной окружения того же имени.
function resolveValues(channel, secretsMap) {
  const chSecrets = secretsMap[channel] || {};
  const result = {};
  for (const name of allFieldNames(channel)) {
    result[name] = chSecrets[name] || process.env[name] || "";
  }
  return result;
}

function isChannelConfigured(channel, values) {
  return CHANNELS[channel].env.every((name) => !!values[name]);
}

export async function isConfigured(channel) {
  if (!CHANNELS[channel]) return false;
  let secretsMap = {};
  try {
    secretsMap = await loadSecretsMap();
  } catch (e) {
    console.error("isConfigured: не удалось прочитать notify_secrets", e);
  }
  return isChannelConfigured(channel, resolveValues(channel, secretsMap));
}

// Для админки: полное состояние каждого канала, включая поля для формы
// ввода ключей. Значения полей никогда не возвращаются — только факт и
// источник (db/env/ничего), чтобы секрет не улетал обратно в браузер.
export async function channelStatus() {
  let enabledMap = null;
  try {
    enabledMap = await readEnabledMap();
  } catch (e) {
    console.error("channelStatus: не удалось прочитать notify_settings", e);
  }

  let secretsMap = {};
  try {
    secretsMap = await loadSecretsMap();
  } catch (e) {
    console.error("channelStatus: не удалось прочитать notify_secrets", e);
  }

  return Object.entries(CHANNELS).map(([channel, def]) => {
    const chSecrets = secretsMap[channel] || {};
    const values = resolveValues(channel, secretsMap);
    const fields = allFieldNames(channel).map((name) => ({
      name,
      label: FIELD_LABELS[name] || name,
      set: !!values[name],
      source: chSecrets[name] ? "db" : process.env[name] ? "env" : null
    }));
    const configured = isChannelConfigured(channel, values);
    const missing = def.env.filter((name) => !values[name]);
    const enabled = enabledMap && enabledMap.has(channel) ? enabledMap.get(channel) !== false : true;

    return { channel, title: def.title, configured, enabled, missing, fields };
  });
}

// Шифрует и сохраняет одно поле секрета канала. Бросает, если
// NOTIFY_SECRET_KEY не задан — сохранять в БД без ключа шифрования нечем.
function assertKnownField(channel, name) {
  if (!CHANNELS[channel] || !allFieldNames(channel).includes(name)) {
    const err = new Error(`Unknown field "${name}" for channel "${channel}"`);
    err.code = "UNKNOWN_FIELD";
    throw err;
  }
}

export async function saveSecretField(channel, name, value) {
  assertKnownField(channel, name);
  if (!secretsEnabled()) {
    const err = new Error("NOTIFY_SECRET_KEY не задан");
    err.code = "NO_SECRET_KEY";
    throw err;
  }
  await setNotifySecret(channel, name, encryptSecret(value));
}

export async function clearSecretField(channel, name) {
  assertKnownField(channel, name);
  await deleteNotifySecret(channel, name);
}

export function secretsAvailable() {
  return secretsEnabled();
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

  let secretsMap = {};
  try {
    secretsMap = await loadSecretsMap();
  } catch (e) {
    console.error("notify: не удалось прочитать notify_secrets, используем только переменные окружения", e);
  }

  const targets = candidates.filter((channel) => {
    const values = resolveValues(channel, secretsMap);
    if (!isChannelConfigured(channel, values)) return false;
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
      const values = resolveValues(channel, secretsMap);
      await CHANNELS[channel].send(text, options, values);
      results.push({ channel, ok: true });
    } catch (e) {
      console.error(`notify: канал "${channel}" не отправил сообщение`, e);
      results.push({ channel, ok: false, error: String(e?.message || e) });
    }
  }

  return { sent: results.some((r) => r.ok), results };
}
