import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import puppeteer from 'puppeteer';

import compression from 'compression';

// Importar los módulos refactorizados
import UrlAnalyzer from './analyzers/urlAnalyzer.js';
import TyposquattingDetector from './analyzers/typosquattingDetector.js';
import RiskCalculator from './analyzers/riskCalculator.js';
import SslInspector from './analyzers/sslInspector.js';
import DomInspector from './analyzers/domInspector.js';
import PhishTankService from './services/phishTankService.js';
import SafeBrowsingService from './services/safeBrowsingService.js';
import ReportRepository from './repositories/reportRepository.js';
import HistoryRepository from './repositories/historyRepository.js';
import VirusTotalService from './services/virusTotalService.js';
import AnalysisCache from './services/cacheService.js';
import MlService from './services/mlService.js';
import AiExplanationService from './services/aiExplanationService.js';
import UrlSecurityValidator from './security/urlValidator.js';
import AuthService from './security/authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PhishShieldServer {
  constructor(options = {}) {
    this.app = express();
    this.port = options.port || process.env.PORT || 3000;

    // Inyectar dependencias con posibilidad de overrides (útil para tests e integración aislada)
    this.urlAnalyzer = options.urlAnalyzer || new UrlAnalyzer();
    this.typosquattingDetector = options.typosquattingDetector || new TyposquattingDetector();
    this.riskCalculator = options.riskCalculator || new RiskCalculator();
    this.sslInspector = options.sslInspector || new SslInspector();
    this.domInspector = options.domInspector || new DomInspector();
    this.phishTankService = options.phishTankService || new PhishTankService();
    this.safeBrowsingService = options.safeBrowsingService || new SafeBrowsingService();
    this.virusTotalService = options.virusTotalService || new VirusTotalService();
    this.reportRepository = options.reportRepository || new ReportRepository();
    this.historyRepository = options.historyRepository || new HistoryRepository();
    this.cache = options.cache || new AnalysisCache();
    this.mlService = options.mlService || new MlService();
    this.aiExplanationService = options.aiExplanationService || new AiExplanationService();
    this.authService = options.authService || new AuthService();

    this.screenshotCache = new Map();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupAdminRoutes();
  }

  setupMiddleware() {
    // 1. Cabeceras de seguridad HTTP con Helmet (OWASP ASVS)
    this.app.use(helmet({
      contentSecurityPolicy: false, // Desactivado para no bloquear WebGL/Three.js local en desarrollo
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    }));

    // 2. Compresión HTTP Gzip/Deflate para alto rendimiento en payloads
    this.app.use(compression());

    // 2. CORS restrictivo parametrizable
    const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
    const allowedOrigins = allowedOriginsEnv
      ? allowedOriginsEnv.split(',').map(o => o.trim())
      : ['http://localhost:4200', 'http://127.0.0.1:4200', 'http://localhost:3001', 'http://127.0.0.1:3001'];

    this.app.use(cors({
      origin: (origin, callback) => {
        // Permitir solicitudes sin origen (curl, pruebas locales, SSR) o en lista blanca
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
          callback(null, true);
        } else {
          callback(new Error('Origen no permitido por política CORS'));
        }
      },
      credentials: true
    }));

    // 3. Rate Limiter Global (100 reqs por 15m)
    const limiterGlobal = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: process.env.NODE_ENV === 'test' ? 1000 : 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Límite de solicitudes excedido. Intenta más tarde.' }
    });
    this.app.use(limiterGlobal);

    this.app.use(express.json({ limit: '1mb' }));
    
    // Servir archivos de producción de Angular si existen
    const distPath = path.join(__dirname, '../dist/phishshield-angular/browser');
    if (fs.existsSync(distPath)) {
      this.app.use(express.static(distPath));
    }
  }

  setupRoutes() {
    // Rate limiters específicos
    const limiterAnalisis = rateLimit({
      windowMs: 5 * 60 * 1000,
      max: process.env.NODE_ENV === 'test' ? 500 : 60,
      message: { error: 'Demasiadas solicitudes de análisis o captura. Por favor espera unos minutos.' }
    });

    this.app.post('/analizar', limiterAnalisis, (req, res) => this.analyzeUrl(req, res));
    this.app.post('/reportar', (req, res) => this.reportUrl(req, res));
    this.app.get('/estadisticas', (req, res) => this.getStats(req, res));
    this.app.get('/historial', (req, res) => this.getHistory(req, res));
    this.app.get('/reportes', (req, res) => res.json(this.reportRepository.obtenerReportes()));
    this.app.get('/health', (req, res) => this.healthCheck(req, res));
    this.app.get('/api/screenshot', limiterAnalisis, (req, res) => this.generateLocalScreenshot(req, res));

    // Ruta raiz
    this.app.get('/', (req, res) => {
      const distIndex = path.join(__dirname, '../dist/phishshield-angular/browser/index.html');
      if (fs.existsSync(distIndex)) {
        return res.sendFile(distIndex);
      }
      res.json({
        servicio: 'PhishShield Forensic Engine API',
        version: '2.0.0',
        estado: 'operativo',
        frontend: 'http://localhost:4200'
      });
    });
  }

  // Middleware de autenticación de admin con CSPRNG y TTL
  authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado: Cabecera Authorization requerida' });
    }
    const token = authHeader.split(' ')[1];
    if (!this.authService.validarToken(token)) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    next();
  }

  setupAdminRoutes() {
    // Rate Limiter estricto contra ataques de fuerza bruta en Login
    const limiterLogin = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: process.env.NODE_ENV === 'test' ? 100 : 8,
      message: { success: false, error: 'Demasiados intentos fallidos de inicio de sesión. Bloqueo temporal activado.' }
    });

    // Login seguro con Scrypt y CSPRNG
    this.app.post('/api/login', limiterLogin, (req, res) => {
      const { username, password } = req.body || {};
      const resultado = this.authService.autenticar(username, password);

      if (resultado.exito) {
        res.json({ success: true, token: resultado.token, expiraEn: resultado.expiraEnSegundos });
      } else {
        res.status(401).json({ success: false, error: resultado.motivo || 'Credenciales incorrectas' });
      }
    });

    // Exportar Datos
    this.app.get('/api/admin/export/reportes', (req, res) => this.authenticateAdmin(req, res, () => {
      const reportes = this.reportRepository.obtenerReportes();
      res.json(reportes);
    }));

    this.app.get('/api/admin/export/historial', (req, res) => this.authenticateAdmin(req, res, () => {
      const historial = this.historyRepository.obtenerTodoHistorial();
      res.json(historial);
    }));

    // Eliminar Falsos Positivos
    this.app.delete('/api/admin/reportar', (req, res) => this.authenticateAdmin(req, res, () => {
      const { dominio } = req.body;
      const eliminado = this.reportRepository.eliminarReporte(dominio);
      if (eliminado) {
        this.cache.invalidateByDomain(dominio);
        res.json({ success: true, mensaje: 'Reporte eliminado' });
      } else {
        res.status(404).json({ success: false, error: 'Dominio no encontrado' });
      }
    }));

    this.app.delete('/api/admin/historial', (req, res) => this.authenticateAdmin(req, res, () => {
      const { url } = req.body;
      const eliminado = this.historyRepository.eliminarAnalisis(url);
      if (eliminado) {
        res.json({ success: true, mensaje: 'Análisis eliminado' });
      } else {
        res.status(404).json({ success: false, error: 'URL no encontrada' });
      }
    }));

    // Cambiar contraseña de forma segura con hash y salt
    this.app.post('/api/admin/change-password', (req, res) => this.authenticateAdmin(req, res, () => {
      const { oldPassword, newPassword } = req.body || {};
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Ambas contraseñas son requeridas' });
      }

      const resultado = this.authService.cambiarContrasena(oldPassword, newPassword);
      if (resultado.exito) {
        res.json({ success: true, mensaje: resultado.mensaje });
      } else {
        res.status(400).json({ success: false, error: resultado.error });
      }
    }));

    // Reentrenar microservicio de Machine Learning en caliente con los datos acumulados
    this.app.post('/api/admin/ml/retrain', (req, res) => this.authenticateAdmin(req, res, async () => {
      try {
        const respuesta = await this.mlService.reentrenar();
        res.json({ success: true, ...respuesta });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }));
  }

  async analyzeUrl(req, res) {
    try {
      const { url } = req.body || {};

      if (!url) {
        return res.status(400).json({ error: 'URL requerida' });
      }

      // Validación de Seguridad contra SSRF (Server-Side Request Forgery)
      const validacionSeguridad = UrlSecurityValidator.validarUrl(url);
      if (!validacionSeguridad.valida) {
        return res.status(400).json({
          error: validacionSeguridad.motivo || 'URL no permitida por política de seguridad',
          codigo: 'SSRF_BLOCKED'
        });
      }

      const urlSegura = validacionSeguridad.urlNormalizada;

      // Intentar obtener de caché primero
      const cacheHit = this.cache.get(url);
      if (cacheHit) {
        console.log('⚡ Respondiendo desde caché para:', url);
        return res.json(cacheHit);
      }

      console.log('🔍 Analizando URL:', url);

      // 1. Análisis técnico
      const caracteristicas = this.urlAnalyzer.analyze(url);

      // 2. Detección de typosquatting
      const typosquatting = this.typosquattingDetector.detectar(caracteristicas.dominio);

      // 3. Verificaciones externas e inspección profunda en paralelo
      const verificacionesExternas = [];

      // Validar si el dominio ya fue reportado manualmente por un usuario
      const reportes = this.reportRepository.obtenerReportes();
      if (reportes.includes(caracteristicas.dominio)) {
        verificacionesExternas.push('reportado_manualmente');
      }

      const sld = caracteristicas.dominio || '';
      const esOficial = this.typosquattingDetector.marcasLegitimas.some(m => 
        m.dominios.some(dom => caracteristicas.dominio === dom || caracteristicas.dominio.endsWith('.' + dom))
      );

      const [phishTankRes, safeBrowsingRes, virusTotalRes, mlRes, sslRes, domRes] = await Promise.allSettled([
        this.phishTankService.verificar(url),
        this.safeBrowsingService.verificar(url),
        this.virusTotalService.verificar(url),
        this.mlService.predecirRiesgo(url),
        this.sslInspector.inspeccionar(url),
        this.domInspector.inspeccionar(url, sld, esOficial)
      ]);

      if (phishTankRes.status === 'fulfilled' && phishTankRes.value) {
        verificacionesExternas.push(phishTankRes.value);
      }
      if (safeBrowsingRes.status === 'fulfilled' && safeBrowsingRes.value) {
        verificacionesExternas.push(safeBrowsingRes.value);
      }
      if (virusTotalRes.status === 'fulfilled' && virusTotalRes.value) {
        verificacionesExternas.push(virusTotalRes.value);
      }

      const mlResult = mlRes.status === 'fulfilled' && mlRes.value ? mlRes.value : null;
      const sslResult = sslRes.status === 'fulfilled' && sslRes.value ? sslRes.value : null;
      const domResult = domRes.status === 'fulfilled' && domRes.value ? domRes.value : null;

      // 4. Reunir indicadores completos
      const indicadores = [
        ...typosquatting.indicadores,
        ...this.getTechnicalIndicators(caracteristicas),
        ...(sslResult && sslResult.indicadores ? sslResult.indicadores : []),
        ...(domResult && domResult.indicadores ? domResult.indicadores : [])
      ];

      // 5. Calcular riesgo
      const { puntuacion, factores } = this.riskCalculator.calcular(
        indicadores,
        caracteristicas,
        verificacionesExternas,
        mlResult,
        sslResult,
        domResult
      );

      const riesgo = this.riskCalculator.determinarRiesgo(puntuacion);

      // 6. Generar Explicación y Quiz Adaptativo con IA
      const asistenteIA = await this.aiExplanationService.generarExplicacionYQuiz({
        url,
        riesgo,
        puntuacion,
        probabilidad_ml: mlResult ? mlResult.probability : null,
        inspeccion_ssl: sslResult,
        inspeccion_dom: domResult,
        caracteristicas_tecnicas: caracteristicas,
        indicadores
      });

      const resultado = {
        url,
        riesgo,
        indicadores,
        puntuacion,
        probabilidad_ml: mlResult ? mlResult.probability : null,
        inspeccion_ssl: sslResult,
        inspeccion_dom: domResult,
        asistente_ia: asistenteIA,
        caracteristicas_tecnicas: caracteristicas,
        factores_puntuacion: factores,
        timestamp: new Date().toISOString()
      };

      // Guardar en historial
      this.historyRepository.guardarAnalisis(resultado);

      // Guardar en caché
      this.cache.set(url, resultado);

      console.log('✅ Análisis completado - Riesgo:', riesgo, 'Puntuación:', puntuacion);
      res.json(resultado);

    } catch (error) {
      console.error('❌ Error analizando URL:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        detalles: error.message
      });
    }
  }

  getTechnicalIndicators(caracteristicas) {
    const indicadores = [];

    if (caracteristicas.esIP) {
      indicadores.push('🌐 Usa dirección IP en lugar de dominio legítimo');
    }

    if (!caracteristicas.esHTTPS) {
      indicadores.push('🔓 Usa HTTP inseguro en lugar de HTTPS');
    }

    if (caracteristicas.parametrosSensibles.length > 0) {
      indicadores.push(`⚡ Contiene parámetros sensibles: ${caracteristicas.parametrosSensibles.join(', ')}`);
    }

    if (caracteristicas.tieneGuionesMultiples) {
      indicadores.push('🕵️ Múltiples guiones en dominio (técnica común en phishing)');
    }

    if (caracteristicas.subdominios > 2) {
      indicadores.push('🔗 Muchos subdominios (posible ofuscación)');
    }

    if (caracteristicas.longitudTotal > 100) {
      indicadores.push('📏 URL excesivamente larga (posible ofuscación)');
    }

    return indicadores;
  }

  reportUrl(req, res) {
    const { url } = req.body || {};

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL requerida' });
    }

    const validacion = UrlSecurityValidator.validarUrl(url);
    if (!validacion.valida) {
      return res.status(400).json({ success: false, error: validacion.motivo });
    }

    try {
      this.reportRepository.guardarReporte(validacion.urlNormalizada);
      this.cache.invalidate(validacion.urlNormalizada);

      res.json({
        success: true,
        mensaje: '✅ URL reportada correctamente',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'URL inválida',
        detalles: error.message
      });
    }
  }

  getStats(req, res) {
    const estadisticas = {
      total_analisis: this.historyRepository.total(),
      reportes_phishing: this.reportRepository.totalReportes(),
      analisis_hoy: this.historyRepository.obtenerAnalisisHoy().length,
      distribucion_riesgo: this.historyRepository.obtenerDistribucionRiesgo(),
      ultima_actualizacion: new Date().toISOString()
    };
    res.json(estadisticas);
  }

  getHistory(req, res) {
    const { limite = 500 } = req.query;
    const historial = this.historyRepository.obtenerHistorial(parseInt(limite, 10));
    res.json(historial);
  }

  healthCheck(req, res) {
    res.json({
      status: 'ok',
      servicio: 'PhishShield API',
      version: '2.0.0',
      timestamp: new Date().toISOString()
    });
  }

  async generateLocalScreenshot(req, res) {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'Parámetro URL requerido' });
    }

    // Validación estricta anti-SSRF antes de lanzar Chromium
    const validacionSeguridad = UrlSecurityValidator.validarUrl(url);
    if (!validacionSeguridad.valida) {
      return res.status(400).json({
        error: validacionSeguridad.motivo || 'Acceso a URL bloqueado por seguridad',
        codigo: 'SSRF_BLOCKED'
      });
    }

    const targetUrl = validacionSeguridad.urlNormalizada;

    // 1. Servir desde caché si ya fue capturada recientemente (< 15 minutos)
    if (this.screenshotCache.has(targetUrl)) {
      const cached = this.screenshotCache.get(targetUrl);
      if (Date.now() - cached.timestamp < 15 * 60 * 1000) {
        console.log(`⚡ Retornando vista previa en caché para: ${targetUrl}`);
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=900');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        return res.send(cached.buffer);
      }
    }

    let browser;
    try {
      console.log(`📸 Generando captura ultrarrápida para: ${targetUrl}...`);

      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 720 });

      // 2. Interceptar y abortar descargas pesadas que ralentizan la vista previa
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const type = request.resourceType();
        if (type === 'media' || type === 'font') {
          request.abort();
        } else {
          request.continue();
        }
      });

      // 3. Cargar hasta DOMContentLoaded con timeout de 8 segundos
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
      } catch (navError) {
        // Si hay timeout leve pero cargó parte del DOM, continuamos la captura
        console.warn(`⚠️ Advertencia de navegación suave: ${navError.message}`);
      }

      // 4. Pausa de 3 segundos para permitir el renderizado completo de SPAs, scripts dinámicos y desaparición de spinners
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 5. Captura JPEG optimizada (calidad 75 reduce el tamaño de 3MB a ~60KB)
      const screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality: 75,
        clip: { x: 0, y: 0, width: 1280, height: 720 }
      });

      // 6. Guardar en caché LRU en memoria (máx 50 elementos)
      if (this.screenshotCache.size > 50) {
        const primerKey = this.screenshotCache.keys().next().value;
        this.screenshotCache.delete(primerKey);
      }
      this.screenshotCache.set(targetUrl, {
        buffer: screenshotBuffer,
        timestamp: Date.now()
      });

      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=900');
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      res.send(screenshotBuffer);
      console.log(`✅ Captura generada en tiempo récord para: ${targetUrl}`);

    } catch (error) {
      console.error(`❌ Error al generar captura para ${req.query.url}:`, error.message);
      res.status(500).send('No se pudo generar la vista previa local.');
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`🚀 Servidor PhishShield ejecutándose en http://localhost:${this.port}`);
      console.log(`📊 Endpoints disponibles:`);
      console.log(`   POST /analizar - Analizar URL`);
      console.log(`   POST /reportar - Reportar phishing`);
      console.log(`   GET  /estadisticas - Ver estadísticas`);
      console.log(`   GET  /health - Estado del servidor`);
    });
    return this.server;
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) return reject(err);
          console.log('🛑 Servidor PhishShield cerrado limpiamente');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export default PhishShieldServer;