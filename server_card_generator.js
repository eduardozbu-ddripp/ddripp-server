const express = require('express');
const { createCanvas, loadImage } = require('canvas'); 
const fetch = require('node-fetch'); 
const app = express();

const PORT = process.env.PORT || 3000;

// Pega a chave do cofre do Render
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; 

const THEME = {
    fontMain: 'bold 70px sans-serif',
    fontDate: '30px sans-serif',
    colorText: '#ffffff',
    overlayColor: 'rgba(0, 0, 0, 0.5)', 
    logoText: 'ddripp' 
};

const backgroundCache = new Map();

async function tryGenerateImage(prompt) {
    if (!GOOGLE_API_KEY) throw new Error("Chave API não configurada no Render.");

    // MUDANÇA ESTRATÉGICA: Usando 'image-generation-002' (Imagen 2)
    // Este é o modelo universalmente disponível para chaves de API padrão.
    const modelId = 'image-generation-002';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${GOOGLE_API_KEY}`;
    
    console.log(`🎨 Gerando com ${modelId}: "${prompt}"...`);

    const payload = {
        instances: [{ prompt: `High quality travel photography of ${prompt}, cinematic lighting, 8k resolution, photorealistic, landscape` }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API recusou (${response.status}): ${errText}`);
    }

    const data = await response.json();
    
    if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
        return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
    }
    
    throw new Error("API respondeu sem dados de imagem.");
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

        const cacheKey = `img_v2_stable_${destination.toLowerCase()}`;
        let image;

        if (backgroundCache.has(cacheKey)) {
            console.log(`⚡ Cache Hit: ${destination}`);
            image = await loadImage(backgroundCache.get(cacheKey));
        } else {
            let imgBuffer;
            try {
                imgBuffer = await tryGenerateImage(destination);
            } catch (erroIA) {
                console.error(`❌ Erro IA: ${erroIA.message}. Usando Gradiente.`);
                // Fallback Gradiente
                const fallbackCanvas = createCanvas(width, height);
                const fCtx = fallbackCanvas.getContext('2d');
                const grd = fCtx.createLinearGradient(0, 0, width, height);
                grd.addColorStop(0, "#0f172a"); 
                grd.addColorStop(1, "#334155"); 
                fCtx.fillStyle = grd;
                fCtx.fillRect(0, 0, width, height);
                image = fallbackCanvas;
            }

            if (imgBuffer) {
                backgroundCache.set(cacheKey, imgBuffer);
                image = await loadImage(imgBuffer);
            }
        }

        if (!image) {
             const fallbackCanvas = createCanvas(width, height);
             const fCtx = fallbackCanvas.getContext('2d');
             fCtx.fillStyle = "#1e293b";
             fCtx.fillRect(0,0,width,height);
             image = fallbackCanvas;
        }

        ctx.drawImage(image, 0, 0, width, height);
        
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

        ctx.font = 'italic 20px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('Roteiro Personalizado via Gemini', width / 2, height - 40);

        res.set('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);

    } catch (error) {
        console.error(error);
        res.status(200).send("Erro interno, mas vivo.");
    }
});

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

app.listen(PORT, () => console.log(`Servidor Imagen 2 rodando na porta ${PORT}`));
