import {runtime} from '@/lib/server';
import {getChatGPTUser} from '../chatgpt-auth';
import Operator from '../operator';
import MiniApp from './mini-app';
export const dynamic='force-dynamic';
export default async function TelegramPage(){
 const user=await getChatGPTUser();
 if(user&&await runtime().DB.prepare('SELECT owner FROM settings WHERE owner=?').bind(user.userId).first())return <Operator miniApp/>;
 const bot=await runtime().DB.prepare('SELECT telegram_bot_id,telegram_bot_username FROM settings WHERE telegram_bot_id IS NOT NULL LIMIT 1').first<{telegram_bot_id:string;telegram_bot_username:string}>();
 return <MiniApp botId={bot?.telegram_bot_id||''} botUsername={bot?.telegram_bot_username||'Evisaa_bot'}/>;
}
