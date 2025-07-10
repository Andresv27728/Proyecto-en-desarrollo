// plugins/disable.js
module.exports = {
  name: 'disable',
  pattern: /^disable$/i,
  owner: true,
  description: 'Desactiva el bot para usuarios no privilegiados',
  async run({ sock, msg, jid }) {
    botEnabled = false;
    await sock.sendMessage(jid, { text: `${BOT_NAME} desactivado.` });
  },
};
