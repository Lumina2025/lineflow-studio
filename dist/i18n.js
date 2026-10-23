const english = {
  'Lineflow · 让连线流动起来':'Lineflow · Make every connection flow',
  '给流程图加上流动的箭头、光点和虚线，在浏览器里导出循环 GIF。':'Animate diagram connections with flowing arrows, dots and dashes. Export looping GIFs in your browser.',
  'Lineflow 首页':'Lineflow home',
  '动线工作室':'Flow Studio',
  '项目名称':'Project name',
  '已保存在此浏览器':'Saved in this browser',
  '保存工程':'Save project',
  '打开工程':'Open project',
  '导出 GIF':'Export GIF',
  '01 / 底图':'01 / SOURCE',
  '从静态开始':'Start with a still image',
  '导入你的流程图':'Import your flowchart',
  'PNG、JPG、WebP、SVG':'PNG, JPG, WebP, SVG',
  '当前使用示例画布 · 1200 × 800':'Sample canvas · 1200 × 800',
  '✦ 重新识别箭头':'✦ Detect arrows again',
  '使用示例':'Use sample',
  '空白画布':'Blank canvas',
  '02 / 流动路径':'02 / FLOW PATHS',
  '＋ 新建路径':'＋ New path',
  '导入图片后会自动寻找连线与箭头；识别结果可拖动控制点修正。':'Import an image to detect arrows and connections automatically. Drag control points to refine the results.',
  '一个小提示':'QUICK TIP',
  '沿连线依次点选起点、拐点和终点，按':'Click along a connection from start to end, including each bend. Press',
  '完成。箭头会顺着绘制方向流动。':'to finish. The animation follows the direction you draw.',
  '图片处理和 GIF 导出均在浏览器内完成':'Images and GIFs are processed in your browser',
  '选择和移动控制点 (V)':'Select and move control points (V)',
  '选择':'Select',
  '绘制路径 (P)':'Draw a path (P)',
  '画路径':'Draw path',
  '撤销 (⌘Z)':'Undo (⌘Z)',
  '撤销':'Undo',
  '重做 (⌘⇧Z)':'Redo (⌘⇧Z)',
  '重做':'Redo',
  '缩小':'Zoom out',
  '适应画布':'Fit canvas',
  '适应':'Fit',
  '放大':'Zoom in',
  '动画编辑画布；按 P 画路径，按 V 选择路径':'Animation canvas; press P to draw a path, V to select',
  '绘制中':'DRAWING',
  '· 点击添加拐点，Enter 完成，Esc 取消':'· Click to add bends, Enter to finish, Esc to cancel',
  '完成路径 ↵':'Finish path ↵',
  '播放 / 暂停（空格）':'Play / pause (Space)',
  '实时预览':'Live preview',
  '3 秒无缝循环':'Seamless 3 s loop',
  '隐藏编辑点':'Hide handles',
  '静止的图，流动的想法。':'Still image. Ideas in motion.',
  '路径手动描绘 · 支持曲线 · 无限循环':'Editable paths · Curves supported · Infinite loop',
  '03 / 动起来':'03 / ANIMATE',
  '选择一条路径，调整它的流动效果。':'Select a path to adjust its animation.',
  '路径名称':'Path name',
  '流动样式':'Flow style',
  '箭头':'Arrows',
  '光点':'Dots',
  '虚线':'Dashes',
  '路径颜色':'Path color',
  '预设颜色':'Preset colors',
  '暖金色':'Warm gold',
  '橙色':'Orange',
  '深蓝色':'Navy blue',
  '青绿色':'Teal',
  '蓝色':'Blue',
  '白色':'White',
  '线条粗细':'Line width',
  '路径形状':'Path shape',
  '折线':'Straight',
  '曲线':'Curved',
  '⇄ 反转流动方向':'⇄ Reverse flow direction',
  '复制路径':'Duplicate path',
  '删除路径':'Delete path',
  '全局动画':'GLOBAL MOTION',
  '流动速度':'Flow speed',
  '粒子间距':'Particle spacing',
  '显示静态轨道':'Show base lines',
  '柔和发光':'Soft glow',
  '导出设置':'EXPORT SETTINGS',
  'GIF · 循环播放':'GIF · Loops forever',
  '画面宽度':'Output width',
  '循环时长':'Loop duration',
  '帧率':'Frame rate',
  '2 秒':'2 seconds',
  '3 秒':'3 seconds',
  '4 秒':'4 seconds',
  '6 秒':'6 seconds',
  '另存当前画面为 PNG':'Save current frame as PNG',
  '正在制作你的 GIF':'Creating your GIF',
  '准备画布…':'Preparing canvas…',
  '请保持页面打开。图片不会上传到服务器。':'Keep this page open. Your image is never uploaded.',
  '导出的 GIF 预览':'Exported GIF preview',
  '下载 GIF ↓':'Download GIF ↓',
  '取消':'Cancel',
  '替换当前画布？':'Replace the current canvas?',
  '当前路径会被清空。可先「保存工程」，或替换后用撤销恢复。':'Current paths will be cleared. Save your project first, or use Undo after replacing the canvas.',
  '替换画布':'Replace canvas'
};

function initialLanguage(){
  const query=new URLSearchParams(location.search).get('lang');
  if(query==='en'||query==='zh')return query;
  try{return localStorage.getItem('lineflow-language')==='en'?'en':'zh'}catch{return'zh'}
}
export let language=initialLanguage();
export const tr=(zh,en)=>language==='en'?en:zh;
const originalText=[];
const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(walker.nextNode()){
  const node=walker.currentNode,raw=node.textContent,key=raw.trim();
  if(english[key])originalText.push({node,raw,key});
}
const originalAttributes=[];
for(const element of document.querySelectorAll('[title],[aria-label],[alt]'))for(const attr of ['title','aria-label','alt']){
  const raw=element.getAttribute(attr);if(raw&&english[raw])originalAttributes.push({element,attr,raw});
}
const originalTitle=document.title;
const description=document.querySelector('meta[name="description"]');
const originalDescription=description?.content||'';

export function applyLanguage(next,{updateUrl=true}={}){
  language=next==='en'?'en':'zh';
  document.documentElement.lang=language==='en'?'en':'zh-CN';
  document.title=language==='en'?english[originalTitle]:originalTitle;
  if(description)description.content=language==='en'?english[originalDescription]:originalDescription;
  for(const {node,raw,key} of originalText)node.textContent=language==='en'?raw.replace(key,english[key]):raw;
  for(const {element,attr,raw} of originalAttributes)element.setAttribute(attr,language==='en'?english[raw]:raw);
  const toggle=document.getElementById('languageToggle');
  toggle.textContent=language==='en'?'中文':'EN';
  toggle.setAttribute('aria-label',language==='en'?'Switch to Chinese':'Switch to English');
  toggle.setAttribute('aria-pressed',String(language==='en'));
  try{localStorage.setItem('lineflow-language',language)}catch{}
  if(updateUrl){const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url)}
}
