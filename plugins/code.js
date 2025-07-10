// plugins/code.js
module.exports = {
  name: 'code',
  pattern: /^code\s*(\+\d+)?$/i,
  description: 'Genera un código de vinculación para un subbot (enviado a tu chat privado)',
  async run({ sock, msg, jid, text, sender }) {
    const phoneNumber = text.match(/^\+\d+$/)?.[0];
    if (!phoneNumber) {
      await sock.sendMessage(jid, { text: 'Por favor, proporciona un número de teléfono (ejemplo: code +1234567890)' });
      return;
    }

    if (Object.keys(subBots).length >= 30) {
      await sock.sendMessage(jid, { text: 'Límite de 30 subbots alcanzado. Elimina un subbot para agregar otro.' });
      return;
    }

    const botName = `SUBBOT_${Date.now()}`;
    subBots[botName] = await connectBot(phoneNumber, true, botName, msg, sender);
  },
};
