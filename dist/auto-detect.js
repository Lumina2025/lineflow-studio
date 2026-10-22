/** Detect solid, high-contrast orthogonal flowchart arrows from RGBA pixels.
 * Returns editable path suggestions in image coordinates. No image data leaves the browser.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const near=(a,b,r)=>Math.abs(a-b)<=r;

function inkMask(rgba,width,height){
  const mask=new Uint8Array(width*height);
  for(let i=0,j=0;j<mask.length;i+=4,j++){
    const a=rgba[i+3];if(a<150)continue;
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    // Covers black, navy and other dark connectors on pale diagram backgrounds.
    if(r<155&&g<165&&b<180 && (r+g+b)<440)mask[j]=1;
  }
  return mask;
}

function oriented(mask,width,height,orientation){
  const rotated=orientation==='right'||orientation==='left';
  const w=rotated?height:width,h=rotated?width:height;
  const source=(x,y)=>{
    if(x<0||y<0||x>=w||y>=h)return -1;
    if(orientation==='down')return y*width+x;
    if(orientation==='up')return (height-1-y)*width+x;
    if(orientation==='right')return x*width+y;
    return x*width+(width-1-y);
  };
  const at=(x,y)=>{const i=source(x,y);return i<0?0:mask[i]};
  const toOriginal=(x,y)=>{
    if(orientation==='down')return{x,y};
    if(orientation==='up')return{x,y:height-1-y};
    if(orientation==='right')return{x:y,y:x};
    return{x:width-1-y,y:x};
  };
  return{w,h,at,toOriginal};
}

function rowRun(view,cx,y){
  if(y<0||y>=view.h||!view.at(cx,y))return null;
  let l=cx,r=cx;
  while(l>0&&view.at(l-1,y))l--;
  while(r<view.w-1&&view.at(r+1,y))r++;
  return{l,r,width:r-l+1};
}

function thinRow(view,x,y){
  for(let dx=-1;dx<=1;dx++){
    const run=rowRun(view,x+dx,y);
    if(run&&run.width<=6&&near((run.l+run.r)/2,x,2))return true;
  }
  return false;
}

function arrowCandidates(view){
  const found=[];
  for(let y=10;y<view.h-10;y++){
    let x=0;
    while(x<view.w){
      if(!view.at(x,y)){x++;continue}
      const l=x;while(x<view.w&&view.at(x,y))x++;const r=x-1,w=x-l;
      if(w<11||w>34)continue;
      const cx=Math.round((l+r)/2);
      const preceding=rowRun(view,cx,y-1);
      if(!preceding||preceding.width>6||Math.abs((preceding.l+preceding.r)/2-cx)>2)continue;
      const following=rowRun(view,cx,y+3),nearTip=rowRun(view,cx,y+6);
      if(!following||!nearTip||following.width>w-3||nearTip.width>w-6||nearTip.width>11)continue;
      let stem=0;for(let t=y-1;t>=0&&t>=y-120&&thinRow(view,cx,t);t--)stem++;
      if(stem<6)continue;
      let tip=y+6;for(let t=y+7;t<=y+13&&view.at(cx,t);t++)tip=t;
      if(tip-y<6||tip-y>12)continue;
      found.push({x:cx,base:y,tip,stem,width:w,score:w+Math.min(stem,90)*.3});
    }
  }
  found.sort((a,b)=>b.score-a.score);
  const unique=[];
  for(const p of found)if(!unique.some(q=>Math.abs(q.x-p.x)<=7&&Math.abs(q.base-p.base)<=15))unique.push(p);
  return unique;
}

function traceUp(view,x,fromY,maxStep=2000){
  let y=fromY,miss=0,last=y;
  while(y>=0&&fromY-y<maxStep){
    let hit=false;
    for(let dx=-1;dx<=1;dx++)if(view.at(x+dx,y)){hit=true;break}
    if(!hit){miss++;if(miss>2)break}else{last=y;miss=0}
    y--;
  }
  return last;
}

function traceSide(view,x,y,direction){
  let here=x,last=x,miss=0;
  while(here>=0&&here<view.w&&Math.abs(here-x)<view.w*.8){
    let hit=false;
    for(let dy=-1;dy<=1;dy++)if(view.at(here,y+dy)){hit=true;break}
    if(!hit){miss++;if(miss>2)break}else{last=here;miss=0}
    here+=direction;
  }
  return last;
}

function simplify(points){
  const result=[];
  for(const p of points){const prev=result.at(-1);if(!prev||Math.hypot(p.x-prev.x,p.y-prev.y)>=3)result.push(p)}
  return result;
}

function pathsForArrow(view,arrow){
  const {x,base,tip}=arrow;
  const top=traceUp(view,x,base-1);
  if(base-top<6)return[];
  const left=traceSide(view,x,top,-1),right=traceSide(view,x,top,1);
  const branches=[];
  for(const edge of [left,right]){
    if(Math.abs(edge-x)<20)continue;
    const upper=traceUp(view,edge,top-1);
    const points=upper<top-6?[[edge,upper],[edge,top],[x,top],[x,tip]]:[[edge,top],[x,top],[x,tip]];
    branches.push(points);
  }
  if(!branches.length)branches.push([[x,top],[x,tip]]);
  return branches.map(points=>simplify(points.map(([xx,yy])=>view.toOriginal(xx,yy))))
    .filter(points=>points.length>=2);
}

function pathKey(points){
  const first=points[0],last=points.at(-1);
  return`${Math.round(first.x/6)},${Math.round(first.y/6)}:${Math.round(last.x/6)},${Math.round(last.y/6)}`;
}

/** @param {Uint8ClampedArray|Uint8Array} rgba RGBA pixels in row-major order */
export function detectFlowPaths(rgba,width,height,{maxPaths=80}={}){
  if(!rgba||!Number.isInteger(width)||!Number.isInteger(height)||width<40||height<40||rgba.length<width*height*4)throw Error('识别画面数据无效');
  if(width*height>4000000)throw Error('识别画面过大，请先缩小图片');
  const mask=inkMask(rgba,width,height),suggestions=[];
  for(const direction of ['down','right','up','left']){
    const view=oriented(mask,width,height,direction);
    for(const arrow of arrowCandidates(view)){
      for(const points of pathsForArrow(view,arrow)){
        const length=points.reduce((d,p,i)=>i?d+Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y):0,0);
        if(length<12)continue;
        suggestions.push({points,smooth:false,direction:1,confidence:clamp(Math.round(55+arrow.stem*.6+arrow.width*.8),55,96),orientation:direction});
      }
    }
  }
  suggestions.sort((a,b)=>b.confidence-a.confidence);
  const seen=new Set(),result=[];
  for(const item of suggestions){const key=pathKey(item.points);if(seen.has(key))continue;const tip=item.points.at(-1);const length=item.points.reduce((d,p,i)=>i?d+Math.hypot(p.x-item.points[i-1].x,p.y-item.points[i-1].y):0,0);if(length<28&&result.some(q=>q.orientation!==item.orientation&&Math.hypot(q.points.at(-1).x-tip.x,q.points.at(-1).y-tip.y)<20))continue;seen.add(key);result.push(item);if(result.length>=maxPaths)break}
  return result;
}
