import {writeFileSync} from 'node:fs';

const key=(process.env.PORTWAY_GOOGLE_MAPS_BROWSER_KEY||'').trim();
if(!/^AIza[\w-]{30,60}$/.test(key))throw new Error('A restricted Google Maps browser key is required for this deployment.');
const configuration={apiKey:key,siteOrigin:'https://obaida-qaba.github.io'};
writeFileSync(new URL('../public/google-config.mjs',import.meta.url),'// Website-restricted public browser configuration.\nexport const GOOGLE_MAPS=Object.freeze('+JSON.stringify(configuration)+');\n');
console.log('Configured Google satellite for the production website.');
