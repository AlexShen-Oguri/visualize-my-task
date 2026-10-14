"""Package the portable skill and verify the extracted release with stdlib only."""
from pathlib import Path
import hashlib,json,re,shutil,subprocess,tempfile,zipfile
root=Path(__file__).resolve().parents[1]
meta=json.loads((root/'package.json').read_text());name=meta['name'];version=meta['version']
skill=root/name;dist=root/'dist';dist.mkdir(exist_ok=True)
out=root/'artifacts'/('release-'+version);out.mkdir(parents=True,exist_ok=True)
files=[root/line[2:] for line in (root/'.gitignore').read_text().splitlines()
       if line.startswith('!/'+name+'/') and not line.endswith('/')]
if not files:raise ValueError('No explicitly allowlisted skill files.')
for p in files:
    if not p.is_file() or p.is_symlink() or p.resolve()!=p:
        raise ValueError('Allowlisted release file must exist without symlinks: '+str(p.relative_to(root)))
archive=dist/(name+'-'+version+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as bundle:
    for p in sorted(files):bundle.write(p,name+'/'+str(p.relative_to(skill)))
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(dist/(archive.name+'.sha256')).write_text(digest+'  '+archive.name+'\n')
workspace=Path(tempfile.mkdtemp(prefix=name+'-release-'))/'独立项目 with spaces';workspace.mkdir()
with zipfile.ZipFile(archive) as bundle:
    names=bundle.namelist();assert all(n.startswith(name+'/') and '..' not in Path(n).parts for n in names)
    assert all('/artifacts/' not in n and '/archive/' not in n and '/.impeccable/' not in n for n in names)
    for needed in ['SKILL.md','assets/OFL-BarlowCondensed.txt','assets/i18n.mjs','scripts/language.mjs','examples/cases/07-language/README.md']:
        assert name+'/'+needed in names
    bundle.extractall(workspace)
installed=workspace/name;node=shutil.which('node');assert node,'Node 20+ is required'
result=subprocess.run([node,'--test','--test-reporter=tap',*map(str,sorted((installed/'scripts').glob('*.test.mjs')))],capture_output=True,text=True)
(out/'packaged-tests.log').write_text(result.stdout+result.stderr)
assert result.returncode==0,result.stdout+result.stderr
count=int(re.search(r'^# tests (\d+)$',result.stdout,re.M).group(1));checks=[]
def check(label,case_root,sources,expected_count,state,language=None,lang='auto'):
    args=[node,str(installed/'scripts/board.mjs'),'--root',str(installed/case_root),'--lang',lang]
    for key,flag in [('planPaths','--plan'),('specPaths','--spec'),('relationPaths','--relations'),('changelogPaths','--changelog')]:
        for path in sources.get(key,[]):args.extend([flag,path])
    checked=subprocess.run([*args,'--check'],capture_output=True,text=True)
    assert checked.returncode==0,checked.stderr
    snapshot=json.loads(checked.stdout);assert len(snapshot['items'])==expected_count,(label,len(snapshot['items']))
    assert snapshot['planningState']==state,(label,snapshot['planningState'])
    if language:assert snapshot['language']==language,(label,snapshot['language'])
    checks.append({'id':label,'tasks':len(snapshot['items']),'state':snapshot['planningState'],'language':snapshot['language'],'languageSource':snapshot['languageSource']})
manifest=json.loads((installed/'examples/cases/manifest.json').read_text())
for case in manifest['cases']:
    check(case['id'],case['root'],case['sources'],case['expected']['taskCount'],case['expected']['planningState'])
    if 'initialRoot' in case:check(case['id']+'-initial',case['initialRoot'],case['sources'],case['expected']['initialTaskCount'],'documented')
    if 'emptyRoot' in case:check(case['id']+'-empty',case['emptyRoot'],{},0,'no-plan')
    if 'specOnlyRoot' in case:check(case['id']+'-spec-only',case['specOnlyRoot'],case['specOnlySources'],0,'spec-only')
check('07-language','examples/cases/07-language',{'planPaths':['PLAN.md'],'specPaths':['docs/product-spec.md'],'changelogPaths':['CHANGELOG.md']},3,'documented','en')
check('07-language-declared','examples/cases/07-language/declared-english',{'planPaths':['PLAN.md']},2,'documented','en')
check('07-language-override','examples/cases/07-language/declared-english',{'planPaths':['PLAN.md']},2,'documented','zh','zh')
release={'name':name,'version':version,'archive':archive.name,'sha256':digest,'files':len(names),'bytes':archive.stat().st_size,'packagedTests':count,'failures':0,'cases':checks,'extraction':str(workspace),'projectPathWithSpacesAndChinese':True,'privateArtifactsExcluded':True,'publication':'local-preparation'}
(dist/(name+'-'+version+'.json')).write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in release.items() if k not in ['cases']},ensure_ascii=False));print('CLI cases:',len(checks))
