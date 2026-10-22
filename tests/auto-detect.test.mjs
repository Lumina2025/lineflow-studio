import assert from 'node:assert/strict';
import {detectFlowPaths} from '../dist/auto-detect.js';
const W=120,H=120,INK=[32,71,93,255];
function image(){const p=new Uint8ClampedArray(W*H*4);p.fill(255);return p}
function dot(p,x,y){if(x<0||y<0||x>=W||y>=H)return;const i=(y*W+x)*4;p.set(INK,i)}
function rect(p,x0,y0,x1,y1){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)dot(p,x,y)}
function arrow(p,x=60,base=70,start=20){rect(p,x-1,start,x+1,base-1);for(let row=0;row<9;row++){const half=Math.max(1,9-row);rect(p,x-half,base+row,x+half,base+row)}}
function rotateRight(p){const q=image();for(let y=0;y<H;y++)for(let x=0;x<W;x++){const a=(y*W+x)*4,b=((W-1-x)*W+y)*4;q.set(p.subarray(a,a+4),b)}return q}
const down=image();arrow(down);const got=detectFlowPaths(down,W,H);assert.equal(got.length,1);assert.equal(got[0].orientation,'down');assert(got[0].points[0].y<=21);assert(got[0].points.at(-1).y>=77);
const right=detectFlowPaths(rotateRight(down),W,H);assert.equal(right.length,1);assert.equal(right[0].orientation,'right');
const up=detectFlowPaths(rotateRight(rotateRight(down)),W,H);assert.equal(up.length,1);assert.equal(up[0].orientation,'up');
const left=detectFlowPaths(rotateRight(rotateRight(rotateRight(down))),W,H);assert.equal(left.length,1);assert.equal(left[0].orientation,'left');
const branch=image();rect(branch,14,20,16,50);rect(branch,104,30,106,50);rect(branch,15,49,105,51);arrow(branch,60,70,50);const b=detectFlowPaths(branch,W,H);assert.equal(b.length,2);assert(b.every(p=>p.points.length>=4));assert(b.some(p=>p.points[0].x<=17));assert(b.some(p=>p.points[0].x>=103));
const noArrow=image();rect(noArrow,59,20,61,77);assert.equal(detectFlowPaths(noArrow,W,H).length,0);
console.log('Arrow recognition: four directions, branch tracing, and no-arrow cases passed.');
