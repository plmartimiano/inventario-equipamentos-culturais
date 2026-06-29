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

    console.log(`✅ Pasta criada:`, response.data.id);
    return response.data.id;
  } catch (error) {
    console.error('❌ Erro em criarPasta:', error.message);
    throw new Error(`Falha ao criar pasta: ${error.message}`);
  }
}

// ============================================
// FUNÇÃO: Upload de Arquivo
// ============================================
async function uploadArquivo(nomeArquivo, conteudoBase64, pastaId) {
  try {
    console.log(`📤 Upload iniciado: ${nomeArquivo} (tamanho base64: ${conteudoBase64.length} chars)`);
    
    // Validar base64
    if (!conteudoBase64 || conteudoBase64.length === 0) {
      throw new Error('Conteúdo do arquivo está vazio');
    }

    // Converter base64 para Buffer
    let buffer;
    try {
      buffer = Buffer.from(conteudoBase64, 'base64');
      console.log(`✓ Buffer criado com ${buffer.length} bytes`);
    } catch (bufferError) {
      throw new Error(`Erro ao converter base64: ${bufferError.message}`);
    }

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
    throw new Error(`Falha no upload: ${error.message}`);
  }
}

// ============================================
// FUNÇÃO: Deletar Pasta
// ============================================
async function deletarPasta(pastaId) {
  try {
    console.log(`🗑️ Deletando pasta: ${pastaId}`);
    
    const drive = getAuthClient();

    // Listar todos os arquivos dentro da pasta
    const listResponse = await drive.files.list({
      q: `'${pastaId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      pageSize: 1000
    });

    const files = listResponse.data.files || [];
    console.log(`📋 Encontrados ${files.length} arquivos para deletar`);

    // Deletar cada arquivo
    for (const file of files) {
      console.log(`🗑️ Deletando arquivo: ${file.name}`);
      await drive.files.delete({ fileId: file.id });
    }

    // Deletar a pasta
    console.log(`🗑️ Deletando pasta...`);
    await drive.files.delete({ fileId: pastaId });
    
    console.log(`✅ Pasta deletada`);
  } catch (error) {
    console.error('❌ Erro em deletarPasta:', error.message);
    throw new Error(`Falha ao deletar pasta: ${error.message}`);
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
    const { 
      acao, 
      nomePasta, 
      nomeSubpasta,
      pastaParentId, 
      nomeArquivo, 
      conteudoBase64, 
      pastaId 
    } = req.body;

    console.log(`📋 Dados recebidos:`, {
      acao,
      nomePasta,
      nomeSubpasta,
      pastaParentId: pastaParentId?.substring(0, 10) + '...' || 'vazio',
      nomeArquivo,
      conteudoBase64Length: conteudoBase64?.length || 0,
      pastaId: pastaId?.substring(0, 10) + '...' || 'vazio'
    });

    // ============================================
    // AÇÃO: criar-pasta (para município)
    // ============================================
    if (acao === 'criar-pasta') {
      if (!nomePasta || !pastaParentId) {
        return res.status(400).json({ 
          erro: 'Faltam parâmetros: nomePasta e pastaParentId' 
        });
      }

      try {
        const pastaId = await criarPasta(nomePasta, pastaParentId);
        return res.status(200).json({ 
          sucesso: true, 
          pastaId: pastaId,
          mensagem: `Pasta "${nomePasta}" criada com sucesso`
        });
      } catch (error) {
        console.error('❌ Erro ao criar pasta:', error.message);
        return res.status(500).json({
          sucesso: false,
          erro: error.message
        });
      }
    }

    // ============================================
    // AÇÃO: criar-subpasta (para equipamento)
    // ============================================
    if (acao === 'criar-subpasta') {
      const nome = nomeSubpasta || nomePasta;
      
      if (!nome || !pastaParentId) {
        return res.status(400).json({ 
          erro: 'Faltam parâmetros: nomeSubpasta (ou nomePasta) e pastaParentId',
          recebido: { nome, pastaParentId }
        });
      }

      try {
        const subpastaId = await criarPasta(nome, pastaParentId);
        return res.status(200).json({ 
          sucesso: true, 
          subpastaId: subpastaId,
          mensagem: `Subpasta "${nome}" criada com sucesso`
        });
      } catch (error) {
        console.error('❌ Erro ao criar subpasta:', error.message);
        return res.status(500).json({
          sucesso: false,
          erro: error.message
        });
      }
    }

    // ============================================
    // AÇÃO: upload-foto
    // ============================================
    if (acao === 'upload-foto') {
      if (!nomeArquivo || !conteudoBase64 || !pastaId) {
        return res.status(400).json({ 
          erro: 'Faltam parâmetros: nomeArquivo, conteudoBase64, pastaId',
          recebido: { 
            nomeArquivo: nomeArquivo ? 'OK' : 'VAZIO',
            conteudoBase64Length: conteudoBase64?.length || 0, 
            pastaId: pastaId ? 'OK' : 'VAZIO'
          }
        });
      }

      try {
        const link = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
        return res.status(200).json({ 
          sucesso: true, 
          link: link,
          mensagem: `Foto "${nomeArquivo}" uploadada com sucesso`
        });
      } catch (error) {
        console.error('❌ Erro ao fazer upload de foto:', error.message);
        return res.status(500).json({
          sucesso: false,
          erro: error.message
        });
      }
    }

    // ============================================
    // AÇÃO: upload-documento
    // ============================================
    if (acao === 'upload-documento') {
      if (!nomeArquivo || !conteudoBase64 || !pastaId) {
        return res.status(400).json({ 
          erro: 'Faltam parâmetros: nomeArquivo, conteudoBase64, pastaId',
          recebido: { 
            nomeArquivo: nomeArquivo ? 'OK' : 'VAZIO',
            conteudoBase64Length: conteudoBase64?.length || 0, 
            pastaId: pastaId ? 'OK' : 'VAZIO'
          }
        });
      }

      try {
        const link = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
        return res.status(200).json({ 
          sucesso: true, 
          link: link,
          mensagem: `Documento "${nomeArquivo}" uploadado com sucesso`
        });
      } catch (error) {
        console.error('❌ Erro ao fazer upload de documento:', error.message);
        return res.status(500).json({
          sucesso: false,
          erro: error.message
        });
      }
    }

    // ============================================
    // AÇÃO: deletar-pasta
    // ============================================
    if (acao === 'deletar-pasta') {
      if (!pastaId) {
        return res.status(400).json({ 
          erro: 'Faltam parâmetros: pastaId' 
        });
      }

      try {
        await deletarPasta(pastaId);
        return res.status(200).json({ 
          sucesso: true, 
          mensagem: `Pasta deletada com sucesso`
        });
      } catch (error) {
        console.error('❌ Erro ao deletar pasta:', error.message);
        return res.status(500).json({
          sucesso: false,
          erro: error.message
        });
      }
    }

    // ============================================
    // AÇÃO DESCONHECIDA
    // ============================================
    return res.status(400).json({ 
      erro: `Ação desconhecida: ${acao}`,
      acoesDisponíveis: ['criar-pasta', 'criar-subpasta', 'upload-foto', 'upload-documento', 'deletar-pasta']
    });

  } catch (error) {
    console.error('\n❌ ERRO GERAL NA API:');
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    
    return res.status(500).json({ 
      sucesso: false,
      erro: 'Erro interno do servidor',
      mensagem: error.message
    });
  }
};
