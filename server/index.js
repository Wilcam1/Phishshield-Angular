import PhishShieldServer from './app.js';

// Inicializar e iniciar el servidor
const appInstance = new PhishShieldServer();
const server = appInstance.start();

const shutdown = async (signal) => {
  console.log(`\n📢 Señal ${signal} recibida. Iniciando apagado limpio (Graceful Shutdown)...`);
  try {
    await appInstance.stop();
    console.log('✅ Proceso terminado sin fugas.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante el apagado limpio:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
