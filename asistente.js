(() => {
  'use strict';

  const root = document.createElement('div');
  root.id = 'rt-assistant-root';
  root.innerHTML = `
    <section class="rt-chat-panel" id="rt-chat-panel" role="dialog" aria-label="Asistente de Rentavio" aria-modal="false" hidden>
      <div class="rt-chat-head">
        <div class="rt-chat-brand"><span class="rt-chat-mark" aria-hidden="true">R</span><div><div class="rt-chat-title">Asistente Rentavio</div><div class="rt-chat-subtitle">Respuestas basadas en las fichas publicadas</div></div></div>
        <button class="rt-chat-close" type="button" aria-label="Cerrar asistente">×</button>
      </div>
      <div class="rt-chat-messages" id="rt-chat-messages" aria-live="polite" aria-relevant="additions text"></div>
      <div class="rt-chat-foot">No compartas claves ni datos de acceso. No es asesoramiento financiero.</div>
      <form class="rt-chat-form" id="rt-chat-form"><input class="rt-chat-input" id="rt-chat-input" maxlength="500" autocomplete="off" placeholder="Pregunta por una oferta o condición…" aria-label="Escribe tu pregunta"><button class="rt-chat-send" type="submit" aria-label="Enviar pregunta">➤</button></form>
    </section>
    <button class="rt-chat-toggle" type="button" aria-label="Abrir asistente Rentavio" aria-expanded="false" aria-controls="rt-chat-panel">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 7.4 7.4 0 0 1-3.3-.77L4 20l1.7-4.2A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 11.5h.01m3.49 0h.01m3.49 0h.01" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
    </button>`;
  document.body.append(root);

  const panel = root.querySelector('#rt-chat-panel');
  const toggle = root.querySelector('.rt-chat-toggle');
  const close = root.querySelector('.rt-chat-close');
  const log = root.querySelector('#rt-chat-messages');
  const form = root.querySelector('#rt-chat-form');
  const input = root.querySelector('#rt-chat-input');
  let dataPromise;
  let busy = false;

  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9€%.,-]+/g, ' ').trim();
  const stopWords = new Set('que cual cuales como cuanto cuantos cuando donde para por una uno unos unas este esta esos esas tengo quiero puede puedo debo hay con sin del las los desde hasta sobre entre es son ser me mi tu su y o al en de el la'.split(' '));
  const terms = value => normalize(value).split(/\s+/).filter(word => word.length > 2 && !stopWords.has(word));

  function extractDataArray(source) {
    const marker = /\bconst\s+DATA\s*=\s*/.exec(source);
    if (!marker) return [];
    const start = marker.index + marker[0].length;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === '[') depth++;
      else if (ch === ']' && --depth === 0) {
        try { return JSON.parse(source.slice(start, i + 1)); } catch (_) { return []; }
      }
    }
    return [];
  }

  function promoRecords(doc) {
    return [...doc.querySelectorAll('.promo')].map(card => {
      const title = card.querySelector('h3')?.textContent?.trim() || 'Promoción';
      const facts = [...card.querySelectorAll('p, li, .ranges span, .promo-highlight, .promo-code')]
        .map(node => node.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const links = [...card.querySelectorAll('a[href]')].map(a => ({ label: a.textContent.replace(/\s+/g, ' ').trim() || 'Consultar', url: a.href }));
      const source = links.find(link => /bases|condiciones|oficial|t[eé]rminos|programa/i.test(link.label)) || links.find(link => !/referid|invitaci[oó]n|acceder|abrir/i.test(link.label)) || null;
      const codeNodes = [...card.querySelectorAll('.promo-code, code, strong')].map(node => node.textContent.trim());
      const code = codeNodes.find(value => /^[A-Z0-9][A-Z0-9_-]{3,15}$/.test(value));
      const status = card.querySelector('.state')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return { kind: 'promo', entity: title.split(/[—–-]/)[0].trim(), title, search: normalize([title, card.dataset.search, ...facts, status].join(' ')), facts, source, code, status, review: doc.querySelector('.intro')?.textContent?.replace(/\s+/g, ' ').trim() || 'Fecha de revisión no indicada' };
    });
  }

  async function loadKnowledge() {
    const base = new URL('.', location.href);
    const [indexDoc, promosDoc] = await Promise.all([
      fetch(new URL('index.html', base), { cache: 'no-cache' }).then(r => r.ok ? r.text() : Promise.reject()).catch(() => ''),
      fetch(new URL('promociones.html', base), { cache: 'no-cache' }).then(r => r.ok ? r.text() : Promise.reject()).catch(() => '')
    ]);
    const bankData = extractDataArray(indexDoc);
    const banks = bankData.map(item => {
      const conditions = Array.isArray(item.condiciones) ? item.condiciones.map(row => Array.isArray(row) ? `${row[0]}: ${row[1]}` : String(row)) : [];
      const facts = [item.desc, item.cap, ...conditions, item.verdict, item.deadline ? `Fecha límite: ${item.deadline}` : '', item.requiereNomina === true ? 'Requiere domiciliar nómina' : item.requiereNomina === false ? 'No requiere nómina según la ficha' : ''];
      return { kind: 'banco', entity: item.entidad, title: `${item.entidad} — ${item.producto}`, category: item.cat, rate: item.rate, rateLabel: item.rateLabel, facts: facts.filter(Boolean), review: item.actualizado ? `Datos de la ficha revisados: ${item.actualizado}` : 'Fecha de revisión no indicada', source: item.url ? { label: 'Consultar entidad', url: item.url } : null, search: normalize(`${item.entidad} ${item.producto} ${item.cat} ${item.tipo} ${facts.join(' ')} ${item.rateLabel}`), requiresPayroll: item.requiereNomina, deadline: item.deadline };
    });
    const temp = new DOMParser().parseFromString(promosDoc, 'text/html');
    return [...banks, ...promoRecords(temp)];
  }

  function getKnowledge() { return dataPromise ||= loadKnowledge(); }

  function scoreRecord(record, query, queryTerms) {
    const nQuery = normalize(query);
    const nTitle = normalize(`${record.entity} ${record.title}`);
    let score = nQuery.includes(nTitle) || nTitle.includes(nQuery) ? 12 : 0;
    if (record.entity.length > 2 && nQuery.includes(normalize(record.entity))) score += 10;
    for (const word of queryTerms) if (record.search.includes(word)) score += word.length > 5 ? 2 : 1;
    if (/nomina/.test(nQuery) && record.kind === 'banco' && record.category === 'nomina') score += 3;
    if (/deposito/.test(nQuery) && record.kind === 'banco' && record.category === 'deposito') score += 3;
    if (/%|tae|tin|interes|remuner/.test(nQuery) && record.kind === 'banco' && record.category === 'remunerada') score += 2;
    if (/codigo|cupon|referido/.test(nQuery) && record.kind === 'promo') score += 2;
    return score;
  }

  function isQuestionAbout(query, group) {
    const q = normalize(query);
    return group.some(word => q.includes(word));
  }

  function selectedFacts(record, query) {
    const q = normalize(query);
    if (isQuestionAbout(q, ['codigo', 'cupon', 'referido'])) return record.code ? [`Código para introducir: ${record.code}`, ...record.facts.filter(f => /codigo|cupon|referid/i.test(f))] : record.facts.filter(f => /codigo|cupon|referid/i.test(f));
    if (isQuestionAbout(q, ['requisito', 'nomina', 'recibo', 'tarjeta', 'bizum', 'ingresar', 'invertir', 'condicion'])) return record.facts.filter(f => /requ|debe|neces|nomina|recibo|tarjeta|bizum|ingres|invers|mantener|cliente|primera|alta|actividad|codigo|plazo/i.test(f));
    if (isQuestionAbout(q, ['tiempo', 'plazo', 'cuando', 'duracion', 'mes', 'ano', 'mantener', 'fecha'])) return record.facts.filter(f => /plazo|mes|ano|fecha|hasta|duraci|mantener|dias|día|primeros|trimestre|anual/i.test(f));
    if (isQuestionAbout(q, ['cuanto', 'ganar', 'bono', 'bonificacion', 'recompensa', 'rentabilidad', 'tipo', 'tae', 'tin', 'interes', 'porcentaje'])) return record.facts.filter(f => /€|%|bono|bonific|recompensa|rentabil|TAE|TIN|tipo|saldo|maximo|tramo/i.test(f));
    return record.facts;
  }

  function makeAnswer(record, query) {
    const facts = selectedFacts(record, query).filter(Boolean).slice(0, 5);
    if (record.kind === 'banco' && record.rate != null && !facts.some(f => /%/.test(f))) facts.unshift(`${record.rate}% ${record.rateLabel || ''}`.trim());
    const hasStatus = record.status ? /vigente|verificad|confirmad/i.test(record.status) : false;
    return {
      title: record.title,
      intro: record.kind === 'promo' ? 'Esto es lo que figura en la ficha de la promoción:' : 'Esto es lo que figura en la ficha bancaria:',
      facts: facts.length ? facts : ['La ficha no detalla esa condición. Consulta las condiciones oficiales antes de contratar.'],
      review: record.review,
      status: record.kind === 'promo' ? record.status : '',
      verified: hasStatus,
      code: /codigo|cupon/.test(normalize(query)) ? (record.code || '') : '',
      source: record.source
    };
  }

  function answerFor(query, records) {
    const q = normalize(query);
    if ((/\btae\b/.test(q) || /\btin\b/.test(q)) && /significa|que es|diferencia|sirve|compara/.test(q)) return { intro: 'A grandes rasgos:', facts: ['TIN: tipo nominal aplicado al saldo.', 'TAE: indicador anual que incorpora la frecuencia de pago y, cuando corresponde, otros costes del producto.', 'Compara el mismo concepto y periodo; una oferta promocional puede durar menos de un año.'], review: 'Definición general; revisa la información precontractual de cada producto.' };
    if (/pendiente de validar|datos pendientes|verificada/.test(q) && /significa|que quiere decir|estado|validar/.test(q)) return { intro: 'Cómo interpretar los estados de las fichas de Rentavio:', facts: ['«Vigente verificada» indica que la oferta se ha contrastado con información actual disponible.', '«Pendiente de validar» significa que falta confirmar algún importe, código, enlace o requisito; no lo des por garantizado.', 'La fecha de revisión y el enlace a la fuente aparecen en la ficha cuando están disponibles.'] };
    if (/cuando|fecha|actualizada|actualizacion|vigente/.test(q) && /oferta|promo|promocion|datos|revis/.test(q)) return { intro: 'La web muestra la fecha de revisión que consta en cada ficha, pero esa fecha no garantiza que la campaña siga abierta hoy.', facts: ['Comprueba la fecha límite y abre el enlace de la entidad o las bases oficiales antes de registrarte.', 'Si la ficha marca un dato como pendiente de validar, no lo tomes como confirmado.'] };
    if (/recomend|mejor para mi|cual me conviene/.test(q)) return { intro: 'Puedo ayudarte a comparar condiciones publicadas, pero no determinar cuál es la mejor para tu situación personal.', facts: ['Dime el importe aproximado, el tiempo que podrías mantenerlo y si aceptarías domiciliar nómina.', 'Compararé requisitos, límites y remuneración tal como aparecen en las fichas, sin asumir que el máximo anunciado te corresponde.'] };
    if (/que ofertas|cuales|lista|sin nomina|no requiere nomina/.test(q) && /nomina/.test(q)) {
      const requires = /requieren|con nomina|domiciliar/.test(q);
      const offers = records.filter(record => record.kind === 'banco' && (requires ? record.requiresPayroll === true : record.requiresPayroll === false)).slice(0, 5);
      if (offers.length) return { intro: requires ? 'Estas fichas indican que requieren nómina:' : 'Estas fichas indican que no requieren nómina:', facts: offers.map(record => `${record.entity}: ${record.title.replace(`${record.entity} — `, '')}. ${record.rate}% ${record.rateLabel || ''}. ${record.facts.slice(0, 1).join('')}`), review: 'La vinculación y la fecha de revisión aparecen en cada ficha.' };
    }
    const queryTerms = terms(query);
    const ranked = records.map(record => ({ record, score: scoreRecord(record, query, queryTerms) })).filter(row => row.score > 0).sort((a,b) => b.score-a.score);
    if (ranked.length && ranked[0].score >= 3) {
      const best = ranked[0];
      const same = ranked.filter(row => row.score >= Math.max(3, best.score - 2)).slice(0, 3);
      if (same.length > 1 && !normalize(query).includes(normalize(best.record.entity))) return { intro: 'Estas fichas coinciden con tu pregunta. ¿Cuál quieres revisar?', choices: same.map(row => row.record.title) };
      return makeAnswer(best.record, query);
    }
    if (/nomina/.test(q)) {
      const offers = records.filter(record => record.kind === 'banco' && record.category === 'nomina').slice(0, 5);
      if (offers.length) return { intro: 'Estas fichas están clasificadas como ofertas con nómina. El importe y las condiciones varían por entidad:', facts: offers.map(record => `${record.entity}: ${record.rate}% ${record.rateLabel || ''}. ${record.facts.slice(0,2).join('; ')}`), review: 'Consulta cada ficha para ver requisitos y fecha de revisión.' };
    }
    return { intro: 'No encuentro esa condición con suficiente claridad en las fichas publicadas.', facts: ['Prueba a incluir el nombre del banco o la promoción.', 'Si la condición no aparece o está pendiente de validar, no la completaré por suposición.'] };
  }

  function appendMessage(role, value) {
    const bubble = document.createElement('div');
    bubble.className = `rt-chat-msg ${role}`;
    if (typeof value === 'string') {
      const p = document.createElement('p'); p.textContent = value; bubble.append(p);
    } else {
      if (value.intro) { const p=document.createElement('p'); p.textContent=value.intro; bubble.append(p); }
      if (value.title) { const p=document.createElement('p'); p.style.fontWeight='800'; p.textContent=value.title; bubble.append(p); }
      if (value.choices?.length) {
        const chips=document.createElement('div'); chips.className='rt-chat-chips';
        value.choices.forEach(choice=>{const b=document.createElement('button');b.type='button';b.className='rt-chat-chip';b.textContent=choice;b.addEventListener('click',()=>ask(choice));chips.append(b);});
        bubble.append(chips);
      }
      if (value.facts?.length) { const list=document.createElement('ul');list.className='rt-chat-facts';value.facts.forEach(fact=>{const li=document.createElement('li');li.textContent=fact;list.append(li);});bubble.append(list); }
      if (value.code) { const code=document.createElement('span');code.className='rt-chat-code';code.textContent=value.code;bubble.append(code); }
      if (value.status) { const status=document.createElement('span');status.className=`rt-chat-status ${value.verified?'':'pending'}`;status.textContent=value.status;bubble.append(status); }
      if (value.review) { const p=document.createElement('p');p.style.cssText='margin-top:9px;color:#6b7972;font-size:10px';p.textContent=value.review;bubble.append(p); }
      if (value.source?.url) { try { const url=new URL(value.source.url,location.href); if(['https:','http:'].includes(url.protocol)){const a=document.createElement('a');a.className='rt-chat-source';a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${value.source.label} ↗`;bubble.append(a);} } catch (_) {} }
    }
    log.append(bubble); log.scrollTop=log.scrollHeight;
  }

  async function ask(question) {
    const query=String(question||'').trim(); if(!query||busy)return;
    appendMessage('user',query); input.value=''; busy=true; form.querySelector('button').disabled=true;
    const loading=document.createElement('div');loading.className='rt-chat-msg assistant';loading.textContent='Revisando las fichas publicadas…';log.append(loading);log.scrollTop=log.scrollHeight;
    try { const records=await getKnowledge(); const reply=answerFor(query,records); loading.remove(); appendMessage('assistant',reply); }
    catch (_) { loading.remove(); appendMessage('assistant','Ahora mismo no puedo cargar las fichas. Prueba de nuevo más tarde o consulta directamente el comparador.'); }
    finally { busy=false;form.querySelector('button').disabled=false;input.focus(); }
  }

  function welcome() {
    appendMessage('assistant',{intro:'Hola. Te ayudo a entender requisitos, importes, plazos y códigos de las ofertas que aparecen en Rentavio. Las respuestas se basan en las fichas publicadas y enlazan a la entidad cuando hay una fuente disponible.',facts:['Puedes preguntar por una entidad concreta, por ejemplo: «¿Qué requisitos tiene Equito?»','Si algo no está confirmado en la ficha, te lo diré.']});
    const chips=document.createElement('div');chips.className='rt-chat-chips';
    ['Requisitos de Equito','Código de Equito','Ofertas sin nómina','¿Qué diferencia hay entre TAE y TIN?','¿Qué significa «pendiente de validar»?'].forEach(text=>{const b=document.createElement('button');b.type='button';b.className='rt-chat-chip';b.textContent=text;b.addEventListener('click',()=>ask(text));chips.append(b);});
    log.append(chips);
  }

  toggle.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){if(!log.children.length)welcome();input.focus();}else toggle.focus();});
  close.addEventListener('click',()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();});
  form.addEventListener('submit',event=>{event.preventDefault();ask(input.value);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}});
})();

