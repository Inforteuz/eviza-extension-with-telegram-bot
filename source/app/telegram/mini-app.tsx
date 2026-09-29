'use client';
import {useEffect,useState} from 'react';
import Operator from '../operator';
import {Button} from '@/components/ui/button';
type TelegramApp={initData:string;ready:()=>void;expand:()=>void;enableClosingConfirmation?:()=>void};
export default function MiniApp({botId,botUsername}:{botId:string;botUsername:string}){
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let cancelled=false;let timer:ReturnType<typeof setTimeout>;const start=async()=>{try{
  const app=(window as unknown as {Telegram?:{WebApp?:TelegramApp}}).Telegram?.WebApp;
  if(!app?.initData)throw Error('Ilovani Telegram botidagi “Ilovani ochish” tugmasidan oching.');
  if(!botId)throw Error('Telegram Mini App ulanishi hali yakunlanmagan.');
  app.ready();app.expand();
  const res=await fetch('/api/telegram/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({botId,initData:app.initData})});
  if(!res.ok)throw Error(res.status===403?'Bu ilovaga faqat biriktirilgan operator kira oladi.':'Kirish tasdiqlanmadi. Ilovani botdan qayta oching.');
  clearTimeout(timer);if(!cancelled)setReady(true);
 }catch(e){if(!cancelled)setError((e as Error).message)}};
 setError('');
 if((window as any).Telegram?.WebApp)start();else{let script=document.querySelector<HTMLScriptElement>('#telegram-webapp-sdk');if(!script){script=document.createElement('script');script.id='telegram-webapp-sdk';script.src='https://telegram.org/js/telegram-web-app.js';document.head.appendChild(script);}script.addEventListener('load',start,{once:true});script.addEventListener('error',()=>{if(!cancelled)setError('Telegram bilan aloqa bo‘lmadi. Qayta urinib ko‘ring.')},{once:true});timer=setTimeout(()=>{if(!cancelled)setError('Telegram javob bermadi. Ilovani botdan qayta oching.')},15000);}
 return()=>{cancelled=true;clearTimeout(timer)};
 },[botId,attempt]);
 if(ready)return <Operator miniApp/>;
 return <main className="telegram-gate"><div className="brand-icon">eV</div><h1>eVisa Operator</h1><p role={error?'alert':'status'}>{error||'Telegram akkauntingiz tekshirilmoqda…'}</p>{error&&<><Button onClick={()=>setAttempt(x=>x+1)}>Qayta tekshirish</Button><a href={'https://t.me/'+botUsername}>Telegram botini ochish</a></>}</main>;
}
