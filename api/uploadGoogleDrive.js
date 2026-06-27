const { google } = require('googleapis');

module.exports = async (req, res) => {
  // CORS
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
    const { acao, nomeArquivo, conteudoBase64, pastaId, nomePasta, pastaParentId } = req.body;
    
    // Carregar credenciais da Service Account
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      return res.status(500).json({ sucesso: false, erro: 'Service Account não configurada' });
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    const drive = google.drive({ version: 'v3', auth });

    if (acao === 'criar-pasta') {
      // Criar pasta
      const response = await drive.files.create({
        requestBody: {
          name: nomePasta,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [pastaParentId || '1GRA91-gmzF7gev_9IghyhZckGajnsEzB']
        },
        fields: 'id'
      });

      return res.status(200).json({
        sucesso: true,
        pastaId: response.data.id,
        mensagem: `Pasta '${nomePasta}' criada com sucesso!`
      });
    } 
    else if (acao === 'upload') {
      // Fazer upload
      const buffer = Buffer.from(conteudoBase64, 'base64');
      
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

      return res.status(200).json({
        sucesso: true,
        fileId: response.data.id,
        link: response.data.webViewLink,
        mensagem: 'Arquivo enviado com sucesso!'
      });
    }
    else {
      return res.status(400).json({ sucesso: false, erro: 'Ação inválida' });
    }
  } 
  catch (erro) {
    console.error('Erro:', erro);
    return res.status(500).json({
      sucesso: false,
      erro: erro.message
    });
  }
};
