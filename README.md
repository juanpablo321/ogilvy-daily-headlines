# Ogilvy Daily Headlines — Sistema Automático de Titulares

Sistema que recopila diariamente los 10 mejores titulares de tech/IA/marketing y los publica en Google Sheets para revisión editorial.

## Arquitectura

```
[Cron 7:00] → ogilvy-daily-headlines.js → ogilvy-scraped-data.json
[Cron 7:05] → openclaw sessions send → Agente Smith (LLM) → Google Sheets
```

**Flujo de dos pasos:**
1. Script Node.js raspa las fuentes y guarda datos crudos en JSON
2. Agente Smith (LLM) lee el JSON, selecciona los 10 mejores y escribe en Google Sheets

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `ogilvy-daily-headlines.js` | Script principal de scraping |
| `ogilvy-config.json` | Configuración: URLs monitoreadas, keywords, nº de titulares |
| `ogilvy-scraped-data.json` | Output del scraping (se sobreescribe cada día) |
| `write-sheets-temp.js` | Script auxiliar para escritura manual en Sheets |
| `ogilvy-daily-headlines.log` | Log del script de scraping |
| `agente-smith-cron.log` | Log del activador del agente |

## Crontab (martes a sábado, 7AM)

```cron
0 7 * * 2-6 /usr/bin/node /home/smith/.openclaw/workspace/proyectos/proyectos-franco/ogilvy-daily-headlines/ogilvy-daily-headlines.js >> .../ogilvy-daily-headlines.log 2>&1

5 7 * * 2-6 /usr/local/bin/openclaw sessions send --message "..." >> .../agente-smith-cron.log 2>&1
```

Ver crontab activo: `crontab -l`

## Dependencias Node.js (globales)

- `googleapis` — escritura en Google Sheets
- `axios` — HTTP requests a sitios
- `cheerio` — parsing HTML

Instalación si faltan:
```bash
npm install -g googleapis axios cheerio
```

## Configuración (ogilvy-config.json)

```json
{
  "sitesToMonitor": [...],   // 20 URLs
  "headlinesToSelect": 10,   // Nº de titulares a seleccionar
  "keywords": [...]          // Keywords para filtrar titulares relevantes
}
```

Para agregar/quitar sitios o cambiar nº de titulares, editar `ogilvy-config.json`.

## Google Sheets

- **ID:** `1-PsI_Lb4RniVLeAhE-lk_jBTkJs0cQUwDXxCLP5IrpU`
- **Pestaña:** `Revision`
- **Columnas:** Encabezado | URL | Fecha de Publicación | Autor | Fecha de Generación | Tema (Filtro)
- **Credenciales:** `/home/smith/.openclaw/workspace/gcp-service-account.json`
- **Service Account:** `costos-ia-sync@juan-costos-ia.iam.gserviceaccount.com`

## Extracción de Metadata

El script usa una estrategia en cascada para cada titular encontrado:

1. **Card context** — busca `<time datetime>` y elementos `[class*="author"]` en el contenedor padre del titular (artículo/tarjeta)
2. **JSON-LD** — parsea `<script type="application/ld+json">` buscando tipos Article/NewsArticle/BlogPosting
3. **Meta tags** — `article:published_time`, `article:author`, `og:description`
4. **Filtro post-proceso** — elimina publishers conocidos (Condé Nast, etc.) que aparecen como falsos autores

**Limitación conocida:** Sitios que no exponen autor/fecha en sus listados (TechCrunch, Ars Technica, MIT) quedan en N/A. Obtenerlos requeriría fetch individual de cada artículo (~75 requests extra).

## Sitios excluidos (4xx/403)

- `blog.google/products/google-store/` — 404
- `tesla.com/blog` — 403
- `producthunt.com` — 403
- `framer.com/changelog` — 404

Actualizar en `ogilvy-config.json` si cambian las URLs.

## Ejecución manual

```bash
# Solo scraping
node /home/smith/.openclaw/workspace/proyectos/proyectos-franco/ogilvy-daily-headlines/ogilvy-daily-headlines.js

# Solo escritura en Sheets (después del scraping)
node /home/smith/.openclaw/workspace/proyectos/proyectos-franco/ogilvy-daily-headlines/write-sheets-temp.js
```

---
*Creado: 2026-04-14 | Mantenido por: Agente Smith*
