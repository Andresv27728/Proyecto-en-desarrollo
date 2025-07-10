// plugins/enable.js
module.exports = {
  name: 'enable',
  pattern: /^enable$/i,
  owner: true,
  description: 'Activa el bot para todos los usuarios',
  async run({ sock, msg, jid }) {
    botEnabled = true;
    await sock.sendMessage(jid, { text: `${BOT_NAME} activado.` });
  },
};
