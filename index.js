// index.js - ✧ ೃ 𝐒𝐘𝐀 𝐓𝐄𝐀𝐌 ೃ ✧ Bot de WhatsApp optimizado
const { Boom } = require('@hapi/boom');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs').promises;
const path = require('path');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Configuración de logger
const logger = pino({ level: 'info' });

// Almacenamiento en memoria
const store = makeInMemoryStore({ logger });
store.readFromFile('./store.json');
setInterval(() => store.writeToFile('./store.json'), 10_000);

// Directorios y archivos
const authDir = './auth';
const pluginsDir = './plugins';
const tmpDir = './tmp';
const settingsFile = './settings.json';
const BOT_NAME = '✧ ೃ 𝐒𝐘𝐀 𝐓𝐄𝐀𝐌 ೃ ✧';

// Límite de subbots
const MAX_SUBBOTS = 30;
const subBots = {};

// Utilidad para extraer número de teléfono desde jid
const getPhoneNumber = (jid) => jid?.split('@')[0] || 'Desconocido';

// Cargar configuración
let settings = { owners: [] };
async function loadSettings() {
  try {
    settings = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  } catch (err) {
    console.log('No se encontró settings.json, creando uno por defecto...');
    settings = {
      owners: ['1234567890@s.whatsapp.net', '', '', '', ''],
      cleanupInterval: 24 * 60 * 60 * 1000,
    };
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
  }
}

// Limpieza de archivos temporales
async function cleanupTmp() {
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    const files = await fs.readdir(tmpDir);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(tmpDir, file);
      const stats = await fs.stat(filePath);
      if (now - stats.mtimeMs > settings.cleanupInterval) {
        await fs.unlink(filePath);
      }
    }
  } catch (err) {
    console.error('Error en limpieza de tmp:', err);
  }
}
setInterval(cleanupTmp, settings.cleanupInterval || 24 * 60 * 60 * 1000);

// Sistema de plugins
const plugins = new Map();
async function loadPlugins() {
  await fs.mkdir(pluginsDir, { recursive: true });
  const pluginFiles = (await fs.readdir(pluginsDir, { withFileTypes: true }))
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.js'))
    .map((dirent) => path.join(pluginsDir, dirent.name));

  for (const file of pluginFiles) {
    try {
      delete require.cache[require.resolve(file)]; // Limpiar caché
      const plugin = require(file);
      if (plugin.name && plugin.run) {
        plugins.set(plugin.name, plugin);
        console.log(`Plugin cargado: ${plugin.name}`);
      }
    } catch (err) {
      console.error(`Error al cargar plugin ${file}:`, err.message);
    }
  }
}

// Interfaz para consola
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Estado del bot
let botEnabled = true;

// Verificar si el usuario es owner o admin
async function isOwnerOrAdmin(sock, msg, jid) {
  const sender = msg.key.participant || msg.key.remoteJid;
  if (settings.owners.includes(sender)) return true;
  if (jid.endsWith('@g.us')) {
    const groupMetadata = await sock.groupMetadata(jid);
    return groupMetadata.participants.some((p) => p.id === sender && p.admin);
  }
  return false;
}

// Conectar bot (principal o subbot)
async function connectBot(phoneNumber = null, isSubBot = false, botName = BOT_NAME, msg = null, sender = null) {
  const authPath = path.join(authDir, isSubBot ? `subbot_${botName}` : 'main_bot');
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: !phoneNumber && !isSubBot,
    auth: state,
    defaultQueryTimeoutMs: 60_000, // Aumentado a 60 segundos para evitar timeouts
  });

  sock.ev.on('creds.update', saveCreds);

  let pairingCode = null;
  if (phoneNumber) {
    try {
      pairingCode = await sock.requestPairingCode(phoneNumber);
      if (isSubBot && msg && sender) {
        await sock.sendMessage(sender, { text: `Código de vinculación para ${botName}: ${pairingCode}` });
      } else if (!isSubBot) {
        console.log(`Código de emparejamiento para ${botName}: ${pairingCode}`);
      }
    } catch (err) {
      console.error(`Error generando código para ${botName}:`, err);
      if (isSubBot && sender) {
        await sock.sendMessage(sender, { text: `Error al generar código: ${err.message}` });
      }
    }
  }

  let connected = false;
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close' && !connected) {
      const errorCode = lastDisconnect?.error?.output?.statusCode;
      if (errorCode === DisconnectReason.badSession) {
        console.log(`${botName}: Sesión inválida. Eliminando credenciales...`);
        await fs.rm(authPath, { recursive: true }).catch(() => {});
        return await connectBot(phoneNumber, isSubBot, botName, msg, sender);
      } else if (errorCode) {
        console.error(`${botName}: Conexión cerrada con error ${errorCode}:`, lastDisconnect?.error);
      } else {
        console.log(`${botName}: Reconectando...`);
        setTimeout(() => connectBot(phoneNumber, isSubBot, botName, msg, sender), 5000);
      }
    } else if (connection === 'open') {
      console.log(`${botName}: Conectado!`);
      connected = true;
      if (!isSubBot) store.bind(sock.ev);
    }
  });

  if (isSubBot && msg && sender) {
    setTimeout(async () => {
      if (!connected) {
        await fs.rm(authPath, { recursive: true }).catch(() => {});
        await sock.sendMessage(sender, { text: `Subbot ${botName} no conectado en 30 segundos.` });
        delete subBots[botName];
      }
    }, 30_000);
  }

  return sock;
}

// Selección de autenticación mejorada
async function selectAuthMethod() {
  console.log(`\nAutenticación para ${BOT_NAME}:`);
  console.log('1. Código QR');
  console.log('2. Código de emparejamiento (ingresa número, ej. +1234567890)');
  const choice = await question('Elige una opción (1 o 2): ');

  if (choice === '2') {
    let phoneNumber = '';
    while (!phoneNumber.match(/^\+\d{10,}$/)) {
      phoneNumber = await question('Ingresa el número (ej. +1234567890): ');
      if (!phoneNumber.match(/^\+\d{10,}$/)) {
        console.log('Número inválido. Debe empezar con "+" seguido de 10 o más dígitos.');
      }
    }
    return phoneNumber;
  }
  return null;
}

// Iniciar bot principal
async function startMainBot() {
  try {
    await fs.mkdir(authDir, { recursive: true });
    await fs.mkdir(tmpDir, { recursive: true });
    await loadSettings();
    await loadPlugins();

    console.log(`Iniciando ${BOT_NAME}...`);
    const phoneNumber = await selectAuthMethod();
    const sock = await connectBot(phoneNumber, false, BOT_NAME);
    await handleConnection(sock);

    if (process.env.SUBBOT1_PHONE) {
      subBots['SUBBOT1'] = await connectBot(process.env.SUBBOT1_PHONE, true, `SUBBOT1_${BOT_NAME}`);
      await handleConnection(subBots['SUBBOT1']);
    }
  } catch (err) {
    console.error(`Error crítico al iniciar ${BOT_NAME}:`, err);
  } finally {
    rl.close();
  }
}

// Manejo de mensajes
async function handleConnection(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      const sender = msg.key.participant || msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

      if (!botEnabled && !(await isOwnerOrAdmin(sock, msg, jid))) continue;

      for (const [name, plugin] of plugins) {
        if (plugin.pattern && plugin.pattern.test(text)) {
          if (plugin.owner && !(await isOwnerOrAdmin(sock, msg, jid))) {
            await sock.sendMessage(jid, { text: 'Requiere permisos de owner o admin.' });
            continue;
          }
          try {
            await plugin.run({ sock, msg, jid, text, tmpDir, plugins, sender, mentionedJids, getPhoneNumber, subBots });
          } catch (err) {
            console.error(`Error en ${name}:`, err);
            await sock.sendMessage(jid, { text: 'Error al ejecutar el comando.' });
          }
        }
      }
    }
  });
}

// Iniciar bot
startMainBot();
