const SOURCE = process.env.SOURCE_REPO ?? 'Web3Iloilo/CrownFi';
const TARGET = process.env.TARGET_REPO ?? process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN;
const ARCHIVE = 12;
const ROOT = process.env.GITHUB_API_URL ?? 'https://api.github.com';
if (!TARGET || !TOKEN) throw new Error('TARGET_REPO and GITHUB_TOKEN are required');
const headers = {Accept:'application/vnd.github+json',Authorization:`Bearer ${TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'crownfi-tracking-archive'};
async function api(method,path,body){const r=await fetch(`${ROOT}${path}`,{method,headers:body===undefined?headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();let p=t;try{p=t?JSON.parse(t):null}catch{}if(!r.ok)throw new Error(`${method} ${path} ${r.status}: ${typeof p==='string'?p:JSON.stringify(p)}`);return p}
async function pages(path){const out=[];for(let page=1;;page++){const sep=path.includes('?')?'&':'?';const batch=await api('GET',`${path}${sep}per_page=100&page=${page}`);out.push(...batch);if(batch.length<100)return out}}
const tag=(kind,id)=>`<!-- crownfi-legacy-archive:${kind}:${id} -->`;
function split(text,max=58000){if(text.length<=max)return[text];const out=[];let rest=text;while(rest.length>max){let cut=rest.lastIndexOf('\n',max);if(cut<30000)cut=max;out.push(rest.slice(0,cut));rest=rest.slice(cut).replace(/^\n/,'')}if(rest)out.push(rest);return out}
const replacement=n=>({1:'#3',2:'#4',3:'#5',4:'#6',5:'#7',6:'#8',7:'#9',8:'#10',9:'#11',10:'#13',11:'#13',12:'#13',13:'#13',14:'#13',15:'#14',16:'#15',17:'#15',18:'#15',19:'#15',20:'#17',21:'#26',22:'#14',23:'#14',24:'#17',25:'#18',26:'#18',27:'#18',28:'#26',29:'#25',30:'#23',31:'#19',32:'#19',33:'#20',34:'#20',35:'#20',36:'#21',37:'#21',38:'#22',39:'#22',40:'#18',41:'#26',42:'#26',43:'#26',44:'#23',45:'#17',46:'#24',47:'#25',48:'#15',49:'#17',50:'#15',51:'#18',52:'#18',53:'#18',54:'#26',55:'#25 / #18',56:'#17 / #15',57:'#17 / #15',58:'#2 / #13',60:'#18',62:'#16',63:'#17',64:'#17',65:'#1 / #23–#25'})[n]??'#12';
const current=await pages(`/repos/${TARGET}/issues/${ARCHIVE}/comments`);
const seen=new Set(current.flatMap(c=>(c.body??'').match(/<!-- crownfi-legacy-archive:[^>]+ -->/g)??[]));
async function once(kind,id,text){const base=tag(kind,id);if(seen.has(base))return;const parts=split(text);for(let i=0;i<parts.length;i++){const mark=i===0?base:tag(kind,`${id}:part-${i+1}`);if(seen.has(mark))continue;await api('POST',`/repos/${TARGET}/issues/${ARCHIVE}/comments`,{body:`${mark}\n${parts[i]}${parts.length>1?`\n\n_Archive chunk ${i+1} of ${parts.length}._`:''}`});seen.add(mark)}seen.add(base)}
const items=(await pages(`/repos/${SOURCE}/issues?state=all&sort=created&direction=asc`)).sort((a,b)=>a.number-b.number);
for(const summary of items){
 const issue=await api('GET',`/repos/${SOURCE}/issues/${summary.number}`);
 const pr=summary.pull_request?await api('GET',`/repos/${SOURCE}/pulls/${summary.number}`):null;
 const labels=(issue.labels??[]).map(x=>typeof x==='string'?x:x.name).join(', ')||'none';
 const assignees=(issue.assignees??[]).map(x=>x.login).join(', ')||'none';
 const extra=pr?`\n- **Original refs:** \`${pr.head.label}\` → \`${pr.base.label}\`\n- **Head SHA:** \`${pr.head.sha}\`\n- **Base SHA:** \`${pr.base.sha}\`\n- **Merge SHA:** ${pr.merge_commit_sha?`\`${pr.merge_commit_sha}\``:'none'}\n- **Merged:** ${pr.merged?'yes':'no'}\n- **Draft:** ${pr.draft?'yes':'no'}\n- **Commits/files/additions/deletions:** ${pr.commits}/${pr.changed_files}/+${pr.additions}/-${pr.deletions}`:'';
 await once(pr?'pr':'issue',issue.number,`## Legacy ${pr?'PR':'issue'} #${issue.number} — ${issue.title}\n\n- **Original:** [${SOURCE}#${issue.number}](${issue.html_url})\n- **Replacement:** ${replacement(issue.number)}\n- **Author:** [${issue.user.login}](${issue.user.html_url})\n- **State:** \`${issue.state}\`${issue.state_reason?` / \`${issue.state_reason}\``:''}\n- **Created:** \`${issue.created_at}\`\n- **Updated:** \`${issue.updated_at}\`\n- **Closed:** ${issue.closed_at?`\`${issue.closed_at}\``:'not closed'}\n- **Labels:** ${labels}\n- **Milestone:** ${issue.milestone?.title??'none'}\n- **Assignees:** ${assignees}\n- **Comments:** ${issue.comments??0}${extra}\n\n### Original body\n\n${issue.body??'_No body._'}\n\n---\n\nThe source URL preserves original authorship, timestamps, reactions, checks, and thread identities that GitHub cannot recreate in another repository.`);
 for(const c of await pages(`/repos/${SOURCE}/issues/${issue.number}/comments`))await once('issue-comment',c.id,`### Legacy #${issue.number} comment\n\n- **Author:** [${c.user.login}](${c.user.html_url})\n- **Created:** \`${c.created_at}\`\n- **Updated:** \`${c.updated_at}\`\n- **Original:** [open comment](${c.html_url})\n\n${c.body??'_No body._'}`);
 if(pr){
  for(const r of await pages(`/repos/${SOURCE}/pulls/${issue.number}/reviews`))await once('review',r.id,`### Legacy PR #${issue.number} review\n\n- **Reviewer:** [${r.user.login}](${r.user.html_url})\n- **State:** \`${r.state}\`\n- **Submitted:** \`${r.submitted_at??'unknown'}\`\n- **Commit:** ${r.commit_id?`\`${r.commit_id}\``:'not recorded'}\n- **Original:** ${r.html_url?`[open review](${r.html_url})`:issue.html_url}\n\n${r.body??'_No review body._'}`);
  for(const c of await pages(`/repos/${SOURCE}/pulls/${issue.number}/comments`)){const loc=[c.path&&`path \`${c.path}\``,c.line&&`line ${c.line}`,c.original_line&&`original line ${c.original_line}`,c.side&&`side ${c.side}`].filter(Boolean).join(', ');await once('review-comment',c.id,`### Legacy PR #${issue.number} inline review comment\n\n- **Author:** [${c.user.login}](${c.user.html_url})\n- **Created:** \`${c.created_at}\`\n- **Location:** ${loc||'unavailable'}\n- **Commit:** ${c.commit_id?`\`${c.commit_id}\``:'not recorded'}\n- **Original:** [open review comment](${c.html_url})\n\n${c.body??'_No body._'}`)}
 }
}
const archive=await api('GET',`/repos/${TARGET}/issues/${ARCHIVE}`);
const stamp='<!-- crownfi-generated:archive-result -->';
const result=`${stamp}\n## Automated archive result\n\n- [x] Processed ${items.length} source issue/PR objects.\n- [x] Preserved complete bodies and object metadata.\n- [x] Preserved issue comments, PR reviews, and inline review comments.\n- [x] Recorded replacement tracker/concern mapping.\n\nOriginal authorship, timestamps, reactions, checks, and thread identities remain available through the preserved source links.`;
const body=(archive.body??'').includes(stamp)?(archive.body??'').replace(new RegExp(`${stamp}[\\s\\S]*$`),result):`${archive.body??''}\n\n${result}`;
await api('PATCH',`/repos/${TARGET}/issues/${ARCHIVE}`,{body});
console.log(`Archived ${items.length} source objects into ${TARGET}#${ARCHIVE}`);
