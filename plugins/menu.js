export default {
  name: 'menú',
  description: 'Muestra el menú de comandos',
  execute: async (sock, msg, args) => {
    const menu = `
*Menú de comandos:*
- menú: Muestra este menú
- hola: Saluda
- info: Información del bot
    `
    await sock.sendMessage(msg.key.remoteJid, { text: menu })
  }
}
