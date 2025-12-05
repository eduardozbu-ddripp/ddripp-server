const express = require('express');
const { createCanvas, loadImage } = require('canvas'); 
const { GoogleAuth } = require('google-auth-library');
const fetch = require('node-fetch'); 
const app = express();

const PORT = process.env.PORT || 3000;

// Configurações do Google Cloud
const PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const CREDENTIALS_JSON = process.env.GOOGLE_CREDENTIALS_JSON;

const THEME = {
    fontMain: 'bold 70px sans-serif',
    fontDate: '30px sans-serif',
    colorText: '#ffffff',
    overlayColor: 'rgba(0, 0, 0, 0.4)', 
    logoText: 'ddripp' 
};

const backgroundCache = new Map();

// --- FUNÇÃO DE ARTE COM DIAGNÓSTICO DE ERRO ---
function drawTopographicPattern(ctx, width, height, errorMessage = null) {
    // Fundo
    const grd = ctx.createLinearGradient(0, 0, width, height);
    grd.addColorStop(0, "#1e293b"); 
    grd.addColorStop(1, "#0f172a"); 
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, width, height);

    // Padrão Topográfico
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)"; 
    for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        let y = (height / 15) * i;
        ctx.moveTo(0, y);
        for (let x = 0; x <= width; x += 50) {
            let noise = Math.sin(x * 0.01 + i) * 50 + Math.cos(x * 0.02) * 30;
            ctx.lineTo(x, y + noise);
        }
        ctx.stroke();
    }

    // SE TIVER ERRO, ESCREVE NA TELA (DEBUG)
    if (errorMessage) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
        ctx.fillRect(0, 0, width, 60); // Barra vermelha no topo
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 20px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`ERRO TÉCNICO: ${errorMessage.substring(0, 90)}`, 20, 35);
        console.error("ERRO IMPRESSO NA IMAGEM:", errorMessage);
    }
}

// --- AUTENTICAÇÃO VERTEX AI (COM LIMPEZA ROBUSTA DE JSON) ---
async function getAccessToken() {
    if (!CREDENTIALS_JSON) throw new Error("Variável CREDENTIALS_JSON vazia.");
    
    let credentialsObj;

    try {
        // TENTATIVA 1: Parse direto
        credentialsObj = JSON.parse(CREDENTIALS_JSON);
    } catch (e1) {
        console.log("⚠️ JSON sujo detectado. Tentando limpar...");
        try {
            // TENTATIVA 2: Limpeza de Caracteres de Controle
            // Remove quebras de linha reais (\n) que o copy-paste pode ter inserido indevidamente
            // e substitui por espaços, exceto se parecerem essenciais.
            // A estratégia mais segura para chaves do Google é remover quebras de linha fora das strings.
            
            // Remove todos os newlines e carriage returns
            const sanitized = CREDENTIALS_JSON.replace(/[\r\n]+/g, '');
            credentialsObj = JSON.parse(sanitized);
            console.log("✅ JSON limpo com sucesso.");
        } catch (e2) {
            throw new Error(`Falha fatal ao ler JSON das credenciais: ${e1.message}`);
        }
    }

    try {
        const auth = new GoogleAuth({
            credentials: credentialsObj,
            scopes: 'https://www.googleapis.com/auth/cloud-platform'
        });
        
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        return token.token;
    } catch (e) {
        throw new Error(`Erro de Autenticação Google: ${e.message}`);
    }
}

// --- GERAÇÃO VERTEX AI ---
async function generateImageVertex(prompt) {
    console.log(`🎨 Vertex AI: "${prompt}"...`);
    
    const accessToken = await getAccessToken();
    const location = 'us-central1'; 
    const modelId = 'imagegeneration@006'; // Modelo V2 Estável
    
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${location}/publishers/google/models/${modelId}:predict`;

    const payload = {
        instances: [{ prompt: `High quality travel photography of ${prompt}, cinematic lighting, 8k, landscape` }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        // Tenta extrair mensagem de erro limpa do JSON do Google
        try {
            const errJson = JSON.parse(errText);
            throw new Error(`Google: ${errJson.error.message}`);
        } catch(e) {
            throw new Error(`Google HTTP ${response.status}: ${errText.substring(0, 100)}`);
        }
    }

    const data = await response.json();
    
    if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
        return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
    }
    
    throw new Error("Vertex respondeu sem dados de imagem.");
}

app.get('/dynamic-cover', async (req, res) => {
    try {
        const { dest, date } = req.query;
        const destination = dest || 'Viagem';
        const dateText = date || '';

        const width = 1200;
        const height = 630;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const cacheKey = `vtx_clean_${destination.toLowerCase()}`;
        let image;
        let lastError = null;

        if (backgroundCache.has(cacheKey)) {
            console.log(`⚡ Cache Hit: ${destination}`);
            image = await loadImage(backgroundCache.get(cacheKey));
        } else {
            try {
                const imgBuffer = await generateImageVertex(destination);
                backgroundCache.set(cacheKey, imgBuffer);
                image = await loadImage(imgBuffer);
            } catch (erroVertex) {
                console.error("❌ Falha Vertex:", erroVertex.message);
                lastError = erroVertex.message; // Guarda o erro para escrever na tela
                drawTopographicPattern(ctx, width, height, lastError);
            }
        }

        if (image) {
            ctx.drawImage(image, 0, 0, width, height);
        } else if (!lastError) {
            // Se não tem imagem e não tem erro capturado, desenha padrão
            drawTopographicPattern(ctx, width, height, "Erro desconhecido na geração");
        }

        // Camada de Identidade
        ctx.fillStyle = THEME.overlayColor;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#3B82F6'; 
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText('ddripp', 50, 80);

        ctx.fillStyle = THEME.colorText;
        ctx.textAlign = 'center';
        
        let fontSize = 70;
        ctx.font = `bold ${fontSize}px sans-serif`;
        while (ctx.measureText(destination.toUpperCase()).width > width - 100 && fontSize > 30) {
            fontSize -= 5;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        
        ctx.fillText(destination.toUpperCase(), width / 2, height / 2);
        ctx.font = THEME.fontDate;
        ctx.fillText(`📅 ${dateText}`, width / 2, (height / 2) + 60);

        res.set('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);

    } catch (error) {
        console.error("ERRO FATAL 500:", error);
        // Tenta enviar uma imagem de erro mesmo no 500
        res.status(200).send(`Erro Crítico: ${error.message}`);
    }
});

app.get('/share', (req, res) => {
    const { title, date, dest, data } = req.query;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const imgUrl = `${protocol}://${host}/dynamic-cover?dest=${encodeURIComponent(dest||'')}&date=${encodeURIComponent(date||'')}`;
    const APP_URL = "https://eduardozbu-ddripp.github.io/ddripp-server/";
    res.send(`<!DOCTYPE html><html><head><meta property="og:title" content="${title}"><meta property="og:image" content="${imgUrl}"><meta name="twitter:card" content="summary_large_image"></head><body><script>window.location.href = "${APP_URL}?data=${data}";</script></body></html>`);
});

app.listen(PORT, () => {
    console.log(`Servidor Diagnóstico rodando na porta ${PORT}`);
});
