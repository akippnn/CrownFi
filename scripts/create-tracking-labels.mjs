const TARGET = process.env.TARGET_REPO ?? process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN;
const ROOT = process.env.GITHUB_API_URL ?? 'https://api.github.com';
if (!TARGET || !TOKEN) throw new Error('TARGET_REPO and GITHUB_TOKEN are required');
const headers = {Accept:'application/vnd.github+json',Authorization:`Bearer ${TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'crownfi-tracking-labels'};
async function api(method,path,body){const r=await fetch(`${ROOT}${path}`,{method,headers:body===undefined?headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();let p=t;try{p=t?JSON.parse(t):null}catch{}if(!r.ok)throw new Error(`${method} ${path} ${r.status}: ${typeof p==='string'?p:JSON.stringify(p)}`);return p}
async function pages(path){const out=[];for(let page=1;;page++){const sep=path.includes('?')?'&':'?';const batch=await api('GET',`${path}${sep}per_page=100&page=${page}`);out.push(...batch);if(batch.length<100)return out}}
const definitions={
 'status: ready':['d4c5f9','Defined and ready for meaningful implementation.'],
 'status: in-progress':['fbca04','Meaningful work exists but the completion gate is not met.'],
 'status: in-review':['1d76db','A reviewable PR exists; acceptance remains incomplete.'],
 'status: awaiting-human-test':['5319e7','Automated work is substantially complete; human evidence remains.'],
 'status: blocked':['b60205','A dependency, permission, environment, or policy prevents progress.'],
 'status: completed':['0e8a16','All required exact-head evidence and acceptance gates pass.'],
 'status: deferred':['c5def5','Valid work intentionally kept outside the submission-critical path.'],
 'submission-critical':['d93f0b','Required for the judged submission path.'],
 'type: tracker':['0052cc','Milestone, root, submission, or cross-cutting tracker.'],
 'type: concern':['7057ff','Sustainable concern grouping one or more stable deliverable IDs.']
};
const current=new Map((await pages(`/repos/${TARGET}/labels`)).map(label=>[label.name,label]));
for(const [name,[color,description]] of Object.entries(definitions)){
 if(current.has(name))await api('PATCH',`/repos/${TARGET}/labels/${encodeURIComponent(name)}`,{new_name:name,color,description});
 else await api('POST',`/repos/${TARGET}/labels`,{name,color,description});
}
const assignments={
 1:['status: in-review','submission-critical'],2:['status: blocked','submission-critical'],
 3:['type: tracker','status: in-progress','submission-critical'],4:['type: tracker','status: in-progress','submission-critical'],5:['type: tracker','status: in-progress'],6:['type: tracker','status: in-progress','submission-critical'],7:['type: tracker','status: in-progress','submission-critical'],8:['type: tracker','status: ready','submission-critical'],9:['type: tracker','status: in-progress','submission-critical'],10:['type: tracker','status: deferred'],11:['type: tracker','status: in-progress','submission-critical'],
 12:['type: concern','status: in-progress'],13:['type: concern','status: in-progress'],14:['type: concern','status: in-progress'],15:['type: concern','status: in-progress'],16:['type: concern','status: ready','submission-critical'],17:['type: concern','status: in-progress','submission-critical'],18:['type: concern','status: in-progress','submission-critical'],19:['type: concern','status: ready','submission-critical'],20:['type: concern','status: in-progress','submission-critical'],21:['type: concern','status: ready','submission-critical'],22:['type: concern','status: ready','submission-critical'],23:['type: concern','status: in-progress','submission-critical'],24:['type: concern','status: in-progress','submission-critical'],25:['type: concern','status: in-progress','submission-critical'],26:['type: concern','status: deferred']
};
for(const [number,labels] of Object.entries(assignments))await api('PATCH',`/repos/${TARGET}/issues/${number}`,{labels});
console.log('CrownFi sustainable tracking labels synchronized.');
