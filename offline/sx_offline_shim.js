// ── Node 하네스 심 [S911-오프라인] ──
global.window = global; global.self = global;
global.localStorage = { _s:{}, getItem(k){ return (k in this._s)?this._s[k]:null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; }, clear(){ this._s={}; } };
global.navigator = { userAgent:'node-offline' };
