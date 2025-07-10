// plugins/lid.js
module.exports = {
  name: 'lid',
  pattern: /^lid$/i,
  description: 'Muestra el número de teléfono del remitente y mencionados',
  async run({ sock, msg, jid, sender, mentionedJids, getPhoneNumber }) {
    let response = `🔍 *Números detectados por ${BOT_NAME}*\n\n`;
    response += `👤 Remitente: ${getPhoneNumber(sender)}\n`;
    if (mentionedJids.length > 0) {
      response += `📌 Mencionados:\n${mentionedJids.map(j => ` - ${getPhoneNumber(j)}`).join('\n')}`;
    } else {
      response += `📌 No hay usuarios mencionados.`;
    }
    await sock.sendMessage(jid, { text: response });
  },
};
