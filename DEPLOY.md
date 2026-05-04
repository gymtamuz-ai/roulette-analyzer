# Deploy Guide — Roulette Analyzer Pro

## Resultado final
- **Frontend**: Vercel → URL pública + instalable como PWA en celular
- **Backend**: Railway (recomendado) o Render
- **Base de datos**: PostgreSQL administrado (Railway Plugin o Render managed)

---

## 1. BACKEND → Railway

### 1a. Crear proyecto en Railway
1. Ir a https://railway.app → **New Project**
2. **Deploy from GitHub repo** → seleccionar este repo → elegir carpeta `backend`
   - (o: **Empty project** → **Add Service** → **GitHub Repo** → configurar Root Directory: `backend`)
3. Railway detecta automáticamente Node.js y usa `npm start`

### 1b. Agregar PostgreSQL
1. En el proyecto Railway → **+ Add Service** → **Database** → **PostgreSQL**
2. Railway automáticamente setea `DATABASE_URL` en el servicio backend

### 1c. Variables de entorno backend (Railway)
Solo necesitás agregar:
```
NODE_ENV=production
```
> `DATABASE_URL` y `PORT` se setean automáticamente por Railway.

### 1d. Inicializar schema
El servidor inicializa el schema automáticamente al arrancar (via `schema.sql`).
No necesitás correr nada manual.

### 1e. Verificar
```
GET https://TU-APP.railway.app/api/health
→ { "ok": true, "db": "connected" }
```

---

## 2. FRONTEND → Vercel

### 2a. Crear proyecto en Vercel
1. Ir a https://vercel.com → **Add New Project**
2. Importar el repo → **Root Directory**: `frontend`
3. Framework: **Vite** (detectado automáticamente)
4. Build Command: `npm run build`
5. Output Directory: `dist`

### 2b. Variables de entorno (Vercel)
En **Project Settings → Environment Variables** agregar:

| Variable | Valor |
|----------|-------|
| `VITE_API_URL` | `https://TU-APP.railway.app/api` |

> ⚠️ Reemplazar con la URL real de Railway (ver el dominio generado en Railway dashboard).

### 2c. Deploy
- Click **Deploy** → Vercel buildea y publica automáticamente
- Cada push a `main` redeploya automáticamente

---

## 3. INSTALAR EN CELULAR (PWA)

### Android (Chrome)
1. Abrir la URL de Vercel en Chrome
2. Tocar el menú (⋮) → **"Agregar a pantalla de inicio"**
3. La app se instala como PWA nativa

### iOS (Safari)
1. Abrir la URL en Safari
2. Tocar el botón compartir (□↑) → **"Agregar a inicio"**
3. Confirmar → aparece en la home screen

---

## 4. RENDER (alternativa a Railway)

### Backend en Render
1. Ir a https://render.com → **New** → **Web Service**
2. Conectar repo → Root Directory: `backend`
3. Build Command: `npm install`
4. Start Command: `node src/app.js`
5. **Add PostgreSQL**: New → PostgreSQL (Free tier disponible)
6. Copiar `DATABASE_URL` del database al web service como env var

---

## 5. VARIABLES DE ENTORNO RESUMEN

### Backend (Railway/Render)
```
NODE_ENV=production
DATABASE_URL=<auto-seteado por la plataforma>
PORT=<auto-seteado por la plataforma>
```

### Frontend (Vercel)
```
VITE_API_URL=https://tu-backend.railway.app/api
```

---

## 6. DESARROLLO LOCAL (sin cambios)

```bash
# Terminal 1 — Backend
cd backend
npm run dev       # nodemon src/app.js en port 3001

# Terminal 2 — Frontend  
cd frontend
npm run dev       # vite en port 5173, proxy /api → :3001
```

---

## Estructura de archivos de configuración

```
roulette-analyzer/
├── .gitignore              ← no sube .env ni node_modules
├── backend/
│   ├── .env.example        ← copiar a .env para dev local
│   ├── railway.json        ← config Railway
│   ├── Procfile            ← config Render
│   └── src/
│       ├── app.js          ← PORT dinámico, CORS abierto, retry DB
│       └── db/index.js     ← soporta DATABASE_URL + SSL
└── frontend/
    ├── .env.example        ← copiar, llenar VITE_API_URL
    ├── .env.development    ← dev local (VITE_API_URL vacío = usa proxy)
    ├── vercel.json         ← SPA rewrites + cache headers
    ├── vite.config.js      ← PWA plugin + code splitting
    └── public/
        └── icon.svg        ← icono de la app (rueda de ruleta)
```
