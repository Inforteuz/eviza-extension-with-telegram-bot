import Operator from './operator';
import {runtime} from '@/lib/server';
import {requireChatGPTUser} from './chatgpt-auth';
export const dynamic='force-dynamic';
async function ProtectedOperator(){const user=await requireChatGPTUser('/');if(!await runtime().DB.prepare('SELECT owner FROM settings WHERE owner=?').bind(user.userId).first())return <main className="telegram-gate"><h1>Kirish cheklangan</h1><p>Bu ish maydoni biriktirilgan operator uchun.</p></main>;return <Operator/>;}
export default function Home() { return <ProtectedOperator/>; }
