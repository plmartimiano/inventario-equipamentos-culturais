// api/uploadGoogleDrive.js - v3.0 CORRIGIDO
// Servidor para fazer upload de fotos, documentos e JSON para Google Drive
// Usando Service Account

const { google } = require('googleapis');

function getAuthClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurada');
  const serviceAccount = JSON.parse(serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return auth;
}

// ============ FUNÇÃO: Criar Pasta ============
async function criarPasta(nomePasta, pastaParentId = '1GRA91-gmzF7gev_9IghyhZckGajnsEzB') {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = {
    name: nomePasta,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [pastaParentId]
  };

  const file = await drive.files.create({
    resource: fileMetadata,
    fields: 'id, webViewLink'
  });

  return {
    pastaId: file.data.id,
    link: file.data.webViewLink
  };
}

// ============ FUNÇÃO: Criar Subpasta para Equipamento ============
async function criarSubpastaEquipamento(nomeSubpasta, pastaParentId) {
  try {
    const resultado = await criarPasta(nomeSubpasta, pastaParentId);
    return {
      sucesso: true,
      subpastaId: resultado.pastaId,
      link: resultado.link,
      mensagem: `Subpasta '${nomeSubpasta}' criada com sucesso!`
    };
  } catch (erro) {
    console.error('Erro ao criar subpasta:', erro);
    return {
      sucesso: false,
      erro: erro.message,
      mensagem: `Erro ao criar subpasta: ${erro.message}`
    };
  }
}

// ============ FUNÇÃO: Upload de Arquivo (Foto/Documento) ============
async function uploadArquivo(nomeArquivo, conteudoBase64, pastaId) {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  try {
    // Decodificar base64 para buffer
    const buffer = Buffer.from(conteudoBase64, 'base64');
    console.log(`[Upload] Arquivo: ${nomeArquivo}, Tamanho: ${buffer.length} bytes`);

    // Determinar tipo MIME
    let mimeType = 'application/octet-stream';
    if (nomeArquivo.toLowerCase().endsWith('.json')) mimeType = 'application/json';
    else if (nomeArquivo.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
    else if (nomeArquivo.toLowerCase().endsWith('.jpg') || nomeArquivo.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (nomeArquivo.toLowerCase().endsWith('.png')) mimeType = 'image/png';
    else if (nomeArquivo.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';

    const fileMetadata = {
      name: nomeArquivo,
      parents: [pastaId]
    };

    // Upload usando Buffer (SEM .pipe())
    const file = await drive.files.create({
      resource: fileMetadata,
      media: {
        mimeType: mimeType,
        body: buffer
      },
      fields: 'id, webViewLink, mimeType'
    });

    console.log(`[Upload] Sucesso: ${nomeArquivo} -> ${file.data.id}`);

    return {
      fileId: file.data.id,
      link: file.data.webViewLink,
      mimeType: file.data.mimeType
    };
  } catch (erro) {
    console.error(`[Upload] Erro ao enviar ${nomeArquivo}:`, erro.message);
    throw erro;
  }
}

// ============ FUNÇÃO: Upload de JSON ============
async function uploadJSON(nomeArquivo, conteudoJSON, pastaId) {
  try {
    // Converter objeto JSON para string
    const jsonString = JSON.stringify(conteudoJSON, null, 2);
    const jsonBase64 = Buffer.from(jsonString).toString('base64');

    const resultado = await uploadArquivo(nomeArquivo, jsonBase64, pastaId);
    return {
      sucesso: true,
      fileId: resultado.fileId,
      link: resultado.link,
      mensagem: `JSON '${nomeArquivo}' salvo com sucesso!`
    };
  } catch (erro) {
    console.error(`Erro ao salvar JSON:`, erro.message);
    return {
      sucesso: false,
      erro: erro.message,
      mensagem: `Erro ao salvar JSON: ${erro.message}`
    };
  }
}

// ============ FUNÇÃO: Upload de Documento (PDF, DOC, etc) ============
async function uploadDocumento(nomeArquivo, conteudoBase64, pastaId) {
  try {
    const resultado = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
    return {
      sucesso: true,
      fileId: resultado.fileId,
      link: resultado.link,
      mimeType: resultado.mimeType,
      mensagem: `Documento '${nomeArquivo}' salvo com sucesso!`
    };
  } catch (erro) {
    console.error(`Erro ao salvar documento:`, erro.message);
    return {
      sucesso: false,
      erro: erro.message,
      mensagem: `Erro ao salvar documento: ${erro.message}`
    };
  }
}

// ============ FUNÇÃO: Upload de Foto ============
async function uploadFoto(nomeArquivo, conteudoBase64, pastaId) {
  try {
    const resultado = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
    return {
      sucesso: true,
      fileId: resultado.fileId,
      link: resultado.link,
      mimeType: resultado.mimeType,
      mensagem: `Foto '${nomeArquivo}' salva com sucesso!`
    };
  } catch (erro) {
    console.error(`Erro ao salvar foto:`, erro.message);
    return {
      sucesso: false,
      erro: erro.message,
      mensagem: `Erro ao salvar foto: ${erro.message}`
    };
  }
}

// ============ MAIN HANDLER ============
module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Response-Time, X-Powered-By, X-File-Name, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { acao, nomePasta, pastaParentId, nomeSubpasta, nomeArquivo, conteudoBase64, conteudoJSON, pastaId } = req.body;

      console.log(`[${new Date().toISOString()}] Ação: ${acao}`);

      // ========== AÇÃO: Criar Pasta do Município ==========
      if (acao === 'criar-pasta') {
        const resultado = await criarPasta(nomePasta, pastaParentId);
        res.status(200).json({
          sucesso: true,
          pastaId: resultado.pastaId,
          link: resultado.link,
          mensagem: `Pasta '${nomePasta}' criada com sucesso!`
        });
        return;
      }

      // ========== AÇÃO: Criar Subpasta de Equipamento ==========
      if (acao === 'criar-subpasta') {
        const resultado = await criarSubpastaEquipamento(nomeSubpasta, pastaParentId);
        res.status(200).json(resultado);
        return;
      }

      // ========== AÇÃO: Upload de JSON ==========
      if (acao === 'upload-json') {
        if (!pastaId) {
          res.status(400).json({
            sucesso: false,
            erro: 'pastaId obrigatório',
            mensagem: 'Informe o ID da pasta para salvar o JSON'
          });
          return;
        }

        const resultado = await uploadJSON(nomeArquivo, conteudoJSON, pastaId);
        res.status(200).json(resultado);
        return;
      }

      // ========== AÇÃO: Upload de Documento ==========
      if (acao === 'upload-documento') {
        if (!pastaId || !nomeArquivo || !conteudoBase64) {
          res.status(400).json({
            sucesso: false,
            erro: 'Parâmetros obrigatórios faltando',
            mensagem: 'Informe: pastaId, nomeArquivo, conteudoBase64'
          });
          return;
        }

        const resultado = await uploadDocumento(nomeArquivo, conteudoBase64, pastaId);
        res.status(200).json(resultado);
        return;
      }

      // ========== AÇÃO: Upload de Foto ==========
      if (acao === 'upload-foto') {
        if (!pastaId || !nomeArquivo || !conteudoBase64) {
          res.status(400).json({
            sucesso: false,
            erro: 'Parâmetros obrigatórios faltando',
            mensagem: 'Informe: pastaId, nomeArquivo, conteudoBase64'
          });
          return;
        }

        const resultado = await uploadFoto(nomeArquivo, conteudoBase64, pastaId);
        res.status(200).json(resultado);
        return;
      }

      // ========== AÇÃO: Upload genérico (compatibilidade com v2) ==========
      if (acao === 'upload') {
        if (!pastaId || !nomeArquivo || !conteudoBase64) {
          res.status(400).json({
            sucesso: false,
            erro: 'Parâmetros obrigatórios faltando',
            mensagem: 'Informe: pastaId, nomeArquivo, conteudoBase64'
          });
          return;
        }

        const resultado = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
        res.status(200).json({
          sucesso: true,
          fileId: resultado.fileId,
          link: resultado.link,
          mimeType: resultado.mimeType,
          mensagem: `Arquivo '${nomeArquivo}' salvo com sucesso!`
        });
        return;
      }

      // ========== AÇÃO DESCONHECIDA ==========
      res.status(400).json({
        sucesso: false,
        erro: 'Ação desconhecida',
        mensagem: `Ação '${acao}' não reconhecida. Use: criar-pasta, criar-subpasta, upload, upload-json, upload-documento, upload-foto`
      });

    } catch (erro) {
      console.error(`[${new Date().toISOString()}] Erro:`, erro.message);
      res.status(500).json({
        sucesso: false,
        erro: erro.message,
        mensagem: 'Erro ao processar requisição'
      });
    }
  } else {
    res.status(405).json({ erro: 'Método não permitido' });
  }
};
