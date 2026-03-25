// ============================================================
// Masal Üretici – Express Backend Server
// ============================================================
// Güvenlik: helmet, cors, rate limiting, input validation
// API: Google Gemini 2.0 Flash (ücretsiz)
// ============================================================

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Ortam doğrulaması ---
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'buraya_kendi_anahtarini_yaz') {
  console.error('❌ GEMINI_API_KEY .env dosyasında ayarlanmamış!');
  console.error('   https://aistudio.google.com/apikey adresinden ücretsiz anahtar alın.');
  process.exit(1);
}

// =========================
// Güvenlik Middleware
// =========================

// Helmet – güvenlik HTTP başlıkları
app.use(helmet());

// CORS – izin verilen origin'ler
app.use(
  cors({
    origin: '*', // Geliştirme için; production'da belirli origin yazılmalı
    methods: ['POST'],
    allowedHeaders: ['Content-Type'],
  })
);

// JSON body parser (max 1KB – masal parametreleri küçük)
app.use(express.json({ limit: '1kb' }));

// Genel rate limiting – 30 istek/dakika
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.' },
});
app.use(globalLimiter);

// /api/generate için sıkı rate limiting – 5 istek/dakika
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Masal üretim limiti aşıldı. Lütfen 1 dakika bekleyip tekrar deneyin.',
  },
});

// =========================
// Whitelist Değerleri
// =========================
const VALID_CULTURES = ['Anadolu', 'İskandinav', 'Uzak Doğu', 'Klasik Avrupa'];
const VALID_AGE_GROUPS = ['1-3 Yaş', '4-6 Yaş', '7-9 Yaş', '10+ Yaş'];
const VALID_ATMOSPHERES = ['Sakinleştirici/Uyku', 'Neşeli', 'Maceracı', 'Eğitici'];

const MAX_SPECIAL_REQUEST_LENGTH = 500;

// =========================
// Input Validation
// =========================
function validateAndSanitize(body) {
  const errors = [];

  const { culture, ageGroup, atmosphere, specialRequest } = body || {};

  if (!culture || !VALID_CULTURES.includes(culture)) {
    errors.push(`Geçersiz kültür değeri. İzin verilenler: ${VALID_CULTURES.join(', ')}`);
  }
  if (!ageGroup || !VALID_AGE_GROUPS.includes(ageGroup)) {
    errors.push(`Geçersiz yaş grubu. İzin verilenler: ${VALID_AGE_GROUPS.join(', ')}`);
  }
  if (!atmosphere || !VALID_ATMOSPHERES.includes(atmosphere)) {
    errors.push(`Geçersiz atmosfer. İzin verilenler: ${VALID_ATMOSPHERES.join(', ')}`);
  }

  // specialRequest opsiyonel ama varsa sanitize et
  let sanitizedRequest = '';
  if (specialRequest != null) {
    if (typeof specialRequest !== 'string') {
      errors.push('Özel istek metin olmalıdır.');
    } else {
      // Tehlikeli karakterleri temizle, max uzunluğu kırp
      sanitizedRequest = specialRequest
        .replace(/[<>{}]/g, '') // Temel HTML/injection koruması
        .trim()
        .slice(0, MAX_SPECIAL_REQUEST_LENGTH);
    }
  }

  return { errors, sanitized: { culture, ageGroup, atmosphere, specialRequest: sanitizedRequest } };
}

// =========================
// Prompt Builder
// =========================
function buildSystemPrompt({ culture, ageGroup, atmosphere, specialRequest }) {
  // Yaş grubuna göre dil seviyesi kuralları
  const ageLangRules = {
    '1-3 Yaş':
      'Çok basit, kısa cümleler kullan (3-5 kelime). Tekrarlar ve ses taklitleri ekle. ' +
      'Soyut kavramlardan kaçın. Masal en fazla 150 kelime olsun.',
    '4-6 Yaş':
      'Kısa ve anlaşılır cümleler kullan. Basit diyaloglar ekle. ' +
      'Sayılar, renkler, hayvanlar gibi tanıdık öğeler kullan. Masal en fazla 300 kelime olsun.',
    '7-9 Yaş':
      'Orta uzunlukta, zengin cümleler kullanabilirsin. Basit çatışma ve çözüm öğeleri ekle. ' +
      'Kelime hazinesini hafifçe genişlet. Masal en fazla 500 kelime olsun.',
    '10+ Yaş':
      'Daha karmaşık cümle yapıları ve zengin betimlemeler kullanabilirsin. ' +
      'Ahlaki ikilemler veya düşündürücü temalar ekleyebilirsin. Masal en fazla 700 kelime olsun.',
  };

  // Atmosfere göre ton yönergeleri
  const atmosphereGuides = {
    'Sakinleştirici/Uyku':
      'Yumuşak, sakin ve ritmik bir ton kullan. Tekrarlayan melodik kalıplar ekle. ' +
      'Masal sonunda karakterler uykuya dalmalı veya huzurlu bir sona ulaşmalı. ' +
      'Heyecan verici sahnelerden kaçın.',
    'Neşeli':
      'Enerjik, eğlenceli ve komik bir ton kullan. Espri ve beklenmedik olaylar ekle. ' +
      'Karakterler gülsün, dans etsin, şarkı söylesin. Mutlu bir sonla bitir.',
    'Maceracı':
      'Heyecan verici ama çocuk dostu bir macera tonu kullan. ' +
      'Keşif, cesaret ve arkadaşlık temalarını ön plana çıkar. ' +
      'Küçük engeller koy ama çözümler yaratıcı ve olumlu olsun.',
    'Eğitici':
      'Merak uyandıran, bilgi paylaşan ama didaktik olmayan bir ton kullan. ' +
      'Bilimsel gerçekleri veya ahlaki değerleri hikayenin doğal akışına yerleştir. ' +
      'Sonunda çocuğun "bir şey öğrendim" hissetmesini sağla.',
  };

  // Kültürel motif yönergeleri
  const cultureGuides = {
    'Anadolu':
      'Anadolu masallarının motiflerini kullan: Keloğlan, Nasreddin Hoca tarzı zeka, ' +
      'köy hayatı, doğa, misafirperverlik, komşuluk. ' +
      '"Bir varmış bir yokmuş" ile başla, "gökten üç elma düştü" ile bitir.',
    'İskandinav':
      'İskandinav/Viking masallarının motiflerini kullan: kar, buzul, ormanlar, ' +
      'cesur viking çocukları, mitolojik yaratıklar (troller, elfler). ' +
      'Doğayla uyum ve cesaret temalarını işle.',
    'Uzak Doğu':
      'Uzak Doğu masallarının motiflerini kullan: ejderhalar, kiraz çiçekleri, ' +
      'bilge yaşlılar, samuraylar, doğa ile denge, çay seremonisi. ' +
      'Sabır ve bilgelik temalarını ön plana çıkar.',
    'Klasik Avrupa':
      'Klasik Avrupa masallarının motiflerini kullan: kaleler, prensesler/prensler, ' +
      'büyücüler, sihirli ormanlar, peri kaynaları. ' +
      'Grimm Kardeşler ve Andersen tarzında ama çocuk dostu bir anlatım kullan.',
  };

  const specialPart =
    specialRequest.trim().length > 0
      ? `\n\nKullanıcının özel isteği: "${specialRequest.trim()}". Bu isteği hikayeye doğal şekilde dahil et.`
      : '';

  return (
    'Sen çocuklar için masal yazan, deneyimli bir çocuk edebiyatı yazarısın. ' +
    'Türkçe yazıyorsun. Aşağıdaki kurallara MUTLAKA uy:\n\n' +
    '🛡️ GÜVENLİK KURALLARI (EN ÖNCELİKLİ):\n' +
    '- Şiddet, kan, ölüm, korku, travma içeren hiçbir öğe KULLANMA.\n' +
    '- Cinsel içerik veya ima KULLANMA.\n' +
    '- Ayrımcılık, ırkçılık, cinsiyetçilik içeren ifadeler KULLANMA.\n' +
    '- Küfür veya argo KULLANMA.\n' +
    '- Çocuğu tehlikeli davranışlara teşvik etme.\n' +
    '- Kullanıcı özel isteğinde uygunsuz bir şey isterse REDDET ve yerine olumlu bir alternatif sun.\n\n' +
    `📚 DİL SEVİYESİ (${ageGroup}):\n${ageLangRules[ageGroup]}\n\n` +
    `🎭 ATMOSFER (${atmosphere}):\n${atmosphereGuides[atmosphere]}\n\n` +
    `🌍 KÜLTÜR (${culture}):\n${cultureGuides[culture]}\n\n` +
    '📝 FORMAT:\n' +
    '- Sadece masalın kendisini yaz, başka açıklama ekleme.\n' +
    '- Paragraflar arasında boş satır bırak.\n' +
    '- Masal bir başlık ile başlasın.' +
    specialPart
  );
}

// =========================
// Gemini API çağrısı
// =========================
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGeminiAPI(systemPrompt, userMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 sn timeout

  try {
    const response = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userMessage }],
          },
        ],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Gemini API hata (${response.status}):`, errBody);

      if (response.status === 401 || response.status === 403) {
        throw new Error('API anahtarı geçersiz. Lütfen .env dosyasındaki GEMINI_API_KEY değerini kontrol edin.');
      }
      if (response.status === 429) {
        throw new Error('Gemini API istek limiti aşıldı. Lütfen birkaç dakika bekleyin.');
      }
      throw new Error('Masal üretilirken bir hata oluştu. Lütfen tekrar deneyin.');
    }

    const data = await response.json();

    // Yanıtı parse et
    const candidate = data?.candidates?.[0];
    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      // Güvenlik filtresine takılmış olabilir
      if (candidate?.finishReason === 'SAFETY') {
        throw new Error(
          'Bu içerik güvenlik filtresine takıldı. Lütfen farklı parametrelerle tekrar deneyin.'
        );
      }
      throw new Error('Gemini API beklenmeyen bir yanıt döndürdü.');
    }

    return candidate.content.parts[0].text;
  } finally {
    clearTimeout(timeout);
  }
}

// =========================
// API Endpoint
// =========================
app.post('/api/generate', generateLimiter, async (req, res) => {
  // 1. Input doğrulama
  const { errors, sanitized } = validateAndSanitize(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(' | ') });
  }

  const { culture, ageGroup, atmosphere, specialRequest } = sanitized;

  try {
    // 2. Sistem promptunu oluştur
    const systemPrompt = buildSystemPrompt({ culture, ageGroup, atmosphere, specialRequest });

    // 3. Kullanıcı mesajı
    const userMessage =
      `Bana ${culture} kültüründen, ${ageGroup} için, ${atmosphere} atmosferinde bir masal yaz.` +
      (specialRequest ? ` Özel istek: ${specialRequest}` : '');

    // 4. Gemini API çağrısı
    const story = await callGeminiAPI(systemPrompt, userMessage);

    // 5. Başarılı yanıt
    return res.json({ story });
  } catch (err) {
    console.error('Masal üretim hatası:', err.message);

    // AbortError = timeout
    if (err.name === 'AbortError') {
      return res.status(504).json({
        error: 'İstek zaman aşımına uğradı (30 saniye). İnternet bağlantınızı kontrol edip tekrar deneyin.',
      });
    }

    return res.status(500).json({
      error: err.message || 'Bilinmeyen bir hata oluştu.',
    });
  }
});

// Sağlık kontrolü endpoint'i
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =========================
// Sunucuyu Başlat
// =========================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Masal Üretici Backend çalışıyor: http://localhost:${PORT}`);
  console.log(`   POST /api/generate  – masal üret`);
  console.log(`   GET  /api/health    – sağlık kontrolü`);
});
