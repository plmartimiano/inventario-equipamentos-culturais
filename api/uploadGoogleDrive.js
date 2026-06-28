// api/uploadGoogleDrive.js - ULTRA SIMPLES (sem pipe)
const { google } = require('googleapis');

function getAuthClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurada');
  const serviceAccount = JSON.parse(serviceAccountJson);
  return new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
}

async function criarPasta(nomePasta, pastaParentId) {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  
  const file = await drive.files.create({
    resource: {
      name: nomePasta,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [pastaParentId]
    },
    fields: 'id, webViewLink'
  });

  return { pastaId: file.data.id, link: file.data.webViewLink };
}

async function uploadArquivo(nomeArquivo, conteudoBase64, pastaId) {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const buffer = Buffer.from(conteudoBase64, 'base64');
  
  let mimeType = 'application/octet-stream';
  if (nomeArquivo.endsWith('.pdf')) mimeType = 'application/pdf';
  else if (nomeArquivo.endsWith('.jpg') || nomeArquivo.endsWith('.jpeg')) mimeType = 'image/jpeg';
  else if (nomeArquivo.endsWith('.png')) mimeType = 'image/png';
  else if (nomeArquivo.endsWith('.json')) mimeType = 'application/json';

  const file = await drive.files.create({
    resource: {
      name: nomeArquivo,
      parents: [pastaId]
    },
    media: {
      mimeType: mimeType,
      body: buffer
    },
    fields: 'id, webViewLink'
  });

  return { fileId: file.data.id, link: file.data.webViewLink };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Método não permitido' });
    return;
  }

  try {
    const { acao, nomePasta, pastaParentId, nomeSubpasta, nomeArquivo, conteudoBase64, pastaId } = req.body;

    if (acao === 'criar-pasta') {
      const resultado = await criarPasta(nomePasta, pastaParentId);
      res.status(200).json({ sucesso: true, pastaId: resultado.pastaId, link: resultado.link });
      return;
    }

    if (acao === 'criar-subpasta') {
      const resultado = await criarPasta(nomeSubpasta, pastaParentId);
      res.status(200).json({ sucesso: true, subpastaId: resultado.pastaId, link: resultado.link });
      return;
    }

    if (acao === 'upload-foto' || acao === 'upload-documento' || acao === 'upload') {
      if (!pastaId || !nomeArquivo || !conteudoBase64) {
        res.status(400).json({ sucesso: false, erro: 'Parâmetros faltando' });
        return;
      }
      const resultado = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
      res.status(200).json({ sucesso: true, fileId: resultado.fileId, link: resultado.link });
      return;
    }

    res.status(400).json({ sucesso: false, erro: 'Ação desconhecida' });

  } catch (erro) {
    console.error('Erro:', erro.message);
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
};
