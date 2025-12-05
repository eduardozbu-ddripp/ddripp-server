const express = require('express');
const { createCanvas, loadImage } = require('canvas'); 
const { GoogleAuth } = require('google-auth-library');
const fetch = require('node-fetch'); 
const app = express();

const PORT = process.env.PORT || 3000;

// Configurações do Google Cloud (Vindas do Render)
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

// --- FUNÇÃO DE ARTE (FALLBACK ELEGANTE) ---
function drawTopographicPattern(ctx, width, height) {
    const grd = ctx.createLinearGradient(0, 0, width, height);
    grd.addColorStop(0, "#1e293b"); 
    grd.addColorStop(1, "#0f172a"); 
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, width, height);

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
}

// --- AUTENTICAÇÃO VERTEX AI ---
async function getAccessToken() {
    if (!CREDENTIALS_JSON) throw new Error("Credenciais JSON não encontradas (Variável vazia).");
    
    try {
        const credentialsObj = JSON.parse(CREDENTIALS_JSON);
        const auth = new GoogleAuth({
            credentials: credentialsObj,
            scopes: 'https://www.googleapis.com/auth/cloud-platform'
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        return token.token;
    } catch (e) {
        console.error("Erro ao processar JSON das credenciais:", e.message);
        throw new Error("JSON das credenciais inválido ou corrompido.");
    }
}

// --- GERAÇÃO DE IMAGEM (VERTEX AI / IMAGEN 2) ---
async function generateImageVertex(prompt) {
    console.log(`🎨 Conectando ao Vertex AI para: "${prompt}"...`);
    
    const accessToken = await getAccessToken();
    const location = 'us-central1'; 
    const modelId = 'imagegeneration@006'; 
    
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
        throw new Error(`Vertex AI recusou (${response.status}): ${errText}`);
    }

    const data = await response.json();
    
    if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
        return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
    }
    
    throw new Error("Vertex AI respondeu sem imagem.");
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

        const cacheKey = `vertex_img_${destination.toLowerCase()}`;
        let image;

        if (backgroundCache.has(cacheKey)) {
            console.log(`⚡ Cache Hit: ${destination}`);
            image = await loadImage(backgroundCache.get(cacheKey));
        } else {
            try {
                const imgBuffer = await generateImageVertex(destination);
                backgroundCache.set(cacheKey, imgBuffer);
                image = await loadImage(imgBuffer);
            } catch (erroVertex) {
                console.error("❌ Falha no Vertex AI:", erroVertex.message);
                // Fallback Topográfico (Mapa)
                drawTopographicPattern(ctx, width, height);
                // Não definimos 'image' aqui pois já desenhamos direto no ctx
            }
        }

        // Se conseguiu a imagem da IA/Cache, desenha ela
        if (image) {
            ctx.drawImage(image, 0, 0, width, height);
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
        console.error("ERRO GERAL:", error);
        res.status(200).send("Erro interno (Fallback Ativo)");
    }
});

// Rota de Compartilhamento
app.get('/share', (req, res) => {
    const { title, date, dest, data } = req.query;
    const pageTitle = title || 'Roteiro';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const imgUrl = `${protocol}://${host}/dynamic-cover?dest=${encodeURIComponent(dest||'')}&date=${encodeURIComponent(date||'')}`;
    
    const APP_URL = "https://eduardozbu-ddripp.github.io/ddripp-server/";

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta property="og:site_name" content="ddripp"><meta property="og:title" content="${pageTitle}"><meta property="og:description" content="Confira o roteiro para ${dest}"><meta property="og:image" content="${imgUrl}"><meta name="twitter:card" content="summary_large_image"><title>${pageTitle}</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f0f9ff;color:#0c4a6e}</style></head><body><h2>Carregando...</h2><script>setTimeout(() => { window.location.href = "${APP_URL}?data=${data}"; }, 100);</script></body></html>`;
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Servidor Vertex rodando na porta ${PORT}`);
    
    // DIAGNÓSTICO DE INICIALIZAÇÃO
    if (!CREDENTIALS_JSON) {
        console.error("🚨 ERRO FATAL: Variável 'GOOGLE_CREDENTIALS_JSON' está vazia ou não existe!");
    } else {
        console.log(`✅ Credenciais JSON detectadas (Tamanho: ${CREDENTIALS_JSON.length} caracteres).`);
        try {
            JSON.parse(CREDENTIALS_JSON);
            console.log("✅ JSON é válido.");
        } catch (e) {
            console.error("🚨 ERRO: O conteúdo de 'GOOGLE_CREDENTIALS_JSON' não é um JSON válido! Verifique se copiou tudo corretamente.");
        }
    }
    
    if (!PROJECT_ID) console.error("🚨 ERRO: Variável 'GOOGLE_PROJECT_ID' não encontrada!");
});
