// api/uploadGoogleDrive.js
// Servidor para fazer upload de fotos para Google Drive

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Configurações
const GOOGLE_DRIVE_CONFIG = {
  CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
  PASTA_MAE_ID: '1GRA91-gmzF7gev_9IghyhZckGajnsEzB'
};

// Autenticação Google
function getAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_DRIVE_CONFIG.CLIENT_ID,
    GOOGLE_DRIVE_CONFIG.CLIENT_SECRET,
    'http://localhost:8000/callback'
  );

  oauth2Client.setCredentials({
    refresh_token: GOOGLE_DRIVE_CONFIG.REFRESH_TOKEN
  });

  return oauth2Client;
}

// Criar pasta no Google Drive
async function criarPasta(nomePasta, pastaParentId = GOOGLE_DRIVE_CONFIG.PASTA_MAE_ID) {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.create({
      requestBody: {
        name: nomePasta,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pastaParentId]
      },
      fields: 'id'
    });

    return response.data.id;
  } catch (erro) {
    console.error('Erro ao criar pasta:', erro);
    throw erro;
  }
}

// Fazer upload de arquivo
async function uploadArquivo(nomeArquivo, conteudoBase64, pastaId) {
  try {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    // Converter base64 para buffer
    const buffer = Buffer.from(conteudoBase64, 'base64');

    // Upload
    const response = await drive.files.create({
      requestBody: {
        name: nomeArquivo,
        parents: [pastaId]
      },
      media: {
        mimeType: 'image/jpeg',
        body: buffer
      },
      fields: 'id, webViewLink'
    });

    return {
      fileId: response.data.id,
      webViewLink: response.data.webViewLink
    };
  } catch (erro) {
    console.error('Erro ao fazer upload:', erro);
    throw erro;
  }
}

// Endpoint Vercel
module.exports = async (req, res) => {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { acao, nomeArquivo, conteudoBase64, pastaId, nomePasta, pastaParentId } = req.body;

      if (acao === 'criar-pasta') {
        // Criar nova pasta
        const novapastaId = await criarPasta(nomePasta, pastaParentId);
        res.status(200).json({
          sucesso: true,
          pastaId: novapastaId,
          mensagem: `Pasta '${nomePasta}' criada com sucesso!`
        });
      } else if (acao === 'upload') {
        // Fazer upload de arquivo
        const resultado = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
        res.status(200).json({
          sucesso: true,
          fileId: resultado.fileId,
          link: resultado.webViewLink,
          mensagem: 'Arquivo enviado com sucesso!'
        });
      } else {
        res.status(400).json({ sucesso: false, erro: 'Ação inválida' });
      }
    } catch (erro) {
      res.status(500).json({
        sucesso: false,
        erro: erro.message,
        detalhes: erro.toString()
      });
    }
  } else {
    res.status(405).json({ erro: 'Método não permitido' });
  }
};
