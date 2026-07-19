const { google } = require('googleapis');
const { Readable } = require('stream');

// ============================================
// CARREGAR CREDENCIAIS DA VARIÁVEL DE AMBIENTE
// ============================================

let auth;
let serviceAccount;

try {
  // Tentar ler da variável de ambiente do Vercel
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  
  if (credentialsJson) {
    serviceAccount = JSON.parse(credentialsJson);
    console.log('✅ Credenciais carregadas da variável de ambiente');
  } else {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS_JSON não está definida');
  }

  if (serviceAccount) {
    auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    console.log('✅ Auth configurada com sucesso');
  }
} catch (error) {
  console.error('❌ Erro ao carregar credenciais:', error.message);
}

const SHARED_DRIVE_ID = '0AOfgJt_U5vcPUk9PVA'; // Shared Drive
const PASTA_EQUIPAMENTOS_ID = '1GRA91-gmzF7gev_9IghyhZckGajnsEzB'; // ✅ Pasta raiz padrão
const drive = google.drive({ version: 'v3', auth });

// ============================================
// FUNÇÕES
// ============================================

async function criarPasta(nome, pastaRaizId = SHARED_DRIVE_ID) {
  try {
    console.log(`[API] Criando pasta: "${nome}" dentro de: "${pastaRaizId}"`);
    
    const result = await drive.files.create({
      resource: {
        name: nome,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pastaRaizId],
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
      supportsTeamDrives: true,
    });

    console.log(`[API] ✅ Pasta criada com sucesso!`);
    console.log(`[API] ID da pasta: ${result.data.id}`);
    console.log(`[API] Nome: ${result.data.name}`);
    console.log(`[API] Link: ${result.data.webViewLink}`);

    return result.data;
  } catch (error) {
    console.error('❌ Erro ao criar pasta:', error.message);
    throw new Error(`Erro ao criar pasta: ${error.message}`);
  }
}

async function uploadArquivo(nomeArquivo, conteudoBase64, pastaId) {
  try {
    // Converter Base64 para Buffer
    const buffer = Buffer.from(conteudoBase64, 'base64');
    
    // Converter Buffer em Stream
    const stream = Readable.from(buffer);

    const result = await drive.files.create({
      resource: {
        name: nomeArquivo,
        parents: [pastaId],
      },
      media: {
        body: stream,
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
      supportsTeamDrives: true,
    });

    return result.data;
  } catch (error) {
    console.error('❌ Erro ao fazer upload:', error.message);
    throw new Error(`Erro ao fazer upload: ${error.message}`);
  }
}

async function deletarPasta(pastaId) {
  try {
    if (!pastaId) {
      throw new Error('pastaId não fornecido');
    }

    console.log(`[API] Deletando pasta: ${pastaId}`);

    // ✅ Verificar se a pasta existe primeiro
    try {
      const fileInfo = await drive.files.get({
        fileId: pastaId,
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
        supportsTeamDrives: true,
      });
      console.log(`[API] ✅ Pasta encontrada:`, fileInfo.data.name);
    } catch (checkError) {
      console.error(`[API] ⚠️ Pasta não encontrada ou sem acesso:`, checkError.message);
      throw new Error(`Pasta não encontrada ou sem acesso: ${checkError.message}`);
    }

    // Deletar a pasta. Não é necessário conceder permissão de "owner" antes: itens
    // dentro de um Drive Compartilhado não têm dono individual (a Service Account já
    // tem acesso suficiente para apagar o que ela mesma criou dentro do Drive), e a
    // API do Google rejeita role:"owner" para itens de Drive Compartilhado de qualquer forma.
    try {
      await drive.files.delete({
        fileId: pastaId,
        supportsAllDrives: true,
        supportsTeamDrives: true,
      });
    } catch (deleteError) {
      // A pasta foi encontrada acima (files.get funcionou), mas o delete falhou.
      // O Google costuma mascarar "sem permissão" como "não encontrado" em Drives
      // Compartilhados — isso quase sempre significa que a Service Account não tem
      // papel de "Gerente de conteúdo" (ou superior) no Drive Compartilhado.
      console.error(`[API] ❌ Pasta existe mas não pôde ser deletada:`, deleteError.message);
      throw new Error(
        `A pasta existe mas não pôde ser apagada — provavelmente a Service Account não tem ` +
        `permissão de exclusão nesse Drive Compartilhado (verifique se o papel dela lá é ` +
        `"Gerente de conteúdo" ou "Gerente"). Erro original: ${deleteError.message}`
      );
    }

    console.log(`[API] ✅ Pasta ${pastaId} deletada com sucesso`);
    return { sucesso: true, mensagem: 'Pasta deletada com sucesso' };
  } catch (error) {
    console.error(`[API] Erro ao deletar pasta ${pastaId}:`, error.message);
    throw new Error(`Erro ao deletar pasta: ${error.message}`);
  }
}

// ============================================
// HANDLER VERCEL
// ============================================

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Verificar se auth está configurada
    if (!auth) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Credenciais do Google não configuradas. Configure GOOGLE_APPLICATION_CREDENTIALS_JSON no Vercel.',
      });
    }

    const { acao, municipio, nomePasta, tipo, equipamento, pastaId } = req.body;
    
    // Aceitar tanto 'municipio' quanto 'nomePasta'
    const nomeMunicipio = municipio || nomePasta;

    console.log(`[API] Ação: ${acao}, Município: ${nomeMunicipio}`);

    // ============================================
    // CRIAR PASTA DO MUNICÍPIO
    // ============================================
    if (acao === 'criar-pasta') {
      const pastaRaiz = PASTA_EQUIPAMENTOS_ID; // ✅ Usar pasta de equipamentos como raiz
      const result = await criarPasta(nomeMunicipio, pastaRaiz);
      
      // ✅ GARANTIR que o ID está correto
      console.log(`[API] Retornando pastaId: ${result.id}`);
      
      return res.status(200).json({
        sucesso: true,
        pastaId: result.id, // ✅ CRÍTICO: Usar result.id diretamente
        nomePasta: result.name,
        webViewLink: result.webViewLink,
        mensagem: 'Pasta do município criada com sucesso',
      });
    }

    // ============================================
    // CRIAR SUBPASTA DO EQUIPAMENTO
    // ============================================
    if (acao === 'criar-subpasta') {
      const { nomeSubpasta, pastaParentId } = req.body;
      
      // Usar pastaParentId se fornecido, senão usar pasta de equipamentos
      const pastaRaiz = pastaParentId || PASTA_EQUIPAMENTOS_ID;
      
      const result = await criarPasta(nomeSubpasta, pastaRaiz);
      return res.status(200).json({
        sucesso: true,
        subpastaId: result.id,
        nomePasta: result.name,
        mensagem: 'Subpasta do equipamento criada',
      });
    }

    // ============================================
    // UPLOAD DE FOTO
    // ============================================
    if (acao === 'upload-foto') {
      const { nomeArquivo, conteudoBase64 } = req.body;
      const result = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
      return res.status(200).json({
        sucesso: true,
        arquivoId: result.id,
        nomeArquivo: result.name,
        link: result.webViewLink,
        mensagem: 'Foto enviada com sucesso',
      });
    }

    // ============================================
    // UPLOAD DE DOCUMENTO
    // ============================================
    if (acao === 'upload-documento') {
      const { nomeArquivo, conteudoBase64 } = req.body;
      const result = await uploadArquivo(nomeArquivo, conteudoBase64, pastaId);
      return res.status(200).json({
        sucesso: true,
        arquivoId: result.id,
        nomeArquivo: result.name,
        link: result.webViewLink,
        mensagem: 'Documento enviado com sucesso',
      });
    }

    // ============================================
    // DELETAR PASTA
    // ============================================
    if (acao === 'deletar-pasta') {
      try {
        if (!pastaId) {
          return res.status(400).json({
            sucesso: false,
            erro: 'pastaId não fornecido',
          });
        }

        const result = await deletarPasta(pastaId);
        return res.status(200).json({
          sucesso: true,
          mensagem: 'Pasta deletada com sucesso',
          ...result,
        });
      } catch (error) {
        return res.status(500).json({
          sucesso: false,
          erro: error.message,
        });
      }
    }

    return res.status(400).json({
      sucesso: false,
      erro: 'Ação não reconhecida',
    });
  } catch (error) {
    console.error('[API] Erro:', error);
    return res.status(500).json({
      sucesso: false,
      erro: error.message || 'Erro interno do servidor',
      detalhes: error.toString(),
    });
  }
};
