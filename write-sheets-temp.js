const { google } = require('googleapis');
const fs = require('fs');

async function writeToSheet() {
  const credentials = JSON.parse(fs.readFileSync('/home/smith/.openclaw/workspace/gcp-service-account.json', 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const SHEET_ID = '1-PsI_Lb4RniVLeAhE-lk_jBTkJs0cQUwDXxCLP5IrpU';
  const SHEET_NAME = 'Revision';
  const today = '2026-04-14';

  // Top 10 seleccionados: relevancia, frescura, diversidad de fuente
  const selected = [
    {
      headline: "Anthropic Opposes the Extreme AI Liability Bill That OpenAI Backed",
      url: "https://www.wired.com/story/anthropic-opposes-the-extreme-ai-liability-bill-that-openai-backed/",
      publishDate: "N/A",
      author: "N/A",
      topic: "Regulación IA"
    },
    {
      headline: "Google brings its Gemini Personal Intelligence feature to India",
      url: "https://techcrunch.com/2026/04/14/google-brings-its-gemini-personal-intelligence-feature-to-india/",
      publishDate: "2026-04-14",
      author: "N/A",
      topic: "IA / Expansión LLM"
    },
    {
      headline: "AI on the couch: Anthropic gives Claude 20 hours of psychiatry",
      url: "https://arstechnica.com/ai/2026/04/why-anthropic-sent-its-claude-ai-to-an-actual-psychiatrist/",
      publishDate: "2026-04-09",
      author: "N/A",
      topic: "IA / Salud Mental"
    },
    {
      headline: "Cuando NVIDIA recibió permiso de EEUU para vender sus H200 a China no contaba con un enemigo: la burocracia",
      url: "https://www.xataka.com/empresas-y-economia/nvidia-amd-tienen-problema-grave-eeuu-cuello-botella-gobierno-frena-sus-exportaciones-a-china",
      publishDate: "2026-04-14",
      author: "Laura López",
      topic: "Chips IA / Geopolítica"
    },
    {
      headline: "Copilot data residency in US + EU and FedRAMP compliance now available",
      url: "https://github.blog/changelog/2026-04-13-copilot-data-residency-in-us-eu-and-fedramp-compliance-now-available",
      publishDate: "2026-04-14",
      author: "Dorothy Pearce",
      topic: "IA Dev / Privacidad"
    },
    {
      headline: "How agents, digital wallets, and trust are rewriting checkout",
      url: "https://stripe.com/blog/global-checkout-trends",
      publishDate: "2026-04-07",
      author: "N/A",
      topic: "Agentes IA + eCommerce"
    },
    {
      headline: "Trump officials may be encouraging banks to test Anthropic's Mythos model",
      url: "https://techcrunch.com/2026/04/12/trump-officials-may-be-encouraging-banks-to-test-anthropics-mythos-model/",
      publishDate: "2026-04-12",
      author: "N/A",
      topic: "IA en Finanzas / Regulación"
    },
    {
      headline: "The 70-Person AI Image Startup Taking on Silicon Valley's Giants",
      url: "https://www.wired.com/story/black-forest-labs-ai-image-generation/",
      publishDate: "N/A",
      author: "N/A",
      topic: "Startups IA Generativa"
    },
    {
      headline: "How to Build Reliable AI Systems",
      url: "https://www.freecodecamp.org/news/how-to-build-reliable-ai-systems/",
      publishDate: "N/A",
      author: "N/A",
      topic: "IA Técnico / Arquitectura"
    },
    {
      headline: "Which Companies Spend the Most on Digital Advertising? [Study]",
      url: "https://www.semrush.com/blog/companies-spend-on-advertising-study/",
      publishDate: "N/A",
      author: "Shannon O'Shea",
      topic: "Marketing Digital / Publicidad"
    }
  ];

  // Limpiar y preparar filas
  const rows = selected.map(item => [
    item.headline,
    item.url,
    item.publishDate,
    item.author,
    today,
    item.topic
  ]);

  // Limpiar hoja y escribir encabezados
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:Z1000`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['Encabezado', 'URL', 'Fecha de Publicación', 'Autor', 'Fecha de Generación', 'Tema (Filtro)'],
        ...rows
      ]
    }
  });

  console.log('✅ 10 titulares escritos en Google Sheets correctamente.');
  rows.forEach((r, i) => console.log(`  ${i+1}. [${r[5]}] ${r[0].substring(0,60)}...`));
}

writeToSheet().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
