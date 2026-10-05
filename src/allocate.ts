// Six availability buckets, two exact type counts, three whole-exam targets.
// A seven-node min-cost flow minimizes overflow of the desired level quotas.
export function allocate(capacities:number[][],types:number[],targets:number[]):number[][] {
  interface Edge {to:number;reverse:number;capacity:number;cost:number;initial:number}
  const graph:Edge[][]=Array.from({length:7},()=>[]),source=0,sink=6;
  function add(from:number,to:number,capacity:number,cost=0){const edge:Edge={to,reverse:graph[to].length,capacity,cost,initial:capacity};graph[from].push(edge);graph[to].push({to:from,reverse:graph[from].length-1,capacity:0,cost:-cost,initial:0});return edge;}
  const typeEdges:Edge[][]=[];
  for(let t=0;t<2;t++){add(source,t+1,types[t]);typeEdges[t]=[];for(let l=0;l<3;l++)typeEdges[t][l]=add(t+1,l+3,capacities[t][l]);}
  const total=types[0]+types[1];for(let l=0;l<3;l++){add(l+3,sink,targets[l]);add(l+3,sink,total,1);}
  let flow=0;
  while(flow<total){
    const distance=Array(7).fill(Infinity),previous:Array<[number,number]|undefined>=Array(7);distance[source]=0;
    for(let iteration=0;iteration<6;iteration++){let changed=false;for(let n=0;n<7;n++)for(let i=0;i<graph[n].length;i++){const edge=graph[n][i];if(edge.capacity>0 && distance[n]+edge.cost<distance[edge.to]){distance[edge.to]=distance[n]+edge.cost;previous[edge.to]=[n,i];changed=true;}}if(!changed)break;}
    if(!previous[sink])throw Error('유형별 문항이 부족합니다. 요청 개수를 줄여 주세요.');
    let amount=total-flow;for(let n=sink;n!==source;){const [from,i]=previous[n]!;amount=Math.min(amount,graph[from][i].capacity);n=from;}
    for(let n=sink;n!==source;){const [from,i]=previous[n]!,edge=graph[from][i];edge.capacity-=amount;graph[n][edge.reverse].capacity+=amount;n=from;}flow+=amount;
  }
  return typeEdges.map(row=>row.map(edge=>edge.initial-edge.capacity));
}
