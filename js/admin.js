// ═══ ADMIN ═══
let editIdx=null;

async function renderAdminAsync(){
  if(!requireAdmin()) return;
  const panel = document.getElementById('tabAdmin');
  showOnly('tabAdmin');
  document.getElementById('hTitle').textContent = ST.lang==='kk'?'Админ панелі':'Панель Админа';
  panel.innerHTML = `<div class="adm-wrap"><div class="adm-sec" style="text-align:center;padding:28px 16px">
    <div class="load-bar-wrap" style="margin:0 auto 14px"><div class="load-bar"></div></div>
    <div style="font-size:12px;color:var(--muted)">Админ панелі жүктелуде...</div>
  </div></div>`;

  const T = await getTopics();
  const {lang} = ST;

  let rows='';
  T.forEach((t,i)=>{
    rows+=`<div class="adm-row">
      <div class="adm-num">${escapeHTML(t.id)}</div>
      <div class="adm-nm">${escapeHTML(t.kk)}<small>${t.qkk ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Тест бар' : '—'}</small></div>
      <button class="abtn aedit" onclick="openEdit(${i})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Өңдеу
      </button>
      <button class="abtn adel" onclick="delTopicAsync(${i})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Жою
      </button>
    </div>`;
  });

  const [allUsers, allProg, pendingOpens] = await Promise.all([
    fbGetAllUsers(),
    fbGetAllProgress(),
    fbGetPendingOpenSubmissions()
  ]);
  const students = allUsers.filter(u=>u.uid !== ST.currentUser.uid);
  const totalPossible = T.length;

  let studH='';
  students.sort((a,b)=>{
    const ap = calcPts(a.uid, T, allProg[a.uid]||{});
    const bp = calcPts(b.uid, T, allProg[b.uid]||{});
    return bp - ap;
  }).forEach(u=>{
    const uprog = allProg[u.uid]||{};
    const pts = calcPts(u.uid, T, uprog);
    const done = T.filter(t=>uprog[pk(u.uid,t.id,'test')]||uprog[pk(u.uid,t.id,'open')]||uprog[pk(u.uid,t.id,'map')]||uprog[pk(u.uid,t.id,'attempt')]).length;
    const pct = totalPossible > 0 ? Math.round((done/totalPossible)*100) : 0;
    const ini = (u.login||u.email||'?').slice(0,2).toUpperCase();
    studH+=`<div class="student-card">
      <div class="student-avatar">${escapeHTML(ini)}</div>
      <div class="student-info">
        <div class="student-name">${escapeHTML(u.login||u.email)}</div>
        <div class="student-cls">${escapeHTML(u.cls||'—')} · ${done}/${totalPossible} тақырып</div>
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="student-score">
        <div class="student-pts">${pts}</div>
        <div class="student-done">балл</div>
      </div>
    </div>`;
  });
  if(!students.length) studH=`<p style="font-size:12px;color:var(--muted);padding:10px 0;text-align:center">${lang==='kk'?'Оқушылар тіркелмеген':'Ученики не зарегистрированы'}</p>`;

  const totalPts = students.reduce((s,u)=>{
    const uprog=allProg[u.uid]||{};
    return s + calcPts(u.uid, T, uprog);
  },0);

  const userById = allUsers.reduce((result, user) => {
    if (user?.uid) result[user.uid] = user;
    return result;
  }, {});
  const topicById = T.reduce((result, topic) => {
    if (topic?.id !== undefined && topic?.id !== null) result[String(topic.id)] = topic;
    return result;
  }, {});
  const pendingHtml = pendingOpens.length ? pendingOpens.map((item) => {
    const student = userById[item.user_id] || {};
    const topic = topicById[String(item.topic_id)] || {};
    return `<div class="student-card" style="align-items:flex-start">
      <div class="student-avatar">${escapeHTML((student.login || student.email || '?').slice(0,2).toUpperCase())}</div>
      <div class="student-info">
        <div class="student-name">${escapeHTML(student.login || student.email || item.user_id)}</div>
        <div class="student-cls">§${escapeHTML(item.topic_id)} · ${escapeHTML(topic.kk || '')} · ${Number(item.question_index) + 1}</div>
        <div style="font-size:12px;line-height:1.55;color:var(--text);margin:8px 0">${escapeHTML(item.answer)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${[0,1,2,3].map((points) => `<button class="fb-chip" onclick="gradeOpenSubmission('${item.user_id}','${escapeHTML(item.topic_id)}',${Number(item.question_index)},${points})">${points} балл</button>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('') : `<p style="font-size:12px;color:var(--muted);padding:10px 0;text-align:center">${lang==='kk'?'Тексерілмеген жауап жоқ':'Нет ответов на проверку'}</p>`;

  panel.innerHTML=`<div class="adm-wrap">
    <div class="adm-header">
      <div class="adm-header-title"><svg width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Админ панелі</div>
      <div class="adm-header-sub">${T.length} тақырып · ${students.length} оқушы</div>
    </div>

    <div class="adm-stats">
      <div class="adm-stat"><div class="adm-stat-n">${T.length}</div><div class="adm-stat-l">Тақырып</div></div>
      <div class="adm-stat"><div class="adm-stat-n">${students.length}</div><div class="adm-stat-l">Оқушы</div></div>
      <div class="adm-stat"><div class="adm-stat-n">${totalPts}</div><div class="adm-stat-l">Жалпы балл</div></div>
    </div>

    <div class="adm-sec">
      <div class="adm-sec-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 1.5L18.5 8H15a2 2 0 0 1-2-2V3.5z"/></svg>
        Тақырыптар
      </div>
      ${rows}
      <button class="adm-add" onclick="openEdit(-1)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5v14M5 12h14"/></svg>
        ${lang==='kk'?'Жаңа тақырып қосу':'Добавить тему'}
      </button>
    </div>

    <div class="adm-sec" style="border-top:1px solid rgba(201,168,76,.1);padding-top:14px;margin-top:4px">
      <div class="adm-sec-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        Бағдарлама беті
      </div>
      <p style="font-size:12px;color:var(--muted);margin:4px 0 12px;line-height:1.5">«Бағдарлама» батырмасы арқылы көрінетін страницаның мазмұнын, суреттерін және жоспар кестесін өңдеңіз.</p>
      <button class="adm-add" onclick="openProgEditor()" style="background:rgba(201,168,76,.1);border-color:rgba(201,168,76,.25);color:var(--gold2)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Бағдарламаны өңдеу
      </button>
    </div>

    <div class="adm-sec" style="border-top:1px solid rgba(201,168,76,.1);padding-top:14px;margin-top:4px">
      <div class="adm-sec-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        ${lang==='kk'?'Ашық жауаптарды тексеру':'Проверка открытых ответов'}
      </div>
      ${pendingHtml}
    </div>

    <div class="adm-sec" style="border-top:1px solid rgba(201,168,76,.1);padding-top:14px;margin-top:4px">
      <div class="adm-sec-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Оқушылардың пікірлері мен ұсыныстары
      </div>
      <div class="fb-list" id="adminFeedbackList">
        <div class="fb-empty">Жүктелуде...</div>
      </div>
    </div>

    <div class="adm-sec" style="border-top:1px solid rgba(201,168,76,.1);padding-top:14px;margin-top:4px">
      <div class="adm-sec-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Supabase Storage — сурет қоймасы
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin:4px 0 10px;line-height:1.6">
        Суреттер <b style="color:var(--text)">course-images</b> bucket-іне жүктеледі.
        Жүктеу тек әкімшіге рұқсат етілген, ал файл өлшемі мен MIME түрі серверде тексеріледі.
      </p>
      <div class="cld-cfg-box" id="cldCfgBox">
        <div class="cld-status ok">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Supabase Storage қосулы
        </div>
      </div>
    </div>

    <div class="adm-sec">
      <div class="adm-sec-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm12 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Оқушылар рейтингі
      </div>
      ${studH}
    </div>
  </div>`;
  document.getElementById('hTitle').textContent = lang==='kk'?'Админ панелі':'Панель Админа';
  showOnly('tabAdmin');
  // Пікірлерді жүктеу
  setTimeout(loadAdminFeedback, 100);
}

async function delTopicAsync(i){
  if(!requireAdmin()) return;
  if(!confirm(ST.lang==='kk'?'Тақырыпты өшіресіз бе?':'Удалить тему?')) return;
  const T = await getTopics();
  T.splice(i,1);
  await saveTopics(T);
  renderAdminAsync();
}

async function openEdit(i){
  if(!requireAdmin()) return;
  editIdx=i;
  const T = await getTopics();
  document.getElementById('modalTitle').textContent = i===-1?(ST.lang==='kk'?'Жаңа тақырып қосу':'Добавить тему'):(ST.lang==='kk'?'Тақырыпты өңдеу':'Редактировать');

  // Reset all panels
  ['test','open','map'].forEach(s=>closeSectionPanel(s));
  // Reset multi-blocks
  window._testBlocks = [];
  window._openBlocks = [];
  renderTestBlocks();
  renderOpenBlocks();
  // Reset map editor
  window._mapDots = [];
  window._mapImgData = '';
  document.getElementById('mapEditorImg').style.display='none';
  document.getElementById('mapEditorEmpty').style.display='flex';
  renderMapDots();

  if(i>=0){
    const t=T[i];
    document.getElementById('mTId').value=t.id||'';
    document.getElementById('mTKk').value=t.kk||'';
    document.getElementById('mTRu').value=t.ru||'';
    document.getElementById('mImgUrl').value=t.imgUrl||'';
    previewTopicImg();
    rteSetHtml('mKk', t.tkk||'');
    rteSetHtml('mRu', t.tru||'');

    // Load test blocks: first from legacy field, then from tests[]
    const legacyTest = t.qkk ? [{q:t.qkk, opts: t.opts && t.opts.length ? t.opts : [t.opts?.[0]||'', t.opts?.[1]||'', t.opts?.[2]||'', t.opts?.[3]||''], a:t.opts?.[0]||'', b:t.opts?.[1]||'', c:t.opts?.[2]||'', d:t.opts?.[3]||'', ans:t.ans||'A'}] : [];
    const extraTests = (t.tests||[]).map(tb => ({
      ...tb,
      opts: tb.opts && tb.opts.length ? tb.opts : [tb.a||'', tb.b||'', tb.c||'', tb.d||'']
    }));
    window._testBlocks = [...legacyTest, ...extraTests];
    renderTestBlocks();
    if(window._testBlocks.length>0) openSectionPanel('test');

    // Load open blocks: first from legacy, then from opens[]
    const legacyOpen = t.openq ? [{q:t.openq}] : [];
    const extraOpens = t.opens || [];
    window._openBlocks = [...legacyOpen, ...extraOpens];
    renderOpenBlocks();
    if(window._openBlocks.length>0) openSectionPanel('open');

    document.getElementById('mMapQ').value=t.mapq||'';
    if(t.mapq || t.mapImg || (t.mapDots&&t.mapDots.length)){
      openSectionPanel('map');
      window._mapDots = (t.mapDots||[]).map(d=>({...d}));
      window._mapImgData = t.mapImg||'';
      if(t.mapImg){
        const img=document.getElementById('mapEditorImg');
        img.src=t.mapImg; img.style.display='block';
        document.getElementById('mapEditorEmpty').style.display='none';
      }
      window._mapOpts = (t.mapOpts||[]).slice();
      renderMapDots();
    }
  } else {
    ['mTId','mTKk','mTRu','mMapQ','mImgUrl'].forEach(id=>{ const el=document.getElementById(id); if(el&&el.value!==undefined) el.value=''; });
    rteSetHtml('mKk',''); rteSetHtml('mRu','');
    document.getElementById('imgPreviewWrap').style.display='none';
    window._mapOpts=[];
  }
  // КЖ жүктеу (T жоғарыда алынған)
  const t_plan = i>=0 ? T[i]?.plan : null;
  kzhLoad(t_plan||null);
  document.getElementById('editModal').classList.add('show');
}

// Section toggle logic
function toggleSection(sec){
  const panel=document.getElementById('panel'+sec.charAt(0).toUpperCase()+sec.slice(1));
  if(panel.classList.contains('open')) closeSectionPanel(sec);
  else openSectionPanel(sec);
}
function openSectionPanel(sec){
  const panel=document.getElementById('panel'+sec.charAt(0).toUpperCase()+sec.slice(1));
  const btn=document.getElementById('btnSec'+sec.charAt(0).toUpperCase()+sec.slice(1));
  panel.classList.add('open');
  const cls = sec==='test'?'active': sec==='open'?'active-green':'active-amber';
  btn.className='msec-btn '+cls;
}
function closeSectionPanel(sec){
  const panel=document.getElementById('panel'+sec.charAt(0).toUpperCase()+sec.slice(1));
  const btn=document.getElementById('btnSec'+sec.charAt(0).toUpperCase()+sec.slice(1));
  panel.classList.remove('open');
  btn.className='msec-btn';
}

// ═══ MULTI-TASK BLOCK FUNCTIONS ═══
window._testBlocks = []; // [{q, a, b, c, d, ans}]
window._openBlocks = []; // [{q}]

const OPT_LETTERS = ['A','B','C','D','E','F','G','H'];

function renderTestBlocks(){
  const container = document.getElementById('testBlocksContainer');
  if(!container) return;
  container.innerHTML = window._testBlocks.map((tb, idx) => {
    // opts массивін қалыпқа келтіру (ескі a,b,c,d форматынан)
    if(!tb.opts || tb.opts.length === 0){
      tb.opts = [tb.a||'', tb.b||'', tb.c||'', tb.d||''];
    }
    const optsHtml = tb.opts.map((o, oi) => `
      <div class="ans-opt-row" id="optRow_${idx}_${oi}">
        <div class="ans-opt-letter">${OPT_LETTERS[oi]||oi+1}</div>
        <input class="adm-inp" placeholder="${OPT_LETTERS[oi]||oi+1}. жауабы..." value="${escH(o)}"
          oninput="window._testBlocks[${idx}].opts[${oi}]=this.value">
        ${tb.opts.length > 2 ? `<button class="opt-remove-btn" onclick="removeTestOpt(${idx},${oi})" title="Жою">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>` : ''}
      </div>`).join('');
    const currentAns = tb.ans || 'A';
    return `
    <div class="mtask-block" id="testBlock${idx}">
      <div class="mtask-block-header">
        <span class="mtask-block-label">Тест ${idx+1}</span>
        <button class="mtask-remove" onclick="removeTestBlock(${idx})" title="Жою"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <label class="inp-label">Сұрақ (ҚАЗ)</label>
      <input class="adm-inp" placeholder="Сұрақ мәтіні" value="${escH(tb.q)}" oninput="window._testBlocks[${idx}].q=this.value">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:10px 0 6px">
        <label class="inp-label" style="margin:0">Жауап нұсқалары</label>
        ${tb.opts.length < 8 ? `<button class="add-opt-btn" onclick="addTestOpt(${idx})">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Нұсқа қосу
        </button>` : ''}
      </div>
      <div class="ans-opts-container" id="optsContainer_${idx}">${optsHtml}</div>
      <label class="inp-label" style="margin-top:10px">Дұрыс жауап</label>
      <select class="answer-select adm-inp" style="width:100%;margin-bottom:0" onchange="window._testBlocks[${idx}].ans=this.value">
        ${tb.opts.map((_,oi)=>`<option value="${OPT_LETTERS[oi]||oi+1}"${currentAns===(OPT_LETTERS[oi]||String(oi+1))?' selected':''}>${OPT_LETTERS[oi]||oi+1}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
}

function addTestOpt(blockIdx){
  // DOM-нан соңғы мәндерді сақтау
  syncTestBlockFromDOM(blockIdx);
  window._testBlocks[blockIdx].opts.push('');
  renderTestBlocks();
}

function removeTestOpt(blockIdx, optIdx){
  syncTestBlockFromDOM(blockIdx);
  const tb = window._testBlocks[blockIdx];
  if(tb.opts.length <= 2) return;
  tb.opts.splice(optIdx, 1);
  // Дұрыс жауапты тексеру — жойылған нұсқадан кейінгі болса түзету
  const ansIdx = OPT_LETTERS.indexOf(tb.ans);
  if(ansIdx >= tb.opts.length) tb.ans = OPT_LETTERS[tb.opts.length - 1];
  renderTestBlocks();
}

function syncTestBlockFromDOM(blockIdx){
  const block = document.getElementById('testBlock'+blockIdx);
  if(!block) return;
  const tb = window._testBlocks[blockIdx];
  const qInp = block.querySelector('input.adm-inp');
  if(qInp) tb.q = qInp.value;
  const optInps = block.querySelectorAll('.ans-opt-row input.adm-inp');
  optInps.forEach((inp, oi) => { if(tb.opts[oi] !== undefined) tb.opts[oi] = inp.value; });
  const sel = block.querySelector('select');
  if(sel) tb.ans = sel.value;
}

function renderOpenBlocks(){
  const container = document.getElementById('openBlocksContainer');
  if(!container) return;
  container.innerHTML = window._openBlocks.map((ob, idx) => `
    <div class="mtask-block open-block" id="openBlock${idx}">
      <div class="mtask-block-header">
        <span class="mtask-block-label">Ашық сұрақ ${idx+1}</span>
        <button class="mtask-remove" onclick="removeOpenBlock(${idx})" title="Жою"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <textarea class="adm-ta" placeholder="Оқушы өз сөзімен жауап беретін сұрақ..." style="margin-bottom:0" oninput="window._openBlocks[${idx}].q=this.value">${escH(ob.q)}</textarea>
    </div>`).join('');
}

function addTestBlock(){
  window._testBlocks.push({q:'', opts:['','','',''], ans:'A'});
  renderTestBlocks();
  // Auto open panel
  openSectionPanel('test');
}
function removeTestBlock(idx){
  window._testBlocks.splice(idx,1);
  renderTestBlocks();
  if(window._testBlocks.length===0) closeSectionPanel('test');
}
function addOpenBlock(){
  window._openBlocks.push({q:''});
  renderOpenBlocks();
  openSectionPanel('open');
}
function removeOpenBlock(idx){
  window._openBlocks.splice(idx,1);
  renderOpenBlocks();
  if(window._openBlocks.length===0) closeSectionPanel('open');
}
