import {validEvent,actions} from './event-contract.js';
let consent=false,epoch=0;
export function measurementConsent(value){consent=value===true;epoch++;}
function emit(app,type,action,outcome,ownedEpoch=epoch){
 if(!consent||ownedEpoch!==epoch||!validEvent({app,type,action,outcome}))return;
 try{if(typeof window!=='undefined'&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('local-tool-event',{detail:{app,type,action,outcome,epoch}}));}catch{/* Measurement cannot break a free task. */}
}
export function measurementEpoch(){return epoch;}
export function toolOpened(app){emit(app,'tool_opened','open','none');}
export function toolInterest(app){emit(app,'paid_interest','interest','clicked');}
export function toolFeedback(app){emit(app,'feedback','feedback','reported');}
export function toolMetrics(app){
 let alive=true,sequence=0;const active=new Map();
 const live=r=>!!(r&&alive&&r.phase==='running'&&active.get(r.key)===r);
 function close(r,type,outcome){if(!live(r))return false;r.phase=type;active.delete(r.key);emit(app,type,r.action,outcome,r.epoch);return true;}
 return {
  begin(action,lane='main'){if(!alive||!actions[app]?.includes(action))return null;const key=action+':'+lane;const prior=active.get(key);if(prior)close(prior,'run_cancelled','superseded');const r={key,action,sequence:++sequence,epoch,phase:'running',artifact:false};active.set(key,r);emit(app,'run_started',action,'none',r.epoch);return r;},
  success(r,outcome='complete'){return close(r,r?.action==='game'?'game_finished':'run_succeeded',outcome);},
  fail(r,outcome='execution'){return close(r,'run_failed',outcome);},
  cancel(r,outcome='user_cancel'){return close(r,'run_cancelled',outcome);},
  artifact(r){if(!r||!alive||!['run_succeeded','run_cancelled'].includes(r.phase)||r.artifact)return;r.artifact=true;emit(app,'output_generated',r.action,'generated',r.epoch);},
  download(action,r=null){if(alive)emit(app,'download_requested',action,'requested',r?.epoch??epoch);},
  print(action){if(alive)emit(app,'print_requested',action,'requested');},
  cancelAction(action,outcome='superseded'){for(const r of [...active.values()])if(r.action===action)close(r,'run_cancelled',outcome);},
  cancelAll(outcome='superseded'){for(const r of [...active.values()])close(r,'run_cancelled',outcome);},
  dispose(){if(!alive)return;for(const r of [...active.values()])close(r,'run_cancelled','navigation');alive=false;}
 };
}
