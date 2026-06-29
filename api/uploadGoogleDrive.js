const { google } = require('googleapis');

// ============================================
// FUNÇÃO: Autenticar com Google
// ============================================
function getAuthClient() {
  try {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    
    if (!serviceAccountJson) {
      throw new Error('❌ GOOGLE_SERVICE_ACCOUNT_JSON não configurada na Vercel');
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (parseError) {
      throw new Error(`❌ Erro ao fazer parse do JSON: ${parseError.message}`);
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('❌ Erro em getAuthClient:', error.message);
    throw error;
  }
}

// ============================================
// FUNÇÃO: Criar pasta no Google Drive
// ============================================
async function criarPasta(nomePasta, pastaParentId) {
  try {
    console.log(`📁 Criando pasta: "${nomePasta}" em ${pastaParentId}`);
    
    const drive = getAuthClient();
    
    const response = await drive.files.create({
      requestBody: {
        name: nomePasta,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pastaParentId]
      },
      fields: 'id, name'
    });

    console.log(`✅ Pasta criada: ${response.data.name} (ID: ${response.data.id})`);
    return response.data.id;
  } catch (error) {
    console.error('❌ Erro em criarPasta:', error.message);
    throw error;
  }
}

// ============================================
// FUNÇÃO: Upload de arquivo
// ============================================
async function uploadArquivo(nomeArquivo, conteudoBase64, pastaId) {
  try {
    console.log(`📤 Upload iniciado: ${nomeArquivo} (tamanho base64: ${conteudoBase64.length} chars)`);
    
    // Validar base64
    if (!conteudoBase64 || conteudoBase64.length === 0) {
      throw new Error('❌ Conteúdo do arquivo está vazio');
    }

    // Converter base64 para Buffer
    let buffer;
    try {
      buffer = Buffer.from(conteudoBase64, 'base64');
    } catch (bufferError) {
      throw new Error(`❌ Erro ao converter base64 para Buffer: ${bufferError.message}`);
    }

    console.log(`✓ Buffer criado com ${buffer.length} bytes`);

    const drive = getAuthClient();

    // Detectar MIME type
    let mimeType = 'application/octet-stream';
    if (nomeArquivo.endsWith('.jpg') || nomeArquivo.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (nomeArquivo.endsWith('.png')) mimeType = 'image/png';
    else if (nomeArquivo.endsWith('.gif')) mimeType = 'image/gif';
    else if (nomeArquivo.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (nomeArquivo.endsWith('.docx')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    console.log(`✓ MIME type: ${mimeType}`);

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
      fields: 'id, name, webViewLink'
    });

    console.log(`✅ Arquivo uploadado: ${response.data.name} (ID: ${response.data.id})`);
    return response.data.webViewLink;
  } catch (error) {
    console.error('❌ Erro em uploadArquivo:', error.message);
    throw error;
  }
}

// ============================================
// HANDLER PRINCIPAL
// ============================================
module.exports = async (req, res) => {
  console.log('\n========== NOVA REQUISIÇÃO ==========');
  console.log(`Método: ${req.method}`);
  console.log(`Ação: ${req.body?.acao || 'nenhuma'}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const { acao, nomePasta, pastaParentId, nomeArquivo, conteudoBase64, subpastaId } = req.body;

    console.log(`📋 Dados recebidos:`, {
      acao,
      nomePasta,
      pastaParentId: pastaParentId?.substring(0, 10) + '...',
      nomeArquivo,
      conteudoBase64Length: conteudoBase64?.length || 0,
      subpastaId: subpastaId?.substring(0, 10) + '...'
    });

    // ============================================
    // AÇÃO: criar-pasta
    // ============================================
    if (acao === 'criar-pasta') {
      if (!nomePasta || !pastaParentId) {
        return res.status(400).json({ 
          erro: 'Faltam parâmetros: nomePasta e pastaParentId' 
        });
      }

      const pastaId = await criarPasta(nomePasta, pastaParentId);
      return res.status(200).json({ 
        sucesso: true, 
        pastaId: pastaId,
        mensagem: `Pasta "${nomePasta}" criada com sucesso`
      });
    }

    // ============================================
    // AÇÃO: criar-subpasta
    // ============================================
    if (acao === 'criar-subpasta') {
      if (!nomePasta || !subpastaId) {
        return res.status(400).json({ 
          erro: 'Faltam parâmetros: nomePasta e subpastaId' 
        });
      }

      const pastaId = await criarPasta(nomePasta, subpastaId);
      return res.status(200).json({ 
        sucesso: true, 
        pastaId: pastaId,
        mensagem: `Subpasta "${nomePasta}" criada com sucesso`
      });
    }

    // ============================================
    // AÇÃO: upload
    // ============================================
    if (acao === 'upload' || acao === 'upload-foto' || acao === 'upload-documento') {
      if (!nomeArquivo || !conteudoBase64 || !pastaId) {
        return res.status(400).json({ 
          erro: 'Faltam parâmetros: nomeArquivo, conteudoBase64, pastaId' 
        });
      }

      const link = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
      return res.status(200).json({ 
        sucesso: true, 
        link: link,
        mensagem: `Arquivo "${nomeArquivo}" uploadado com sucesso`
      });
    }

    // ============================================
    // AÇÃO DESCONHECIDA
    // ============================================
    return res.status(400).json({ 
      erro: `Ação desconhecida: ${acao}` 
    });

  } catch (error) {
    console.error('\n❌ ERRO NA API:');
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      erro: 'Erro ao processar requisição',
      detalhes: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
