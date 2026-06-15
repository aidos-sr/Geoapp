// ═══ CLOUDINARY CONFIG FUNCTIONS ═══
async function saveCldCfg(){
  alert('Суреттер енді Supabase Storage-ке автоматты түрде жүктеледі.');
}

async function loadCldCfg(){
  return Boolean(window._supabase);
}

function escH(s){ return window.escapeHTML(s); }

// Map editor
window._mapDots=[];
window._mapImgData='';
window._mapOpts=[];

function loadMapImage(evt){
  const file=evt.target.files[0]; if(!file) return;
  const img=document.getElementById('mapEditorImg');
  const empty=document.getElementById('mapEditorEmpty');

  // Жүктелу индикаторы
  empty.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--gold2)">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin-slow 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    <span id="mapImgProgress" style="font-size:11px;font-weight:700">Жүктелуде...</span>
  </div>`;
  empty.style.display='flex';

  uploadToCourseStorage(file, pct => {
    const el = document.getElementById('mapImgProgress');
    if(el) el.textContent = pct + '%';
  }).then(result => {
    window._mapImgData = result.url;
    img.src = result.url; img.style.display='block';
    empty.style.display='none';
    window._mapDots=[];
    window._mapOpts=[];
    renderMapDots();
  }).catch(err => {
    empty.textContent = 'Қате: ' + err.message;
    empty.style.color = 'var(--coral)';
    console.error('Map image upload error:', err);
  });
}

function addMapDot(evt){
  const wrap=document.getElementById('mapEditorWrap');
  const rect=wrap.getBoundingClientRect();
  const x=((evt.clientX-rect.left)/rect.width*100).toFixed(1);
  const y=((evt.clientY-rect.top)/rect.height*100).toFixed(1);
  const idx=window._mapDots.length;
  window._mapDots.push({x:parseFloat(x),y:parseFloat(y),label:''});
  window._mapOpts.push('');
  renderMapDots();
}

function removeMapDot(i){
  window._mapDots.splice(i,1);
  window._mapOpts.splice(i,1);
  renderMapDots();
}

function renderMapDots(){
  const wrap=document.getElementById('mapEditorWrap');
  // Remove old dot elements
  wrap.querySelectorAll('.map-dot-edit').forEach(el=>el.remove());
  // Add dots
  window._mapDots.forEach((d,i)=>{
    const el=document.createElement('div');
    el.className='map-dot-edit';
    el.style.left=d.x+'%'; el.style.top=d.y+'%';
    el.textContent=i+1;
    el.title='Жою үшін басыңыз';
    el.onclick=function(e){e.stopPropagation();removeMapDot(i);};
    wrap.appendChild(el);
  });
  // Dots list (tags)
  const list=document.getElementById('mapDotsList');
  list.innerHTML=window._mapDots.length?window._mapDots.map((d,i)=>`<div class="map-dot-tag"><span>${i+1}. нүкте</span><button onclick="removeMapDot(${i})"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`).join(''):'';
  // Options editor
  const optsEl=document.getElementById('mapOptsEditor');
  if(window._mapDots.length===0){optsEl.innerHTML='';return;}
  optsEl.innerHTML='<label class="inp-label" style="margin-top:8px">Нүктелерге жауап нұсқалары</label>'+
    window._mapDots.map((_,i)=>`<div class="map-opt-row">
      <div class="map-opt-num">${i+1}</div>
      <input class="map-opt-inp" id="mapOpt${i}" placeholder="${i+1}. нүкте атауы..." value="${escH(window._mapOpts[i]||'')}" oninput="window._mapOpts[${i}]=this.value">
    </div>`).join('');
}

function closeModal(){ document.getElementById('editModal').classList.remove('show'); }


// ═══ КЖ (КҮНТІЗБЕЛІК ЖОСПАР) EDITOR ═══
window._kzhSteps = []; // [{t:'', min:'', d:''}]
window._kzhActive = false;

function kzhToggle(){
  window._kzhActive = !window._kzhActive;
  const ed = document.getElementById('kzhEditor');
  const btn = document.getElementById('kzhToggleBtn');
  const lbl = document.getElementById('kzhToggleLbl');
  if(window._kzhActive){
    ed.style.display = 'block';
    btn.classList.add('has-plan');
    lbl.textContent = 'КЖ бар (жасыру)';
    if(window._kzhSteps.length === 0) kzhAddStep();
  } else {
    ed.style.display = 'none';
    btn.classList.remove('has-plan');
    lbl.textContent = 'КЖ қосу';
  }
}

function kzhAddStep(){
  window._kzhSteps.push({t:'', min:'5 мин', d:''});
  kzhRenderSteps();
}

function kzhRemoveStep(i){
  window._kzhSteps.splice(i, 1);
  kzhRenderSteps();
}

function kzhRenderSteps(){
  const c = document.getElementById('kzhStepsContainer');
  if(!c) return;
  c.innerHTML = window._kzhSteps.map((s, i) => `
    <div class="kzh-step" id="kzhStep${i}">
      <button class="kzh-step-del" onclick="kzhRemoveStep(${i})" title="Жою"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      <div class="kzh-step-row">
        <div class="kzh-step-num">${i+1}</div>
        <input class="kzh-step-title" placeholder="Кезең атауы (мысалы: Кіріспе, Жаңа тақырып...)"
          value="${escH(s.t)}" oninput="window._kzhSteps[${i}].t=this.value">
        <input class="kzh-step-min" placeholder="5 мин"
          value="${escH(s.min)}" oninput="window._kzhSteps[${i}].min=this.value">
      </div>
      <textarea class="kzh-step-desc" placeholder="Кезеңде не істелетінін қысқаша жазыңыз..."
        oninput="window._kzhSteps[${i}].d=this.value">${escH(s.d)}</textarea>
    </div>
  `).join('');
}

function kzhLoad(plan){
  if(plan && plan.goal !== undefined){
    window._kzhActive = true;
    window._kzhSteps = (plan.steps||[]).map(s=>({t:s.t||'', min:s.min||'', d:s.d||''}));
    document.getElementById('kzhGoal').value = plan.goal||'';
    document.getElementById('kzhEditor').style.display = 'block';
    document.getElementById('kzhToggleBtn').classList.add('has-plan');
    document.getElementById('kzhToggleLbl').textContent = 'КЖ бар (жасыру)';
    kzhRenderSteps();
  } else {
    window._kzhActive = false;
    window._kzhSteps = [];
    document.getElementById('kzhGoal').value = '';
    document.getElementById('kzhEditor').style.display = 'none';
    document.getElementById('kzhToggleBtn').classList.remove('has-plan');
    document.getElementById('kzhToggleLbl').textContent = 'КЖ қосу';
  }
}

function kzhCollect(){
  if(!window._kzhActive) return null;
  // DOM-нан соңғы мәндерді жинау
  window._kzhSteps = window._kzhSteps.map((s, i) => {
    const block = document.getElementById('kzhStep'+i);
    if(block){
      const inputs = block.querySelectorAll('input');
      const ta = block.querySelector('textarea');
      return { t: inputs[0]?.value.trim()||s.t, min: inputs[1]?.value.trim()||s.min, d: ta?.value.trim()||s.d };
    }
    return s;
  }).filter(s => s.t.trim());
  return {
    goal: document.getElementById('kzhGoal').value.trim(),
    steps: window._kzhSteps
  };
}

async function saveModal(){
  if(!requireAdmin()) return;
  const kk=document.getElementById('mTKk').value.trim();
  if(!kk){alert('Тақырып атауын жазыңыз!');return;}
  const T = await getTopics();

  // Collect map opts from inputs (refresh from DOM)
  window._mapDots.forEach((_,i)=>{
    const el=document.getElementById('mapOpt'+i);
    if(el) window._mapOpts[i]=el.value.trim();
  });

  // Collect test blocks from DOM (inputs may not have fired oninput yet)
  const testBlocks = window._testBlocks.map((tb,idx)=>{
    const block = document.getElementById('testBlock'+idx);
    if(block){
      const qInp = block.querySelector('input.adm-inp');
      const optInps = block.querySelectorAll('.ans-opt-row input.adm-inp');
      const sel = block.querySelector('select');
      const opts = tb.opts ? [...tb.opts] : ['','','',''];
      optInps.forEach((inp, oi) => { opts[oi] = inp.value.trim(); });
      return {
        q: qInp?.value.trim()||tb.q,
        opts: opts.filter((_,i)=>i < (tb.opts||['','','','']).length),
        a: opts[0]||'', b: opts[1]||'', c: opts[2]||'', d: opts[3]||'',
        ans: sel?.value||tb.ans
      };
    }
    return { ...tb, a: tb.opts?.[0]||'', b: tb.opts?.[1]||'', c: tb.opts?.[2]||'', d: tb.opts?.[3]||'' };
  }).filter(tb=>tb.q.trim());

  const openBlocks = window._openBlocks.map((ob,idx)=>{
    const block = document.getElementById('openBlock'+idx);
    if(block){
      const ta = block.querySelector('textarea');
      return {q: ta?.value.trim()||ob.q};
    }
    return ob;
  }).filter(ob=>ob.q.trim());

  // First test/open become legacy fields (backward compat), rest go to arrays
  const firstTest = testBlocks[0] || null;
  const extraTests = testBlocks.slice(1);
  const firstOpen = openBlocks[0] || null;
  const extraOpens = openBlocks.slice(1);

  const entry={
    id: (function(){
      const inputId = parseInt(document.getElementById('mTId').value);
      if(!isNaN(inputId) && inputId>0) return inputId;
      return editIdx>=0 ? T[editIdx].id : Date.now();
    })(),
    kk, ru:document.getElementById('mTRu').value.trim(),
    imgUrl: safeImageUrl(document.getElementById('mImgUrl').value.trim()),
    tkk: rteGetHtml('mKk') || '',
    tru: rteGetHtml('mRu') || '',
    // Legacy single fields (first task)
    qkk: firstTest?.q||'',
    ans: firstTest?.ans||'A',
    opts: firstTest?.opts || (firstTest ? [firstTest.a,firstTest.b,firstTest.c,firstTest.d] : []),
    openq: firstOpen?.q||'',
    // Extra tasks
    tests: extraTests,
    opens: extraOpens,
    // Map
    mapq:document.getElementById('mMapQ').value.trim(),
    mapImg:window._mapImgData||'',
    mapDots:window._mapDots.slice(),
    mapOpts:window._mapOpts.slice(),
    plan: kzhCollect()
  };
  if(editIdx>=0) T[editIdx]=entry;
  else T.push(entry);
  await saveTopics(T);
  closeModal();
  renderAdminAsync();
}

function strip(html){ return html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }

// ═══ RICH TEXT EDITOR HELPERS ═══
let _rteTargetId = null;
let _tblRows = 0, _tblCols = 0;
let _rteSavedRange = null; // мобильде selection сақтау үшін

// Cursor позициясын сақтау (мобильде батырма басқанда selection жоғалмасын деп onmousedown preventDefault)
function rteSaveRange(edId){
  const ed = document.getElementById(edId);
  if(!ed) return;
  const sel = window.getSelection();
  if(sel && sel.rangeCount > 0){
    const r = sel.getRangeAt(0);
    if(ed.contains(r.commonAncestorContainer)){
      _rteSavedRange = r.cloneRange();
    }
  }
}

function rteRestoreRange(edId){
  const ed = document.getElementById(edId);
  if(!ed) return false;
  ed.focus();
  if(_rteSavedRange){
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_rteSavedRange);
    return true;
  }
  return false;
}

// Қою / курсив
function rteCmd(edId, cmd){
  rteRestoreRange(edId);
  document.execCommand(cmd, false, null);
  document.getElementById(edId)?.focus();
}

// Тақырып мәтіні ішіне сурет қосу (file upload, base64)
function topicImgInsert(edId){
  _rteTargetId = edId;
  rteSaveRange(edId);
  document.getElementById('topicImgInput').value = '';
  document.getElementById('topicImgInput').dataset.targetId = edId;
  document.getElementById('topicImgInput').click();
}
function topicImgLoad(evt){
  const file = evt.target.files[0];
  const edId = evt.target.dataset.targetId || _rteTargetId || 'mKk';
  if(!file) return;
  const ed = document.getElementById(edId);
  if(!ed) return;

  // Алдын ала placeholder кірістіру
  rteRestoreRange(edId);
  const placeholder = document.createElement('div');
  placeholder.className = 'rte-img-uploading';
  placeholder.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin-slow 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Жүктелуде...`;
  const sel = window.getSelection();
  if(sel && sel.rangeCount > 0){
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(placeholder);
  } else {
    ed.appendChild(placeholder);
  }

  uploadToCourseStorage(file).then(result => {
    const img = document.createElement('img');
    img.src = result.url;
    img.style.cssText = 'max-width:100%;border-radius:8px;margin:6px 0;display:block';
    img.alt = 'сурет';
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    placeholder.replaceWith(img);
    img.insertAdjacentElement('afterend', p);
    ed.focus();
  }).catch(err => {
    placeholder.remove();
    alert('Сурет жүктелмеді: ' + err.message);
  });
}

// Суретті редактор ішіне кірістіру
function rteInsertImage(edId){
  _rteTargetId = edId;
  rteSaveRange(edId);
  document.getElementById('rteImgInput').value = '';
  document.getElementById('rteImgInput').click();
}

function rteLoadImage(evt){
  const file = evt.target.files[0];
  if(!file || !_rteTargetId) return;
  const ed = document.getElementById(_rteTargetId);
  if(!ed) return;

  // Алдын ала placeholder кірістіру
  rteRestoreRange(_rteTargetId);
  const placeholder = document.createElement('div');
  placeholder.className = 'rte-img-uploading';
  placeholder.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin-slow 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Жүктелуде...`;
  const sel = window.getSelection();
  if(sel && sel.rangeCount > 0){
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(placeholder);
  } else {
    ed.appendChild(placeholder);
  }

  uploadToCourseStorage(file).then(result => {
    const img = document.createElement('img');
    img.src = result.url;
    img.style.cssText = 'max-width:100%;border-radius:8px;margin:6px 0;display:block';
    img.alt = 'сурет';
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    placeholder.replaceWith(img);
    img.insertAdjacentElement('afterend', p);
    ed.focus();
  }).catch(err => {
    placeholder.remove();
    alert('Сурет жүктелмеді: ' + err.message);
  });
}

// Кесте picker
function rteOpenTablePicker(edId){
  _rteTargetId = edId;
  rteSaveRange(edId);
  _tblRows = 0; _tblCols = 0;
  const grid = document.getElementById('tblGrid');
  grid.innerHTML = '';
  for(let r=1; r<=5; r++){
    for(let c=1; c<=5; c++){
      const cell = document.createElement('div');
      cell.className = 'tbl-cell';
      cell.dataset.r = r; cell.dataset.c = c;
      cell.onmouseenter = () => hoverTblCell(r,c);
      cell.onclick = () => confirmTblSelect(r,c);
      grid.appendChild(cell);
    }
  }
  document.getElementById('tblSizeLabel').textContent = '— × —';
  document.getElementById('tblOkBtn').disabled = true;
  document.getElementById('tblPickerOverlay').classList.add('show');
}

function hoverTblCell(r, c){
  document.querySelectorAll('.tbl-cell').forEach(el=>{
    const er = parseInt(el.dataset.r), ec = parseInt(el.dataset.c);
    el.classList.toggle('hov', er<=r && ec<=c);
  });
  document.getElementById('tblSizeLabel').textContent = `${r} жол × ${c} баған`;
}

function confirmTblSelect(r, c){
  _tblRows = r; _tblCols = c;
  document.getElementById('tblSizeLabel').textContent = `${r} жол × ${c} баған`;
  document.getElementById('tblOkBtn').disabled = false;
}

function closeTblPicker(){
  document.getElementById('tblPickerOverlay').classList.remove('show');
}

function rteInsertTable(){
  if(!_rteTargetId || !_tblRows || !_tblCols){ closeTblPicker(); return; }
  const ed = document.getElementById(_rteTargetId);
  if(!ed){ closeTblPicker(); return; }

  closeTblPicker();
  rteRestoreRange(_rteTargetId);

  // Кесте DOM элементін жасаймыз
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden';
  // Header жол
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  for(let c=0; c<_tblCols; c++){
    const th = document.createElement('th');
    th.style.cssText = 'background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left';
    th.contentEditable = 'true';
    th.textContent = `Баған ${c+1}`;
    hrow.appendChild(th);
  }
  thead.appendChild(hrow);
  table.appendChild(thead);
  // Деректер жолдар
  const tbody = document.createElement('tbody');
  for(let r=0; r<_tblRows-1; r++){
    const row = document.createElement('tr');
    for(let c=0; c<_tblCols; c++){
      const td = document.createElement('td');
      td.style.cssText = 'padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px';
      td.contentEditable = 'true';
      td.innerHTML = '<br>';
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  // Кестеден кейін бос параграф
  const p = document.createElement('p');
  p.innerHTML = '<br>';

  const sel = window.getSelection();
  if(sel && sel.rangeCount > 0){
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = document.createDocumentFragment();
    frag.appendChild(table);
    frag.appendChild(p);
    range.insertNode(frag);
    range.setStartAfter(p);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    ed.appendChild(table);
    ed.appendChild(p);
  }
  ed.focus();
}

// innerHTML-ді алу (сақтауға)
function rteGetHtml(edId){
  const ed = document.getElementById(edId);
  return ed ? sanitizeHTML(ed.innerHTML) : '';
}

// HTML-ді editor-ға жүктеу
function rteSetHtml(edId, html){
  const ed = document.getElementById(edId);
  if(ed) ed.innerHTML = sanitizeHTML(html);
}

function togglePlan(header){
  const body = header.nextElementSibling;
  const btn = header.querySelector('.plan-toggle');
  body.classList.toggle('open');
  btn.classList.toggle('open');
}

// ═══ SVG MAP ═══
function buildMapSVG(t, topicIdx){
  const dots = t.mapDots || [];
  const W = 360, H = 200;
  const bgs = {1:'#0d1b3e',2:'#1a2744',3:'#0f1d35',4:'#1e3a2f',5:'#1b2d3a',6:'#15233b',7:'#122034',8:'#1a2940',9:'#1b2e20',10:'#0e1e38'};
  const bg = bgs[t.id] || '#1a2744';

  const patterns = {
    1:`<ellipse cx="40" cy="100" rx="28" ry="28" fill="#FDB813" opacity=".9"/>
       <ellipse cx="108" cy="100" rx="5" ry="5" fill="#b5b5b5" opacity=".8"/>
       <ellipse cx="150" cy="100" rx="8" ry="8" fill="#e8cda0" opacity=".8"/>
       <ellipse cx="198" cy="100" rx="10" ry="10" fill="#4f8ce8" opacity=".9"/>
       <ellipse cx="248" cy="100" rx="7" ry="7" fill="#c1440e" opacity=".8"/>
       <ellipse cx="298" cy="100" rx="13" ry="13" fill="#e8ac5e" opacity=".8"/>
       <line x1="40" y1="100" x2="320" y2="100" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`,
    4:`<path d="M20,65 Q60,45 100,58 Q130,48 162,62 Q192,52 232,62 Q262,48 302,58 Q332,52 345,66 L345,148 Q302,162 262,152 Q222,162 182,152 Q142,162 102,152 Q62,162 22,148 Z" fill="#2d8a4e" opacity=".65"/>
       <rect x="20" y="148" width="325" height="38" fill="#1a6b9a" opacity=".5"/>`,
    7:`<rect x="0" y="0" width="360" height="200" fill="#1a5c8a" opacity=".35"/>
       <path d="M20,80 Q80,60 140,74 Q200,60 260,80 Q310,65 345,80 L345,130 Q310,120 260,130 Q200,120 140,130 Q80,120 20,130Z" fill="#2d8a4e" opacity=".55"/>`,
    default:`<path d="M0,${H/2} Q${W/4},${H/4} ${W/2},${H/2} Q${3*W/4},${3*H/4} ${W},${H/2}" stroke="rgba(255,255,255,.12)" stroke-width="1.5" fill="none"/>
             <circle cx="${W/2}" cy="${H/2}" r="${H/3}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="1"/>
             <circle cx="${W/2}" cy="${H/2}" r="${H/6}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`
  };
  const pattern = patterns[t.id] || patterns.default;

  let dotsSVG = '';
  dots.forEach((d,i)=>{
    const cx = (d.x/100)*W;
    const cy = (d.y/100)*H;
    dotsSVG += `<g id="sdot${i}" onclick="tapDot(${topicIdx},${i})" style="cursor:pointer">
      <circle cx="${cx}" cy="${cy}" r="13" fill="#4f46e5" stroke="white" stroke-width="2.5" opacity=".95"/>
      <text x="${cx}" y="${cy+5}" text-anchor="middle" fill="white" font-size="11" font-weight="800" font-family="Manrope">${i+1}</text>
    </g>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;border-radius:12px">
    <rect width="${W}" height="${H}" fill="${bg}"/>
    ${pattern}
    <line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="rgba(255,255,255,.05)" stroke-width="1"/>
    <line x1="${W/2}" y1="0" x2="${W/2}" y2="${H}" stroke="rgba(255,255,255,.05)" stroke-width="1"/>
    ${dotsSVG}
  </svg>`;
}

function updateSVGDot(dotIdx, state){
  const g = document.getElementById('sdot'+dotIdx); if(!g) return;
  const circle = g.querySelector('circle'); if(!circle) return;
  if(state==='ok') circle.setAttribute('fill','#059669');
  else if(state==='ko') circle.setAttribute('fill','#dc2626');
  else circle.setAttribute('fill','#4f46e5');
}

// ═══ LANG ═══
function previewTopicImg(){
  const url = document.getElementById('mImgUrl').value.trim();
  const wrap = document.getElementById('imgPreviewWrap');
  const img = document.getElementById('imgPreview');
  const safe = safeImageUrl(url);
  if(safe){ wrap.style.display='block'; img.src=safe; }
  else { wrap.style.display='none'; img.src=''; }
}
function clearTopicImg(){
  document.getElementById('mImgUrl').value='';
  document.getElementById('imgPreviewWrap').style.display='none';
  document.getElementById('imgPreview').src='';
}

function toggleLang(){}
