export default {
  name: 'code',
  description: 'Genera un código de vinculación para un subbot (actualmente deshabilitado)',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    await sock.sendMessage(jid, {
      text: 'Lo siento, la función de crear sub-bots está actualmente deshabilitada.'
    });
    // const text = msg.message.conversation;
    // const sender = msg.key.participant || msg.key.remoteJid;
    // const phoneNumber = text.match(/\+\d{6,}/)?.[0];

    // if (!phoneNumber) {
    //   await sock.sendMessage(jid, {
    //     text: 'Por favor, proporciona un número de teléfono. Ejemplo: code +50412345678'
    //   });
    //   return;
    // }

    // console.log('La función de sub-bots no está implementada en main.js');
    // if (Object.keys(subBots).length >= 30) {
    //   await sock.sendMessage(jid, {
    //     text: 'Se alcanzó el límite de subbots (30). Elimina uno antes de agregar otro.'
    //   });
    //   return;
    // }

    // const botName = `SUBBOT_${Date.now()}`;
    // subBots[botName] = await connectBot(phoneNumber, true, botName, msg, sender);
  }
};