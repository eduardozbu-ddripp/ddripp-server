const express = require('express');
const { createCanvas, loadImage } = require('canvas'); 
const fetch = require('node-fetch'); 
const app = express();

const PORT = process.env.PORT || 3000;
// Pega a chave do cofre do Render
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; 

const backgroundCache = new Map();

// --- FUNÇÃO DE GERAÇÃO COM RETENTATIVA ---
async function tryGenerateImage(prompt, modelVersion) {
    // modelVersion pode ser 'imagen-3.0-generate-001' ou 'image-generation-002'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:predict?key=${GOOGLE_API_KEY}`;
    
    console.log(`🎨 Tentando gerar com modelo: ${modelVersion}...`);

    const payload = {
        instances: [{ prompt: `High quality travel photography of ${prompt}, cinematic lighting, 8k, landscape` }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const data = await response.json();
    if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
        return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
    }
    throw new Error("API respondeu mas sem imagem.");
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

        // 1. TENTA OBTER A IMAGEM
        const cacheKey = `img_dual_${destination.toLowerCase()}`;
        let image;

        if (backgroundCache.has(cacheKey)) {
            console.log(`⚡ Cache Hit: ${destination}`);
            image = await loadImage(backgroundCache.get(cacheKey));
        } else {
            let imgBuffer;
            try {
                // TENTATIVA A: Imagen 3 (Mais moderno)
                imgBuffer = await tryGenerateImage(destination, 'imagen-3.0-generate-001');
            } catch (erro3) {
                console.warn("⚠️ Imagen 3 falhou. Tentando Imagen 2...", erro3.message);
                try {
                    // TENTATIVA B: Imagen 2 (Mais compatível)
                    // Nota: O endpoint antigo às vezes chama 'image-generation-002'
                    imgBuffer = await tryGenerateImage(destination, 'image-generation-002');
                } catch (erro2) {
                    console.error("❌ Imagen 2 também falhou:", erro2.message);
                    
                    // FALLBACK FINAL: Desenha um fundo colorido se nenhuma IA funcionar
                    // Isso evita o erro 500 e mostra o card pelo menos com texto
                    const fallbackCanvas = createCanvas(width, height);
                    const fCtx = fallbackCanvas.getContext('2d');
                    // Gradiente elegante
                    const grd = fCtx.createLinearGradient(0, 0, width, height);
                    grd.addColorStop(0, "#1e3a8a");
                    grd.addColorStop(1, "#3b82f6");
                    fCtx.fillStyle = grd;
                    fCtx.fillRect(0, 0, width, height);
                    image = fallbackCanvas; 
                }
            }

            if (imgBuffer) {
                backgroundCache.set(cacheKey, imgBuffer);
                image = await loadImage(imgBuffer);
            }
        }

        // Se imagem for nula (fallback de cor já tratou acima, mas garantindo)
        if (!image) {
             const fallbackCanvas = createCanvas(width, height);
             const fCtx = fallbackCanvas.getContext('2d');
             fCtx.fillStyle = "#1e3a8a";
             fCtx.fillRect(0,0,width,height);
             image = fallbackCanvas;
        }

        // 2. DESENHA
        ctx.drawImage(image, 0, 0, width, height);

        // 3. APLICA TEXTO (Identidade)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#3B82F6'; 
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText('ddripp', 50, 80);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        
        let fontSize = 70;
        ctx.font = `bold ${fontSize}px sans-serif`;
        while (ctx.measureText(destination.toUpperCase()).width > width - 100 && fontSize > 30) {
            fontSize -= 5;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        
        ctx.fillText(destination.toUpperCase(), width / 2, height / 2);

        ctx.font = '30px sans-serif';
        ctx.fillText(`📅 ${dateText}`, width / 2, (height / 2) + 60);

        res.set('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);

    } catch (error) {
        console.error("ERRO CRÍTICO:", error);
        // Resposta de emergência para não quebrar o zap
        res.status(200).send("Erro, mas o servidor vive.");
    }
});

app.get('/share', (req, res) => {
    const { title, date, dest, data } = req.query;
    const pageTitle = title || 'Roteiro';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const imgUrl = `${protocol}://${host}/dynamic-cover?dest=${encodeURIComponent(dest||'')}&date=${encodeURIComponent(date||'')}`;
    const APP_URL = "https://eduardozbu-ddripp.github.io/ddripp-server/"; 

    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta property="og:title" content="${pageTitle}">
        <meta property="og:description" content="Confira o roteiro de viagem para ${dest}">
        <meta property="og:image" content="${imgUrl}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta name="twitter:card" content="summary_large_image">
        <title>${pageTitle}</title>
    </head>
    <body>
        <h2>Carregando...</h2>
        <script>window.location.href = "${APP_URL}?data=${data}";</script>
    </body>
    </html>`;
    res.send(html);
});

app.listen(PORT, () => console.log(`Servidor Duplo rodando na porta ${PORT}`));
