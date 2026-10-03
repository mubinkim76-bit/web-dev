import fs from 'node:fs';for(const name of fs.readdirSync(new URL('../tests/',import.meta.url)).filter(x=>x.endsWith('.test.mjs')).sort())await import(new URL('../tests/'+name,import.meta.url));
