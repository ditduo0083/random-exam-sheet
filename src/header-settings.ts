import type { ExamInfo } from './input';
export interface HeaderSettings {
  school:string;title:string;subject:string;time:string;notice:string;grade:string;className:string;
  schoolOn:boolean;titleOn:boolean;subjectOn:boolean;timeOn:boolean;noticeOn:boolean;gradeOn:boolean;classOn:boolean;numberOn:boolean;nameOn:boolean;
  identityPosition:'box'|'line';logoPosition:'left'|'right'|'none';logoSize:'small'|'normal';logoData:string;
  seedOn:boolean;footerText:string;pageOn:boolean;pagePosition:'center'|'right';
}
export const STORAGE_KEY='print-sheet-header-v1';
export function defaults(info:ExamInfo={}):HeaderSettings {
  const match=/(.*?)\s*학년\s*(.*?)\s*반/.exec(info['학년반']||'');
  return {school:info['학교명']||'',title:info['시험제목']||'',subject:info['과목']||'',time:info['시험시간']||'',notice:info['안내문구']||'',grade:match?.[1]||'',className:match?.[2]||'',
    schoolOn:true,titleOn:true,subjectOn:true,timeOn:true,noticeOn:true,gradeOn:true,classOn:true,numberOn:true,nameOn:true,
    identityPosition:'box',logoPosition:'none',logoSize:'normal',logoData:'',seedOn:true,footerText:'',pageOn:true,pagePosition:'right'};
}
export function readOverrides(storage:Pick<Storage,'getItem'>):Partial<HeaderSettings> {
  try {
    const raw=JSON.parse(storage.getItem(STORAGE_KEY)||'{}'),template=defaults(),result:Record<string,unknown>={};
    for(const [key,value] of Object.entries(template))if(typeof raw?.[key]===typeof value)result[key]=raw[key];
    if(!['box','line'].includes(String(result.identityPosition)))delete result.identityPosition;
    if(!['left','right','none'].includes(String(result.logoPosition)))delete result.logoPosition;
    if(!['small','normal'].includes(String(result.logoSize)))delete result.logoSize;
    if(!['center','right'].includes(String(result.pagePosition)))delete result.pagePosition;
    if(result.logoData && !/^data:image\/(?:png|jpeg|svg\+xml);base64,/i.test(String(result.logoData)))delete result.logoData;
    return result as Partial<HeaderSettings>;
  } catch{return {};}
}
export function saveOverrides(storage:Pick<Storage,'setItem'>,values:Partial<HeaderSettings>):boolean {
  try{storage.setItem(STORAGE_KEY,JSON.stringify(values));return true;}catch{return false;}
}
