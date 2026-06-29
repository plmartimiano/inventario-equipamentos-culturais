// ========================================
// SISTEMA DE UPLOAD PARA GOOGLE DRIVE
// Estrutura: EquipamentosTipo/Fotos e Documentos
// ========================================

const PASTA_PARENT_ID = '1GRA91-gmzF7gev_9IghyhZckGajnsEzB';
const API_URL = 'https://inventario-equipamentos-paulo.vercel.app/api/uploadGoogleDrive';

// Cache local de IDs de pastas criadas
const pastasCache = JSON.parse(localStorage.getItem('pastasCache') || '{}');

/**
 * Cria uma pasta no Google Drive se não existir
 * @param {string} nomePasta - Nome da pasta a criar
 * @param {string} pastaParentId - ID da pasta pai
 * @returns {Promise<string>} - ID da pasta criada/existente
 */
async function criarPastaNoGoogle(nomePasta, pastaParentId) {
    try {
        // Verificar se já foi criada (cache)
        const chaveCache = `${pastaParentId}_${nomePasta}`;
        if (pastasCache[chaveCache]) {
            console.log(`✓ Pasta ${nomePasta} já existe (cache): ${pastasCache[chaveCache]}`);
            return pastasCache[chaveCache];
        }

        // Chamar API para criar
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'criar-pasta',
                nomePasta: nomePasta,
                pastaParentId: pastaParentId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const resultado = await response.json();

        if (resultado.sucesso && resultado.pastaId) {
            // Guardar no cache
            pastasCache[chaveCache] = resultado.pastaId;
            localStorage.setItem('pastasCache', JSON.stringify(pastasCache));
            console.log(`✓ Pasta criada: ${nomePasta} (${resultado.pastaId})`);
            return resultado.pastaId;
        } else {
            throw new Error(resultado.erro || 'Erro ao criar pasta');
        }
    } catch (erro) {
        console.error(`✗ Erro ao criar pasta ${nomePasta}:`, erro.message);
        throw erro;
    }
}

/**
 * Faz upload de arquivo para o Google Drive
 * @param {File} arquivo - Arquivo a fazer upload
 * @param {string} nomeArquivo - Nome do arquivo
 * @param {string} pastaId - ID da pasta destino
 * @returns {Promise<string>} - Link do arquivo no Drive
 */
async function uploadArquivoParaGoogle(arquivo, nomeArquivo, pastaId) {
    try {
        // Converter arquivo para base64
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const resultado = reader.result.split(',')[1]; // Remove "data:image/png;base64,"
                resolve(resultado);
            };
            reader.onerror = reject;
            reader.readAsDataURL(arquivo);
        });

        // Chamar API para upload
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'upload',
                nomeArquivo: nomeArquivo,
                conteudoBase64: base64,
                pastaId: pastaId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const resultado = await response.json();

        if (resultado.sucesso && resultado.link) {
            console.log(`✓ Arquivo enviado: ${nomeArquivo}`);
            return resultado.link;
        } else {
            throw new Error(resultado.erro || 'Erro ao fazer upload');
        }
    } catch (erro) {
        console.error(`✗ Erro ao fazer upload ${nomeArquivo}:`, erro.message);
        throw erro;
    }
}

/**
 * FUNÇÃO PRINCIPAL: Upload de foto com criação automática de estrutura
 * @param {File} arquivo - Arquivo selecionado
 * @param {string} nomeArquivo - Nome do arquivo
 * @param {string} tipoEquipamento - 'teatro', 'auditorio', 'cinema', etc
 * @returns {Promise<string>} - Link do arquivo ou null se erro
 */
async function uploadFotoParaGoogleDrive(arquivo, nomeArquivo, tipoEquipamento) {
    try {
        console.log(`📤 Iniciando upload: ${nomeArquivo} para ${tipoEquipamento}`);

        // Step 1: Criar pasta do tipo (EquipamentosTeatro, EquipamentosCinema, etc)
        const nomePastaTipo = `Equipamentos${tipoEquipamento.charAt(0).toUpperCase() + tipoEquipamento.slice(1)}`;
        const pastaTypeId = await criarPastaNoGoogle(nomePastaTipo, PASTA_PARENT_ID);

        // Step 2: Criar subpasta "Fotos"
        const pastaFotosId = await criarPastaNoGoogle('Fotos', pastaTypeId);

        // Step 3: Upload do arquivo
        const link = await uploadArquivoParaGoogle(arquivo, nomeArquivo, pastaFotosId);

        console.log(`✅ Upload concluído! Link: ${link}`);
        return link;

    } catch (erro) {
        console.error(`❌ Erro no upload:`, erro.message);
        showMsg(`⚠️ Erro ao enviar arquivo: ${erro.message}`);
        return null;
    }
}

/**
 * FUNÇÃO AUXILIAR: Upload de documentos (mesma lógica, subpasta "Documentos")
 * @param {File} arquivo - Arquivo selecionado
 * @param {string} nomeArquivo - Nome do arquivo
 * @param {string} tipoEquipamento - 'teatro', 'auditorio', 'cinema', etc
 * @returns {Promise<string>} - Link do arquivo ou null se erro
 */
async function uploadDocumentoParaGoogleDrive(arquivo, nomeArquivo, tipoEquipamento) {
    try {
        console.log(`📤 Iniciando upload de documento: ${nomeArquivo} para ${tipoEquipamento}`);

        // Step 1: Criar pasta do tipo
        const nomePastaTipo = `Equipamentos${tipoEquipamento.charAt(0).toUpperCase() + tipoEquipamento.slice(1)}`;
        const pastaTypeId = await criarPastaNoGoogle(nomePastaTipo, PASTA_PARENT_ID);

        // Step 2: Criar subpasta "Documentos"
        const pastaDocumentosId = await criarPastaNoGoogle('Documentos', pastaTypeId);

        // Step 3: Upload do arquivo
        const link = await uploadArquivoParaGoogle(arquivo, nomeArquivo, pastaDocumentosId);

        console.log(`✅ Documento enviado! Link: ${link}`);
        return link;

    } catch (erro) {
        console.error(`❌ Erro ao enviar documento:`, erro.message);
        showMsg(`⚠️ Erro ao enviar documento: ${erro.message}`);
        return null;
    }
}

// ========================================
// FUNÇÃO DE TESTE
// ========================================
async function testarUpload() {
    console.log('🧪 Testando conexão com API...');
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'test'
            })
        });
        console.log('✓ API respondeu:', response.status);
    } catch (erro) {
        console.error('✗ Erro ao conectar API:', erro.message);
    }
}
