module.exports = {
  name: 'code',
  pattern: /^code\s*(\+\d+)?$/i,
  description: 'Genera un código de vinculación para un subbot (enviado a tu chat privado)',
  async run({ sock, msg, jid, text, sender, connectBot, subBots }) {
    const phoneNumber = text.match(/\+\d{6,}/)?.[0];

    if (!phoneNumber) {
      await sock.sendMessage(jid, {
        text: 'Por favor, proporciona un número de teléfono. Ejemplo: code +50412345678'
      });
      return;
    }

    if (Object.keys(subBots).length >= 30) {
      await sock.sendMessage(jid, {
        text: 'Se alcanzó el límite de subbots (30). Elimina uno antes de agregar otro.'
      });
      return;
    }

    const botName = `SUBBOT_${Date.now()}`;
    subBots[botName] = await connectBot(phoneNumber, true, botName, msg, sender);
  }
};