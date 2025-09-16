// plugins/lid.js
export default {
  name: 'lid',
  description: 'Muestra el número de teléfono del remitente y mencionados',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    const getPhoneNumber = (jid) => jid.split('@')[0];

    let response = `🔍 *Números detectados*\n\n`;
    response += `👤 Remitente: ${getPhoneNumber(sender)}\n`;
    if (mentionedJids.length > 0) {
      response += `📌 Mencionados:\n${mentionedJids.map(j => ` - ${getPhoneNumber(j)}`).join('\n')}`;
    } else {
      response += `📌 No hay usuarios mencionados.`;
    }
    await sock.sendMessage(jid, { text: response });
  },
};
