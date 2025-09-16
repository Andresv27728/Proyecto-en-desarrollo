// plugins/disable.js
export default {
  name: 'disable',
  owner: true,
  description: 'Desactiva el bot para usuarios no privilegiados',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    // This assumes botEnabled is a global variable managed in main.js
    global.botEnabled = false;
    await sock.sendMessage(jid, { text: `Bot desactivado.` });
  },
};
