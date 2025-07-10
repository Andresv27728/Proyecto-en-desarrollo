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

// Configuración de logger optimizado
const logger = pino({ level: 'silent' });

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
      owners: [
        '176742836768966@s.whatsapp.net',
        '573133374132',
        '',
        '',
        ''
      ],
      cleanupInterval: 24 * 60 * 60 * 1000, // 24 horas
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
        console.log(`Eliminado archivo temporal: ${file}`);
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
    const plugin = require(file);
    if (plugin.name && plugin.run) {
      plugins.set(plugin.name, plugin);
      console.log(`Plugin cargado: ${plugin.name}`);
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
    return groupMetadata.participants.some(
      (p) => p.id === sender && p.admin
    );
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
    defaultQueryTimeoutMs: 30_000,
  });

  // Guardar credenciales
  sock.ev.on('creds.update', saveCreds);

  // Generar código de emparejamiento
  let pairingCode = null;
  if (phoneNumber) {
    pairingCode = await sock.requestPairingCode(phoneNumber);
    if (isSubBot && msg && sender) {
      await sock.sendMessage(sender, { text: `Código de vinculación para subbot ${botName}: ${pairingCode}` });
    } else if (!isSubBot) {
      console.log(`Código de emparejamiento para ${botName}: ${pairingCode}`);
    }
  }

  // Manejo de conexión
  let connected = false;
  sock.ev.on('connection.update', async (update) => {
    if (update.connection === 'closed' && !connected) {
      if (update.lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
        console.log(`${botName}: Sesión cerrada. Eliminando credenciales...`);
        await fs.rm(authPath, { recursive: true });
        if (isSubBot && sender) {
          await sock.sendMessage(sender, { text: `No fue posible conectar el subbot ${botName}. Sesión eliminada.` });
          delete subBots[botName];
        }
      } else {
        console.log(`${botName}: Conexión cerrada. Reconectando...`);
        setTimeout(() => connectBot(phoneNumber, isSubBot, botName, msg, sender), 5000);
      }
    } else if (update.connection === 'open') {
      console.log(`${botName}: Conectado!`);
      connected = true;
      if (!isSubBot) store.bind(sock.ev);
    }
  });

  // Timeout de conexión para subbots
  if (isSubBot && msg && sender) {
    setTimeout(async () => {
      if (!connected) {
        await fs.rm(authPath, { recursive: true });
        await sock.sendMessage(sender, { text: `No fue posible conectar el subbot ${botName} en 30 segundos. Sesión eliminada.` });
        delete subBots[botName];
      }
    }, 30_000);
  }

  return sock;
}

// Selección de autenticación para bot principal
async function selectAuthMethod() {
  console.log(`Selecciona el método de autenticación para ${BOT_NAME}:`);
  console.log('1. Código QR');
  console.log('2. Código de emparejamiento (8 dígitos)');
  const choice = await question('Ingresa 1 o 2: ');

  if (choice === '2') {
    const phoneNumber = await question('Ingresa el número de teléfono (ejemplo: +1234567890): ');
    return phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  }
  return null;
}

// Iniciar bot principal
async function startMainBot() {
  await fs.mkdir(authDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await loadSettings();
  await loadPlugins();

  const phoneNumber = await selectAuthMethod();
  const sock = await connectBot(phoneNumber, false, BOT_NAME);
  await handleConnection(sock);

  // Iniciar subbots desde .env
  if (process.env.SUBBOT1_PHONE) {
    subBots['SUBBOT1'] = await connectBot(process.env.SUBBOT1_PHONE, true, `SUBBOT1_${BOT_NAME}`);
    await handleConnection(subBots['SUBBOT1']);
  }

  rl.close();
}

// Manejo de mensajes
async function handleConnection(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid; // LID del chat
      const sender = msg.key.participant || msg.key.remoteJid; // LID del remitente
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || []; // LIDs mencionados (@lid)

      if (!botEnabled && !(await isOwnerOrAdmin(sock, msg, jid))) {
        continue; // Bot desactivado, solo owners/admins pueden usarlo
      }

      for (const [name, plugin] of plugins) {
        if (plugin.pattern && plugin.pattern.test(text)) {
          if (plugin.owner && !(await isOwnerOrAdmin(sock, msg, jid))) {
            await sock.sendMessage(jid, { text: 'Este comando requiere permisos de owner o admin.' });
            continue;
          }
          try {
            await plugin.run({ sock, msg, jid, text, tmpDir, plugins, sender, mentionedJids, getPhoneNumber });
          } catch (err) {
            console.error(`Error en plugin ${name}:`, err);
            await sock.sendMessage(jid, { text: 'Error al ejecutar el comando.' });
          }
        }
      }
    }
  });
}

// Iniciar bot
startMainBot().catch((err) => {
  console.error(`Error al iniciar ${BOT_NAME}:`, err);
  rl.close();
});

// Manejo de errores global
process.on('unhandledRejection', (err) => {
  console.error('Error no manejado:', err);
});
