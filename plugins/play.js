// plugins/play.js
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

module.exports = {
  name: 'play',
  pattern: /^play\s+(.+)$/i,
  description: 'Descarga un video de YouTube usando APIs gratuitas (YT1s, DDownr, SocialPlug)',
  async run({ sock, msg, jid, text, tmpDir }) {
    const query = text.match(/^play\s+(.+)$/i)?.[1];
    if (!query) {
      await sock.sendMessage(jid, { text: 'Proporciona un enlace o nombre de video (ejemplo: play https://youtube.com/... o play nombre canción)' });
      return;
    }

    try {
      await sock.sendMessage(jid, { text: 'Buscando y descargando video...' });

      // Buscar video en YouTube (si no es un enlace directo)
      let url = query;
      if (!query.match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/)) {
        const searchResponse = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
        const videoId = searchResponse.data.match(/watch\?v=([a-zA-Z0-9_-]+)/)?.[1];
        if (!videoId) throw new Error('No se encontró el video.');
        url = `https://www.youtube.com/watch?v=${videoId}`;
      }

      // Seleccionar API aleatoriamente
      const apis = [
        { name: 'YT1s', url: 'https://yt1s.com/api/download', method: downloadYT1s },
        { name: 'DDownr', url: 'https://ddownr.com/api/download', method: downloadDDownr },
        { name: 'SocialPlug', url: 'https://www.socialplug.io/api/download', method: downloadSocialPlug },
      ];
      const selectedApi = apis[Math.floor(Math.random() * apis.length)];

      async function downloadYT1s(videoUrl) {
        const response = await axios.post('https://yt1s.com/api/download', {
          url: videoUrl,
          format: 'mp4',
          quality: '360p',
        }, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const downloadUrl = response.data.url;
        if (!downloadUrl) throw new Error('No se encontró enlace de descarga en YT1s.');
        return downloadUrl;
      }

      async function downloadDDownr(videoUrl) {
        const response = await axios.post('https://ddownr.com/api/download', {
          url: videoUrl,
          format: 'mp4',
          quality: '720p',
        }, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const downloadUrl = response.data.download_url;
        if (!downloadUrl) throw new Error('No se encontró enlace de descarga en DDownr.');
        return downloadUrl;
      }

      async function downloadSocialPlug(videoUrl) {
        const response = await axios.post('https://www.socialplug.io/api/download', {
          url: videoUrl,
          type: 'video',
          quality: 'hd',
        }, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const downloadUrl = response.data.link;
        if (!downloadUrl) throw new Error('No se encontró enlace de descarga en SocialPlug.');
        return downloadUrl;
      }

      let downloadUrl;
      for (const api of apis) {
        try {
          await sock.sendMessage(jid, { text: `Intentando descargar con ${api.name}...` });
          downloadUrl = await api.method(url);
          break;
        } catch (err) {
          console.error(`Error con ${api.name}:`, err.message);
          if (api === apis[apis.length - 1]) {
            throw new Error('No se pudo descargar el video con ninguna API.');
          }
        }
      }

      // Descargar el video
      const fileName = `video_${Date.now()}.mp4`;
      const filePath = path.join(tmpDir, fileName);
      const videoResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
      await fs.writeFile(filePath, videoResponse.data);

      // Enviar el video
      await sock.sendMessage(jid, {
        video: { url: filePath },
        caption: `Video descargado usando ${selectedApi.name}.`,
      });
    } catch (err) {
      await sock.sendMessage(jid, { text: `Error: ${err.message}` });
    }
  },
};
