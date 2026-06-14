// ══ FORCE ALPINE BACKGROUND via JS ══
(function forceBg(){
  var BG_URL = 'assets/earth-night-crop.jpg';
  function applyBg(id){
    var el = document.getElementById(id);
    if(!el) return;
    el.style.setProperty('background-image', "url('" + BG_URL + "')", 'important');
    el.style.setProperty('background-size', 'cover', 'important');
    el.style.setProperty('background-position', 'center 30%', 'important');
    el.style.setProperty('background-attachment', 'fixed', 'important');
  }

  // Дереу орнату
  applyBg('loadingScreen');

  // DOM дайын болғанда
  document.addEventListener('DOMContentLoaded', function(){
    applyBg('loadingScreen');
    applyBg('programScreen');
  });

  // programScreen ашылғанда
  var origEnter = window.enterProgram;
  document.addEventListener('click', function(e){
    setTimeout(function(){ applyBg('programScreen'); }, 50);
  });
})();

window.addEventListener('online',  () => document.getElementById('offlineBanner').classList.remove('show'));
window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));

// RTE editors-та cursor позициясын автоматты сақтаймыз
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0) return;
  const r = sel.getRangeAt(0);
  const edIds = ['mKk'];
  for(const id of edIds){
    const ed = document.getElementById(id);
    if(ed && ed.contains(r.commonAncestorContainer)){
      _rteSavedRange = r.cloneRange();
      break;
    }
  }
});

// ═══ SUPABASE HELPERS ═══
async function fbGetProg(uid) {
  try {
    if (!window._supabase) return {};
    const {data, error} = await window._supabase
      .from('progress')
      .select('topic_id,task_type,score')
      .eq('user_id', uid);
    if (error) throw error;
    return Object.fromEntries((data || []).map((row) => [
      pk(uid, row.topic_id, row.task_type),
      row.score
    ]));
  } catch { return {}; }
}
async function fbSaveProg(uid, prog) {
  console.warn('Direct progress writes are disabled. Use the secure attempt service.');
}
function isCurrentAdmin() {
  return window._fbUser?.isAdmin === true && ST.currentUser?.isAdmin === true;
}
function requireAdmin() {
  if (isCurrentAdmin()) return true;
  alert(ST.lang === 'kk' ? 'Бұл бөлім тек әкімшіге қолжетімді.' : 'Этот раздел доступен только администратору.');
  return false;
}
async function callSecureFunction(name, payload = {}) {
  if (!window._supabase) throw new Error('Қауіпсіз тапсырма қызметі жүктелмеді');
  const calls = {
    startTaskAttempt: ['start_task_attempt', {p_topic_id: String(payload.topicId)}],
    submitTaskAttempt: ['submit_task_attempt', {
      p_topic_id: String(payload.topicId),
      p_tests: payload.tests || {},
      p_opens: payload.opens || {},
      p_map: payload.map || []
    }],
    invalidateTaskAttempt: ['invalidate_task_attempt', {
      p_topic_id: String(payload.topicId),
      p_reason: payload.reason || 'interrupted'
    }],
    gradeOpenAnswer: ['grade_open_answer', {
      p_user_id: payload.uid,
      p_topic_id: String(payload.topicId),
      p_index: Number(payload.index),
      p_points: Number(payload.points)
    }]
  };
  if (name === 'getAdminAnswerKeys') {
    const {data, error} = await window._supabase
      .from('answer_keys')
      .select('topic_id,tests,map_answers,open_count');
    if (error) throw error;
    return Object.fromEntries((data || []).map((row) => [
      row.topic_id,
      {tests: row.tests || [], map: row.map_answers || [], openCount: row.open_count || 0}
    ]));
  }
  const call = calls[name];
  if (!call) throw new Error(`Unknown secure function: ${name}`);
  const {data, error} = await window._supabase.rpc(call[0], call[1]);
  if (error) throw error;
  return data;
}
function publicTopic(topic) {
  const clean = cloneProgress(topic);
  delete clean.ans;
  clean.tests = (clean.tests || []).map((test) => {
    const item = {...test};
    delete item.ans;
    return item;
  });
  clean.mapDots = (clean.mapDots || []).map((dot) => {
    const item = {...dot};
    delete item.correct;
    return item;
  });
  return clean;
}
function topicAnswerKey(topic) {
  const tests = [];
  if (topic.qkk) tests.push(topic.ans || 'A');
  (topic.tests || []).forEach((test) => {
    if (test.q) tests.push(test.ans || 'A');
  });
  return {
    tests,
    map: (topic.mapDots || []).map((dot, index) => dot.correct || topic.mapOpts?.[index] || ''),
    openCount: (topic.openq ? 1 : 0) + (topic.opens || []).filter((item) => item?.q).length
  };
}
function mergeTopicKeys(topic, key) {
  if (!key) return topic;
  const merged = cloneProgress(topic);
  let testIndex = 0;
  if (merged.qkk) merged.ans = key.tests?.[testIndex++] || 'A';
  merged.tests = (merged.tests || []).map((test) => ({...test, ans: key.tests?.[testIndex++] || 'A'}));
  merged.mapDots = (merged.mapDots || []).map((dot, index) => ({...dot, correct: key.map?.[index] || ''}));
  return merged;
}
async function fbGetTopics() {
  try {
    if (!window._supabase) return null;
    const {data, error} = await window._supabase
      .from('topics')
      .select('id,position,content')
      .order('position');
    if (error) throw error;
    if (!data?.length) return null;
    const topics = data.map((row) => ({...row.content, id: row.content?.id ?? row.id}));
    if (!window._fbUser?.isAdmin) return topics;
    try {
      const keys = await callSecureFunction('getAdminAnswerKeys');
      return topics.map((topic) => mergeTopicKeys(topic, keys?.[topic.id]));
    } catch (error) {
      console.warn('Answer keys are unavailable:', error);
      return topics;
    }
  } catch { return null; }
}
async function fbSaveTopics(topics) {
  try {
    if (!window._supabase || !requireAdmin()) return;
    const topicRows = topics.map((topic, position) => ({
      id: String(topic.id),
      position,
      content: publicTopic(topic),
      updated_at: new Date().toISOString()
    }));
    const keyRows = topics.map((topic) => {
      const key = topicAnswerKey(topic);
      return {
        topic_id: String(topic.id),
        tests: key.tests,
        map_answers: key.map,
        open_count: key.openCount,
        updated_at: new Date().toISOString()
      };
    });
    const {error: topicError} = await window._supabase.from('topics').upsert(topicRows);
    if (topicError) throw topicError;
    const {error: keyError} = await window._supabase.from('answer_keys').upsert(keyRows);
    if (keyError) throw keyError;
    const activeIds = new Set(topicRows.map((row) => row.id));
    const {data: storedTopics, error: listError} = await window._supabase.from('topics').select('id');
    if (listError) throw listError;
    const staleIds = (storedTopics || []).map((row) => row.id).filter((id) => !activeIds.has(id));
    if (staleIds.length) {
      const {error: deleteError} = await window._supabase.from('topics').delete().in('id', staleIds);
      if (deleteError) throw deleteError;
      const {error: keyDeleteError} = await window._supabase.from('answer_keys').delete().in('topic_id', staleIds);
      if (keyDeleteError) throw keyDeleteError;
    }
  } catch(e) { console.warn('Topics save error:', e); }
}
async function fbGetAllUsers() {
  try {
    if (!window._supabase) return [];
    const {data, error} = await window._supabase
      .from('profiles')
      .select('id,email,login,class_name,role,enrolled');
    if (error) throw error;
    return (data || []).map((row) => ({
      uid: row.id,
      email: row.email,
      login: row.login,
      cls: row.class_name,
      isAdmin: row.role === 'admin',
      enrolled: row.enrolled
    }));
  } catch { return []; }
}
async function fbGetAllProgress() {
  try {
    if (!window._supabase) return {};
    const {data, error} = await window._supabase
      .from('progress')
      .select('user_id,topic_id,task_type,score');
    if (error) throw error;
    return (data || []).reduce((all, row) => {
      all[row.user_id] ||= {};
      all[row.user_id][pk(row.user_id, row.topic_id, row.task_type)] = row.score;
      return all;
    }, {});
  } catch { return {}; }
}

async function fbGetPendingOpenSubmissions() {
  try {
    if (!window._supabase || !isCurrentAdmin()) return [];
    const {data, error} = await window._supabase
      .from('open_submissions')
      .select('user_id,topic_id,question_index,answer,status,submitted_at')
      .eq('status', 'pending')
      .order('submitted_at', {ascending: true});
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.warn('Open submissions load:', error);
    return [];
  }
}

async function gradeOpenSubmission(uid, topicId, index, points) {
  if (!requireAdmin()) return;
  try {
    await callSecureFunction('gradeOpenAnswer', {uid, topicId, index, points});
    _prog = {};
    await renderAdminAsync();
  } catch (error) {
    console.error('Open answer grading:', error);
    alert(ST.lang === 'kk' ? 'Баға сақталмады.' : 'Оценка не сохранена.');
  }
}

// ═══ БАҒДАРЛАМА ДЕРЕКТЕРІ ═══
async function fbGetProgramData() {
  try {
    if (!window._supabase) return null;
    const {data, error} = await window._supabase
      .from('program_data')
      .select('content')
      .eq('id', true)
      .maybeSingle();
    if (error) throw error;
    return data?.content || null;
  } catch { return null; }
}
async function fbSaveProgramData(data) {
  try {
    if (!window._supabase || !requireAdmin()) return;
    const {error} = await window._supabase.from('program_data').upsert({
      id: true,
      content: data,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  } catch(e) { console.warn('ProgramData save error:', e); }
}

let _programData = null;
async function getProgramData() {
  if (_programData) return _programData;
  const fb = await fbGetProgramData();
  if (fb) { _programData = fb; return _programData; }
  // Әдепкі мәндер — HTML-дегі статикалық мазмұн
  _programData = {
    orgBadge: 'Қазақстан Республикасы Оқу-ағарту министрлігі · Түркістан облысы · №4 мектеп-интернаты КММ',
    eyebrow: 'Авторлық бағдарлама · 2026',
    titleLine1: 'Геосаясат:',
    titleLine2: 'Жаһандық тұрақтылық',
    titleLine3: 'және Қазақстан',
    subtitle: 'Элективті курс · 10-сынып',
    statSections: '5', statHours: '34', statGrade: '10', statWeekly: '1',
    authorInitials1: 'ТЕ', authorInitials2: 'АА',
    authorName: 'Есенов Т.Қ. · Аимбаева А.С.',
    authorRole: 'педагог-шебер · педагог-зерттеуші',
    explanatoryNote: '«Геосаясат: Жаһандық тұрақтылық және Қазақстан» элективті курсы 10-сыныптың география және құқық негіздері бағдарламасындағы «Дүниежүзінің саяси картасы» тарауымен тығыз байланысты. Курс оқушылардың жаһандық саяси процестерді талдау, Қазақстанның әлемдік аренадағы орнын айқындау және геосаяси тәуекелдерді бағалау дағдыларын қалыптастыруға бағытталған. Курстың ұзақтығы: 34 сағат, аптасына — 1 сағат. 5–6-шы сабақтардан кейін әр оқушы жыл соңында қорғайтын зерттеу жобасының тақырыбын таңдайды.',
    goals: [
      'Қазіргі дүниежүзінің геосаяси бейнесі, мемлекеттердің қуатын айқындайтын факторлар және жаһандық тұрақтылықты сақтау тетіктері туралы жүйелі білім беру.',
      'Қазақстанның Еуразия орталығындағы стратегиялық маңызын, транзиттік әлеуетін және энергетикалық дипломатиясын зерттеу арқылы аналитикалық ойлауды дамыту.',
      'Халықаралық қақтығыстар мен шекаралық даулардың себеп-салдарын талдау арқылы оқушылардың саяси сауаттылығын және мемлекетшілдік позициясын қалыптастыру.'
    ],
    tasks: '• Геосаяси жағдайдың басты ерекшеліктері мен әлемдік даму факторларын түсіндіру;\n• Қазақстанның халықаралық интеграциялық бірлестіктердегі рөлін айқындау;\n• Әлемнің «ыстық нүктелері» мен аумақтық даулардың туындау алғышарттарын зерттеу;\n• Ресурстық (су, энергия) дипломатияның жаһандық қауіпсіздікке ықпалын талдау;\n• Оқушыларды геосаяси болжамдар мен жобалық жұмыстарды қорғауға дағдыландыру.',
    scheduleRows: [
      {num:'1',name:'Кіріспе. Геосаяси жағдай, басты ерекшеліктер',type:'Дәріс',final:false},
      {num:'2',name:'Әлем дамуына ықпал ететін геосаяси факторлар',type:'Семинар',final:false},
      {num:'3',name:'Әлем аймақтарының геосаяси кеңістіктегі рөлі',type:'Практикалық',final:false},
      {num:'4',name:'Діни және ұлттық қақтығыстардың саяси бейнеге ықпалы',type:'Пікірталас',final:false},
      {num:'5',name:'Геосаяси қуаттың демографиялық және экономикалық детерминанттары',type:'Зерттеу',final:false}
    ],
    headerImg: '',
    footer: '№4 мамандандырылған мектеп-интернаты КММ · Сарыағаш ауданы, Түркістан облысы'
  };
  return _programData;
}

const LS = {
  get(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},
  set(k,v){localStorage.setItem(k,JSON.stringify(v));}
};
function pk(uid, id, type){ return uid + '__' + id + '__' + type; }

let _prog = {};
let _topics = null;
window._taskGuard = {
  active: false,
  invalidating: false,
  dirty: false,
  idx: null,
  topicId: null,
  uid: null,
  snapshot: null,
  pendingReason: null,
  draft: {tests: {}, opens: {}, map: []},
  serverStarted: false
};

async function getProg() {
  if (!window._fbUser) return _prog;
  if (Object.keys(_prog).length === 0) {
    _prog = await fbGetProg(window._fbUser.uid);
  }
  return _prog;
}
async function saveProg(p) {
  _prog = p;
  // During a protected task, progress remains a local draft.
  // It is written to Supabase only after the student finishes the attempt.
  if (window._taskGuard?.active) {
    window._taskGuard.dirty = true;
    return;
  }
}
const TOPICS_VERSION = 'v10-supabase-26'; // Change this to force-reset stored topics

async function getTopics() {
  if (_topics) return _topics;
  const fbT = await fbGetTopics();
  // Check if stored topics match current version
  if (fbT && fbT.length > 0 && fbT[0]._version === TOPICS_VERSION) {
    _topics = fbT;
  } else {
    // Force update: new topics or version mismatch
    _topics = DEF_TOPICS.map(t => ({...t, _version: TOPICS_VERSION}));
    if (isCurrentAdmin()) {
      try {
        const keys = await callSecureFunction('getAdminAnswerKeys');
        _topics = _topics.map((topic) => mergeTopicKeys(topic, keys?.[topic.id]));
      } catch (error) {
        console.warn('Default answer keys are unavailable:', error);
        return _topics;
      }
      await fbSaveTopics(_topics);
    }
  }
  return _topics;
}
async function saveTopics(t) {
  _topics = t;
  await fbSaveTopics(t);
}
function calcPts(uid, T, prog) {
  return T.reduce((s,t) => {
    // Legacy fields
    s += Math.max(0, Number(prog[pk(uid,t.id,'test')])||0)
      + Math.max(0, Number(prog[pk(uid,t.id,'open')])||0)
      + Math.max(0, Number(prog[pk(uid,t.id,'map')])||0);
    // Extra tests
    (t.tests||[]).forEach((_,i)=>{ s += Math.max(0, Number(prog[pk(uid,t.id,'test_'+(i+1))])||0); });
    // Extra opens
    (t.opens||[]).forEach((_,i)=>{ s += Math.max(0, Number(prog[pk(uid,t.id,'open_'+(i+1))])||0); });
    return s;
  }, 0);
}

// ═══ DEFAULT TOPICS ═══
const DEF_TOPICS = [
  {id:1,
   plan:{goal:"«Геосаясат» ұғымын түсіндіру, қазіргі жаhандық геосаяси жағдайдың 4 басты ерекшелігін талдату.",steps:[{t:"Ұйымдастыру",min:"3-5 мин",d:"«Миға шабуыл»: Жасанды интеллект пен дрондар мемлекетке қалай пайда немесе зиян келтіреді?"}, {t:"Жаңа материалды меңгеру",min:"15-20 мин",d:"«Геосаясат» ұғымы. 4 ерекшелік: Көпполярлы әлем, жаhандану, ресурстар үшін күрес, ақпараттық майдан."}, {t:"Бекіту",min:"15 мин",d:"2 топтық тапсырма: 1) Қазақстанның геосаяси артықшылықтары; 2) Жас буын технологиясының мемлекетке әсері."}, {t:"Рефлексия",min:"3-5 мин",d:"«Бүгінгі сабақтан қандай жаңа дағды алдым?» сұрағы аясында оқушылардың ойын тыңдау."}]},
   kk:"Кіріспе. Геосаяси жағдай, басты ерекшеліктер",
   ru:"Введение. Геополитическая ситуация, основные особенности",
   tkk:"<p><strong>Геосаясат</strong> (грек: <em>geo</em> — жер, <em>politikos</em> — мемлекетті басқару өнері) — мемлекеттердің сыртқы саясатына географиялық, тарихи, демографиялық және экономикалық факторлардың тигізетін әсерін зерттейтін пән. Бұл ұғымды ғылыми айналымға алғаш рет швед ғалымы <strong>Рудольф Челлен</strong> енгізген.</p>\n\n<p><strong>1. Геосаясат ұғымына кіріспе</strong></p>\n<p>Геосаясаттың негізгі мақсаты — әлемдік кеңістіктегі күштердің орналасуын түсіну және мемлекеттердің ұлттық мүдделерін жаhандық аренада қалай қорғайтынын талдау.</p>\n\n<p><strong>2. Қазіргі ғаламдық геосаяси жағдайдың 4 басты ерекшелігі</strong></p>\n<p><strong>1. Көпполярлы әлемнің қалыптасуы:</strong> Бұрынғы екіполярлы (АҚШ пен КСРО) немесе одан кейінгі бірполярлы (АҚШ үстемдігі) жүйеден бірнеше қуатты күш орталықтары бар жүйеге өту жүріп жатыр — АҚШ, Қытай, ЕО, Ресей, Үндістан, Бразилия.</p>\n<p><strong>2. Жаhандану және аймақтану (Регионализация):</strong> Бір жағынан, әлем экономикалық, технологиялық және ақпараттық жағынан бірігіп жатса, екінші жағынан, аймақтық одақтар (ШЫҰ, ЕАЭО, АСЕАН) маңызы арта түсуде.</p>\n<p><strong>3. Ресурстар үшін бәсекелестік:</strong> Дәстүрлі энергетикалық ресурстармен (мұнай, газ) қатар, таза ауыз су, сирек кездесетін металдар (литий, кобальт) үшін күрес де геосаяси аренаға шығуда.</p>\n<p><strong>4. Ақпараттық және технологиялық геосаясат:</strong> Киберкеңістік, жасанды интеллект және ақпараттық қауіпсіздік жаңа геосаяси арена болды. Мемлекет қуаты енді тек әскермен емес, технологиялық әлеуетімен өлшенеді.</p>\n\n<p><strong>3. Геосаяси жағдайды анықтайтын негізгі факторлар</strong></p>\n<p><strong>1. Географиялық және кеңістіктік фактор:</strong> Жер аумағының көлемі, климаттық белдеулер, Дүниежүзілік мұхитқа шығу мүмкіндігі, стратегиялық бұғаздар мен жолдарға жақындығы.</p>\n<p><strong>2. Экономикалық фактор:</strong> ІЖӨ көлемі, өндірістің инновациялық даму деңгейі, қаржылық тәуелсіздік, халықаралық сауда мен инвестицияны тарту қабілеті.</p>\n<p><strong>3. Демографиялық фактор:</strong> Халық санының өсу динамикасы, халықтың білім деңгейі, адами капитал сапасы.</p>\n<p><strong>4. Әскери фактор:</strong> Қарулы күштердің қуаты, заманауи қорғаныс технологияларының (дрондар, кибер-әскер) болуы.</p>",
   tru:"<p><strong>Геополитика</strong> (от греч. <em>geo</em> — земля, <em>politikos</em> — искусство управления) — наука, изучающая влияние географических, исторических, демографических и экономических факторов на внешнюю политику государств. Термин введён в научный оборот шведским учёным <strong>Рудольфом Челленом</strong>.</p>\n\n<p><strong>1. Введение в понятие геополитики</strong></p>\n<p>Основная цель геополитики — понять расстановку сил в мировом пространстве и проанализировать, как государства защищают свои национальные интересы на глобальной арене.</p>\n\n<p><strong>2. 4 главные особенности современной геополитической ситуации</strong></p>\n<p><strong>1. Формирование многополярного мира:</strong> Переход от однополярной системы к системе с несколькими центрами силы — США, Китай, ЕС, Россия, Индия, Бразилия.</p>\n<p><strong>2. Глобализация и регионализация:</strong> С одной стороны — экономическое единение, с другой — рост значимости региональных союзов (ШОС, ЕАЭС, АСЕАН).</p>\n<p><strong>3. Борьба за ресурсы:</strong> Помимо нефти и газа, за редкие металлы (литий, кобальт) и пресную воду разворачивается геополитическое противостояние.</p>\n<p><strong>4. Информационно-технологическая геополитика:</strong> Киберпространство, ИИ и информационная безопасность стали новой ареной. Мощь государства теперь измеряется не только армией, но и технологическим потенциалом.</p>\n\n<p><strong>3. Основные факторы, определяющие геополитическое положение</strong></p>\n<p><strong>1. Географический:</strong> Площадь, климат, доступ к Мировому океану, близость к стратегическим проливам.</p>\n<p><strong>2. Экономический:</strong> ВВП, уровень инновационного развития, финансовая независимость.</p>\n<p><strong>3. Демографический:</strong> Динамика роста населения, уровень образования, качество человеческого капитала.</p>\n<p><strong>4. Военный:</strong> Мощь вооружённых сил, наличие современных технологий обороны (дроны, кибервойска).</p>",
   qkk:"«Геосаясат» ұғымын ғылыми айналымға алғаш рет кім енгізді?",
   opts:["A. Х.Маккиндер", "B. Рудольф Челлен", "C. Н.Спикмен", "D. К.Хаусхофер"],
   openq:"ХХІ ғасырдағы геосаяси жағдайдың 4 ерекшелігін өз сөзіңізбен түсіндіріңіз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:2,
   plan:{goal:"Мемлекеттің халықаралық аренадағы «салмағын» анықтайтын факторларды талдау.",steps:[{t:"Кіріспе",min:"5 мин",d:"Кейс-стади: «Мұхитқа шығу жолы жоқ, бірақ IT-хаб» мемлекетін талқылау."}, {t:"Теориялық блок",min:"15 мин",d:"4 фактор түрі: Географиялық, ресурстық, экономикалық-технологиялық, демографиялық. Мысалдармен талдау."}, {t:"Тәжірибелік жұмыс",min:"15 мин",d:"Сәйкестендіру кестесі: Панама каналы, литий, жасанды интеллект → геосаяси рөлі."}, {t:"Қорытынды",min:"5 мин",d:"«Жұмсақ күш» (Soft Power) ұғымын талқылау."}]},
   kk:"Әлем дамуына ықпал ететін геосаяси факторлар",
   ru:"Геополитические факторы, влияющие на развитие мира",
   tkk:"<p>Геосаясат — мемлекеттің сыртқы саясатын оның географиялық орналасуы, ресурстары және технологиялық деңгейі тұрғысынан зерттейтін ғылым. ХХІ ғасырда дәстүрлі геосаяси факторлар жаңа сипатқа ие болып, трансформацияланды.</p>\n\n<p><strong>1. Физикалық-географиялық факторлар («Тұрақты» мүмкіндіктер)</strong></p>\n<p>— <strong>Логистика:</strong> Мұхитқа шығу мүмкіндігі бар елдер (теңіз державалары) саудада басым болса, құрлық ішіндегі елдер жаңа транзиттік жолдар арқылы осы кемшілікті жоюға тырысады.</p>\n<p>— <strong>Стратегия:</strong> Үлкен аумақ қорғаныс үшін тиімді, бірақ инфрақұрылымды басқаруды күрделендіреді.</p>\n<p>— <strong>Тренд:</strong> Климаттың өзгеруіне байланысты Арктика секілді аймақтар жаңа геосаяси нүктелерге айналуда.</p>\n\n<p><strong>2. Табиғи-ресурстық факторлар</strong></p>\n<p>— <strong>Энергетика:</strong> Мұнай, газ және уран қорлары елдің халықаралық ықпалын арттырады.</p>\n<p>— <strong>Жаңа бәсеке:</strong> «Жасыл энергияға» көшу кезеңінде <strong>литий мен кобальт</strong> секілді сирек металдар үшін күрес күшеюде.</p>\n<p>— <strong>Болашақ ресурстары:</strong> Ауыз су мен құнарлы жерлер — болашақтың басты геосаяси қауіпсіздік нысандары.</p>\n\n<p><strong>3. Технологиялық және экономикалық факторлар</strong></p>\n<p>— <strong>Технологиялық егемендік:</strong> Қазіргі таңда «технологиялық егемендік» ұғымы бірінші орынға шықты.</p>\n<p>— <strong>Инновация:</strong> Жасанды интеллект (AI), микрочиптер өндірісі және ғарыштық технологиялар мемлекеттің әлемдік дамуына шешуші әсер етеді.</p>\n<p>— <strong>Қаржы:</strong> Халықаралық банк жүйелері мен валюталарды бақылау — саяси қысым құралы.</p>\n\n<p><strong>4. Демография және «Жұмсақ күш»</strong></p>\n<p>— <strong>Адам капиталы:</strong> Мемлекеттің басты ресурсы — халықтың білім деңгейі, креативтілігі мен еңбекке қабілеттілігі.</p>\n<p>— <strong>Soft Power:</strong> Мәдениет, білім және идеология арқылы әскери күшсіз-ақ басқа елдерге тартымды болу және ықпал ету мүмкіндігі.</p>\n\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Фактор түрі</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Мысал</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Әлем дамуына әсері</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Географиялық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Панама каналы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Әлемдік логистиканы жылдамдату</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Ресурстық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Литий кен орындары</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Электромобильдер нарығын бақылау</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Технологиялық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Жасанды интеллект</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Басқару жүйелерін автоматтандыру</td></tr></tbody></table>",
   tru:"<p>Геополитика изучает внешнюю политику государства через призму его географического положения, ресурсов и технологического уровня. В XXI веке традиционные геополитические факторы трансформировались.</p>\n\n<p><strong>1. Физико-географические факторы</strong></p>\n<p>— Выход к океану — торговое преимущество. Крупная территория — стратегический щит, но сложная инфраструктура. Арктика становится новой геополитической точкой.</p>\n\n<p><strong>2. Природно-ресурсные факторы</strong></p>\n<p>— Нефть, газ, уран усиливают международное влияние. При переходе к «зелёной энергии» растёт борьба за <strong>литий и кобальт</strong>. Пресная вода — главный ресурс будущего.</p>\n\n<p><strong>3. Технологические и экономические факторы</strong></p>\n<p>— «Технологический суверенитет» вышел на первый план. ИИ, микрочипы, космические технологии определяют развитие государства. Контроль над мировыми валютами — инструмент давления.</p>\n\n<p><strong>4. Демография и «Мягкая сила»</strong></p>\n<p>— Человеческий капитал: образование и креативность. Soft Power — влияние через культуру и образование без применения силы.</p>\n\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Фактор түрі</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Мысал</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Әлем дамуына әсері</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Географиялық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Панама каналы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Әлемдік логистиканы жылдамдату</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Ресурстық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Литий кен орындары</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Электромобильдер нарығын бақылау</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Технологиялық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Жасанды интеллект</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Басқару жүйелерін автоматтандыру</td></tr></tbody></table>",
   qkk:"«Жұмсақ күш» (Soft Power) ұғымы нені білдіреді?",
   opts:["A. Ядролық қаруды қолдану", "B. Экономикалық санкция", "C. Мәдениет, білім арқылы ықпал ету", "D. Теңіз флотының күші"],
   openq:"Технологиялық егемендік неліктен қазіргі геосаясатта бірінші орынға шықты? Мысал келтіріңіз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:3,
   plan:{goal:"Геосаяси модельдерді (Хартленд және Римленд) түсіндіру. Негізгі аймақтардың стратегиялық ерекшеліктерін талдау. Орталық Азия мен Қазақстанның «көпір» рөлін анықтау.",steps:[{t:"Қызығушылықты ояту",min:"5 мин",d:"Сұрақ: Мемлекеттің орналасқан жері оның байлығына немесе күшіне әсер ете ме?"}, {t:"Теориялық негіз",min:"10 мин",d:"Хартленд (Маккиндер) vs Римленд (Спикмен). Цифрлық геосаясат пен геоэкономика."}, {t:"Топтық жұмыс",min:"15 мин",d:"3 топ: Батыс, Шығыс, Орталық Азия — әр топ аймақтың рөлін таныстырады."}, {t:"Дискуссия",min:"10 мин",d:"XXI ғасырда әскери күш пе, инновация мен логистика маңыздырақ па?"}]},
   kk:"Әлем аймақтарының геосаяси кеңістіктегі рөлі",
   ru:"Роль регионов мира в геополитическом пространстве",
   tkk:"<p>Геосаясат — мемлекеттердің географиялық орналасуы мен олардың саяси ықпалы арасындағы өзара байланысты зерттейтін ғылым.</p>\n\n<p><strong>1. Классикалық және заманауи геосаяси модельдер</strong></p>\n<p>Әлемдік кеңістікті түсіну үшін екі негізгі теориялық тұғырды білу маңызды:</p>\n<p>— <strong>Континенталдық модель (Хартленд):</strong> Хэлфорд Маккиндердің теориясы бойынша, Еуразияның ішкі бөлігі («Әлем жүрегі») — геосаяси үстемдіктің кілті. «Хартлендті бақылайтын Шығыс Еуропаны, Шығыс Еуропаны бақылайтын Хартлендті, Хартлендті бақылайтын Дүниежүзілік Аралды бақылайды».</p>\n<p>— <strong>Теңіздік модель (Римленд):</strong> Николас Спикменнің пікірінше, негізгі саяси күш құрлықты қоршап жатқан жағалау аймақтарында (Римленд) шоғырланған.</p>\n<p>Қазіргі кезеңде бұл теорияларға <strong>«Цифрлық геосаясат»</strong> (киберкеңістікті бақылау) мен <strong>«Геоэкономика»</strong> (сауда жолдары мен инвестициялар арқылы ықпал ету) қосылды.</p>\n\n<p><strong>2. Негізгі аймақтардың стратегиялық сипаттамасы</strong></p>\n<p><strong>Солтүстік Америка: Жаhандық инновация орталығы</strong></p>\n<p>АҚШ пен Канада — «технологиялық және әскери доминант». Рөлі: Әлемдік қаржы жүйесін (доллар) және негізгі халықаралық ұйымдарды бақылау. Басымдығы: Жасанды интеллект, ғарыштық технологиялар және әскери теңіз флоты.</p>\n\n<p><strong>Еуропа: Құндылықтар мен нормалардың бастауы</strong></p>\n<p>Еуропа Одағы (ЕО) геосаясатта «жұмсақ күш» (Soft Power) үлгісін көрсетеді. Рөлі: Халықаралық заңнаманы, экологиялық стандарттарды (Green Deal) және демократиялық институттарды қалыптастыру. Мәселесі: Энергетикалық тәуелділік және ішкі саяси біртұтастықты сақтау.</p>\n\n<p><strong>Шығыс және Оңтүстік-Шығыс Азия: Жаңа күш орталығы</strong></p>\n<p>Бұл аймақ «Атлант дәуірінен» «Тынық мұхиты дәуіріне» өтудің басты себепкері. Қытай факторы: «Бір белдеу – бір жол» жобасы арқылы логистиканы қайта құру. Технологиялық бәсеке: Жартылай өткізгіштер (Тайвань, Оңтүстік Корея).</p>\n\n<p><strong>Таяу Шығыс: Энергетикалық және діни хаб</strong></p>\n<p>Геосаяси тұрақсыздығына қарамастан, әлемдік экономиканың «жанармай бекеті». Рөлі: Мұнай мен газ бағасына әсер ету, маңызды су жолдарын (Суэц каналы, Ормуз бұғазы) бақылау. Тренд: Ресурстық экономикадан туризм мен жоғары технологияға көшу.</p>\n\n<p><strong>3. Орталық Азия: Еуразияның стратегиялық «көпірі»</strong></p>\n<p>Орталық Азия аймағы, соның ішінде Қазақстан, қазіргі геосаясатта «көпір» рөлін атқарады:</p>\n<p>1) <strong>Транзиттік әлеует:</strong> Қытай мен Еуропаны жалғайтын ең қысқа құрлық жолдарының (Транскаспий бағыты) осы жерден өтуі.</p>\n<p>2) <strong>Көпвекторлы саясат:</strong> Ірі ойыншылар (Ресей, Қытай, АҚШ, ЕО) арасындағы теңгерімді сақтау қабілеті.</p>\n<p>3) <strong>Ресурстық маңыз:</strong> Уран, мұнай, газ және сирек кездесетін металдардың әлемдік нарықтағы үлесі.</p>\n\n<p><strong>4. Қазіргі геосаяси сын-қатерлер</strong></p>\n<p>— <strong>Климаттық геосаясат:</strong> Арктиканың мұзы еріген сайын Солтүстік теңіз жолы үшін күрестің күшеюі.</p>\n<p>— <strong>Азық-түлік қауіпсіздігі:</strong> Ауыл шаруашылығы өнімдерін экспорттаушы аймақтардың саяси ықпалының артуы.</p>\n<p>— <strong>Кибершекаралар:</strong> Мемлекеттердің өз цифрлық кеңістігін қорғауға және ақпараттық ықпал етуге тырысуы.</p>",
   tru:"<p>Геополитика изучает взаимосвязь между географическим положением государств и их политическим влиянием.</p>\n\n<p><strong>1. Классические и современные геополитические модели</strong></p>\n<p>— <strong>Континентальная модель (Хартленд):</strong> По теории Хэлфорда Маккиндера, внутренняя часть Евразии («Сердце мира») — ключ к мировому господству.</p>\n<p>— <strong>Морская модель (Римленд):</strong> По Николасу Спикмену, главная политическая сила сосредоточена в прибрежных районах, окружающих континент.</p>\n<p>Сегодня к этим теориям добавились <strong>«Цифровая геополитика»</strong> и <strong>«Геоэкономика»</strong>.</p>\n\n<p><strong>2. Стратегическая характеристика основных регионов</strong></p>\n<p><strong>Северная Америка:</strong> Технологический и военный доминант. Контроль над мировой финансовой системой (доллар), ИИ, космос, ВМФ.</p>\n<p><strong>Европа:</strong> Модель «мягкой силы». Формирование международного права, экологических стандартов. Проблема — энергетическая зависимость.</p>\n<p><strong>Восточная и Юго-Восточная Азия:</strong> Новый центр силы. Китайский фактор — «Один пояс – один путь». Технологическая конкуренция в сфере полупроводников.</p>\n<p><strong>Ближний Восток:</strong> Энергетический и религиозный хаб. Контроль над нефтью, газом и ключевыми морскими путями.</p>\n\n<p><strong>3. Центральная Азия: стратегический «мост» Евразии</strong></p>\n<p>1) <strong>Транзитный потенциал:</strong> Кратчайшие сухопутные пути между Китаем и Европой (Транскаспийский маршрут).</p>\n<p>2) <strong>Многовекторная политика:</strong> Балансирование между Россией, Китаем, США и ЕС.</p>\n<p>3) <strong>Ресурсный потенциал:</strong> Уран, нефть, газ и редкие металлы.</p>",
   qkk:"Хэлфорд Маккиндердің теориясы бойынша «Әлем жүрегі» (Хартленд) деп қай аймақ аталады?",
   opts:["A. Солтүстік Америка", "B. Еуразияның ішкі бөлігі", "C. Оңтүстік Азия", "D. Еуропа жағалаулары"],
   openq:"Орталық Азияның геосаяси «көпір» рөлін қалыптастырған 3 негізгі фактор туралы жазыңыз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:4,
   plan:{goal:"Діни және этникалық қақтығыстардың әлемнің саяси картасына әсерін талдау.",steps:[{t:"Қызығушылықты ояту",min:"5 мин",d:"Сұрақ: Әлемнің саяси картасы неліктен үнемі өзгеріп отырады?"}, {t:"Мағынаны тану",min:"20 мин",d:"Кестемен жұмыс: Палестина-Израиль, Кашмир, Орталық Африка — себеп-салдар талдауы."}, {t:"Тереңдету",min:"10 мин",d:"3 жаhандық салдар: Миграция, Радикализм, Халықаралық құқық дағдарысы."}, {t:"Рефлексия",min:"5 мин",d:"«Егер әрбір этникалық топ өз мемлекетін құрса, әлем картасы қалай өзгерер еді?»"}]},
   kk:"Діни және ұлттық қақтығыстардың әлемнің саяси бейнесіне ықпалы",
   ru:"Влияние религиозных и национальных конфликтов на политический облик мира",
   tkk:"<p>Әлемнің саяси картасы — бұл тұрақты құбылыс емес. Ол үнемі өзгеріп отырады, ал бұл өзгерістердің басты себептерінің бірі — <strong>діни және ұлттық қақтығыстар</strong>.</p>\n\n<p><strong>1. Қақтығыстардың саяси картаға тікелей әсері</strong></p>\n<p>Діни және ұлттық қайшылықтар әлемдік саясатта мынадай өзгерістерге әкеледі:</p>\n<p>— <strong>Мемлекеттердің бөлшектенуі:</strong> Бір ірі мемлекеттің орнына бірнеше жаңа елдің келуі. Мысал: Югославияның ыдырауы (этникалық-діни себеп) нәтижесінде Сербия, Хорватия, Словения, Босния және Герцеговина, Македония сияқты жаңа мемлекеттер пайда болды.</p>\n<p>— <strong>Сепаратизм ошақтарының қалыптасуы:</strong> Белгілі бір ұлттың немесе діни топтың өз алдына бөлініп шығуға ұмтылуы. Бүгінгі мысалдар: Қытайдағы Ұйғыр мәселесі, Испаниядағы Каталония.</p>\n<p>— <strong>Анклавтар мен эксклавтардың мәселесі:</strong> Түрлі этностардың араласып қоныстануы шекараларды анықтауды қиындатып, даулы аймақтарды тудырады (Нагорный Қарабақ, Косово).</p>\n\n<p><strong>2. Заманауи ірі қақтығыстар және олардың салдары</strong></p>\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Қақтығыс аймағы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Сипаты</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Саяси салдары</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Палестина-Израиль</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Діни және этникалық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Таяу Шығыстағы тұрақсыздық, әлемдік державалардың (АҚШ, араб елдері) екі лагерьге бөлінуі.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Кашмир (Үндістан-Пәкістан)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Діни (Индуизм-Ислам)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Екі ядролық держава арасындағы тұрақты соғыс қаупі, Оңтүстік Азиядағы шиеленіс.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Орталық Африка елдері</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Этникалық (Тайпалық)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мемлекеттік институттардың әлсіреуі, БҰҰ бітімгершілік күштерінің тұрақты араласуы.</td></tr></tbody></table>\n\n<p><strong>3. Қақтығыстардың жаhандық саяси салдарлары</strong></p>\n<p>1) <strong>Миграциялық толқындар:</strong> Соғыс аймақтарынан қашқан босқындар Еуропа мен көршілес елдердің ішкі саясатын өзгертуде.</p>\n<p>2) <strong>Радикализмнің таралуы:</strong> Діни ұрандарды жамылған экстремистік топтардың пайда болуы жаhандық лаңкестікпен күресті күн тәртібіне шығарды.</p>\n<p>3) <strong>Халықаралық құқықтың дағдарысы:</strong> «Мемлекеттің аумақтық тұтастығы» мен «ұлттардың өзін-өзі билеу құқығы» арасындағы қайшылық халықаралық қатынастардың басты дилеммасына айналды.</p>\n\n<p><strong>4. Неліктен бұл мәселе әлі күнге дейін өзекті?</strong></p>\n<p>— <strong>Тарихи мұра:</strong> Көптеген шекаралар отарлау кезеңінде ұлттардың ерекшелігін ескермей сызылған (әсіресе Африкада).</p>\n<p>— <strong>Ресурстарға талас:</strong> Көбіне дін мен ұлт мәселесі мұнай, су немесе құнарлы жер үшін таласты бүркемелеу үшін қолданылады.</p>\n<p>— <strong>Ақпараттық соғыстар:</strong> Интернет пен әлеуметтік желілер діни және ұлттық сезімдерді қоздырудың құралына айналды.</p>",
   tru:"<p>Политическая карта мира — не статичное явление. Она постоянно меняется, и одной из главных причин этих изменений являются <strong>религиозные и национальные конфликты</strong>.</p>\n\n<p><strong>1. Прямое влияние конфликтов на политическую карту</strong></p>\n<p>— <strong>Распад государств:</strong> Распад Югославии (этно-религиозная причина) привёл к образованию Сербии, Хорватии, Словении, Боснии и Герцеговины, Македонии.</p>\n<p>— <strong>Сепаратизм:</strong> Уйгурский вопрос в Китае, Каталония в Испании.</p>\n<p>— <strong>Анклавы и эксклавы:</strong> Нагорный Карабах, Косово — результат смешанного расселения этносов.</p>\n\n<p><strong>2. Крупнейшие современные конфликты</strong></p>\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Қақтығыс аймағы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Сипаты</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Саяси салдары</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Палестина-Израиль</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Діни және этникалық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Таяу Шығыстағы тұрақсыздық, әлемдік державалардың (АҚШ, араб елдері) екі лагерьге бөлінуі.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Кашмир (Үндістан-Пәкістан)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Діни (Индуизм-Ислам)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Екі ядролық держава арасындағы тұрақты соғыс қаупі, Оңтүстік Азиядағы шиеленіс.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Орталық Африка елдері</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Этникалық (Тайпалық)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мемлекеттік институттардың әлсіреуі, БҰҰ бітімгершілік күштерінің тұрақты араласуы.</td></tr></tbody></table>\n\n<p><strong>3. Глобальные политические последствия конфликтов</strong></p>\n<p>1) <strong>Миграционные волны:</strong> Беженцы из зон конфликтов меняют внутреннюю политику Европы и соседних стран.</p>\n<p>2) <strong>Распространение радикализма:</strong> Рост экстремистских группировок под религиозными лозунгами поставил борьбу с терроризмом в повестку дня.</p>\n<p>3) <strong>Кризис международного права:</strong> Противоречие между «территориальной целостностью» и «правом народов на самоопределение».</p>\n\n<p><strong>4. Почему эта проблема актуальна до сих пор?</strong></p>\n<p>— Искусственные границы колониальной эпохи, нарисованные «по линейке». Ресурсные споры, прикрытые религиозными и национальными лозунгами. Информационные войны в социальных сетях.</p>",
   qkk:"Мемлекеттердің бөлшектенуінің (сепаратизмнің) нақты мысалы қайсысы?",
   opts:["A. Югославияның ыдырауы", "B. Еуропа Одағының кеңеюі", "C. ШЫҰ-ның қалыптасуы", "D. НАТО-ның кеңеюі"],
   openq:"«Мемлекеттің аумақтық тұтастығы» мен «ұлттардың өзін-өзі билеу құқығы» арасындағы қайшылықты бір нақты мысалмен түсіндіріңіз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:5,
   plan:{goal:"Геосаяси қуаттың негізгі факторлары ретінде демография мен экономиканың рөлін түсіндіру.",steps:[{t:"Ұйымдастыру",min:"3 мин",d:"«Миға шабуыл»: Халқы аз бірақ бай ел vs халқы көп бірақ кедей ел — қайсысы геосаяси тұрғыдан күштірек?"}, {t:"Білу және түсіну",min:"7 мин",d:"Демографиялық дивиденд, голланд ауруы, технологиялық егемендік ұғымдары."}, {t:"Деңгейлік тапсырмалар",min:"20 мин",d:"А: Мәтіннен халық санының маңызын табу. В: «Brain drain» себептерін талдау. С: Транзиттік әлеует пен технологиялық егемендікті байланыстыру."}, {t:"Рефлексия",min:"5 мин",d:"5 жобалық зерттеу тақырыптарын таныстыру, үй тапсырмасын беру."}]},
   kk:"Геосаяси қуаттың демографиялық және экономикалық детерминанттары",
   ru:"Демографические и экономические детерминанты геополитической мощи",
   tkk:"<p>Геосаясат – бұл жай ғана әлем картасындағы түрлі-түсті шекаралар емес. Бұл – мемлекеттердің әлемдік сахнадағы «салмағын» анықтайтын факторлардың күрделі жүйесі. Осы жүйенің ең маңызды екі тіреуі — <strong>демография</strong> мен <strong>экономика</strong>.</p>\n\n<p><strong>1. Демографиялық детерминант: Сан мен сапаның бірегейлігі</strong></p>\n<p>Халық — кез келген мемлекеттің ең басты және ең құнды ресурсы. Геосаясатта демографиялық фактор тек адамның санын ғана емес, оның сапасын — білімін, шығармашылық қабілетін, денсаулығын да қамтиды.</p>\n\n<p><strong>Халық саны және аумақты игеру:</strong> Халық саны көп мемлекеттер (Қытай, Үндістан, АҚШ) әлемдік нарықта үлкен ішкі сұраныс қалыптастырып, өз ережелерін белгілей алады. Бірақ халық саны ғана жеткіліксіз — оның сапасы шешуші рөл атқарады.</p>\n<p><strong>Жас құрылымы және «демографиялық дивиденд»:</strong> Елдегі жастар мен еңбекке қабілетті азаматтардың үлесі көп болса, бұл экономикалық өсудің қуатты қозғаушы күші болады — «демографиялық дивиденд».</p>\n<p><strong>Адами капиталдың сапасы:</strong> Бүгінгі таңда халықтың санынан гөрі оның сапасы маңыздырақ. Сапа дегеніміз — ұлттың білімділігі, IT-сауаттылығы, инновациялық ойлау қабілеті мен «soft skills» дағдылары.</p>\n\n<p><strong>2. Экономикалық детерминант: Мемлекеттің «бұлшықеті»</strong></p>\n<p><strong>Жалпы ішкі өнім (ЖІӨ) және қаржылық ықпал:</strong> Мемлекеттің экономикалық «салмағы» ЖІӨ-мен өлшенеді. Дамыған экономика сыртқы саясатты жүргізуге, қорғанысты қамтамасыз етуге мүмкіндік береді.</p>\n<p><strong>Табиғи ресурстар: байлық әлде қарғыс?</strong> Мұнай, табиғи газ, уран, сирек металдар — маңызды геосаяси ресурс. Алайда тек шикізатқа тәуелді болу «ресурс қарғысына» — «голланд ауруына» әкелуі мүмкін.</p>\n<p><strong>Инфрақұрылым және технологиялық егемендік:</strong> Қазіргі геосаяси текетірес жер немесе мұнай үшін ғана емес, технологиялық үстемдік үшін де жүруде. Микрочиптер мен жасанды интеллект (ЖИ) — жаңа «стратегиялық қару».</p>\n\n<p><strong>3. Демография мен экономиканың өзара байланысы</strong></p>\n<p>1. <strong>Интеллектуалдық көші-қон:</strong> Экономикасы қуатты елдерге таланттар ағылады. «Ақыл-ойдың жылыстауы» (brain drain) — кедей елдер үшін үлкен геосаяси шығын.</p>\n<p>2. <strong>Нарық көлемінің күші:</strong> Халық саны көп әрі табысы жоғары елдер әлемдік саудада өз ережелерін белгілей алады.</p>\n\n<p><strong>Қорытынды:</strong> Мықты демография (салауатты, білімді және шығармашыл халық) + тиімді экономика (инновациялық, ресурстық тәуелділіктен арылған) = мемлекеттің нағыз геосаяси күші.</p>",
   tru:"<p>Геополитика — это не просто разноцветные границы на карте. Это сложная система факторов, определяющих «вес» государства на мировой арене. Два важнейших «столпа» этой системы — <strong>демография</strong> и <strong>экономика</strong>.</p>\n\n<p><strong>1. Демографический детерминант</strong></p>\n<p>Народ — главный и самый ценный ресурс любого государства. В геополитике демографический фактор включает не только численность населения, но и его качество: образованность, творческий потенциал, здоровье.</p>\n<p><strong>Численность населения:</strong> Страны с большим населением (Китай, Индия, США) формируют огромный внутренний спрос и диктуют правила на мировом рынке.</p>\n<p><strong>«Демографический дивиденд»:</strong> Высокая доля молодёжи и трудоспособного населения — мощный двигатель экономического роста.</p>\n<p><strong>Качество человеческого капитала:</strong> Сегодня качество важнее количества: IT-грамотность, инновационное мышление, soft skills.</p>\n\n<p><strong>2. Экономический детерминант</strong></p>\n<p><strong>ВВП и финансовое влияние:</strong> Развитая экономика позволяет проводить активную внешнюю политику и обеспечивать обороноспособность.</p>\n<p><strong>Природные ресурсы: богатство или проклятие?</strong> Нефть, газ, уран, редкие металлы — важный геополитический ресурс. Но зависимость от сырья может привести к «ресурсному проклятию» («голландская болезнь»).</p>\n<p><strong>Технологический суверенитет:</strong> Микрочипы и ИИ — новое «стратегическое оружие».</p>\n\n<p><strong>3. Взаимосвязь демографии и экономики</strong></p>\n<p>1. <strong>«Утечка мозгов»:</strong> Таланты тянутся к сильным экономикам — это геополитические потери для бедных стран.</p>\n<p>2. <strong>Сила рынка:</strong> Страны с многочисленным и платёжеспособным населением диктуют правила мировой торговли.</p>",
   qkk:"«Демографиялық дивиденд» дегеніміз не?",
   opts:["A. Зейнеткерлер санының өсуі", "B. Туу көрсеткішінің төмендеуі", "C. Еңбекке қабілетті жастардың үлесінің жоғарылауы және экономикалық өсудің жеделдеуі", "D. Халық санының кемуі"],
   openq:"«Ақыл-ойдың жылыстауы» (Brain drain) мемлекеттің геосаяси қуатын қалай әлсіретеді? Нақты мысалмен дәлелдеңіз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:6,
   plan:{goal:"Қазақстанның Еуразия орталығындағы стратегиялық рөлін, ресурстық әлеуетін және көпвекторлы саясатын талдату.",steps:[{t:"Қызығушылықты ояту",min:"5 мин",d:"«Геосаясат – бұл...» сөйлемін толықтыру. «Тұйық аймақтан – Орталық хабқа» өту тұжырымдамасы."}, {t:"Мағынаны тану",min:"15 мин",d:"Мәтінді 3 блокқа бөліп талдау: Geography → Resources → Policy. «Land-linked» тұжырымдамасы."}, {t:"Шығармашылық жұмыс",min:"15 мин",d:"«Болашақтың жобасы»: Цифрлық жібек жолы, жасыл сутегі немесе азық-түлік хабы — қайсысы пайдалы?"}, {t:"Қорытынды",min:"5 мин",d:"Рефлексиялық сұрақ: Болашақта Қазақстан үшін «болашақтың экономикасын бақылау тетігі» ретінде қандай ресурс маңыздырақ?"}]},
   kk:"Қазақстанның геосаяси жағдайындағы артықшылықтары мен мүмкіндіктері",
   ru:"Преимущества и возможности геополитического положения Казахстана",
   tkk:"<p>Геосаясат — бұл тек география мен саясаттың ұштасуы емес, бұл мемлекеттің өз аумағын, ресурстары мен орналасу артықшылықтарын ұлттық мүдде үшін пайдалана білу өнері.</p>\n\n<p><strong>1. Географиялық орналасу: «Тұйық» аймақтан «Орталық хабқа»</strong></p>\n<p>Қазақстанның әлемдік мұхитқа тікелей шығар жолы жоқ. Дәстүрлі географияда бұл экономикалық дамуды тежейтін фактор ретінде қаралды. Алайда XXI ғасырда бұл «кемшілік» стратегиялық артықшылыққа айналды:</p>\n<p>— <strong>Еуразияның транзиттік көпірі:</strong> Қазақстан — Шығыс пен Батысты (Қытай мен Еуропаны), Солтүстік пен Оңтүстікті (Ресей мен Иранды) жалғайтын ең қысқа жол.</p>\n<p>— <strong>«Құрлықтық байланыс» (Land-linked) тұжырымдамасы:</strong> Мұхитқа жолы жоқ елден Қазақстан құрлықтық логистикалық орталыққа айналуда.</p>\n<p>— <strong>Транскаспий бағыты (Орта дәліз):</strong> Қазіргі геосаяси жағдайда Қара теңіз бен Каспий арқылы өтетін бұл бағыт әлемдік сауда үшін ең тиімді балама жолға айналды.</p>\n\n<p><strong>2. Ресурстық потенциал және «Энергетикалық дипломатия»</strong></p>\n<p>— <strong>Уран нарығындағы доминанттылық:</strong> Қазақстан әлемдік уран өндірісінің <strong>40%-дан астамын</strong> иеленеді. Жаhандық «декарбонизация» кезеңінде ядролық энергетикаға деген сұраныс артып, бұл Қазақстанды тетіктік серіктеске айналдыруда.</p>\n<p>— <strong>Көмірсутек шикізаты:</strong> Каспий қайраңындағы мұнай мен газ қорлары Еуропалық Одақ үшін баламалы энергия көзі ретінде маңызды.</p>\n<p>— <strong>Сирек кездесетін металдар:</strong> Смартфондар, электромобильдер мен жоғары технологиялар үшін қажетті литий, кобальт және т.б. металдар болашақтың «жаңа мұнайы».</p>\n\n<p><strong>3. Көпвекторлы саясат: Теңгерім сақтау шеберлігі</strong></p>\n<p>Қазақстан Ресей мен Қытайдың арасында орналасқан. Бұл геосаяси жағдай сын-қатерлер тудырса да, сонымен бірге бірегей мүмкіндіктер береді:</p>\n<p>— <strong>Тұрақтылық аралы:</strong> Қазақстан Орталық Азиядағы ең тұрақты мемлекет ретінде танылды.</p>\n<p>— <strong>Бітімгерлік рөлі:</strong> Астана процесі (Сирия шиеленісі), ядролық қарудан бас тарту бастамалары Қазақстандың халықаралық беделін арттырды.</p>\n<p>— <strong>Интеграциялық көшбасшылық:</strong> ЕАЭО, ШЫҰ, Түркі мемлекеттері ұйымы — бұл платформаларда Қазақстан тек мүше емес, белсенді архитектор.</p>\n\n<p><strong>4. Болашақ мүмкіндіктер: Цифрлық және Жасыл геосаясат</strong></p>\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Мүмкіндік саласы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Геосаяси мәні</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Цифрлық Жібек жолы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Еуропа мен Азия арасындағы ақпараттық талшықты-оптикалық транзит. Қазақстан — өңірлік Data-хаб.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Жасыл сутегі</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Еуропаға экологиялық таза отын экспорттау арқылы «жасыл энергия» көшбасшысына айналу.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Азық-түлік қауіпсіздігі</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Орасан зор ауыл шаруашылығы жерлері Қазақстанды Еуразияның «нан себетіне» айналдырып, азық-түлік арқылы ықпал ету мүмкіндігін береді.</td></tr></tbody></table>\n\n<p><strong>5. Геосаяси сын-қатерлер мен стратегиялық жауап</strong></p>\n<p>1) <strong>Инфрақұрылымдық тәуелсіздік:</strong> Жаңа теміржол желілері мен Каспий порттарын дамыту.</p>\n<p>2) <strong>Интеллектуалды ұлт:</strong> Технологиялық тәуелділікті азайту үшін адами капиталды дамыту.</p>\n<p>3) <strong>Әскери-саяси бейтараптық:</strong> Теңгерімді сақтай отырып, ұлттық қауіпсіздікті нығайту.</p>\n<p><em>Болашақта Қазақстан тек тауар тасымалдайтын жол ғана емес, идеялар, технологиялар мен бейбітшілік бастамаларының өтетін ең маңызды аренаға айналуы тиіс.</em></p>",
   tru:"<p>Геополитика — это не только пересечение географии и политики, но и искусство государства использовать своё положение, ресурсы и преимущества в национальных интересах.</p>\n\n<p><strong>1. Географическое положение: от «тупика» к «центральному хабу»</strong></p>\n<p>— <strong>Транзитный мост Евразии:</strong> Казахстан — кратчайший путь между Востоком и Западом (Китай–Европа) и Севером и Югом (Россия–Иран).</p>\n<p>— <strong>Концепция Land-linked:</strong> Отсутствие выхода к морю превратилось в стратегическое преимущество — строительство сухопутного логистического центра.</p>\n<p>— <strong>Транскаспийский маршрут (Средний коридор):</strong> Стал наиболее эффективной альтернативой для мировой торговли в условиях нынешней геополитики.</p>\n\n<p><strong>2. Ресурсный потенциал и «Энергетическая дипломатия»</strong></p>\n<p>— <strong>Доминирование на рынке урана:</strong> Казахстан владеет более <strong>40% мирового производства урана</strong>. В эпоху «декарбонизации» это делает его незаменимым партнёром.</p>\n<p>— <strong>Углеводородное сырьё:</strong> Нефть и газ Каспийского шельфа — альтернативный источник энергии для ЕС.</p>\n<p>— <strong>Редкие металлы:</strong> Литий, кобальт и другие металлы для смартфонов и электромобилей — «новая нефть» будущего.</p>\n\n<p><strong>3. Многовекторная политика</strong></p>\n<p>— <strong>«Остров стабильности»:</strong> Казахстан признан наиболее стабильным государством Центральной Азии.</p>\n<p>— <strong>Миротворческая роль:</strong> Астанинский процесс по Сирии, инициативы по отказу от ядерного оружия.</p>\n<p>— <strong>Интеграционное лидерство:</strong> ЕАЭС, ШОС, Организация тюркских государств.</p>\n\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Мүмкіндік саласы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Геосаяси мәні</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Цифрлық Жібек жолы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Еуропа мен Азия арасындағы ақпараттық талшықты-оптикалық транзит. Қазақстан — өңірлік Data-хаб.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Жасыл сутегі</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Еуропаға экологиялық таза отын экспорттау арқылы «жасыл энергия» көшбасшысына айналу.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Азық-түлік қауіпсіздігі</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Орасан зор ауыл шаруашылығы жерлері Қазақстанды Еуразияның «нан себетіне» айналдырып, азық-түлік арқылы ықпал ету мүмкіндігін береді.</td></tr></tbody></table>",
   qkk:"Қазақстан дүниежүзілік уран өндірісінің қанша пайызын қамтамасыз етеді?",
   opts:["A. 10%", "B. 20%", "C. 30%", "D. 40%-дан астам"],
   openq:"Қазақстанның «Land-locked» емес, «Land-linked» ел болу тұжырымдамасын өз сөзіңізмен түсіндіріңіз. Транскаспий бағытымен байланыстырыңыз.",
   mapq:'',mapDots:[],mapOpts:[]},
,
  {id:7,
   plan:{goal:"Оқушылар Қазақстанның географиялық орналасу ерекшелігін талдай отырып, оның жаhандық саудадағы транзиттік рөлін түсіндіреді.",steps:[{t:"Ұйымдастыру",min:"5 мин",d:"«Миға шабуыл»: «Теңізге шығар жолы жоқ мемлекет бай бола ала ма?» — Швейцария, Австрия, Қазақстан мысалдары."}, {t:"Мәтінмен жұмыс",min:"20 мин",d:"А деңгейі: Транзиттік уақыт айырмашылығын санау. В деңгейі: Рельефтің транзитке оң ықпалын талдау. С деңгейі: «Орта дәліздің» ресей маршрутына балама болу себептерін бағалау."}, {t:"Топтық жұмыс",min:"15 мин",d:"«Құрғақ порт» жобасын жасау: Хоргос тәжірибесін негізге ала отырып, жаңа транзиттік хаб орнын ұсыну."}, {t:"Рефлексия",min:"5 мин",d:"«Транзит — тек жол ма, әлде саясат па?» — талқылау."}]},
   kk:"Қазақстанның Еуразиядағы транзиттік көпір рөлі",
   ru:"Роль Казахстана как транзитного моста Евразии",
   tkk:"<p><strong>7 тақырып: Қазақстанның Еуразиядағы транзиттік көпір рөлі</strong></p>\n<p>Қазақстан Республикасының әлемдік картадағы орны қайталанбас ерекшелікке ие: мұхитқа тікелей шығу жолы жоқ, ең үлкен тоғыз «тұйық» мемлекеттің бірі. Алайда бұл «географиялық кемшілік» ретінде бағаланған фактор бүгінде еліміздің ең мықты <strong>стратегиялық артықшылығына</strong> айналуда.</p>\n\n<p><strong>1. Негізгі транзиттік дәліздер</strong></p>\n<p><strong>1. «Батыс Еуропа – Батыс Қытай» трансқұрлықтық автодәлізі</strong></p>\n<p>Бұл дәліздің Қазақстан аумағындағы ұзындығы 2787 шақырым. Ол Еуропаны тікелей Қытаймен жалғап, тасымал уақытын теңіз жолымен салыстырғанда <strong>2–3 есе</strong> қысқартады. Оңтайландырылған логистика арқылы Қазақстан транзиттік тауар ағынынан айтарлықтай экономикалық пайда табады.</p>\n<p><strong>2. Транскаспий халықаралық көлік бағдары (Орталық дәліз)</strong></p>\n<p>Қазіргі геосаяси жағдайда бұл маршруттың маңызы күрт өсті. Ресей арқылы өтетін «Солтүстік дәлізге» балама ретінде бұл бағыт Азербайджан мен Грузия арқылы Еуропаға жетеді. Батыс инвесторлары мен тауар иелері үшін <strong>ең қауіпсіз және болжамды маршрут</strong> ретінде танылды.</p>\n<p><strong>3. «Солтүстік – Оңтүстік» халықаралық көлік дәлізі</strong></p>\n<p>Бұл бағыт Ресейдің еуропалық бөлігін Парсы шығанағы елдерімен байланыстырады. Иран арқылы Үндістан мен Оңтүстік Азия нарықтарына да жол ашылады.</p>\n\n<p><strong>2. Табиғи-географиялық факторлардың транзитке ықпалы</strong></p>\n<p><strong>Жер бедері (Рельеф):</strong> Қазақстан аумағының басым бөлігінің жазық (Сарыарқа, Тұран ойпаты, Каспий маңы ойпаты) болуы — инфрақұрылым салу үшін аса қолайлы жағдай. Тауларсыз, батпақтарсыз, шексіз жазықта жол, теміржол, газ және мұнай құбырларын салу <strong>едәуір арзанға</strong> түседі.</p>\n<p><strong>Климаттық жағдайлар:</strong> Қатаң континенттік климат (жазда +40°C, қыста -40°C) транзиттік инфрақұрылымға техникалық талаптарды арттырады. Бірақ отандық инженерлер мен компаниялар бұл жағдайларды жақсы меңгерген.</p>\n\n<p><strong>3. Геоэкономикалық түйіндер: «Құрғақ порттар» феномені</strong></p>\n<p>Қазіргі экономикалық географияда жаңа ұғымдар пайда болды. «Құрғақ порт» (Dry Port) — теңізге шығу жолы жоқ мемлекеттердегі ішкі логистикалық хабтар. Қазақстандағы Хоргос-Шығыс қақпасы (KTZE-Khorgos Gateway) — осы тұжырымдаманың нақты жүзеге асуы. Жыл сайын миллиондаған тонна жүк өңделетін бұл хаб Еуропа мен Азия арасындағы тауар айналымының маңызды торабына айналды.</p>\n\n<p><strong>Қорытынды:</strong> Қазақстанның Еуразиядағы көпір рөлі – бұл жай ғана табиғи берілгендік емес, ол мақсатты транспорттық-логистикалық саясаттың, халықаралық дипломатияның және инфрақұрылымдық инвестициялардың нәтижесі. Болашақта бұл рөлдің маңызы тек арта береді.</p>",
   tru:"<p><strong>7 тема: Роль Казахстана как транзитного моста Евразии</strong></p>\n<p>Казахстан — одно из девяти крупнейших «замкнутых» государств без прямого выхода к океану. Однако этот «географический недостаток» превратился в стратегическое преимущество.</p>\n\n<p><strong>1. Основные транзитные коридоры</strong></p>\n<p><strong>1. Трансконтинентальный автодорожный коридор «Западная Европа – Западный Китай»</strong></p>\n<p>Протяжённость по территории Казахстана — 2787 км. Сокращает время транспортировки по сравнению с морским путём в 2–3 раза. Казахстан извлекает значительную экономическую выгоду из транзитного товаропотока.</p>\n<p><strong>2. Транскаспийский международный транспортный маршрут (Средний коридор)</strong></p>\n<p>В нынешней геополитической ситуации значимость этого маршрута резко возросла. Признан наиболее безопасным и предсказуемым маршрутом для западных инвесторов: через Азербайджан и Грузию в Европу.</p>\n<p><strong>3. Международный транспортный коридор «Север – Юг»</strong></p>\n<p>Соединяет европейскую часть России с Персидским заливом, открывая выход на рынки Индии и Южной Азии через Иран.</p>\n\n<p><strong>2. Влияние физико-географических факторов на транзит</strong></p>\n<p><strong>Рельеф:</strong> Преобладание равнинного рельефа (Сарыарка, Туранская низменность, Прикаспийская низменность) — идеальные условия для строительства инфраструктуры.</p>\n<p><strong>Климат:</strong> Резко-континентальный климат повышает технические требования к инфраструктуре, однако казахстанские инженеры успешно адаптировались к этим условиям.</p>\n\n<p><strong>3. Геоэкономические узлы: феномен «сухих портов»</strong></p>\n<p>«Сухой порт» (Dry Port) — внутренние логистические хабы государств без морского выхода. Хоргос-Восточные ворота (KTZE) — конкретное воплощение этой концепции, крупнейший логистический узел в товарообороте между Европой и Азией.</p>",
   qkk:"«Батыс Еуропа – Батыс Қытай» автодәлізінің Қазақстан аумағындағы ұзындығы қанша?",
   opts:["A. 1200 шақырым", "B. 2000 шақырым", "C. 2787 шақырым", "D. 3500 шақырым"],
   openq:"Транскаспий халықаралық көлік бағдары (Орта дәліз) неліктен қазіргі геосаяси жағдайда ерекше маңызға ие болды? Себептерін жазыңыз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:8,
   plan:{goal:"Оқушыларға Еуразия тарихын тек фактілер жиынтығы ретінде емес, адамзаттың ортақ мәдени мұрасы ретінде қабылдату.",steps:[{t:"Кіріспе",min:"10 мин",d:"Ice-breaker: «Ұлы Жібек жолындағы керуен сарайда тұрмын деп елестетіп, не сезінесіз?»"}, {t:"Мәтінмен жұмыс",min:"20 мин",d:"Жібек жолы, көшпелілер мен отырықшылар симбиозы, қазіргі плюрализм бойынша талдау."}, {t:"Рефлексия",min:"10 мин",d:"Гуманистік сұрақтар: Еуразияда туып-өсу — сенің жеке міндетіңе қалай əсер етеді? Мәдени əртүрлілік — байлық па, қауіп пе?"}, {t:"Қорытынды",min:"5 мин",d:"«Менің Еуразиям» — 2-3 сөйлемдік монолог немесе эссе."}]},
   kk:"Еуразия жүрегіндегі өркениеттер тоғысы және мәдени плюрализм",
   ru:"Пересечение цивилизаций в сердце Евразии и культурный плюрализм",
   tkk:"<p><strong>8 тақырып: Еуразия жүрегіндегі өркениеттер тоғысы және мәдени плюрализм</strong></p>\n<p>Еуразия құрлығы – адамзат тарихындағы ең ірі геосаяси, экономикалық және мәдени кеңістік. Бұл алып құрлық мыңдаған жылдар бойы тек жауынгерлер мен саудагерлер ғана емес, идеялар, наным-сенімдер және өнер туындылары да кесіп өткен ерекше кеңістік болды. Бұл тарихи ерекшелік қазақ жеріндегі <strong>мәдени плюрализмнің</strong> (көптүрліліктің) негізін қалады.</p>\n\n<p><strong>I. Ұлы Жібек жолы: Мәдениеттер мен идеялардың күретамыры</strong></p>\n<p>Еуразиядағы өркениеттер тоғысын сөз еткенде, ең алдымен <strong>Ұлы Жібек жолын</strong> айту қажет. Бұл жай ғана сауда керуендерінің жолы емес. Жібек жолы арқылы тек Қытайдың жібегі, Үндістанның дәмдеуіштері немесе Еуропаның қолөнер бұйымдары ғана тасымалданбады — онымен бірге <strong>математика, астрономия, медицина, музыка, дін және философия</strong> да тараған.</p>\n<p>Ортағасырлық Қазақстан аумағындағы <strong>Отырар, Тараз, Испиджаб, Баласағұн</strong> сияқты қалалар нағыз космополиттік орталықтар болды. Мұнда арабтар мен парсылар, қытайлықтар мен моңғолдар, грек мәдениетінің мұрагерлері мен үнді философтары бір мезгілде тіршілік еткен.</p>\n\n<p><strong>II. Көшпелілер мен отырықшылар симбиозы</strong></p>\n<p>Еуразия жүрегіндегі өркениеттің тағы бір бірегей сипаты – <strong>Дала (көшпелілер) және Қала (отырықшылар)</strong> мәдениеттерінің бірін-бірі толықтырып, байытуы. Бұл екі өмір салты бір-бірімен қарама-қайшы емес, өзара тәуелді болды.</p>\n<p>Көшпелілер өмір салты кеңістікті жылдам меңгеруді, табиғатпен гармонияда болуды және жаңа жағдайларға тез бейімделуді қажет етті. Осы мінез — қазіргі тілмен айтқанда, <em>adaptability</em> пен <em>resilience</em> — қазақ мәдениетінің өзегіне айналды.</p>\n\n<p><strong>III. Қазіргі Қазақстандағы мәдени плюрализм моделі</strong></p>\n<p>1. <strong>Теңқұқылылық және интеграция:</strong> Этникалық немесе діни тиесілілігіне қарамастан барлық азаматтардың заң алдындағы теңдігі.</p>\n<p>2. <strong>Институционалдық қолдау:</strong> Қазақстан халқы Ассамблеясы — этносаралық татулықты нығайтатын бірегей институт.</p>\n<p>3. <strong>Дінаралық келісім:</strong> Зайырлы мемлекет ретінде Қазақстан барлық дәстүрлі діндерге құрметпен қарайды. Нур-Султандағы (Астана) Әлемдік және дәстүрлі діндер көшбасшыларының съезі — осы саясаттың символы.</p>\n<p>4. <strong>Көптілділік:</strong> Қазақ тілінің мемлекеттік тіл ретіндегі ұйыстырушылық рөлімен қатар, орыс, ағылшын және басқа тілдердің де дамуы.</p>\n\n<p><strong>IV. Жаhандану, цифрландыру және ұлттық код</strong></p>\n<p>Бүгінгі таңда жаhандану процесі мәдени плюрализмнің рөлін өзгертуде. Енді ол тек ел ішіндегі татулықты ғана емес, <strong>әлемдік кеңістікте өзін таныта білу</strong> мүмкіндігін де береді. Бәсекеге қабілетті ұлт болу үшін басқа мәдениеттердің озық тәжірибесін, тілдері мен технологияларын меңгеру қажет — бірақ <strong>өз тамырыңды жоғалтпай</strong>.</p>",
   tru:"<p><strong>8 тема: Пересечение цивилизаций в сердце Евразии и культурный плюрализм</strong></p>\n<p>Евразийский континент — крупнейшее геополитическое, экономическое и культурное пространство в истории человечества. Это уникальное пространство, через которое тысячелетиями проходили не только воины и торговцы, но и идеи, верования и произведения искусства.</p>\n\n<p><strong>I. Великий Шёлковый путь: артерия культур и идей</strong></p>\n<p>По Шёлковому пути распространялись не только китайский шёлк, индийские пряности или европейские ремёсла, но и <strong>математика, астрономия, медицина, музыка, религия и философия</strong>.</p>\n<p>Города на территории средневекового Казахстана — <strong>Отрар, Тараз, Испиджаб, Баласагун</strong> — были настоящими космополитическими центрами, где арабы и персы, китайцы и монголы, наследники греческой культуры и индийские философы сосуществовали одновременно.</p>\n\n<p><strong>II. Симбиоз кочевников и оседлых народов</strong></p>\n<p>Кочевой образ жизни требовал быстрого освоения пространства, гармонии с природой и быстрой адаптации к новым условиям. Эти качества — <em>adaptability</em> и <em>resilience</em> — стали ядром казахской культуры.</p>\n\n<p><strong>III. Модель культурного плюрализма в современном Казахстане</strong></p>\n<p>1. Равноправие и интеграция граждан независимо от этнической и религиозной принадлежности.</p>\n<p>2. Ассамблея народа Казахстана — уникальный институт укрепления межэтнического согласия.</p>\n<p>3. Съезд лидеров мировых и традиционных религий в Астане — символ межрелигиозного диалога.</p>\n<p>4. Многоязычие: государственная роль казахского языка в сочетании с развитием русского, английского и других языков.</p>",
   qkk:"Ортағасырлық Қазақстан аумағындағы қай қалалар Ұлы Жібек жолының маңызды орталықтары болды?",
   opts:["A. Отырар, Тараз, Испиджаб, Баласағұн", "B. Алматы, Нур-Султан, Шымкент", "C. Самарқанд, Бұхара, Ташкент", "D. Мерв, Нишапур, Герат"],
   openq:"Жаhандану кезінде ұлттық мәдени кодты сақтау неліктен маңызды? Өз ойыңызды дәлелмен жазыңыз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:9,
   plan:{goal:"Оқушыларға Қазақстанның энергия ресурстарының геосаяси маңызын түсіндіру және сыртқы саясаттағы көпвекторлы стратегияны талдату.",steps:[{t:"Білу және Түсіну",min:"7 мин",d:"Қазақстанның мұнай экспортының негізгі бағыттарын картадан табу."}, {t:"Қолдану",min:"10 мин",d:"Уран өндірісіндегі 40% үлесін «жасыл экономика» контексінде талдау."}, {t:"Талдау",min:"15 мин",d:"АҚШ/ЕО инвестициялары мен Ресей транзитін салыстыру. Орта дәліздің тәуелділікті азайтудағы рөлі."}, {t:"Бағалау",min:"8 мин",d:"Пікірталас: «Мұнай мен газ — геосаяси сауыт па, əлде тәуелділік пе?»"}]},
   kk:"Қазақстанның энергетикалық дипломатиясы: Мұнай, газ және уран",
   ru:"Энергетическая дипломатия Казахстана: нефть, газ и уран",
   tkk:"<p><strong>9 тақырып: Қазақстанның энергетикалық дипломатиясы: Мұнай, газ және уран</strong></p>\n<p>Қазіргі заманғы халықаралық қатынастарда табиғи ресурстар тек экономикалық табыс көзі ғана емес, сонымен бірге <strong>геосаяси ықпал мен дипломатиялық салмақтың</strong> маңызды факторы. Осы тұрғыдан алғанда Қазақстан ерекше орынға ие.</p>\n\n<p><strong>1. Мұнай — экономикалық тұрақтылықтың тірегі</strong></p>\n<p>Қазақстанның тәуелсіздік жылдарындағы экономикалық жетістіктерінің негізі — мұнай өнеркәсібі. Еліміз мұнайдың дәлелденген қорлары жөнінен әлемде алдыңғы қатарда тұр, ал негізгі экспорттық бағыттар:</p>\n<p>— <strong>Каспий Құбыр Консорциумы (КҚК/CPC):</strong> Қазақстан мұнайының шамамен 80%-ы осы құбыр арқылы Новороссийск портына, одан теңіз жолымен Еуропаға жетеді.</p>\n<p>— <strong>Атырау-Самара құбыры:</strong> Ресейдің «Транснефть» жүйесі арқылы Еуропаға бағытталған жол.</p>\n<p>— <strong>Қазақстан – Қытай мұнай құбыры:</strong> Шығысқа бағытталған стратегиялық маршрут.</p>\n<p>Энергетикалық дипломатия аясында Қазақстан Транскаспий маршрутын (Орта дәліз) дамыту арқылы мұнай экспортын <strong>Ресейге тәуелділіктен азайтуды</strong> мақсат тұтуда.</p>\n\n<p><strong>2. Табиғи газ — экологиялық және стратегиялық ресурс</strong></p>\n<p>Қазақстанның газ дипломатиясы екі бағытта дамып келеді:</p>\n<p>1) <strong>Транзиттік әлеует:</strong> «Түркіменстан – Өзбекстан – Қазақстан – Қытай» газ құбыры арқылы Орталық Азия газының Қытайға жеткізілуі.</p>\n<p>2) <strong>Ішкі нарықты газдандыру:</strong> «Сарыарқа» магистральдық газ құбыры арқылы еліміздің орталық және солтүстік аймақтарын табиғи газбен қамтамасыз ету.</p>\n\n<p><strong>3. Уран — «Болашақтың энергиясы» және әлемдік көшбасшылық</strong></p>\n<p>Қазақстан — <strong>2009 жылдан бері әлемдік уран өндірісінде 1-орын</strong> алатын мемлекет. Уран өндірісінің <strong>40%-дан астамы</strong> — бұл геосаяси «сауыт».</p>\n<p>Жаhандық жылынумен күресу және «жасыл экономикаға» көшу кезеңінде ядролық энергетикаға деген сұраныс артуда — Қазақстан осы трендтен ең көп ұтатын елдердің бірі.</p>\n<p>Қазақстанның уран дипломатиясының басты жетістіктері:</p>\n<p>— Елімізде <strong>АЭХА-ның Төмен байытылған уран банкінің</strong> ашылуы — бейбіт мақсатта ядролық отынды дамытушы мемлекет ретіндегі халықаралық мойындау.</p>\n<p>— Шикізат экспорттаушыдан <strong>дайын ядролық отын өндіруші</strong> деңгейіне көшу стратегиясы.</p>\n\n<p><strong>4. Геосаяси аспектілер және көпвекторлы саясат</strong></p>\n<p>— <strong>Батыс елдері (АҚШ, ЕО):</strong> Теңіз және Қашаған жобаларындағы басты инвесторлар. Еуропаның энергетикалық қауіпсіздігіне балама көз.</p>\n<p>— <strong>Қытай:</strong> Энергия ресурстарының ең ірі тұтынушысы. Қытай нарығына бағытталған құбырлар — экспорттық мүмкіндіктерді кеңейтудің негізі.</p>\n<p>— <strong>Ресей:</strong> Негізгі транзиттік серіктес. Қазақстан мұнайының үлкен бөлігі Ресей арқылы өткендіктен, тәуелділікті азайтуға бағытталған жобалар маңызды.</p>\n\n<p><strong>5. Сын-қатерлер мен болашақ</strong></p>\n<p>Болашақта Қазақстан тек шикізат жеткізуші ғана емес, <strong>сутегі энергетикасын дамытушы</strong> және <strong>сирек кездесетін металдарды (литий, кобальт) өңдеуші</strong> мемлекет ретінде халықаралық аренада жаңа позицияларды иеленуге тиіс.</p>",
   tru:"<p><strong>9 тема: Энергетическая дипломатия Казахстана: Нефть, газ и уран</strong></p>\n<p>В современных международных отношениях природные ресурсы — не просто источник экономических доходов, но и важный фактор геополитического влияния и дипломатического веса.</p>\n\n<p><strong>1. Нефть — основа экономической стабильности</strong></p>\n<p>— <strong>КТК/CPC:</strong> ~80% казахстанской нефти идёт через этот трубопровод в порт Новороссийск, далее морем в Европу.</p>\n<p>— <strong>Трубопровод Атырау-Самара:</strong> Через систему «Транснефть» в Европу.</p>\n<p>— <strong>Нефтепровод Казахстан–Китай:</strong> Стратегический восточный маршрут.</p>\n<p>В рамках энергетической дипломатии Казахстан развивает Транскаспийский маршрут (Средний коридор) для снижения зависимости от России.</p>\n\n<p><strong>2. Природный газ</strong></p>\n<p>1) Транзитный потенциал: трубопровод «Туркменистан–Узбекистан–Казахстан–Китай».</p>\n<p>2) Газификация внутреннего рынка: магистральный газопровод «Сарыарка» для центральных и северных регионов.</p>\n\n<p><strong>3. Уран — «Энергия будущего»</strong></p>\n<p>Казахстан занимает <strong>1-е место в мире</strong> по добыче урана с 2009 года — более <strong>40% мирового производства</strong>. Банк низкообогащённого урана МАГАТЭ — признание Казахстана как государства, развивающего мирную ядерную энергетику.</p>\n\n<p><strong>4. Многовекторная политика</strong></p>\n<p>США и ЕС — главные инвесторы в нефтяные проекты. Китай — крупнейший потребитель энергоресурсов. Россия — основной транзитный партнёр. Казахстан балансирует между всеми тремя в своих интересах.</p>",
   qkk:"Қазақстан әлемдік уран өндірісінде қандай орын алады?",
   opts:["A. 2-орын", "B. 1-орын (40%-дан астам)", "C. 3-орын", "D. 5-орын"],
   openq:"«Мұнай мен газ — Қазақстанның геосаяси сауыты» деген пікірге қосыласыз ба? Дәлел келтіріңіз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:10,
   plan:{goal:"Геоэкономикалық интеграция ұғымын түсіндіру. Қазақстан мүше ірі экономикалық блоктардың маңызын талдау.",steps:[{t:"Ұйымдастыру",min:"5 мин",d:"«Шекарасыз әлем» тренингі. «Интеграция» терминіне анықтама беру."}, {t:"Топтық жұмыс",min:"15 мин",d:"«Дипломатиялық өкілдіктер» ойыны: ЕАЭО, ШЫҰ, ДСҰ топтары өз ұйымының Қазақстан үшін пайдасын таныстырады."}, {t:"Талқылау",min:"15 мин",d:"Неліктен тек бір ұйыммен шектелу қауіпті? Экономикалық егемендік пен ұйым мүддесінің теңгерімі."}, {t:"Рефлексия",min:"5 мин",d:"«Дастархандағы тауарлар» әдісі: күнделікті пайдаланатын қандай тауарлар интеграция арқылы келеді?"}]},
   kk:"Халықаралық геоэкономикалық интеграциялармен ынтымақтастық",
   ru:"Сотрудничество с международными геоэкономическими интеграциями",
   tkk:"<p><strong>10 тақырып: Халықаралық геоэкономикалық интеграциялармен ынтымақтастық</strong></p>\n<p>Қазіргі әлемде бірде-бір мемлекет оқшауланып, тек өз ішінде дами алмайды. Әсіресе, мұхитқа тікелей шығар жолы жоқ, бірақ Еуразияның қақ ортасында орналасқан Қазақстан үшін халықаралық интеграция — <strong>мүмкіндіктер мен тәуекелдердің күрделі теңгерімі</strong>.</p>\n\n<p><strong>Интеграция дегеніміз не?</strong></p>\n<p>Қарапайым тілмен айтсақ, бұл — көршілес немесе мүдделес елдердің экономикалық шекараларын ашып, ортақ нарық, ортақ стандарттар мен ортақ ереже жасауы. Нәтижесінде тауарлар, адамдар, капитал мен технологиялар <strong>еркін қозғала алады</strong>.</p>\n\n<p><strong>1. Қазақстанның негізгі серіктес ұйымдары</strong></p>\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Халықаралық ұйым</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Құрылған жылы / ҚР мүшелігі</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Негізгі мақсаты</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Қазақстан үшін пайдасы</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">ЕАЭО (Еуразиялық экономикалық одақ)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">2015 жыл</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Тауар, қызмет, капитал және еңбек ресурстарының ортақ нарығын құру.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">180 миллионнан астам тұтынушысы бар үлкен нарыққа кедендік кедергісіз шығу.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">ШЫҰ (Шанхай ынтымақтастық ұйымы)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">2001 жыл</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қауіпсіздік пен экономикалық серіктестікті нығайту (Қытай, Ресей, Үндістанмен бірге).</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Аймақтық инфрақұрылымдық жобаларды дамыту және инвестиция тарту.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">ДСҰ (Дүниежүзілік сауда ұйымы)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">2015 жыл (ҚР мүшелігі)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Әлемдік сауда ережелерін стандарттау, тарифтерді төмендету.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қазақстандық тауарлардың әлемдік нарықтағы бәсекеге қабілеттілігін арттыру.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">ТМД (Тәуелсіз Мемлекеттер Достығы)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">1991 жыл</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Бұрынғы кеңестік елдер арасындағы тарихи экономикалық байланыстарды сақтау.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Еркін сауда аймағы арқылы жақын көршілермен жеңілдетілген сауда.</td></tr></tbody></table>\n\n<p><strong>2. Геоэкономикалық басымдықтар: «Бір белдеу – бір жол»</strong></p>\n<p>Қазақстанның геоэкономикалық стратегиясындағы ең ірі жобалардың бірі – Қытайдың «Бір белдеу – бір жол» бастамасына қатысуы. Бұл жоба аясында Қазақстан «құрлықтық тұйықтан» шығып, «<strong>құрлықтық көпірге</strong>» айналды:</p>\n<p>— <strong>Транзит әлеуеті:</strong> Қытайдан Еуропаға баратын жүктердің басым бөлігі біздің жеріміз арқылы өтеді.</p>\n<p>— <strong>Инфрақұрылым:</strong> «Нұрлы жол» бағдарламасы арқылы салынған автобандар мен теміржолдар («Батыс Қытай – Батыс Еуропа» дәлізі).</p>\n\n<p><strong>3. Интеграцияның артықшылықтары мен тәуекелдері</strong></p>\n<p><strong>Мүмкіндіктер:</strong></p>\n<p>1) <strong>Инвестициялар ағыны:</strong> Шетелдік компаниялар Қазақстанды тек шикізат көзі емес, үлкен нарықтарға шығатын «қақпа» ретінде қарастырады.</p>\n<p>2) <strong>Технологиялар трансферті:</strong> Халықаралық стандарттарға көшу арқылы отандық өндіріс жаңарады.</p>\n<p>3) <strong>Бәсекелестік:</strong> Нарыққа шетелдік тауарлардың келуі отандық өндірушілерді сапаны жақсартуға мәжбүрлейді.</p>\n<p><strong>Тәуекелдер:</strong></p>\n<p>1) <strong>Тәуелділік:</strong> Бір серіктес елдің экономикасындағы дағдарыс Қазақстанға тікелей әсер ете алады.</p>\n<p>2) <strong>Шағын бизнестің қысылуы:</strong> Трансұлттық корпорациялармен бәсекелесу жергілікті кәсіпкерлер үшін қиынға соғуы мүмкін.</p>\n<p>3) <strong>Экономикалық егемендік:</strong> Ұйым мүдделері мен ұлттық мүдде арасындағы теңгерімді сақтау.</p>\n\n<p><strong>4. Болашаққа көзқарас: Орталық Азия интеграциясы</strong></p>\n<p>Соңғы жылдары Қазақстан Орталық Азия елдерімен (Өзбекстан, Қырғызстан, Тәжікстан, Түркменстан) ішкі аймақтық интеграцияны нығайтуда. Ортақ инфрақұрылым, сауда дәліздері мен энергетикалық желілер аймақтың тұтастай күшеюіне жол ашады.</p>",
   tru:"<p><strong>10 тема: Сотрудничество с международными геоэкономическими интеграциями</strong></p>\n<p>Ни одно государство в современном мире не может развиваться в изоляции. Для Казахстана, расположенного в центре Евразии без прямого выхода к океану, международная интеграция — сложный баланс возможностей и рисков.</p>\n\n<p><strong>1. Основные партнёрские организации Казахстана</strong></p>\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Халықаралық ұйым</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Құрылған жылы / ҚР мүшелігі</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Негізгі мақсаты</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Қазақстан үшін пайдасы</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">ЕАЭО (Еуразиялық экономикалық одақ)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">2015 жыл</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Тауар, қызмет, капитал және еңбек ресурстарының ортақ нарығын құру.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">180 миллионнан астам тұтынушысы бар үлкен нарыққа кедендік кедергісіз шығу.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">ШЫҰ (Шанхай ынтымақтастық ұйымы)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">2001 жыл</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қауіпсіздік пен экономикалық серіктестікті нығайту (Қытай, Ресей, Үндістанмен бірге).</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Аймақтық инфрақұрылымдық жобаларды дамыту және инвестиция тарту.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">ДСҰ (Дүниежүзілік сауда ұйымы)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">2015 жыл (ҚР мүшелігі)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Әлемдік сауда ережелерін стандарттау, тарифтерді төмендету.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қазақстандық тауарлардың әлемдік нарықтағы бәсекеге қабілеттілігін арттыру.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">ТМД (Тәуелсіз Мемлекеттер Достығы)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">1991 жыл</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Бұрынғы кеңестік елдер арасындағы тарихи экономикалық байланыстарды сақтау.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Еркін сауда аймағы арқылы жақын көршілермен жеңілдетілген сауда.</td></tr></tbody></table>\n\n<p><strong>2. Геоэкономические приоритеты: «Один пояс — один путь»</strong></p>\n<p>В рамках этой инициативы Казахстан превратился из «сухопутного тупика» в «сухопутный мост»: транзит товаров из Китая в Европу проходит преимущественно через нашу территорию. Программа «Нұрлы жол» обеспечила строительство автобанов и железных дорог (коридор «Западный Китай – Западная Европа»).</p>\n\n<p><strong>3. Преимущества и риски интеграции</strong></p>\n<p><strong>Возможности:</strong> Приток инвестиций, трансфер технологий, конкурентное давление повышает качество отечественного производства.</p>\n<p><strong>Риски:</strong> Зависимость от кризисов в странах-партнёрах, давление на малый бизнес со стороны ТНК, компромисс между экономическим суверенитетом и интересами организации.</p>",
   qkk:"ЕАЭО (Еуразиялық экономикалық одақ) қай жылы құрылды?",
   opts:["A. 2001 жыл", "B. 2015 жыл", "C. 2010 жыл", "D. 2018 жыл"],
   openq:"Қазақстан үшін тек бір халықаралық ұйыммен шектелу неліктен тиімсіз? Көпвекторлы саясат тұрғысынан жауап беріңіз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:11,
   plan:{goal:"Мемлекеттік шекараға қатысты негізгі ұғымдарды (делимитация, демаркация, анклав, буферлік аймақ) ажырату және Қазақстанның шекаралық саясатын талдау.",steps:[{t:"Ұйымдастыру",min:"5 мин",d:"«Миға шабуыл»: Картадан ерекше шекараларды тауып, оның ерекшелігін болжау."}, {t:"Терминдермен жұмыс",min:"10 мин",d:"Жұптық талқылау: делимитация мен демаркацияны дипломатиялық сценарий арқылы ажырату."}, {t:"Топтық пікірталас",min:"15 мин",d:"1-топ: Қазақстанның Ресеймен шекарасы. 2-топ: Каспий мәселесі. 3-топ: Дүниедегі ең ерекше шекаралар."}, {t:"Қорытынды",min:"5 мин",d:"Шекараларды бейбіт жолмен шешудің маңызы. Қазақстанның үлгісі."}]},
   kk:"Шекара мәселесі және делимитация мен демаркация процестері",
   ru:"Пограничный вопрос: процессы делимитации и демаркации",
   tkk:"<p><strong>11 тақырып: Шекара мәселесі және делимитация мен демаркация процестері</strong></p>\n<p>Біз картаға қараған кезде түрлі-түсті мемлекеттерді бөліп тұрған сызықтарды көреміз. Бізге бұл сызықтар әуел бастан осылай болған сияқты. Бірақ шын мәнінде, олардың әрқайсысының артында <strong>ұзақ тарихи, дипломатиялық және кейде әскери процестер</strong> жатыр.</p>\n\n<p><strong>Шекараға қатысты негізгі терминдер</strong></p>\n<p>— <strong>Делимитация (Delimitation)</strong> — бұл «қағаздағы шекара». Көршілес мемлекеттердің үкіметтері келіссөздер жүргізіп, шекараның өтетін жолын картада анықтайды және арнайы халықаралық шарт жасасады.</p>\n<p>— <strong>Демаркация (Demarcation)</strong> — бұл «жердегі шекара». Делимитациядан кейін арнайы мамандар (топографтар, әскерилер) картадағы сызықты нақты жерде бекіндіреді — тіректер, заставалар, биіктер орнатады.</p>\n<p>— <strong>Анклав</strong> — бір мемлекеттің басқа бір мемлекеттің аумағымен толық қоршалған бөлігі (Мысалы: Оңтүстік Африка Республикасы ішіндегі Лесото).</p>\n<p>— <strong>Эксклав</strong> — елдің негізгі аумағынан бөлініп қалған, бірақ сол елге тиесілі жер (Мысалы: Ресейдің Еуропадағы Калининград облысы).</p>\n<p>— <strong>Буферлік аймақ</strong> — қақтығысты болдырмау үшін екі мемлекет арасындағы бейтарап, қарусыздандырылған аймақ (Мысалы: Корей демилитаризацияланған аймағы).</p>\n\n<p><strong>Қазақстан шекарасы туралы маңызды факт:</strong> Қазақстан тәуелсіздік алғаннан кейін өзінің барлық көршілерімен (Ресей, Қытай, Өзбекстан, Қырғызстан, Түркменстан) шекараларын бейбіт келіссөздер арқылы делимитациялап, демаркациялады. Бұл — елдің дипломатиялық жетістіктерінің бірі.</p>\n\n<p><strong>[()] Әлемнің ең қызықты шекаралары</strong></p>\n<p><strong>1. Ең шатасқан шекара: Барле-Хертог және Барле-Нассау (Бельгия мен Нидерланд)</strong></p>\n<p>Бұл екі елдің шекарасы кішкентай қалашықтың ішінен өтеді. Бір үйдің ас үйі Бельгияда, ал жатын бөлмесі Нидерландта болуы мүмкін. Шекараны бағана мен жер бетіндегі арнайы белгілер ғана танытады.</p>\n<p><strong>2. Уақыт машинасы: Диомид аралдары (АҚШ пен Ресей)</strong></p>\n<p>Беринг бұғазындағы бұл екі аралдың арасы небәрі 3,8 шақырым, бірақ олардың арасынан Халықаралық күн шекарасы өтеді. Яғни Үлкен Диомидтен (Ресей) Кіші Диомидке (АҚШ) жүзіп өтсеңіз, <strong>«ертеңнен кешеге»</strong> немесе керісінше өтесіз.</p>\n<p><strong>3. Ең биік шекара: Эверест шыңы (Қытай мен Непал)</strong></p>\n<p>Әлемдегі ең биік нүкте – Эверест тауының (8848 метр) шыңы арқылы Қытай мен Непалдың мемлекеттік шекарасы өтеді.</p>\n<p><strong>4. Табиғатқа берілген еркіндік: Корея демилитаризацияланған аймағы</strong></p>\n<p>Ені 4 шақырымдық, ұзындығы 250 шақырымдық бұл аймақ 70 жылдан астам уақыт бойы адам қолы тимеген — нәтижесінде сирек кездесетін жануарлар мен өсімдіктердің бірегей резерватына айналды.</p>\n\n<p><strong>Каспий теңізіндегі акваторияны бөлу мәселесі</strong> ұзақ уақыт бойы жағалаудағы елдер (Ресей, Қазақстан, Иран, Түрікменстан, Әзербайжан) арасында талқыланды. 2018 жылы <strong>Актау конвенциясы</strong> жасалып, Каспийдің «теңіз де, көл де емес» ерекше мәртебесі бекітілді.</p>",
   tru:"<p><strong>11 тема: Пограничный вопрос: процессы делимитации и демаркации</strong></p>\n<p>За каждой линией на карте стоят длительные исторические, дипломатические и порой военные процессы.</p>\n\n<p><strong>Основные термины</strong></p>\n<p>— <strong>Делимитация</strong> — «граница на бумаге»: правительства соседних государств договариваются и определяют линию границы на карте.</p>\n<p>— <strong>Демаркация</strong> — «граница на земле»: специалисты закрепляют картографическую линию физически — столбами, заставами, отметками.</p>\n<p>— <strong>Анклав</strong> — часть одного государства, полностью окружённая территорией другого (Лесото внутри ЮАР).</p>\n<p>— <strong>Эксклав</strong> — отделённая от основной территории часть государства (Калининградская область России).</p>\n<p>— <strong>Буферная зона</strong> — нейтральная демилитаризованная зона между двумя государствами (Корейская ДМЗ).</p>\n\n<p><strong>Факт о границах Казахстана:</strong> После обретения независимости Казахстан мирным путём делимитировал и демаркировал границы со всеми соседями (Россия, Китай, Узбекистан, Кыргызстан, Туркменистан) — это одно из дипломатических достижений страны.</p>\n\n<p><strong>Самые интересные границы мира</strong></p>\n<p><strong>Baarle-Hertog/Nassau:</strong> Граница между Бельгией и Нидерландами проходит прямо через дома — кухня в одной стране, спальня в другой.</p>\n<p><strong>Острова Диомида:</strong> Между двумя островами (3,8 км) проходит Линия перемены дат — «из завтра во вчера».</p>\n<p><strong>Эверест:</strong> Граница Китая и Непала проходит через высочайшую точку Земли (8848 м).</p>\n<p><strong>Корейская ДМЗ:</strong> За 70+ лет без людей стала уникальным заповедником редких животных.</p>\n<p><strong>Каспийская конвенция 2018 года</strong> в Актау закрепила особый статус Каспия — «ни море, ни озеро».</p>",
   qkk:"Делимитация дегеніміз не?",
   opts:["A. Шекараны картада келіссөз арқылы анықтау", "B. Шекараны жерде физикалық бекіту", "C. Шекараны жоюдың халықаралық процесі", "D. Шекара аймағындағы əскери операция"],
   openq:"Қазақстанның барлық көршілерімен шекараларын бейбіт жолмен делимитациялауы неліктен дипломатиялық жетістік болып саналады?",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:12,
   plan:{goal:"Миграция түрлерін ажырату, жаhандық миграция факторларын түсіндіру, Қазақстанның миграциялық рөлін талдау.",steps:[{t:"Қызығушылықты ояту",min:"5 мин",d:"«Неліктен адамдар қоныс аударады?» — Push-Pull моделін мысалдармен талдау."}, {t:"Жаңа білімді меңгеру",min:"15 мин",d:"Саяси vs экономикалық миграция. «Ақыл-ой бәсекесі» (brain drain/gain). Қазақстанның миграциялық бейнесі."}, {t:"Практикалық жұмыс",min:"15 мин",d:"«Миграция тарихы» сұхбаты. «Push-Pull» талдау презентациясы. «Мен – саясаткермін» пікірталас."}, {t:"Рефлексия",min:"5 мин",d:"«Миграция — мәселе ме, мүмкіндік пе?» — топтық шешім."}]},
   kk:"Саяси және экономикалық миграция",
   ru:"Политическая и экономическая миграция",
   tkk:"<p><strong>12 тақырып: Саяси және экономикалық миграция</strong></p>\n<p>XXI ғасыр – жаhандық ұтқырлық дәуірі. Адамдар ешқашан бұрын болмағандай жылдамдықпен бір елден екінші елге, бір қаладан екінші қалаға ауысуда. Бұл процесті біз <strong>миграция</strong> деп атаймыз.</p>\n\n<p><strong>1. Саяси және экономикалық миграция: Жаhандық қозғаушы күштер</strong></p>\n<p><strong>Саяси миграция</strong> көбіне мәжбүрлі сипатта болады. Оған соғыстар, мемлекетаралық қақтығыстар, саяси қуғын-сүргін жатады. Мысалы: Сирия соғысынан қашқан миллиондаған босқын немесе Ауғанстандағы талипан режимінен кеткен халық.</p>\n<p><strong>Экономикалық миграция</strong> — бұл саналы таңдау мен нарықтық сұраныстың нәтижесі. Мұндағы басты ұғым — <strong>«Push-Pull»</strong> (Итеру-Тарту) моделі:</p>\n<p>— <strong>«Итеруші» факторлар (Push):</strong> Жұмыссыздық, төмен жалақы, болашақтың жоқтығы, тұрмыс жағдайының нашарлығы.</p>\n<p>— <strong>«Тартушы» факторлар (Pull):</strong> Жоғары жалақы, жақсы білім мен денсаулық сақтау жүйесі, саяси тұрақтылық, мансаптық перспективалар.</p>\n\n<p><strong>2. Жаhандық трендтер: «Ақыл-ой бәсекесі»</strong></p>\n<p>Қазіргі әлемде мемлекеттер арасындағы басты бәсеке табиғи ресурстар үшін емес, <strong>адам капиталы</strong> үшін жүріп жатыр. Дамыған елдер (АҚШ, Германия, Канада, Австралия) жоғары білікті мамандарды тарту үшін арнайы иммиграциялық бағдарламалар жасайды. Ал дамушы елдер осы «ақыл-ой жылыстауынан» (brain drain) зардап шегеді.</p>\n\n<p><strong>3. Еуразияның геосаяси орталығы: Қазақстанның миграциялық бейнесі</strong></p>\n<p><strong>Орталық Азияның «Магниті»</strong></p>\n<p>Қазақстан — Орталық Азия елдерінен (Өзбекстан, Қырғызстан, Тәжікстан) келетін еңбек мигранттары үшін басты бағыт. Ресейден кейінгі аймақтағы <strong>екінші ірі реципиент-мемлекет</strong>.</p>\n\n<p><strong>Этникалық репатриация: Қандастар саясаты</strong></p>\n<p>Тәуелсіздік алған жылдардан бері <strong>1 миллионнан астам этникалық қазақ</strong> тарихи отанына оралды. Бұл – Қазақстанның демографиялық тұрақтылығына сеп болған стратегиялық саясат.</p>\n\n<p><strong>Заманауи релокация және «Цифрлық көшпенділер»</strong></p>\n<p>Соңғы жылдары Қазақстанға Ресей мен Беларусьтен мыңдаған білікті маман келді. Бұл «<strong>цифрлық көшпенділер</strong>» елімізде IT-сектор мен стартап экожүйесін дамытуға үлес қосуда.</p>\n\n<p><strong>4. Ішкі миграция және урбанизация</strong></p>\n<p>— Қала халқының үлесі <strong>60%-дан</strong> асты.</p>\n<p>— Сын-қатер: Ауылдық аймақтардың босап қалуы және қалалардағы инфрақұрылымдық салмақтың артуы.</p>\n<p>— Геосаяси әсер: Солтүстік және шығыс шекара маңындағы аудандарда халық санының кемуі — стратегиялық мәселе.</p>\n\n<p><strong>5. Болашаққа көзқарас: Миграциялық стратегия</strong></p>\n<p>1) <strong>Технологиялық трансфер:</strong> Білікті шетелдік мамандар арқылы жаңа дағдыларды игеру.</p>\n<p>2) <strong>Инвестициялық тартымдылық:</strong> Кәсіпкер мигранттар үшін қолайлы орта жасау.</p>\n<p>3) <strong>Гуманитарлық имидж:</strong> Халықаралық аренада тұрақты және ашық мемлекет ретінде танылу.</p>\n<p><em>Миграция – бұл мәселе емес, бұл – дұрыс басқаруды қажет ететін жаhандық мүмкіндік.</em></p>",
   tru:"<p><strong>12 тема: Политическая и экономическая миграция</strong></p>\n<p>XXI век — эпоха глобальной мобильности. Миграция — не просто перемещение людей, это геополитический процесс, меняющий облик государств и регионов.</p>\n\n<p><strong>1. Политическая и экономическая миграция</strong></p>\n<p><strong>Политическая миграция</strong> носит преимущественно вынужденный характер: войны, конфликты, политические преследования. Пример: миллионы беженцев из Сирии, Афганистана.</p>\n<p><strong>Экономическая миграция</strong> — осознанный выбор, модель <strong>«Push-Pull»</strong>:</p>\n<p>— <em>«Выталкивающие» факторы (Push):</em> безработица, низкие зарплаты, отсутствие перспектив.</p>\n<p>— <em>«Притягивающие» факторы (Pull):</em> высокие зарплаты, качественное образование, политическая стабильность.</p>\n\n<p><strong>2. Глобальный тренд: «Конкуренция за умы»</strong></p>\n<p>Развитые страны (США, Германия, Канада) создают специальные программы для привлечения высококвалифицированных специалистов. Развивающиеся страны страдают от «утечки мозгов» (brain drain).</p>\n\n<p><strong>3. Казахстан: Миграционный портрет</strong></p>\n<p>— <strong>«Магнит» Центральной Азии:</strong> Казахстан — второй крупнейший реципиент в регионе после России.</p>\n<p>— <strong>Репатриация казахов:</strong> Более 1 млн этнических казахов вернулись на историческую родину.</p>\n<p>— <strong>Цифровые кочевники:</strong> Тысячи квалифицированных специалистов из России и Беларуси развивают IT-сектор и стартап-экосистему.</p>\n\n<p><strong>4. Внутренняя миграция и урбанизация</strong></p>\n<p>Доля городского населения превысила 60%. Угроза: обезлюдение сельских районов у стратегически важных северных и восточных границ.</p>\n\n<p><strong>5. Стратегия будущего:</strong> Технологический трансфер через квалифицированных мигрантов, инвестиционная привлекательность, гуманитарный имидж.</p>",
   qkk:"«Push-Pull» (Итеру-Тарту) моделіндегі «Итеруші» фактор мысалы қайсысы?",
   opts:["A. Жоғары жалақы мен жақсы тұрмыс", "B. Саяси тұрақтылық", "C. Жұмыссыздық пен болашақтың жоқтығы", "D. Жоғары деңгейдегі медицина"],
   openq:"«Ақыл-ойдың жылыстауы» (Brain drain) Қазақстан үшін қандай геосаяси қауіп төндіреді? Мысал келтіре отырып жазыңыз.",
   mapq:'',mapDots:[],mapOpts:[]}
,
  {id:13,
   plan:{goal:"Саяси картаның қалыптасу кезеңдері мен мемлекеттердің жіктелуін түсіну, мемлекеттер арасындағы саяси және экономикалық байланыстарды талдау.",steps:[{t:"Ұйымдастыру",min:"5-7 мин",d:"«Миға шабуыл»: «Саяси карта ненің нәтижесі?» — тарихи оқиғалармен байланыстыру."}, {t:"Топтық талдау",min:"25-30 мин",d:"1-топ: Мемлекеттердің жіктелуі мен басқару формалары. 2-топ: Халықаралық экономикалық байланыстар мен дипломатия. 3-топ: Қазақстанның геосаясаты мен ХХІ ғасырдағы жаңа үрдістер."}, {t:"Рефлексия",min:"5-8 мин",d:"«Алыстағы елде болған оқиға Қазақстанға қалай әсер етеді?» — жаhандану байланыстарын талдау."}, {t:"Қорытынды",min:"3-5 мин",d:"«Екі жұлдыз, бір тілек» — кері байланыс."}]},
   kk:"Әлемнің саяси картасы және мемлекеттердің өзара байланысы",
   ru:"Политическая карта мира и взаимосвязи государств",
   tkk:"<p><strong>13 тақырып: Әлемнің саяси картасы және мемлекеттердің өзара байланысы</strong></p>\n<p>Әлемнің саяси картасы — бұл тек географиялық шекаралардың жиынтығы емес, адамзат тарихының, соғыстар мен келісімдердің, экономикалық мүдделер мен ұлттық ерік-жігердің нәтижесі. Бүгінде Жер шарында <strong>193 БҰҰ мүшесі</strong> мемлекет бар және олар бір-бірінен өте ерекшеленеді:</p>\n<p>— <strong>Жер көлемі бойынша:</strong> Ресей, Канада, Қытай, АҚШ, Бразилия, Австралия сияқты алыптар болса, Ватикан немесе Монако сияқты кішкентай мемлекеттер де бар.</p>\n<p>— <strong>Орналасу орны бойынша:</strong> Теңізге шығатын жолы жоқ елдер (landlocked) — мысалы, Қазақстан мұндай елдердің ішіндегі ең үлкені.</p>\n\n<p><strong>1. Саяси картаның қалыптасу кезеңдері</strong></p>\n<p>Әлем картасы бір күнде пайда болған жоқ. Ол бірнеше ірі тарихи кезеңді бастан өткерді:</p>\n<p>— <strong>Ежелгі және орта ғасырлар:</strong> Империялардың пайда болуы мен құлауы (Рим, Моңғол империялары).</p>\n<p>— <strong>Жаңа кезең:</strong> Ұлы географиялық ашылулар мен колониялық жүйенің орнауы.</p>\n<p>— <strong>Қазіргі кезең:</strong> Екі дүниежүзілік соғыстан кейінгі өзгерістер, КСРО-ның ыдырауы және жаңа тәуелсіз мемлекеттердің (соның ішінде Қазақстанның) пайда болуы.</p>\n<p>Саяси картаның ең басты ерекшелігі — оның <strong>динамикалылығы</strong>, яғни үнемі өзгерісте болуы:</p>\n<p>— <strong>Сандық өзгерістер:</strong> Мемлекет аумағының соғыс немесе келісім арқылы ұлғаюы немесе кішіреюі, жаңа елдердің пайда болуы немесе жойылуы.</p>\n<p>— <strong>Сапалық өзгерістер:</strong> Аумақ өзгермегенмен, елдің ішкі мазмұнының өзгеруі — мемлекеттің басқару формасының ауысуы, экономикалық жүйенің өзгеруі.</p>\n\n<p><strong>2. Мемлекеттердің жіктелуі</strong></p>\n<p>— <strong>Басқару формасы бойынша:</strong> Республикалар (халық сайлайтын билік) және монархиялар (билік мұрагерлікпен беріледі). Монархиялардың өзі конституциялық (Ұлыбритания, Жапония) және абсолютті (Сауд Арабиясы) болып екіге бөлінеді.</p>\n<p>— <strong>Мемлекеттік құрылымы бойынша:</strong> Унитарлы (орталықтан басқарылатын біртұтас мемлекет) және федерациялы (өзіндік заңдары бар субъектілерден тұратын мемлекет — АҚШ, Германия, Ресей, Қазақстан).</p>\n<p>— <strong>Экономикалық деңгейі бойынша:</strong> Дамыған елдер («Үлкен жетілік» – G7) және дамушы елдер.</p>\n\n<p><strong>3. Мемлекеттердің өзара байланыс формалары</strong></p>\n<p>Қазіргі жаhандану заманында бірде-бір мемлекет оқшауланып өмір сүре алмайды:</p>\n<p><strong>Дипломатиялық және саяси қатынастар:</strong> Мемлекеттер арасындағы ресми байланыстың негізі — дипломатия. Елшіліктер ашу, келіссөздер жүргізу, халықаралық шарттар жасасу.</p>\n<p>— <strong>БҰҰ:</strong> Жаhандық бейбітшілік пен қауіпсіздіктің басты кепілі.</p>\n<p>— <strong>НАТО:</strong> Әскери-саяси одақтың мысалы.</p>\n<p>— <strong>ШЫҰ, ЕАЭО:</strong> Өңірлік ынтымақтастық ұйымдары.</p>\n<p><strong>Экономикалық интеграция:</strong> Мемлекеттер тауар, капитал және жұмыс күшімен алмасады — «халықаралық еңбек бөлінісі». Бір ел мұнай шығарса, екіншісі жоғары технология өндіреді.</p>\n\n<p><strong>4. Қазіргі геосаяси жағдай және Қазақстан</strong></p>\n<p>Бүгінгі саяси картада «күш орталықтары» арасындағы бәсекелестік айқын көрінеді — АҚШ, Қытай, ЕО, Ресей. Қазақстан <strong>Еуразияның қақ ортасында</strong> орналасқандықтан, «<strong>көпвекторлы сыртқы саясат</strong>» ұстанымын қолданады — бірде-бір алыппен ашық қақтығысқа бармай, барлығымен теңгерімді ынтымақтастық орнату.</p>\n\n<p><strong>5. Саяси картадағы жаңа үрдістер мен мәселелер</strong></p>\n<p>ХХІ ғасырда саяси карта тек құрлықтағы шекаралармен шектелмейді:</p>\n<p>1) <strong>Территориялық даулар:</strong> Кашмир, Оңтүстік Қытай теңізі, Куриль аралдары.</p>\n<p>2) <strong>Виртуалды кеңістік:</strong> Саяси әсер ету тек әскермен емес, ақпараттық технологиялар арқылы да жүреді — кибершабуылдар мен ақпараттық соғыстар.</p>\n<p>3) <strong>Табиғи ресурстар үшін күрес:</strong> Су, құнарлы жер және энергия көздері мемлекеттер арасындағы қатынастың басты факторына айналуда.</p>\n<p><em>Саяси карта – бұл тұрақты сурет емес, ол адамзаттың дамуымен бірге өзгеріп отыратын «тірі организм».</em></p>",
   tru:"<p><strong>13 тема: Политическая карта мира и взаимосвязи государств</strong></p>\n<p>Политическая карта мира — это не просто совокупность географических границ, а результат истории человечества, войн и договоров, экономических интересов и национальной воли. Сегодня на Земле насчитывается <strong>193 государства-члена ООН</strong>.</p>\n\n<p><strong>1. Этапы формирования политической карты</strong></p>\n<p>— <strong>Древний период и Средние века:</strong> Появление и падение империй (Римская, Монгольская).</p>\n<p>— <strong>Новое время:</strong> Великие географические открытия и колониальная система.</p>\n<p>— <strong>Современный период:</strong> Изменения после двух мировых войн, распад СССР и появление новых независимых государств (в том числе Казахстана).</p>\n<p>Главная черта политической карты — её <strong>динамичность</strong>:</p>\n<p>— <strong>Количественные изменения:</strong> Расширение или сокращение территорий, появление новых или исчезновение старых государств.</p>\n<p>— <strong>Качественные изменения:</strong> Смена формы правления, изменение экономической системы при неизменной территории.</p>\n\n<p><strong>2. Классификация государств</strong></p>\n<p>— <strong>По форме правления:</strong> Республики и монархии (конституционные — Великобритания, Япония; абсолютные — Саудовская Аравия).</p>\n<p>— <strong>По государственному устройству:</strong> Унитарные и федеративные (США, Германия, Россия, Казахстан).</p>\n<p>— <strong>По уровню экономического развития:</strong> Развитые страны (G7) и развивающиеся страны.</p>\n\n<p><strong>3. Формы взаимосвязей государств</strong></p>\n<p>ООН — главный гарант мира и безопасности. НАТО — военно-политический союз. ШОС, ЕАЭС — организации регионального сотрудничества. Международное разделение труда: одна страна добывает нефть, другая производит высокие технологии.</p>\n\n<p><strong>4. Современная геополитическая ситуация и Казахстан</strong></p>\n<p>Казахстан проводит <strong>многовекторную внешнюю политику</strong> — сотрудничество со всеми крупными игроками (США, Китай, ЕС, Россия) без открытой конфронтации.</p>\n\n<p><strong>5. Новые тенденции и проблемы</strong></p>\n<p>1) Территориальные споры (Кашмир, Южно-Китайское море, Курилы). 2) Виртуальное пространство: кибератаки и информационные войны. 3) Борьба за природные ресурсы — вода, земля, энергоносители.</p>",
   qkk:"Саяси картадағы «сапалық өзгеріс» дегеніміз не?",
   opts:["A. Жаңа мемлекеттің пайда болуы", "B. Елдің аумағының ұлғаюы", "C. Аумақ өзгермей, елдің басқару формасының немесе экономикалық жүйесінің ауысуы", "D. Мемлекеттің ыдырап бірнеше елге бөлінуі"],
   openq:"Қазақстанның «көпвекторлы сыртқы саясаты» нені білдіреді? Неліктен бұл ірі геосаяси ойыншылардың ортасында орналасқан мемлекет үшін тиімді?",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:14,
   plan:{goal:"Азия мен Африка елдеріндегі аумақтық даулардың тарихи (отаршылдық) себептерін талдау және олардың қазіргі жаһандық геосаясатқа тигізетін әсерін бағалау.",steps:[{t:"Кіріспе",min:"5-7 мин",d:"«Миға шабуыл»: Тақтаға Солтүстік және Батыс Африканың саяси картасын шығарып, оқушыларға сұрақ қояды: «Неліктен бұл елдердің шекаралары сызғышпен сызғандай түп-түзу?»"},{t:"Негізгі бөлім: Теория",min:"10 мин",d:"1884-1885 жж. Берлин конференциясы және «Африканы бөліске салу» процесін түсіндіреді. «Суперпозициялық шекаралар» терминіне анықтама береді."},{t:"Практика 1: Картамен жұмыс",min:"12 мин",d:"«Отаршылдардың ізімен» тапсырмасы: Рэдклифф сызығы, Дюранд сызығы, Сайкс-Пико келісімін картада белгілеу."},{t:"Практика 2: Сыни ойлау",min:"10 мин",d:"«Бөлшекте де, билей бер» талдауы: Топтық жұмыс — жасанды шекаралардың зардаптарын талқылау."},{t:"Қорытынды",min:"5-6 мин",d:"Тақырыпты түйіндеп, тест жұмысын жүргізеді."}]},
   kk:"Азия мен Африка елдеріндегі тәуелсіздік жолындағы шекаралық даулар",
   ru:"Пограничные споры в странах Азии и Африки на пути к независимости",
   tkk:"<p><strong>14 тақырып: Азия мен Африка елдеріндегі тәуелсіздік жолындағы шекаралық даулар</strong></p><p><em>Отаршылдық мұрасы және картадағы «түзу сызықтар» құпиясы</em></p><p>Қазіргі заманғы жаһандық саяси карта – бұл жай ғана түрлі-түсті мемлекеттердің жиынтығы емес. ХХ ғасырдың ортасында Азия мен Африка құрлықтарындағы ондаған мемлекеттер ұлт-азаттық қозғалыстардың арқасында отаршылдық бұғауынан босап, өз тәуелсіздігіне қол жеткізді. Алайда, бұл жас мемлекеттерге бұрынғы отаршыл империялардан өте ауыр геосаяси мұра – шешімін таппаған шекаралық даулар мен тұрақты қақтығыстар қалды.</p><p><strong>Африка картасындағы геометрия: Шекаралар неліктен түзу сызылған?</strong></p><p>Егер сіз Африка құрлығының саяси картасына мұқият назар аударсаңыз, бір ерекше заңдылықты бірден байқайсыз: көптеген Африка мемлекеттерінің шекаралары кәдімгі сызғышпен сызып қойғандай мінсіз, түп-түзу геометриялық сызықтардан тұрады. Бұл сұрақтың жауабы 1884-1885 жылдары өткен әйгілі <strong>Берлин конференциясында</strong> жатыр.</p><p>Германия канцлері Отто фон Бисмарктің бастамасымен шақырылған бұл тарихи жиын «<strong>Африканы бөліске салу</strong>» (Scramble for Africa) деген атпен белгілі процесті ресми түрде заңдастырды. Еуропалық дипломаттар кабинетте отырып, мыңдаған жылдар бойы қалыптасқан тайпалар мен этностардың тарихи қоныстарын, мәдени, діни және тілдік шекараларын толығымен елеусіз қалдырды. Саяси географияда мұндай шекараларды <strong>«суперпозициялық»</strong> немесе «сырттан таңылған шекаралар» деп атайды.</p><p>Бұл жасанды «түзу сызықтардың» салдары Африка халықтары үшін өте апатты болды: бір жағынан, біртұтас халықтар мен тайпаларды (сомалиліктер, масаилар, туарегтер) екі немесе одан да көп мемлекетке бөліп жіберді; екінші жағынан, ғасырлар бойы жауласып келген тайпаларды бір мемлекеттің ішіне күштеп біріктірді.</p><p><strong>Тәуелсіздік және аумақтық қайшылықтар</strong></p><p>1960 жылдары – «Африка жылы» деген кезеңде, 1964 жылы Африка Бірлігі Ұйымы отаршылдар сызып берген бұрынғы шекараларды өзгеріссіз қалдыруға келісті (<em>uti possidetis</em> принципі). Дегенмен, Эфиопия мен Эритрея арасындағы соғыс, Судан мен Оңтүстік Суданның бөлінуі – барлығы осы жасанды шекаралардың кесірінен туындаған.</p><p><strong>Азиядағы отаршылдық шекаралардың зардабы</strong></p><p>1947 жылы Британ Үндістаны тәуелсіздік алғанда, ағылшын заңгері Сирил Рэдклифф басқарған комиссия шекара сызығын (<strong>Рэдклифф сызығын</strong>) картада өте асығыс жүргізді. Бұл миллиондаған адамның босқын атануына және бүгінгі күнге дейін шешілмеген <strong>Кашмир дауына</strong> алып келді. Таяу Шығыстағы <strong>Сайкс-Пико келісімі</strong> (1916 ж.) бүгінгі Араб әлемінің шекараларын жасанды түрде қалыптастырды және миллиондаған курд халқының төрт мемлекетке (Түркия, Иран, Ирак, Сирия) бөлшектенуінің басты себебі болды.</p>",
   tru:"<p><strong>14 тема: Пограничные споры в странах Азии и Африки</strong></p><p>Большинство государственных границ Азии и Африки было проведено колониальными державами без учёта интересов местного населения. На Берлинской конференции 1884–1885 годов европейские державы разделили Африку между собой, игнорируя этнические, культурные и религиозные границы. Такие границы называются <strong>суперпозиционными</strong>. В Азии «линия Рэдклиффа» разделила Британскую Индию на Индию и Пакистан в 1947 году, породив Кашмирский конфликт. Соглашение Сайкс–Пико (1916) определило границы современного арабского мира, оставив курдский народ разделённым между четырьмя государствами.</p>",
   qkk:"Африканы бөліске салуды ресми түрде заңдастырған 1884-1885 жылдардағы тарихи жиын қай қалада өтті?",
   opts:["A. Лондон","B. Париж","C. Берлин","D. Рим"],
   openq:"Отаршылдық дәуірінде сызылған «суперпозициялық шекаралар» Африка мен Азия халықтарына қандай зардаптар әкелді? 3 мысал келтіріңіз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:15,
   plan:{goal:"Анклав және эксклав терминдерінің мағынасын түсіну, дүниежүзілік картадан негізгі анклав-мемлекеттер мен эксклавтарды тауып үйрену, Орталық Азиядағы шекаралық жағдайларды талдау.",steps:[{t:"Қызығушылықты ояту",min:"5 мин",d:"«Көршінің бақшасы» әдісі: Егер сіздің аулаңызда көршіңіздің кішкентай бақшасы болса, ол кім үшін не болады?"},{t:"Мағынаны тану",min:"15 мин",d:"Мемлекет-анклавтар (Лесото, Ватикан, Сан-Марино) және танымал эксклавтар (Калининград, Аляска) туралы ақпарат беру."},{t:"Ой толғаныс",min:"15 мин",d:"«Географиялық парадокстар» бөлімі: Барле мен Куч-Бихар мысалдарын талқылау."},{t:"Қорытынды",min:"5 мин",d:"Анклавтардың пайда болу себептері мен негізгі мәселелерін (транзит, ресурс) жинақтау."}]},
   kk:"Анклавтар мен эксклавтар туралы көрнекі мысалдар",
   ru:"Наглядные примеры анклавов и эксклавов",
   tkk:"<p><strong>15 тақырып: Анклавтар мен эксклавтар туралы көрнекі мысалдар</strong></p><p><em>Географиялық «аралдар» мен саяси лабиринттер</em></p><p>Кейде саяси картада логикаға бағынбайтындай көрінетін, бір мемлекеттің ішінде орналасқан басқа елдің бөліктері немесе өз елінен жырақ қалған «аралдар» кездеседі. Мұндай аумақтарды географияда <strong>анклавтар</strong> және <strong>эксклавтар</strong> деп атайды.</p><p><strong>1. Терминологиялық анықтама: Айырмашылығы неде?</strong></p><p>— <strong>Анклав</strong> (французша <em>enclaver</em> — «қоршауға алу») — бір мемлекеттің аумағымен жан-жағынан толық қоршалған басқа мемлекеттің бөлігі немесе тұтас мемлекет.</p><p>— <strong>Эксклав</strong> (латынша <em>ex</em> + <em>clavis</em>) — негізгі мемлекеттен басқа мемлекеттердің аумағымен бөлінген ерекше аймақ.</p><p><strong>Қарапайым тілмен:</strong> Егер сіз өз үйіңіздің ауласында көршіңіздің кішкентай бақшасы бар екенін көрсеңіз, ол сіз үшін — <strong>анклав</strong>. Ал көршіңіз үшін өз үйінен бөлек жатқан сол бақша — <strong>эксклав</strong>.</p><p><strong>2. Мемлекет-анклавтар: Ел ішіндегі елдер</strong></p><p>Әлемде бар болғаны үш мемлекет толықтай басқа бір елдің ішінде орналасқан:</p><p><strong>1) Лесото Корольдігі:</strong> ОАР-дың ішінде орналасқан — әлемдегі ең үлкен анклав-мемлекет, «аспан патшалығы» деп аталады.</p><p><strong>2) Ватикан:</strong> Рим қаласының қақ ортасындағы ергежейлі мемлекет — әлемдегі ең кішкентай тәуелсіз мемлекет.</p><p><strong>3) Сан-Марино:</strong> Италия аумағымен қоршалған Еуропадағы ең көне республикалардың бірі.</p><p><strong>3. Әлемнің ең танымал эксклавтары</strong></p><p>— <strong>Калининград облысы (Ресей):</strong> Польша мен Литва арқылы бөлінген жартылай эксклав. Ресейдің Балтық флоты орналасқан стратегиялық аймақ.</p><p>— <strong>Нахчыван (Әзірбайжан):</strong> Армения аумағы арқылы бөлінген, Түркия мен Иранмен шекарасы бар.</p><p>— <strong>Аляска (АҚШ):</strong> Канада арқылы бөлінген АҚШ-тың ең үлкен штаты.</p><p><strong>4. Орталық Азиядағы жағдай: Ферғана жазығының «жұмбағы»</strong></p><p>Кеңес Одағы ыдырағаннан кейін Орталық Азия елдерінің шекараларында көптеген анклавтар пайда болды. Қырғызстан аумағында Өзбекстанға тиесілі <strong>Сох, Шахимардан, Чон-Гара</strong> және <strong>Жангайл</strong> атты анклавтар бар. Тәжікстанның <strong>Ворух</strong> анклавы да Қырғызстан ішінде орналасқан.</p><p><strong>5. Ең қызықты мысал: Барле (Бельгия мен Нидерланды)</strong></p><p>Бұл жерде шекара сызығы үйлердің, мейрамханалардың, тіпті дүкендердің қақ ортасынан өтеді. Егер шекара үйдің ортасынан өтсе, адамның қай елде тұратыны оның <strong>кіреберіс есігі</strong> қай елде орналасқанына байланысты анықталады!</p>",
   tru:"<p><strong>15 тема: Анклавы и эксклавы — наглядные примеры</strong></p><p><strong>Анклав</strong> — территория одного государства, полностью окружённая территорией другого. <strong>Эксклав</strong> — часть государства, отделённая от основной территории. Три государства-анклава: Лесото (внутри ЮАР), Ватикан и Сан-Марино (внутри Италии). Известные эксклавы: Калининград (Россия), Нахчыван (Азербайджан), Аляска (США). В Ферганской долине Центральной Азии после распада СССР образовалось множество анклавов: Сох, Шахимардан, Ворух.</p>",
   qkk:"Анклав пен эксклав терминдерінің мағыналық айырмашылығын ең дәл сипаттайтын нұсқаны көрсетіңіз:",
   opts:["A. Анклав – басқа мемлекеттің аумағымен жан-жағынан толық қоршалған бөлік, ал эксклав — негізгі жерінен бөлек жатқан аймақ","B. Анклав – теңізге шығар жолы бар аймақ, ал эксклав — тек құрлықпен қоршалған аумақ","C. Анклав – тұтас тәуелсіз мемлекет, ал эксклав — мемлекеттің әкімшілік бірлігі","D. Анклав – тарихи себептермен пайда болған жер, ал эксклав — тек соғыс нәтижесінде қалыптасқан аймақ"],
   openq:"Анклавтар мен эксклавтарда тұратын халық үшін ең үлкен 3 мәселені атап, оларды шешудің жолын ұсыныңіз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:16,
   plan:{goal:"Қазіргі геосаясаттағы негізгі күш орталықтарын анықтау және көпполярлы әлем жүйесінің ерекшеліктерін талдау.",steps:[{t:"Ұйымдастыру",min:"3 мин",d:"Оқушылармен амандасу. Сабақтың мақсаты мен бағалау критерийлерін таныстыру."},{t:"Қызығушылықты ояту",min:"5 мин",d:"«Ассоциация» әдісі. Тақтаға «Көпполярлы әлем» сөзін жазып, оқушылардан осы ұғыммен қандай мемлекеттер байланысты екенін сұрайды."},{t:"Мағынаны тану",min:"7 мин",d:"«Джигсо» әдісі: Оқушыларды топтарға бөліп, әр топқа бір күш орталығының (АҚШ, Қытай, ЕО және т.б.) сипаттамасын беріп, «жұмсақ» немесе «қатаң» күшін түсіндіруге бағыттайды."},{t:"Тәжірибе",min:"10 мин",d:"Геосаяси картамен жұмыс: 5 негізгі күш орталығын белгілеу және БРИКС елдерін картада көрсету."},{t:"Зерттеу",min:"10 мин",d:"А деңгейі: Венн диаграммасы. В деңгейі: SWOT талдау. С деңгейі: Позициялық аргументтер."},{t:"Қорытынды",min:"5 мин",d:"Тест және «3-2-1» рефлексиясы."}]},
   kk:"Көпполярлы әлем және қазіргі негізгі күш орталықтары",
   ru:"Многополярный мир и основные центры силы",
   tkk:"<p><strong>16 тақырып: Көпполярлы әлем және қазіргі негізгі күш орталықтары</strong></p><p><em>Әлемдік жүйенің эволюциясы:</em> ХХ ғасырдың екінші жартысында Қырғи-қабақ соғыс жылдарында әлем АҚШ пен КСРО бастаған екі лагерьге бөлініп, <strong>биполярлы (екіполярлы)</strong> жүйе орнады. 1991 жылы Кеңес Одағы ыдырағаннан кейін АҚШ жалғыз супердержава ретінде қалып, әлем <strong>бірполярлы</strong> сипатқа ие болды. Бүгінгі таңда біз биліктің бірнеше орталыққа шоғырланған <strong>көпполярлы әлем</strong> жүйесінің қалыптасуына куә болып отырмыз.</p><p><strong>Қазіргі геосаясаттағы негізгі күш орталықтары</strong></p><p><strong>1. АҚШ: Жетекші, бірақ жалғыз емес держава</strong><br>АҚШ — әлемдегі ең ірі экономикаға және ең қуатты әскери күшке ие мемлекет. Оның «жұмсақ күші» — Голливуд, поп-мәдениет және университеттері арқылы басқа елдерге тигізетін мәдени ықпалы орасан зор.</p><p><strong>2. Қытай ХР: Ғаламдық экономикалық локомотив</strong><br>Қытай ІЖӨ бойынша әлемдегі екінші орында. «<strong>Бір белдеу, бір жол</strong>» бастамасы — Азия, Африка және Еуропа елдерін инфрақұрылымдық жобалар арқылы біріктіру жобасы.</p><p><strong>3. Еуропалық Одақ: «Жұмсақ күш» орталығы</strong><br>ЕО — 27 мемлекетті біріктіретін бірегей экономикалық және саяси интеграциялық ұйым. Оның басты күші құқықтық нормалар, демократиялық құндылықтар, экологиялық стандарттар арқылы әлемдік саясатқа ықпал етуінде.</p><p><strong>4. Ресей: Әскери-стратегиялық полюс</strong><br>Ресейдің ауқымды ядролық арсеналы, БҰҰ Қауіпсіздік Кеңесіндегі вето құқығы және зор энергетикалық ресурстары (мұнай мен газ) оны жаһандық ойыншы ретінде сақтайды.</p><p><strong>5. Үндістан және БРИКС</strong><br>Үндістан — АҚШ-пен де, Ресеймен де тиімді қарым-қатынас жасай отырып, стратегиялық автономиясын сақтайтын ел. <strong>БРИКС</strong> ұйымы батыстық қаржы институттарына тәуелділікті азайту мақсатында жаңа қаржылық құрылымдар жасақтауда.</p>",
   tru:"<p><strong>16 тема: Многополярный мир и основные центры силы</strong></p><p>После распада СССР в 1991 году мир временно стал <strong>однополярным</strong> с доминированием США. Сегодня формируется <strong>многополярный мир</strong>, где несколько крупных держав имеют равное влияние: США (военная и финансовая мощь), Китай (экономический рост, инициатива «Пояс и путь»), ЕС («мягкая сила», нормативное влияние), Россия (ядерный арсенал, энергоресурсы), Индия (демография, IT-индустрия). БРИКС объединяет страны «Глобального Юга» для снижения зависимости от западных финансовых институтов.</p>",
   qkk:"Қазіргі геосаясаттағы көпполярлы жүйенің ең басты және дәл сипатын анықтаңыз:",
   opts:["A. Бірнеше ірі мемлекеттердің күш-қуатының теңесуі нәтижесінде халықаралық шешімдердің консенсус пен икемді одақтар арқылы қабылдануы","B. Екі стратегиялық блоктың әлемдік ресурстарды өзара қатаң бөлісуі және ядролық тежеу арқылы қақтығыстарды болдырмауы","C. ЕО, БРИКС сияқты ұйымдар билігінің ұлттық мемлекеттерден үстем түсіп, бірыңғай жаһандық басқару жүйесіне көшуі","D. «Жаһандық Оңтүстік» елдерінің бірігіп, АҚШ пен Еуропаның экономикалық гегемониясын толықтай ығыстыруы"],
   openq:"Көпполярлы әлем жағдайында Қазақстан сияқты орташа мемлекет қандай сыртқы саяси стратегия ұстануы тиімді және неліктен?",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:17,
   plan:{goal:"Ақпараттық кеңістіктің жаңа геосаяси полигон ретіндегі рөлін талдау, кибертерроризм мен ақпараттық насихаттың қауіптерін саралап, жеке тұлғаның ақпараттық қауіпсіздік мәдениетін қалыптастыру.",steps:[{t:"Қызығушылықты ояту",min:"5 мин",d:"«Геосаяси өзгеріс» талқылауы: Дәстүрлі геосаясат (Хартленд/Римленд) пен қазіргі киберкеңістіктің айырмашылығы туралы сұрақ қояды."},{t:"Мағынаны тану",min:"15 мин",d:"«Джигсо» әдісі: Мәтінді 3 блокқа бөліп: 1. Кибертерроризм. 2. Ақпараттық насихат. 3. Виртуалды рекрутинг."},{t:"Талдау және Салыстыру",min:"10 мин",d:"«Венн диаграммасы»: Кибертерроризм мен дәстүрлі терроризмді салыстыру."},{t:"Проблемалық жағдаят",min:"7 мин",d:"Кейс-стади: «Егер бір елдің серверіне басқа елдегі лаңкестер шабуыл жасаса, не істеу керек?»"},{t:"Бекіту және Рефлексия",min:"8 мин",d:"«Болашаққа болжам»: Жасанды интеллектінің (AI) рөлі туралы пікірталас. «3-2-1» рефлексиясы."}]},
   kk:"Халықаралық ақпараттық кеңістіктегі лаңкестік әлем",
   ru:"Террористический мир в международном информационном пространстве",
   tkk:"<p><strong>17 тақырып: Халықаралық ақпараттық кеңістіктегі лаңкестік әлем</strong></p><p>Қазіргі таңда геосаясат тек физикалық шекаралар мен әскери қуаттың өлшемімен ғана шектелмейді. XXI ғасырда әлемдік саясаттың жаңа майданы – <strong>ақпараттық кеңістік</strong> пайда болды.</p><p><strong>Ақпараттық кеңістік: Жаңа геосаяси полигон</strong></p><p>Дәстүрлі геосаясатта бақылау құрлыққа (Хартленд) немесе теңізге (Римленд) бағытталса, бүгінде басты назар <strong>киберкеңістікке</strong> ауды. Лаңкестік ұйымдар бұл кеңістікті өз мүдделеріне пайдаланудың бірнеше жолын меңгерді:</p><p>1) <strong>Кибертерроризм:</strong> Мемлекеттік маңызы бар стратегиялық нысандарға (электр станциялары, банк жүйелері, әуежайлар) хакерлік шабуылдар жасау.</p><p>2) <strong>Ақпараттық насихат:</strong> Радикалды идеологияны әлеуметтік желілер арқылы тарату.</p><p>3) <strong>Виртуалды рекрутинг:</strong> Жастарды өз қатарларына тарту үшін психологиялық әдістерді пайдаланып, қашықтан үгіт-насихат жүргізу.</p><p><strong>Геосаяси қауіпсіздік және ақпараттық егемендік</strong></p><p>Геосаяси тұрғыдан алғанда, әрбір мемлекет өзінің <strong>ақпараттық егемендігін</strong> қорғауға тырысады. Бір елде отырған киберқылмыскер екінші елдің қауіпсіздігіне нұқсан келтіре алады. Бұл жағдай халықаралық қатынастарда жаңа қайшылықтар туғызады. Ақпараттық кеңістіктегі лаңкестікпен күрес – тек бір елдің емес, бүкіл жаһандық қауымдастықтың ортақ міндеті.</p><p><strong>Қауіпсіз әлемге жол: Цифрлық сауаттылық</strong></p><p>«Қауіпсіз әлем» концепциясы бүгінде тек қарусыздануды емес, <strong>цифрлық гигиена мен киберқауіпсіздікті</strong> де қамтиды. Жеке тұлға ретінде әрбір азамат ақпаратты сүзгіден өткізуді, фейк жаңалықтарды ажыратуды және радикалды топтардың арбауына түспеуді үйренуі тиіс.</p>",
   tru:"<p><strong>17 тема: Терроризм в международном информационном пространстве</strong></p><p>В XXI веке новым полем геополитики стало <strong>информационное пространство</strong>. Террористические организации используют его тремя способами: 1) <strong>кибертерроризм</strong> — хакерские атаки на стратегические объекты; 2) <strong>информационная пропаганда</strong> — распространение радикальных идей через соцсети; 3) <strong>виртуальный рекрутинг</strong> — психологическое вовлечение молодёжи. Каждое государство стремится защитить свой <strong>информационный суверенитет</strong>. Цифровая гигиена и кибербезопасность — ключевые компоненты безопасного мира.</p>",
   qkk:"Ақпараттық кеңістіктегі лаңкестік ұйымдардың қолданатын 3 негізгі әдісінің қайсысы дұрыс аталған?",
   opts:["A. Кибертерроризм, дипломатиялық қысым, экономикалық санкциялар","B. Кибертерроризм, ақпараттық насихат, виртуалды рекрутинг","C. Ақпараттық насихат, қарулы қақтығыс, сауда блокадасы","D. Виртуалды рекрутинг, ядролық қауіп, территориялық талаптар"],
   openq:"«Цифрлық гигиена» дегеніміз не? Өзіңіз бен жақындарыңыз үшін ақпараттық қауіпсіздіктің 5 алтын ережесін жазыңыз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:18,
   plan:{goal:"Оқушылар ғарышты игерудегі мемлекеттердің геосаяси, экономикалық және әскери мүдделерін талдайды, «Жаңа ғарыш» концепциясын бағалайды және ғарыштың милитаризациялану қаупіне сыни көзқарас қалыптастырады.",steps:[{t:"Басы",min:"5-7 мин",d:"Мотивациялық түрткі: «Кім ғарышты бақыласа, сол Жерді бақылайды» цитатасы. Сократтық диалог."},{t:"Ортасы — PESTLE анализі",min:"25-30 мин",d:"3 топ: 1-топ: Саяси және Әскери факторлар. 2-топ: Экономикалық және Технологиялық факторлар. 3-топ: Құқықтық және Экологиялық факторлар. Топтар постер қорғайды."},{t:"Мини-Дебат",min:"15 мин",d:"Дилемма: 1967 жылғы Келісімшарт ескірді. Жеке компаниялар Айдағы ресурстарды (Гелий-3) жекешелендіруге құқылы ма? Екі позиция: Қолдаймын / Қарсымын."},{t:"Соңы",min:"8-10 мин",d:"Қазақстанның ғарыштық геосаясаттағы орны (Байқоңыр, KazSat). «ПОПС формуласы» рефлексиясы."}]},
   kk:"Ғарышты игеру саласындағы мемлекеттердің мүдделері",
   ru:"Интересы государств в освоении космоса",
   tkk:"<p><strong>18 тақырып: Ғарыш геосаясаты — мемлекеттердің стратегиялық мүдделері</strong></p><p>Ғарыш кеңістігі – бүгінгі жаһандық геосаясаттың ең маңызды ареналарының бірі. Жер бетіндегі саяси, экономикалық және әскери бәсекелестік бүгінде орбитаға көшті.</p><p><strong>Қырғи-қабақ соғыс және ғарыш бәсекесі</strong></p><p>1957 жылы КСРО <strong>Спутник-1</strong>-ді ұшырып, ғарыш дәуірін ашты. 1961 жылы <strong>Юрий Гагарин</strong> адамзат тарихында бірінші болып ғарышқа ұшты. 1969 жылы <strong>Нил Армстронг</strong> ай бетіне алғашқы қадамын жасады. Бұл кезеңде мемлекеттердің басты мүддесі — идеологиялық үстемдікті көрсету және баллистикалық зымырандар технологиясын дамыту болды.</p><p><strong>Көпполярлы ғарыш: Жаңа ойыншылар</strong></p><p>Бүгінде Қытай, Үндістан, ЕКА (Еуропалық ғарыш агенттігі), Жапония сияқты жаңа күш орталықтары толыққанды ғарыштық державаларға айналды. Қытай «<strong>Тяньгун</strong>» орбиталық станциясын сәтті іске қосып, Айдың көрінбейтін бетіне аппарат қондырған алғашқы мемлекет болды.</p><p><strong>Прагматикалық геосаясат: Экономика және ресурстар</strong></p><p>Жер орбитасындағы мыңдаған спутниктер біздің күнделікті өмірімізді қамтамасыз етеді: ғаламтор, GPS навигациясы, ауа райын болжау. Ай бетінде болашақ термоядролық энергетика үшін аса маңызды <strong>Гелий-3</strong> изотопының орасан қорлары бар.</p><p><strong>Ұлттық қауіпсіздік және милитаризациялану</strong></p><p>1967 жылғы «Ғарыш кеңістігі туралы шарт» ғарышқа жаппай қырып-жоятын қаруды орналастыруға тыйым салғанымен, спутниктерге қарсы қару-жарақ (<strong>ASAT</strong>) сынақтары тоқтаған жоқ. АҚШ, Ресей, Қытай және Үндістан мұндай технологияның бар екенін дәлелдеді.</p><p><strong>Қорытынды: Қазақстанның орны</strong></p><p><strong>«Байқоңыр»</strong> ғарыш айлағының біздің аумақта орналасуы және өзіміздің <strong>«KazSat»</strong> байланыс спутниктерімізің болуы — елімізді жаһандық ғарыш геосаясатының белсенді қатысушысына айналдырады. «<strong>Жаңа ғарыш</strong>» (New Space) ұғымы — SpaceX сияқты жекеменшік компаниялардың саясатқа araласуы ғарышты коммерцияландырды.</p>",
   tru:"<p><strong>18 тема: Геополитика космоса — интересы государств</strong></p><p>В 1957 году СССР запустил <strong>Спутник-1</strong>, открыв космическую эру. В 1969 году США высадились на Луну. Сегодня космос стал многополярным: Китай, Индия, ЕКА, Япония — полноценные космические державы. Ключевые интересы: <strong>экономические</strong> (спутники для навигации, телекоммуникаций), <strong>ресурсные</strong> (Гелий-3 на Луне), <strong>военные</strong> (ASAT-оружие). Договор 1967 года запрещает оружие массового уничтожения в космосе, но не останавливает милитаризацию. Казахстан участвует через космодром <strong>Байконур</strong> и спутники <strong>KazSat</strong>.</p>",
   qkk:"«Қырғи-қабақ соғыс» кезіндегі АҚШ пен КСРО арасындағы ғарыш бәсекесінің түпкі геосаяси мақсаты не болды?",
   opts:["A. Басқа планеталардан саналы тіршілік иелерін бірінші болып табу","B. БҰҰ-дағы вето құқығын сақтап қалу","C. Баллистикалық технологияларды дамыту арқылы әскери тепе-теңдік пен идеологиялық үстемдік орнату","D. Ғарыш туризмін дамыту арқылы ұлттық кірісті арттыру"],
   openq:"Ай бетіндегі Гелий-3 ресурстарына бірінші болып қол жеткізген мемлекет қандай стратегиялық артықшылыққа ие болады? Өз пікіріңізді негіздеңіз.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:19,
   plan:{
     goal:"Оқушыларға Израиль-Палестина қақтығысының тарихи тамырын түсіндіру, негізгі 4 түйінді мәселені (жер, Иерусалим, босқындар, қауіпсіздік) талдату және дипломатиялық шешімдер ұсынуға дағдыландыру.",
     steps:[{t:"Ұйымдастыру",min:"3-5 мин",d:"«Миға шабуыл»: Экраннан Иерусалим қаласының ескі бөлігі мен қазіргі Израильдің технологиялық жетістіктерін көрсету."}, {t:"Жаңа материалды меңгеру",min:"15-20 мин",d:"Тарихи алғышарттар: Сионизм, Британия мандаты, БҰҰ-ның 1947 жылғы шешімі. 4 негізгі фактор: жер, Иерусалим, босқындар, қауіпсіздік."}, {t:"Бекіту — Дипломатиялық кейс",min:"15 мин",d:"1-топ «Бітімгерлер»: Иерусалимді басқарудың екі тарапқа да қолайлы моделін ұсыну. 2-топ «Болашақ архитекторлары»: Екі халықтың қауіпсіздігін нығайтатын смарт-жоба ойлап табу."}, {t:"Рефлексия",min:"3-5 мин",d:"«Бүгінгі сабақтан алған ең маңызды геосаяси сабағым...» сөйлемін аяқтау. Оқушылардың белсенділігін бағалау."}]
   },
   kk:"Таяу Шығыстағы Израиль-Палестина мәселесінің себептері мен геосаяси астары",
   ru:"Причины и геополитическая подоплёка израильско-палестинского конфликта на Ближнем Востоке",
   tkk:"<p><strong>19 тақырып: Таяу Шығыстағы Израиль-Палестина мәселесінің себептері мен геосаяси астары</strong></p>\n\n<p><strong>1. Мәселенің тарихи алғышарттарына кіріспе</strong></p>\n<p>Израиль-Палестина қақтығысы – қазіргі заманғы халықаралық қатынастардағы ең ұзақ, ең күрделі және шешімін таппай келе жатқан дау. Бұл шиеленіс тек екі халық арасындағы жер дауы емес, оны XX–XXI ғасырлардың геосаяси жаhандану, ресурстар үшін бәсеке, ақпараттық-технологиялық майдан және көпполярлы дүниенің қалыптасуы сияқты заманауи факторлары тұрғысынан да қарастыру өте маңызды.</p>\n\n<p><strong>2. Қақтығыстың негізгі себептері</strong></p>\n<p>Бұл шиеленіс бірнеше күрделі факторлардың тоғысуынан туындаған:</p>\n<p>— <strong>Жерге және шекараға талас (Территориялық мәселе):</strong> Екі халық та Жерорта теңізі мен Иордан өзені аралығындағы жерді өздерінің тарихи отаны деп санайды. 1947 жылы БҰҰ Палестинаны Израиль мен Арабстан мемлекеттеріне бөлуді ұсынды, бірақ бұл шешім Израильдің тәуелсіздік жариялауы мен 1948 жылғы соғысқа ұласты.</p>\n<p>— <strong>Иерусалим (Құдыс) қаласының мәртебесі:</strong> Иерусалим – яhудилер (иудаизм), христиандар және мұсылмандар үшін қасиетті қала. Екі тарап та оны өзінің астанасы деп санайды.</p>\n<p>— <strong>Босқындар мәселесі:</strong> 1948 жылғы бірінші араб-израиль соғысы кезінде жүздеген мың палестиналықтар өз үйлерін тастап кетуге мәжбүр болды. Бұл мәселенің шешімі болмай отыр.</p>\n<p>— <strong>Қауіпсіздік және егемендік:</strong> Израиль өз азаматтарын лаңкестіктен қорғауды бірінші орынға қояды. Палестиналықтар тәуелсіз мемлекет пен өз егемендіктерін талап етеді.</p>\n\n<p><strong>3. Ресурстар үшін бәсекелестік: Су және Энергия</strong></p>\n<p>Қақтығыстың астарында тек саясат емес, өмірлік маңызы бар ресурстар үшін күрес жатыр. Таяу Шығыс — әлемдегі ең құрғақ аймақтардың бірі:</p>\n<p><strong>Су ресурстары:</strong> Иордан өзені мен жерасты су көздеріне бақылау орнату — екі тарап үшін де стратегиялық мақсат. Су тапшылығы болашақта шиеленісті одан сайын күшейтуі мүмкін.</p>\n<p><strong>Энергетика:</strong> Жерорта теңізінің жағалауындағы (Газа секторына жақын маңдағы) табиғи газ кен орындары аймақтың экономикалық өміршеңдігі үшін өте маңызды.</p>\n\n<p><strong>4. Халықаралық факторлардың (геосаясаттың) рөлі</strong></p>\n<p>1. <strong>Британия мандаты:</strong> Бірінші дүниежүзілік соғыстан кейін Ұлыбританияның Палестинаны басқаруы және екі тарапқа бірдей орын беруге тырысуы — қақтығыстың тамыры осында.</p>\n<p>2. <strong>Державалардың мүддесі:</strong> Қырғи-қабақ соғыс жылдарында АҚШ-тың Израильді, КСРО-ның араб елдерін қолдауы қақтығысты әлемдік геосаяси ойынның бөлігіне айналдырды.</p>\n\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Фактор</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Мәселенің сипаттамасы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Геосаяси маңызы</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Географиялық (Жер және шекара)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">1947 жылғы БҰҰ жоспары мен қазіргі анклавтардың орналасуы.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Тәуелсіз мемлекет құру мен қауіпсіздік шекараларын анықтау.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Ресурстық (Су және Энергия)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Иордан өзені мен Жерорта теңізі қайраңындағы газ кен орындары.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Аймақтың экономикалық өміршеңдігі мен ресурстық тәуелсіздігін бақылау.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Діни және мәдени</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Иерусалимнің үш дін үшін қасиеттілігі.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Аймақтық және жаhандық қоғамдық пікірге әсер ету.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Халықаралық (Геосаяси)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">АҚШ, Ресей, Иран, Түркия және ЕО-ның мүдделері.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Аймақтық тепе-теңдікті сақтау немесе бұзу мүмкіндігі.</td></tr></tbody></table>",
   tru:"<p><strong>19 тема: Причины и геополитическая подоплёка израильско-палестинского конфликта</strong></p>\n\n<p><strong>1. Введение в исторические предпосылки</strong></p>\n<p>Израильско-палестинский конфликт — один из наиболее длительных, сложных и нерешённых споров в современных международных отношениях. Это противостояние — не просто территориальный спор между двумя народами; его необходимо рассматривать сквозь призму таких современных факторов, как геополитическая глобализация, борьба за ресурсы, информационно-технологический фронт и становление многополярного мира.</p>\n\n<p><strong>2. Основные причины конфликта</strong></p>\n<p>— <strong>Территориальный спор:</strong> Оба народа считают территорию между Средиземным морем и рекой Иордан своей исторической родиной. В 1947 году ООН предложила раздел Палестины, что привело к провозглашению независимости Израиля и войне 1948 года.</p>\n<p>— <strong>Статус Иерусалима:</strong> Священный город для иудеев, христиан и мусульман. Обе стороны претендуют на него как на столицу.</p>\n<p>— <strong>Проблема беженцев:</strong> Сотни тысяч палестинцев были вынуждены покинуть свои дома в ходе войны 1948 года.</p>\n<p>— <strong>Безопасность и суверенитет:</strong> Израиль ставит защиту граждан от терроризма на первое место; палестинцы требуют независимого государства.</p>\n\n<p><strong>3. Борьба за ресурсы: Вода и Энергия</strong></p>\n<p><strong>Водные ресурсы:</strong> Контроль над рекой Иордан и подземными водами — стратегическая цель обеих сторон. Дефицит воды способен в будущем ещё больше обострить конфликт.</p>\n<p><strong>Энергетика:</strong> Месторождения природного газа у берегов Средиземного моря (вблизи сектора Газа) имеют ключевое экономическое значение для региона.</p>\n\n<p><strong>4. Роль международных факторов</strong></p>\n<p>1. <strong>Британский мандат:</strong> Управление Великобритании Палестиной после Первой мировой войны и попытки удовлетворить интересы обеих сторон — корень конфликта.</p>\n<p>2. <strong>Интересы держав:</strong> В годы холодной войны США поддерживали Израиль, СССР — арабские страны, что превратило конфликт в часть глобальной геополитической игры.</p>",
   qkk:"БҰҰ Палестинаны бөлу туралы қарарын қай жылы қабылдады?",
   opts:["A. 1945 ж.", "B. 1956 ж.", "C. 1947 ж.", "D. 1967 ж."],
   openq:"Израиль-Палестина қақтығысының 4 негізгі себебін атаңыз және олардың ішіндегі ең шешуші деп санайтыныңызды дәлелмен түсіндіріңіз.",
   mapq:'',
   mapDots:[],
   mapOpts:[]
  },
  {id:20,
   plan:{
     goal:"Оңтүстік Қытай теңізіндегі даудың себептерін (ресурстар, логистика, стратегия) талдау және тараптардың ұстанымдарын салыстыру.",
     steps:[{t:"Қызығушылықты ояту",min:"5 мин",d:"«Сандар сөйлейді»: 3,5 трлн $, 11 млрд баррель, 190 трлн текше фут — бұл сандардың Оңтүстік Қытай теңізіне қатысы?"}, {t:"Негізгі бөлім",min:"15 мин",d:"«Тоғыз сызық» тұжырымдамасы, Парасель мен Спратли аралдары, Қытайдың жасанды аралдар салу стратегиясы."}, {t:"Топтық жұмыс — Дипломатиялық арена",min:"15 мин",d:"5 топ (Қытай, Вьетнам+Филиппин, АҚШ, АСЕАН, Жапония) өз елінің ұстанымын 2 минуттық Манифест ретінде қорғайды."}, {t:"Қорытынды — Болжам жасау",min:"5 мин",d:"А нұсқасы: Әскери қақтығыс. Ә нұсқасы: Дипломатиялық компромисс. Б нұсқасы: «Мұздатылған» статус-кво."}]
   },
   kk:"Оңтүстік Қытай теңізіндегі аралдар үшін шайқас",
   ru:"Битва за острова в Южно-Китайском море",
   tkk:"<p><strong>20 тақырып: Оңтүстік Қытай теңізіндегі аралдар үшін шайқас</strong></p>\n\n<p><strong>1. Мәселенің тарихи және геосаяси астары</strong></p>\n<p>Бұл аймақ — әлемдік сауданың «күретамыры». Егер Таяу Шығыстағы қақтығыстар жер мен дінге негізделсе, мұнда негізгі күрес <strong>стратегиялық теңіз жолдары мен болашақтың энергиясы</strong> үшін жүріп жатыр.</p>\n<p><strong>Қызықты факт:</strong> Оңтүстік Қытай теңізі арқылы жылына $3,4 триллионнан астам сомалық жүк тасымалданады — бұл әлемдік сауда айналымының шамамен 30%-ы.</p>\n\n<p><strong>2. Қақтығыстың «Көрінбейтін» себептері</strong></p>\n<p>— Қытай жасанды аралдар салып қана қоймай, оларды толыққанды әскери бекіністерге айналдырды: радарлық жүйелер, ұшу-қону жолақтары, зымырандық қондырғылар.</p>\n<p>— Теңіз түбінде Қытайдың «Астыртын көкшіл қорғаны» деп аталатын сенсорлар желісі орнатылған. Бұл жүйе кез келген шетелдік сүңгуір қайықты бақылай алады.</p>\n<p>— Қытай ресми әскери флотын емес, қаруланған балықшылар флотын қолданады — ашық соғыс жарияламай-ақ, басқа елдердің аумақтық суларын игеру стратегиясы.</p>\n\n<p><strong>3. Ресурстар: Болашақтың энергиясы</strong></p>\n<p><strong>Тұтанғыш мұз:</strong> Теңіз табанында «жанғыш мұз» деп аталатын метан гидратының орасан зор қоры бар — болашақтың энергия көзі.</p>\n<p><strong>Экологиялық апат:</strong> Жасанды аралдар салу барысында мыңдаған жылдар бойы қалыптасқан маржан рифтері жойылып жатыр — бұл аймақ экожүйесіне үлкен зиян.</p>\n\n<p><strong>4. Геосаяси «Шахмат тақтасы»</strong></p>\n<p>— <strong>«Малакка дилеммасы»:</strong> Қытай экономикасы үшін ең үлкен қауіп — Малакка бұғазының жабылуы. Қытай импорттайтын мұнайдың 80%-ы осы бұғаз арқылы өтеді.</p>\n<p>— <strong>«Бірінші аралдар тізбегі»:</strong> Жапониядан Тайваньға, одан Филиппинге дейінгі стратегиялық шеп. АҚШ бұл «аралдар тізбегін» Қытайды «оқшаулау» стратегиясының негізі ретінде қарастырады.</p>\n<p>— <strong>АСЕАН елдерінің теңгерім саясаты:</strong> Вьетнам, Индонезия, Малайзия — Қытай нарығына тәуелді де, аумақтық даудың тікелей қатысушысы да.</p>\n<p>— <strong>Жапония мен Үндістанның рөлі:</strong> Бұл тек АҚШ пен Қытайдың ғана мәселесі емес — Жапония жүк тасымалы қауіпсіздігі, Үндістан теңіздегі ықпал үшін мүдделі.</p>\n\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">№</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Себебі</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Салдары</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">1</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Жасанды аралдарға радарлар орнату</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">«Сенсорлық соғыс» және көрші елдерді аңду мүмкіндігі</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">2</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Маржан рифтерінің жойылуы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Аймақтағы азық-түлік қауіпсіздігіне қауіп төнуі</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">3</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">«Малакка дилеммасы»</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қытайдың аймақтан тыс аралдар іздеуі (Үнді мұхиты)</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">4</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Тоғыз сызық тұжырымдамасы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Халықаралық сотқа (Гаага) шағым және АҚШ флотының патрулі</td></tr></tbody></table>",
   tru:"<p><strong>20 тема: Битва за острова в Южно-Китайском море</strong></p>\n\n<p><strong>1. Историческая и геополитическая подоплёка</strong></p>\n<p>Этот регион — «артерия» мировой торговли. Если ближневосточные конфликты основаны на земле и религии, то здесь главная борьба ведётся за <strong>стратегические морские пути и энергию будущего</strong>.</p>\n<p><strong>Интересный факт:</strong> Через Южно-Китайское море ежегодно перевозится товаров на сумму свыше $3,4 трлн — около 30% мирового торгового оборота.</p>\n\n<p><strong>2. «Невидимые» причины конфликта</strong></p>\n<p>— Китай не только строит искусственные острова, но и превращает их в полноценные военные укрепления: радарные системы, взлётно-посадочные полосы, ракетные установки.</p>\n<p>— На морском дне развёрнута сеть сенсоров «Подводная синяя стена Китая», способная отслеживать любые иностранные подводные лодки.</p>\n<p>— Китай использует вооружённые рыболовецкие флотилии вместо официального флота — стратегия освоения чужих территориальных вод без объявления войны.</p>\n\n<p><strong>3. Ресурсы: Энергия будущего</strong></p>\n<p><strong>Горючий лёд:</strong> На морском дне залегают огромные запасы гидрата метана — источника энергии будущего.</p>\n<p><strong>Экологическая катастрофа:</strong> При строительстве искусственных островов уничтожаются коралловые рифы, формировавшиеся тысячелетиями.</p>\n\n<p><strong>4. Геополитическая «шахматная доска»</strong></p>\n<p>— <strong>«Малаккская дилемма»:</strong> Крупнейшая угроза для экономики Китая — закрытие Малаккского пролива, через который проходит 80% импортируемой нефти.</p>\n<p>— <strong>«Первая цепь островов»:</strong> Стратегический рубеж от Японии через Тайвань до Филиппин. США рассматривают его как основу стратегии «сдерживания» Китая.</p>\n<p>— <strong>Балансирующая политика АСЕАН:</strong> Вьетнам, Индонезия, Малайзия зависят от китайского рынка и одновременно являются прямыми участниками территориального спора.</p>",
   qkk:"Оңтүстік Қытай теңізі арқылы жылына өтетін сауда айналымының шамамен қаншасы?",
   opts:["A. $1 трлн", "B. $3,4 трлн", "C. $500 млрд", "D. $10 трлн"],
   openq:"Қытайдың «Тоғыз сызық» тұжырымдамасы халықаралық теңіз құқығымен (UNCLOS) қалай қайшы келеді? Өз пікіріңізді дәлелмен жазыңыз.",
   mapq:'',
   mapDots:[],
   mapOpts:[]
  },
  {id:21,
   plan:{
     goal:"Оқушыларға геосаяси қуаттың негізгі факторлары ретінде география мен экономиканың рөлін түсіндіру және аумақтық даулардың жаhандық геосаясатпен байланысын ашу.",
     steps:[{t:"Ұйымдастыру",min:"3 мин",d:"«Миға шабуыл»: «Неліктен төрт кішкентай арал (Куриль) 70 жыл бойы екі алып елді бітімге келтірмей отыр?»"}, {t:"Білу және түсіну",min:"7 мин",d:"Геосаясаттың тек шекаралар емес, мемлекеттердің ықпалы туралы ілім екенін түсіндіру. ХХІ ғасырдағы қуат тіректері: ресурс бәсекелестігі және технология."}, {t:"Топтық зерттеу",min:"15 мин",d:"Үй жобалары: «Куриль ренийі», «Су геосаясаты», «Технологиялық егемендік», «Қазақстанның транзиттік әлеуеті» — таныстыру."}, {t:"Қорытынды-рефлексия",min:"5 мин",d:"Геосаяси факторлар кестесін топтармен толтыру. Оқушыларды бағалау."}]
   },
   kk:"Куриль аралдары мен Гималай маңындағы аумақтық даулар",
   ru:"Территориальные споры — Курильские острова и Гималайский регион",
   tkk:"<p><strong>21 тақырып: Куриль аралдары мен Гималай маңындағы аумақтық даулар</strong></p>\n\n<p><strong>1. Кіріспе: Аумақтық даулардың геосаяси табиғаты</strong></p>\n<p>Геосаясат – мемлекеттердің сыртқы саясаты мен халықаралық қатынастарына географиялық, тарихи, демографиялық және экономикалық факторлардың тигізетін әсерін зерттейтін ғылым. ХХІ ғасырда аумақтық даулар тек жер шекарасы үшін емес, одан маңызды ресурстар (су, сирек металдар) мен стратегиялық орналасу үшін жүріп жатыр.</p>\n\n<p><strong>2. Куриль аралдары: Тынық мұхитындағы стратегиялық шеп (Ресей мен Жапония)</strong></p>\n<p>Екінші дүниежүзілік соғыстың қорытындысы бойынша басталған Итуруп, Кунашир, Шикотан және Хабомаи аралдарына қатысты дау күні бүгінге дейін шешілмей отыр.</p>\n<p>— <strong>Географиялық және кеңістіктік фактор:</strong> Бұл аралдар Охот теңізін Дүниежүзілік мұхиттан бөліп тұр. Ресей үшін бұл Дүниежүзілік мұхитқа тікелей шығу мүмкіндігі, Жапония үшін — теңіздегі ауқымды экономикалық аймаққа (ЭЭА) қол жеткізу.</p>\n<p>— <strong>Ресурстар үшін бәсекелестік:</strong> ХХІ ғасырда Куриль аралдарында <strong>рений</strong> — смартфондар мен авиация үшін қажетті сирек кездесетін металл — ірі қоры бар екені анықталды. Бұл жаңалық аралдардың стратегиялық маңызын бірнеше есе арттырды.</p>\n<p>— <strong>Әскери фактор:</strong> Ресей осы аймақта С-300 зымырандық жүйелерін орналастырды, бұл Жапония мен АҚШ-тың ауа кеңістігіне бақылауды білдіреді.</p>\n\n<p><strong>3. Гималай маңы: «Әлемнің төбесіндегі» көпполярлы қақтығыс (Қытай мен Үндістан)</strong></p>\n<p>Ақсай-Чин және Аруначал-Прадеш аймақтарындағы екі алпауыттың қақтығысы қазіргі ғаламдық геосаяси жағдайдың басты ерекшелігін — <strong>көпполярлы дүниенің қалыптасуын</strong> айқын көрсетеді.</p>\n<p>— <strong>Су геосаясаты:</strong> Гималай — Азияның «су мұнарасы». Ганг, Брахмапутра, Инд өзендері осы аймақтан бастау алады. Екі ядролық держава бір-бірінің «жоғарғы бойындағы» жерге ие болу үшін таласып жатыр — себебі, ол жерді бақылау ағынды реттеу мүмкіндігін береді.</p>\n<p>— <strong>Демографиялық фактор:</strong> Екі мемлекеттің де халық санының өсу динамикасы өте жоғары — ресурс қажеттілігі де артып барады.</p>\n<p>— <strong>Әскери-технологиялық ерекшелік:</strong> ХХІ ғасырдағы ядролық державалардың шекарасында қару қолданбау туралы бейресми ереже бар. Сондықтан қазір спутниктік барлау мен жасанды интеллект (ЖИ) шекаралық бақылауда белсенді қолданылады.</p>\n\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Фактор атауы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Куриль аралдары (Ресей-Жапония)</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Гималай маңы (Қытай-Үндістан)</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Географиялық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мұхитқа тікелей шығу мүмкіндігі.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Биік таулы аймақ, стратегиялық биіктік.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Экономикалық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Теңіз ресурстары, сирек металдар (рений).</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Тұщы су ресурстары (өзендердің бастауы).</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Әскери</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">С-300 жүйелері, Тынық мұхитына бақылау.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Ядролық держава шекарасы, спутниктік барлау.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Дипломатиялық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">70+ жыл бойы шешілмеген, бейресми «мәңгілік мәселе».</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Шанхай ынтымақтастық ұйымы шеңберінде диалог.</td></tr></tbody></table>",
   tru:"<p><strong>21 тема: Территориальные споры — Курильские острова и Гималайский регион</strong></p>\n\n<p><strong>1. Введение: геополитическая природа территориальных споров</strong></p>\n<p>В XXI веке территориальные споры ведутся уже не только из-за земельных границ — на кону стоят более важные ресурсы (вода, редкие металлы) и стратегическое положение.</p>\n\n<p><strong>2. Курильские острова (Россия и Япония)</strong></p>\n<p>Спор об островах Итуруп, Кунашир, Шикотан и Хабомаи по итогам Второй мировой войны не урегулирован по сей день.</p>\n<p>— <strong>Географический фактор:</strong> Острова отделяют Охотское море от Мирового океана. Для России — это выход в открытый океан, для Японии — расширение исключительной экономической зоны (ЭЭЗ).</p>\n<p>— <strong>Борьба за ресурсы:</strong> В XXI веке выяснилось, что на Курилах есть крупные запасы <strong>рения</strong> — редкого металла, необходимого для смартфонов и авиации. Это многократно повысило стратегическую ценность островов.</p>\n<p>— <strong>Военный фактор:</strong> Россия разместила на островах ракетные системы С-300, обеспечивая контроль над воздушным пространством Японии и США.</p>\n\n<p><strong>3. Гималайский регион (Китай и Индия)</strong></p>\n<p>— <strong>Водная геополитика:</strong> Гималаи — «водонапорная башня» Азии. Отсюда берут начало Ганг, Брахмапутра и Инд. Контроль над верховьями рек означает возможность управлять стоком воды.</p>\n<p>— <strong>Демографический фактор:</strong> Обе страны с растущим населением испытывают всё большую потребность в ресурсах.</p>\n<p>— <strong>Военно-технологическая особенность:</strong> На границе ядерных держав действует неформальное правило — оружие не применять. Поэтому активно используются спутниковая разведка и искусственный интеллект.</p>",
   qkk:"Куриль аралдарында ХХІ ғасырда қандай стратегиялық маңызды металл табылды?",
   opts:["A. Рений", "B. Алтын", "C. Литий", "D. Кобальт"],
   openq:"Гималай маңындағы даудың «су геосаясаты» деп аталуының себебін түсіндіріңіз. Тұщы су геосаясаттың қаруына айналуы мүмкін бе?",
   mapq:'',
   mapDots:[],
   mapOpts:[]
  },
  {id:22,
   plan:{
     goal:"Оқушыларға Арктика мен Антарктиданың стратегиялық, экономикалық және экологиялық маңызын түсіндіру, полярлық аймақтардағы ресурстар үшін болатын бәсекені жаhандық геосаясат тұрғысынан талдату.",
     steps:[{t:"Қызығушылықты ояту",min:"5 мин",d:"«Неліктен державалар мұзды аймақтар үшін таласуда?» — миға шабуыл. ХХІ ғасырдағы ғаламдық жылыну мен ресурстардың сарқылуы."}, {t:"Полярлық геосаясат",min:"20 мин",d:"Арктика: Арктикалық бестік, Солтүстік теңіз жолы, мұнай/газ қоры, «Үнсіз жарыс». Антарктида: 1959 шарты, 2048 жылғы қауіп, тұщы су қоры."}, {t:"Практикалық жұмыс",min:"15 мин",d:"Оқушылар Арктика-Антарктида салыстырмалы кестесін толтырады. «Геосаяси болжам»: Мұз ерісе, жаңа сауда хабтары қай жерде пайда болады?"}, {t:"Қорытынды",min:"5 мин",d:"Болашақ мамандықтар: мұхиттанушы, гляциолог, халықаралық құқық маманы. «Полярлық логотип» — үйге шығармашылық тапсырма."}]
   },
   kk:"Арктика мен Антарктида аймақтарының болашақтағы маңызы",
   ru:"Будущее Арктики и Антарктиды: Новая геополитика ледяных континентов",
   tkk:"<p><strong>22 тақырып: Арктика мен Антарктида аймақтарының болашақтағы маңызы</strong></p>\n\n<p><strong>1. Кіріспе: Полярлық аймақтардағы геосаяси тартыс</strong></p>\n<p>ХХІ ғасырда ғаламдық жылыну мен дәстүрлі ресурстардың сарқылуы әлем назарын Жердің ең шеткі нүктелеріне — Арктика мен Антарктидаға аударды. Бұл аймақтар бүгінде жаңа геосаяси ойын алаңына айналуда.</p>\n\n<p><strong>2. Арктика: Солтүстіктегі стратегиялық дәліз және ресурстар қоймасы</strong></p>\n\n<p><strong>А) Аймақты кімдер бақылайды?</strong></p>\n<p><strong>Арктикалық бестік:</strong> Арктика мұхитымен тікелей шектесетін бес мемлекет — Ресей, АҚШ, Канада, Дания (Гренландия арқылы) және Норвегия — аймаққа ең үлкен территориялық талап қоя алады.</p>\n<p><strong>Жаңа қатысушылар:</strong> Аймақтан алыс жатса да, Қытай «бақылаушы» мәртебесін алып, мүдделерін белсенді жүргізуде.</p>\n\n<p><strong>Ә) Жаңа логистикалық сауда жолдары</strong></p>\n<p>— <strong>Солтүстік теңіз жолы:</strong> Мұздықтардың еруі нәтижесінде Азия мен Еуропаны байланыстыратын ең қысқа бағыт ашылуда.</p>\n<p>— <strong>Тиімділік:</strong> Бұл бағыт дәстүрлі Суэц каналымен салыстырғанда тасымал уақытын <strong>20–30%-ға</strong> қысқартып, әлемдік логистиканы түбегейлі өзгерте алады.</p>\n\n<p><strong>Б) Ресурстар үшін бәсеке (Мұз астындағы байлық)</strong></p>\n<p>— <strong>Энергетика:</strong> Арктикада әлі ашылмаған әлемдік мұнай қорының <strong>13%-ы</strong> және табиғи газдың <strong>30%-ы</strong> жатыр.</p>\n<p>— <strong>Минералдар:</strong> Аймақ жоғары технологияларға қажетті сирек кездесетін металдарға өте бай.</p>\n\n<p><strong>В) Полярлық аймақтағы «Үнсіз жарыс»</strong></p>\n<p>— <strong>Бақылау құралы:</strong> Аймақта үстемдік ету үшін мұзжарғыш кемелер (ледоколдар) флотының болуы шешуші рөл атқарады.</p>\n<p>— <strong>Қазіргі жағдай:</strong> Ашық қақтығыс болмаса да, ескі әскери базаларды жаңғырту және стратегиялық сүңгуір қайықтардың жиілігі артып барады.</p>\n<p><em>Қызықты дерек:</em> Арктика — ақ аюлардың жалғыз мекені, бірақ мұнда пингвиндер мүлдем кездеспейді. Пингвиндер тек Антарктидада тіршілік етеді.</p>\n\n<p><strong>3. Антарктида: Әлемнің ең ірі тұщы су қоймасы</strong></p>\n\n<p>— <strong>Құқықтық мәртебе және 2048 жылғы қауіп:</strong> 1959 жылғы Антарктика туралы шартқа сәйкес, құрлық тек бейбіт ғылыми мақсаттарға арналған. Алайда <strong>2048 жылы</strong> бұл шарт қайта қаралуы мүмкін — содан кейін мемлекеттер оның ресурстарына талап қоя алады.</p>\n<p>— <strong>Ресурстар (Су геосаясаты):</strong> Антарктидада жер бетіндегі тұщы су қорының <strong>70%-ға жуығы</strong> шоғырланған. Таза ауыз су тапшылығы артқан сайын, бұл аймақ «алтыннан да қымбат» болмақ.</p>\n<p>— <strong>«Ғылыми» геосаясат:</strong> Мемлекеттер өз ықпалын ғылыми станциялардың санымен өлшейді: АҚШ, Қытай, Ресей, Чили — ең белсенді ойыншылар.</p>\n<p><em>Қызықты факт:</em> Антарктидадағы Мак-Мердо Құрғақ аңғарлары (Dry Valleys) — әлемдегі ең құрғақ жер. Онда шамамен 2 миллион жыл бойы жаңбыр жаумаған.</p>\n\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Фактор атауы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Арктика (Солтүстік полюс маңы)</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Антарктида (Оңтүстік полюс)</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Географиялық маңызы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Азия мен Еуропаны жалғайтын қысқа теңіз жолы.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Оқшауланған құрлық, ғаламдық климатты реттеуші орталық.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Экономикалық / Ресурстық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мұнай, газ, сирек металдар, балық ресурстары.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Жердегі тұщы судың 70%, зерттелмеген минералдар.</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Саяси / Құқықтық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">5 мемлекет таласады, Қытай «бақылаушы» ретінде кіруде.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">1959 шарты (2048-ге дейін бейбіт аймақ).</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Экологиялық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мұздықтардың еруі — ресурсқа жол ашса да, климатқа зиян.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Ең таза табиғи орта, ғылым үшін бірегей полигон.</td></tr></tbody></table>",
   tru:"<p><strong>22 тема: Будущее Арктики и Антарктиды: Новая геополитика ледяных континентов</strong></p>\n\n<p><strong>1. Введение: Геополитическое соперничество в полярных регионах</strong></p>\n<p>В XXI веке глобальное потепление и истощение традиционных ресурсов обратили внимание мира на самые отдалённые точки Земли — Арктику и Антарктиду.</p>\n\n<p><strong>2. Арктика: стратегический коридор Севера</strong></p>\n<p><strong>«Арктическая пятёрка»:</strong> Россия, США, Канада, Дания (через Гренландию) и Норвегия. Помимо них, Китай активно продвигает свои интересы в статусе «наблюдателя».</p>\n<p>— <strong>Северный морской путь:</strong> Таяние льдов открывает кратчайший маршрут между Азией и Европой, сокращая время транспортировки на 20–30% по сравнению с Суэцким каналом.</p>\n<p>— <strong>Ресурсы:</strong> Под арктическими льдами — около 13% неоткрытых мировых запасов нефти и 30% природного газа.</p>\n<p>— <strong>«Тихая гонка»:</strong> Страны наращивают флоты ледоколов и модернизируют военные базы без открытых конфликтов.</p>\n\n<p><strong>3. Антарктида: крупнейший резервуар пресной воды</strong></p>\n<p>— <strong>Правовой статус и угроза 2048 года:</strong> По договору 1959 года континент предназначен только для мирных научных целей. Однако в 2048 году договор может быть пересмотрен.</p>\n<p>— <strong>Ресурсы (водная геополитика):</strong> Около 70% мировых запасов пресной воды сосредоточено в Антарктиде — при нарастающем дефиците воды это дороже золота.</p>\n<p>— <strong>«Научная» геополитика:</strong> Страны демонстрируют своё влияние числом научных станций: США, Китай, Россия, Чили — самые активные игроки.</p>",
   qkk:"Антарктидада жер бетіндегі тұщы судың қанша пайызы шоғырланған?",
   opts:["A. 30%", "B. 45%", "C. 55%", "D. 70%-ға жуығы"],
   openq:"Арктикалық «Үнсіз жарыс» деген не? Неліктен ашық соғысқа ұласпай, «үнсіз» жүріп жатыр? Мысалмен түсіндіріңіз.",
   mapq:'',
   mapDots:[],
   mapOpts:[]
  }
,
  {id:23,
   plan:{goal:"Африка мен Латын Америкасындағы табиғи ресурстардың геосаяси маңызын талдау, «Ресурстар қарғысы» ұғымын түсіндіру, жаhандық бәсекелестердің мүдделерін анықтау.",steps:[{t:"Ұйымдастыру",min:"5 мин",d:"Смартфон аккумуляторы → Африкадағы кобальт → балалар еңбегі. Ресурстар қарғысы ұғымын таныстыру."}, {t:"Жаңа материал",min:"15 мин",d:"Африканың 30% минералдық әлеуеті. Конгоның 70% кобальты. Литий үшбұрышы (Чили, Аргентина, Боливия)."}, {t:"Рөлдік ойын",min:"15 мин",d:"«Литий кеніші»: ТҰК, Жергілікті үкімет, Экологиялық белсенділер — үш тараптың мүддесін қорғау."}, {t:"Бекіту",min:"10 мин",d:"«Кім жылдам» сұрақ-жауап. «Плюс, Минус, Қызықты» рефлексиясы."}]},
   kk:"Африка мен Латын Америкасындағы ресурстар үшін геосаяси күрес",
   ru:"Геополитическая борьба за ресурсы в Африке и Латинской Америке",
   tkk:"<p><strong>23 тақырып: Африка мен Латын Америкасындағы ресурстар үшін геосаяси күрес</strong></p>\n<p>Африка мен Латын Америкасы – әлемдегі табиғи қазба байлықтарға ең бай құрлықтар. Алайда бұл байлық аталған аймақтарға экономикалық гүлдену мен тұрақтылық емес, кейде <strong>«ресурстар қарғысы»</strong> деп аталатын феноменді — саяси тұрақсыздық пен теңсіздікті — алып келді.</p>\n<p>Тарихи тұрғыдан бұл аймақтар еуропалық отарлауды бастан өткерді, ал бүгінгі таңда тікелей әскери басып алудың орнына <strong>экономикалық және технологиялық бәсекелестік</strong> жүріп жатыр — «жаңа отаршылдық» (неоколониализм).</p>\n\n<p><strong>1. Африка құрлығындағы «Жаңа талас» және негізгі себептері</strong></p>\n<p>Африка әлемдік минералды ресурстардың шамамен <strong>30%-ын</strong> иемденеді. Қазіргі таңда мұнда АҚШ, Қытай, Еуропалық Одақ және Ресей белсенді бәсекелеседі:</p>\n<p>— <strong>Технологиялық металдар:</strong> Конго Демократиялық Республикасы әлемдік <strong>кобальт өндірісінің 70%-ын</strong> қамтамасыз етеді. Кобальтсыз смартфондар мен электромобильдердің аккумуляторын жасау мүмкін емес.</p>\n<p>— <strong>Дәстүрлі ресурстар:</strong> Нигерия мен Анголадағы мұнай, Оңтүстік Африкадағы алтын мен алмаз, Нигердегі уран — жаhандық нарық үшін стратегиялық маңызы бар.</p>\n<p>— <strong>Инфрақұрылымдық бақылау:</strong> Қытай өзінің «Бір белдеу, бір жол» бастамасы аясында Африка елдеріне миллиардтаған доллар несие беріп, инфрақұрылым сала отырып, ресурстарды экспорттауға <strong>монополиялық артықшылық</strong> алуда.</p>\n\n<p><strong>2. Латын Америкасы: «Жасыл энергетика» және дәстүрлі байлық</strong></p>\n<p>Латын Америкасы – жаhандық энергетикалық ауысудың (қазба отындардан жасыл энергияға өту) басты орталығы:</p>\n<p>— <strong>Мұнай мен мыс:</strong> Венесуэлада әлемдегі ең үлкен дәлелденген мұнай қорлары бар; Чили мен Перу әлемдік мыс нарығын (электроника үшін) бақылайды.</p>\n<p>— <strong>Аграрлық экспансия:</strong> Амазонка ормандарының соя өсіру және ірі қара мал жаю үшін жаппай кесілуі — жаhандық экологиялық апатқа айналуда.</p>\n<p>— <strong>«Литий үшбұрышы»:</strong> Чили, Аргентина және Боливия шекараларында әлемдік литий қорының <strong>50%-дан астамы</strong> орналасқан. Литий — электромобиль аккумуляторлары мен жасыл энергетиканың негізі, оны «<strong>ХХІ ғасырдың ақ алтыны</strong>» деп атайды.</p>\n\n<p><strong>3. Халықаралық факторлардың және экологияның рөлі</strong></p>\n<p>Трансұлттық корпорациялардың (ТҰК) бұл аймақтарға араласуы күрделі салдарларға әкелуде:</p>\n<p>— <strong>Экологиялық апаттар:</strong> Литий мен мыс өндіру орасан зор суды қажет етеді — жергілікті тұщы су көздерінің тартылуына және жерді улануына алып келеді.</p>\n<p>— <strong>Саяси тұрақсыздық:</strong> Үлкен табыс көздері жергілікті үкіметтердегі жемқорлықты ушықтырып, билік үшін қарулы қақтығыстарды тудырады.</p>\n<p>— <strong>Әлеуметтік теңсіздік:</strong> Жергілікті байырғы халықтар (Латын Америкасындағы индейлер немесе Африкадағы тайпалар) экологиялық зардапты бастан кешіре отырып, ресурстық байлықтан аз үлес алады.</p>\n\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Критерий</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Дескриптор (Оқушы не істеуі керек?)</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Балл (1–5)</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Тараптардың мүддесін білдіру</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Өз тобының (ТҰК, Үкімет немесе Белсенділер) мүддесін нақты түсінеді және сол позицияны соңына дейін қорғайды.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Аргументация сапасы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Өз ойын дәлелдеу үшін нақты деректерді, графиктерді немесе экономикалық/экологиялық фактілерді қолданады.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мәселені шешу (Компромисс)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Жобада көрсетілг\nен 3 негізгі мәселе (баланс, табыс бөлінісі, жұмыс орны) бойынша нақты ұсыныстар айтады.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Коммуникациялық дағды</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қарсы тараптың пікірін тыңдай біледі, этиканы сақтайды және орынды сұрақтар қояды.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Шешімнің креативтілігі</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мәселенің өзара тиімді (Win-Win) шешімін табу үшін инновациялық немесе ерекше идеялар ұсынады.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr></tbody></table>\n\n<p><strong>4. Тапсырма: «Литий кеніші» рөлдік ойыны</strong></p>\n<p>Оқушылар 3 топқа бөлінеді:</p>\n<p>— <strong>Трансұлттық корпорация (ТҰК):</strong> Мақсаты – барынша көп пайда табу.</p>\n<p>— <strong>Жергілікті үкімет:</strong> Мақсаты – инвестиция тарту және экономиканы дамыту.</p>\n<p>— <strong>Экологиялық белсенділер:</strong> Мақсаты – суды және байырғы халықтың құқығын қорғау.</p>\n<p>Талқыланатын мәселелер: Экономикалық пайда мен экологиялық зардаптың балансы; кеніштен түскен пайданың қанша пайызы жергілікті халықтың инфрақұрылымына жұмсалуы керек; жұмыс орындарына шетелдік мамандар емес, жергілікті халықты тарту.</p>",
   tru:"<p><strong>23 тема: Геополитическая борьба за ресурсы в Африке и Латинской Америке</strong></p>\n<p>Африка и Латинская Америка — богатейшие по природным ресурсам континенты планеты. Однако это богатство принесло не процветание, а феномен <strong>«ресурсного проклятия»</strong> — политическую нестабильность и неравенство.</p>\n\n<p><strong>1. «Новый раздел» Африки</strong></p>\n<p>Африка владеет около <strong>30% мировых минеральных ресурсов</strong>. Здесь конкурируют США, Китай, ЕС и Россия:</p>\n<p>— <strong>Технологические металлы:</strong> Демократическая Республика Конго обеспечивает <strong>70% мирового производства кобальта</strong> — без него невозможно создание аккумуляторов для смартфонов и электромобилей.</p>\n<p>— <strong>Традиционные ресурсы:</strong> Нефть Нигерии и Анголы, золото и алмазы ЮАР, уран Нигера.</p>\n<p>— <strong>Инфраструктурный контроль:</strong> Китай в рамках «Один пояс — один путь» предоставляет миллиарды в кредит, строит инфраструктуру и получает монопольные права на экспорт ресурсов.</p>\n\n<p><strong>2. Латинская Америка: «Зелёная энергетика» и традиционные богатства</strong></p>\n<p>— <strong>Нефть и медь:</strong> Венесуэла — крупнейшие доказанные запасы нефти в мире; Чили и Перу контролируют мировой рынок меди.</p>\n<p>— <strong>«Литиевый треугольник»:</strong> Чили, Аргентина и Боливия — здесь сосредоточено более <strong>50% мировых запасов лития</strong>. Литий — «<strong>белое золото XXI века</strong>», основа аккумуляторов и зелёной энергетики.</p>\n<p>— <strong>Аграрная экспансия:</strong> Массовая вырубка лесов Амазонки для выращивания сои и разведения скота превращается в глобальную экологическую катастрофу.</p>\n\n<p><strong>3. Роль международных факторов и экологии</strong></p>\n<p>— <strong>Экологические катастрофы:</strong> Добыча лития и меди требует огромного количества воды — истощение местных источников пресной воды.</p>\n<p>— <strong>Политическая нестабильность:</strong> Крупные источники доходов усиливают коррупцию и провоцируют вооружённые конфликты за власть.</p>\n<p>— <strong>Социальное неравенство:</strong> Коренные народы несут экологический ущерб, получая лишь малую долю ресурсного богатства.</p>\n\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Критерий</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Дескриптор (Оқушы не істеуі керек?)</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Балл (1–5)</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Тараптардың мүддесін білдіру</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Өз тобының (ТҰК, Үкімет немесе Белсенділер) мүддесін нақты түсінеді және сол позицияны соңына дейін қорғайды.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Аргументация сапасы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Өз ойын дәлелдеу үшін нақты деректерді, графиктерді немесе экономикалық/экологиялық фактілерді қолданады.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мәселені шешу (Компромисс)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Жобада көрсетілг\nен 3 негізгі мәселе (баланс, табыс бөлінісі, жұмыс орны) бойынша нақты ұсыныстар айтады.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Коммуникациялық дағды</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қарсы тараптың пікірін тыңдай біледі, этиканы сақтайды және орынды сұрақтар қояды.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Шешімнің креативтілігі</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мәселенің өзара тиімді (Win-Win) шешімін табу үшін инновациялық немесе ерекше идеялар ұсынады.</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\"></td></tr></tbody></table>",
   qkk:"«Литий үшбұрышына» кіретін мемлекеттер қайсылар?",
   opts:["A. Бразилия, Мексика, Колумбия", "B. Чили, Аргентина, Боливия", "C. Перу, Венесуэла, Эквадор", "D. Уругвай, Парагвай, Панама"],
   openq:"«Ресурстар қарғысы» дегенді өз сөзіңізбен түсіндіріңіз. Неліктен табиғи байлыққа бай кейбір елдер кедейлікте қалады?",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:24,
   plan:{goal:"Ормуз және Малакка бұғаздарының экономикалық-геосаяси рөлін нақты деректер негізінде саралау және халықаралық шиеленістердің әлемдік сауда ағынына тигізетін ықпалын болжау.",steps:[{t:"Басы",min:"0-7 мин",d:"«Тар арна – кең мүмкіндік пе, әлде үлкен қауіп пе?» деген сұрақтан бастау. Дүниежүзілік картадан 5 негізгі мұхит жолын көрсету."},{t:"Ортасы — Теория",min:"7-20 мин",d:"Ормуз бұғазы (Иран мен Оман арасында) — Парсы шығанағын Араб теңізімен байланыстыратын жалғыз су жолы. Малакка бұғазы (Индонезия, Малайзия, Сингапур арасында) — Үнді және Тынық мұхиттарын байланыстырады."},{t:"Топтық жұмыс",min:"20-38 мин",d:"«Ормуз дағдарысы»: 3 топ — ОПЕК, Тұтынушы елдер, Халықаралық сарапшылар."},{t:"Бекіту",min:"38-45 мин",d:"Сәйкестендіру тапсырмасы. Рефлексия: «Бүгінгі сабақтан алған ең маңызды 1 ақпарат»."}]},
   kk:"Әлемдік мұхит бұғаздары: Малакка және Ормуздың маңызы",
   ru:"Мировые морские проливы: значение Малакки и Ормуза",
   tkk:"<p><strong>24 тақырып: Әлемдік мұхит бұғаздары — геосаяси «күретамырлар»</strong></p><p>Әлемдік сауданың шамамен 80%-ы теңіз жолдары арқылы жүзеге асады. Геосаясатта тар су жолдарын <strong>«Тұншықтыру нүктелері»</strong> деп атайды. Егер осы бұғаздардың біреуі жабылып қалса, әлемдік экономика миллиардтаған доллар шығынға ұшырайды.</p><p><strong>Ормуз бұғазы — жаһандық мұнай экспортын қамтамасыз ететін стратегиялық су жолы</strong></p><p>Ормуз бұғазы (Иран мен Оман арасында) – Парсы шығанағын Араб теңізімен байланыстыратын жалғыз су жолы. Әлемдік теңіз мұнай тасымалының шамамен <strong>30%</strong> (күніне 21 миллион баррельге жуық мұнай) осы бұғаз арқылы өтеді. Иран бұл бұғаздың солтүстік жағалауын бақылайды — бұл оған күшті геосаяси қысым құралы береді.</p><p><strong>Малакка бұғазы — Азияның басты сауда қақпасы</strong></p><p>Малакка бұғазы (Индонезия, Малайзия және Сингапур арасында) — Үнді және Тынық мұхиттарын байланыстыратын әлемдегі ең ірі сауда дәлізі. Жыл сайын бұл бұғаз арқылы <strong>80 мыңнан астам кеме</strong> өтеді — әлемдік теңіз саудасының 25%-ы. Қытай импортының шамамен <strong>80%</strong> осы су жолына тәуелді — бұл «<strong>Малакка дилеммасы</strong>» деп аталады.</p><p><strong>Бұғаздардың салыстырмалы кестесі (күніне млн баррель)</strong></p><p>Ормуз бұғазы: ~21.0 млн баррель | Малакка бұғазы: ~16.0 | Суэц каналы: ~9.0 | Баб-эль-Мандеб: ~6.2</p><p><strong>Қауіп-қатерлер</strong></p><p>— <strong>Теңіз қарақшылығы:</strong> Малакка тарихи түрде қарақшылар үшін қолайлы аймақ болды. — <strong>Экологиялық апаттар:</strong> 2021 жылғы «Ever Given» кемесі Суэц каналын 6 күнге жауып тастап, сағатына 400 миллион доллар шығын әкелді. — <strong>Геосаяси әскерилендіру:</strong> АҚШ-тың 5-ші және 7-ші флоттары аймақтарда шоғырланған.</p>",
   tru:"<p><strong>24 тема: Мировые морские проливы — геополитические «артерии»</strong></p><p>Около 80% мировой торговли идёт морем. <strong>«Точки удушья»</strong> — критически важные проливы, блокада которых парализует мировую экономику. <strong>Ормузский пролив</strong> (между Ираном и Оманом) — единственный выход из Персидского залива, через него проходит ~30% морских нефтеперевозок (21 млн баррелей/день). <strong>Малаккский пролив</strong> (Индонезия–Малайзия–Сингапур) — главный путь из Индийского в Тихий океан; ежегодно через него проходит 80 000+ судов (25% мировой морской торговли). «<strong>Малаккская дилемма</strong>» Китая: ~80% импорта зависит от этого пролива.</p>",
   qkk:"Геосаясатта стратегиялық маңызы бар тар су жолдарын қалай атайды?",
   opts:["A. Навигациялық нүктелер","B. Тұншықтыру нүктелері","C. Транзиттік аймақтар","D. Теңіздік коридорлар"],
   openq:"Егер Ормуз бұғазы бір айға жабылып қалса, әлемдік экономикада не болады? Логикалық тізбек құрастырыңыз (кемінде 4 қадам).",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:25,
   plan:{goal:"Суэц және Панама каналдарының геосаяси және экономикалық маңызын түсіндіру, олардың ұқсастықтары мен айырмашылықтарын талдау.",steps:[{t:"Ұйымдастыру",min:"3 мин",d:"Оқушыларға адамның қанайналым жүйесі мен әлемдік картаның суретін қатар көрсету. Сұрақ: «Егер тамыр бітелсе не болады?»"},{t:"Визуалды таныстырылым",min:"7 мин",d:"Каналдардың салыну тарихы мен қазіргі жүктемесі туралы ақпарат."},{t:"Топтық жұмыс",min:"15 мин",d:"«Египет лоцмандары» (Суэц) және «Панама инженерлері» топтары — өз каналының 3 артықшылығы мен 1 басты қауіпін қорғайды."},{t:"Венн диаграммасы",min:"10 мин",d:"Екі каналдың ортақ қасиеттері мен ерекшеліктерін салыстыру."},{t:"Бекіту",min:"10 мин",d:"Салыстырмалы кесте толтыру. «Логикалық тізбек» тапсырмасы."}]},
   kk:"Суэц және Панама каналдары: Әлемдік сауданың қос күретамыры",
   ru:"Суэцкий и Панамский каналы: двойная артерия мировой торговли",
   tkk:"<p><strong>25 тақырып: Суэц және Панама каналдары — әлемдік сауданың қос күретамыры</strong></p><p>Адам ағзасы үшін қан тамырлары қандай маңызды болса, қазіргі жаһандық экономика үшін Суэц пен Панама каналдары дәл сондай рөл атқарады.</p><p><strong>Суэц каналы: Еуропа мен Азияның «алтын көпірі»</strong></p><p>Мысыр жерінде орналасқан Суэц каналы Жерорта теңізі мен Қызыл теңізді жалғайды. Бұл канал салынбас бұрын кемелер Еуропадан Азияға жету үшін бүкіл Африка құрлығын айналып өтуге мәжбүр болатын. Суэц жолы бұл қашықтықты шамамен <strong>9 000 шақырымға</strong> қысқартты. Бүгінде әлемдік теңіз саудасының шамамен <strong>12%</strong> осы канал арқылы өтеді.</p><p><strong>«Инфаркт» мысалы:</strong> 2021 жылы «Ever Given» алып контейнер тасушы кемесі каналда кептеліп, небәрі <strong>6 күнге</strong> жабылуы әлемдік саудаға сағатына <strong>400 миллион доллар</strong> шығын әкелді!</p><p><strong>Панама каналы: Тауларды бағындырған су жолы</strong></p><p>Панама каналы Атлант және Тынық мұхиттарын қосады. Ол жай ғана қазылған арық емес — теңіз деңгейінен жоғары орналасқандықтан, арнайы <strong>шлюздер жүйесін</strong> қолданады. Кемелер сөзбе-сөз тауды, биіктігі 26 метр болатын жерді «жүзіп» өтеді! Бұл канал жолды шамамен <strong>15 000 шақырымға</strong> қысқартты.</p><p><strong>Салыстырмалы кесте</strong></p><p>Суэц каналы: жолды 9 000 км-ге қысқартады, Жерорта+Қызыл теңіздерді жалғайды, ашық арна (шлюзсіз), басты проблемасы — геосаяси қақтығыстар.</p><p>Панама каналы: жолды 15 000 км-ге қысқартады, Атлант+Тынық мұхиттарын жалғайды, шлюздер жүйесі (сатылы), басты проблемасы — климат (судың тартылуы).</p><p><strong>Қазіргі қауіптер</strong></p><p>— <strong>Климаттың өзгеруі:</strong> Панама каналы жұмыс істеуі үшін тұщы су қажет. Соңғы жылдардағы құрғақшылық каналдағы су деңгейін төмендетіп, өтетін кемелер санын шектеуге мәжбүр етті. — <strong>Геосаясат:</strong> Қызыл теңіздегі саяси тұрақсыздықтар Суэц арқылы жүретін кемелерге қауіп төндіруде.</p>",
   tru:"<p><strong>25 тема: Суэцкий и Панамский каналы — двойная артерия мировой торговли</strong></p><p><strong>Суэцкий канал</strong> соединяет Средиземное море с Красным, сокращая путь из Европы в Азию на ~9 000 км (12% мировой морской торговли). В 2021 году блокировка на 6 дней из-за «Ever Given» обошлась мировой торговле в $400 млн/час. <strong>Панамский канал</strong> соединяет Атлантический и Тихий океаны, сокращая путь на ~15 000 км. Использует шлюзы высотой 26 м. Главные угрозы: для Суэца — геополитика (нестабильность в Красном море); для Панамы — изменение климата (засуха снижает уровень воды).</p>",
   qkk:"Суэц каналы арқылы өтетін «Ever Given» кемесі каналды қанша күн жауып тастады?",
   opts:["A. 3 күн","B. 6 күн","C. 14 күн","D. 21 күн"],
   openq:"Суэц каналы 1 айға жабылып қалса, әлемде не өзгереді? Төмендегі тізбекті логикалық ретпен орналастырыңыз: кемелер Африканы айналып өтеді → жеткізу уақыты ұзарады → тауарлар бағасы қымбаттайды → инфляция күшейеді.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:26,
   plan:{goal:"Оқушыларға «Бір белдеу – бір жол» (BRI) жобасының маңызын, Қазақстанның транзиттік әлеуетін және жаһандық саудадағы өзгерістерді түсіндіру.",steps:[{t:"Ұйымдастыру",min:"3 мин",d:"Сәлемдесу, түгендеу. Психологиялық ахуал орнату."},{t:"Қызығушылықты ояту",min:"5 мин",d:"«Көне Жібек жолы» бейнеролигі немесе суретін көрсету. Сұрақ: Бұл жол бүгін қалай аталады?"},{t:"Жаңа тақырып",min:"15 мин",d:"Бастаманың 2 бағытын түсіндіру: 1. Жібек жолы экономикалық белдеуі (құрлық). 2. Теңіз Жібек жолы."},{t:"Талдау жұмысы",min:"10 мин",d:"Кестемен жұмыс. Инвестициялық көрсеткіштерді талдау."},{t:"Бекіту",min:"7 мин",d:"Сұрақ-жауап. «Қорғас» хабының маңызы."},{t:"Бағалау",min:"5 мин",d:"Кері байланыс. Үй тапсырмасы."}]},
   kk:"«Бір белдеу – бір жол» жобасының экономикалық мәні",
   ru:"«Один пояс – один путь»: экономическое значение проекта",
   title:"«Бір белдеу – бір жол» жобасының экономикалық мәні",
   type:"Жобалық",
   tkk:"<p><strong>Тақырып: «Бір белдеу – бір жол»: ХХІ ғасырдың Жібек жолы және жаһандық сауданың жаңа тамыры</strong></p>\n\n<p>Ежелгі Жібек жолы ғасырлар бойы Батыс пен Шығысты қалай байланыстырса, қазіргі «Бір белдеу – бір жол» (БББЖ) мегажобасы да бүгінгі жаһандық экономиканың жаңа қан тамырына айналып келеді. Бұл – құрлықтарды тұтастырып, сауданы жеделдеткен, инвестиция мен технологияны тасымалдайтын тарихтағы ең ірі экономикалық бастамалардың бірі.</p>\n\n<p><strong>1. Жібек жолының экономикалық «Белдеуі»: Құрлықтағы темір тұлпарлар</strong></p>\n<p>Бұл – Қытайдан басталып, Орталық Азия (соның ішінде Қазақстан) мен Ресей арқылы Еуропаға жететін теміржолдар мен тасжолдар желісі.</p>\n<p>— <strong>Уақытты алтынға балау:</strong> Бұрын Қытайдан Еуропаға тауарды теңіз арқылы жеткізуге шамамен 45-60 күн кетсе, жаңа құрлықтық теміржол дәліздері бұл уақытты 12-15 күнге дейін қысқартты.</p>\n<p>— <strong>Тиімділік:</strong> Бұл ұшақпен тасымалдағаннан әлдеқайда арзан, ал теңізбен тасымалдағаннан әлдеқайда жылдам.</p>\n\n<p><strong>2. ХХІ ғасырдағы Теңіз «Жолы»: Мұхиттарды жалғаған порттар</strong></p>\n<p>Егер «белдеу» құрлықты көктей өтсе, «жол» – Оңтүстік-Шығыс Азия, Үндістан, Африка және Таяу Шығыс жағалауларындағы порттарды жаңғыртуға бағытталған теңіз маршруты.</p>\n<p>— <strong>Жаһандық қамту:</strong> Жоба әлем халқының 60%-ын және жаһандық ЖІӨ-нің үштен бірін қамтитын 150-ден астам елді байланыстырады.</p>\n\n<p><strong>Қазақстан – жобаның «Алтын ілгегі»</strong></p>\n<p>— <strong>Транзиттік хаб:</strong> Қытайдан Еуропаға баратын құрлықтағы ең қысқа жол біздің еліміз арқылы өтеді. «Қорғас» құрғақ порты мен Ақтау теңіз порты осы жаһандық сауданың қайнаған нүктесіне айналды.</p>\n<p>— <strong>Табыс көзі:</strong> Еліміз арқылы өткен әрбір транзиттік пойыз бен жүк көлігі мемлекет қазынасына қыруар табыс әкеледі және мыңдаған жаңа жұмыс орындарын ашады.</p>\n\n<p><strong>Сын-қатерлер</strong></p>\n<p>1. <strong>Қарыз тұзағы:</strong> Инфрақұрылым салу үшін қыруар несие алған кейбір дамушы елдер қарызын қайтара алмай, стратегиялық нысандарын басқару құқығынан айырылып қалу қаупінде.</p>\n<p>2. <strong>Геосаяси бәсеке:</strong> Жобаның тым үлкен ықпалы Батыс елдері (АҚШ, Еуропа) тарапынан алаңдаушылық тудырып, жаһандық экономикалық бәсекелестікті күшейтті.</p>\n\n<p><strong>Салыстырмалы кесте: Көне Жібек жолы vs «Бір белдеу – бір жол»</strong></p>\n<table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Көрсеткіш</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Көне Жібек жолы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Жаңа «Бір белдеу – бір жол»</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Негізгі көлік</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Түйелер, аттар</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Контейнерлік пойыздар, кемелер</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Инфрақұрылым</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Керуен сарайлар</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Логистикалық хабтар, порттар, АЭА</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">География</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Еуразия құрлығы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Бүкіл әлем (Жаһандық)</td></tr></tbody></table>\n\n<p><strong>Бекіту тапсырмасы: «Логикалық тізбек»</strong></p>\n<p>Жағдаят: Орталық Азия арқылы өтетін жаңа халықаралық теміржол дәлізі толық іске қосылды делік. Төмендегі тізбекті себеп-салдарлық ретпен орналастырыңыз:</p>\n<p>А) Жергілікті халық үшін жаңа жұмыс орындары ашылып, тұрмыс деңгейі жақсарады.<br>Ә) Қытайдан Еуропаға тауарларды жеткізу уақыты екі есеге қысқарады.<br>Б) Еуразия құрлығын кесіп өтетін жаңа жоғары жылдамдықты теміржол іске қосылды.<br>В) Транзитпен өтетін елдер (мысалы, Қазақстан) инфрақұрылымды пайдаланғаны үшін үлкен көлемде салық пен табыс таба бастайды.<br>Г) Жылдам жеткізудің арқасында Еуропа мен Азия арасындағы сауда-саттық көлемі күрт артады.</p>\n<p><strong>Дұрыс реттілігі:</strong> 1-........ (Бастапқы оқиға) 2-........ (Тікелей нәтижесі) 3-........ (Саудаға әсері) 4-........ (Транзиттік елдің пайдасы) 5-........ (Түпкілікті әлеуметтік нәтиже)</p>\n\n<p><strong>Үй тапсырмасы:</strong> «Қазақстан – Жаңа Жібек жолының жүрегі» тақырыбына қысқаша эссе жазу және картаға 6 негізгі экономикалық дәлізді белгілеу.</p>",
   tru:"<p><strong>Тема 26: «Один пояс – один путь»: экономическое значение проекта</strong></p><p>Проект BRI объединяет более 150 стран, охватывает свыше 60% населения мира и треть мирового ВВП. Казахстан занимает ключевое транзитное положение: через страну проходит кратчайший путь из Китая в Европу. Порт Хоргос и Актауский морской порт — стратегические узлы проекта. Главные риски: долговая ловушка для развивающихся стран и геополитическая конкуренция со стороны Запада.</p>",
   qt:[{q:"«Бір белдеу – бір жол» бастамасы қанша мемлекетті біріктіреді?",a:["A. 50-ден астам","B. 100-ден астам","C. 150-ден астам","D. 200-ден астам"],c:2},{q:"Қытайдан Еуропаға теміржол арқылы жеткізу қанша күн алады?",a:["A. 5-7 күн","B. 12-15 күн","C. 30-35 күн","D. 45-60 күн"],c:1},{q:"«Қорғас» не болып табылады?",a:["A. Теңіз порты","B. Әуежай","C. Құрғақ порт (логистикалық хаб)","D. Мұнай терминалы"],c:2},{q:"«Қарыз тұзағы» дегеніміз не?",a:["A. Банктік несие алу тәсілі","B. Қарызын өтей алмай, стратегиялық нысандарын жоғалту қаупі","C. Экспорт салығы","D. Валюта айырбастау механизмі"],c:1}],
   openq:"«Бір белдеу – бір жол» жобасы Қазақстан үшін мүмкіндік пе, әлде қауіп пе? Өз пікіріңді 3 дәлелмен негізде.",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:27,
   plan:{goal:"Тайваньның жаһандық микрочип нарығындағы үлесін (TSMC) талдау және Тайвань бұғазындағы шиеленістің әлемдік сауда ағынына тигізетін ықпалын болжау.",steps:[{t:"Ұйымдастыру",min:"0-7 мин",d:"«Кішкентай арал әлемдік алыптарды қалай басқарып отыр?» деген сұрақтан бастау."},{t:"Деректерді талдау",min:"7-20 мин",d:"Тайвань — жаһандық технологиялық «күретамыр». TSMC-нің 90%-дық үлесі. «Кремний қалқаны» термині."},{t:"Тапсырма",min:"20-38 мин",d:"Кесте мен деректерді салыстыра отырып, Тайваньның әлемдік технология нарығындағы үлесін анықтау."},{t:"Бекіту",min:"38-45 мин",d:"«Сәйкестендіру» тапсырмасы. Рефлексия."}]},
   tkk:"<p><strong>27 тақырып: Тайвань мәселесінің технологиялық және саяси маңызы</strong></p><p><strong>1. Мәселенің геосаяси және экономикалық алғышарттарына кіріспе</strong></p><p>Тайвань – Шығыс Азиядағы шағын арал болғанымен, ол қазіргі әлемдік экономика мен геосаясаттың ең үлкен әрі ең күрделі түйініне айналды.</p><p>Егер Тайвань айналасында қандай да бір қақтығыс немесе саяси блокада басталса, әлемдік экономика триллиондаған доллар шығынға ұшырап, ғаламдық технологиялық тоқырау орнайды.</p><p>Бүгінгі таңда бұл арал үшін АҚШ пен Қытай арасында қатаң бәсекелестік жүріп жатыр. Қытай Тайваньды өзінің ажырамас бөлігі деп санап, \"Бір Қытай\" саясатын ұстанады. Ал АҚШ аралдың қорғаныс қабілетін қолдай отырып, аймақтағы өз ықпалы мен технологиялық үстемдігін сақтауға тырысады.</p><p><strong>2. Жартылай өткізгіштер – XXI ғасырдың жаңа «мұнайы»</strong></p><p>Тайвань – жаһандық технологиялық тізбектің абсолютті көшбасшысы. TSMC (Taiwan Semiconductor Manufacturing Company) сияқты компаниялар әлемдік жоғары технологиялық чиптердің басым бөлігін өндіреді. Әлемдегі ең озық микрочиптердің шамамен <strong>90%-ы</strong> осы Тайваньда жасалады.</p><p><strong>«Кремний қалқаны» (Silicon Shield):</strong> Тайваньның чип өндірісіндегі монополиясы оның басты қауіпсіздік кепілі болып саналады. Себебі аралға жасалған кез келген шабуыл жаһандық экономиканы чипсіз қалдырады.</p><table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Ел / Аймақ</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Нарықтағы үлесі</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Стратегиялық маңызы</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Тайвань (TSMC)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">~ 90%</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Жаһандық технологияның абсолютті монополисі</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Оңтүстік Корея</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">~ 10%</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Негізгі бәсекелес, жад чиптерін өндіруші</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">АҚШ</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">0%</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Басты тұтынушы, дизайн мен патенттердің иесі</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қытай</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Әзірге төмен</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Ең ірі тұтынушы нарық және Тайваньға негізгі геосаяси үміткер</td></tr></tbody></table><p><strong>3. Тайвань бұғазы – сауда мен әскери қауіпсіздік дәлізі</strong></p><p>Тайвань аралы Оңтүстік Қытай теңізі мен Шығыс Қытай теңізін байланыстыратын аса маңызды стратегиялық нүктеде орналасқан. Жыл сайын әлемдік контейнерлік тасымалдау флотының жартысына жуығы Тайвань бұғазы арқылы өтеді.</p><p><strong>4. Халықаралық факторлар және эскалация қаупі</strong></p><p>Егер соғыс немесе блокада басталса, Apple, Nvidia, Tesla сияқты корпорациялардың өндірісі тоқтайды. Бұл жаһандық инфляцияны шарықтатып, рецессияға алып келеді. Аймақтық қарулану жарысы Жапония, Оңтүстік Корея және Австралия сияқты елдердің қорғаныс бюджетін арттырып, Тынық мұхиты аймағындағы шиеленісті күшейтуде.</p>",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:28,
   plan:{goal:"Көлік дәліздерінің жаһандық экономикадағы маңызын түсіну. Негізгі жаһандық көлік жобаларының артықшылықтары мен кедергілерін салыстыру. Болашақ даму трендтерін талдау.",steps:[{t:"Ұйымдастыру",min:"5 мин",d:"Миға шабуыл: «Көлік дәлізі дегеніміз не?»"},{t:"Жаңа тақырыпты меңгеру",min:"20 мин",d:"«Жаһандық жобалар» кестесімен жұмыс. «Болашақ логистикасы» талқылауы."},{t:"Білімді бекіту",min:"15 мин",d:"Сәйкестендіру тапсырмасы. Өзін-өзі тексеруге арналған тест."},{t:"Қорытынды",min:"5 мин",d:"Рефлексия. Үй тапсырмасы: «Қазақстанның транзиттік әлеуетін қалай дамытар едім?»"}]},
   tkk:"<p><strong>28 тақырып: Көлік дәліздерінің болашағы мен жаңа мүмкіндіктері</strong></p><p><strong>1. Кіріспе: Көлік дәлізі — жаһандық экономиканың күретамыры</strong></p><p>Қазіргі жаһандану дәуірінде көлік дәліздері мемлекеттер арасындағы тауар айналымын қамтамасыз етіп қана қоймай, саяси ықпал етудің стратегиялық құралына айналды. Заманауи логистика теңіз, теміржол және автокөлік жолдарының біртұтас жүйеге бірігуін талап етеді. Негізгі транзиттік жолдарды бақылаушы тарап сол аймақтағы экономикалық және саяси процестерге тікелей әсер ете алады.</p><p><strong>2. Негізгі жаһандық жобалар</strong></p><table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Дәліз атауы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Бағыты</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Артықшылығы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Кедергілері</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">«Бір белдеу – бір жол» (Қытай)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қытай — Орталық Азия — Еуропа</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Орасан зор инвестиция, инфрақұрылымның жаңаруы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Геосаяси тәуелділік қаупі</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Транскаспий (Орта дәліз)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қытай – Қазақстан – Әзірбайжан – Грузия – Түркия</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Ресейді айналып өту, уақытты үнемдеу (15-25 күн)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Шекарадағы бюрократия, Каспий теңізіндегі логистика</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">«Солтүстік – Оңтүстік»</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Үндістан – Иран – Ресей</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Үнді мұхитынан Еуропаға ең қысқа жол</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Иранға қарсы санкциялар, техникалық инфрақұрылым</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Солтүстік теңіз жолы</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Арктика арқылы (Ресей жағалауы)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Суэц каналына балама, өте қысқа қашықтық</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мұзжарғыш кемелердің қажеттілігі, экологиялық қауіптер</td></tr></tbody></table><p><strong>3. Болашаққа арналған жаңа мүмкіндіктер</strong></p><p><strong>Цифрландыру және Инновация:</strong> Блокчейн технологиясы құжат айналымын жеделдетсе, «ақылды логистика» жасанды интеллект пен Big Data негізінде жұмыс істейді. Автономды терминалдар адам факторынан болатын қателіктерді 40%-ға азайтады.</p><p><strong>Мультимодалдылық:</strong> Теңіз, теміржол және әуе жолдарын бір жүйеге біріктіру.</p><p><strong>Экология және «Жасыл» дәліздер:</strong> Сутегімен немесе электр қуатымен жүретін көліктерді қолдану халықаралық бәсекеге қабілеттіліктің басты факторына айналмақ.</p><p><strong>Қазақстанның рөлі:</strong> Қазақстан «Land-locked» елден «Land-linked» стратегиялық хабқа айналып жатқанымен, Қорғас сияқты порттар арқылы геосаяси қауіпсіздігін нығайтуда.</p>",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:29,
   plan:{goal:"Трансшекаралық өзендердің халықаралық құқықтық мәртебесін түсіну, Орталық Азия елдеріндегі су-энергетикалық мәселелерді талдау және шешу жолдарын ұсыну.",steps:[{t:"Сабақтың басы",min:"7 мин",d:"«Миға шабуыл» әдісі: «Су – бейбітшілік көзі ме, әлде болашақ соғыстардың себебі ме?»"},{t:"Жаңа материалды меңгеру",min:"25 мин",d:"«Джигсо» әдісі: 3 топ — Халықаралық конвенциялар, Орталық Азиядағы су-энергетикалық қайшылық, Болашақ қауіптер. «SWOT талдау»."},{t:"Бекіту және Рефлексия",min:"13 мин",d:"Сәйкестендіру тесті. «Екі жұлдыз, бір тілек» рефлексиясы."}]},
   tkk:"<p><strong>29 тақырып: Трансшекаралық өзендердегі суды бөлісу мәдениеті</strong></p><p><em>Халықаралық құқықтық мәртебесі және Орталық Азиядағы болашақ қауіптері</em></p><p>Трансшекаралық өзендер – екі немесе одан да көп мемлекеттің аумағын кесіп өтетін су артериялары. Қазіргі таңда әлемде 260-тан астам халықаралық өзен бассейндері бар және Жер шары халқының шамамен 40%-ы осы бассейндерде өмір сүреді. Су – жай ғана табиғи ресурс емес, ол экономикалық дамудың, азық-түлік қауіпсіздігінің және ұлттық қауіпсіздіктің іргетасы.</p><p><strong>I. Халықаралық трансшекаралық өзендердің құқықтық мәртебесі</strong></p><p>Қазіргі уақытта трансшекаралық суларды пайдалануды реттейтін екі негізгі халықаралық құжат бар: <strong>1992 жылғы БҰҰ ЕЭК-нің Хельсинки конвенциясы</strong> және <strong>1997 жылғы БҰҰ-ның халықаралық су ағындары туралы конвенциясы.</strong></p><p>Бұл келісімдер үш іргелі қағидатты бекітті:</p><p>— <strong>Әділетті және ақылға қонымды пайдалану қағидаты:</strong> Өзеннің бойында орналасқан әрбір мемлекет суды пайдалануға тең құқылы.</p><p>— <strong>Айтарлықтай зиян келтірмеу қағидаты:</strong> Жоғарғы ағыстағы елдердің әрекеті төменгі ағыстағы көршілердің экологиясы мен экономикасына нұқсан келтірмеуі тиіс.</p><p>— <strong>Міндетті ынтымақтастық және ақпарат алмасу:</strong> Жағалаудағы мемлекеттер тұрақты түрде гидрологиялық деректермен алмасып, бірлескен комиссиялар құруы тиіс.</p><p><strong>II. Орталық Азиядағы су-энергетикалық қайшылық</strong></p><p>Орталық Азия – әлемдегі су ресурстарына деген тәуелділігі ең жоғары аймақ. Аймақтың негізгі тіршілік көзі – Сырдария мен Әмудария өзендері.</p><p>— <strong>Жоғарғы ағыс (Қырғызстан, Тәжікстан):</strong> Бұл елдердің экономикасы гидроэнергетикаға сүйенеді. Оларға суды қыс айларында электр энергиясын өндіру үшін босатқан тиімді.</p><p>— <strong>Төменгі ағыс (Қазақстан, Өзбекстан, Түрікменстан):</strong> Бұл елдер үшін өзен сулары жазғы вегетациялық кезеңде, миллиондаған гектар алқаптарды суару үшін өте қажет.</p><p><strong>III. Болашақ қауіптер</strong></p><p><strong>Климаттың өзгеруі:</strong> Памир және Тянь-Шань тауларындағы мұздықтар қарқынды түрде еріп жатыр. Сарапшылардың болжамынша 2030-2050 жылдары өзендердің сулылығы күрт төмендейді.</p><p><strong>Қош Тепа каналы:</strong> Ауғанстанда салынып жатқан 285 км Қош Тепа каналы Әмудариядан жылына шамамен 10 текше шақырым су алуды көздеп отыр. Бұл Өзбекстан мен Түрікменстанға келетін су көлемін қатты қысқартып, экологиялық апат тудыруы мүмкін.</p><p><strong>Тиімді шешімдер:</strong> Халықаралық су-энергетикалық консорциум құру, суды үнемдейтін агротехнологияларды субсидиялау және бірыңғай цифрлық су мониторингі жүйесін енгізу.</p>",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:30,
   plan:{goal:"Орталық Азиядағы су ресурстарының геосаяси және экономикалық маңызын түсіндіру. Трансшекаралық өзендердегі мүдделер қақтығысын талдау. Су тапшылығын шешудің инновациялық жолдарын ұсыну.",steps:[{t:"Ұйымдастыру",min:"5 мин",d:"Миға шабуыл: «Неліктен Орталық Азияда суды «көгілдір алтын» деп атайды?»"},{t:"Жаңа тақырыпты меңгеру",min:"20 мин",d:"«Трансшекаралық өзендер» кестесімен жұмыс. «Болашақ шешімдері» талқылауы."},{t:"Білімді бекіту",min:"15 мин",d:"Сәйкестендіру тапсырмасы. Тест: жылдам сұрақ-жауап."},{t:"Қорытынды",min:"5 мин",d:"Рефлексия. Үй тапсырмасы: «2050 жылғы Орталық Азия: су тапшылығын қалай жеңдік?»"}]},
   tkk:"<p><strong>30 тақырып: Орталық Азиядағы су мәселесі мен Сырдария мен Әмудария тағдыры</strong></p><p><strong>1. Кіріспе: Су – Орталық Азиядағы тіршілік пен тұрақтылықтың негізі</strong></p><p>Қазіргі жаһандық жылыну мен климаттың өзгеруі жағдайында су ресурстары Орталық Азия үшін тек экологиялық емес, ең басты экономикалық және саяси мәселеге айналды. Аймақтағы 70 миллионнан астам халықтың өмірі екі үлкен трансшекаралық өзен – Сырдария мен Әмударияға тікелей тәуелді.</p><p><strong>2. Негізгі трансшекаралық өзендер мен қауіптер</strong></p><table style=\"width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden\"><thead><tr><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Өзен атауы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Бағыты</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Экономикалық маңызы</th><th style=\"background:#4f46e5;color:#fff;padding:7px 10px;font-size:11px;font-weight:700;text-align:left\">Негізгі кедергілер</th></tr></thead><tbody><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Сырдария</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Тянь-Шань → Қырғызстан → Өзбекстан → Тәжікстан → Қазақстан</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Егістіктерді суару, су электр станциялары (Тоқтағұл, Шардара)</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Климаттың жылынуы, суару жүйелерінің ескіруі, су бөлу квоталарының бұзылуы</td></tr><tr><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Әмудария</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Памир → Тәжікстан → Ауғанстан → Өзбекстан → Түрікменстан</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Мақта шаруашылығы, халықты ауыз сумен қамту</td><td style=\"padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px\">Қос-Тепе каналы (судың 20-30%-ын бұру қаупі), қатты құрғақшылық</td></tr></tbody></table><p>Орталық Азиядағы тұщы судың <strong>90%-ы</strong> ауыл шаруашылығына жұмсалады. Соңғы 50 жылда мұздықтардың <strong>30%-ы</strong> еріп кеткен. Ауғанстан салып жатқан <strong>285 км</strong> Қос-Тепе каналы су тапшылығын еселейді. Дәстүрлі арықпен суару кесірінен судың <strong>40-50%-ы</strong> егістікке жетпей буланады.</p><p><strong>3. Болашаққа арналған жаңа мүмкіндіктер мен шешім жолдары</strong></p><p><strong>Су үнемдеуші агротехнологиялар:</strong> Израиль мен Австралия тәжірибесіне сүйену. Тамшылатып суару арқылы суды 50%-ға дейін үнемдеп, өнімділікті 2 есе арттыруға болады.</p><p><strong>Цифрландыру және «Ақылды су»:</strong> Өзендер мен каналдарға IoT сенсорларын орнату арқылы судың нақты уақыттағы көлемін бақылау.</p><p><strong>Су-Энергетикалық Консорциум:</strong> Жоғарғы ағыстағы елдер қыста суды жинап, жазда төменгі ағысқа жіберуі үшін, төменгі ағыстағы елдер оларды қыста электр энергиясымен немесе газбен қамтамасыз етуі керек.</p><p><strong>Арал теңізін қалпына келтіру:</strong> Кіші Аралды сақтап қалу (Көкарал бөгеті арқылы) Қазақстанның басты жетістігі болды. Құрғап қалған теңіз түбіне сексеуіл отырғызу арқылы тұзды шаң дауылдарын тоқтату жүйесі қалыптасуда.</p>",
   mapq:'',mapDots:[],mapOpts:[]},
  {id:32,
   plan:{goal:"Оқушылардың Меконг өзені мысалында гидросаясат пен су дипломатиясының негіздерін зерттеуі, халықаралық қақтығыстарды бейбіт жолмен шешудің коммуникативтік стратегияларын меңгеруі.",steps:[{t:"Кіріспе",min:"7 мин",d:"Проблемалық ситуация: «Бір өзен неліктен 60 миллион адамның азық-түлігін, алты мемлекеттің экономикасын байлап тұр?»"},{t:"Негізгі бөлім",min:"25 мин",d:"«Дипломатиялық саммит» рөлдік-зерттеу ойыны: 3 топ — Жоғарғы ағыс елдері, Төменгі ағыс елдері, Тәуелсіз халықаралық сарапшылар."},{t:"Қорытынды",min:"8 мин",d:"«Екі жұлдыз, бір тілек» бағалауы. Рефлексия: «Бүгінгі сабақта мен судың тек ресурс қана емес, сонымен қатар ... екенін түсіндім»"}]},
   tkk:"<p><strong>32 тақырып: Меконг өзені арқылы Оңтүстік-Шығыс Азия дипломатиясы</strong></p><p>Меконг өзені – Тибет үстіртінен бастау алып, Қытай, Мьянма, Лаос, Таиланд, Камбоджа және Вьетнам секілді алты мемлекеттің аумағын басып өтіп, Оңтүстік Қытай теңізіне құятын алып өзен. <strong>60 миллионнан астам адамның</strong> негізгі тіршілік көзі болып табылады. Бұл тақырып «су дипломатиясы» мен «гидросаясат» ұғымдарының іс жүзінде қалай жұмыс істейтінін көрсетеді.</p><p><strong>Жоғарғы ағыс vs Төменгі ағыс — Мүдделер қақтығысы</strong></p><p>— <strong>Жоғарғы ағыс (Қытай мен Лаос):</strong> Лаос үкіметі өзін «Азияның батареясы» ретінде қалыптастырып, көрші елдерге электр қуатын экспорттау мақсатында өзен бойында ондаған ірі СЭС-тер салып жатыр. Қытай да өзінің аумағында бірнеше алып бөгеттер жүйесін тұрғызды.</p><p>— <strong>Төменгі ағыс (Камбоджа мен Вьетнам):</strong> Камбоджа халқының негізгі азық-түлік және ақуыз көзі – Тонлесап көліндегі балық шаруашылығы. Вьетнамның оңтүстігіндегі Меконг атырауы бүкіл мемлекеттің «күріш қамбасы» саналады. Жасанды бөгеттер салдарынан балық аулау көлемі күрт азайып, мыңдаған гектар егістік алқаптары жарамсыз болып қалуда.</p><p><strong>Халықаралық институттық механизмдер</strong></p><p><strong>1995 жылы Меконг өзені комиссиясы (MRC)</strong> құрылды. Бұл комиссияға Таиланд, Лаос, Камбоджа және Вьетнам мүше болып кіреді. Бірақ ең үлкен осал тұсы – өзеннің бастауында тұрған Қытай мен Мьянманың бұл ұйымға толыққанды мүше болмауы.</p><p>Қытай «Ланьцан-Меконг ынтымақтастығы» (LMC) атты жаңа балама платформаны іске қосты. Халықаралық сарапшылар мұны «гидрогегемония» орнату амалы деп бағалайды.</p><p><strong>Геосаяси аспект: АҚШ пен Қытайдың бәсекелестігі</strong></p><p>АҚШ «Меконг-АҚШ серіктестігі» сияқты бағдарламалар арқылы төменгі ағыстағы елдердің экологиялық тәуелсіздігін қолдап, Қытайдың үстемдігін тежеуге бағытталған дипломатиялық қадамдар жасауда. Осылайша, Меконг мәселесі тек аймақтық ауқымнан шығып, жаһандық геосаяси бәсекелестік алаңына айналды.</p><p>Бұл аймақтағы ұзақ мерзімді тұрақтылық мемлекеттердің ортақ экологиялық жауапкершілік пен халықаралық құқыққа негізделген консенсусқа келе алуына тікелей тәуелді.</p>",
   mapq:'',mapDots:[],mapOpts:[]}
];

let ST = { lang:'kk', tab:0, view:'list', detIdx:0, taskIdx:0, currentUser:null, mapAnswers:{}, selectedMapOpt:null };
let isRegMode = false;

setTimeout(() => {
  const loading = document.getElementById('loadingScreen');
  if (loading && !loading.classList.contains('fade-out') && !ST.currentUser) showAuthScreen();
}, 3000);

function hideLoading(){
  const ls = document.getElementById('loadingScreen');
  ls.classList.add('fade-out');
  setTimeout(()=>{ ls.style.display='none'; }, 450);
}

// Welcome screen → Auth screen transition
function showAuthScreen(){
  hideLoading();
  document.getElementById('mainScreen').classList.remove('active');
  
  document.getElementById('programScreen').classList.remove('active');
  // Тіркелмеген / шыққан адам — тікелей авторизацияға
  document.getElementById('authScreen').classList.add('active');
  document.getElementById('inLogin').value='';
  document.getElementById('inPass').value='';
  document.getElementById('authErr').textContent='';
  setAuthMode(false);
}
function setAuthMode(reg){
  isRegMode = reg;
  document.getElementById('tabLogin').classList.toggle('act', !reg);
  document.getElementById('tabReg').classList.toggle('act', reg);
  document.getElementById('regExtra').classList.toggle('hidden', !reg);
  document.getElementById('authBtn').textContent = reg ? 'Тіркелу' : 'Кіру';
  document.getElementById('authErr').textContent = '';
  document.getElementById('authErr').classList.remove('ok');
}
async function doAuth(){
  const email = document.getElementById('inLogin').value.trim();
  const pass  = document.getElementById('inPass').value.trim();
  const clsRaw = document.getElementById('inClass').value.trim();
  const cls   = normalizeClassName(clsRaw);
  const invite = document.getElementById('inInvite')?.value.trim() || '';
  const err   = document.getElementById('authErr');
  const btn   = document.getElementById('authBtn');
  err.textContent = '';
  err.classList.remove('ok');
  if(!email){ err.textContent='Email енгізіңіз!'; return; }
  if(!pass) { err.textContent='Пароль енгізіңіз!'; return; }
  if(isRegMode && !cls){ err.textContent='Сыныпты дұрыс жазыңыз, мысалы: 10A'; return; }
  if(isRegMode && !/^[A-Za-z0-9-]{6,40}$/.test(invite)){ err.textContent='Мұғалім берген тіркелу кодын енгізіңіз.'; return; }
  btn.textContent = '⏳ Жүктелуде...';
  btn.disabled = true;
  const supabase = window._supabase;
  if (!supabase) {
    err.textContent = 'Supabase бапталмаған.';
    btn.disabled = false;
    return;
  }
  try {
    if(isRegMode){
      const login = email.split('@')[0].slice(0, 40);
      const {data: signUpData, error: signUpError} = await supabase.auth.signUp({
        email,
        password: pass,
        options: {data: {login, class_name: cls, invite_code: invite.toUpperCase()}}
      });
      if(signUpError) throw signUpError;
      if(!signUpData.user) throw new Error('Тіркелу орындалмады');
      await supabase.auth.signOut();
      showAuthScreen();
      err.textContent = 'Email мекенжайыңызға растау хаты жіберілді.';
      err.classList.add('ok');
      btn.textContent = 'Кіру';
      btn.disabled = false;
    } else {
      const {data: signInData, error: signInError} = await supabase.auth.signInWithPassword({
        email,
        password: pass
      });
      if(signInError) throw signInError;
      if(!signInData.user?.email_confirmed_at) {
        await supabase.auth.resend({type:'signup', email});
        await supabase.auth.signOut();
        throw Object.assign(new Error('Email расталмаған'), {code: 'auth/email-not-verified'});
      }
      const {data: profile, error: profileError} = await supabase
        .from('profiles')
        .select('enrolled,role')
        .eq('id', signInData.user.id)
        .maybeSingle();
      if(profileError) throw profileError;
      if(!profile?.enrolled && profile?.role !== 'admin') {
        await supabase.auth.signOut();
        throw Object.assign(new Error('Курсқа тіркелмеген'), {code: 'auth/not-enrolled'});
      }
    }
  } catch(e){
    const msgs = {
      'auth/user-not-found':'Пайдаланушы табылмады!',
      'auth/wrong-password':'Пароль қате!',
      'auth/invalid-credential':'Логин немесе пароль қате!',
      'auth/email-already-in-use':'Бұл email тіркелген!',
      'auth/weak-password':'Пароль кем дегенде 6 символ болуы керек!',
      'auth/invalid-email':'Email форматы қате!'
      ,'auth/email-not-verified':'Email расталмаған. Жаңа растау хаты жіберілді.'
      ,'auth/invalid-invite':'Тіркелу коды жарамсыз немесе қолданылған.'
      ,'auth/not-enrolled':'Бұл аккаунт курсқа тіркелмеген.'
    };
    const message = String(e.message || '');
    if(!e.code && /invalid login credentials/i.test(message)) e.code = 'auth/invalid-credential';
    if(!e.code && /already registered|already been registered/i.test(message)) e.code = 'auth/email-already-in-use';
    if(!e.code && /password/i.test(message) && /6|weak|short/i.test(message)) e.code = 'auth/weak-password';
    if(!e.code && /invalid-registration|invalid-or-exhausted|database error saving new user/i.test(message)) e.code = 'auth/invalid-invite';
    err.textContent = msgs[e.code] || ('Қате: ' + message);
    btn.textContent = isRegMode ? 'Тіркелу' : 'Кіру';
    btn.disabled = false;
  }
}
function enterProgram(){
  document.getElementById('programScreen').classList.remove('active');
  if(ST.currentUser) {
    document.getElementById('mainScreen').classList.add('active');
    document.getElementById('nb2').classList.toggle('hidden', !ST.currentUser.isAdmin);
    document.getElementById('nbProg').classList.remove('act');
    switchTab(ST.tab||0);
  } else {
    document.getElementById('authScreen').classList.add('active');
  }
}

function startSession(u){
  ST.currentUser = u;
  _prog = {};
  recoverInterruptedTaskAttempt(u);
  hideLoading();
  document.getElementById('authScreen').classList.remove('active');
  document.getElementById('mainScreen').classList.add('active');
  document.getElementById('nb2').classList.toggle('hidden', !u.isAdmin);
  switchTab(0);
  document.getElementById('authBtn').textContent = isRegMode ? 'Тіркелу' : 'Кіру';
  document.getElementById('authBtn').disabled = false;
  // Storage күйін жүктеу
  loadCldCfg();

  // Соңғы тапсырма сессиясын қалпына келтіру
  try {
    const lastIdx = localStorage.getItem('sh_lastTaskIdx');
    if (lastIdx !== null) {
      const idx = parseInt(lastIdx);
      if (!isNaN(idx)) {
        setTimeout(() => openTaskScreen(idx), 300);
      }
    }
  } catch(e) {}
}

function enterCourse(){ enterProgram(); }
function showProgram(){
  // Барлық nb батырмаларынан active алу
  ["nb0","nb1","nb2","nbProg"].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.remove("act"); });
  document.getElementById("nbProg").classList.add("act");
  document.getElementById("mainScreen").classList.remove("active");
  document.getElementById("programScreen").classList.add("active");
  // Canvas-ты жүктеу
  if(typeof startGeoCanvas === 'function') startGeoCanvas();
  // Динамикалық мазмұн
  renderProgramScreen();
}

async function renderProgramScreen() {
  const pd = await getProgramData();
  // Org badge
  const ob = document.getElementById('pgOrgBadge');
  if(ob) ob.textContent = pd.orgBadge||'';
  // Eyebrow
  const ey = document.getElementById('pgEyebrow');
  if(ey) ey.textContent = pd.eyebrow||'';
  // Title
  const ti = document.getElementById('pgTitle');
  if(ti) ti.innerHTML = `${escapeHTML(pd.titleLine1)}<br><em>${escapeHTML(pd.titleLine2)}</em><br>${escapeHTML(pd.titleLine3)}`;
  // Subtitle
  const su = document.getElementById('pgSubtitle');
  if(su) su.innerHTML = `<svg width="9" height="9" viewBox="0 0 24 24" fill="var(--sage2)" stroke="none" style="vertical-align:middle;margin-right:4px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${escapeHTML(pd.subtitle)}`;
  // Stats
  const ss = [{id:'pgStatSections',v:pd.statSections},{id:'pgStatHours',v:pd.statHours},{id:'pgStatGrade',v:pd.statGrade},{id:'pgStatWeekly',v:pd.statWeekly}];
  ss.forEach(s=>{ const el=document.getElementById(s.id); if(el) el.textContent=s.v||''; });
  // Authors
  const a1=document.getElementById('pgAv1'); if(a1) a1.textContent=pd.authorInitials1||'';
  const a2=document.getElementById('pgAv2'); if(a2) a2.textContent=pd.authorInitials2||'';
  const an=document.getElementById('pgAuthorName'); if(an) an.textContent=pd.authorName||'';
  const ar=document.getElementById('pgAuthorRole'); if(ar) ar.textContent=pd.authorRole||'';
  // Header image
  const hi=document.getElementById('pgHeaderImg');
  if(hi){ const src=safeImageUrl(pd.headerImg); if(src){ hi.src=src; hi.style.display='block'; } else { hi.removeAttribute('src'); hi.style.display='none'; } }
  // Explanatory note
  // Explanatory note — RTE HTML
  const en=document.getElementById('pgExplanatoryNote');
  if(en) en.innerHTML = sanitizeHTML(pd.explanatoryNote);
  // Goals — RTE HTML
  const gw=document.getElementById('pgGoals');
  if(gw){
    const goals=pd.goals||[];
    gw.innerHTML=goals.map((g,i)=>`<div class="pg-goal"><div class="pg-goal-dot">${i+1}</div><div class="pg-goal-text">${sanitizeHTML(g)}</div></div>`).join('');
  }
  // Tasks — RTE HTML
  const tw=document.getElementById('pgTasks');
  if(tw) tw.innerHTML = sanitizeHTML(pd.tasks);
  // Schedule
  const sw=document.getElementById('pgScheduleGrid');
  if(sw){
    const rows=pd.scheduleRows||[];
    sw.innerHTML=`<div class="pg-sec-row pg-sec-header"><div class="pg-sec-num">№</div><div class="pg-sec-name">Тақырып</div><div class="pg-sec-hrs">Түрі</div></div>`
      + rows.map(r=>`<div class="pg-sec-row${r.final?' pg-sec-final':''}"><div class="pg-sec-num">${escapeHTML(r.num)}</div><div class="pg-sec-name">${escapeHTML(r.name)}</div><div class="pg-sec-hrs">${escapeHTML(r.type)}</div></div>`).join('');
  }
  // Footer
  const fo=document.getElementById('pgFooter'); if(fo) fo.textContent=pd.footer||'';
}
async function logout(){
  _prog = {}; _topics = null;
  if(window._supabase) await window._supabase.auth.signOut();
  ST.currentUser = null;
  document.getElementById('mainScreen').classList.remove('active');
  showAuthScreen();
}

// ═══ TABS ═══
function switchTab(t){
  if (t === 2 && !isCurrentAdmin()) {
    t = 0;
    alert(ST.lang === 'kk' ? 'Әкімші құқығы расталмады.' : 'Права администратора не подтверждены.');
  }
  ST.tab=t; ST.view='list';
  document.getElementById('backBtn').classList.remove('show');
  ['nb0','nb1','nb2'].forEach((id,i)=>document.getElementById(id).classList.toggle('act',i===t));
  renderTab();
}
function renderTab(){
  if(ST.tab===0) renderTopicsAsync();
  else if(ST.tab===1) renderProfileAsync();
  else if (isCurrentAdmin()) renderAdminAsync();
  else renderTopicsAsync();
}
function showOnly(id){
  ['tabTopics','tabProfile','tabAdmin'].forEach(t=>
    document.getElementById(t).classList.toggle('hidden', t!==id));
}

// ═══ TOPICS ═══
async function renderTopicsAsync(){
  const T = await getTopics();
  const u = ST.currentUser;
  const prog = await getProg();
  const {lang} = ST;
  const doneCount = T.filter(t=>{
    const tp = prog[pk(u.uid,t.id,'test')];
    const op = prog[pk(u.uid,t.id,'open')];
    const mp = prog[pk(u.uid,t.id,'map')];
    const attempt = prog[pk(u.uid,t.id,'attempt')];
    // prog=-1 (қате жауап) да "орындалды" деп есептейміз
    return (tp !== undefined && tp !== null) || op || mp || attempt;
  }).length;
  const pts = calcPts(u.uid, T, prog);

  let h=`<div class="banner">
    <div class="banner-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> 10-СЫНЫП · ЭЛЕКТИВТІ КУРС</div>
    <h2>Геосаясат</h2>
    <p>Жаһандық тұрақтылық және Қазақстан</p>
    <div class="bstats">
      <div class="bstat"><div class="bstat-n">${T.length}</div><div class="bstat-l">${lang==='kk'?'Тақырып':'Тем'}</div></div>
      <div class="bstat"><div class="bstat-n">${doneCount}</div><div class="bstat-l">${lang==='kk'?'Аяқталды':'Готово'}</div></div>
      <div class="bstat"><div class="bstat-n">${pts}</div><div class="bstat-l">${lang==='kk'?'Балл':'Баллов'}</div></div>
    </div></div>
  <div class="slabel">ТАҚЫРЫПТАР ТІЗІМІ</div>
  <div class="tlist">`;

  T.forEach((t,i)=>{
    const tp_raw = prog[pk(u.uid,t.id,'test')];
    const tp=tp_raw !== undefined && tp_raw !== null ? (tp_raw > 0 ? tp_raw : 0) : 0;
    const tp_attempted = tp_raw !== undefined && tp_raw !== null;
    const op=prog[pk(u.uid,t.id,'open')]||0;
    const mp=prog[pk(u.uid,t.id,'map')]||0;
    const attempt=prog[pk(u.uid,t.id,'attempt')];
    const done=tp_attempted||op||mp||attempt;
    let badges='';
    if(tp) badges+=`<span class="badge done"><svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg> Тест</span>`;
    if(op) badges+=`<span class="badge done"><svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg> Ашық</span>`;
    if(mp) badges+=`<span class="badge done"><svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg> Карта</span>`;
    if(!done) badges=`<span class="badge">${lang==='kk'?'Жаңа':'Новое'}</span>`;
    h+=`<div class="tcard${done?' done':''}" onclick="openDetailAsync(${i})">
      <div class="tnum">${escapeHTML(t.id)}</div>
      <div class="tinfo"><div class="ttitle">${escapeHTML(t.kk)}</div><div class="tmeta">${badges}</div></div>
      <span class="tcard-arrow">›</span></div>`;
  });
  h+=`</div>`;
  document.getElementById('tabTopics').innerHTML=h;
  if(ST.view==='list') document.getElementById('hTitle').innerHTML=`Геосаясат курсы<span class="sync-dot" id="syncDot"></span>`;
  showOnly('tabTopics');
}

async function openDetailAsync(idx){
  ST.view='detail'; ST.detIdx=idx;
  ST.mapAnswers={}; ST.selectedMapOpt=null;
  const T = await getTopics();
  const t = T[idx];
  const {lang} = ST;
  const u = ST.currentUser;
  const prog = await getProg();
  const tp = Math.max(0, Number(prog[pk(u.uid,t.id,'test')])||0);
  const op = Math.max(0, Number(prog[pk(u.uid,t.id,'open')])||0);
  const mpRaw = prog[pk(u.uid,t.id,'map')];
  const mp = Math.max(0, Number(mpRaw)||0);
  const mpAttempted = mpRaw !== undefined && mpRaw !== null;
  document.getElementById('hTitle').textContent = t.kk||'';
  document.getElementById('backBtn').classList.add('show');

  // ── САБАҚ ЖОСПАРЫ ──
  let planH = '';
  if(t.plan){
    const p = t.plan;
    let stepsH = '';
    p.steps.forEach((s,i)=>{
      stepsH += `<div class="plan-row">
        <div class="plan-step-num">${i+1}</div>
        <div class="plan-step-content">
          <div class="plan-step-title">${escapeHTML(s.t)}</div>
          ${s.min ? `<div class="plan-step-time">${escapeHTML(s.min)}</div>` : ''}
          ${s.d ? `<div class="plan-step-desc">${escapeHTML(s.d)}</div>` : ''}
        </div>
      </div>`;
    });
    planH = `<div class="plan-sec">
      <div class="plan-header" onclick="togglePlan(this)">
        <div class="plan-header-left">
          <span class="plan-header-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </span>
          <span class="plan-title">Қысқа мерзімді жоспар</span>
        </div>
        <button class="plan-toggle open">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="plan-body open">
        <div class="plan-goal">
          <div class="plan-goal-label">Сабақ мақсаты</div>
          <div class="plan-goal-text">${escapeHTML(p.goal)}</div>
        </div>
        ${stepsH}
      </div>
    </div>`;
  }

  let testH='';
  // Collect all test tasks: legacy + extras
  const allTests = [];
  if(t.qkk) allTests.push({q:t.qkk, opts:t.opts||[]});
  (t.tests||[]).forEach(tb=>{ if(tb.q) allTests.push({q:tb.q, opts: tb.opts && tb.opts.length ? tb.opts : [tb.a||'',tb.b||'',tb.c||'',tb.d||''].filter(o=>o)}); });

  if(allTests.length>0){
    allTests.forEach((task, ti)=>{
      const progKey = ti===0 ? 'test' : 'test_'+ti;
      const tp_ti_raw = prog[pk(u.uid,t.id,progKey)];
      const tp_ti = Math.max(0, Number(tp_ti_raw)||0);
      const tp_ti_attempted = tp_ti_raw !== undefined && tp_ti_raw !== null;
      testH+=`<div class="tsec">
        <div class="thead">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4M7 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M9 3h6v4H9z"/></svg>
          ${lang==='kk'?'Тест':'Тест'} ${allTests.length>1?ti+1:''}${tp_ti?` <span class="schip">+${tp_ti} балл</span>`:''}
        </div>
        <div class="tq">${escapeHTML(task.q)}</div>`;
      if(tp_ti){
        testH+=`<div class="tres ok"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${lang==='kk'?'Орындалды! '+tp_ti+' балл':'Выполнено! '+tp_ti+' баллов'}</div>`;
      } else if(tp_ti_attempted){
        task.opts.forEach((o,oi)=>{
          const letter = (typeof OPT_LETTERS !== 'undefined' ? OPT_LETTERS : ['A','B','C','D','E','F','G','H'])[oi] || String(oi+1);
          testH+=`<button class="opt" disabled>${letter}. ${escapeHTML(o)}</button>`;
        });
        testH+=`<div class="tres ko">${lang==='kk'?'Әрекет аяқталды':'Попытка завершена'}</div>`;
      } else {
        task.opts.forEach((o,oi)=>{
          const letter = (typeof OPT_LETTERS !== 'undefined' ? OPT_LETTERS : ['A','B','C','D','E','F','G','H'])[oi] || String(oi+1);
          testH+=`<button class="opt" id="opt_${ti}_${oi}" onclick="answerTestMulti(${idx},${ti},${oi})">${letter}. ${escapeHTML(o)}</button>`;
        });
      }
      testH+=`</div>`;
    });
  }

  let openH='';
  // Collect all open tasks: legacy + extras
  const allOpens = [];
  if(t.openq) allOpens.push({q:t.openq});
  (t.opens||[]).forEach(ob=>{ if(ob.q) allOpens.push({q:ob.q}); });

  if(allOpens.length>0){
    allOpens.forEach((task, oi)=>{
      const progKey = oi===0 ? 'open' : 'open_'+oi;
      const op_oi_raw = prog[pk(u.uid,t.id,progKey)];
      const op_oi = Math.max(0, Number(op_oi_raw)||0);
      const op_pending = op_oi_raw === -2;
      openH+=`<div class="tsec">
        <div class="thead">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          ${lang==='kk'?'Ашық сұрақ':'Открытый вопрос'} ${allOpens.length>1?oi+1:''}${op_oi?` <span class="schip">+${op_oi} балл</span>`:''}
        </div>
        <div class="tq">${escapeHTML(task.q)}</div>`;
      if(op_pending){
        openH+=`<div class="tres pending">${lang==='kk'?'Мұғалім тексеруін күтуде':'Ожидает проверки учителя'}</div>`;
      } else if(op_oi_raw !== undefined && op_oi_raw !== null){
        openH+=`<div class="tres ok"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${lang==='kk'?'Орындалды! '+op_oi+' балл':'Выполнено! '+op_oi+' баллов'}</div>`;
      } else {
        openH+=`<textarea class="open-inp" id="openAns_${oi}" placeholder="${lang==='kk'?'Жауабыңызды жазыңыз...':'Напишите ваш ответ...'}"></textarea>
        <button class="tsub" onclick="submitOpenMulti(${idx},${oi})"><svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg> ${lang==='kk'?'Жіберу':'Отправить'}</button>`;
      }
      openH+=`</div>`;
    });
  }

  let mapH='';
  if(t.mapq || (t.mapDots&&t.mapDots.length)){
  mapH=`<div class="tsec" id="mapTaskSec">
    <div class="thead">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
      ${lang==='kk'?'Картамен жұмыс':'Работа с картой'}${mp?` <span class="schip">+${mp} балл</span>`:''}
    </div>
    <div class="tq">${escapeHTML(t.mapq||'Картадан керекті жерлерді белгілеңіз.')}</div>`;
  if(mpAttempted){
    mapH+=`<div class="tres ok"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${lang==='kk'?'Орындалды! '+mp+' балл':'Выполнено! '+mp+' баллов'}</div>`;
  } else if(t.mapDots && t.mapDots.length){
    mapH+=`<div class="map-inst">${lang==='kk'?'↓ Алдымен төменгі тізімнен жауапты таңдаңыз, сосын картадағы нүктені басыңыз.':'↓ Сначала выберите ответ из списка ниже, затем нажмите на точку на карте.'}</div>`;
    mapH+=`<div class="map-wrap" id="mapWrap" style="background:#e0e7ff;min-height:180px;">${buildMapSVG(t, idx)}</div>`;
    mapH+=`<div class="map-opts" id="mapOpts">`;
    ST.currentMapOptions = (t.mapOpts||[]).map(String);
    ST.currentMapOptions.forEach((o,oi)=>{
      mapH+=`<button class="map-opt" id="mopt${oi}" onclick="selectMapOpt(${oi})">${escapeHTML(o)}</button>`;
    });
    mapH+=`</div><button class="tsub" id="mapSubmitBtn" onclick="submitMap(${idx})" style="opacity:.35;pointer-events:none"><svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg> ${lang==='kk'?'Жіберу':'Отправить'}</button>`;
  }
  mapH+=`</div>`;
  } // end if mapq

  const hasTask = allTests.length>0 || allOpens.length>0 || (t.mapq || (t.mapDots&&t.mapDots.length));
  // Кез келген тапсырма орындалды ма (дұрыс та, қате де) — барлық кілттерді тексеру
  const allTestKeys = allTests.map((_,ti) => ti===0 ? 'test' : 'test_'+ti);
  const allOpenKeys = allOpens.map((_,oi) => oi===0 ? 'open' : 'open_'+oi);
  const anyTestDone = allTestKeys.some(k => prog[pk(u.uid,t.id,k)] !== undefined && prog[pk(u.uid,t.id,k)] !== null);
  const anyOpenDone = allOpenKeys.some(k => prog[pk(u.uid,t.id,k)]);
  const attemptDone = prog[pk(u.uid,t.id,'attempt')] !== undefined;
  const taskDone = !!(anyTestDone || anyOpenDone || mpAttempted || attemptDone);
  document.getElementById('tabTopics').innerHTML=`
    <div class="dwrap">
      <div class="det-badge">§${escapeHTML(t.id)}</div>
      <div class="det-title">${escapeHTML(t.kk)}</div>
      ${planH}
      <div class="det-body">${sanitizeHTML(t.tkk)}</div>
      ${safeImageUrl(t.imgUrl) ? `<img src="${escapeHTML(safeImageUrl(t.imgUrl))}" style="width:100%;border-radius:14px;margin:12px 0;display:block;object-fit:cover;max-height:220px" loading="lazy" alt="Тақырып суреті">` : ''}
      ${hasTask ? (taskDone
        ? `<button class="btn-task" style="background:linear-gradient(135deg,#059669,#047857)" onclick="showQuizResult(${idx})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${lang==='kk'?'Нәтижені көру':'Посмотреть результат'}
          </button>`
        : `<button class="btn-task" onclick="openTaskScreen(${idx})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4M7 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M9 3h6v4H9z"/></svg>
            ${lang==='kk'?'Тапсырма орындау':'Выполнить задание'}
          </button>`)
      : ''}
    </div>`;
  showOnly('tabTopics');
}

// ═══ TASK SCREEN ═══
const TASK_GUARD_STORAGE = 'geo10_protected_task';
let _taskBlurTimer = null;

function cloneProgress(progress) {
  try { return JSON.parse(JSON.stringify(progress || {})); }
  catch { return {}; }
}

function taskGuardCopy() {
  const {active, idx, topicId, uid, pendingReason} = window._taskGuard;
  return {active, idx, topicId, uid, pendingReason, savedAt: Date.now()};
}

function persistTaskGuard(status, reason = null) {
  try {
    localStorage.setItem(TASK_GUARD_STORAGE, JSON.stringify({
      ...taskGuardCopy(),
      status,
      reason
    }));
  } catch(e) {}
}

function updateTaskGuardStatus(active) {
  const status = document.getElementById('taskGuardStatus');
  if (!status) return;
  status.classList.toggle('active', active);
  const label = status.querySelector('span:last-child');
  if (label) {
    label.textContent = active
      ? (ST.lang === 'kk' ? 'Бақылау қосулы' : 'Контроль включен')
      : (ST.lang === 'kk' ? 'Әрекет аяқталды' : 'Попытка завершена');
  }
}

function armTaskGuard(idx, topic, progress) {
  const guard = window._taskGuard;
  guard.active = true;
  guard.invalidating = false;
  guard.dirty = false;
  guard.idx = idx;
  guard.topicId = topic?.id ?? null;
  guard.uid = ST.currentUser?.uid || null;
  guard.snapshot = cloneProgress(progress);
  guard.pendingReason = null;
  guard.draft = {tests: {}, opens: {}, map: []};
  guard.serverStarted = true;
  persistTaskGuard('active');
  updateTaskGuardStatus(true);
}

async function commitTaskAttempt(idx) {
  const guard = window._taskGuard;
  if (!guard.active || guard.idx !== idx) return;

  document.querySelectorAll('[id^="openAns_"]').forEach((textarea) => {
    const index = Number(textarea.id.replace('openAns_', ''));
    const answer = textarea.value.trim();
    if (Number.isInteger(index) && answer) guard.draft.opens[index] = answer.slice(0, 2000);
  });
  const result = await callSecureFunction('submitTaskAttempt', {
    topicId: guard.topicId,
    tests: guard.draft.tests,
    opens: guard.draft.opens,
    map: guard.draft.map
  });
  guard.active = false;
  guard.invalidating = false;
  guard.serverStarted = false;
  updateTaskGuardStatus(false);
  try { localStorage.removeItem(TASK_GUARD_STORAGE); } catch(e) {}
  _prog = await fbGetProg(window._fbUser.uid);
  guard.snapshot = null;
  guard.dirty = false;
  return result;
}

function guardReasonText(reason) {
  const kk = {
    hidden: 'Браузер жасырылды немесе басқа қойынды ашылды.',
    blur: 'Тапсырма терезесі фокустан шықты.',
    pagehide: 'Парақ жабылды, жаңартылды немесе басқа сайт ашылды.',
    interrupted: 'Алдыңғы тапсырма әрекеті аяқталмай жабылған.'
  };
  const ru = {
    hidden: 'Браузер был свернут или открыта другая вкладка.',
    blur: 'Окно задания потеряло фокус.',
    pagehide: 'Страница была закрыта, обновлена или заменена другим сайтом.',
    interrupted: 'Предыдущая попытка была закрыта до завершения.'
  };
  return (ST.lang === 'kk' ? kk : ru)[reason] || (ST.lang === 'kk' ? kk.interrupted : ru.interrupted);
}

function showIntegrityNotice(reason) {
  const overlay = document.getElementById('integrityOverlay');
  if (!overlay) return;

  const isKk = ST.lang === 'kk';
  document.getElementById('integrityKicker').textContent = isKk ? 'Қауіпсіздік жүйесі' : 'Система контроля';
  document.getElementById('integrityTitle').textContent = isKk ? 'Әрекет жойылды' : 'Попытка аннулирована';
  document.getElementById('integrityText').textContent = isKk
      ? 'Тапсырма кезінде беттен шыққаныңыз анықталды. Әрекет серверде жойылған әрекет ретінде белгіленді.'
      : 'Обнаружен выход со страницы во время задания. Попытка отмечена на сервере как аннулированная.';
  document.getElementById('integrityReason').textContent = guardReasonText(reason);
  document.getElementById('integrityButtonText').textContent = isKk ? 'Тақырыпқа оралу' : 'Вернуться к теме';
  overlay.classList.add('show');
  document.body.classList.add('integrity-open');
}

function cancelTaskAttempt(reason = 'interrupted', showNotice = true) {
  const guard = window._taskGuard;
  if (!guard.active || guard.invalidating) return;

  guard.invalidating = true;
  guard.active = false;
  guard.pendingReason = reason;
  if (guard.serverStarted && guard.topicId !== null) {
    callSecureFunction('invalidateTaskAttempt', {topicId: guard.topicId, reason})
      .then(() => fbGetProg(window._fbUser.uid))
      .then((progress) => { _prog = progress; })
      .catch((error) => console.warn('Attempt invalidation:', error));
  }
  guard.serverStarted = false;
  persistTaskGuard('violated', reason);
  updateTaskGuardStatus(false);

  const taskScreen = document.getElementById('taskScreen');
  taskScreen?.classList.remove('active');
  try { localStorage.removeItem('sh_lastTaskIdx'); } catch(e) {}

  if (showNotice) {
    if (document.visibilityState === 'visible') showIntegrityNotice(reason);
    else guard.pendingReason = reason;
  }
}

function dismissIntegrityNotice() {
  const guard = window._taskGuard;
  document.getElementById('integrityOverlay')?.classList.remove('show');
  document.body.classList.remove('integrity-open');
  try { localStorage.removeItem(TASK_GUARD_STORAGE); } catch(e) {}

  const idx = guard.idx;
  guard.invalidating = false;
  guard.pendingReason = null;
  guard.snapshot = null;
  guard.dirty = false;
  if (Number.isInteger(idx) && ST.currentUser) openDetailAsync(idx);
}

function recoverInterruptedTaskAttempt(user) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(TASK_GUARD_STORAGE)); } catch(e) {}
  if (!saved) return;

  try {
    localStorage.removeItem(TASK_GUARD_STORAGE);
    localStorage.removeItem('sh_lastTaskIdx');
  } catch(e) {}

  if (saved.uid && user?.uid && saved.uid !== user.uid) return;
  if (saved.status !== 'active' && saved.status !== 'violated') return;

  const guard = window._taskGuard;
  guard.active = false;
  guard.invalidating = false;
  guard.idx = Number.isInteger(saved.idx) ? saved.idx : null;
  guard.topicId = saved.topicId ?? null;
  guard.uid = user?.uid || null;
  guard.pendingReason = saved.reason || 'interrupted';
  setTimeout(() => showIntegrityNotice(guard.pendingReason), 450);
}

document.addEventListener('visibilitychange', () => {
  const guard = window._taskGuard;
  if (document.visibilityState === 'hidden') {
    cancelTaskAttempt('hidden', true);
    return;
  }
  if (guard.pendingReason && !document.getElementById('integrityOverlay')?.classList.contains('show')) {
    showIntegrityNotice(guard.pendingReason);
  }
});

window.addEventListener('blur', () => {
  clearTimeout(_taskBlurTimer);
  _taskBlurTimer = setTimeout(() => {
    if (window._taskGuard.active && !document.hasFocus()) cancelTaskAttempt('blur', true);
  }, 650);
});

window.addEventListener('focus', () => clearTimeout(_taskBlurTimer));
window.addEventListener('pagehide', () => cancelTaskAttempt('pagehide', false));
window.addEventListener('beforeunload', () => cancelTaskAttempt('pagehide', false));

async function openTaskScreen(idx){
  ST.taskIdx = idx;
  ST.mapAnswers={}; ST.selectedMapOpt=null;
  const T = await getTopics();
  const t = T[idx];
  const {lang} = ST;
  const u = ST.currentUser;
  const prog = await getProg();
  try {
    await callSecureFunction('startTaskAttempt', {topicId: t.id});
  } catch (error) {
    const message = error?.message?.includes('already-attempted')
      ? (lang === 'kk' ? 'Бұл тапсырмаға әрекет бұрын қолданылған.' : 'Попытка для этого задания уже использована.')
      : (lang === 'kk' ? 'Қауіпсіз тапсырма сервері қолжетімсіз.' : 'Сервер безопасных заданий недоступен.');
    alert(message);
    return;
  }

  const allTests = [];
  if(t.qkk) allTests.push({q:t.qkk, opts:t.opts||[]});
  (t.tests||[]).forEach(tb=>{ if(tb.q) allTests.push({q:tb.q, opts: tb.opts && tb.opts.length ? tb.opts : [tb.a||'',tb.b||'',tb.c||'',tb.d||''].filter(o=>o)}); });

  let testH='';
  if(allTests.length>0){
    allTests.forEach((task, ti)=>{
      const progKey = ti===0 ? 'test' : 'test_'+ti;
      const tp_ti_raw = prog[pk(u.uid,t.id,progKey)];
      const tp_ti = tp_ti_raw || 0;
      const tp_ti_attempted = tp_ti_raw !== undefined && tp_ti_raw !== null;
      testH+=`<div class="tsec">
        <div class="thead">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4M7 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M9 3h6v4H9z"/></svg>
          ${lang==='kk'?'Тест':'Тест'} ${allTests.length>1?ti+1:''}${tp_ti>0?` <span class="schip">+${tp_ti} балл</span>`:''}
        </div>
        <div class="tq">${escapeHTML(task.q)}</div>`;
      if(tp_ti > 0){
        testH+=`<div class="tres ok"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${lang==='kk'?'Орындалды! '+tp_ti+' балл':'Выполнено! '+tp_ti+' баллов'}</div>`;
      } else if(tp_ti_attempted){
        task.opts.forEach((o,oi)=>{
          const letter = (typeof OPT_LETTERS !== 'undefined' ? OPT_LETTERS : ['A','B','C','D','E','F','G','H'])[oi] || String(oi+1);
          testH+=`<button class="opt" disabled>${letter}. ${escapeHTML(o)}</button>`;
        });
        testH+=`<div class="tres ko"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> ${lang==='kk'?'Қате жауап берілді':'Ответ был неверным'}</div>`;
      } else {
        task.opts.forEach((o,oi)=>{
          const letter = (typeof OPT_LETTERS !== 'undefined' ? OPT_LETTERS : ['A','B','C','D','E','F','G','H'])[oi] || String(oi+1);
          testH+=`<button class="opt" id="opt_${ti}_${oi}" onclick="answerTestMulti(${idx},${ti},${oi})">${letter}. ${escapeHTML(o)}</button>`;
        });
      }
      testH+=`</div>`;
    });
  }

  const allOpens = [];
  if(t.openq) allOpens.push({q:t.openq});
  (t.opens||[]).forEach(ob=>{ if(ob.q) allOpens.push({q:ob.q}); });

  let openH='';
  if(allOpens.length>0){
    allOpens.forEach((task, oi)=>{
      const progKey = oi===0 ? 'open' : 'open_'+oi;
      const op_oi_raw = prog[pk(u.uid,t.id,progKey)];
      const op_oi = Math.max(0, Number(op_oi_raw)||0);
      const op_pending = op_oi_raw === -2;
      openH+=`<div class="tsec">
        <div class="thead">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          ${lang==='kk'?'Ашық сұрақ':'Открытый вопрос'} ${allOpens.length>1?oi+1:''}${op_oi?` <span class="schip">+${op_oi} балл</span>`:''}
        </div>
        <div class="tq">${escapeHTML(task.q)}</div>`;
      if(op_pending){
        openH+=`<div class="tres pending">${lang==='kk'?'Мұғалім тексеруін күтуде':'Ожидает проверки учителя'}</div>`;
      } else if(op_oi_raw !== undefined && op_oi_raw !== null){
        openH+=`<div class="tres ok"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${lang==='kk'?'Орындалды! '+op_oi+' балл':'Выполнено! '+op_oi+' баллов'}</div>`;
      } else {
        openH+=`<textarea class="open-inp" id="openAns_${oi}" placeholder="${lang==='kk'?'Жауабыңызды жазыңыз...':'Напишите ваш ответ...'}"></textarea>
        <button class="tsub" onclick="submitOpenMulti(${idx},${oi})"><svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg> ${lang==='kk'?'Жіберу':'Отправить'}</button>`;
      }
      openH+=`</div>`;
    });
  }

  let mapH='';
  const mpRaw = prog[pk(u.uid,t.id,'map')];
  const mp = Math.max(0, Number(mpRaw)||0);
  const mpAttempted = mpRaw !== undefined && mpRaw !== null;
  if(t.mapq || (t.mapDots&&t.mapDots.length)){
    mapH=`<div class="tsec" id="mapTaskSec">
      <div class="thead">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
        ${lang==='kk'?'Картамен жұмыс':'Работа с картой'}${mp?` <span class="schip">+${mp} балл</span>`:''}
      </div>
      <div class="tq">${escapeHTML(t.mapq||'Картадан керекті жерлерді белгілеңіз.')}</div>`;
    if(mpAttempted){
      mapH+=`<div class="tres ok"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${lang==='kk'?'Орындалды! '+mp+' балл':'Выполнено! '+mp+' баллов'}</div>`;
    } else if(t.mapDots && t.mapDots.length){
      mapH+=`<div class="map-inst">${lang==='kk'?'↓ Алдымен төменгі тізімнен жауапты таңдаңыз, сосын картадағы нүктені басыңыз.':'↓ Сначала выберите ответ из списка ниже, затем нажмите на точку на карте.'}</div>`;
      mapH+=`<div class="map-wrap" id="mapWrap" style="background:#e0e7ff;min-height:180px;">${buildMapSVG(t, idx)}</div>`;
      mapH+=`<div class="map-opts" id="mapOpts">`;
      ST.currentMapOptions = (t.mapOpts||[]).map(String);
      ST.currentMapOptions.forEach((o,oi)=>{
        mapH+=`<button class="map-opt" id="mopt${oi}" onclick="selectMapOpt(${oi})">${escapeHTML(o)}</button>`;
      });
      mapH+=`</div><button class="tsub" id="mapSubmitBtn" onclick="submitMap(${idx})" style="opacity:.35;pointer-events:none"><svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg> ${lang==='kk'?'Жіберу':'Отправить'}</button>`;
    }
    mapH+=`</div>`;
  }

  const fbInlineHtml = `
    <div class="feedback-block">
      <div class="feedback-header" onclick="toggleFeedbackBlock(this)">
        <div class="feedback-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="feedback-header-text">
          <div class="feedback-header-title">Кері байланыс</div>
          <div class="feedback-header-sub">Бұл тақырып туралы ойыңызды қалдырыңыз</div>
        </div>
        <div class="feedback-chevron">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="feedback-body" id="fbInlineBody_${idx}">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Бағалаңыз</div>
        <div class="feedback-stars" id="fbInlineStars_${idx}">
          <span class="feedback-star" onclick="setInlineStar(${idx},1)">⭐</span>
          <span class="feedback-star" onclick="setInlineStar(${idx},2)">⭐</span>
          <span class="feedback-star" onclick="setInlineStar(${idx},3)">⭐</span>
          <span class="feedback-star" onclick="setInlineStar(${idx},4)">⭐</span>
          <span class="feedback-star" onclick="setInlineStar(${idx},5)">⭐</span>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin:12px 0 8px">Ұсыныс / Пікір</div>
        <div class="feedback-inp-wrap">
          <textarea class="feedback-inp" id="fbInlineText_${idx}" maxlength="500"
            placeholder="Ұсыныс немесе пікіріңіз..."
            oninput="document.getElementById('fbInlineChar_${idx}').textContent=this.value.length+'/500'"></textarea>
          <div class="feedback-char" id="fbInlineChar_${idx}">0/500</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px">
          <button class="fb-chip" onclick="addInlineChip(${idx},this,'Өте қызықты болды')">Өте қызықты болды</button>
          <button class="fb-chip" onclick="addInlineChip(${idx},this,'Тым күрделі')">Тым күрделі</button>
          <button class="fb-chip" onclick="addInlineChip(${idx},this,'Мысалдар жетіспеді')">Мысалдар жетіспеді</button>
          <button class="fb-chip" onclick="addInlineChip(${idx},this,'Суреттер қосса болар еді')">Суреттер қосса болар еді</button>
          <button class="fb-chip" onclick="addInlineChip(${idx},this,'Тапсырмалар ұнады')">Тапсырмалар ұнады</button>
          <button class="fb-chip" onclick="addInlineChip(${idx},this,'Толықтыруды сұраймын')">Толықтыруды сұраймын</button>
        </div>
        <button class="feedback-send-btn" id="fbInlineBtn_${idx}" onclick="submitInlineFeedback(${idx})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Жіберу
        </button>
      </div>
    </div>`;

  document.getElementById('taskContent').innerHTML=`
    <div class="task-topic-badge">§${escapeHTML(t.id)} — ${escapeHTML(t.kk)}</div>
    ${testH}${openH}${mapH}
    ${(allTests.length > 0 || allOpens.length > 0 || (t.mapDots&&t.mapDots.length)) ? `<button class="btn-finish-quiz" onclick="showQuizResult(${idx})">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      ${lang==='kk'?'Тестті аяқтау':'Завершить тест'}
    </button>` : ''}
    ${fbInlineHtml}`;
  const ts = document.getElementById('taskScreen');
  ts.classList.add('active');
  ts.scrollTop = 0;
  armTaskGuard(idx, t, prog);
  // Сессияны сақтау — сайттан шықса қайта оралу үшін
  try { localStorage.setItem('sh_lastTaskIdx', idx); } catch(e){}
}

function closeTaskScreen(){
  if(window._taskGuard?.active) cancelTaskAttempt('manual', false);
  document.getElementById('taskScreen').classList.remove('active');
  // Сессияны тазалау
  try { localStorage.removeItem('sh_lastTaskIdx'); } catch(e){}
}

async function showQuizResult(idx){
  try {
    await commitTaskAttempt(idx);
  } catch (error) {
    console.error('Secure attempt submit:', error);
    alert(ST.lang === 'kk'
      ? 'Нәтиже серверде сақталмады. Интернетті тексеріп, қайта жіберіңіз.'
      : 'Результат не сохранён на сервере. Проверьте интернет и отправьте снова.');
    return;
  }
  const T = await getTopics();
  const t = T[idx];
  const u = ST.currentUser;
  const prog = await getProg();
  const {lang} = ST;

  // Тест сұрақтарын жинақтау
  const allTests = [];
  if(t.qkk) allTests.push({progKey:'test'});
  (t.tests||[]).forEach((tb,i)=>{ if(tb.q) allTests.push({progKey:'test_'+(i+1)}); });

  let correct = 0, wrong = 0, skip = 0, totalPts = 0;
  allTests.forEach(({progKey}) => {
    const pts = Number(prog[pk(u.uid, t.id, progKey)]);
    if(pts > 0) { correct++; totalPts += pts; }
    else if(pts < 0) wrong++;
    else skip++;
  });

  const total = allTests.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('qrPct').textContent = pct + '%';
  document.getElementById('qrCorrectLbl').textContent = correct + (lang==='kk' ? ' дұрыс' : ' верно');
  document.getElementById('qrWrongLbl').textContent = wrong + (lang==='kk' ? ' қате' : ' неверно');
  document.getElementById('qrSkipLbl').textContent = skip + (lang==='kk' ? ' өткізілді' : ' пропущено');
  document.getElementById('qrScoreVal').textContent = totalPts + (lang==='kk' ? ' балл' : ' баллов');
  document.getElementById('qrSub').textContent = lang==='kk'
    ? `§${t.id} — барлығы ${total} сұрақ`
    : `§${t.id} — всего ${total} вопросов`;

  // Дөңгелек диаграмма сызу
  drawQuizPieChart(correct, wrong, skip, total);
  document.getElementById('quizResultOverlay').classList.add('show');
}

function drawQuizPieChart(correct, wrong, skip, total){
  const canvas = document.getElementById('qrCanvas');
  const ctx = canvas.getContext('2d');
  const cx = 70, cy = 70, r = 58, innerR = 40;
  ctx.clearRect(0, 0, 140, 140);

  const segments = [];
  if(correct > 0) segments.push({val: correct, color: '#059669'});
  if(wrong > 0)   segments.push({val: wrong,   color: '#dc2626'});
  if(skip > 0)    segments.push({val: skip,     color: '#e5e7eb'});
  if(total === 0) segments.push({val: 1, color: '#e5e7eb'});

  const sum = segments.reduce((a,s)=>a+s.val, 0);
  let startAngle = -Math.PI / 2;

  segments.forEach(seg => {
    const sweep = (seg.val / sum) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    startAngle += sweep;
  });

  // Ішкі ақ дөңгелек (donut эффектісі)
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Сыртқы жиек
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = '#f3f4f6';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function closeQuizResult(){
  document.getElementById('quizResultOverlay').classList.remove('show');
  const ts = document.getElementById('taskScreen');
  if(ts.classList.contains('active')) closeTaskScreen();
  goBack();
}

// ═══ ANSWER HANDLERS ═══
async function answerTestMulti(idx, taskIdx, optIdx){
  const letters=['A','B','C','D','E','F','G','H'];
  const chosen = letters[optIdx];
  if (!window._taskGuard.active) return;
  window._taskGuard.draft.tests[taskIdx] = chosen;
  let oi = 0;
  while(true){
    const b=document.getElementById(`opt_${taskIdx}_${oi}`);
    if(!b) break;
    b.disabled=true;
    if(oi===optIdx) b.classList.add('selected-answer');
    oi++;
  }
  const selected = document.getElementById(`opt_${taskIdx}_${optIdx}`);
  selected?.closest('.tsec')?.insertAdjacentHTML('beforeend',
    `<div class="tres pending">${ST.lang==='kk'?'Жауап сақталды. Нәтиже аяқтағаннан кейін шығады.':'Ответ сохранён. Результат появится после завершения.'}</div>`);
}

// Legacy wrapper (still used by DEF_TOPICS rendered via old path)
async function answerTest(idx, optIdx){
  await answerTestMulti(idx, 0, optIdx);
}

async function submitOpenMulti(idx, taskIdx){
  const T = await getTopics();
  const t = T[idx];
  const ta = document.getElementById('openAns_'+taskIdx);
  const ans = ta ? ta.value.trim() : '';
  if(ans.length<10){ alert(ST.lang==='kk'?'Кем дегенде 10 символ жазыңыз!':'Напишите хотя бы 10 символов!'); return; }
  if (!window._taskGuard.active) return;
  window._taskGuard.draft.opens[taskIdx] = ans.slice(0, 2000);
  if(ta){
    const sec = ta.closest('.tsec');
    const sb = sec?.querySelector('.tsub');
    ta.remove(); if(sb) sb.remove();
    sec?.insertAdjacentHTML('beforeend','<div class="tres pending">'+(ST.lang==='kk'?'Жауап мұғалім тексеруіне жіберіледі.':'Ответ будет отправлен учителю на проверку.')+'</div>');
  }
}

async function submitOpen(idx){ await submitOpenMulti(idx, 0); }
function selectMapOpt(oi){
  ST.selectedMapOpt=ST.currentMapOptions?.[oi] || '';
  document.querySelectorAll('.map-opt').forEach(b=>b.classList.remove('selected'));
  const btn=document.getElementById('mopt'+oi); if(btn) btn.classList.add('selected');
}
async function tapDot(topicIdx, dotIdx){
  if(!ST.selectedMapOpt){ alert(ST.lang==='kk'?'Алдымен жауапты таңдаңыз!':'Сначала выберите ответ!'); return; }
  ST.mapAnswers[dotIdx]=ST.selectedMapOpt;
  if(window._taskGuard.active) window._taskGuard.draft.map[dotIdx] = String(ST.selectedMapOpt).slice(0, 160);
  updateSVGDot(dotIdx, 'ok');
  const T = await getTopics();
  const t = T[topicIdx];
  const allAnswered = (t.mapDots||[]).every((_,i)=>ST.mapAnswers[i]!==undefined);
  const sbtn=document.getElementById('mapSubmitBtn');
  if(sbtn&&allAnswered){ sbtn.style.opacity='1'; sbtn.style.pointerEvents='auto'; }
}
async function submitMap(topicIdx){
  const T = await getTopics();
  const t = T[topicIdx];
  const total=(t.mapDots||[]).length;
  if (!window._taskGuard.active || !total) return;
  window._taskGuard.draft.map = (t.mapDots||[]).map((_, i) => String(ST.mapAnswers[i] || '').slice(0, 160));
  const mapSec=document.getElementById('mapTaskSec');
  if(mapSec){
    const sbtn=document.getElementById('mapSubmitBtn'); if(sbtn) sbtn.remove();
    mapSec.querySelectorAll('.map-opt').forEach((button) => { button.disabled = true; });
    mapSec.insertAdjacentHTML('beforeend',`<div class="tres pending">${ST.lang==='kk'?'Карта жауаптары сақталды.':'Ответы по карте сохранены.'}</div>`);
  }
}
function goBack(){
  ST.view='list';
  document.getElementById('backBtn').classList.remove('show');
  renderTopicsAsync();
}

// ═══ PROFILE ═══
async function renderProfileAsync(){
  const T = await getTopics();
  const u = ST.currentUser;
  const {lang} = ST;
  const prog = await getProg();
  const pts = calcPts(u.uid, T, prog);
  const done = T.filter(t=>prog[pk(u.uid,t.id,'test')]||prog[pk(u.uid,t.id,'open')]||prog[pk(u.uid,t.id,'map')]||prog[pk(u.uid,t.id,'attempt')]);
  const initials = (u.login||u.email||'?').slice(0,2).toUpperCase();

  let doneH='';
  done.forEach(t=>{
    const tp=Math.max(0, Number(prog[pk(u.uid,t.id,'test')])||0);
    const op=Math.max(0, Number(prog[pk(u.uid,t.id,'open')])||0);
    const mp=Math.max(0, Number(prog[pk(u.uid,t.id,'map')])||0);
    doneH+=`<div class="done-item">
      <div style="width:34px;height:34px;border-radius:10px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
      <div style="flex:1"><div class="done-title">${escapeHTML(t.kk)}</div>
      <div class="done-pts">Тест: +${tp} · Ашық: +${op} · Карта: +${mp}</div></div>
      <strong style="color:var(--accent);font-family:'Space Grotesk',sans-serif">${tp+op+mp}</strong></div>`;
  });
  if(!done.length) doneH=`<p style="text-align:center;color:var(--muted);padding:20px;font-size:13px">${lang==='kk'?'Тапсырылған тапсырма жоқ':'Нет выполненных заданий'}</p>`;

  document.getElementById('tabProfile').innerHTML=`
    <div class="phero">
      <div class="avatar" style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:800">${escapeHTML(initials)}</div>
      <div class="pname">${escapeHTML(u.login||u.email)}</div>
      <div class="pcls">${escapeHTML(u.cls)}${u.isAdmin?' · Администратор':''}</div>
    </div>
    <div class="pstats">
      <div class="pstat"><div class="pstat-n">${pts}</div><div class="pstat-l">${lang==='kk'?'Балл':'Баллов'}</div></div>
      <div class="pstat"><div class="pstat-n">${done.length}</div><div class="pstat-l">${lang==='kk'?'Аяқталды':'Готово'}</div></div>
      <div class="pstat"><div class="pstat-n">${T.length*12}</div><div class="pstat-l">Макс.</div></div>
    </div>
    <div class="slabel">${lang==='kk'?'ОРЫНДАЛҒАН ТАПСЫРМАЛАР':'ВЫПОЛНЕННЫЕ ЗАДАНИЯ'}</div>
    <div style="padding:0 14px 8px">${doneH}</div>
    <button class="logout-btn" onclick="logout()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
      ${lang==='kk'?'Шығу':'Выйти'}
    </button>`;
  document.getElementById('hTitle').textContent = lang==='kk'?'Профиль':'Профиль';
  showOnly('tabProfile');
}


// ═══ КЕРІ БАЙЛАНЫС ФУНКЦИЯЛАРЫ ═══

// Supabase: бір пайдаланушы бір тақырыпқа бір пікір
async function fbSaveFeedback(topicId, data) {
  try {
    if (!window._supabase) return;
    const key = String(topicId ?? '');
    const uid = String(data.uid || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key) || uid !== window._fbUser?.uid) return;
    const clean = {
      ...data,
      topicId: key,
      topicName: String(data.topicName || '').slice(0, 160),
      userName: String(data.userName || '').slice(0, 80),
      text: String(data.text || '').slice(0, 500)
    };
    const {error} = await window._supabase.from('feedback').upsert({
      user_id: uid,
      topic_id: key,
      rating: Math.min(5, Math.max(1, Number(data.star) || 1)),
      message: clean.text,
      payload: clean,
      created_at: new Date(data.ts || Date.now()).toISOString()
    });
    if (error) throw error;
  } catch(e) { console.warn('Feedback save error:', e); }
}

// Supabase: белгілі тақырып бойынша осы пайдаланушы пікір қалдырды ма?
async function fbHasFeedback(topicId, uid) {
  try {
    if (!window._supabase) return false;
    const key = String(topicId ?? '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key) || uid !== window._fbUser?.uid) return false;
    const {data, error} = await window._supabase
      .from('feedback')
      .select('topic_id')
      .eq('topic_id', key)
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  } catch { return false; }
}

// Supabase: барлық feedback оқу (admin үшін)
async function fbGetAllFeedback() {
  try {
    if (!window._supabase) return {};
    const {data, error} = await window._supabase
      .from('feedback')
      .select('user_id,topic_id,rating,message,payload,created_at');
    if (error) throw error;
    return (data || []).reduce((all, row) => {
      all[row.topic_id] ||= {};
      all[row.topic_id][row.user_id] = {
        ...(row.payload || {}),
        uid: row.user_id,
        topicId: row.topic_id,
        star: row.rating,
        text: row.message,
        ts: new Date(row.created_at).getTime()
      };
      return all;
    }, {});
  } catch { return {}; }
}

// Inline feedback state
const _fbInlineState = {};

function toggleFeedbackBlock(header) {
  const chevron = header.querySelector('.feedback-chevron');
  const body = header.nextElementSibling;
  const isOpen = body.classList.contains('open');
  chevron.classList.toggle('open', !isOpen);
  body.classList.toggle('open', !isOpen);
  // Ашылған кезде бұрын пікір берілді ма тексер
  if (!isOpen) {
    const idMatch = body.id && body.id.match(/fbInlineBody_(\d+)/);
    if (idMatch) checkFeedbackAlreadySent(parseInt(idMatch[1]));
  }
}

async function checkFeedbackAlreadySent(idx) {
  const T = await getTopics();
  const t = T[idx];
  const u = ST.currentUser;
  const uid = u?.uid || 'anonymous';
  const already = await fbHasFeedback(t.id, uid);
  if (!already) return;
  const body = document.getElementById('fbInlineBody_' + idx);
  if (body && !body.querySelector('.feedback-sent')) {
    body.innerHTML = `<div class="feedback-sent">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Сіз бұл тақырыпқа пікір қалдырдыңыз. Рақмет!
    </div>`;
  }
}

function setInlineStar(idx, val) {
  if (!_fbInlineState[idx]) _fbInlineState[idx] = {star: 0};
  _fbInlineState[idx].star = val;
  const stars = document.querySelectorAll('#fbInlineStars_' + idx + ' .feedback-star');
  stars.forEach((s, i) => s.classList.toggle('active', i < val));
}

function addInlineChip(idx, btn, text) {
  btn.classList.toggle('selected');
  const ta = document.getElementById('fbInlineText_' + idx);
  if (!ta) return;
  if (btn.classList.contains('selected')) {
    ta.value = ta.value ? ta.value + ' ' + text : text;
  } else {
    ta.value = ta.value.replace(' ' + text, '').replace(text, '').trim();
  }
  const charEl = document.getElementById('fbInlineChar_' + idx);
  if (charEl) charEl.textContent = ta.value.length + '/500';
}

async function submitInlineFeedback(idx) {
  const T = await getTopics();
  const t = T[idx];
  const text = (document.getElementById('fbInlineText_' + idx)?.value || '').trim();
  const star = _fbInlineState[idx]?.star || 0;
  const u = ST.currentUser;
  const uid = u?.uid || 'anonymous';

  if (!text && !star) {
    alert('Бағалаңыз немесе пікір жазыңыз!');
    return;
  }

  const btn = document.getElementById('fbInlineBtn_' + idx);
  if (btn) { btn.disabled = true; btn.textContent = 'Жіберілуде...'; }

  // Бұрын пікір қалдырылды ма тексер
  const already = await fbHasFeedback(t.id, uid);
  if (already) {
    const body = document.getElementById('fbInlineBody_' + idx);
    if (body) {
      body.innerHTML = `<div class="feedback-sent">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Сіз бұл тақырыпқа пікір қалдырдыңыз.
      </div>`;
    }
    return;
  }

  const entry = {
    topicId: t.id,
    topicName: t.kk || ('§' + t.id),
    uid,
    userName: u?.displayName || u?.email || 'Белгісіз',
    star,
    text,
    ts: Date.now()
  };

  await fbSaveFeedback(t.id, entry);

  const body = document.getElementById('fbInlineBody_' + idx);
  if (body) {
    body.innerHTML = `<div class="feedback-sent">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Рақмет! Пікіріңіз қабылданды.
    </div>`;
  }
}

// Modal feedback (unused in current flow but kept for extension)
let _fbModalIdx = -1;
let _fbModalStar = 0;

function openFeedbackModal(idx) {
  _fbModalIdx = idx; _fbModalStar = 0;
  document.querySelectorAll('#fbStars .feedback-star').forEach(s => s.classList.remove('active'));
  document.getElementById('fbText').value = '';
  document.getElementById('fbCharCount').textContent = '0/500';
  document.querySelectorAll('#fbChips .fb-chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('fbSendBtn').disabled = false;
  document.getElementById('fbSendBtn').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Жіберу';
  document.getElementById('feedbackModal').classList.add('show');
}

function closeFeedbackModal() {
  document.getElementById('feedbackModal').classList.remove('show');
}

function setFbStar(val) {
  _fbModalStar = val;
  document.querySelectorAll('#fbStars .feedback-star').forEach((s, i) => s.classList.toggle('active', i < val));
}

function addFbChip(btn, text) {
  btn.classList.toggle('selected');
  const ta = document.getElementById('fbText');
  if (btn.classList.contains('selected')) {
    ta.value = ta.value ? ta.value + ' ' + text : text;
  } else {
    ta.value = ta.value.replace(' ' + text, '').replace(text, '').trim();
  }
  document.getElementById('fbCharCount').textContent = ta.value.length + '/500';
}

async function submitFeedback() {
  const T = await getTopics();
  const t = T[_fbModalIdx];
  if (!t) return;
  const text = document.getElementById('fbText').value.trim();
  if (!text && !_fbModalStar) { alert('Бағалаңыз немесе пікір жазыңыз!'); return; }
  const btn = document.getElementById('fbSendBtn');
  btn.disabled = true; btn.textContent = 'Жіберілуде...';
  const u = ST.currentUser;
  await fbSaveFeedback(t.id, {
    topicId: t.id, topicName: t.kk || ('§' + t.id),
    uid: u?.uid || 'anonymous', userName: u?.displayName || u?.email || 'Белгісіз',
    star: _fbModalStar, text, ts: Date.now()
  });
  document.getElementById('fbModalBody').innerHTML = `<div class="feedback-sent" style="padding:30px 0">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    Рақмет! Пікіріңіз қабылданды.
  </div>`;
  setTimeout(closeFeedbackModal, 2000);
}

// Admin: барлық пікірлерді жүктеу және көрсету
async function loadAdminFeedback() {
  if(!requireAdmin()) return;
  const wrap = document.getElementById('adminFeedbackList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="fb-empty">Жүктелуде...</div>';
  const all = await fbGetAllFeedback();
  const items = [];
  Object.values(all).forEach(topicFbs => {
    if (typeof topicFbs === 'object') {
      Object.values(topicFbs).forEach(fb => { if (fb && fb.ts) items.push(fb); });
    }
  });
  items.sort((a, b) => b.ts - a.ts);
  if (!items.length) {
    wrap.innerHTML = '<div class="fb-empty">Әзірге пікірлер жоқ</div>';
    return;
  }
  wrap.innerHTML = items.map(fb => {
    const stars = fb.star ? '⭐'.repeat(fb.star) + '☆'.repeat(5 - fb.star) : '—';
    const date = new Date(fb.ts).toLocaleDateString('kk-KZ', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
    return `<div class="fb-card">
      <div class="fb-card-head">
        <div>
          <div class="fb-card-topic">§${escH(fb.topicId)} — ${escH(fb.topicName||'')}</div>
          <div class="fb-card-meta">${escH(fb.userName||'')} · ${date}</div>
        </div>
        <div class="fb-card-stars">${stars}</div>
      </div>
      ${fb.text ? `<div class="fb-card-text">${escH(fb.text)}</div>` : ''}
    </div>`;
  }).join('');
}

// ═══ БАҒДАРЛАМА РЕДАКТОРЫ ФУНКЦИЯЛАРЫ ═══
let _peGoals = [];
let _peScheduleRows = [];
let _peImgData = '';

async function openProgEditor() {
  if(!requireAdmin()) return;
  const pd = await getProgramData();
  // Суретті жүктеу
  _peImgData = pd.headerImg || '';
  const preview = document.getElementById('progImgPreview');
  const delBtn = document.getElementById('progImgDelBtn');
  const urlInp = document.getElementById('progImgUrl');
  if(safeImageUrl(_peImgData)){ preview.src=safeImageUrl(_peImgData); preview.style.display='block'; delBtn.style.display='flex'; }
  else { preview.style.display='none'; delBtn.style.display='none'; }
  urlInp.value = (_peImgData && _peImgData.startsWith('http')) ? _peImgData : '';

  // Мәтін өрістерін толтыру
  const fields = {
    peOrgBadge: pd.orgBadge||'', peEyebrow: pd.eyebrow||'', peSubtitle: pd.subtitle||'',
    peTitleLine1: pd.titleLine1||'', peTitleLine2: pd.titleLine2||'', peTitleLine3: pd.titleLine3||'',
    peStatSections: pd.statSections||'', peStatHours: pd.statHours||'', peStatGrade: pd.statGrade||'', peStatWeekly: pd.statWeekly||'',
    peAv1: pd.authorInitials1||'', peAv2: pd.authorInitials2||'',
    peAuthorName: pd.authorName||'', peAuthorRole: pd.authorRole||'',
    peFooter: pd.footer||''
  };
  Object.entries(fields).forEach(([id,val])=>{ const el=document.getElementById(id); if(el) el.value=val; });
  // RTE өрістерін жүктеу
  rteSetHtml('peExplanatoryNote', pd.explanatoryNote||'');
  rteSetHtml('peTasks', pd.tasks||'');

  // Мақсаттар
  _peGoals = (pd.goals || []).slice();
  renderProgGoals();

  // Кесте жолдары
  _peScheduleRows = (pd.scheduleRows || []).map(r=>({...r}));
  renderProgSchedule();

  document.getElementById('progEditorModal').classList.add('show');
  document.getElementById('progEditorModal').scrollTop = 0;
}

function closeProgEditor() {
  document.getElementById('progEditorModal').classList.remove('show');
}

function renderProgGoals() {
  const list = document.getElementById('peGoalsList');
  if(!list) return;
  list.innerHTML = _peGoals.map((g,i) => `
    <div class="prog-goal-row" id="pgGoalRow${i}">
      <div style="flex:1">
        <div class="rte-wrap" style="margin-bottom:0">
          <div class="rte-toolbar" style="padding:4px 8px;gap:4px">
            <button class="rte-btn bold-btn" onmousedown="event.preventDefault()" onclick="rteCmd('pgGoalRte${i}','bold')" title="Қою">B</button>
            <button class="rte-btn" style="font-style:italic" onmousedown="event.preventDefault()" onclick="rteCmd('pgGoalRte${i}','italic')"><em>I</em></button>
            <div class="rte-sep"></div>
            <button class="rte-btn img-btn" onmousedown="event.preventDefault()" onclick="topicImgInsert('pgGoalRte${i}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Сурет
            </button>
          </div>
          <div class="rte-editor" id="pgGoalRte${i}" contenteditable="true" style="min-height:52px"
            data-placeholder="Мақсат мәтіні...">${sanitizeHTML(g)}</div>
        </div>
      </div>
      <button class="prog-goal-del" onclick="removeProgGoal(${i})" title="Жою" style="margin-top:36px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function addProgGoal() {
  _peGoals.push('');
  renderProgGoals();
  // Соңғы textarea-ға фокус беру
  setTimeout(()=>{
    const items = document.querySelectorAll('#peGoalsList .prog-ta');
    if(items.length) items[items.length-1].focus();
  }, 50);
}

function removeProgGoal(i) {
  _peGoals.splice(i,1);
  renderProgGoals();
}

function renderProgSchedule() {
  const list = document.getElementById('peScheduleList');
  if(!list) return;
  list.innerHTML = _peScheduleRows.map((r,i) => `
    <div class="prog-sched-row">
      <input class="prog-sched-num" value="${escH(r.num||'')}" placeholder="№"
        oninput="_peScheduleRows[${i}].num=this.value">
      <input class="prog-sched-name" value="${escH(r.name||'')}" placeholder="Тақырып атауы..."
        oninput="_peScheduleRows[${i}].name=this.value">
      <input class="prog-sched-type" value="${escH(r.type||'')}" placeholder="Дәріс"
        oninput="_peScheduleRows[${i}].type=this.value">
      <input type="checkbox" class="prog-sched-final-chk" title="Қорытынды жол"
        ${r.final?'checked':''} onchange="_peScheduleRows[${i}].final=this.checked">
      <button class="prog-sched-del" onclick="removeProgScheduleRow(${i})" title="Жою">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function addProgScheduleRow() {
  _peScheduleRows.push({num: String(_peScheduleRows.length+1), name:'', type:'Дәріс', final:false});
  renderProgSchedule();
}

function removeProgScheduleRow(i) {
  _peScheduleRows.splice(i,1);
  renderProgSchedule();
}

function previewProgImg() {
  const url = document.getElementById('progImgUrl').value.trim();
  const safe = safeImageUrl(url);
  const preview = document.getElementById('progImgPreview');
  const delBtn = document.getElementById('progImgDelBtn');
  if(safe){ preview.src=safe; preview.style.display='block'; delBtn.style.display='flex'; _peImgData=safe; }
  else { preview.style.display='none'; delBtn.style.display='none'; _peImgData=''; }
}

function loadProgImgFile(evt) {
  const file = evt.target.files[0]; if(!file) return;
  const preview = document.getElementById('progImgPreview');
  const delBtn = document.getElementById('progImgDelBtn');
  const urlInp = document.getElementById('progImgUrl');

  urlInp.value = 'Жүктелуде...';
  urlInp.disabled = true;

  uploadToCourseStorage(file, pct => {
    urlInp.value = 'Жүктелуде... ' + pct + '%';
  }).then(result => {
    _peImgData = result.url;
    preview.src = result.url; preview.style.display = 'block';
    delBtn.style.display = 'flex';
    urlInp.value = result.url;
    urlInp.disabled = false;
  }).catch(err => {
    urlInp.value = '';
    urlInp.disabled = false;
    alert('Сурет жүктелмеді: ' + err.message);
  });
}

function clearProgImg() {
  _peImgData = '';
  document.getElementById('progImgPreview').style.display='none';
  document.getElementById('progImgDelBtn').style.display='none';
  document.getElementById('progImgUrl').value='';
}

async function saveProgEditor() {
  if(!requireAdmin()) return;
  // DOM-нан соңғы мәндерді жинау — мақсаттарды RTE-дан оқу
  _peGoals = _peGoals.map((g,i)=>{
    const el = document.getElementById('pgGoalRte'+i);
    return el ? sanitizeHTML(el.innerHTML.trim()) : sanitizeHTML(g);
  }).filter(g=>g.replace(/<[^>]+>/g,'').trim());
  _peScheduleRows = _peScheduleRows.map((r,i)=>{
    const row = document.querySelectorAll('#peScheduleList .prog-sched-row')[i];
    if(!row) return r;
    const inputs = row.querySelectorAll('input');
    return {
      num: inputs[0]?.value.trim()||r.num,
      name: inputs[1]?.value.trim()||r.name,
      type: inputs[2]?.value.trim()||r.type,
      final: inputs[3]?.checked||false
    };
  });

  const newData = {
    headerImg: safeImageUrl(_peImgData),
    orgBadge: document.getElementById('peOrgBadge').value.trim(),
    eyebrow: document.getElementById('peEyebrow').value.trim(),
    subtitle: document.getElementById('peSubtitle').value.trim(),
    titleLine1: document.getElementById('peTitleLine1').value.trim(),
    titleLine2: document.getElementById('peTitleLine2').value.trim(),
    titleLine3: document.getElementById('peTitleLine3').value.trim(),
    statSections: document.getElementById('peStatSections').value.trim(),
    statHours: document.getElementById('peStatHours').value.trim(),
    statGrade: document.getElementById('peStatGrade').value.trim(),
    statWeekly: document.getElementById('peStatWeekly').value.trim(),
    authorInitials1: document.getElementById('peAv1').value.trim(),
    authorInitials2: document.getElementById('peAv2').value.trim(),
    authorName: document.getElementById('peAuthorName').value.trim(),
    authorRole: document.getElementById('peAuthorRole').value.trim(),
    explanatoryNote: rteGetHtml('peExplanatoryNote'),
    goals: _peGoals,
    tasks: rteGetHtml('peTasks'),
    scheduleRows: _peScheduleRows,
    footer: document.getElementById('peFooter').value.trim()
  };

  _programData = newData;
  await fbSaveProgramData(newData);
  closeProgEditor();
  renderProgramScreen();
  alert('✅ Бағдарлама сәтті сақталды!');
}
