import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import fs from 'fs'
import path from 'path'

const pluginsDir = path.join(process.cwd(), 'plugins')
const plugins = new Map()

// Cargar plugins dinámicamente
for (const file of fs.readdirSync(pluginsDir)) {
  if (file.endsWith('.js')) {
    const plugin = await import(path.join(pluginsDir, file))
    plugins.set(plugin.default.name.toLowerCase(), plugin.default)
  }
}

global.botEnabled = true;

async function startBot() {
  console.log('Iniciando conexión con WhatsApp...')

  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')

  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Conexión cerrada, reconnect:', shouldReconnect)
      if (shouldReconnect) startBot()
    } else if (connection === 'open') {
      console.log('Conectado a WhatsApp correctamente')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue
      const text = msg.message.conversation?.toLowerCase()?.trim()
      if (!text) continue

      // Buscar plugin cuyo nombre coincida con el mensaje
      const plugin = plugins.get(text)
      if (plugin) {
        // Check if bot is disabled
        if (!global.botEnabled && !plugin.owner) {
          return;
        }

        // A simple owner check
        const ownerJid = 'your_jid_here@s.whatsapp.net'; // TODO: Make this configurable
        if (plugin.owner && msg.key.remoteJid !== ownerJid) {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Este comando es solo para el propietario del bot.' });
            return;
        }

        try {
          await plugin.execute(sock, msg, [])
        } catch (err) {
          console.error('Error ejecutando plugin:', err)
        }
      }
    }
  })
}

startBot()
