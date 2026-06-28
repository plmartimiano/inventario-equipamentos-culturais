// api/uploadGoogleDrive.js
// Servidor para fazer upload de fotos para Google Drive
// Usando Service Account ao invés de OAuth

const { google } = require('googleapis');

// Função para obter autenticação via Service Account
function getAuthClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  
  if (!serviceAccountJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurada');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  return auth;
}

// Criar pasta no Google Drive
async function criarPasta(nomePasta, pastaParentId = '1GRA91-gmzF7gev_9IghyhZckGajnsEzB') {
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

    console.log('✅ Pasta criada:', response.data.id);
    return response.data.id;
  } catch (erro) {
    console.error('❌ Erro ao criar pasta:', erro.message);
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

    console.log('✅ Arquivo enviado:', response.data.id);
    return {
      fileId: response.data.id,
      webViewLink: response.data.webViewLink
    };
  } catch (erro) {
    console.error('❌ Erro ao fazer upload:', erro.message);
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

  console.log(`📍 Requisição: ${req.method} /api/uploadGoogleDrive`);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { acao, nomeArquivo, conteudoBase64, pastaId, nomePasta, pastaParentId } = req.body;
      
      console.log(`🔄 Ação: ${acao}`);

      if (acao === 'criar-pasta') {
        console.log(`📁 Criando pasta: ${nomePasta}`);
        const novapastaId = await criarPasta(nomePasta, pastaParentId);
        console.log(`✅ Pasta criada com ID: ${novapastaId}`);
        res.status(200).json({
          sucesso: true,
          pastaId: novapastaId,
          mensagem: `Pasta '${nomePasta}' criada com sucesso!`
        });
      } else if (acao === 'upload') {
        console.log(`📤 Fazendo upload: ${nomeArquivo}`);
        const resultado = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
        console.log(`✅ Upload concluído: ${resultado.fileId}`);
        res.status(200).json({
          sucesso: true,
          fileId: resultado.fileId,
          link: resultado.webViewLink,
          mensagem: 'Arquivo enviado com sucesso!'
        });
      } else {
        console.log(`❌ Ação inválida: ${acao}`);
        res.status(400).json({ sucesso: false, erro: 'Ação inválida' });
      }
    } catch (erro) {
      console.error(`❌ Erro no servidor:`, erro.message);
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
