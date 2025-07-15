export default {
  name: 'hola',
  description: 'Saluda al usuario',
  execute: async (sock, msg, args) => {
    await sock.sendMessage(msg.key.remoteJid, { text: '¡Hola! ¿En qué puedo ayudarte?' })
  }
}
