// plugins/enable.js
export default {
  name: 'enable',
  owner: true,
  description: 'Activa el bot para todos los usuarios',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    // This assumes botEnabled is a global variable managed in main.js
    global.botEnabled = true;
    await sock.sendMessage(jid, { text: `Bot activado.` });
  },
};
