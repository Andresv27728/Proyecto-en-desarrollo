// plugins/update.js
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

export default {
  name: 'update',
  owner: true,
  description: 'Actualiza el bot desde GitHub',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    try {
      await sock.sendMessage(jid, { text: `Actualizando bot desde GitHub...` });
      await execPromise('git pull origin main');
      await sock.sendMessage(jid, { text: 'Bot actualizado. Reinicia para aplicar cambios.' });
    } catch (err) {
      await sock.sendMessage(jid, { text: `Error al actualizar: ${err.message}` });
    }
  },
};
