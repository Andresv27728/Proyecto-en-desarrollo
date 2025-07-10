// plugins/menu.js
module.exports = {
  name: 'menu',
  pattern: /^menu$/i,
  description: 'Muestra la lista de comandos disponibles',
  async run({ sock, msg, jid, plugins }) {
    let menuText = `📋 *Menú de ${BOT_NAME}*\n\n`;
    for (const [name, plugin] of plugins) {
      const description = plugin.description || 'Sin descripción';
      const restricted = plugin.owner ? ' (Owner/Admin)' : '';
      menuText += `🔹 *${name}*: ${description}${restricted}\n`;
    }
    menuText += `\nEscribe un comando para usarlo (ejemplo: menu, play <url>)`;
    await sock.sendMessage(jid, { text: menuText });
  },
};
