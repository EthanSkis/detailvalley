/* Detail Valley — service-document generator.
   Regenerates every PDF in this folder (checklists, field guide, handbook)
   from the data at the bottom of this file, in the brand style.
   Usage:  npm i pdfkit  &&  node build-docs.js
   Edit the CONTENT section to change prices, steps or wording, then re-run. */
/* Detail Valley — branded PDF generator for service docs.
   Run: (cd /tmp/pdfbuild && node build.js)  [needs: npm i pdfkit]
   Outputs into the repo's cleaning-plans/ folder. */
const PDFDocument = require('pdfkit');
const fs = require('fs');

const path = require('path');
const REPO = path.resolve(__dirname, '..');
const OUT  = __dirname;            // writes the PDFs into this folder
const LOGO = path.join(REPO, 'logo.png');

const C = {
  navy:'#0f2c44', navy2:'#15395a', blue:'#2b6cb0', copper:'#b8632c', copper2:'#974f22',
  mist:'#eef3f7', ink:'#1f2d3a', slate:'#3f566a', line:'#dbe3ea', white:'#ffffff', soft:'#6b7f90'
};
const PW = 612, PH = 792, M = 42, CW = PW - 2*M, GUT = 26, COLW = (CW - GUT)/2;
const COLX = [M, M + COLW + GUT];

function font(doc, w, s){ doc.font(w==='b'?'Helvetica-Bold':w==='i'?'Helvetica-Oblique':'Helvetica').fontSize(s); return doc; }
function th(doc, str, w, weight, size, lineGap){ font(doc,weight,size); return doc.heightOfString(str,{width:w, lineGap:lineGap||0}); }

function star(doc, cx, cy, r, color){
  const pts=[];
  for(let i=0;i<10;i++){ const ang=-Math.PI/2 + i*Math.PI/5; const rad=(i%2===0)?r:r*0.42;
    pts.push([cx+rad*Math.cos(ang), cy+rad*Math.sin(ang)]); }
  doc.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<10;i++) doc.lineTo(pts[i][0],pts[i][1]);
  doc.closePath().fill(color);
}
function checkbox(doc,x,y){ doc.roundedRect(x,y,9.5,9.5,2.2).lineWidth(1).strokeColor('#9fb1bf').stroke(); }
function dotline(doc,x1,x2,y){ doc.save().dash(1,{space:2}).lineWidth(0.8).strokeColor('#c4d0da').moveTo(x1,y).lineTo(x2,y).stroke().undash().restore(); }

/* ---------- header / title / intro chrome ---------- */
function header(doc, badge){
  // logo tile
  doc.roundedRect(M, 36, 48, 48, 9).lineWidth(1).fillAndStroke('#ffffff', '#e3eaf0');
  try { doc.image(LOGO, M+5, 41, {width:38, height:38}); } catch(e){}
  font(doc,'b',15).fillColor(C.navy).text('Detail Valley', M+60, 44);
  font(doc,'',8.5).fillColor(C.slate).text('Mobile Detailing · Valley County · We come to you', M+60, 63);
  // badge (right)
  const bw = 96, bx = PW - M - bw, by = 36, bh = 50;
  doc.roundedRect(bx, by, bw, bh, 8).fill(C.copper);
  if(badge.price){
    font(doc,'b',19).fillColor('#fff').text(badge.price, bx, by+9, {width:bw, align:'center'});
    font(doc,'',8.5).fillColor('#ffe9dc').text(badge.time, bx, by+33, {width:bw, align:'center'});
  } else {
    font(doc,'b',15).fillColor('#fff').text(badge.label, bx, by+10, {width:bw, align:'center'});
    font(doc,'',7.5).fillColor('#ffe9dc').text(badge.sub, bx, by+32, {width:bw, align:'center', characterSpacing:1});
  }
  // rule
  doc.rect(M, 96, CW, 2.4).fill(C.navy);
  return 112;
}
function titleBlock(doc, title, kicker, y){
  font(doc,'b',24).fillColor(C.navy).text(title, M, y, {width:CW});
  y = doc.y + 2;
  font(doc,'b',9.5).fillColor(C.copper).text(kicker.toUpperCase(), M, y, {width:CW, characterSpacing:1.2});
  return doc.y + 8;
}
function callout(doc, label, text, y){
  font(doc,'',8.7);
  const innerW = CW - 28;
  const full = label ? label+'  '+text : text;
  const h = doc.heightOfString(full, {width:innerW}) + 16;
  doc.roundedRect(M, y, CW, h, 6).fill(C.mist);
  doc.rect(M, y, 3.5, h).fill(C.blue);
  doc.fillColor(C.navy);
  font(doc,'b',8.7);
  let lx = M+16;
  if(label){ doc.text(label, lx, y+8, {continued:true}); font(doc,'',8.7).fillColor(C.slate).text(' '+text, {width:innerW}); }
  else { font(doc,'',8.7).fillColor(C.slate).text(text, lx, y+8, {width:innerW}); }
  return y + h + 12;
}
function fields(doc, y){
  const cols = [
    ['Customer','Vehicle','Date'],
    ['Add-ons','Vehicle size','Detailer']
  ];
  const cw = CW/3;
  font(doc,'',8.2);
  for(let r=0;r<2;r++){
    const ry = y + r*20;
    for(let c=0;c<3;c++){
      const x = M + c*cw;
      doc.fillColor(C.slate).text(cols[r][c], x, ry);
      const lw = doc.widthOfString(cols[r][c]);
      dotline(doc, x+lw+6, x+cw-14, ry+9);
    }
  }
  return y + 40 + 6;
}

/* ---------- column flow engine ---------- */
function makeFlow(doc, opt){
  // opt: {top, bottom, pageTop, onNewPage}
  let col = 0, y = opt.top;
  function newColumnOrPage(){
    if(col===0){ col=1; y=opt.colTopForPage(doc.__page); }
    else { doc.addPage(); doc.__page++; if(opt.onNewPage) opt.onNewPage(doc); col=0; y=opt.colTopForPage(doc.__page); }
  }
  return {
    place(h, draw){
      if(y + h > opt.bottom) newColumnOrPage();
      draw(COLX[col], y, COLW);
      y += h;
    },
    get y(){ return y; }, get col(){ return col; }
  };
}

/* ---------- block renderers ---------- */
function sectionBlock(doc, sec){ // checklist section {n,title,items[]}
  const measure = (w)=>{
    let h = 20;
    for(const it of sec.items){ h += Math.max(11, th(doc,it,w-16,'',8.7,0.5)) + 4.5; }
    return h + 4;
  };
  const draw = (x,y,w)=>{
    doc.roundedRect(x, y, 15, 15, 3.2).fill(C.navy);
    font(doc,'b',9).fillColor('#fff').text(String(sec.n), x, y+3.4, {width:15, align:'center'});
    font(doc,'b',10.3).fillColor(C.navy).text(sec.title, x+22, y+2.6, {width:w-22});
    let yy = y + 20;
    for(const it of sec.items){
      checkbox(doc, x, yy+1);
      const ht = th(doc,it,w-16,'',8.7,0.5);
      font(doc,'',8.7).fillColor(C.ink).text(it, x+16, yy, {width:w-16, lineGap:0.5});
      yy += Math.max(11, ht) + 4.5;
    }
  };
  return { measure, draw };
}

/* balanced two-column placement for single-page docs */
function placeBalanced(doc, blocks, yTop){
  const items = blocks.map(b=>({h:b.measure(COLW), draw:b.draw}));
  const total = items.reduce((s,i)=>s+i.h,0);
  let acc=0, split=items.length;
  for(let i=0;i<items.length;i++){ if(acc + items[i].h/2 >= total/2){ split=i; break; } acc+=items[i].h; }
  if(split===0 && items.length>1) split=1;
  let yy=yTop; for(const it of items.slice(0,split)){ it.draw(COLX[0], yy, COLW); yy+=it.h; }
  yy=yTop; for(const it of items.slice(split)){ it.draw(COLX[1], yy, COLW); yy+=it.h; }
}

function cardBlock(doc, card){ // add-on card {title, price, items[]}
  const pad = 14;
  const measure = (w)=>{
    let h = pad + 24;
    for(const it of card.items){ h += Math.max(11, th(doc,it,w-pad*2-16,'',8.5,1)) + 5.5; }
    return h + pad;
  };
  const draw = (x,y,w)=>{
    const measureH = measure(w);
    doc.roundedRect(x, y, w, measureH-10, 9).lineWidth(1).fillAndStroke('#ffffff', '#e1e8ee');
    font(doc,'b',11).fillColor(C.navy).text(card.title, x+pad, y+pad, {width:w-pad*2-44});
    font(doc,'b',11).fillColor(C.copper).text(card.price, x+pad, y+pad, {width:w-pad*2, align:'right'});
    doc.moveTo(x+pad, y+pad+20).lineTo(x+w-pad, y+pad+20).lineWidth(0.8).strokeColor('#edf1f5').stroke();
    let yy = y + pad + 28;
    for(const it of card.items){
      checkbox(doc, x+pad, yy+1);
      const ht = th(doc,it,w-pad*2-16,'',8.5,1);
      font(doc,'',8.5).fillColor(C.ink).text(it, x+pad+16, yy, {width:w-pad*2-16, lineGap:1});
      yy += Math.max(11, ht) + 5.5;
    }
  };
  return { measure, draw };
}

function sectionHeadBlock(doc, n, title){
  const measure = ()=> 26;
  const draw = (x,y,w)=>{
    doc.roundedRect(x, y+2, 16, 16, 3.4).fill(C.copper);
    font(doc,'b',9.5).fillColor('#fff').text(String(n), x, y+5.4, {width:16, align:'center'});
    font(doc,'b',12).fillColor(C.navy).text(title, x+24, y+3.5, {width:w-24});
    doc.moveTo(x, y+22).lineTo(x+w, y+22).lineWidth(1).strokeColor('#e1e8ee').stroke();
  };
  return { measure, draw };
}

function entryBlock(doc, e){ // {title, rows:[{label,text}|str], note}
  const measure = (w)=>{
    let h = th(doc, e.title, w, 'b', 9.6, 0) + 4;
    for(const r of e.rows){
      const txt = typeof r==='string'? r : r.text;
      const pre = typeof r==='string'? '' : (r.label+' ');
      // measure with bold (widest) so wrapped label rows are never under-measured
      h += th(doc, pre+txt, w, 'b', 8.4, 0.5) + 2.5;
    }
    if(e.note){ h += th(doc, e.note, w-8, 'i', 8, 0.5) + 4; }
    return h + 9;
  };
  const draw = (x,y,w)=>{
    font(doc,'b',9.6).fillColor(C.navy).text(e.title, x, y, {width:w});
    let yy = doc.y + 2;
    for(const r of e.rows){
      if(typeof r==='string'){
        font(doc,'',8.4).fillColor(C.ink).text(r, x, yy, {width:w, lineGap:0.5});
      } else {
        font(doc,'b',8.4).fillColor(C.copper).text(r.label, x, yy, {continued:true});
        font(doc,'',8.4).fillColor(C.ink).text(' '+r.text, {width:w, lineGap:0.5});
      }
      yy = doc.y + 2.5;
    }
    if(e.note){
      const nh = th(doc, e.note, w-8, 'i', 8, 0.5);
      doc.rect(x, yy+1, 2.2, nh).fill(C.copper);
      font(doc,'i',8).fillColor(C.slate).text(e.note, x+8, yy, {width:w-8, lineGap:0.5});
      yy = doc.y + 4;
    }
    doc.moveTo(x, yy+1).lineTo(x+w, yy+1).lineWidth(0.7).strokeColor('#edf1f5').stroke();
  };
  return { measure, draw };
}

/* navy "golden rules" / callout list box spanning full width */
function rulesBox(doc, y, title, items){
  font(doc,'',8.3);
  const colw = (CW - 40)/2 - 12;
  // measure: two-column bullet list
  const half = Math.ceil(items.length/2);
  let maxH = 0;
  for(const part of [items.slice(0,half), items.slice(half)]){
    let h=0; for(const it of part) h += doc.heightOfString('•  '+it,{width:colw})+4;
    maxH = Math.max(maxH,h);
  }
  const boxH = maxH + 34;
  doc.roundedRect(M, y, CW, boxH, 8).fill(C.navy);
  font(doc,'b',10).fillColor(C.copper).text(title.toUpperCase(), M+18, y+12, {characterSpacing:1});
  const cols=[items.slice(0,half), items.slice(half)];
  for(let c=0;c<2;c++){
    let yy = y+32; const x = M+18 + c*((CW-36)/2);
    for(const it of cols[c]){
      star(doc, x+3, yy+4.5, 2.6, C.copper);
      font(doc,'',8.3).fillColor('#dbe6f0').text(it, x+11, yy, {width:colw});
      yy = doc.y + 4;
    }
  }
  return y + boxH + 14;
}

/* star banner for checklists */
function banner(doc, text){
  const y = PH - 96, h = 40;
  doc.roundedRect(M, y, CW, h, 8).fill(C.navy);
  let sx = M+18;
  for(let i=0;i<5;i++){ star(doc, sx+i*15, y+h/2, 5.4, C.copper); }
  font(doc,'b',9).fillColor('#fff').text('Before you leave: ', M+95, y+11, {continued:true});
  font(doc,'',9).fillColor('#dbe6f0').text(text, {width:CW-110});
}

/* footer post-pass — positioned within the bottom margin, no auto-pagination */
function footers(doc, leftText, mode){
  const range = doc.bufferedPageRange();
  const total = range.count;
  for(let i=0;i<total;i++){
    doc.switchToPage(range.start+i);
    doc.moveTo(M, PH-44).lineTo(PW-M, PH-44).lineWidth(0.8).strokeColor(C.line).stroke();
    font(doc,'b',8).fillColor(C.navy).text(leftText, M, PH-38, {lineBreak:false});
    const right = mode==='page' ? `Page ${i+1} / ${total}`
      : 'Tick each step · photo before & after · confirm with customer before payment';
    font(doc,'',8).fillColor(C.slate).text(right, M, PH-38, {width:CW, align:'right', lineBreak:false});
  }
}

/* ---------- document builders ---------- */
function newDoc(){
  const doc = new PDFDocument({size:'LETTER', margins:{top:M,left:M,right:M,bottom:28}, bufferPages:true, autoFirstPage:true});
  doc.__page = 1;
  return doc;
}

function buildChecklist(cfg){
  const doc = newDoc();
  let y = header(doc, cfg.badge);
  y = titleBlock(doc, cfg.title, cfg.kicker, y);
  y = callout(doc, 'Workflow:', cfg.workflow, y);
  y = fields(doc, y);
  placeBalanced(doc, cfg.sections.map(s=>sectionBlock(doc, s)), y);
  banner(doc, cfg.banner);
  footers(doc, 'Detail Valley', 'tag');
  return finalize(doc, cfg.file);
}

function buildAddons(cfg){
  const doc = newDoc();
  let y = header(doc, cfg.badge);
  y = titleBlock(doc, cfg.title, cfg.kicker, y);
  y = callout(doc, 'How to use:', cfg.howto, y);
  y = fields(doc, y);
  placeBalanced(doc, cfg.cards.map(c=>cardBlock(doc, c)), y);
  banner(doc, cfg.banner);
  footers(doc, 'Detail Valley', 'tag');
  return finalize(doc, cfg.file);
}

function buildGuide(cfg){
  const doc = newDoc();
  let y = header(doc, cfg.badge);
  y = titleBlock(doc, cfg.title, cfg.kicker, y);
  if(cfg.rules) y = rulesBox(doc, y, cfg.rules.title, cfg.rules.items);
  const pageTop = 54;
  const flow = makeFlow(doc, { top:y, bottom: PH-58,
    colTopForPage:(pg)=> pg===1 ? y : pageTop, onNewPage:()=>{} });
  for(const blk of cfg.blocks){
    let b;
    if(blk.type==='head') b = sectionHeadBlock(doc, blk.n, blk.title);
    else b = entryBlock(doc, blk);
    flow.place(b.measure(COLW), b.draw);
  }
  footers(doc, cfg.footerLeft, 'page');
  return finalize(doc, cfg.file);
}

function finalize(doc, file){
  return new Promise((res)=>{
    const path = OUT + '/' + file;
    const stream = fs.createWriteStream(path);
    doc.pipe(stream);
    doc.end();
    stream.on('finish', ()=>{ console.log('wrote', file); res(); });
  });
}

/* =================== CONTENT =================== */
const EXPRESS = {
  file:'express-checklist.pdf', badge:{price:'$60', time:'~1 HR'},
  title:'Express Detail — Service Checklist', kicker:'Wash · Vacuum · Windows',
  workflow:'Work wheels-first, then top-to-bottom outside, then inside. Keep wash and interior towels separate.',
  sections:[
    {n:1,title:'Setup & walk-around',items:['Confirm package + any add-ons with customer','Walk the car with the customer — photo any existing scratches, dents or stains','Park in shade if possible; set up water, power & mats','Open doors; remove all loose trash & large items']},
    {n:2,title:'Wheels, tires & wells',items:['Rinse wheels, tires & wheel wells','Apply wheel cleaner; agitate faces, barrels & lug areas','Scrub tires & wheel wells with a stiff brush','Rinse thoroughly, top to bottom']},
    {n:3,title:'Exterior hand wash',items:['Foam pre-soak the whole vehicle; let it dwell','Two-bucket wash, top to bottom','Final rinse — no soap left in trim or seams','Dry with clean microfiber towels']},
    {n:4,title:'Tires & dressing',items:['Apply tire dressing; wipe the applicator edge to avoid sling','Dress wheel wells (optional)']},
    {n:5,title:'Interior vacuum',items:['Vacuum seats, carpets, floor & trunk','Pull & shake floor mats; vacuum both sides','Get under the seats and seat rails']},
    {n:6,title:'Quick interior wipe',items:['Wipe dash, gauge cluster & vents lightly (APC)','Wipe console, cupholders & door tops','Clean touch points: wheel, shifter, handles']},
    {n:7,title:'Glass — in & out',items:['Clean all windows inside & out','Clean mirrors; check for streaks at an angle']},
    {n:8,title:'Final',items:['Quick wipe of door jambs','Reinstall mats; remove your gear from the cabin','Final walk-around with customer','Collect payment & ask for a review']},
  ],
  banner:'hand over the keys, walk the finished car together, then ask for a quick 5-star review.'
};

const FULL = {
  file:'full-detail-checklist.pdf', badge:{price:'$150', time:'~3 HRS'},
  title:'Full Detail — Service Checklist', kicker:'Deep Clean · Clay · Wax',
  workflow:'Everything in Express, plus clay decontamination, wax protection and a true interior deep-clean. Let products dwell — don’t rush dwell time.',
  sections:[
    {n:1,title:'Setup & walk-around',items:['Confirm package + add-ons; photo existing damage','Park in shade; set up water, power & mats','Remove all trash, mats & loose items']},
    {n:2,title:'Wheels, tires & wells',items:['Rinse, apply wheel cleaner, agitate faces & barrels','Scrub tires & wheel wells; rinse clean']},
    {n:3,title:'Wash + bug & sap',items:['Foam pre-soak, top to bottom','Loosen bugs & sap on the front end and lower panels','Two-bucket wash; rinse','Dry fully with microfiber']},
    {n:4,title:'Clay decontamination',items:['Mist clay lube (or soapy water) generously','Clay each panel flat with light pressure','Wipe & dry — paint should feel glass-smooth']},
    {n:5,title:'Wax / protect',items:['Apply paste wax thin & even','Let it haze, then buff off with a clean towel','Final-buff for a streak-free shine']},
    {n:6,title:'Interior deep clean',items:['Vacuum seats, carpets, crevices, trunk','APC + brushes: door panels, vents, console, seams','Clean cupholders, buttons & touch points','Floor mats scrubbed with APC, then vacuumed','Wipe plastics & vinyl — matte, not greasy']},
    {n:7,title:'Jambs & trim',items:['Clean door jambs & sills','Dress exterior trim & tires']},
    {n:8,title:'Glass — streak-free',items:['Clean all glass in & out','Check every window at an angle for streaks']},
    {n:9,title:'Final',items:['Reinstall mats; remove gear from cabin','Light scent (air freshener)','Full walk-around with customer','Payment & review request']},
  ],
  banner:'hand over the keys, walk the finished car together, then ask for a quick 5-star review.'
};

const SIGNATURE = {
  file:'signature-checklist.pdf', badge:{price:'$210', time:'~4½ HRS'},
  title:'Signature Detail — Service Checklist', kicker:'Full Detail + Seats · Engine Bay · Double Wax',
  workflow:'Everything in Full Detail, plus a seat & carpet shampoo, an engine bay clean and a second coat of wax. Budget the extra time and let each stage dry or cure before the next.',
  sections:[
    {n:1,title:'Setup & walk-around',items:['Confirm Signature + any add-ons; photo existing damage','Park in shade; set up water, power & mats','Remove all trash, mats & loose items']},
    {n:2,title:'Wheels, tires & wells',items:['Rinse, apply wheel cleaner, agitate faces & barrels','Scrub tires & wheel wells; rinse clean']},
    {n:3,title:'Wash + bug & sap',items:['Foam pre-soak, top to bottom','Loosen bugs & sap on front end and lower panels','Two-bucket wash; rinse, then dry with microfiber']},
    {n:4,title:'Clay decontamination',items:['Mist clay lube generously','Clay each panel flat until glass-smooth','Wipe & dry the clayed panels']},
    {n:5,title:'Double wax protection',items:['First coat of paste wax — thin & even; haze & buff','Let it cure, then apply a second coat','Final-buff for deep gloss']},
    {n:6,title:'Engine bay clean',items:['Engine cool; cover battery, fuses & connectors','APC + brushes on covers, hoses & bay','Light rinse or damp-wipe — keep water off electronics','Dry, then dress hoses & covers with trim paste']},
    {n:7,title:'Seat & carpet shampoo',items:['Vacuum first; pre-treat stains with APC','Spray APC, agitate with a brush','Extract with the wet/dry vac until lifting clean','Repeat heavy areas; run fans / open doors to dry']},
    {n:8,title:'Interior detail',items:['Micro-brushes + APC: vents, seams, buttons, console','Clean cupholders & all touch points','Wipe plastics & vinyl — matte, not greasy','Streak-free glass in & out']},
    {n:9,title:'Jambs, trim & tires',items:['Clean door jambs & sills','Dress exterior trim & tires']},
    {n:10,title:'Final',items:['Reinstall mats; remove gear from cabin','Fresh scent (air freshener)','Full walk-around with customer','Payment & review request']},
  ],
  banner:'hand over the keys, walk the finished car together, then ask for a quick 5-star review.'
};

const ADDONS = {
  file:'add-ons-checklist.pdf', badge:{label:'Add-ons', sub:'EXTRAS'},
  title:'Add-On Services — Checklist', kicker:'Bolt-ons for any package',
  howto:'Add these on top of a base package. Quote the add-on price in addition to the package, and tick each step as you go. (Seat shampoo and engine bay are already included in Signature.)',
  cards:[
    {title:'Pet hair removal', price:'$35', items:['Rubber pet brush or gloved hand over seats & carpet','Work in one direction to ball up the hair','Vacuum, then repeat low-and-slow','Pick / lint-roll edges, seams & headliner']},
    {title:'Seat shampoo', price:'$45', items:['Vacuum first; pre-treat stains with APC','Spray APC; agitate with a brush','Extract with the wet/dry vac until lifting clean','Repeat heavy areas; run fans / open doors to dry']},
    {title:'Engine bay clean', price:'$30', items:['Engine cool; cover battery, fuses & connectors','APC + brushes on covers, hoses & bay','Light rinse or damp-wipe — avoid electronics','Dry, then dress hoses & covers with trim paste']},
  ],
  banner:'confirm the add-ons and price with the customer before you start, and photo before & after.'
};

const GUIDE = {
  file:'how-to-use-your-kit.pdf', badge:{label:'FIELD GUIDE', sub:'YOUR KIT'},
  title:'How to Use Your Kit', kicker:'Every product & tool you own — what it’s for, how to use it',
  footerLeft:'Detail Valley · Field Guide',
  rules:{ title:'Golden rules — read first', items:[
    'Wheels & tires first — they’re the dirtiest part.',
    'Top-to-bottom outside, cleanest-to-dirtiest inside.',
    'Two buckets, separate mitts — that’s how you dodge swirls.',
    'Work in the shade; never product on hot paint.',
    'Let products dwell; thin layers buff off easy.',
    'Color-code towels; keep glass / wax / interior cloths apart.',
    'Clay before you wax — wash can’t remove bonded grit.',
    'You need an outdoor tap + power outlet on every job.'
  ]},
  blocks:[
    {type:'head', n:1, title:'Wash & exterior'},
    {title:'Snow foam cannon (2L sprayer kit)', rows:[
      {label:'USE', text:'A foam pre-wash that softens dirt before you touch the paint.'},
      {label:'HOW', text:'Fill with diluted soap, foam the whole car top-to-bottom, dwell 1–2 min, then rinse.'}],
      note:'More foam isn’t more clean — let it dwell, don’t scrub it dry.'},
    {title:'Extreme Bodywash & Wax (2-in-1 soap)', rows:[
      {label:'USE', text:'Routine wash that leaves a light wax boost behind.'},
      {label:'HOW', text:'Dilute per label into the foam cannon or wash bucket; wash top-to-bottom; rinse.'}],
      note:'Never use dish soap — it strips protection and dries out trim.'},
    {title:'Wash mitts (2-pack) + 5-gal buckets', rows:[
      {label:'USE', text:'Two-bucket wash that lifts dirt with the least marring.'},
      {label:'HOW', text:'One soapy bucket, one rinse. Upper-panel mitt and a separate, dirtier mitt for lowers; rinse the mitt each panel.'}],
      note:'Dropped a mitt? Rinse it before it touches paint again.'},
    {title:'Microfiber towels (50-pack)', rows:[
      {label:'USE', text:'Drying and buffing without swirls.'},
      {label:'HOW', text:'Blot and drag lightly to dry; color-code by zone — wash, glass, interior, wax.'}],
      note:'Wash separately, never with fabric softener.'},
    {title:'Nano Magic clay bar kit', rows:[
      {label:'USE', text:'Pulling bonded grit the wash leaves behind (paint feels gritty).'},
      {label:'HOW', text:'Mist plenty of lube or soapy water, glide the clay flat with light pressure, fold to a clean face often.'}],
      note:'Drop the clay on the ground? Bin it — trapped grit will scratch.'},

    {type:'head', n:2, title:'Wheels, tires & trim'},
    {title:'Foam Wheel & Paint Wash (wheel cleaner)', rows:[
      {label:'USE', text:'Cleaning wheels, tires and salty lower panels.'},
      {label:'HOW', text:'Rinse the wheel, spray, agitate faces & barrels with a brush, then rinse. Do wheels first.'}],
      note:'Never on a hot wheel; keep wheel brushes away from your paint tools.'},
    {title:'Nylon detail brushes (6 pc)', rows:[
      {label:'USE', text:'Tires, wheel wells, lug areas, grilles and badges.'},
      {label:'HOW', text:'Match the brush to the gap and use gentle pressure.'}],
      note:'Stiffer brush for tires, softer touch for trim.'},
    {title:'Car interior tire & trim care paste', rows:[
      {label:'USE', text:'Dressing tires and exterior / interior trim.'},
      {label:'HOW', text:'Wipe a thin layer onto clean, dry rubber or plastic, then buff off the excess.'}],
      note:'Wipe the edge to stop sling; keep it off pedals and the steering wheel.'},

    {type:'head', n:3, title:'Glass'},
    {title:'Glass & mirror cleaner (16 oz)', rows:[
      {label:'USE', text:'Streak-free windows and mirrors.'},
      {label:'HOW', text:'Spray onto the towel (not the glass in sun), wipe, then flip to a dry side and buff.'}],
      note:'Do glass last, with a wax-free towel; check at an angle.'},
    {title:'99% isopropyl alcohol', rows:[
      {label:'USE', text:'Cutting grease, lifting sticky residue and sanitizing touch points.'},
      {label:'HOW', text:'Lightly dampen a towel and spot-clean. Test first on sensitive plastics.'}],
      note:'Great on adhesive residue — don’t soak trim or screens.'},

    {type:'head', n:4, title:'Interior'},
    {title:'VEVOR wet/dry shop vac (5 gal)', rows:[
      {label:'USE', text:'Seats, carpets, mats, crevices — and extracting shampoo.'},
      {label:'HOW', text:'Crevice tool for seams, brush head for panels. For a shampoo, spray + agitate, then pull the moisture back out wet.'}],
      note:'Empty and dry it between wet and dry jobs.'},
    {title:'LA’s Totally Awesome APC (4-pack)', rows:[
      {label:'USE', text:'Interior surfaces, mats, door panels, the engine bay and upholstery.'},
      {label:'HOW', text:'Dilute — stronger for carpet & engine, weaker for soft plastics. Spray onto a brush, agitate, wipe.'}],
      note:'Test a hidden spot first; go gentle on glossy / piano-black trim.'},
    {title:'Micro detail brushes (120 pc)', rows:[
      {label:'USE', text:'Vents, seams, buttons, stitching and badges.'},
      {label:'HOW', text:'Use dry or with a little APC; a soft touch on delicate trim.'}],
      note:'Toss them once they fray.'},
    {title:'Little Trees air fresheners', rows:[
      {label:'USE', text:'The finishing scent the customer notices first.'},
      {label:'HOW', text:'Hang one out of sight after the interior is done.'}],
      note:'One per car — don’t overdo it.'},

    {type:'head', n:5, title:'Mobile rig & PPE'},
    {title:'Faucet adapters, hose & extension cord', rows:[
      {label:'USE', text:'Water and power on the customer’s property.'},
      {label:'HOW', text:'Adapter onto their outdoor tap, run the hose to the car; the 30 ft cord powers the shop vac.'}],
      note:'Confirm an outdoor tap and outlet before you book the job.'},
    {title:'Nitrile gloves (200 ct)', rows:[
      {label:'USE', text:'Protecting your hands during wheel, engine and cleaning work.'},
      {label:'HOW', text:'Wear them for chemicals and restock often — they tear.'}],
      note:'A gloved hand also balls up pet hair in a pinch.'},
    {title:'Two-bucket rinse discipline', rows:[
      {label:'USE', text:'The single biggest thing that keeps swirls out of the paint.'},
      {label:'HOW', text:'Soap bucket + rinse bucket; rinse and wring the mitt in the rinse bucket every panel.'}],
      note:'Add a third bucket just for wheels whenever you can.'},
  ]
};

const HANDBOOK = {
  file:'detailing-handbook.pdf', badge:{label:'HANDBOOK', sub:'OPERATIONS'},
  title:'Detailing Handbook', kicker:'Services · Pricing · Kit · How we work',
  footerLeft:'Detail Valley · Handbook',
  blocks:[
    {type:'head', n:1, title:'About Detail Valley'},
    {title:'Mobile detailing, Valley County', rows:[
      'Detail Valley is a mobile car-detailing service in Valley County, Idaho — McCall, Cascade, Donnelly and nearby. We come to the customer’s home or workplace and bring our own gear.',
      'No deposit to book; the customer pays when the work is done. Open Mon–Sat with morning and afternoon slots.']},
    {title:'How customers book', rows:[
      'Bookings come in through the website calendar (detailvalley.com). Each booking lists the package, add-ons, vehicle size, address and chosen slot.',
      {label:'CONTACT', text:'(208) 315-1420 · ethan@detailvalley.com'}]},

    {type:'head', n:2, title:'Services & pricing'},
    {title:'Express — $60 (~1 hr)', rows:[
      'Exterior hand wash & dry, wheels / tires / wells, tire dressing, interior vacuum, quick interior wipe-down, glass in & out.']},
    {title:'Full Detail — $150 (~3 hrs)', rows:[
      'Everything in Express, plus clay decontamination & paste wax, interior deep-clean (panels, vents, seams), bug & sap removal, door jambs and trim dressed.']},
    {title:'Signature — $210 (~4½ hrs)', rows:[
      'Everything in Full Detail, plus a seat & carpet shampoo, an engine bay clean, a second coat of wax, trim dressed and a fresh scent. Our top “full reset.”']},
    {title:'Add-ons & surcharges', rows:[
      {label:'ADD-ONS', text:'Pet hair removal $35 · Seat shampoo $45 · Engine bay clean $30.'},
      {label:'NOTE', text:'Seat shampoo and engine bay are already part of Signature — don’t double-charge them.'},
      {label:'VEHICLE SIZE', text:'SUV / crossover / crew-cab +$20; oversized or extra-dirty +$40.'}]},

    {type:'head', n:3, title:'What we don’t offer (yet)'},
    {title:'Be honest — don’t promise these', rows:[
      'Our current kit can’t deliver the following, so we don’t sell them. Tell customers plainly rather than over-promise:',
      '•  Paint correction / machine polishing — no polisher or compound.',
      '•  Ceramic coating or paint sealant — no coating product.',
      '•  Headlight restoration — no sanding / polishing kit.',
      '•  Undercarriage / salt flush — needs a hose run underneath.'],
      note:'When the kit grows (polisher, coating, hose), these can become real services and add-ons.'},

    {type:'head', n:4, title:'On-site requirements'},
    {title:'Water & power, every job', rows:[
      'We bring all our own gear, but every job needs an outdoor water tap AND a power outlet within reach of where the car is parked.',
      'Confirm both at booking. If they’re not available, reschedule or arrange a spot that works. Always park in the shade.'],
      note:'Still to grab: a ~50 ft garden hose + adjustable nozzle to complete the water setup.'},

    {type:'head', n:5, title:'The kit'},
    {title:'Wash & finishing', rows:[
      'Snow foam cannon (2L), Extreme Bodywash & Wax 2-in-1, Foam Wheel & Paint Wash, wash mitts (2), two 5-gal buckets, 50 microfiber towels, Nano Magic clay bar kit, 2540 paste wax, tire & trim care paste.']},
    {title:'Interior, glass & detail', rows:[
      'VEVOR wet/dry shop vac (5 gal), LA’s Totally Awesome APC (4), glass & mirror cleaner, 99% isopropyl alcohol, 6 nylon detail brushes, 120 micro detail brushes, Little Trees air fresheners.']},
    {title:'Rig & PPE', rows:[
      '200 nitrile gloves, 30 ft extension cord, 14-pc faucet adapter set, garden hose + nozzle (to add).']},

    {type:'head', n:6, title:'Standard workflow'},
    {title:'Same order, every car', rows:[
      'Wheels & tires first › exterior foam + two-bucket wash › clay decontamination › wax › interior (vacuum, APC + brushes) › glass › final scent › walk-around, payment & review.'],
      note:'Top-to-bottom outside, cleanest-to-dirtiest inside; let products dwell.'},

    {type:'head', n:7, title:'Quality & safety rules'},
    {title:'Protect the paint', rows:[
      '•  Work in the shade; never product on hot paint.',
      '•  Two buckets and separate mitts to avoid swirls.',
      '•  Thin layers of wax — they buff off easy.']},
    {title:'Protect the car & yourself', rows:[
      '•  Test APC on a hidden spot; go gentle on glossy trim.',
      '•  Engine bay: cover electronics, low water, no high pressure.',
      '•  Color-code towels; gloves for chemicals.']},

    {type:'head', n:8, title:'Customers & money'},
    {title:'Getting paid & getting reviews', rows:[
      {label:'PAYMENT', text:'Due when finished — cash, check, cards, Venmo, PayPal or Cash App. No deposit.'},
      {label:'EVERY JOB', text:'Photo before & after, quote size + add-ons up front, walk the finished car together, then ask for a 5-star review.'}]},
  ]
};

(async ()=>{
  await buildChecklist(EXPRESS);
  await buildChecklist(FULL);
  await buildChecklist(SIGNATURE);
  await buildAddons(ADDONS);
  await buildGuide(GUIDE);
  await buildGuide(HANDBOOK);
  console.log('done');
})();
