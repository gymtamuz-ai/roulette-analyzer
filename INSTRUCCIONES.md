# 🎡 Roulette Analyzer Pro — Instrucciones

## Requisitos
- Node.js 18+
- Docker Desktop (para PostgreSQL) — o PostgreSQL instalado localmente

---

## 1. Levantar la base de datos

### Opción A: Con Docker (recomendado)
```bash
cd roulette-analyzer
docker-compose up -d
```

### Opción B: PostgreSQL local
Crear la base de datos manualmente:
```sql
CREATE DATABASE roulette_analyzer;
```

---

## 2. Configurar y arrancar el BACKEND

```bash
cd roulette-analyzer/backend
npm install

# Copiar y editar .env si es necesario
copy .env.example .env

# Iniciar servidor (crea las tablas automáticamente)
npm run dev
```

El backend estará en: http://localhost:3001

---

## 3. Arrancar el FRONTEND

En otra terminal:
```bash
cd roulette-analyzer/frontend
npm install
npm run dev
```

Abrir: http://localhost:5173

---

## Uso rápido

1. Al abrir la app, crear una **mesa** (Casino + nombre)
2. Iniciar una **sesión**
3. Hacer clic en los números del teclado para registrar tiradas
4. El panel de apuesta muestra automáticamente:
   - **APOSTAR** + sectores + fichas
   - Progresión del ciclo (G/P)
5. El cilindro se colorea con el calor de frecuencias
6. Los atrasos muestran los números más "vencidos"

## Funciones extra

- **▶ Simular**: genera tiradas aleatorias para testear
- **↩ Deshacer**: elimina la última tirada
- **↓ CSV**: exporta todas las tiradas de la sesión
- Panel de Sesgo se expande al hacer clic en "Expandir"

## Variables .env (backend)

```
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=roulette_analyzer
DB_USER=postgres
DB_PASSWORD=postgres
```
