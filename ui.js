// ── trans custom UI ──────────────────────────────────────────────────────────
// Bottom dock + mode grid. Drives the engine's `state` and calls window.__engine
// for side-effects. Tweakpane stays alive (hidden) as the side-effect registry,
// so this layer can't break handler wiring. Schema-driven from the known params.

(function () {
  const boot = () => {
    if (!window.__engine || !window.__engine.state) return setTimeout(boot, 60);
    init(window.__engine);
  };
  boot();

  // param spec: key -> [label, min, max, step] | {t:'check'} | {t:'color'} | {t:'select',opts}
  const P = {
    // reveal / movement / advanced (transition modes)
    originAmount:['from within',0,1,.01], spread:['edge softness',0,1,.01],
    turbulence:['turbulence',0,1,.01], flow:['flow',0,1,.01], undulate:['undulate',0,1,.01], animate:['animate',0,1,.01],
    originX:['origin x',0,1,.01], originY:['origin y',0,1,.01], maskScale:['mask scale',.3,4,.05],
    maskShift:['mask shift',-.5,.5,.005], organic:['organic',0,1,.01], edges:['edges',-1,1,.01], seed:['seed',0,999,1],
    curve:{t:'select',label:'timing',opts:{'linear':0,'ease-in-out':1,'ease-in':2,'ease-out':3}},
    // start points / paint
    originFromImage:{t:'check',label:'origin from image A'}, pointStagger:['stagger',0,1,.01],
    pointRandom:['stagger random',0,1,.01], paintBrush:['paint brush',.02,.4,.01],
    // direction / source
    driftAngle:['direction',0,1,.01], driftAmount:['amount',0,1,.01],
    sunX:['sun / source x',0,1,.01], sunY:['sun / source y',0,1,.01], streakMove:['movement dir',0,1,.01],
    // ambient
    ambCount:['count / density',0,1,.01], ambSize:['size / scale',0,1,.01], ambSoft:['softness',0,1,.01],
    ambSpeed:['speed',0,1,.01], ambDetail:['detail / fidelity',0,1,.01],
    ambRole:{t:'select',label:'role (with A+B)',opts:{'dissolve A\u2192B':0,'standalone field':1}},
    // vignette
    vignAmount:['amount',0,1,.01], vignFeather:['feather',0,1,.01], vignAnimate:['animate (pulse)',0,1,.01], vignTexture:['edge texture',0,1,.01], vignShape:['shape (ellipse↔rect)',0,1,.01],
    // mode-specific
    rimWidth:['rim width',0,.4,.005], rimDark:['rim dark',0,1,.01],
    paperAngle:['fiber angle',0,1,.005], paperAniso:['anisotropy',1,10,.1], paperGranulation:['granulation',0,1,.01],
    paperGrowth:['fiber growth',0,1,.01], paperFollow:['follow B strokes',0,1,.01], paperPatches:['local patches',0,1,.01],
    bloomCount:['count',1,24,1], bloomRate:['growth rate',.1,2,.01], bloomRim:['rim dark',0,1,.01], bloomImageBias:['follow B lights',0,1,.01],
    diffStrength:['strength',0,1,.01], diffRadius:['radius',0,1,.01],
    sedBands:['bands',1,16,1], sedSoftness:['softness',0,1,.01],
    saltDensity:['grain',0,1,.01], saltContrast:['contrast',0,1,.01], saltBias:['bias amount',0,1,.01],
    irisUniform:{t:'check',label:'uniform circle'}, irisFocusX:['focus x',0,1,.005], irisFocusY:['focus y',0,1,.005], irisJitter:['jitter',0,1,.01],
    bleedFinger:['finger',0,1,.01], bleedAmount:['amount',0,1,.01], bleedHalo:['wet halo',0,1,.01],
    runGravity:['gravity',0,1,.01], runDrip:['drip',0,1,.01],
    advecVisc:['viscosity',0,1,.01], advecRate:['mixing rate',0,1,.01], advecSteps:['steps / frame',1,8,1],
    advecGravAngle:['flow angle',0,1,.005], advecGravity:['gravity',0,1,.01], advecGravStreak:['streak',0,1,.01], advecGravLateral:['lateral spread',0,1,.01], advecGravBias:['shadow ↔ flow',0,1,.01],
    advecCurlStr:['eddy strength',0,1,.01], advecCurlScale:['eddy scale',.5,8,.1],
    advecBrushFollow:['follow strokes',0,1,.01],
    advecSeedCount:['seed count',1,16,1], advecSeedRadius:['reach',.1,1,.01],
    weEdgeScale:['edge scale',1,16,.1], weEdgeWobble:['edge wobble',0,1,.01], weTendrilCount:['tendril count',0,32,1],
    weTendrilReach:['tendril reach',.02,1,.01], weTendrilWidth:['tendril width',.02,1,.01], weTendrilStrength:['tendril strength',0,1,.01],
    weDetailBias:['detail bias (A)',0,1,.01], weBDetailBias:['detail bias (B)',0,1,.01], weBLumaBias:['B luma bias',-1,1,.01],
    weReverse:{t:'check',label:'reverse (center→out)'}, weDryRing:['dry-ring dark',0,1,.01], weBleed:['anticipatory bleed',0,1,.01],
    strokeScale:['stroke scale',.5,20,.1], strokeAniso:['anisotropy',1,12,.1],
    glazeBands:['washes',2,8,1], glazeSoftness:['softness',0,1,.01], glazeWarm:['warm dry-shift',0,1,.01],
    edgeFirstInk:['ink',0,1,.01], edgeFirstFade:['sketch fades at t=',.05,.9,.01], edgeFirstScale:['mask scale',1,10,.1],
    flowAmount:['flow amount',0,1,.01],
    dabsCount:['dab count',1,128,1], dabsReach:['reach',.05,1,.01], dabsWobble:['edge wobble',0,1,.01],
    densityGravity:['gravity bias',0,1,.01], densitySmear:['wet smear',0,1,.01],
    moldSeedCount:['seed count',1,16,1], moldTendrilsPerSeed:['tendrils / seed',1,8,1], moldReach:['reach',.05,1,.01], moldWidth:['tendril width',.05,1,.01], moldWobble:['wobble',0,1,.01],
    formStrokeCount:['stroke count',1,64,1], formStrokeSize:['stroke size',.01,.2,.005], formStrokeWobble:['edge wobble',0,1,.01],
    bloomLightBias:['light bias (B)',0,1,.01], bloomWobble:['bloom wobble',0,1,.01], bloomPaperShow:['paper-show pop',0,1,.01],
    stageBands:['stages',2,8,1], stageOverlap:['stage overlap',0,1,.01],
    migrationStrength:['strength',0,1,.01], migrationTurb:['turbulence',0,1,.01],
    burnEdgeWobble:['front irregularity',0,1,.01], burnCharIntensity:['char depth',0,1,.01], burnCharWidth:['char band width',.01,.5,.005],
    burnCharPersistence:['char persistence',0,1,.01], burnBrowning:['browning halo',0,1,.01], burnBrowningWidth:['browning width',.01,.3,.005],
    burnAshSpatter:['ash spatter',0,1,.01], burnGlowIntensity:['glow',0,1.5,.01], burnGlowWidth:['glow width',.05,1,.01],
    burnEmberTrail:['ember trail',0,1,.01], burnGlowColor:{t:'color',label:'glow color'}, burnGlowFromB:['glow ← B color',0,1,.01],
    burnSeedCount:['extra ignition spots',0,16,1], burnBIgnite:['ignite from B',0,1,.01], burnColorBleed:['color bleed (A→B)',0,1,.01],
    videoMaskInvert:{t:'check',label:'invert (dark first)'}, videoMaskFeather:['feather',0,1,.01], videoBrightness:['brightness',-1,1,.01], videoContrast:['contrast',0,3,.01], videoSaturate:['saturate',0,3,.01],
    lightIntensity:['light intensity',0,2.5,.01], lightSpread:['spread',0,1,.01], lightPeakT:['peak at (t)',.2,.8,.01], lightFlashWidth:['flash width',.03,.4,.01], lightColor:{t:'color',label:'light color'},
    auroraDensity:['curtain density',0,1,.01], auroraHeight:['ray height',0,1,.01], auroraSpeed:['speed',0,1,.01], auroraWave:['wave through',0,1,.01], auroraDark:['darkness',0,1,.01],
    gdIntensity:['intensity',0,1,.01], gdBeams:['beam count / thinness',0,1,.01], gdCloud:['break through cloud',0,1,.01], gdPulse:['pulse (in & out)',0,1,.01],
    texFit:{t:'select',label:'fit',opts:{'contain':1,'cover':2,'stretch':0}}, texAmount:['dissolve along texture',0,1,.01], texBg:['bg tint (image mode)',0,1,.01],
    sedSource:{t:'select',label:'banding by',opts:{'luminance':0,'saturation':1,'hue':2,'edge detail':3,'temperature':4}},
    sedDirection:{t:'select',label:'order',opts:{'dark first':0,'light first':1}},
    saltSource:{t:'select',label:'grains from',opts:{'random':0,'light areas':1,'dark areas':2,'colour':3,'edges':4}},
    saltImage:{t:'select',label:'sample image',opts:{'A':0,'B':1}},
    glazeDirection:{t:'select',label:'order',opts:{'darks first':0,'lights first':1}},
    migrationDir:{t:'select',label:'flow',opts:{'along edges':0,'perpendicular':1}},
  };

  // modes grouped for the grid
  const MODES = [
    ['Reveal',[[0,'smooth'],[1,'pigment rim'],[7,'iris'],[15,'wet edge']]],
    ['Watercolor',[[2,'paper grain'],[3,'backrun blooms'],[4,'wet diffusion'],[5,'tonal sediment'],[6,'salt'],[8,'wet bleed'],[9,'pigment run'],[17,'tonal wash'],[24,'cauliflower bloom'],[25,'wet-stage'],[26,'migration']]],
    ['Painterly',[[16,'stroke-follow'],[22,'mold tendrils']]],
    ['Light & burn',[[27,'paper scorch'],[30,'light bloom']]],
    ['Ambient (loop)',[[33,'bokeh'],[34,'water ripples'],[35,'sun glare'],[36,'light streaks'],[38,'aurora'],[39,'godrays'],[40,'clouds'],[41,'caustics'],[42,'embers'],[43,'mist'],[44,'rain'],[45,'snow'],[46,'marble'],[47,'ink blooms']]],
    ['Special',[[28,'video mask'],[32,'texture-source'],[31,'particles'],[37,'paint']]],
    ['Archive',[[10,'adv wet'],[11,'adv gravity'],[12,'adv curl'],[13,'adv brush'],[14,'adv seed'],[18,'edge underdraw'],[19,'painterly flow'],[20,'color dabs'],[21,'density grav'],[23,'formation']]],
  ];
  const MODE_NAME = {}; MODES.forEach(g=>g[1].forEach(([id,n])=>MODE_NAME[id]=n));

  // mode -> its own param keys
  const MK = {
    1:['rimWidth','rimDark'], 2:['paperAngle','paperAniso','paperGranulation','paperGrowth','paperFollow','paperPatches'],
    3:['bloomCount','bloomRate','bloomRim','bloomImageBias'], 4:['diffStrength','diffRadius'],
    5:['sedSource','sedDirection','sedBands','sedSoftness'], 6:['saltSource','saltImage','saltDensity','saltContrast','saltBias'],
    7:['irisUniform','irisFocusX','irisFocusY','irisJitter'], 8:['bleedFinger','bleedAmount','bleedHalo'],
    9:['runGravity','runDrip'], 10:['advecVisc','advecRate','advecSteps'],
    11:['advecGravAngle','advecGravity','advecGravStreak','advecGravLateral','advecGravBias'],
    12:['advecCurlStr','advecCurlScale'], 13:['advecBrushFollow'], 14:['advecSeedCount','advecSeedRadius'],
    15:['weEdgeScale','weEdgeWobble','weTendrilCount','weTendrilReach','weTendrilWidth','weTendrilStrength','weDetailBias','weBDetailBias','weBLumaBias','weReverse','weDryRing','weBleed'],
    16:['strokeScale','strokeAniso'], 17:['glazeBands','glazeSoftness','glazeWarm','glazeDirection'],
    18:['edgeFirstInk','edgeFirstFade','edgeFirstScale'], 19:['flowAmount'],
    20:['dabsCount','dabsReach','dabsWobble'], 21:['densityGravity','densitySmear'],
    22:['moldSeedCount','moldTendrilsPerSeed','moldReach','moldWidth','moldWobble'],
    23:['formStrokeCount','formStrokeSize','formStrokeWobble'], 24:['bloomLightBias','bloomWobble'],
    25:['stageBands','stageOverlap'], 26:['migrationStrength','migrationTurb','migrationDir'],
    27:['burnEdgeWobble','burnCharIntensity','burnCharWidth','burnCharPersistence','burnBrowning','burnBrowningWidth','burnAshSpatter','burnGlowIntensity','burnGlowWidth','burnEmberTrail','burnGlowColor','burnGlowFromB','burnSeedCount','burnBIgnite','burnColorBleed'],
    28:['videoMaskInvert','videoMaskFeather','videoBrightness','videoContrast','videoSaturate'],
    30:['lightIntensity','lightSpread','lightPeakT','lightFlashWidth','lightColor'],
    32:['texFit','texAmount','texBg'],
    33:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // bokeh
    34:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // ripples
    35:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // glare
    36:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // streaks
    38:['auroraDensity','auroraHeight','auroraSpeed','auroraWave','auroraDark'],
    39:['gdIntensity','gdBeams','gdCloud','gdPulse'],
    40:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // clouds
    41:['ambSize','ambSoft','ambSpeed','ambDetail'],                     // caustics (no count)
    42:['ambCount','ambSize','ambDetail'],                              // embers
    43:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // mist
    44:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // rain
    45:['ambCount','ambSize','ambSpeed'],                               // snow
    46:['ambSize','ambSoft','ambSpeed','ambDetail'],                     // marble
    47:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // ink blooms
  };
  // per-mode Direction/source keys (only what each ambient field reads).
  const DIRK = {
    33:['driftAngle','driftAmount'], 36:['driftAngle','streakMove'],
    35:['sunX','sunY'], 39:['driftAmount','sunX','sunY'],
    40:['driftAngle'], 41:['driftAngle','driftAmount'], 42:['driftAngle','driftAmount'],
    43:['driftAngle'], 44:['driftAngle'], 45:['driftAngle','driftAmount'], 46:['driftAngle','driftAmount'],
  };

  // relevance of the global groups per mode
  const isTrans = m => m<=32 && m!==31;            // reveal/movement/advanced apply
  const REL = {
    reveal: m=>isTrans(m), movement: m=>isTrans(m), advanced: m=>isTrans(m),
    points: m=>(m<=32&&m!==31)||m===34, dir: m=>[33,35,36,39,40,41,42,43,44,45,46,47].includes(m), vign: ()=>true,
  };

  function init(E){
    const st=E.state;

    // Group accent colours: single source is the CSS hue palette (:root in
    // ui.css). Read them here so the mode column, Recent group, and per-mode
    // settings tint stay consistent with the controls-rail stripes. MODES order
    // → Reveal·Watercolor·Painterly·Light&burn·Ambient·Special·Archive.
    const _css = getComputedStyle(document.documentElement);
    const _hue = n => _css.getPropertyValue(n).trim() || 'var(--ui-text)';
    const GROUP_COLORS = [_hue('--hue-blue'), _hue('--hue-green'), _hue('--hue-purple'),
                          _hue('--hue-amber'), _hue('--hue-pink'), _hue('--hue-cyan'), _hue('--ui-faint')];
    const RECENT_COLOR = _hue('--hue-recent');
    const MODE_COLOR = {}; MODES.forEach((g,gi)=>g[1].forEach(([id])=>{ MODE_COLOR[id]=GROUP_COLORS[gi]||'var(--ui-text)'; }));

    // ── left rail: mode grid (thumbnail tiles) ──
    const left=document.createElement('div'); left.id='ui-modes';
    const titleCase=s=>s.replace(/(^|[\s-])\w/g,ch=>ch.toUpperCase());
    function makeChip(id,name){
      const c=document.createElement('button'); c.className='chip'; c.dataset.mode=id;
      c.innerHTML=`<span class="nm">${titleCase(name)}</span>`;
      c.style.backgroundImage=`url(thumbs/m${String(id).padStart(2,'0')}.png)`;
      c.onclick=()=>{E.setMode(id);selectMode(id);};
      return c;
    }
    // Recent group (top): the most recently EXPORTED modes, newest first. Filled
    // from localStorage 'matte.exports' (written by main.js on each export) and
    // refreshed on the 'matte-export' event.
    const recentG=document.createElement('div'); recentG.className='mgroup mgroup-recent'; recentG.innerHTML='<h4>Recent</h4>';
    recentG.querySelector('h4').style.color=RECENT_COLOR;
    const recentBody=document.createElement('div'); recentBody.className='recent-chips';
    recentG.appendChild(recentBody); left.appendChild(recentG);
    function renderRecent(){
      let hist=[]; try{ hist=JSON.parse(localStorage.getItem('matte.exports')||'[]'); }catch(e){}
      const seen=new Set(), ids=[];
      for(const h of hist){ if(h&&MODE_NAME[h.mode]!=null&&!seen.has(h.mode)){ seen.add(h.mode); ids.push(h.mode); } if(ids.length>=8) break; }
      recentBody.innerHTML='';
      if(!ids.length){ const e=document.createElement('div'); e.className='recent-empty'; e.textContent='Modes you export show up here.'; recentBody.appendChild(e); return; }
      ids.forEach(id=>{ const c=makeChip(id, MODE_NAME[id]); c.classList.toggle('sel',+id===st.mode); recentBody.appendChild(c); });
    }
    renderRecent();
    window.addEventListener('matte-export', renderRecent);
    MODES.forEach(([gname,items],gi)=>{
      const g=document.createElement('div'); g.className='mgroup'+(gname==='Archive'?' mgroup-archive':''); g.innerHTML=`<h4>${gname}</h4>`;
      const h4=g.querySelector('h4'); h4.style.color=GROUP_COLORS[gi]||'var(--ui-text)';
      h4.style.borderBottomColor=`color-mix(in srgb, ${GROUP_COLORS[gi]||'var(--ui-line-2)'} 33%, transparent)`;
      items.forEach(([id,name])=>g.appendChild(makeChip(id,name)));
      left.appendChild(g);
    });
    // ── right rail: modes gallery + params ──
    const right=document.createElement('div'); right.id='ui-right';
    right.innerHTML=`<div class="modehead"></div><div id="params"></div>`;
    document.body.appendChild(left);
    document.body.appendChild(right);
    const headEl=right.querySelector('.modehead'), paramsEl=right.querySelector('#params');

    // ── bottom bar ──
    const bar=document.createElement('div'); bar.id='ui-controls';
    bar.innerHTML=`
      <section id="ui-intro">
        <p><strong>Matte</strong> builds black-and-white transition mattes for video. Pick a <strong>mode</strong> on the right and tune its <strong>settings</strong>. <strong>Origin</strong> sets where the effect starts; drop <strong>source images</strong> to preview it in colour. <strong>Play</strong> or <strong>scrub</strong> to preview, then <strong>Record</strong> to export. Click any heading to fold its panel.</p>
      </section>
      <div class="uigroup">
        <h5>Output</h5>
        <div class="grp"><select id="ui-size" aria-label="output resolution preset"></select></div>
        <label class="barchk wide" title="lock output to the source image aspect ratio (keeps the chosen resolution)"><input type="checkbox" id="ui-matchin">Match source aspect</label>
        <div class="grp" id="ui-wh"><label for="ui-w">size</label><input type="number" id="ui-w" min="2" aria-label="output width in pixels" title="output width (px)"><span class="unit">×</span><input type="number" id="ui-h" min="2" aria-label="output height in pixels" title="output height (px)"></div>
        <label class="barchk wide" title="lock the width:height ratio while typing"><input type="checkbox" id="ui-lockar">Lock aspect ratio</label>
        <div class="grp"><label for="ui-dur">dur</label><input type="number" id="ui-dur" min="1" max="60" step="1" aria-label="duration in seconds"><span class="unit">s</span></div>
        <div class="grp"><label for="ui-fps">fps</label><select id="ui-fps" aria-label="output frame rate"></select></div>
      </div>
      <div class="uigroup">
        <h5>Playback</h5>
        <div class="grp transport"><button class="btn ico" id="ui-play" title="play / pause">▶</button><button class="btn ico" id="ui-restart" title="restart from 0">⟳</button><button class="btn ico" id="ui-loop" title="loop playback">↻</button></div>
        <div class="grp" id="scrub-grp"><input type="range" id="ui-scrub" min="0" max="1" step="0.001" value="0" aria-label="scrub transition progress" title="scrub the transition (progress)"><span class="val" id="ui-scrub-val">0.00</span></div>
      </div>
      <div class="uigroup">
        <h5>Export</h5>
        <div class="grp" id="proj-grp"><label for="ui-proj">project</label><input type="text" id="ui-proj" placeholder="none" maxlength="24" aria-label="project name (filename prefix)" title="prefixed to export filenames, e.g. DML → DML_…"></div>
        <div class="grp"><span id="recwrap"><button class="btn rec" id="ui-rec">● Record</button><span id="recbar"></span></span></div>
        <div class="grp"><button class="btn" id="ui-folder" title="choose a folder to save recordings into">Folder: default</button></div>
      </div>
      <div class="uigroup">
        <h5>View</h5>
        <div class="grp"><button class="btn" id="ui-preview" title="show B/W matte or the colour result on A/B">Preview: Matte</button></div>
        <label class="barchk wide" title="invert the matte (white↔black)"><input type="checkbox" id="ui-inv">Invert matte</label>
        <button class="btn usesrc-btn" id="ui-usesrc" title="use the A/B images for the transition (off = pure matte)">Use source images</button>
        <button class="btn" id="ui-opensrc" title="open the source-image library in a side panel">⊞ Source images</button>
      </div>
      <div class="uigroup" id="ui-origin"><h5>Origin</h5><div id="origin-body"></div></div>
      <div class="uigroup" id="ui-vignette"><h5>Vignette</h5><div id="vign-body"></div></div>`;
    document.body.appendChild(bar);
    // Origin + Vignette are global (shared across modes) and live in the left
    // controls rail (foldable like the other groups).
    const originGroup=bar.querySelector('#ui-origin'), originBody=bar.querySelector('#origin-body');
    const vignBody=bar.querySelector('#vign-body');

    // ── popovers (sources / presets / folder) ──
    const pop=document.createElement('div'); pop.id='ui-pop'; document.body.appendChild(pop);
    let popOpen=null;
    function closePop(){ pop.classList.remove('on'); popOpen=null; }
    function openPop(name, anchorBtn, build){
      if(popOpen===name){ closePop(); return; }
      pop.innerHTML=''; build(pop); pop.classList.add('on'); popOpen=name;
      const r=anchorBtn.getBoundingClientRect();
      pop.style.left=Math.max(8, Math.min(window.innerWidth-pop.offsetWidth-8, r.left))+'px';
      pop.style.bottom=(window.innerHeight-r.top+8)+'px';
    }
    document.addEventListener('click',(e)=>{ if(popOpen && !pop.contains(e.target) && !e.target.closest('#ui-sources')) closePop(); });

    // SOURCES: relocate the live #side DOM (slot bar + library) into its own
    // slide-out panel that sits just right of the controls rail. Moving (not
    // rebuilding) the nodes keeps all of main.js's existing listeners intact.
    const srcPanel=document.createElement('div'); srcPanel.id='ui-sources';
    const srcHost=document.createElement('div'); srcHost.id='src-host';
    srcHost.innerHTML='<div class="src-head"><span class="pop-title">Source Images</span><button class="btn sm src-close" title="close panel">✕</button></div>';
    ['slot-bar','library-section'].forEach(id=>{ const el=document.getElementById(id); if(el) srcHost.appendChild(el); });
    srcPanel.appendChild(srcHost); document.body.appendChild(srcPanel);
    // 'use sources' toggle (engine on/off) stays in the View group
    { const u=bar.querySelector('#ui-usesrc');
      const syncUse=()=>{ const on=E.useSources; u.classList.toggle('on',on); u.textContent = on ? 'Using source images' : 'Use source images'; };
      u.onclick=()=>{ E.setUseSources(!E.useSources); syncUse(); }; syncUse(); }
    // open / close the sources side panel
    { const ob=bar.querySelector('#ui-opensrc');
      const sync=()=>{ ob.classList.toggle('on', document.body.classList.contains('sources-open')); };
      ob.onclick=()=>{ document.body.classList.toggle('sources-open'); sync(); };
      srcHost.querySelector('.src-close').onclick=()=>{ document.body.classList.remove('sources-open'); sync(); };
      sync(); }

    // ── fold / unfold groups (controls rail + mode column), persisted ──
    // Defaults (first visit / no saved state): mode column + Export/View start
    // collapsed; Output and Playback stay open. Key is versioned so the new
    // defaults apply once even for users with older saved fold state.
    const FOLD_KEY='matte.folded.v3';
    let folded;
    { const stored=localStorage.getItem(FOLD_KEY);
      if(stored!=null){ try{ folded=new Set(JSON.parse(stored)); }catch(e){ folded=null; } }
      if(!folded){ folded=new Set(['ctrl:View','ctrl:Export','ctrl:Vignette']); MODES.forEach(([g])=>folded.add('mode:'+g)); } }
    const saveFold=()=>{ try{ localStorage.setItem(FOLD_KEY,JSON.stringify([...folded])); }catch(e){} };
    function makeFoldable(group,head,key,onToggle){
      const body=document.createElement('div'); body.className='fold-body';
      while(head.nextSibling) body.appendChild(head.nextSibling);
      group.appendChild(body); head.classList.add('fold-head');
      if(folded.has(key)) group.classList.add('folded');
      head.addEventListener('click',()=>{ const f=group.classList.toggle('folded'); if(f)folded.add(key); else folded.delete(key); if(onToggle)onToggle(f); saveFold(); });
    }
    bar.querySelectorAll('.uigroup').forEach(g=>{ const h=g.querySelector('h5'); if(h) makeFoldable(g,h,'ctrl:'+h.textContent.trim()); });
    // Mode column = accordion: opening one group folds the others (Recent is
    // independent and stays open alongside).
    const modeGroups=[...left.querySelectorAll('.mgroup')].filter(g=>!g.classList.contains('mgroup-recent'));
    left.querySelectorAll('.mgroup').forEach(g=>{
      const h=g.querySelector('h4'); if(!h) return;
      const recent=g.classList.contains('mgroup-recent');
      makeFoldable(g,h,'mode:'+h.textContent.trim(), recent?null:(isFolded)=>{
        if(isFolded) return;  // only collapse peers when THIS group just opened
        modeGroups.forEach(o=>{ if(o!==g && !o.classList.contains('folded')){
          o.classList.add('folded'); folded.add('mode:'+o.querySelector('h4').textContent.trim()); }});
      });
    });

    // OUTPUT FOLDER
    function refreshFolderBtn(){ const b=bar.querySelector('#ui-folder'); const n=E.folderName; b.textContent='Folder: '+(n&&n!=='browser default'?n:'default'); b.classList.toggle('on', !!(n&&n!=='browser default')); }
    bar.querySelector('#ui-folder').onclick=async()=>{
      if(!E.hasFolderAPI){ alert('Folder picking is not supported in this browser; recordings download instead.'); return; }
      const n=await E.pickFolder();
      if(n){ refreshFolderBtn(); }
      else if(E.folderName && E.folderName!=='browser default'){ await E.clearFolder(); refreshFolderBtn(); }  // cancel on an already-set folder = clear to default
    };
    refreshFolderBtn();
    // show/hide all rails (pure-effect view). H or Tab toggles; a small always-
    // visible handle (top-right) makes it reversible even when everything is hidden.
    const uiToggle=document.createElement('button'); uiToggle.id='ui-hide'; uiToggle.title='show / hide panels (H)'; uiToggle.textContent='⊙';
    document.body.appendChild(uiToggle);
    const toggleUI=()=>{ document.body.classList.toggle('ui-hidden'); uiToggle.classList.toggle('on',document.body.classList.contains('ui-hidden')); };
    uiToggle.onclick=toggleUI;
    window.addEventListener('keydown',e=>{ const t=e.target.tagName; if(t==='INPUT'||t==='SELECT'||t==='TEXTAREA') return; if(e.key==='Tab'||e.key==='h'||e.key==='H'){ e.preventDefault(); toggleUI(); }});

    // ── output size ──
    const SIZES=[['ELVERKET ALL · 8000×4373',[8000,4373]],['ELVERKET Panorama · 8000×3411',[8000,3411]],
      ['ELVERKET Floor · 8160×2719',[8160,2719]],['ELVERKET Long wall · 8160×1920',[8160,1920]],
      ['ELVERKET Short wall · 2719×1920',[2719,1920]],['8K · 7680×4320',[7680,4320]],['6K · 5760×3240',[5760,3240]],
      ['4K · 3840×2160',[3840,2160]],['1440p · 2560×1440',[2560,1440]],['1080p · 1920×1080',[1920,1080]],
      ['720p · 1280×720',[1280,720]],['Square · 1080×1080',[1080,1080]],['Vertical · 1080×1920',[1080,1920]],['custom…','custom']];
    const selSize=bar.querySelector('#ui-size');
    SIZES.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s[0];selSize.appendChild(o);});
    const whBox=bar.querySelector('#ui-wh'), wIn=bar.querySelector('#ui-w'), hIn=bar.querySelector('#ui-h');
    function syncSizeUI(){
      const idx=SIZES.findIndex(s=>Array.isArray(s[1])&&s[1][0]===st.outW&&s[1][1]===st.outH);
      selSize.value=idx>=0?idx:(SIZES.length-1); wIn.value=Math.round(st.outW); hIn.value=Math.round(st.outH);
    }
    const matchCb=bar.querySelector('#ui-matchin');
    if(matchCb){ matchCb.checked=E.matchInput; matchCb.onchange=()=>{ E.setMatchInput(matchCb.checked); syncSizeUI(); }; }
    selSize.onchange=()=>{const s=SIZES[+selSize.value]; if(s[1]==='custom'){wIn.focus();return;} E.setSize(s[1][0],s[1][1]); syncSizeUI();};
    const lockCb=bar.querySelector('#ui-lockar');
    if(lockCb){ lockCb.checked=!!st.lockAspect; lockCb.onchange=()=>{ st.lockAspect=lockCb.checked; if(E.save)E.save(); }; }
    wIn.onchange=()=>{ let w=Math.max(2,+wIn.value), h=Math.max(2,+hIn.value); if(st.lockAspect&&st.outH){ h=Math.max(2,Math.round(w*st.outH/st.outW)); } E.setSize(w,h); syncSizeUI(); };
    hIn.onchange=()=>{ let w=Math.max(2,+wIn.value), h=Math.max(2,+hIn.value); if(st.lockAspect&&st.outW){ w=Math.max(2,Math.round(h*st.outW/st.outH)); } E.setSize(w,h); syncSizeUI(); };

    // (display-size control removed — the preview always matches the output aspect)

    // ── duration / invert ──
    const durIn=bar.querySelector('#ui-dur'); durIn.value=st.duration;
    durIn.onchange=()=>{st.duration=Math.max(.5,Math.min(45,+durIn.value));E.save();};
    const fpsIn=bar.querySelector('#ui-fps');
    [24,25,30,50,60].forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=f+' fps';fpsIn.appendChild(o);});
    fpsIn.value=st.exportFps||25;
    fpsIn.onchange=()=>{ st.exportFps=+fpsIn.value; E.save(); };
    const projIn=bar.querySelector('#ui-proj'); projIn.value=st.projectName||'';
    projIn.oninput=()=>{ st.projectName=projIn.value; E.save(); };
    const inv=bar.querySelector('#ui-inv'); inv.checked=!!st.matteInvert; inv.onchange=()=>{st.matteInvert=inv.checked;};
    const prev=bar.querySelector('#ui-preview');
    const syncPrev=()=>{ const on=E.matteOutput!==false; prev.textContent='Preview: '+(on?'Matte':'Colour'); prev.classList.toggle('on',!on); };
    prev.onclick=()=>{ E.setMatte(E.matteOutput===false); syncPrev(); };
    syncPrev();

    // ── transport ──
    const bPlay=bar.querySelector('#ui-play'), bLoop=bar.querySelector('#ui-loop');
    bPlay.onclick=()=>{E.togglePlay();refreshTransport();};
    bar.querySelector('#ui-restart').onclick=()=>{E.restartPlayback();refreshTransport();};
    bLoop.onclick=()=>{E.toggleLoop();refreshTransport();};
    const scrub=bar.querySelector('#ui-scrub'), scrubVal=bar.querySelector('#ui-scrub-val');
    let scrubbing=false;
    scrub.addEventListener('input',()=>{ scrubbing=true; E.scrub(+scrub.value); scrubVal.textContent=(+scrub.value).toFixed(2); });
    scrub.addEventListener('change',()=>{ scrubbing=false; });
    function refreshTransport(){ bPlay.textContent=E.playing?'❚❚':'▶'; bPlay.title=E.playing?'pause':'play'; bPlay.classList.toggle('on',E.playing); bLoop.classList.toggle('on',E.loop);
      if(!scrubbing){ const t=E.state.t||0; scrub.value=t; scrubVal.textContent=t.toFixed(2); } }
    setInterval(refreshTransport,300); refreshTransport();

    // ── record + progress ── mirror the engine's #rec-progress (fill + status
    // text) onto the record button, since the top-centre toast is far from where
    // the user clicks. The button shows "Analysing… / Recording NN% / Done ✓ → …".
    const bRec=bar.querySelector('#ui-rec'), recbar=bar.querySelector('#recbar');
    const REC_IDLE='● Record';
    bRec.onclick=()=>E.startRecording();
    let _recWasOn=false;
    setInterval(()=>{
      const ov=document.getElementById('rec-progress'); const on=ov&&getComputedStyle(ov).display!=='none';
      bRec.classList.toggle('busy',!!on);
      if(on){
        const f=ov.querySelector('.rec-fill'); const lbl=(ov.querySelector('.rec-label')||{}).textContent||'';
        recbar.style.width=f.style.width;
        const kind=ov.dataset.kind||'';   // 'progress' | 'done' | 'error', set by main.js
        const done=kind==='done', err=kind==='error';
        recbar.className=''; if(done)recbar.classList.add('done'); if(err)recbar.classList.add('err');
        const short = lbl.length > 24 ? lbl.slice(0,23)+'…' : lbl;
        bRec.textContent = short || (done?'Done ✓':'Recording…');
        bRec.classList.toggle('ok',done); bRec.classList.toggle('bad',err);
        _recWasOn=true;
      } else {
        recbar.style.width='0%';
        if(_recWasOn){ bRec.textContent=REC_IDLE; bRec.classList.remove('ok','bad'); _recWasOn=false; }
      }
    },120);

    // ── params builder ──
    function widget(key){
      const spec=P[key]; if(!spec) return null;
      const row=document.createElement('div'); row.className='row';
      if(spec.t==='check'){ row.classList.add('check');
        row.innerHTML=`<label><input type="checkbox"> ${spec.label}</label>`;
        const cb=row.querySelector('input'); cb.checked=!!st[key]; cb.onchange=()=>{st[key]=cb.checked;}; return row;
      }
      if(spec.t==='color'){
        row.innerHTML=`<span class="lab">${spec.label}</span><input type="color" aria-label="${spec.label}">`;
        const ci=row.querySelector('input'); ci.value=st[key]||'#ffffff'; ci.oninput=()=>{st[key]=ci.value;}; return row;
      }
      if(spec.t==='select'){
        row.innerHTML=`<span class="lab">${spec.label}</span><select aria-label="${spec.label}"></select>`;
        const se=row.querySelector('select');
        Object.entries(spec.opts).forEach(([l,v])=>{const o=document.createElement('option');o.value=v;o.textContent=l;se.appendChild(o);});
        se.value=st[key]; se.onchange=()=>{st[key]=isNaN(+se.value)?se.value:+se.value;}; return row;
      }
      const [label,mn,mx,stp]=spec; const dec=(stp+'').includes('.')?(stp+'').split('.')[1].length:0;
      row.innerHTML=`<span class="lab">${label}</span><input type="range" min="${mn}" max="${mx}" step="${stp}" aria-label="${label}"><span class="val"></span>`;
      const r=row.querySelector('input'), v=row.querySelector('.val');
      r.value=st[key]; v.textContent=(+st[key]).toFixed(dec);
      r.oninput=()=>{st[key]=+r.value; v.textContent=(+r.value).toFixed(dec);}; return row;
    }
    function section(title,keys,dim){
      const s=document.createElement('div'); s.className='psec'+(dim?' dim':''); s.innerHTML=`<h4>${title}</h4>`;
      keys.forEach(k=>{const w=widget(k); if(w)s.appendChild(w);}); return s;
    }

    // ── Origin: GLOBAL "where the effect starts" control, lives in the controls
    // rail (not per-mode), since points/paint are shared across every effect. It
    // still re-evaluates per mode — auto/points/paint availability and greying
    // follow the shader audit: transition 1-32 (not particles 31) = auto/points/
    // paint + amount; ambient 33-47 = POINTS only; ripples 34 & particles 31 =
    // no effect → dimmed; mode 37 = paint-only. ──
    function buildOrigin(m){
      originBody.innerHTML='';
      const SRC = (m===37) ? ['paint']
                : (m===34 || m===31) ? []
                : (m>=33 && m<=47) ? ['points']
                : (m<=32) ? ['auto','points','paint'] : [];
      const usesAmount = SRC.includes('auto');   // only mask-blend modes use originAmount
      originGroup.classList.toggle('dim', SRC.length===0);
      if (SRC.length===0){
        const n=document.createElement('div'); n.className='hint'; n.textContent='No effect in this mode.';
        originBody.appendChild(n); return;
      }
      let cur = (m===37) ? 'paint' : (E.originSource ? E.originSource() : 'auto');
      if(!SRC.includes(cur)) cur=SRC[0];
      if(E.originSource && E.originSource()!==cur && m!==37) E.setOriginSource(cur);  // clamp carry-over
      const NAMES={auto:'Auto',points:'Points',paint:'Paint'};
      if(SRC.length>1){
        const lbl=document.createElement('div'); lbl.className='hint'; lbl.textContent='Start from'; originBody.appendChild(lbl);
        const seg=document.createElement('div'); seg.className='seg';
        SRC.forEach(v=>{ const btn=document.createElement('button'); btn.className='seg-btn'+(v===cur?' on':'');
          btn.textContent=NAMES[v]; btn.onclick=()=>{ E.setOriginSource(v); buildOrigin(m); }; seg.appendChild(btn); });
        originBody.appendChild(seg);
      }
      if(usesAmount){ const w=widget('originAmount'); if(w) originBody.appendChild(w); }
      let pb=document.createElement('div'); pb.className='ptsbar';
      if(cur==='auto'){
        const w=widget('originFromImage'); if(w) originBody.appendChild(w);
        const c2=document.createElement('span'); c2.className='hint'; c2.textContent='Grows from the centre (or image A’s bright area).';
        pb.appendChild(c2);
      } else if(cur==='points'){
        const place=document.createElement('button'); place.className='btn sm';
        const sync=()=>{ const on=E.state.placePoints; place.textContent=on?'✓ Click canvas — done':'✕ Place points'; place.classList.toggle('on',on); };
        place.onclick=()=>{ E.setPlacePoints(!E.state.placePoints); sync(); };
        const clr=document.createElement('button'); clr.className='btn sm'; clr.textContent='Clear';
        clr.onclick=()=>{ E.clearPoints(); buildOrigin(m); };
        pb.appendChild(place); pb.appendChild(clr); sync();
        const n=(E.state.originPoints||[]).length;
        const st2=document.createElement('span'); st2.className='hint';
        st2.textContent = n? (n+' point'+(n>1?'s':'')+' placed (max 8)') : 'Click the canvas to add points (max 8).';
        pb.appendChild(st2);
        originBody.appendChild(pb);
        ['pointStagger','pointRandom'].forEach(k=>{ const w=widget(k); if(w) originBody.appendChild(w); });
        pb=null;
      } else if(cur==='paint'){
        if(m!==37){
          const bd=document.createElement('span'); bd.className='hint'; bd.textContent='Show under brush:';
          const back=(E.paintBackdrop?E.paintBackdrop():'A');
          const seg=document.createElement('div'); seg.className='seg';
          ['A','B'].forEach(v=>{ const btn=document.createElement('button'); btn.className='seg-btn'+(back===v?' on':'');
            btn.textContent=v; btn.onclick=()=>{ E.setPaintBackdrop(v); buildOrigin(m); }; seg.appendChild(btn); });
          originBody.appendChild(bd); originBody.appendChild(seg);
        }
        const w=widget('paintBrush'); if(w) originBody.appendChild(w);
        const clr=document.createElement('button'); clr.className='btn sm'; clr.textContent='Clear painted region';
        clr.onclick=()=>{ E.clearPaint(); buildOrigin(m); };
        pb.appendChild(clr);
        const painted=!!E.state._paintReady;
        const st2=document.createElement('span'); st2.className='hint';
        st2.textContent = painted? 'Region painted.' : 'Drag on the canvas to paint where it starts.';
        pb.appendChild(st2);
      }
      if(pb) originBody.appendChild(pb);
    }

    // ── Vignette: global post-effect, lives in the globals rail (not per-mode). ──
    function buildVignette(){
      vignBody.innerHTML='';
      ['vignAmount','vignShape','vignFeather','vignTexture','vignAnimate'].forEach(k=>{ const w=widget(k); if(w) vignBody.appendChild(w); });
      const vb=document.createElement('div'); vb.className='ptsbar split';
      const vr=document.createElement('button'); vr.className='btn sm'; vr.textContent='↺ reset vignette';
      vr.onclick=()=>{ if(E.resetVignette)E.resetVignette(); buildVignette(); };
      vb.appendChild(vr); vignBody.appendChild(vb);
    }

    let _activeTab=0;
    function buildParams(m){
      paramsEl.innerHTML='';
      {
        const fb=document.createElement('div'); fb.className='ptsbar split params-tools';
        const rs=document.createElement('button'); rs.className='btn sm'; rs.textContent='↺ reset mode';
        rs.onclick=()=>{ E.resetMode(m); buildParams(m); };
        const rnd=document.createElement('button'); rnd.className='btn sm'; rnd.textContent='🎲 randomize';
        rnd.onclick=()=>{ E.randomizeMode(m); buildParams(m); };
        fb.appendChild(rs); fb.appendChild(rnd); paramsEl.appendChild(fb);
      }
      // ── settings in 2 tabs (Origin moved to the global controls rail, so the
      // old middle tab is gone). reset/randomize stay pinned above. ──
      const tabBar=document.createElement('div'); tabBar.className='tabbar';
      const tMode=document.createElement('div'); tMode.className='tabpane';
      const tFinish=document.createElement('div'); tFinish.className='tabpane';
      const _panes=[tMode,tFinish];
      if(_activeTab>=_panes.length) _activeTab=0;
      [['Mode',0],['Finish',1]].forEach(([label,ix])=>{
        const tb=document.createElement('button'); tb.className='tab'+(ix===_activeTab?' on':''); tb.textContent=label;
        tb.onclick=()=>{ _activeTab=ix; tabBar.querySelectorAll('.tab').forEach((b,bi)=>b.classList.toggle('on',bi===ix)); _panes.forEach((p,pi)=>p.classList.toggle('show',pi===ix)); };
        tabBar.appendChild(tb);
      });
      _panes.forEach((p,pi)=>p.classList.toggle('show',pi===_activeTab));
      paramsEl.appendChild(tabBar); paramsEl.appendChild(tMode); paramsEl.appendChild(tFinish);
      const _amb = (m>=33 && m<=47 && m!==37);
      if(_amb){
        const rs=section('Ambient mode',[],false);
        const rbar=document.createElement('div'); rbar.className='ptsbar split';
        const mkR=(label,val)=>{ const b=document.createElement('button'); b.className='btn sm'; b.textContent=label;
          b.classList.toggle('on',(E.state.ambRole||0)==val);
          b.onclick=()=>{ E.state.ambRole=val; E.save(); if(E.restartPlayback)E.restartPlayback(); buildParams(m); };
          return b; };
        rbar.appendChild(mkR('reveal',0)); rbar.appendChild(mkR('standalone loop',1));
        rs.appendChild(rbar);
        const h=document.createElement('div'); h.className='hint sec-note';
        h.textContent = (E.state.ambRole||0)<0.5
          ? 'Black\u2192white transition using this pattern (dissolves A\u2192B if images are loaded).'
          : 'Standalone looping field \u2014 not a black\u2192white transition.';
        rs.appendChild(h);
        tMode.appendChild(rs);
      }
      if(MK[m]) tMode.appendChild(section('this mode',MK[m],false));
      tMode.appendChild(section('Reveal',['spread'],!REL.reveal(m)));
      tMode.appendChild(section('Movement',['turbulence','flow','undulate','animate'],!REL.movement(m)));
      { const dk = DIRK[m] || (REL.dir(m) ? ['driftAngle','driftAmount','sunX','sunY','streakMove'] : []);
        if (dk.length) tMode.appendChild(section('Direction / source', dk, false)); }
      tFinish.appendChild(section('Advanced',['originX','originY','maskScale','curve','seed','maskShift','organic','edges'],!REL.advanced(m)));
    }
    function selectMode(id){
      left.querySelectorAll('.chip').forEach(c=>c.classList.toggle('sel',+c.dataset.mode===id));
      // tint the whole settings panel with the mode's group accent (MODE_COLOR is
      // the single source — correct even for duplicated chips in the Recent group)
      right.style.setProperty('--m', MODE_COLOR[id] || 'var(--ui-text)');
      headEl.textContent=(MODE_NAME[id]||('mode '+id)).replace(/(^|[\s-])\w/g,ch=>ch.toUpperCase()); buildParams(id); buildOrigin(id);
    }

    buildVignette(); syncSizeUI(); selectMode(st.mode);
    setInterval(syncSizeUI, 1500);
  }
})();
