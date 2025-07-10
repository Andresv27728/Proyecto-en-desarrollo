// plugins/update.js
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
  name: 'update',
  pattern: /^update$/i,
  owner: true,
  description: 'Actualiza el bot desde GitHub',
  async run({ sock, msg, jid }) {
    try {
      await sock.sendMessage(jid, { text: `Actualizando ${BOT_NAME} desde GitHub...` });
      await execPromise('git pull origin main');
      await sock.sendMessage(jid, { text: 'Bot actualizado. Reinicia para aplicar cambios.' });
    } catch (err) {
      await sock.sendMessage(jid, { text: `Error al actualizar: ${err.message}` });
    }
  },
};
