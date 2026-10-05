export interface PrintBlock { id:string; type:string; height:number; weight?:number; heading?:boolean }
export interface PrintPage { indices:number[]; oversized:number[] }
// Paper mode uses measured height alone. Compatibility mode also matches the
// engine's per-type capacities and image weighting, without touching vendor.
export function paginatePrint(blocks:readonly PrintBlock[], availableHeight:number, options:{splitByType?:boolean;capacities?:Record<string,number>} = {}):PrintPage[] {
  if (!(availableHeight>0)) throw Error('본문에 쓸 공간이 없습니다. 머리글·바닥글을 줄여 주세요.');
  if(new Set(blocks.map(b=>b.id)).size!==blocks.length)throw Error('문항 ID가 중복되었습니다.');
  const capacities:Record<string,number>={ox:7,choice:5,matching:2,short:4,calc:3,...options.capacities};
  const pages:PrintPage[]=[];
  let usedHeight=0,usedWeight=0,type='';
  for(let i=0;i<blocks.length;i++){
    const block=blocks[i];
    if(!Number.isFinite(block.height) || block.height<0)throw Error('문항 높이를 측정하지 못했습니다.');
    const weight=block.weight??1;
    // Heading stays with the following question. Oversize first questions get
    // their own expandable sheet; subsequent blocks start on the next sheet.
    const needed=block.height+(block.heading?(blocks[i+1]?.height??0):0);
    let page=pages.at(-1);
    const followsHeading=page && blocks[page.indices.at(-1)!]?.heading && !block.heading;
    if(!page || (!followsHeading && page.indices.length>0 && (usedHeight+needed>availableHeight || page.oversized.length>0 || (options.splitByType && (type!==block.type || usedWeight+weight>(capacities[block.type]??Infinity)))))){
      page={indices:[],oversized:[]};pages.push(page);usedHeight=0;usedWeight=0;type=block.type;
    }
    page.indices.push(i);usedHeight+=block.height;usedWeight+=weight;
    if(!block.heading && usedHeight>availableHeight)page.oversized.push(i);
  }
  return pages;
}
