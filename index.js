const { Boom } = require('@hapi/boom');
const baileys = require('@whiskeysockets/baileys');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = baileys;

// Importa el store así:
const makeInMemoryStore = require('@whiskeysockets/baileys/lib/Stores/inMemory')?.makeInMemoryStore

const pino = require('pino');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const readline = require('readline');

if (!makeInMemoryStore) throw new Error('No se pudo cargar makeInMemoryStore');

const logger = pino({ level: 'silent' });
const store = makeInMemoryStore({ logger });
store.readFromFile('./store.json');
setInterval(() => store.writeToFile('./store.json'), 10_000);

const authDir = './auth';
const pluginsDir = './plugins';
const tmpDir = './tmp';
const settingsFile = './settings.json';
const BOT_NAME = '✧ ೃ 𝐒𝐘𝐀 𝐓𝐄𝐀𝐌 ೃ ✧';

const MAX_SUBBOTS = 30;
const subBots = {};

const getPhoneNumber = (jid) => jid?.split('@')[0] || 'Desconocido';

let settings = { owners: [] };

async function loadSettings() {
  try {
    settings = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
  } catch {
    console.log('No se encontró settings.json, creando uno por defecto...');
    settings = {
      owners: [
        '176742836768966@s.whatsapp.net',
        '573133374132',
        '', '', ''
      ],
      cleanupInterval: 24 * 60 * 60 * 1000,
    };
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
  }
}

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

const plugins = new Map();
async function loadPlugins() {
  await fs.mkdir(pluginsDir, { recursive: true });
  const pluginFiles = (await fs.readdir(pluginsDir, { withFileTypes: true }))
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.js'))
    .map((dirent) => path.join(pluginsDir, dirent.name));

  for (const file of pluginFiles) {
    try {
      const plugin = require(path.resolve(file));
      if (plugin.name && plugin.run) {
        plugins.set(plugin.name, plugin);
        console.log(`Plugin cargado: ${plugin.name}`);
      }
    } catch (e) {
      console.error(`Error al cargar ${file}:`, e);
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

let botEnabled = true;

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

async function connectBot(phoneNumber = null, isSubBot = false, botName = BOT_NAME, msg = null, sender = null) {
  const authPath = path.join(authDir, isSubBot ? `subbot_${botName}` : 'main_bot');
  if (!fsSync.existsSync(authPath)) fsSync.mkdirSync(authPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: !phoneNumber && !isSubBot && !fsSync.existsSync(path.join(authPath, 'creds.json')),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    defaultQueryTimeoutMs: 30_000,
    browser: ['Ubuntu', 'Chrome', '108.0.5359.125'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    const code = (lastDisconnect?.error)?.output?.statusCode;

    if (connection === 'open') {
      console.log(`${botName}: Conectado!`);
      if (!isSubBot) store.bind(sock.ev);
    }
    if (connection === 'close' && !isSubBot) {
      console.log(`${botName}: Conexión cerrada. Código:`, code);
      if (code === DisconnectReason.loggedOut) {
        console.log(`${botName}: Sesión cerrada. Eliminando credenciales...`);
        await fs.rm(authPath, { recursive: true, force: true });
        process.exit(1);
      } else {
        console.log(`${botName}: Reconectando...`);
        setTimeout(() => connectBot(phoneNumber, isSubBot, botName, msg, sender), 5000);
      }
    }
  });

  if (phoneNumber) {
    setTimeout(async () => {
      try {
        if (typeof sock.requestPairingCode === 'function') {
          const code = await sock.requestPairingCode(phoneNumber);
          if (isSubBot && msg && sender) {
            await sock.sendMessage(sender, { text: `Código de vinculación para subbot ${botName}: ${code}` });
          } else {
            console.log(`Código de emparejamiento para ${botName}: ${code}`);
          }
          console.log('WhatsApp > Dispositivos vinculados > Vincular > Usar código');
        } else {
          console.log('requestPairingCode no está disponible en esta versión de baileys.');
        }
      } catch (e) {
        console.error(`Error generando código de emparejamiento para ${botName}:`, e);
      }
    }, 2500);
  }

  if (isSubBot && msg && sender) {
    let connected = false;
    sock.ev.on('connection.update', (upd) => {
      if (upd.connection === 'open') connected = true;
    });
    setTimeout(async () => {
      if (!connected) {
        await fs.rm(authPath, { recursive: true, force: true });
        await sock.sendMessage(sender, { text: `No fue posible conectar el subbot ${botName} en 30 segundos. Sesión eliminada.` });
        delete subBots[botName];
      }
    }, 30_000);
  }

  return sock;
}

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

async function handleConnection(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      const sender = msg.key.participant || msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

      if (!botEnabled && !(await isOwnerOrAdmin(sock, msg, jid))) {
        continue;
      }

      for (const [name, plugin] of plugins) {
        if (plugin.pattern && plugin.pattern.test(text)) {
          if (plugin.owner && !(await isOwnerOrAdmin(sock, msg, jid))) {
            await sock.sendMessage(jid, { text: 'Este comando requiere permisos de owner o admin.' });
            continue;
          }
          try {
            await plugin.run({
              sock,
              msg,
              jid,
              text,
              tmpDir,
              plugins,
              sender,
              mentionedJids,
              getPhoneNumber,
              connectBot,
              subBots
            });
          } catch (err) {
            console.error(`Error en plugin ${name}:`, err);
            await sock.sendMessage(jid, { text: 'Error al ejecutar el comando.' });
          }
        }
      }
    }
  });
}

async function startMainBot() {
  await fs.mkdir(authDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await loadSettings();
  await loadPlugins();

  const phoneNumber = await selectAuthMethod();
  const sock = await connectBot(phoneNumber, false, BOT_NAME);
  await handleConnection(sock);

  if (process.env.SUBBOT1_PHONE) {
    subBots['SUBBOT1'] = await connectBot(process.env.SUBBOT1_PHONE, true, `SUBBOT1_${BOT_NAME}`);
    await handleConnection(subBots['SUBBOT1']);
  }

  rl.close();
}

startMainBot().catch((err) => {
  console.error(`Error al iniciar ${BOT_NAME}:`, err);
  rl.close();
});

process.on('unhandledRejection', (err) => {
  console.error('Error no manejado:', err);
});

// Helper function para hacer cache de keys (usada arriba)
function makeCacheableSignalKeyStore(keys, logger) {
  const store = new Map(Object.entries(keys || {}));
  return {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    delete: (key) => store.delete(key),
    isTrusted: (key) => true,
    logger,
  };
}