import tempfile, unittest, threading, json, http.client
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from mvp import ContractStore, ContractError, MODE, SERVICE_DOMAINS, start_server
KEY='local_demo_secret_longer_than_32_chars_and_never_production'
def cr(**k):
 d=dict(mode=MODE,service_id='SVC_003',flow_session_ref='DEMO_FLOW',submission_revision=4,input_validation_status='VALID',review_confirmed=True,access_verified=True,consent_granted=True,payment_policy_resolved=True,idempotency_key='CASE_KEY');d.update(k);return d
def sr(**k):
 d=dict(mode=MODE,input_revision=4,asset_refs=['DEMO_ASSET_001'],fields=[dict(field_id='bathroom.design_goal',value='Quiet bathroom remodel',source_type='USER_ENTERED',verification_status='CONFIRMED')],locks=[]);d.update(k);return d
def jr(c,s,**k):
 d=dict(mode=MODE,case_ref=c,input_snapshot_ref=s,idempotency_key='JOB_KEY',request_type='INITIAL_GENERATION');d.update(k);return d
def err(f):
 try:f();return None
 except ContractError as e:return e.code
class TestStore(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.path=str(Path(self.tmp.name)/'db.sqlite');self.s=ContractStore(self.path,KEY)
 def case(self):return self.s.create_case(cr())['case_ref']
 def snapshot(self):
  c=self.case();s=self.s.freeze_snapshot(c,sr())['input_snapshot_ref'];return c,s
 def job(self):
  c,s=self.snapshot();j=self.s.submit_job(jr(c,s))['job_ref'];return c,s,j
 def event(self,j,n,state,ref=None):return self.s.apply_event(j,dict(event_ref=ref or 'event'+str(n),sequence_number=n,job_status=state))
 def test_registry(self):
  self.assertEqual(len(SERVICE_DOMAINS),11);self.assertEqual(len(set(filter(None,SERVICE_DOMAINS.values()))),7);self.assertIsNone(SERVICE_DOMAINS['SVC_011'])
 def test_case_dedupe(self):
  a=self.s.create_case(cr());b=self.s.create_case(cr());self.assertEqual(a['case_ref'],b['case_ref']);self.assertTrue(b['duplicate']);self.assertFalse(a['production_ready'])
 def test_case_collision(self):self.case();self.assertEqual(err(lambda:self.s.create_case(cr(submission_revision=5))),'IDEMPOTENCY_CONFLICT')
 def test_case_owner_block(self):self.assertEqual(err(lambda:self.s.create_case(cr(service_id='SVC_011'))),'DOMAIN_OWNER_UNRESOLVED')
 def test_other_services_not_mocked(self):self.assertEqual(err(lambda:self.s.create_case(cr(service_id='SVC_001'))),'DEMO_SERVICE_NOT_IMPLEMENTED')
 def test_policy_gates(self):
  for k,v in [('input_validation_status','INVALID'),('review_confirmed',False),('access_verified',False),('consent_granted',False),('payment_policy_resolved',False),('mode','PRODUCTION')]:
   with self.subTest(k=k):self.assertIsNotNone(err(lambda:self.s.create_case(cr(**{k:v}))))
 def test_snapshot_dedupe(self):
  c=self.case();a=self.s.freeze_snapshot(c,sr());b=self.s.freeze_snapshot(c,sr());self.assertEqual(a['input_snapshot_ref'],b['input_snapshot_ref']);self.assertTrue(b['duplicate'])
 def test_snapshot_immutable(self):
  c=self.case();self.s.freeze_snapshot(c,sr());fields=sr()['fields'];fields[0]['value']='A different design';self.assertEqual(err(lambda:self.s.freeze_snapshot(c,sr(fields=fields))),'SNAPSHOT_IMMUTABLE')
 def test_snapshot_revision(self):self.assertEqual(err(lambda:self.s.freeze_snapshot(self.case(),sr(input_revision=5))),'INPUT_REVISION_CONFLICT')
 def test_inference_block(self):
  fields=sr()['fields']+[dict(field_id='bathroom.width',value=2000,source_type='AI_INFERRED',verification_status='REQUIRED')]
  self.assertEqual(err(lambda:self.s.freeze_snapshot(self.case(),sr(fields=fields))),'UNVERIFIED_INFERENCE')
 def test_geometry_lock_block(self):self.assertEqual(err(lambda:self.s.freeze_snapshot(self.case(),sr(locks=['GEOMETRY']))),'LOCK_VERIFICATION_UNAVAILABLE')
 def test_real_asset_block(self):self.assertEqual(err(lambda:self.s.freeze_snapshot(self.case(),sr(asset_refs=['REAL_IMAGE']))),'DEMO_ASSET_REQUIRED')
 def test_job_dedupe(self):
  c,s=self.snapshot();a=self.s.submit_job(jr(c,s));b=self.s.submit_job(jr(c,s));self.assertEqual(a['job_ref'],b['job_ref']);self.assertTrue(b['duplicate']);self.assertFalse(b['ai_called'])
 def test_job_collision(self):
  c,s=self.snapshot();self.s.submit_job(jr(c,s));self.assertEqual(err(lambda:self.s.submit_job(jr(c,s,request_type='AUTHORIZED_REGENERATION'))),'IDEMPOTENCY_CONFLICT')
 def test_cross_case_block(self):
  c,s=self.snapshot();other=self.s.create_case(cr(idempotency_key='SECOND_CASE'))['case_ref'];self.assertEqual(err(lambda:self.s.submit_job(jr(other,s,idempotency_key='OTHER_JOB'))),'SNAPSHOT_CASE_MISMATCH')
 def test_consent_revocation(self):
  c,s=self.snapshot();self.s.revoke_consent(c);self.assertEqual(err(lambda:self.s.submit_job(jr(c,s))),'CONSENT_REVOKED')
 def test_state_and_hidden(self):
  c,s,j=self.job();self.event(j,1,'RUNNING');self.event(j,2,'VALIDATING');v=self.event(j,3,'SUCCEEDED');self.assertEqual(v['customer_release'],'HIDDEN');self.assertEqual(len(self.s.internal_versions(c)),1);self.assertFalse(self.s.internal_versions(c)[0]['content']['real_ai_execution']);self.assertEqual(err(lambda:self.event(j,4,'RUNNING')),'INVALID_JOB_TRANSITION')
 def test_events_dedupe_stale_gap(self):
  c,s,j=self.job();self.event(j,1,'RUNNING');self.assertEqual(self.event(j,1,'RUNNING')['event_status'],'DUPLICATE_IGNORED');self.assertEqual(err(lambda:self.event(j,1,'FAILED','newref')),'STALE_EVENT');self.assertEqual(err(lambda:self.event(j,3,'VALIDATING')),'EVENT_SEQUENCE_GAP')
 def test_regen_failure_preserves(self):
  c,s,j=self.job();self.event(j,1,'RUNNING');self.event(j,2,'VALIDATING');v=self.event(j,3,'SUCCEEDED')['result_version_ref'];p=jr(c,s,idempotency_key='REGEN',request_type='AUTHORIZED_REGENERATION',base_result_version_ref=v,approval_ref='DEMO_REVISION_APPROVED');r=self.s.submit_job(p)['job_ref'];self.event(r,1,'FAILED','regen-fail');self.assertEqual([x['version_ref'] for x in self.s.internal_versions(c)],[v]);self.assertEqual(self.s.internal_versions(c)[0]['release_status'],'HIDDEN')
 def test_regen_needs_approval(self):
  c,s,j=self.job();self.event(j,1,'RUNNING');self.event(j,2,'VALIDATING');v=self.event(j,3,'SUCCEEDED')['result_version_ref'];self.assertEqual(err(lambda:self.s.submit_job(jr(c,s,idempotency_key='REGEN',request_type='AUTHORIZED_REGENERATION',base_result_version_ref=v))),'REVISION_APPROVAL_REQUIRED')
 def test_concurrency_dedupe(self):
  with ThreadPoolExecutor(max_workers=6) as pool: ids=list(pool.map(lambda _:self.s.create_case(cr())['case_ref'],range(15)))
  self.assertEqual(len(set(ids)),1)
 def test_restart_persistence(self):
  c,s,j=self.job();t=ContractStore(self.path,KEY);self.assertEqual(t.get_job(j)['state'],'QUEUED');self.assertEqual(t.internal_versions(c),[])
 def test_auth(self):
  c=self.s.create_case(cr());self.s.authorize(c['case_ref'],'Bearer '+c['case_token']);self.assertEqual(err(lambda:self.s.authorize(c['case_ref'],'Bearer wrong')),'ACCESS_DENIED')
class TestHttp(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.server=start_server(str(Path(self.tmp.name)/'http.sqlite'),KEY);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
 def request(self,method,path,data=None,headers=None):
  c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=4);body=json.dumps(data).encode() if data is not None else None;c.request(method,path,body=body,headers=headers or {});r=c.getresponse();v=json.loads(r.read());s=r.status;c.close();return s,v
 def test_health(self):
  status,h=self.request('GET','/v1/health');self.assertEqual(status,200);self.assertFalse(h['production_ready']);self.assertFalse(h['ai_connected'])
 def test_service_public_status(self):
  status,s=self.request('GET','/v1/services');self.assertEqual(status,200);self.assertEqual(len(s['services']),11);self.assertTrue(all(not x['production_approved'] for x in s['services']))
 def test_http_auth_release(self):
  self.assertEqual(self.request('POST','/v1/cases',cr())[0],401);status,c=self.request('POST','/v1/cases',cr(),{'X-Emovia-Demo-Key':KEY});self.assertEqual(status,201);ref=c['case_ref'];self.assertEqual(self.request('GET','/v1/cases/'+ref)[0],401);self.assertEqual(self.request('GET','/v1/cases/'+ref,headers={'Authorization':'Bearer '+c['case_token']})[0],200);self.assertEqual(self.request('POST','/v1/results/ABC/release',{}, {'X-Emovia-Demo-Key':KEY})[1]['error']['code'],'PRODUCTION_RELEASE_DISABLED')
 def test_http_full_mock(self):
  _,c=self.request('POST','/v1/cases',cr(),{'X-Emovia-Demo-Key':KEY});ref=c['case_ref'];headers={'X-Emovia-Demo-Key':KEY,'Authorization':'Bearer '+c['case_token']};status,s=self.request('POST','/v1/cases/'+ref+'/snapshots',sr(),headers);self.assertEqual(status,201);status,j=self.request('POST','/v1/executions',jr(ref,s['input_snapshot_ref']),headers);self.assertEqual(status,202)
  for n,state in enumerate(['RUNNING','VALIDATING','SUCCEEDED'],1):self.assertEqual(self.request('POST','/v1/internal/jobs/'+j['job_ref']+'/events',dict(event_ref='http'+str(n),sequence_number=n,job_status=state),{'X-Emovia-Demo-Key':KEY})[0],200)
  self.assertEqual(len(self.request('GET','/v1/internal/cases/'+ref+'/results',headers={'X-Emovia-Demo-Key':KEY})[1]['versions']),1);self.assertEqual(self.request('GET','/v1/cases/'+ref+'/results',headers={'Authorization':'Bearer '+c['case_token']})[1]['results'],[])
if __name__=='__main__':unittest.main(verbosity=2)