"""Synthetic anchor checker only; does not claim app integration testing."""
import ast
import os
import subprocess
import tempfile
from pathlib import Path
source=Path(__file__).with_name('apply_server_scenario_v2.py').read_text()
module=ast.parse(source)
functions={node.name:node for node in module.body if isinstance(node,ast.FunctionDef)}
paths={
 'modify_case':'lib/game/data/case.mjs',
 'modify_game':'lib/game/game.mjs',
 'modify_question':'app/api/question/route.js',
 'modify_session':'app/api/session/route.js',
 'modify_reset':'app/api/reset/route.js',
 'modify_scene':'lib/scene/classroom.ts',
 'modify_usegame':'lib/api/useGame.ts',
 'modify_api_test':'test/api.test.mjs',
 'modify_game_test':'test/game.test.mjs'
}
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp); (root/'AGENTS.md').write_text('# synthetic fixtures\n')
 for name,path in paths.items():
  fn=functions[name]
  local={}
  for node in ast.walk(fn):
   if isinstance(node,ast.Assign):
    for t in node.targets:
     if isinstance(t,ast.Name) and isinstance(node.value,ast.Constant) and isinstance(node.value.value,str):
      local[t.id]=node.value.value
  anchors=[]
  for node in sorted((n for n in ast.walk(fn) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='once'),key=lambda z:z.lineno):
   expr=node.args[1]
   if isinstance(expr,ast.Constant): text=expr.value
   elif isinstance(expr,ast.Name): text=local[expr.id]
   else: raise RuntimeError((name,ast.unparse(expr)))
   anchors.append(text)
  body='\n--- SYNTHETIC GAP ---\n'.join(anchors)+'\n'
  f=root/path;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(body)
 f=root/'app/api/investigate/route.js';f.parent.mkdir(parents=True,exist_ok=True);f.write_text('const clueId = clueAtSpot(game, input.spot);\n')
 cmd=['python',str(Path(__file__).with_name('apply_server_scenario_v2.py')),str(root),'--check']
 r=subprocess.run(cmd,text=True,capture_output=True)
 print(r.stdout)
 if r.returncode:
  print(r.stderr)
  raise SystemExit('Synthetic patch preflight FAIL')
 print('Synthetic patch anchor compatibility: PASS')
 subprocess.run(['git','-C',str(root),'init','-b','feat/synthetic-v2'],check=True,capture_output=True)
 subprocess.run(['git','-C',str(root),'add','.'],check=True,capture_output=True)
 subprocess.run(['git','-C',str(root),'-c','user.name=Test','-c','user.email=test@example.com','commit','-m','synthetic fixture'],check=True,capture_output=True)
 apply=subprocess.run(['python',str(Path(__file__).with_name('apply_server_scenario_v2.py')),str(root),'--apply'],text=True,capture_output=True)
 if apply.returncode:
  print(apply.stdout,apply.stderr)
  raise SystemExit('Synthetic patch application FAIL')
 assert (root/'lib/game/contradictions.mjs').is_file()
 assert (root/'.git/gotbong-v2-backup/lib/game/game.mjs').is_file()
 for fname in ('lib/game/contradictions.mjs','app/api/investigate/route.js','test/contradictions.test.mjs'):
  check=subprocess.run(['node','--check',str(root/fname)],text=True,capture_output=True)
  if check.returncode: raise SystemExit(fname+' '+check.stderr)
 print('Synthetic installation + backup + Node syntax: PASS')
