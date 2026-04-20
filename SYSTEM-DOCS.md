# Sistema Ogilvy Daily Headlines — Documentación Técnica

> Última actualización: 2026-04-19

---

## ¿Qué hace el sistema?

Todos los días (martes a sábado) el sistema rastrea automáticamente 22 sitios de tecnología y marketing, extrae los titulares más relevantes, los filtra y puntúa con IA, y publica los 10 mejores en un Google Sheet con sus metadatos. Además, envía un resumen directo por Telegram.

El objetivo: que Juan tenga cada mañana una bandeja de entrada editorial curada, lista para inspirar artículos de blog o posts de LinkedIn.

---

## Arquitectura general

```
[CRON 7:00 AM]
      │
      ▼
ogilvy-daily-headlines.js   ← Paso 1: Scraping
      │
      │  guarda resultado en:
      ▼
ogilvy-scraped-data.json    ← Dato intermedio
      │
[CRON 7:05 AM]
      │
      ▼
ogilvy-write-sheets.js      ← Paso 2: Selección IA + publicación
      │
      ├──► Google Sheets (pestaña "Revision")
      └──► Telegram (resumen de los 10 titulares)
```

---

## Archivos del sistema

### `ogilvy-config.json`
**Qué hace:** Archivo de configuración central. Contiene las reglas de qué rastrear y qué buscar.

**Datos que almacena:**
| Campo | Descripción |
|---|---|
| `sitesToMonitor` | Lista de 22 URLs de sitios a rastrear (The Verge, Wired, TechCrunch, Anthropic, HBR, etc.) |
| `numberOfHeadlinesToSelect` | Número de titulares a seleccionar (por defecto: 10) |
| `keywords` | Palabras clave de filtro primario: IA, Marketing, eCommerce, B2B, Automatización, etc. |

**Cuándo editarlo:** Para agregar/quitar sitios, cambiar el número de titulares, o ajustar las palabras clave de interés.

---

### `ogilvy-daily-headlines.js` — Paso 1: Scraping
**Qué hace:** Visita cada sitio de la lista, extrae todos los encabezados H1/H2/H3, filtra los que contienen al menos una keyword relevante, y recopila metadatos del artículo.

**Dónde interviene la IA:** No hay IA generativa aquí. La selección es lógica pura (filtro de keywords, scraping HTML con Cheerio).

**Estrategia de extracción de metadatos (cascada):**
1. Busca en el contexto de la tarjeta del artículo (`<article>`, `<li>`, etc.)
2. Busca atributos `datetime` en elementos `<time>`
3. Busca clases CSS tipo `date`, `author`, `byline`
4. Busca esquemas estructurados JSON-LD en la página
5. Busca meta tags (`og:description`, `article:author`, etc.)
6. Si nada funciona → marca como `N/A`

**Datos que extrae por titular:**
| Campo | Descripción |
|---|---|
| `headline` | Texto del titular |
| `source` | URL del sitio origen |
| `link` | URL del artículo específico |
| `author` | Autor (si está disponible) |
| `publishDate` | Fecha de publicación (YYYY-MM-DD) |
| `keywordsMatched` | Qué palabras clave del config coincidieron |
| `description` | Descripción o resumen del artículo |

**Filtro anti-publishers:** Si un "autor" aparece 3+ veces en el mismo sitio, se asume que es el publisher (no una persona) y se descarta. También hay una lista de publishers conocidos que se excluyen automáticamente (Google, Apple, Microsoft, Anthropic, Condé Nast, etc.).

**Output:** Guarda todo en `ogilvy-scraped-data.json`.

---

### `ogilvy-scraped-data.json`
**Qué es:** Archivo temporal generado por el Paso 1. Contiene dos listas:
- `scrapedContent`: todos los titulares válidos encontrados (puede ser 80-200+)
- `excludedSites`: sitios que fallaron (errores 403, 404, timeout) con su motivo

Este archivo se sobreescribe completamente en cada ejecución. No es un histórico.

---

### `ogilvy-write-sheets.js` — Paso 2: Selección + Publicación
**Qué hace:** Lee `ogilvy-scraped-data.json`, aplica un sistema de puntuación para elegir los 10 mejores titulares, los escribe en Google Sheets y envía el resumen a Telegram.

**Dónde interviene la IA (lógica de scoring):**
Este es el cerebro editorial del sistema. Cada titular recibe una puntuación basada en:

| Criterio | Puntos |
|---|---|
| Publicado hoy | +30 |
| Publicado ayer | +20 |
| Publicado en otra fecha | +5 |
| Por cada keyword del config que coincide | +10 |
| Por cada keyword de alto valor que aparece en el titular | +8 |
| Tiene autor identificado | +5 |
| URL apunta a un artículo específico (no solo el dominio) | +5 |
| Titular muy corto (<20 caracteres) | -20 |

**Keywords de alto valor** (adicionales al config): `agent`, `llm`, `gpt`, `claude`, `gemini`, `automation`, `ecommerce`, `b2b`, `startup`, `saas`, `openai`, `anthropic`, `mcp`, `agentic`, `machine learning`, `neural`, `model`.

**Regla de diversidad:** Máximo 3 titulares por dominio, para evitar que un solo sitio domine la selección.

**Inferencia de tema:** Cada titular recibe una categoría automática basada en su contenido:
- Agentes IA, eCommerce, Marketing Digital, Startups / Negocios, IA Generativa, Seguridad, Cloud / Infraestructura, Regulación IA, Hardware / Chips, Tecnología (genérico).

**Qué escribe en Google Sheets:**
| Columna | Datos |
|---|---|
| Encabezado | Texto del titular |
| URL | Link directo al artículo |
| Fecha de Publicación | Cuándo lo publicó el sitio original |
| Autor | Nombre del autor (si se encontró) |
| Fecha de Generación | Día en que el sistema procesó el titular |
| Tema (Filtro) | Categoría inferida automáticamente |

**Comportamiento con encabezados:** Si la hoja está vacía, el script crea los encabezados primero. Si ya existen, los respeta. Siempre agrega al final sin borrar lo anterior.

---

### `ogilvy-daily-headlines.log`
**Qué es:** Log unificado de ambos pasos. Registra cada ejecución con timestamp (zona horaria Bogotá), incluyendo cuántos titulares se encontraron por sitio, errores, titulares seleccionados con su puntaje, y resultado del envío a Telegram.

Útil para depurar si algo falló o para ver el histórico de ejecuciones.

---

### `gcp-service-account.json`
**Qué es:** Credenciales del servicio de Google Cloud que autoriza al script a escribir en Google Sheets y Google Drive. Es un archivo sensible — no está en el repositorio de GitHub.

---

### `write-sheets-temp.js`
**Qué es:** Script legacy/manual, precursor del Paso 2. Ya no se usa en el flujo automático. Se conserva como referencia.

---

## Flujo completo paso a paso

```
7:00 AM  ┌─────────────────────────────────────────────────────┐
         │ CRON ejecuta ogilvy-daily-headlines.js              │
         │                                                     │
         │ 1. Lee ogilvy-config.json                           │
         │ 2. Hace GET a cada uno de los 22 sitios             │
         │ 3. Parsea el HTML con Cheerio                       │
         │ 4. Extrae H1/H2/H3 que tengan keywords             │
         │ 5. Intenta extraer autor, fecha y descripción       │
         │ 6. Filtra autores que son publishers (no personas)  │
         │ 7. Guarda todo en ogilvy-scraped-data.json          │
         └─────────────────────────────────────────────────────┘

7:05 AM  ┌─────────────────────────────────────────────────────┐
         │ CRON ejecuta ogilvy-write-sheets.js                 │
         │                                                     │
         │ 1. Lee ogilvy-scraped-data.json                     │
         │ 2. Deduplica por URL                                │
         │ 3. Filtra titulares inválidos (sin URL, muy cortos) │
         │ 4. Puntúa cada titular (fecha + keywords + autor)   │
         │ 5. Ordena de mayor a menor puntaje                  │
         │ 6. Selecciona top 10 con diversidad de fuente       │
         │ 7. Infiere el tema de cada titular                  │
         │ 8. Escribe las filas en Google Sheets               │
         │ 9. Arma el resumen de texto para Telegram           │
         │ 10. Envía resumen vía Agente Smith → Telegram        │
         └─────────────────────────────────────────────────────┘
```

---

## Google Sheets

- **ID del documento:** `1-PsI_Lb4RniVLeAhE-lk_jBTkJs0cQUwDXxCLP5IrpU`
- **Pestaña:** `Revision`
- **Acceso:** https://docs.google.com/spreadsheets/d/1-PsI_Lb4RniVLeAhE-lk_jBTkJs0cQUwDXxCLP5IrpU

---

## Repositorio GitHub

- **URL:** https://github.com/juanpablo321/ogilvy-daily-headlines
- **Rama:** `main`
- **Excluidos del repo:** `gcp-service-account.json`, `ogilvy-scraped-data.json`, `*.log`

---

## Sitios con problemas conocidos

Los siguientes sitios generan errores 403/4xx frecuentemente y sus titulares no se capturan:
- `blog.google/products/google-store`
- `tesla.com/blog`
- `producthunt.com`
- `framer.com/changelog`

Sitios que no exponen autor ni fecha en sus listings (quedan como N/A):
- TechCrunch, Ars Technica, MIT Technology Review

---

## Comandos de mantenimiento

```bash
# Ver el cron activo
crontab -l

# Ejecutar Paso 1 manualmente
cd /home/smith/.openclaw/workspace/proyectos-activos/franco/ogilvy-daily-headlines
node ogilvy-daily-headlines.js

# Ejecutar Paso 2 manualmente
node ogilvy-write-sheets.js

# Ver logs en tiempo real
tail -f ogilvy-daily-headlines.log
```

---

## Qué modificar según el caso

| Necesidad | Qué editar |
|---|---|
| Agregar un sitio nuevo | `ogilvy-config.json` → `sitesToMonitor` |
| Cambiar el número de titulares | `ogilvy-config.json` → `numberOfHeadlinesToSelect` |
| Agregar palabras clave de filtro | `ogilvy-config.json` → `keywords` |
| Cambiar pesos del scoring | `ogilvy-write-sheets.js` → función `scoreHeadline()` |
| Cambiar los temas inferidos | `ogilvy-write-sheets.js` → función `inferTopic()` |
| Cambiar el formato del resumen de Telegram | `ogilvy-write-sheets.js` → variable `fullSummary` |
