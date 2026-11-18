export function normalizeCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const terminalNames = [
  { id:'bastenaken', pattern:/\bbastenaken(?:\s+terminal)?\b/gi },
  { id:'hanze', pattern:/\bhanze(?:\s+terminal)?\b/gi },
  { id:'north', pattern:/\b(?:noordelijke?\s+insteek(?:terminal)?|north(?:ern)?(?:\s+inlet)?(?:\s+terminal)?|nit)\b/gi },
  { id:'south', pattern:/\b(?:zuidelijke?\s+insteek(?:terminal)?|south(?:ern)?(?:\s+inlet)?(?:\s+terminal)?|sit)\b/gi },
  { id:'nissan', pattern:/\bnissan(?:\s+terminal)?\b/gi },
  { id:'toyota', pattern:/\btoyota(?:\s+terminal)?\b/gi }
];

export function terminalFromInput(input) {
  for(const terminal of terminalNames) {
    terminal.pattern.lastIndex=0;
    if(terminal.pattern.test(String(input ?? ''))) return terminal.id;
  }
  return null;
}

function stripTerminalNames(input) {
  let result=String(input ?? '');
  for(const terminal of terminalNames) result=result.replace(terminal.pattern,' ');
  return result.replace(/\s+/g,' ').trim();
}

export function parseDestination(input) {
  let raw = stripTerminalNames(input).replace(/^(?:parking|park|parkeerplaats)\s+/i, '');
  let line = null;
  const explicit = raw.match(/\s*(?:\b(?:line|lijn|rij)\b|[/,;])\s*(.*)$/i);
  if (explicit) {
    if (!/^[1-9]\d{0,3}$/.test(explicit[1].trim())) {
      return { parking: normalizeCode(raw.slice(0, explicit.index)), line: null, error: 'Enter a whole line number greater than zero, for example H61 line 15.' };
    }
    line = String(Number(explicit[1].trim()));
    raw = raw.slice(0, explicit.index);
  }
  return { parking: normalizeCode(raw), line, error: null };
}

export function searchParkings(maps, input, mapId = 'all', {preferredTerminal=null} = {}) {
  const parsed = parseDestination(input);
  if (parsed.error || !parsed.parking) return [];
  const found = [];
  const terminalFilter=terminalFromInput(input) || (['all','auto'].includes(mapId) ? null : mapId);
  const localTerminal=terminalFilter?null:preferredTerminal;
  for (const map of maps) {
    for (const parking of map.parkings) {
      const currentRegionalMatch=map.id==='south' && ['bastenaken','hanze'].includes(terminalFilter) && parking.terminal===terminalFilter;
      if(terminalFilter && map.id!==terminalFilter && !currentRegionalMatch) continue;
      const code = normalizeCode(parking.code);
      if (!code.startsWith(parsed.parking)) continue;
      const localRegionalMatch=map.id==='south' && ['bastenaken','hanze'].includes(localTerminal) && parking.terminal===localTerminal;
      const preferred=!!localTerminal&&(map.id===localTerminal||localRegionalMatch);
      found.push({ map, parking, line: parsed.line, matchedTerminal:currentRegionalMatch?terminalFilter:localRegionalMatch?localTerminal:map.id,preferred,
        rank: (code === parsed.parking ? 0 : 10) + (map.historical ? 1 : 0) });
    }
  }
  return found.sort((a,b)=>Number(b.preferred)-Number(a.preferred) || a.rank-b.rank || a.parking.code.localeCompare(b.parking.code,undefined,{numeric:true}) || a.map.name.localeCompare(b.map.name));
}

export function routeStatus(parking, line) {
  return {
    available: false,
    title: parking ? 'Internal road guidance is not available yet' : 'Choose a parking first',
    message: line
      ? `The plan locates ${parking?.code ?? 'the parking'}, but does not locate line ${line}. Verified line positions and internal road routes are needed before navigation can guide you there.`
      : 'This plan shows parking locations. Its internal roads, allowed turns and GPS alignment have not been verified for navigation.'
  };
}
