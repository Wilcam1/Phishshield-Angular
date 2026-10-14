# 🛡️ PhishShield - Plataforma Integral de Detección Forense de Phishing

PhishShield es un sistema avanzado de ciberseguridad defensiva y análisis forense automatizado de URLs y dominios sospechosos. Integra una arquitectura fullstack desacoplada en un único repositorio con un frontend moderno en **Angular 22**, un backend analítico multicapa en **Node.js (Express 5)** y un microservicio de **Machine Learning en Python (Scikit-Learn)**.

---

## 🚀 Arquitectura del Sistema

```text
               ┌─────────────────────────────────────────┐
               │       Cliente Web (Angular 22)          │
               │   Clean Architecture / Signals / Apple  │
               └────────────────────┬────────────────────┘
                                    │ (HTTPS / REST)
                                    ▼
               ┌─────────────────────────────────────────┐
               │   API Gateway & Backend (Express 5)     │
               │        (server/index.js :3000)          │
               └────┬───────────────────────────────┬────┘
                    │                               │
        ┌───────────┴───────────┐       ┌───────────┴───────────┐
        ▼                       ▼       ▼                       ▼
┌──────────────┐        ┌──────────────┐┌──────────────┐┌──────────────┐
│  Validación  │        │ Motores      ││ Persistencia ││ Microservicio│
│  SSRF / WAF  │        │ Forenses     ││ server/data/ ││ ML en Python │
│ (Anti-fraude)│        │• Typosquatting││• blacklist   ││   (:8000)    │
└──────────────┘        │• Cripto SSL  ││• reports     ││• Scikit-Learn│
                        │• DOM Puppeteer││• history     ││• Joblib Model│
                        │  (Espera 3s) ││• cache       │└──────────────┘
                        │• Threat Intel││• auth        │
                        │  (VirusTotal,│└──────────────┘
                        │   SafeBrowser│
                        │   PhishTank, │
                        │   Gemini AI) │
                        └──────────────┘
```

---

## 📁 Estructura del Proyecto

```text
PhishShield-Angular/
├── server/                          # Backend Express & Servicios
│   ├── analyzers/                   # Motores de análisis (DOM, SSL, Typosquatting, URL, Riesgo)
│   ├── data/                        # Persistencia unificada y volúmenes Docker
│   │   ├── blacklist.json           # Lista de dominios sospechosos conocidos (versionado)
│   │   ├── reports.json             # Reportes comunitarios iniciales (versionado)
│   │   ├── history.json             # Historial dinámico de análisis (ignorado en Git)
│   │   ├── cache.json               # Caché TTL en caliente (ignorado en Git)
│   │   └── auth.json                # Credenciales cifradas Scrypt (ignorado en Git)
│   ├── ml_service/                  # Microservicio de Machine Learning en Python
│   │   ├── main.py                  # API FastAPI/Uvicorn del modelo
│   │   ├── model.joblib             # Modelo entrenado para clasificación de phishing
│   │   └── requirements.txt         # Dependencias Python
│   ├── repositories/                # Acceso a datos (HistoryRepository, ReportRepository)
│   ├── security/                    # Validación anti-SSRF y AuthService (Scrypt + CSPRNG)
│   ├── services/                    # Conectores VirusTotal, SafeBrowsing, Gemini AI, Caché
│   ├── tests/                       # Suite de pruebas unitarias y de integración (Vitest)
│   ├── app.js                       # Clase principal PhishShieldServer con DI
│   └── index.js                     # Punto de entrada y Graceful Shutdown
│
├── src/                             # Frontend Angular 22 (Clean Architecture en Español)
│   └── app/
│       ├── nucleo/                  # Constantes globales y configuraciones de entorno
│       ├── datos/                   # DTOs, mapeadores puros, modelos y repositorios HTTP
│       ├── logica/                  # Servicios de dominio, Signals reactivos, guardias y validadores
│       └── presentacion/            # Páginas lazy, componentes standalone, directivas y tokens Apple
│
├── Dockerfile                       # Multi-stage build optimizado (Node 20 + Chromium)
├── docker-compose.yml               # Orquestación de contenedores (PhishShield + ML Service)
├── ARQUITECTURA.md                  # Documentación técnica formal de capas y diseño
└── README.md                        # Guía de usuario y despliegue
```

---

## 📋 Requisitos del Entorno

- **Node.js**: `v20.x` o superior
- **NPM**: `v10.x` o superior
- **Python**: `3.10+` *(Opcional: solo si se desea ejecutar el microservicio ML localmente sin Docker)*
- **Chromium / Chrome**: Necesario para captura visual de pantalla y auditoría profunda de DOM (instalado automáticamente en la imagen Docker).

---

## 🛠️ Instalación y Configuración

### 1. Clonar el Repositorio

```bash
git clone https://github.com/Wilcam1/Phishshield-Angular.git
cd Phishshield-Angular
npm install
```

### 2. Configurar Variables de Entorno

Copia el archivo de plantilla `.env.example` a `.env`:

```bash
cp .env.example .env
```

Parámetros principales en `.env`:

| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `PORT` | Puerto de escucha de la API Express | `3000` |
| `NODE_ENV` | Entorno de ejecución (`development` / `production`) | `production` |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos separados por comas | `http://localhost:4200,http://localhost:3000` |
| `ML_SERVICE_URL` | URL del microservicio de Machine Learning en Python | `http://localhost:8000` |
| `ADMIN_USERNAME` | Usuario administrador para el panel SOC | `admin` |
| `ADMIN_PASSWORD` | Contraseña maestra del administrador | *(Definir en despliegue)* |
| `VIRUSTOTAL_API_KEY` | Clave API de VirusTotal *(Opcional)* | - |
| `GOOGLE_SAFE_BROWSING_API_KEY` | Clave API de Google Safe Browsing *(Opcional)* | - |
| `GEMINI_API_KEY` | Clave API de Google Gemini para explicaciones IA *(Opcional)* | - |

---

## 💻 Ejecución del Proyecto

### Opción A: Modo Fullstack Completo (Frontend + Backend + ML)
```bash
npm start
```
*Inicia concurrentemente el microservicio ML en Python (`:8000`), el backend Express (`:3000`) y el frontend Angular (`:4200`).*

### Opción B: Modo Ligero sin Python (Recomendado para desarrollo ágil)
```bash
npm run start:no-ml
```
*Inicia el API Gateway y el cliente Angular. El backend conmuta automáticamente a modo de fallback resiliente sin interrumpir ningún análisis heurístico ni de VirusTotal.*

### Comandos Individuales
```bash
# Solo microservicio Machine Learning
npm run ml

# Solo servidor Backend Node.js
npm run server

# Solo cliente Frontend Angular
npm run client

# Compilación para Producción (Build)
npm run build
```

---

## 🧪 Pruebas Automatizadas y Calidad

El proyecto cuenta con suites de pruebas unitarias, de integración, de seguridad y verificación estricta de capas por linter:

```bash
# Ejecutar todas las pruebas (Frontend + Backend)
npm run test:all

# Pruebas del Backend (Vitest - 37 pruebas pasando)
npm run test:server

# Pruebas del Frontend Angular (Signals, Tuberías, Validadores, Mapeadores)
npm test

# Verificación de reglas arquitectónicas de capas y estilos (ESLint)
npm run lint
```

---

## 🐳 Despliegue en Producción con Docker

### Docker Compose (Multi-Contenedor)

Levanta la arquitectura completa aislada en red interna con persistencia de volúmenes:

```bash
docker-compose up -d --build
```

Servicios incluidos:
1. **`phishshield`**: Frontend compilado + Servidor Express + Chromium headless sandboxed en el puerto `3000`.
2. **`phishshield-ml`**: Microservicio Python con modelo scikit-learn preentrenado en el puerto `8000`.
3. **Volumen `phishshield-data`**: Mapeado sobre `/app/server/data` para garantizar la persistencia de reportes, historial, sesiones y configuraciones ante reinicios.

---

## 🔒 Características de Seguridad y Rendimiento

1. **Defensa contra SSRF (Server-Side Request Forgery)**: Filtro estricto que bloquea solicitudes a `127.0.0.1`, `localhost`, redes privadas RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) y metadatos cloud (`169.254.169.254`).
2. **Captura Visual Headless con Hidratación SPA**: Puppeteer optimizado con compresión JPEG al 75% y un retardo de **3 segundos** tras `domcontentloaded`, asegurando que portales bancarios y SPAs (Angular, React, Vue) monten su contenido visual antes de capturar, evitando pantallas con logos de carga (*spinners*).
3. **Autenticación Criptográfica Robusta**:
   * Derivación de claves con **Scrypt** y sal criptográfica de 16 bytes.
   * Tokens CSPRNG de 256 bits (`crypto.randomBytes(32)`) con expiración por TTL (2 horas).
   * Comparación en tiempo constante (`crypto.timingSafeEqual`) contra ataques de canal lateral (*timing attacks*).
4. **Protección DoS / Rate Limiting**:
   * Límite global: 300 peticiones / 15 min por IP.
   * Análisis y capturas: 60 peticiones / 5 min.
   * Autenticación: 8 intentos fallidos / 15 min.
5. **Apagado Limpio (Graceful Shutdown)**: Manejo de señales `SIGTERM` y `SIGINT` en `server/index.js` liberando puertos y guardando estado en disco de forma segura.

---

## 📡 Catálogo de Endpoints de la API

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Público | Verificación de estado del servidor y uptime |
| `POST` | `/analizar` | Público (Rate-limit) | Análisis forense multicapa de una URL |
| `POST` | `/reportar` | Público (Rate-limit) | Registra una URL como phishing en la lista comunitaria |
| `GET` | `/estadisticas` | Público | Métricas agregadas de detección y volumen forense |
| `GET` | `/historial` | Público | Historial de análisis recientes ejecutados |
| `GET` | `/api/screenshot` | Público (Rate-limit) | Captura visual en tiempo real con 3s de renderizado |
| `POST` | `/api/login` | Público (Rate-limit) | Autenticación administrativa con emisión de token |
| `GET` | `/api/admin/export/reportes` | Privado (Bearer) | Exportación en CSV de reportes comunitarios |
| `POST` | `/api/admin/cambiar-password`| Privado (Bearer) | Actualización de contraseña administrativa cifrada |

---

## 📄 Licencia

Este proyecto es de código abierto bajo la licencia MIT.
