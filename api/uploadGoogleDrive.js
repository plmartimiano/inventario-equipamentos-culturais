const { google } = require('googleapis');

function getAuthClient() {
  try {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurada');
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Erro em getAuthClient:', error.message);
    throw error;
  }
}

async function criarPasta(nomePasta, pastaParentId) {
  try {
    const drive = getAuthClient();
    const response = await drive.files.create({
      requestBody: {
        name: nomePasta,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pastaParentId]
      },
      fields: 'id'
    });
    return response.data.id;
  } catch (error) {
    throw new Error(`Erro ao criar pasta: ${error.message}`);
  }
}

async function uploadArquivo(nomeArquivo, conteudoBase64, pastaId) {
  try {
    if (!conteudoBase64 || conteudoBase64.length === 0) {
      throw new Error('Arquivo vazio');
    }
    
    const buffer = Buffer.from(conteudoBase64, 'base64');
    
    let mimeType = 'application/octet-stream';
    if (nomeArquivo.endsWith('.jpg') || nomeArquivo.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (nomeArquivo.endsWith('.png')) mimeType = 'image/png';
    else if (nomeArquivo.endsWith('.gif')) mimeType = 'image/gif';
    else if (nomeArquivo.endsWith('.pdf')) mimeType = 'application/pdf';

    const drive = getAuthClient();
    const response = await drive.files.create({
      requestBody: {
        name: nomeArquivo,
        mimeType: mimeType,
        parents: [pastaId]
      },
      media: {
        mimeType: mimeType,
        body: buffer
      },
      fields: 'id, webViewLink'
    });

    return response.data.webViewLink;
  } catch (error) {
    throw new Error(`Erro no upload: ${error.message}`);
  }
}

async function deletarPasta(pastaId) {
  try {
    const drive = getAuthClient();
    
    const listResponse = await drive.files.list({
      q: `'${pastaId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id)',
      pageSize: 1000
    });

    const files = listResponse.data.files || [];
    for (const file of files) {
      await drive.files.delete({ fileId: file.id });
    }
    
    await drive.files.delete({ fileId: pastaId });
  } catch (error) {
    throw new Error(`Erro ao deletar: ${error.message}`);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const { acao, nomePasta, nomeSubpasta, pastaParentId, nomeArquivo, conteudoBase64, pastaId } = req.body;

    // Criar pasta
    if (acao === 'criar-pasta') {
      if (!nomePasta || !pastaParentId) {
        return res.status(400).json({ erro: 'Faltam parâmetros' });
      }
      const id = await criarPasta(nomePasta, pastaParentId);
      return res.status(200).json({ sucesso: true, pastaId: id });
    }

    // Criar subpasta
    if (acao === 'criar-subpasta') {
      const nome = nomeSubpasta || nomePasta;
      if (!nome || !pastaParentId) {
        return res.status(400).json({ erro: 'Faltam parâmetros' });
      }
      const id = await criarPasta(nome, pastaParentId);
      return res.status(200).json({ sucesso: true, subpastaId: id });
    }

    // Upload foto
    if (acao === 'upload-foto') {
      if (!nomeArquivo || !conteudoBase64 || !pastaId) {
        return res.status(400).json({ erro: 'Faltam parâmetros' });
      }
      const link = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
      return res.status(200).json({ sucesso: true, link: link });
    }

    // Upload documento
    if (acao === 'upload-documento') {
      if (!nomeArquivo || !conteudoBase64 || !pastaId) {
        return res.status(400).json({ erro: 'Faltam parâmetros' });
      }
      const link = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
      return res.status(200).json({ sucesso: true, link: link });
    }

    // Deletar pasta
    if (acao === 'deletar-pasta') {
      if (!pastaId) {
        return res.status(400).json({ erro: 'Faltam parâmetros' });
      }
      await deletarPasta(pastaId);
      return res.status(200).json({ sucesso: true });
    }

    return res.status(400).json({ erro: 'Ação inválida' });
  } catch (error) {
    console.error('ERRO:', error.message);
    return res.status(500).json({ sucesso: false, erro: error.message });
  }
};
