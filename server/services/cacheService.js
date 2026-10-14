import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AnalysisCache {
    constructor(ttlMinutes = 60, customFilePath = null) {
        const defaultDataPath = path.join(__dirname, '../data/cache.json');
        const legacyPath = path.join(__dirname, '../../cache.json');
        this.cacheFile = customFilePath || process.env.CACHE_FILE || (fs.existsSync(defaultDataPath) ? defaultDataPath : (fs.existsSync(legacyPath) ? legacyPath : defaultDataPath));
        this.ttl = ttlMinutes * 60 * 1000;
        this.cache = this._loadCache();
    }

    _loadCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
                // Limpiar entradas expiradas al cargar
                const now = Date.now();
                const validCache = {};
                
                Object.keys(data).forEach(url => {
                    if (now - data[url].timestamp < this.ttl) {
                        validCache[url] = data[url];
                    }
                });
                return validCache;
            }
        } catch (error) {
            console.error('❌ Error cargando caché:', error.message);
        }
        return {};
    }

    async _saveCache() {
        try {
            const dir = path.dirname(this.cacheFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            await fs.promises.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2), 'utf8');
        } catch (error) {
            console.error('❌ Error guardando caché de forma asíncrona:', error.message);
        }
    }

    get(url) {
        const entry = this.cache[url];
        if (entry) {
            if (Date.now() - entry.timestamp < this.ttl) {
                console.log('💎 Caché hit para:', url);
                return entry.data;
            } else {
                delete this.cache[url]; // Expirado
                this._saveCache();
            }
        }
        return null;
    }

    set(url, data) {
        this.cache[url] = {
            timestamp: Date.now(),
            data: data
        };
        this._saveCache();
    }

    invalidate(url) {
        if (this.cache[url]) {
            delete this.cache[url];
            this._saveCache();
        }
    }

    invalidateByDomain(domain) {
        let changed = false;
        Object.keys(this.cache).forEach(url => {
            try {
                const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
                if (urlObj.hostname === domain) {
                    delete this.cache[url];
                    changed = true;
                }
            } catch(e) {}
        });
        if (changed) this._saveCache();
    }
}

export default AnalysisCache;
