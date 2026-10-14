import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ReportRepository {
  constructor(customFilePath = null) {
    const defaultDataPath = path.join(__dirname, '../data/reports.json');
    const legacyPath = path.join(__dirname, '../../reports.json');
    this.reportFile = customFilePath || process.env.REPORTS_FILE || (fs.existsSync(defaultDataPath) ? defaultDataPath : (fs.existsSync(legacyPath) ? legacyPath : defaultDataPath));
    this.reportesPhishing = this._loadReports();
  }

  _loadReports() {
    try {
      if (fs.existsSync(this.reportFile)) {
        const data = JSON.parse(fs.readFileSync(this.reportFile, 'utf8'));
        return new Set(data);
      }
    } catch (error) {
      console.error('❌ Error cargando reportes:', error.message);
    }
    return new Set();
  }

  async _saveReports() {
    try {
      const dir = path.dirname(this.reportFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      await fs.promises.writeFile(this.reportFile, JSON.stringify([...this.reportesPhishing], null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error guardando reportes de forma asíncrona:', error.message);
    }
  }

  guardarReporte(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      const dominio = urlObj.hostname;
      this.reportesPhishing.add(dominio);
      this._saveReports();

      console.log('📋 URL reportada como phishing:', dominio);
      return true;
    } catch (error) {
      console.error('❌ Error guardando reporte:', error.message);
      return false;
    }
  }

  eliminarReporte(dominio) {
    if (this.reportesPhishing.has(dominio)) {
      this.reportesPhishing.delete(dominio);
      this._saveReports();
      console.log('🗑️ URL eliminada de reportes:', dominio);
      return true;
    }
    return false;
  }

  obtenerReportes() {
    return [...this.reportesPhishing];
  }

  totalReportes() {
    return this.reportesPhishing.size;
  }
}

export default ReportRepository;