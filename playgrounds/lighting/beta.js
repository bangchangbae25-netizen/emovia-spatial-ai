(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const photoBase='https://images.unsplash.com/';
const rooms={
LIVING:{name:'거실',english:'LIVING',image:photoBase+'photo-1771888703723-01d85da1dae1?auto=format&fit=crop&w=2000&q=82',fixture:'LINEAR',points:{CEILING:[49,17,'천장'],WALL:[71,43,'벽'],FLOOR:[51,77,'바닥'],DISPLAY:[54,49,'소품']}},
KITCHEN:{name:'주방',english:'KITCHEN',image:photoBase+'photo-1771372125074-5c7c4332095f?auto=format&fit=crop&w=2000&q=82',fixture:'PENDANT',points:{CEILING:[51,13,'천장'],COUNTER:[52,66,'조리대'],WALL:[76,38,'벽'],DISPLAY:[24,34,'장식장']}},
RETAIL:{name:'리테일',english:'RETAIL',image:photoBase+'photo-1771033834141-023d630b3965?auto=format&fit=crop&w=2000&q=82',fixture:'TRACK',points:{CEILING:[54,12,'천장'],DISPLAY:[64,47,'진열'],WALL:[84,36,'벽'],COUNTER:[51,66,'중앙대']}},
MY:{name:'내 공간',english:'MY SPACE',image:null,fixture:'DOWN',points:{CEILING:[49,20,'천장'],WALL:[77,43,'벽'],COUNTER:[50,55,'가구'],FLOOR:[50,76,'바닥'],DISPLAY:[35,54,'전시']}}
};
const types=[
{id:'DOWN',title:'다운라이트',icon:'◉',zones:['CEILING'],spaces:['LIVING','KITCHEN','RETAIL','MY'],source_types:['DOWNLIGHT','SURFACE_LIGHT']},
{id:'LINEAR',title:'라인·간접',icon:'━',zones:['CEILING','WALL','COUNTER'],spaces:['LIVING','KITCHEN','RETAIL','MY'],source_types:['LINEAR_RECESSED','STRIP']},
{id:'TRACK',title:'레일 스포트',icon:'◌',zones:['CEILING','DISPLAY'],spaces:['LIVING','KITCHEN','RETAIL','MY'],source_types:['TRACK_SPOT','TRACK_LINEAR','MAGNETIC_TRACK']},
{id:'PENDANT',title:'펜던트',icon:'◇',zones:['CEILING','COUNTER'],spaces:['LIVING','KITCHEN','RETAIL','MY'],source_types:['PENDANT']},
{id:'UNDER',title:'가구 하부등',icon:'▱',zones:['COUNTER','DISPLAY'],spaces:['KITCHEN','RETAIL','MY'],source_types:['STRIP']},
{id:'WALL',title:'벽 강조등',icon:'◕',zones:['WALL','DISPLAY'],spaces:['LIVING','RETAIL','MY'],source_types:['TRACK_SPOT']},
{id:'FLOOR',title:'플로어등',icon:'♧',zones:['FLOOR'],spaces:['LIVING','MY'],source_types:['FLOOR_LAMP']}
];
const tones={
WARM:{name:'따뜻함',rgb:[255,179,103]},SOFT:{name:'은은함',rgb:[255,213,164]},NATURAL:{name:'자연광',rgb:[255,241,215]},COOL:{name:'깨끗함',rgb:[206,230,255]}
};
const moods={
EVENING:{name:'따뜻한 저녁',icon:'☼',phase:'NIGHT',tone:'WARM',brightness:61,focus:40},
REST:{name:'편안한 휴식',icon:'☾',phase:'NIGHT',tone:'SOFT',brightness:40,focus:21},
FOCUS:{name:'집중·작업',icon:'✦',phase:'DAY',tone:'NATURAL',brightness:84,focus:76},
PRODUCT:{name:'제품을 돋보이게',icon:'◈',phase:'NIGHT',tone:'NATURAL',brightness:70,focus:91},
DAY:{name:'맑은 낮',icon:'◇',phase:'DAY',tone:'COOL',brightness:88,focus:30}
};
let state={room:'LIVING',photo:null,phase:'NIGHT',mood:'EVENING',fixture:'LINEAR',zone:'CEILING',tone:'WARM',brightness:61,focus:40};
let photoUrl=null,source=[],comparison=false,aState=null,saved=[],split=50;
const clone=x=>JSON.parse(JSON.stringify(x));
const sameBase=(a,b)=>a&&b&&a.room===b.room&&a.photo===b.photo;
const ft=()=>types.find(x=>x.id===state.fixture)||types[0];
let toastTimer=0;
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400)}
function filterTypes(){return types.filter(f=>f.spaces.includes(state.room))}
function zoneFor(f){const pts=rooms[state.room].points;return f.zones.find(z=>Boolean(pts[z]))||Object.keys(pts)[0]}
function currentPhoto(){return state.photo||rooms[state.room].image}
function applyPreset(m){const p=moods[m];state.mood=m;state.phase=p.phase;state.tone=p.tone;state.brightness=p.brightness;state.focus=p.focus;draw()}
function setRoom(room){
if(!rooms[room])return;
if(photoUrl&&room!=='MY'){URL.revokeObjectURL(photoUrl);photoUrl=null}
state.room=room;state.photo=null;state.fixture=rooms[room].fixture;
state.zone=zoneFor(ft());aState=null;comparison=false;draw();
}
function setUploaded(file){
if(!file||!file.type.startsWith('image/'))return toast('이미지 파일만 사용할 수 있습니다.');
if(file.size>12*1024*1024)return toast('사진은 12MB 이하만 가능합니다.');
if(photoUrl)URL.revokeObjectURL(photoUrl);
photoUrl=URL.createObjectURL(file);
state.room='MY';state.photo=photoUrl;state.fixture='DOWN';state.zone='CEILING';aState=null;comparison=false;draw();
toast('사진을 이 브라우저에서만 표시합니다. 자동 위치 인식은 하지 않습니다.');
}
function stateForRoom(s){
const isBefore=s===null;
return isBefore?{...state,mood:'BASELINE',phase:'DAY',tone:'NATURAL',brightness:95,focus:5}:s;
}
function effect(layer,s,baseline){
const tone=tones[s.tone]||tones.NATURAL;let b=s.brightness/100,f=s.focus/100;
let night=s.phase==='NIGHT';
const x=rooms[s.room].points[s.zone]||Object.values(rooms[s.room].points)[0];
let shade=baseline?0:(night?0.49-0.20*b:0.11-0.04*b);
let strength=baseline?0:((night?0.2:0.06)+b*(night?0.55:0.28))*(0.57+f*.43);
layer.style.setProperty('--r',tone.rgb[0]);layer.style.setProperty('--g',tone.rgb[1]);layer.style.setProperty('--b',tone.rgb[2]);
layer.style.setProperty('--shade',shade.toFixed(3));
layer.style.setProperty('--strength',strength.toFixed(3));
layer.style.setProperty('--photo-bright',baseline?'1':(night?(.80+b*.13):(.92+b*.12)).toFixed(2));
layer.style.setProperty('--photo-sat',baseline?'1':(night?'.86':'.99'));
layer.style.setProperty('--bounce',baseline?'0':(.2+b*.52).toFixed(2));
layer.style.setProperty('--x',x[0]+'%');layer.style.setProperty('--y',x[1]+'%');
layer.style.setProperty('--radius',(96-f*66)+'%');
}
function changeImage(){
const url=currentPhoto();
if($('main-photo').getAttribute('src')!==url){$('main-photo').src=url||'';$('before-photo').src=url||''}
}
function renderScene(){
changeImage();
effect($('after'),state,false);
effect($('before-layer'),sameBase(aState,state)?aState:state,sameBase(aState,state)?false:true);
$('stage').classList.toggle('compare',comparison);
$('before-layer').style.clipPath='inset(0 '+(100-split)+'% 0 0)';
$('split-line').style.left=split+'%';
$('compare-slider').classList.toggle('on',comparison);
$('btn-compare').classList.toggle('active',comparison);
$('btn-phase').textContent=state.phase==='NIGHT'?'☀ 낮으로':'☾ 밤으로';
$('daylabel').textContent=(state.phase==='NIGHT'?'EVENING':'DAYTIME')+' · '+(comparison?'A/B':'LIVE');
$('stage-mood').textContent=moods[state.mood]?.name||'직접 조절';
$('stage-subtitle').textContent=ft().title+' · '+tones[state.tone].name+' · '+state.brightness+'%';
const points=rooms[state.room].points;
$('hotspots').innerHTML=Object.entries(points).map(([z,p])=>'<button type="button" class="hotspot '+(state.zone===z?'active':'')+'" style="left:'+p[0]+'%;top:'+p[1]+'%" data-zone="'+z+'" data-name="'+p[2]+'" aria-label="'+p[2]+' 조명 강조" title="'+p[2]+'"></button>').join('');
$('zone-status').textContent='현재 선택: '+ft().title+' · '+points[state.zone][2]+' 영역. 이 조합은 시각적 연출이며 실제 설치 규격이나 광학 성능을 검증한 결과가 아닙니다.';
}
function renderControls(){
$('room-name').textContent='/ '+rooms[state.room].english;
document.querySelectorAll('[data-room]').forEach(b=>b.classList.toggle('active',b.dataset.room===state.room));
$('moods').innerHTML=Object.entries(moods).map(([k,m])=>'<button class="'+(state.mood===k?'active':'')+'" data-mood="'+k+'"><b>'+m.icon+'</b>'+m.name+'</button>').join('');
$('fixtures').innerHTML=filterTypes().map(f=>'<button class="'+(state.fixture===f.id?'active':'')+'" data-fixture="'+f.id+'"><b>'+f.icon+'</b>'+f.title+'</button>').join('');
$('tones').innerHTML=Object.entries(tones).map(([k,t])=>'<button class="'+(state.tone===k?'active':'')+'" data-tone="'+k+'" style="--tone:rgb('+t.rgb.join(',')+')">'+t.name+'</button>').join('');
$('brightness').value=state.brightness;$('focus').value=state.focus;
$('brightness-val').textContent=state.brightness+'%';$('focus-val').textContent=state.focus+'%';
renderSources();
renderSaved();
}
function renderSources(){
const f=ft();const matches=source.filter(p=>f.source_types.includes(p.fixture_type));
$('source-count').textContent=source.length+'개 상품 링크';
$('source-results').innerHTML=matches.length?matches.slice(0,4).map(p=>'<div class="source-item"><span>'+esc(p.product_name)+'<br><small>상품정보 출처: 비츠조명 · 제조사 미확인</small></span><a href="'+esc(p.official_source_url)+'" target="_blank" rel="noopener noreferrer">상세</a></div>').join(''):'<p class="source-disclosure">해당 유형의 참고 판매상품이 연결되지 않았습니다. 범용 조명 체험은 계속 가능합니다.</p>';
}
function readSaved(){try{const s=JSON.parse(localStorage.getItem('emovia_lighting_beta_v02')||'[]');saved=Array.isArray(s)?s.filter(x=>x.room!=='MY').slice(0,10):[]}catch(e){saved=[]}}
function renderSaved(){
$('saved-list').innerHTML=saved.length?saved.map((s,i)=>'<div class="saved-row"><span>'+(i+1)+'. '+(rooms[s.room]?.name||'공간')+' · '+(types.find(f=>f.id===s.fixture)?.title||'조명')+' · '+(tones[s.tone]?.name||'느낌')+'</span><button data-restore="'+i+'">불러오기</button></div>').join(''):'아직 저장된 조합이 없습니다.';
}
function draw(){renderScene();renderControls()}
function selectFixture(id){
const f=filterTypes().find(x=>x.id===id);if(!f)return;
state.fixture=id;state.zone=zoneFor(f);state.mood='CUSTOM';draw();
}
function toggleZone(z){
if(!rooms[state.room].points[z])return;
if(!ft().zones.includes(z))return toast('선택한 조명 유형에서는 지원하지 않는 위치입니다.');
state.zone=z;state.mood='CUSTOM';draw();
}
document.addEventListener('click',e=>{
const b=e.target.closest('button');if(!b)return;
if(b.dataset.room){setRoom(b.dataset.room);return}
if(b.dataset.mood){applyPreset(b.dataset.mood);return}
if(b.dataset.fixture){selectFixture(b.dataset.fixture);return}
if(b.dataset.tone){state.tone=b.dataset.tone;state.mood='CUSTOM';draw();return}
if(b.dataset.zone){toggleZone(b.dataset.zone);return}
if(b.dataset.restore!==undefined){
const s=saved[Number(b.dataset.restore)];if(!s)return;
state=clone(s);aState=null;comparison=false;draw();toast('저장된 조합을 불러왔습니다.');return;
}
});
$('my-photo').addEventListener('change',e=>{setUploaded(e.target.files?.[0]);e.target.value=''});
$('brightness').addEventListener('input',e=>{state.brightness=Number(e.target.value);state.mood='CUSTOM';renderScene();$('brightness-val').textContent=state.brightness+'%'});
$('focus').addEventListener('input',e=>{state.focus=Number(e.target.value);state.mood='CUSTOM';renderScene();$('focus-val').textContent=state.focus+'%'});
$('brightness').addEventListener('change',draw);$('focus').addEventListener('change',draw);
$('btn-phase').addEventListener('click',()=>{state.phase=state.phase==='DAY'?'NIGHT':'DAY';state.mood='CUSTOM';draw()});
$('btn-compare').addEventListener('click',()=>{comparison=!comparison;draw()});
$('btn-a').addEventListener('click',()=>{aState=clone(state);comparison=false;draw();toast('기준안 A를 저장했습니다. 이제 조명을 변경한 뒤 비교해 보세요.')});
$('split').addEventListener('input',e=>{split=Number(e.target.value);$('before-layer').style.clipPath='inset(0 '+(100-split)+'% 0 0)';$('split-line').style.left=split+'%'});
$('btn-save').addEventListener('click',()=>{
if(state.room==='MY')return toast('내 사진은 보관하지 않습니다. 기본 공간의 조합만 저장할 수 있습니다.');
const row=clone({...state,photo:null});saved.unshift(row);saved=saved.slice(0,10);
try{localStorage.setItem('emovia_lighting_beta_v02',JSON.stringify(saved));toast('이 브라우저에 조합을 저장했습니다.')}catch(e){toast('저장 권한이 없어 현재 화면에만 보관합니다.')}
renderSaved();
});
$('btn-copy').addEventListener('click',()=>{
const payload={channel_id:'CH_EMOVIA_LIGHTING_PLAYGROUND_V1',version:'VISUAL_BETA_0.2',room:state.room,fixture_type:state.fixture,lighting_zone:state.zone,mood:state.mood,tone:state.tone,brightness_ui:state.brightness,focus_ui:state.focus,day_night:state.phase,geometry_lock:true,camera_lock:true,product_brand:null,merchant_reference:'VITTZ',result_type:'QUALITATIVE',photometric_validation:'NOT_RUN',physical_product_application:'NOT_APPLIED'};
const value=JSON.stringify(payload,null,2);
if(!navigator.clipboard?.writeText)return toast('이 브라우저에서는 클립보드 복사를 지원하지 않습니다.');
navigator.clipboard.writeText(value).then(()=>toast('선택 조합을 JSON으로 복사했습니다.')).catch(()=>toast('클립보드 사용이 차단되었습니다.'));
});
$('main-photo').addEventListener('error',()=>toast('공간 이미지 로딩 실패: 인터넷 연결을 확인해 주세요.'));
fetch('./data/vittz-products.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>{
const keys=new Set();source=(data.products||[]).filter(p=>{
if(!p.catalog_product_id||!p.product_name||keys.has(p.catalog_product_id))return false;
keys.add(p.catalog_product_id);
return p.official_source_url.startsWith('https://www.vittz.co.kr/')&&p.activation_status==='INACTIVE'&&p.applied_status==='NOT_APPLIED';
});renderSources();
}).catch(()=>{$('source-results').innerHTML='<p class="source-disclosure">판매처 제품정보를 불러오지 못했습니다. 범용 조명 체험은 사용 가능합니다.</p>'});
readSaved();draw();
})();
