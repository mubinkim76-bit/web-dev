// Closed, content-free measurement vocabulary. No visitor/run/file IDs travel here.
export const actions={ diff:['diff_import','diff_compare','diff_export','validate_diff_input'] };
export const eventTypes=['tool_opened','run_started','run_succeeded','run_failed','run_cancelled','output_generated','download_requested','print_requested','game_finished','paid_interest','feedback'];
export const outcomes=['none','complete','partial','execution','validation','user_cancel','superseded','navigation','won','draw','generated','requested','clicked','reported','needs_choice'];
export function validEvent(e){
 if(!e||!Object.hasOwn(actions,e.app)||!eventTypes.includes(e.type)||!outcomes.includes(e.outcome))return false;
 if(e.type==='tool_opened')return e.action==='open'&&e.outcome==='none';
 if(e.type==='paid_interest')return e.action==='interest'&&e.outcome==='clicked';
 if(e.type==='feedback')return e.action==='feedback'&&e.outcome==='reported';
 if(!actions[e.app].includes(e.action))return false;
 if(e.type==='game_finished')return e.app==='gomoku'&&e.action==='game'&&['won','draw'].includes(e.outcome);
 return ({run_started:['none'],run_succeeded:['complete','partial'],run_failed:['execution','validation'],run_cancelled:['user_cancel','superseded','navigation','needs_choice'],output_generated:['generated'],download_requested:['requested'],print_requested:['requested']})[e.type]?.includes(e.outcome) || false;
}
