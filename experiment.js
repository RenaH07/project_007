/***** =========================
 *  experiment.js  (jsPsych v6.3.1)
 *  - PC限定（モバイルはメッセージのみ表示）
 *  - 同意クリックで静かにフルスクリーン
 *  - 練習2本 → 本番（stimuli/manifest.json 優先）
 *  - 各試行：注視点(1000ms) → 再生(Canvas) → 1ページ5件法（リッカート＋SD）＋自由記述
 *    ・各項目は「〇—〇—〇—〇—〇」（端で線が止まる／はみ出し無し）
 *    ・選択ドットは薄いグレー（SELECT_COLORで調整可）
 *  - IMC：本番の最後のページのみ、リッカート末尾に“しれっと”1行追加（左から4番目が正答）
 *  - 問順：リッカート＝生物性→意図性→かわいい（帰属→審美）☆
 * ========================== */

/***** 0) PC限定（UA判定：モバイルはここで終了） *****/
const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
if (isMobile) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f7fb;padding:24px;box-sizing:border-box">
      <div style="max-width:720px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;line-height:1.9">
        <h2 style="margin:0 0 12px">パソコン専用の調査です</h2>
        <p>この調査は <strong>PCのみ</strong> でご参加いただけます。<br>
           スマートフォン／タブレットではご参加いただけません。</p>
        <p style="color:#6b7280;font-size:.95rem">PCから再度アクセスしてください。</p>
      </div>
    </div>`;
  throw new Error("Mobile blocked");
}

/***** 送信ユーティリティ（参加者は待つだけ・自動再試行） *****/
const QUEUE_KEY = 'pending_submission_v1';

function showSendingScreen(msg){
  const host = (jsPsych?.getDisplayElement?.() || document.body);
  host.innerHTML = `
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
      .send-wrap{
        min-height: 70vh; display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:16px;
        font-size: 1.05rem; color:#111827; text-align:center;
      }
      .spinner{
        width:38px; height:38px; border-radius:50%;
        border:3px solid #cbd5e1; border-top-color:#4b5563;
        animation: spin 0.9s linear infinite;
      }
      .send-note{ color:#6b7280; font-size:.9rem; line-height:1.8; }
    </style>
    <div class="send-wrap">
      <div class="spinner" aria-label="送信中"></div>
      <div>${msg || 'データを送信中です…'}</div>
      <div class="send-note">このままお待ちください。</div>
    </div>
  `;
}

async function postOnce(payload, timeoutMs=15000){
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const res = await fetch("/", {
      method: "POST",
      headers: {
       "Content-Type": "application/x-www-form-urlencoded",
       "Accept": "application/json"
      },
      body: new URLSearchParams({
        "form-name": "experiment-data",
        "data": JSON.stringify(payload)
      }),
      signal: controller.signal
    });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP '+res.status);
    return true;
  }catch(e){
    clearTimeout(t);
    return false;
  }
}

function queuePending(payload){
  try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(payload)); }catch(e){}
}

function startAutoRetryLoop(payload, onSuccess){
  (async ()=>{
    // 即時1回
    let ok = await postOnce(payload, 15000);
    if (ok){ localStorage.removeItem(QUEUE_KEY); onSuccess(); return; }

    // 以降は15秒間隔で自動再試行
    const iv = setInterval(async ()=>{
      ok = await postOnce(payload, 15000);
      if (ok){
        clearInterval(iv);
        localStorage.removeItem(QUEUE_KEY);
        onSuccess();
      }
    }, 15000);

    // オンライン復帰でも即時1回
    const onOnline = async ()=>{
      ok = await postOnce(payload, 15000);
      if (ok){
        window.removeEventListener('online', onOnline);
        localStorage.removeItem(QUEUE_KEY);
        onSuccess();
      }
    };
    window.addEventListener('online', onOnline);
  })();
}

function attemptResendPendingOnLoad(){
  const raw = localStorage.getItem(QUEUE_KEY);
  if (!raw) return;
  let payload = null;
  try{ payload = JSON.parse(raw); }catch(e){}
  if (!payload) return;

  // バックグラウンドで静かに再送：1回試し、ダメなら短いループ
  (async ()=>{
    let ok = await postOnce(payload, 12000);
    if (ok){ localStorage.removeItem(QUEUE_KEY); return; }
    startAutoRetryLoop(payload, ()=>{ /* 成功しても画面はそのまま */ });
  })();
}

// ★ ページ読み込み時に未送信データがあれば自動再送
attemptResendPendingOnLoad();



/***** 1) ユーティリティ／定数 *****/
function pid(len = 10){
  const s='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({length:len},()=>s[Math.floor(Math.random()*s.length)]).join('');
}
const PID = pid();

// === パスコード生成（4〜8桁の数字：既定は6桁） ===
function makePasscode(digits = 6){
  // セッション一貫性のため localStorage を優先（再読み込みでも同じコード）
  const key = 'passcode_v1';
  const saved = (()=>{ try { return localStorage.getItem(key); } catch(e){ return null; }})();
  if (saved && /^\d{4,8}$/.test(saved)) return saved;

  const d = Math.max(4, Math.min(8, digits));
  const min = 10 ** (d - 1), max = 10 ** d - 1;
  const code = String(Math.floor(Math.random() * (max - min + 1)) + min);

  try { localStorage.setItem(key, code); } catch(e){}
  return code;
}
const PASSCODE = makePasscode(6);                 // ← 桁数を 4〜8 に変更可
jsPsych.data.addProperties({ passcode: PASSCODE }); // 全試行データにも刻む


const FIX_MS = 1000;  // 注視点

// ★ 選択色（薄いグレー）。青に戻すなら → '#2563eb' / 'rgba(37,99,235,.22)'
const SELECT_COLOR = '#bfc7d1';
const SELECT_RING  = 'rgba(191,199,209,.22)';

// === 5件法・左＝ポジティブ ===
const LIKERT_POINTS = 5;

// ★ リッカートの尺度ラベル
const SCALE_LABELS_LIKERT = [
  'あてはまる',
  'やや\nあてはまる',
  'どちらとも\nいえない',
  'あまり\nあてはまら\nない',
  'あてはまら\nない'
];

// ★ SDの尺度ラベル
const SCALE_LABELS_SD = [
  'たいへん',
  'どちらかと\nいえば',
  'どちらとも\nいえない',
  'どちらかと\nいえば',
  'たいへん'
];

function getLikertLabels(){ return SCALE_LABELS_LIKERT.slice(); }
function getSDLabels(){ return SCALE_LABELS_SD.slice(); }

/***** Williams 8×8（第一順序キャリーオーバー完全バランス）*****/
const WILLIAMS8 = [
  [1,8,2,7,3,6,4,5],
  [2,1,3,8,4,7,5,6],
  [3,2,4,1,5,8,6,7],
  [4,3,5,2,6,1,7,8],
  [5,4,6,3,7,2,8,1],
  [6,5,7,4,8,3,1,2],
  [7,6,8,5,1,4,2,3],
  [8,7,1,6,2,5,3,4],
];

// URLの ?seq / ?series / ?cb / ?k / ?s のいずれかで行番号（1..8）を指定
function getSeriesRow1to8(){
  const q = (jsPsych?.data?.urlVariables?.() || {});
  const cand = [q.seq, q.series, q.cb, q.k, q.s]
    .map(v => parseInt(v, 10))
    .find(v => Number.isInteger(v) && v >= 1 && v <= 8);
  if (cand) return cand;

  // フォールバック：PIDから安定割当（完全バランスはURL配布で担保）
  const code = String(PID || '').split('').reduce((a,c)=>a + c.charCodeAt(0), 0);
  return (Math.abs(code) % 8) + 1; // 1..8
}

// 先頭の 2〜3桁の数字を「条件ID」として取り出す（21a_.. → 21）
function extractLeadingId(file){
  const basename = String(file).split('/').pop(); // ファイル名だけ取り出す
  // 例: "21a_g0o1_..." → 先頭の 2〜3桁 + 任意の英字 + "_" を想定
  const m = basename.match(/^(\d{2,3})[a-zA-Z]*[_-]/);
  return m ? parseInt(m[1], 10) : NaN;
}


// 配列をコピーして Fisher–Yates でシャッフルする
function shuffleCopy(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 実験2用：条件IDごとにグループ化して、6条件×2ブロックの順序を作る
function buildMainOrderExp2(files){
  // files: ["stimuli/21a_...", "stimuli/21b_...", ..., "stimuli/26b_..."] など
  const byCond = new Map();

  files.forEach(f => {
    const id = extractLeadingId(f);  // 21,22,...,26
    if (!Number.isFinite(id)) {
      throw new Error(`ファイル名の先頭に 2〜3桁の数字が必要です: ${f}`);
    }
    if (!byCond.has(id)) byCond.set(id, []);
    byCond.get(id).push(f);
  });

  // 条件IDを昇順に
  const condIds = Array.from(byCond.keys()).sort((a, b) => a - b);

  const block1 = [];
  const block2 = [];

  condIds.forEach(id => {
    const arr = byCond.get(id);
    const v = shuffleCopy(arr);   // a/b の順番をランダムに

    // 1つ目 → ブロック1
    block1.push(v[0]);

    // 2つ目があれば → ブロック2、なければ同じものを2回目として使う
    if (v.length > 1) {
      block2.push(v[1]);
    } else {
      block2.push(v[0]);
    }
  });

  // 各ブロック内で条件順をランダム化
  const block1Shuffled = shuffleCopy(block1);
  const block2Shuffled = shuffleCopy(block2);

  const seq = block1Shuffled.concat(block2Shuffled);

  // ブロック境界（6番目と7番目）が同じ条件IDになっていたら、軽く入れ替えて回避
  if (extractLeadingId(seq[5]) === extractLeadingId(seq[6])) {
    for (let i = 6; i < seq.length; i++){
      if (extractLeadingId(seq[i]) !== extractLeadingId(seq[5])) {
        [seq[6], seq[i]] = [seq[i], seq[6]];
        break;
      }
    }
  }

  return seq;  // 本番で使う 12本分の並び
}



// 「01〜04」と「05〜08」を別グループにして、交互に提示する版
// ※ どちらを「ゴール追従あり／なし」と解釈するかは刺激の命名に依存
function orderByWilliams8(files8){
  if (!Array.isArray(files8) || files8.length !== 8){
    throw new Error(`8 本の刺激を想定していますが、${files8?.length} 本が渡されました。`);
  }

  // 念のため：manifest順がID順でない可能性に備えて「先頭番号」で並べ替え
  // 01..08 のID順にしておく
  const byId = [...files8].sort((a,b)=>extractLeadingId(a) - extractLeadingId(b));

  // 先頭4本（ID 01〜04）と後半4本（ID 05〜08）を二つのグループに分ける
  // （ここで例えば 01〜04 = ゴール追従あり, 05〜08 = なし のように設計しておく）
  const groupA = byId.slice(0, 4);  // 01,02,03,04
  const groupB = byId.slice(4, 8);  // 05,06,07,08

  // 各グループの中身は独立にランダム化
  const A = shuffleCopy(groupA);
  const B = shuffleCopy(groupB);

  // 最初が A か B かもランダムに決定
  const startWithA = Math.random() < 0.5;

  const seqFiles = [];
  for (let i = 0; i < 4; i++){
    if (startWithA){
      // A-B-A-B-A-B-A-B
      seqFiles.push(A[i], B[i]);
    } else {
      // B-A-B-A-B-A-B-A
      seqFiles.push(B[i], A[i]);
    }
  }

  // ログ用：どんな並びになったかを保存しておく
  const ids = seqFiles.map(f => extractLeadingId(f));
  jsPsych.data.addProperties({
    order_pattern: startWithA ? 'A-B-A-B_startA' : 'B-A-B-A_startB',
    order_ids: ids.join('-')
  });

  return seqFiles;
}



/***** 2) 質問定義（固定順・左＝ポジティブ） *****/
// リッカート（3項目）※順序＝生物性→意図性→かわいい
const QUESTIONS_LIKERT_BASE = [
  { kind:'likert', name:'ANIMACY', label:'生き物のように感じた' },
  { kind:'likert', name:'INTENT',  label:'目的をもって動いているように感じた' },
  { kind:'likert', name:'KAWAII',  label:'かわいいと感じた' }
];

// SD（4項目）
const QUESTIONS_SD = [
  { kind:'sd', name:'WARMTH',   label:'温かさ',      left:'親しみやすい', right:'親しみにくい' },
  { kind:'sd', name:'COMPETENCE',   label:'ぎこちなさ', left:'洗練された',   right:'ぎこちない' },
  { kind:'sd', name:'VALENCE',  label:'快‐不快',     left:'快',         right:'不快' },
  { kind:'sd', name:'APPROACH', label:'接近‐回避',   left:'近づきたい',   right:'避けたい' }
];

// IMCを“しれっと”行として差し込む（本番の最後のページだけ）
function buildLikertItems(includeIMC_silent){
  const arr = [...QUESTIONS_LIKERT_BASE];
  if (includeIMC_silent) {
    arr.push({
      kind:'likert_imc', name:'IMC_silent',
      // 通常色・通常サイズ（目立たない）。正解＝左から4番目
      label:'この項目に限り、左から4番目を選んでください'
    });
  }
  return arr;
}

/***** 3) 質問ページ（各行＝バー 〇—〇—〇—〇—〇） *****/
function makeSurveyPage(opts, file=null, index1=null){
  const o = Object.assign(
    { includeIMC:false, allowFreeText:true, phase:'main' },
    opts
  );

  const labelsLikert = getLikertLabels();
  const labelsSD     = getSDLabels();

  const itemsLikert = buildLikertItems(o.includeIMC);
  const itemsSD     = QUESTIONS_SD;

  const css = `
  <style>
    .page-wrap{ max-width:920px; margin:0 auto; }
    .blk{ margin: 14px 0; }
    .section-title{ margin: 8px 0 4px; color:#111827; font-weight:700; font-size:1.05rem }

    /* ===================== Likert（質問文＋バー） ===================== */
    .lm-wrap{ width:100%; }
    .lm-head{
      display:grid; grid-template-columns:minmax(220px,1.05fr) 1fr; gap:10px;
      margin-bottom:4px; color:#6b7280; font-size:.95rem;
    }
    .lm-scale-head{
      display:grid; grid-template-columns:repeat(${LIKERT_POINTS},1fr); gap:10px; text-align:center;
      align-items:end;
    }
    .lm-scale-head > div{
      display:flex; align-items:flex-end; justify-content:center; line-height:1.2; padding-bottom:2px; white-space: pre-line;
    }
    .lm-row{
      display:grid; grid-template-columns:minmax(220px,1.05fr) 1fr; align-items:center; gap:10px;
      background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; margin:10px 0;
    }
    .lm-label{ font-weight:600; line-height:1.55; color:#374151; } /* ← SD左右アンカーと色を合わせる */

    .lm-strip{
      position:relative; display:grid; grid-template-columns:repeat(${LIKERT_POINTS},1fr);
      gap:10px; align-items:center;
    }
    /* ★ 半分線（端では描かない）— 背面・クリック非干渉 */
    .lm-cell{ position:relative; display:flex; justify-content:center; }
    .lm-cell::before, .lm-cell::after{
      content:""; position:absolute; top:50%; transform:translateY(-50%);
      height:2px; width:calc(50% + 5px);
      background:#d1d5db; z-index:0; pointer-events:none;
    }
    .lm-cell::before{ left:-5px; }
    .lm-cell::after{  right:-5px; }
    .lm-cell:first-child::before{ display:none; }
    .lm-cell:last-child::after{  display:none; }

    .lm-cell input{ position:absolute; opacity:0; inset:0; cursor:pointer; z-index:2; }
    .lm-cell span{
      position:relative; z-index:1;
      width:20px; height:20px; border-radius:50%;
      border:2px solid #cbd5e1; background:#fff; display:inline-block; transition:all .12s ease;
    }
    .lm-cell:hover span{ border-color:#b6c1cd; }
    .lm-cell input:checked + span{
      background:${SELECT_COLOR}; border-color:${SELECT_COLOR}; box-shadow:0 0 0 2px ${SELECT_RING};
    }

    /* ===================== SD（左右アンカー＋バー） ===================== */
    .sd-wrap{ width:100%; }
    .sd-head{
      display:grid; grid-template-columns:minmax(110px,.9fr) 1fr minmax(110px,.9fr); gap:10px;
      margin-bottom:4px; color:#6b7280; font-size:.95rem;
    }
    .sd-scale-head{
      display:grid; grid-template-columns:repeat(${LIKERT_POINTS},1fr); gap:10px; text-align:center;
      align-items:end;
    }
    .sd-scale-head > div{
      display:flex; align-items:flex-end; justify-content:center; line-height:1.2; padding-bottom:2px; white-space: pre-line;
    }

    .sd-row{
      display:grid; grid-template-columns:minmax(110px,.9fr) 1fr minmax(110px,.9fr); align-items:center; gap:10px;
      background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; margin:10px 0;
    }
    .sd-anch{ text-align:center; font-weight:600; color:#374151; } /* ← Likert質問文と色を統一 */

    .sd-strip{
      position:relative; display:grid; grid-template-columns:repeat(${LIKERT_POINTS},1fr);
      gap:10px; align-items:center;
    }
    .sd-cell{ position:relative; display:flex; justify-content:center; }
    .sd-cell::before, .sd-cell::after{
      content:""; position:absolute; top:50%; transform:translateY(-50%);
      height:2px; width:calc(50% + 5px);
      background:#d1d5db; z-index:0; pointer-events:none;
    }
    .sd-cell::before{ left:-5px; }
    .sd-cell::after{  right:-5px; }
    .sd-cell:first-child::before{ display:none; }
    .sd-cell:last-child::after{  display:none; }

    .sd-cell input{ position:absolute; opacity:0; inset:0; cursor:pointer; z-index:2; }
    .sd-cell span{
      position:relative; z-index:1;
      width:20px; height:20px; border-radius:50%;
      border:2px solid #cbd5e1; background:#fff; display:inline-block; transition:all .12s ease;
    }
    .sd-cell:hover span{ border-color:#b6c1cd; }
    .sd-cell input:checked + span{
      background:${SELECT_COLOR}; border-color:${SELECT_COLOR}; box-shadow:0 0 0 2px ${SELECT_RING};
    }

    /* 自由記述 */
    .free{ width:100%; min-height:80px; }
  </style>`;

  // 1) リッカート・ブロック（上部尺度ラベル＋各行バー）
  const likertHeader = `
    <div class="lm-head">
      <div></div>
      <div class="lm-scale-head">
        ${labelsLikert.map(l=>`<div>${l}</div>`).join('')}
      </div>
    </div>`;
const likertRows = itemsLikert.map(q=>{
  const cells = labelsLikert.map((lab,i)=>{
    const val = LIKERT_POINTS - i;  // ★ 左端=5, その次=4,... 右端=1
    return `<label class="lm-cell">
              <input type="radio" name="${q.name}" value="${val}" required aria-label="${lab}">
              <span></span>
            </label>`;
  }).join('');
  return `<div class="lm-row">
            <div class="lm-label">${q.label}</div>
            <div class="lm-strip">${cells}</div>
          </div>`;
}).join('');

  // 2) SD・ブロック（左右アンカー＋上部尺度ラベル＋各行バー）
  const sdHeader = `
    <div class="sd-head">
      <div></div>
      <div class="sd-scale-head">
        ${labelsSD.map(l=>`<div>${l}</div>`).join('')}
      </div>
      <div></div>
    </div>`;
const sdRows = itemsSD.map(q=>{
  const cells = labelsSD.map((lab,i)=>{
    const val = LIKERT_POINTS - i;  // ★ 左端のラベルが5点
    return `<label class="sd-cell">
              <input type="radio" name="${q.name}" value="${val}" required aria-label="${lab}">
              <span></span>
            </label>`;
  }).join('');
  return `<div class="sd-row">
            <div class="sd-anch">${q.left}</div>
            <div class="sd-strip">${cells}</div>
            <div class="sd-anch">${q.right}</div>
          </div>`;
}).join('');


  // 自由記述
  const free = o.allowFreeText
    ? `<div class="blk"><div class="section-title">自由記述（任意）</div>
         <textarea name="free_text" class="free" placeholder="気づいた点があればご記入ください"></textarea>
       </div>`
    : ``;

  // ページHTML
  const html = `${css}
    <div class="page-wrap">
      <div class="blk">
        <div class="section-title">　</div>
        <div class="lm-wrap">
          ${likertHeader}
          ${likertRows}
        </div>
      </div>
      <div class="blk">
        <div class="section-title">　</div>
        <div class="sd-wrap">
          ${sdHeader}
          ${sdRows}
        </div>
      </div>
      ${free}
    </div>`;

  return {
    type:'survey-html-form',
    preamble:'<h3>直前の動画の「黒い丸」についてあなたの印象に最も近い選択肢を選んでください。</h3>',
    html,
    button_label:'次へ',

    // ★ 回答している間に次の刺激を先読み
on_load: ()=>{
const i = (index1 || 0);           // 今の刺激の1-based番号
const ord = window.STIM_ORDER || [];
prefetchStim(ord[i]);               // 次の JSON
prefetchStim(ord[i+1]);             // 念のため その次も
},
    on_finish: (d)=>{
      // v6: responses は JSON文字列。なければ空。
      const resp = (d && typeof d.response === 'object' && d.response !== null)
        ? d.response
        : (d && typeof d.responses === 'string' ? JSON.parse(d.responses) : {});
      d.participant_id = PID;
      d.block = o.phase==='practice' ? 'practice' : 'main';
      d.stimulus_file = file || null;
      d.trial_index1 = index1 || null;

      // しれっとIMC（最後のページのみ includeIMC=true で呼ばれる）
      if (o.includeIMC) {
        const v = resp['IMC_silent'];            
        d.imc_silent = v ?? null;
        d.imc_silent_pass = (v === '2') ? 1 : 0; // ★ 左から4番目が正解
      }
    }
  };
}

/***** 4) 注視点（1000ms・大きめプラス） *****/
function makeFixation(ms=1000){
  return {
    type:'html-keyboard-response',
    stimulus:'<div style="font-size:120px;line-height:1;text-align:center;">+</div>',
    choices: jsPsych.NO_KEYS,
    trial_duration: ms
  };
}

/***** 5) 刺激の再生（Canvas／旧・新フォーマット両対応） *****/
function normalizeStim(raw){
  // ★新形式を先に判定（frames + settings）
  if (Array.isArray(raw?.frames) && raw?.settings) {
    const colors = raw.settings.COLORS || {};
    const goalBase = raw.settings.GOAL || raw.goal || null;
    const obstacleBase = raw.settings.OBSTACLE || raw.obstacle || null;
    const goal = (raw.settings.USE_GOAL && goalBase)
      ? Object.assign({}, goalBase, { color: (colors.goal || goalBase.color || '#ff6666') })
      : null;
    const obstacle = (raw.settings.USE_OBSTACLE && obstacleBase)
      ? Object.assign({}, obstacleBase, { color: (colors.obstacle || obstacleBase.color || 'gray') })
      : null;
    return {
      W: (raw.settings.W ?? raw.canvas?.width ?? 800),
      H: (raw.settings.H ?? raw.canvas?.height ?? 600),
      BG: (colors.bg || raw.settings.BG || raw.canvas?.background || '#ffffff'),
      R: (raw.settings.R ?? raw.parameters?.radius ?? 30),
      goal, obstacle,
      positions: raw.frames.map(f => ({ x: f.x, y: f.y })),
      color: (colors.ball || raw.settings.BALL_COLOR || raw.ball?.color || '#333333')
    };
  }

  // 旧形式（ball.positions）
  if (raw?.ball && Array.isArray(raw.ball.positions)) {
    return {
      W: raw.canvas?.width ?? 800,
      H: raw.canvas?.height ?? 600,
      BG: raw.canvas?.background ?? '#ffffff',
      R: raw.parameters?.radius ?? 30,
      goal: raw.goal || null,
      obstacle: raw.obstacle || null,
      positions: raw.ball.positions.map(([x,y]) => ({x,y})),
      color: raw.ball?.color ?? '#333333'
    };
  }

  return { W:800, H:600, BG:'#fff', R:30, positions:[] };
}


/* === JSON 先読み用の簡易キャッシュ === */
const STIM_CACHE = new Map();

async function loadStimJson(file){
  if (STIM_CACHE.has(file)) return STIM_CACHE.get(file);
  const r = await fetch(file, { cache: 'force-cache' });   // ブラウザのHTTPキャッシュも活用
  if (!r.ok) throw new Error(`fetch failed ${file} [${r.status}]`);
  const raw  = await r.json();
  const data = normalizeStim(raw);
  STIM_CACHE.set(file, data);
  return data;
}

function prefetchStim(file){
  if (!file || STIM_CACHE.has(file)) return;
  // 失敗は無視（再生時に再トライ）
  loadStimJson(file).catch(()=>{});
}

function makePlayback(file){
  return {
    type:'html-keyboard-response',
    stimulus:'<canvas id="cv" width="800" height="600" style="display:block;margin:0 auto; outline:3px solid #d1d5db; outline-offset:0; border-radius:8px;"></canvas>',
    choices: jsPsych.NO_KEYS,
    on_load: async function(){
      try{
        const root = (jsPsych.getDisplayElement && jsPsych.getDisplayElement()) || document;
        let cv = root.querySelector('#cv') || root.querySelector('canvas');
        if (!cv) {
          const host = root.querySelector('#jspsych-html-keyboard-response-stimulus') || root;
          cv = document.createElement('canvas'); cv.id='cv'; cv.width=800; cv.height=600;
          host.appendChild(cv);
        }
        const ctx = cv.getContext('2d');

        // 刺激JSONの取得（先読み済みなら即返る）
        const data = await loadStimJson(file);

        // 内部解像度は刺激の素の大きさのまま
        cv.width = data.W; 
        cv.height = data.H;

        // ★ 画面にフィットさせる（はみ出さないように自動縮小）
        function fitCanvasToViewport(){
          // 余白分（上下左右のパディング）として少しだけ差し引き
          const padding = 48; 
          const maxW = Math.max(320, (window.innerWidth || document.documentElement.clientWidth) - padding);
          const maxH = Math.max(320, (window.innerHeight || document.documentElement.clientHeight) - padding);
          // 縦横どちらにも収まる縮小率を採用（拡大はしない）
          const scale = Math.min(maxW / data.W, maxH / data.H, 1);
          cv.style.width = (data.W * scale) + 'px';
          cv.style.height = (data.H * scale) + 'px';
        }
        fitCanvasToViewport();
        window.addEventListener('resize', fitCanvasToViewport);
        document.addEventListener('fullscreenchange', fitCanvasToViewport);

        // ★ 終了時に後始末
        function cleanup(){
          window.removeEventListener('resize', fitCanvasToViewport);
          document.removeEventListener('fullscreenchange', fitCanvasToViewport);
        }

        let f = 0;
        function drawFrame(){
          const p = data.positions[f++];
          if (!p) { cleanup(); jsPsych.finishTrial(); return; }

          // 背景
          ctx.fillStyle = data.BG; 
          ctx.fillRect(0,0,data.W,data.H);

          // goal
          if (data.goal){
            ctx.fillStyle = data.goal.color || '#ff6666';
            ctx.beginPath(); ctx.arc(data.goal.x, data.goal.y, data.goal.radius||15, 0, Math.PI*2); ctx.fill();
          }
          // obstacle
          if (data.obstacle){
            ctx.fillStyle = data.obstacle.color || 'gray';
            ctx.fillRect(data.obstacle.x, data.obstacle.y, data.obstacle.width, data.obstacle.height);
          }
          // ball
          ctx.fillStyle = data.color || '#333';
          ctx.beginPath(); ctx.arc(p.x, p.y, data.R, 0, Math.PI*2); ctx.fill();

          requestAnimationFrame(drawFrame);
        }

        // すぐ1フレーム目を描画
        drawFrame();

      }catch(e){
        console.error(e);
        jsPsych.finishTrial(); // 失敗時も止まらず次へ
      }
    },
    on_finish:(d)=>{ d.block='stim'; d.stimulus_file=file; }
  };
}



/***** 6) 刺激リスト … manifest 必須（本数は可変） *****/
async function preloadStimuliList(){
  const url = 'stimuli/manifest.json';
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('manifest.json の読み込みに失敗しました。');

  const m = await r.json();

  if (!Array.isArray(m.main) || m.main.length === 0) {
    throw new Error(`manifest.main には少なくとも1つ以上のファイル名が必要です（現在 ${m.main?.length} 本）。`);
  }

  // 先頭ID（21,22,...）で並べ替え
  const files = m.main
    .slice()
    .sort((a, b) => extractLeadingId(a) - extractLeadingId(b))
    .map(n => encodeURI(`stimuli/${n}`));

  return files;
}



/***** 7) タイムライン *****/
const timeline = [];

// ==== イントロダクション（同意） ====
timeline.push({
  type: 'html-button-response',
  stimulus: `
    <h2>図形の動きに対する印象アンケート</h2>
    <p>この度はお忙しいところ、本調査にご協力いただき誠にありがとうございます。<br>
    回答を始める前に、以下の内容をご確認ください。</p>

    <div style="text-align: left; max-height: 500px; overflow-y: auto; padding: 10px; border: 1px solid #ccc; font-size: 14px;">

      <h3>本調査の目的</h3>
      <p>本調査は、図形が動いている様子に対する感じ方の傾向を調べることを目的としています。</p>

      <h3>本調査への回答および辞退について</h3>
      <p>本調査への回答は、あなたの自由な意思によるものです。調査への回答を始めた後でも、いつでも回答を中止することができます。<br>
      回答を中止した場合、そのデータは一切使用されません。また、本調査に回答しないこと、あるいは回答を中止することで、あなたが不利益を被ることはありません。<br>
      ただし、謝礼の受け取りには、回答の完了が必要です。
      
      <h3>本調査で得られるデータの取り扱いについて</h3>
      <p>本調査で得られたデータは、すべて個人と紐づけられない形で統計的に処理され、パスワードをかけて厳重に保管されます。<br>
      本調査で得られたデータは、学術目的に限定して公表される場合があります。データを公表する際にも、個人が特定できない形で公表を行います。</p>

      <h3>本調査の回答方法について</h3>
      <p>本調査は、オンラインフォーム上で実施されます。回答に正解・不正解はありません。それぞれの質問に、素直にお答えください。<br>
      本調査の所要時間の目安は10~15分程度です。パソコン（Windows、Mac等）を用いて、静穏な環境でご回答ください。</p>

      <h3>謝礼のお支払いについて</h3>
      <p>以下の要件をすべて満たした方に、ランサーズ上で指定した金額をお支払いいたします。<br>
      本調査の回答完了後に表示されるパスコードを、ランサーズの作業画面で入力し、送信してください。<br>
      なお、明らかに質問を読んでいないと判断される回答がある場合などには、謝礼をお支払いできません。</p>

      <h3>本研究に関するお問い合わせについて</h3>
      <p>本研究で得られた結果について知りたい場合は、ランサーズのメッセージ機能でご連絡ください。<br>
      ただし、個人を特定できるデータを保存していないため、個人データを開示することはできません。<br>
      研究実施機関：名古屋大学情報学研究科　心理・認知科学専攻　心理学講座　北神研究室</p>
      
      <h3>重要なお願い</h3>
      <ul>
        <li>「同意する」を押すと自動的に全画面に切り替わります。最後まで全画面表示のままご回答ください。</li>
        <li>データ品質のため、中断・離脱はしないでください。やむを得ず中止する場合は、その時点でページを閉じてください（途中までの回答は使用せず、謝礼の対象にもなりません）。</li>
        <li>回答中は、ブラウザの戻る／更新、他タブ・他ウィンドウ操作は行わないでください。</li>
      </ul>

    </div>

    <h3>あなたは、上記の説明をよく読み、調査への参加に同意しますか。</h3>
    <p style="font-weight: bold;">※「同意する」を押すと全画面表示に切り替わります。<br>※「同意しない」を選択すると、調査終了ページに移動します。</p>
  `,
  choices: ['同意する', '同意しない'],

  // 「同意する」を押した瞬間にフルスクリーン要求
  on_load: () => {
    const btns = document.querySelectorAll('.jspsych-btn');
    if (btns[0]) {
      btns[0].addEventListener('click', () => {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
          el.requestFullscreen().catch(()=>{ /* ユーザー拒否などは無視 */ });
        }
      }, { once: true });
    }
  // ★追加：右側（同意しない）クリックは即終了（確実に止める）
  if (btns[1]) {
    btns[1].addEventListener('click', (ev) => {
      // プラグインの標準ハンドラが動く前に止める
      ev.stopImmediatePropagation();
      ev.preventDefault();

      try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch(e){}

      jsPsych.endExperiment(
        "ご協力ありがとうございました。<br>同意が得られなかったため、調査は行われませんでした。<br><br>このウィンドウを閉じて終了してください。"
      );
    }, { capture: true, once: true });
  }
},

  // 「同意しない」のときは終了
  on_finish: function(data){
  // 0: 同意する, 1: 同意しない（数値/文字列どちらでも来る可能性に対応）
  const idx = (typeof data.button_pressed === 'number')
    ? data.button_pressed
    : Number.parseInt(data.button_pressed, 10);

  if (idx === 1) {
    try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch(e){}
    jsPsych.endExperiment(
      "ご協力ありがとうございました。<br>同意が得られなかったため、調査は行われませんでした。<br><br>このウィンドウを閉じて終了してください。"
    );
    return; // 念のため
  }
}
});


// 操作説明
timeline.push({
  type: 'html-button-response',
  stimulus: `
    <h3>操作説明</h3>
    <p>灰色の四角形と赤い丸が描かれた画面の中を、黒い丸が動く短い動画が再生されます。</p>
    <p>黒い丸の動き方は動画ごとに異なりますが、これらの動き方は<strong>すべて不具合ではなく</strong>、あらかじめ設定されたものです。</p>
    <p>各動画の再生が終わると、質問が表示されます。各動画に表示された<strong>「黒い丸」</strong>の動き全体の印象を評価してください。</p>
  `,
  choices: ['練習を始める'],
  // ★ 説明を読んでいる間に、練習4本を先読み
  on_load: ()=>{
    prefetchStim('stimuli/t1_g0o1_j0_jp0_n0_np0_c0.json');
    prefetchStim('stimuli/t2_g1o1_j40_jp197_n0_np0_c0.json');
    prefetchStim('stimuli/t3_g1o1_j40_jp197_n0_np0_c3.json');
    prefetchStim('stimuli/t4_g1o1_j40_jp197_n0_np0_c6.json');
    } 
});

// 練習（4本）
const practiceFiles = [
  'stimuli/t1_g0o1_j0_jp0_n0_np0_c0.json',
  'stimuli/t2_g1o1_j40_jp197_n0_np0_c0.json',
  'stimuli/t3_g1o1_j40_jp197_n0_np0_c3.json',
  'stimuli/t4_g1o1_j40_jp197_n0_np0_c6.json'
];
for (let i=0;i<practiceFiles.length;i++){
  timeline.push(makeFixation(FIX_MS));
  timeline.push(makePlayback(practiceFiles[i]));
  timeline.push(makeSurveyPage({ includeIMC:false, allowFreeText:true, phase:'practice' }));
}

/***** 8) 本番ブロックを非同期で構築 → jsPsych.init *****/
async function main(){
  // ★ manifest から本番用の刺激ファイルを読み込み（ID順に整列）
  const baseFiles = await preloadStimuliList(); 
  // 例: ["stimuli/21a_...", "stimuli/21b_...", ..., "stimuli/26b_..."]

  // ★ 練習→本番のブリッジ（ここからが本番です）
  timeline.push({
   type: 'html-button-response',
  stimulus: `
    <h3>本番開始</h3>
    <p>ここからが本番です。</p>
    <p>灰色の四角形と赤い丸が描かれた画面の中を、黒い丸が動く短い動画が順番に再生されます。</p>
    <p>黒い丸の動き方は動画ごとに異なりますが、これらの動き方は<strong>すべて不具合ではなく</strong>、あらかじめ設定されたものです。</p>
    <p>各動画の再生が終わると、質問が表示されます。先ほどと同様に、各動画に表示された<strong>「黒い丸」</strong>の動き全体の印象を評価してください。</p>
  `,
   choices: ['開始する']
  });


  // ★ 実験2用：6条件×2ブロックの呈示順を作成
  const order = buildMainOrderExp2(baseFiles);

  // 解析用の共通プロパティ（ログ用）
  jsPsych.data.addProperties({
    participant_id: PID,
    n_trials_main: order.length,
    stim_ids_main: order.map(f => extractLeadingId(f)).join('-')
  });

  // ★ どこからでも参照できるように保持し、冒頭で2本プリフェッチ
  window.STIM_ORDER = order;
  prefetchStim(order[0]);
  prefetchStim(order[1]);

  order.forEach((file, idx)=>{
    timeline.push(makeFixation(FIX_MS));
    timeline.push(makePlayback(file));

    const n = idx + 1;
    const isLast = (n === order.length);  // 最後のページだけ IMC を入れる

    timeline.push(makeSurveyPage({
      includeIMC: isLast,
      allowFreeText: true,
      phase: 'main'
    }, file, n));
  });



  // 終了アンケート（年齢・性別）
  timeline.push({
    type: 'survey-html-form',
    preamble: '<h3>年齢と性別をお聞かせください。</h3>',
    html: `
      <p>年齢：<input name="age" type="number" min="18" max="100" required style="width:6em"></p>
      <p>性別：
        <label><input type="radio" name="gender" value="female" required>女性</label>
        <label><input type="radio" name="gender" value="male">男性</label>
        <label><input type="radio" name="gender" value="other">その他</label>
        <label><input type="radio" name="gender" value="noanswer">回答しない</label>
      </p>
    `,
    button_label: '次へ',
    on_finish:(d)=>{ d.participant_id = PID; d.block='demographics'; }
  });

// 最終自由記述（任意）→ ここでは送信しない＝パスコード表示へ進む
timeline.push({
  type: 'survey-html-form',
  preamble:'<h3>ご意見・ご感想（任意）</h3><p>調査全体を通して気づいたことがあればご記入ください。</p>',
  html:`<textarea name="comment" rows="4" style="width:100%"></textarea>`,
  button_label: '次へ',
  on_finish: (d)=>{ 
    d.participant_id = PID; 
    d.block = 'final_comment';
  }
});

// パスコード表示 → 送信（送信前は案内のみ／送信後にパスコード＋赤字注意を表示）
timeline.push({
  type: 'html-button-response',
  stimulus: `
    <h3>送信のお願い</h3>
    <p>このボタンを押すと<strong>データを送信</strong>します。<br>
    送信が完了すると<strong>次の画面でパスコード</strong>が表示されます。</p>
  `,
  choices: ['送信する'],
  on_finish: ()=>{
    // ここで送信
    jsPsych.pauseExperiment();
    showSendingScreen('データを送信中です…');

    const payload = {
      id: PID,
      when: new Date().toISOString(),
      meta: {
        site: location.host,
        ver: "2025-11-11_passcode1",   // 追跡用のバージョン。必要なら更新してください
        ua: navigator.userAgent,
        vp: { w: innerWidth, h: innerHeight },
        stim_order: (window.STIM_ORDER || null),
        passcode: PASSCODE              // 照合作業用に同梱
      },
      data: JSON.parse(jsPsych.data.get().json())
    };

    (async ()=>{
      let ok = await postOnce(payload, 15000);
      if (!ok) ok = await postOnce(payload, 15000);

      if (ok){
        // 送信成功：全画面を抜けてパスコード（赤字注意つき）を表示
        try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch(e){}
        jsPsych.endExperiment(
          'データを送信しました。ご協力ありがとうございました。<br><br>' +
          '<style>.code-box{font-size:32px;letter-spacing:.18em;margin:12px 0;padding:12px 16px;border:2px dashed #9ca3af;display:inline-block;user-select:all;cursor:pointer} .warn{color:#b91c1c;font-weight:700;font-size:1.1rem} .note{color:#6b7280;font-size:.95rem}</style>' +
          '<h3>パスコードのご案内</h3>' +
          '以下の<strong>パスコード</strong>を、ランサーズの作業画面に<strong>半角数字で</strong>入力してください。<br>' +
          '<div class="code-box" id="passcode" onclick="navigator.clipboard&&navigator.clipboard.writeText&&navigator.clipboard.writeText(this.textContent.trim())">'+PASSCODE+'</div>' +
          '<p class="warn">※このパスコードが正しく入力されない場合、<br>謝礼をお支払いすることができません。</p>' +
          '<div class="note">（クリックでコピーできます。）</div>'
        );
        jsPsych.resumeExperiment();
        return;
      }

      // 送信失敗：ローカル保存＋自動再送 → 同デザインでパスコードを案内
      queuePending(payload);
      startAutoRetryLoop(payload, ()=>{ /* 成功しても静かに完了 */ });

      setTimeout(()=>{
        try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch(e){}
        jsPsych.endExperiment(
          'データの送信手続きを継続しています（通信が回復すると自動で完了します）。<br><br>' +
          '<style>.code-box{font-size:32px;letter-spacing:.18em;margin:12px 0;padding:12px 16px;border:2px dashed #9ca3af;display:inline-block;user-select:all;cursor:pointer} .warn{color:#b91c1c;font-weight:700;font-size:1.1rem} .note{color:#6b7280;font-size:.95rem}</style>' +
          '<h3>パスコードのご案内</h3>' +
          'ランサーズの提出には、以下の<strong>パスコード</strong>が必要です。<br>' +
          '<div class="code-box" id="passcode" onclick="navigator.clipboard&&navigator.clipboard.writeText&&navigator.clipboard.writeText(this.textContent.trim())">'+PASSCODE+'</div>' +
          '<p class="warn">※このパスコードが正しく入力されない場合、<br>謝礼をお支払いすることができません。</p>' +
          '<div class="note">（クリックでコピーできます。）</div>'
        );
        jsPsych.resumeExperiment();
      }, 4000);
    })();
  }
});



  // jsPsych 初期化（送信処理は自由記述の on_finish で実施済み）
jsPsych.init({
  display_element: 'jspsych-target',
  timeline: timeline,
  on_finish: function(){
    // 念のため：通常終了時にフルスクリーン解除
    if (document.fullscreenElement) document.exitFullscreen?.();
  }
});

}

main();
