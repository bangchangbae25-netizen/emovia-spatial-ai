import {
  CONTROL,SERVICES,FLOW_STAGES,RESEARCH_SCENARIOS,FAULT_ROUTES,
  resolveSelection,validateInput,initFlow,flowTransition,simulateSubmission,
  approvalReadiness
} from "./core.mjs";

const byId=(id)=>document.getElementById(id);
const ui={
  service:byId("service-select"),mode:byId("entry-mode"),
  routeExtra:byId("route-extra"),space:byId("space-id"),purpose:byId("purpose-id"),
  serviceDescription:byId("service-description"),routeStatus:byId("route-status"),
  goal:byId("goal-input"),fields:byId("domain-fields"),reviewButton:byId("review-button"),
  resetButton:byId("reset-button"),inputStatus:byId("input-status"),
  reviewContent:byId("review-content"),ack:byId("acknowledge"),
  simulateButton:byId("simulate-button"),simulationResult:byId("simulation-result"),
  flowStages:byId("flow-stages"),scenarioCount:byId("scenario-count"),
  faultCount:byId("fault-count")
};
let inputRevision=1;
let activeReview=null;
let flow=null;
let simulationAttempt=0;
const simulationCache=new Map();

function message(element,text,kind=""){
  element.textContent=text;
  element.className=(element.id==="simulation-result"?"simulation-result":"field-status")+(kind?" "+kind:"");
}
function selectedService(){
  return SERVICES.find(s=>s.id===ui.service.value)||null;
}
function makeLabel(title,required=true){
  const label=document.createElement("label");
  label.appendChild(document.createTextNode(title+" "));
  if(required){
    const span=document.createElement("span");
    span.className="required";
    span.textContent="필수 · 설계 검토";
    label.appendChild(span);
  }
  return label;
}
function renderDomainFields(){
  ui.fields.replaceChildren();
  const service=selectedService();
  if (!service)return;
  for(const field of service.fields){
    const label=makeLabel(field.label);
    const control=field.options?document.createElement("select"):document.createElement("input");
    control.dataset.field=field.key;
    if (field.options){
      const empty=document.createElement("option");
      empty.value="";empty.textContent="-- 선택 --";control.appendChild(empty);
      for(const choice of field.options){
        const opt=document.createElement("option");
        opt.value=choice;opt.textContent=choice;control.appendChild(opt);
      }
    }else{
      control.type="text";
      control.maxLength=160;
      control.placeholder="확인 가능한 범위에서만 입력";
    }
    control.addEventListener("input",invalidateReview);
    label.appendChild(control);
    ui.fields.appendChild(label);
  }
}
function makeRoute(){
  return resolveSelection({
    service_id:ui.service.value,entry_mode:ui.mode.value,
    catalog_version:CONTROL.catalog_version,selection_confirmed:true,
    space_id:ui.space.value.trim()||null,purpose_id:ui.purpose.value.trim()||null
  });
}
function currentInput(){
  const record={goal:ui.goal.value};
  for(const control of ui.fields.querySelectorAll("[data-field]")){
    record[control.dataset.field]=control.value;
  }
  return record;
}
function clearReviewVisuals(){
  activeReview=null;
  ui.reviewContent.textContent="입력 검토 전입니다.";
  ui.ack.checked=false;
  ui.ack.disabled=true;
  ui.simulateButton.disabled=true;
  message(ui.simulationResult,"");
}
function invalidateReview(){
  inputRevision+=1;
  clearReviewVisuals();
  flow=null;
  showStages();
  message(ui.inputStatus,"입력 내용이 변경되었습니다. 다시 검토해 주세요.");
}
function showStages(){
  ui.flowStages.replaceChildren();
  const activeIndex=flow?FLOW_STAGES.findIndex(([code])=>code===flow.stage):-1;
  FLOW_STAGES.forEach(([id,name],index)=>{
    const li=document.createElement("li");
    if(index===activeIndex)li.className="current";
    else if(index<activeIndex)li.className="visited";
    li.textContent=id+" · "+name+(id==="FL_03"?" (실제 AI 미실행)":"");
    ui.flowStages.appendChild(li);
  });
}
function updateRoute(){
  ui.routeExtra.hidden=ui.mode.value!=="SPACE_PURPOSE";
  const service=selectedService();
  if(service){
    ui.serviceDescription.textContent=
      "담당: "+(service.domain_id||"OWNER_UNRESOLVED")+
      " · 서비스 상태: CANDIDATE · Capability: UNVERIFIED · 운영: 비활성";
  }
  const route=makeRoute();
  if(!route.ok)message(ui.routeStatus,"라우팅 보류: "+route.code,"error");
  else message(ui.routeStatus,"모의 라우팅 가능 · 실제 서비스 신청은 차단됨");
}
function changeService(){
  ui.goal.value="";
  inputRevision+=1;
  clearReviewVisuals();
  flow=null;
  renderDomainFields();
  updateRoute();
  showStages();
  message(ui.inputStatus,"새 서비스의 조건을 입력해 주세요.");
}
function createSummary(route,input){
  const service=selectedService();
  const items=[
    "선택 서비스: "+service.name+" ("+service.id+")",
    "담당 Domain: "+route.domain_id,
    "고객 진입 경로: "+route.entry_mode,
    "요청 목적: "+input.goal.trim(),
    ...service.fields.map(f=>f.label+": "+input[f.key]),
    "자료 검증: 미실행 / Geometry: UNKNOWN / 실제 AI 분석: 미실행",
    "CASE·결제·이미지 생성: 실행 불가",
    "입력 revision: "+String(inputRevision)
  ];
  ui.reviewContent.textContent=items.join("\n");
}
function reviewInput(){
  clearReviewVisuals();
  const route=makeRoute();
  if(!route.ok){message(ui.inputStatus,"서비스 검토 차단: "+route.code,"error");return;}
  const input=currentInput();
  const validation=validateInput(route.service_id,input);
  if(!validation.ok){
    message(ui.inputStatus,"필수 입력 확인 필요: "+(validation.missing?.join(", ")||validation.code),"error");
    return;
  }
  flow=initFlow(route);
  for(const [event,guard] of [
    ["ELIGIBILITY_SIMULATED",{}],["START",{}],
    ["INPUT_FORM_COMPLETE",{formComplete:true}],["SKIP_AI_DEMO",{}],
    ["NO_ADDITIONAL_FIELDS",{}]
  ]){
    flow=flowTransition(flow,event,guard);
    if(!flow.ok){message(ui.inputStatus,flow.code,"error");return;}
  }
  activeReview={route,input,inputRevision};
  createSummary(route,input);
  ui.ack.disabled=false;
  showStages();
  message(ui.inputStatus,"필수 입력 형식 검토 완료. 전문·자산·시공 검증은 아직 수행되지 않았습니다.","success");
}
function requestSimulation(){
  if(!activeReview||!ui.ack.checked){
    message(ui.simulationResult,"모의 흐름 확인 및 고객 검토가 필요합니다.","error");return;
  }
  if(activeReview.inputRevision!==inputRevision){
    message(ui.simulationResult,"입력 버전이 변경되었습니다. 다시 검토하세요.","error");return;
  }
  flow=flowTransition(flow,"CUSTOMER_CONFIRMED",{reviewConfirmed:true});
  if(!flow.ok){message(ui.simulationResult,flow.code,"error");return;}
  flow=flowTransition(flow,"PRE_CASE_SIMULATION",{simulationAcknowledged:true});
  if(!flow.ok){message(ui.simulationResult,flow.code,"error");return;}
  simulationAttempt+=1;
  const request={
    ...activeReview.route,selection_confirmed:true,mode:"DESIGN_SIMULATION",
    input:activeReview.input,input_revision:inputRevision,submission_revision:activeReview.inputRevision,
    review_confirmed:true,simulation_acknowledged:true,
    idempotency_key:"SIM_ATTEMPT_"+String(simulationAttempt)
  };
  const answer=simulateSubmission(request,simulationCache);
  if(!answer.ok)message(ui.simulationResult,"모의 접수 차단: "+answer.code,"error");
  else{
    message(ui.simulationResult,
      "모의 접수 경로 확인: "+answer.synthetic_ref+
      "\n실제 CASE 생성: 아니요 / 결제 처리: 아니요 / AI 실행: 아니요 / 결과 생성: 아니요",
      "success");
    ui.simulateButton.disabled=true;
    ui.ack.disabled=true;
  }
  showStages();
}
function reset(){
  ui.service.value="SVC_003";
  ui.mode.value="ALL_SERVICES";
  ui.space.value="RESIDENTIAL_BATHROOM";
  ui.purpose.value="PREVIEW_PRODUCT";
  ui.goal.value="";
  inputRevision+=1;
  activeReview=null;
  flow=null;
  simulationCache.clear();
  simulationAttempt=0;
  changeService();
}
function init(){
  for(const s of SERVICES){
    const opt=document.createElement("option");
    opt.value=s.id;
    opt.textContent=s.id+" · "+s.name+(s.domain_id?"":" (담당 미확정)");
    ui.service.appendChild(opt);
  }
  ui.service.value="SVC_003";
  ui.scenarioCount.textContent=String(RESEARCH_SCENARIOS.length);
  ui.faultCount.textContent=String(FAULT_ROUTES.length);
  ui.goal.addEventListener("input",invalidateReview);
  ui.service.addEventListener("change",changeService);
  ui.mode.addEventListener("change",()=>{invalidateReview();updateRoute();});
  ui.space.addEventListener("input",()=>{invalidateReview();updateRoute();});
  ui.purpose.addEventListener("input",()=>{invalidateReview();updateRoute();});
  ui.reviewButton.addEventListener("click",reviewInput);
  ui.resetButton.addEventListener("click",reset);
  ui.ack.addEventListener("change",()=>{ui.simulateButton.disabled=!ui.ack.checked;});
  ui.simulateButton.addEventListener("click",requestSimulation);
  changeService();
  const readiness=approvalReadiness();
  if(readiness.ready)throw new Error("A non-production reference must never become production-ready automatically.");
}
init();
