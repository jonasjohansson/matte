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
    // column swipe (mode 63)
    swipeCols:['columns',1,16,1], swipeColW:['column fill',0.2,1,.01],
    swipeStagger:['stagger',0,1,.01], swipeSoft:['organic edge',0,1,.01],
    swipeDir:{t:'select',label:'direction',opts:{'up':0,'down':1,'left':2,'right':3}},
    // mirror expand (mode 64)
    mirrorDir:{t:'select',label:'expand',opts:{'left / right':0,'up / down':1,'radial':2,'diamond':3}},
    // box reveal (mode 68)
    rectW:['rect width',0.01,0.5,.01], rectH:['rect height',0.01,0.5,.01], rectReach:['reach',0.05,1.5,.01],
    // start points / paint
    originFromImage:{t:'check',label:'origin from image A'}, pointStagger:['stagger',0,1,.01],
    pointRandom:['stagger random',0,1,.01], pointSize:['lamp size',0,1,.01], pointPop:['pop (instant on)',0,1,.01],
    pointFill:{t:'check',label:'fill out (cover by end)'}, paintBrush:['paint brush',.02,.4,.01],
    // direction / source
    driftAngle:['direction',0,1,.01], driftAmount:['amount',0,1,.01],
    sunX:['sun / source x',0,1,.01], sunY:['sun / source y',0,1,.01], streakMove:['movement dir',0,1,.01],
    // ambient
    ambCount:['count / density',0,1,.01], ambSize:['size / scale',0,1,.01], ambSoft:['softness',0,1,.01],
    ambSpeed:['speed',0,1,.01], ambDetail:['detail / fidelity',0,1,.01],
    foliageDrift:['drift / parallax',0,1,.01],
    ambRole:{t:'select',label:'role (with A+B)',opts:{'dissolve A\u2192B':0,'standalone field':1}},
    // vignette
    vignAmount:['amount',0,1,.01], vignFeather:['feather',0,1,.01], vignAnimate:['animate (pulse)',0,1,.01], vignTexture:['edge texture',0,1,.01], vignShape:['shape (ellipse↔rect)',0,1,.01],
    // global grade (post-process on the matte)
    gradeBright:['brightness',-1,1,.01], gradeContrast:['contrast',-1,1,.01], gradeBlack:['black point',0,1,.01], gradeWhite:['white point',0,1,.01], gradeGamma:['gamma',.1,3,.01],
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
    gdIntensity:['intensity',0,1,.01], gdBeams:['beam count / thinness',0,1,.01], gdCloud:['break through cloud',0,1,.01], gdPulse:['pulse (in & out)',0,1,.01], gdSpeed:['animation speed',0.25,4,.05],
    texFit:{t:'select',label:'fit',opts:{'contain':1,'cover':2,'stretch':0}}, texAmount:['dissolve along texture',0,1,.01], texBg:['bg tint (image mode)',0,1,.01],
    sedSource:{t:'select',label:'banding by',opts:{'luminance':0,'saturation':1,'hue':2,'edge detail':3,'temperature':4}},
    sedDirection:{t:'select',label:'order',opts:{'dark first':0,'light first':1}},
    saltSource:{t:'select',label:'grains from',opts:{'random':0,'light areas':1,'dark areas':2,'colour':3,'edges':4}},
    saltImage:{t:'select',label:'sample image',opts:{'A':0,'B':1}},
    glazeDirection:{t:'select',label:'order',opts:{'darks first':0,'lights first':1}},
    migrationDir:{t:'select',label:'flow',opts:{'along edges':0,'perpendicular':1}},
    cellCols:['columns',1,16,1], cellRows:['rows',1,24,1], cellJitter:['jitter',0,1,.01],
    cellGlow:['glow (bulb fill)',0,1,.01], cellOrder:['order (seq\u2192random)',0,1,.01],
    cellCascade:['cascade (front-load)',0,1,.01], cellSnap:['ignite softness',0,1,.01], cellSpill:['spill (past edges)',0,1,.01],
    cellIgniteBy:{t:'select',label:'ignite by',opts:{'order':0,'warmth (A)':1,'brightness (A)':2,'saturation (A)':3,'analysed (A)':4}},
    cellAnalyseBy:{t:'select',label:'analyse by',opts:{'random':0,'warmth':1,'brightness':2}}, cellCoarseness:['merge (fewer parts →)',0,1,.01],
  };

  // modes grouped for the grid
  const MODES = [
    ['Reveal',[[0,'smooth'],[1,'pigment rim'],[7,'iris'],[15,'wet edge'],[53,'frost'],[63,'column swipe'],[64,'mirror expand'],[65,'door'],[68,'box reveal']]],
    ['Watercolor',[[2,'paper grain'],[3,'backrun blooms'],[4,'wet diffusion'],[5,'tonal sediment'],[6,'salt'],[8,'wet bleed'],[9,'pigment run'],[17,'tonal wash'],[24,'cauliflower bloom'],[25,'wet-stage'],[26,'migration']]],
    ['Painterly',[[16,'stroke-follow'],[22,'mold tendrils']]],
    ['Light & burn',[[27,'paper scorch'],[30,'light bloom'],[48,'radial burst'],[49,'smoke ring'],[66,'fog bloom'],[67,'fog sim']]],
    ['Ambient (loop)',[[33,'bokeh'],[34,'water ripples'],[35,'sun glare'],[36,'light streaks'],[38,'aurora'],[39,'godrays'],[50,'smoke / fog'],[52,'fog 2 (volumetric)'],[51,'fire / flames'],[41,'caustics'],[61,'caustics 2'],[42,'embers'],[46,'marble'],[47,'ink blooms'],[55,'ink in water'],[56,'sun flare + bokeh'],[54,'sun through trees'],[57,'water shimmer'],[59,'ink on paper'],[60,'nebula']]],
    ['Special',[[28,'video mask'],[32,'texture-source'],[31,'particles'],[37,'paint'],[62,'footage matte']]],
    ['Archive',[[10,'adv wet'],[11,'adv gravity'],[12,'adv curl'],[13,'adv brush'],[14,'adv seed'],[18,'edge underdraw'],[19,'painterly flow'],[20,'color dabs'],[21,'density grav'],[23,'formation'],[29,'lamp grid'],[58,'silk flow'],[44,'rain'],[45,'snow'],[40,'clouds'],[43,'mist']]],
  ];
  const MODE_NAME = {}; MODES.forEach(g=>g[1].forEach(([id,n])=>MODE_NAME[id]=n));
  // expose the gallery names so main.js can name exports/recordings by effect.
  window.__modeNames = MODE_NAME;

  // mode -> its own param keys
  const MK = {
    63:['swipeDir','swipeCols','swipeColW','swipeStagger','swipeSoft'],
    64:['mirrorDir','spread','organic','maskScale'],
    65:['mirrorDir','spread'],
    68:['rectW','rectH','rectReach','spread'],
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
    29:['cellCols','cellRows','cellIgniteBy','cellAnalyseBy','cellCoarseness','cellOrder','cellCascade','cellJitter','cellGlow','cellSnap','cellSpill'],
    30:['lightIntensity','lightSpread','lightPeakT','lightFlashWidth','lightColor'],
    32:['texFit','texAmount','texBg'],
    33:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // bokeh
    34:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // ripples
    35:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // glare
    36:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // streaks
    38:['auroraDensity','auroraHeight','auroraSpeed','auroraWave','auroraDark'],
    39:['gdIntensity','gdBeams','gdCloud','gdPulse','gdSpeed'],
    40:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // clouds
    41:['ambSize','ambSoft','ambSpeed','ambDetail'],                     // caustics (no count)
    42:['ambCount','ambSize','ambDetail'],                              // embers
    43:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // mist
    44:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // rain
    45:['ambCount','ambSize','ambSpeed'],                               // snow
    46:['ambSize','ambSoft','ambSpeed','ambDetail'],                     // marble
    47:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // ink blooms
    50:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // smoke / fog
    51:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // fire / flames
    52:['ambCount','ambSize','ambSoft','ambSpeed'],                      // fog 2 (volumetric)
    54:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // sun through trees
    55:['ambCount','ambSize','ambSoft','ambSpeed'],                      // ink in water
    56:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // sun flare + bokeh
    57:['ambSize','ambSoft','ambSpeed','ambDetail'],                     // water shimmer
    58:['ambSize','ambSoft','ambSpeed','ambDetail'],                     // silk flow
    59:['ambCount','ambSize','ambSoft','ambDetail'],                     // ink on paper
    60:['ambCount','ambSize','ambSoft','ambSpeed','ambDetail'],          // nebula
    61:['ambSize','ambSoft','ambSpeed','ambDetail'],                     // caustics 2 (voronoi net)
    62:['ambSoft','ambSize','ambCount','ambDetail'],                     // footage matte (key/glow/edge)
  };
  // per-mode label overrides: mode 29 reuses existing uniforms, relabelled.
  const MK_LABELS = { 62:{ambSoft:'key contrast', ambSize:'glow radius', ambCount:'glow strength', ambDetail:'edge detect'} };
  // per-mode Direction/source keys (only what each ambient field reads).
  const DIRK = {
    33:['driftAngle','driftAmount'], 36:['driftAngle','streakMove'],
    35:['sunX','sunY'], 39:['driftAmount','sunX','sunY'],
    40:['driftAngle'], 41:['driftAngle','driftAmount'], 61:['driftAngle','driftAmount'], 42:['driftAngle','driftAmount'],
    43:['driftAngle'], 44:['driftAngle'], 45:['driftAngle','driftAmount'], 46:['driftAngle','driftAmount'],
    50:['driftAngle','driftAmount'],
    52:['driftAngle','driftAmount','sunX','sunY'],   // wind + light intensity + light position
    54:['sunX','sunY','driftAngle'],                 // sun position + canopy sway wind
    56:['sunX','sunY','driftAngle'],                 // sun position + bokeh drift wind
  };
  // which Movement params each ambient mode actually reads (others are hidden).
  const AMB_MOVE = {50:['turbulence','flow','undulate'],51:['turbulence','flow','undulate'],
    60:['turbulence','flow','undulate'],54:['turbulence'],55:['turbulence'],56:['turbulence'],58:['turbulence']};

  // relevance of the global groups per mode
  const isTrans = m => (m<=32 && m!==31) || m===48 || m===49 || m===53 || m===66 || m===67; // reveal/movement/advanced apply
  const REL = {
    reveal: m=>isTrans(m), movement: m=>isTrans(m)||m===50||m===51||m===54||m===55||m===56||m===58||m===60, advanced: m=>isTrans(m),
    points: m=>(m<=32&&m!==31)||m===34, dir: m=>[33,35,36,39,40,41,42,43,44,45,46,47,50].includes(m), vign: ()=>true,
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
    // sentence-case for UI labels: capitalise the first letter only, preserving
    // meaningful internal capitals (A, B, acronyms). Keeps casing consistent.
    const cap=s=>(typeof s==='string'&&s.length)?s.charAt(0).toUpperCase()+s.slice(1):s;
    // favourites — starred modes, persisted, shown in a pinned group up top.
    const FAV_KEY='matte.favs';
    const loadFavs=()=>{ try{ return JSON.parse(localStorage.getItem(FAV_KEY)||'[]'); }catch(e){ return []; } };
    let favs=loadFavs();
    const isFav=id=>favs.includes(+id);
    function toggleFav(id){ id=+id; favs=isFav(id)?favs.filter(x=>x!==id):favs.concat(id);
      try{ localStorage.setItem(FAV_KEY,JSON.stringify(favs)); }catch(e){}
      left.querySelectorAll('.chip[data-mode="'+id+'"] .fav').forEach(s=>s.classList.toggle('on',isFav(id)));
      renderFavs(); }
    function makeChip(id,name){
      const c=document.createElement('button'); c.className='chip'; c.dataset.mode=id; c.dataset.name=(name||'').toLowerCase();
      c.style.setProperty('--c', MODE_COLOR[id] || 'var(--ui-accent)');   // group hue for the selected outline
      const tc=titleCase(name);
      c.title=tc; c.setAttribute('aria-label',tc); c.setAttribute('aria-pressed', String(+id===st.mode));
      c.innerHTML=`<span class="nm">${tc}</span><span class="fav${isFav(id)?' on':''}" role="button" aria-label="toggle favourite" title="favourite">★</span>`;
      c.style.backgroundImage=`url(thumbs/m${String(id).padStart(2,'0')}.png)`;
      c.onclick=()=>{E.setMode(id);selectMode(id);};
      c.querySelector('.fav').onclick=(e)=>{ e.stopPropagation(); toggleFav(id); };
      // hover preview: lazy-load a looping low-res clip over the static thumb if
      // one has been baked (previews/mNN.mp4). Missing/offline -> thumb stays.
      let pv=null, tried=false;
      c.addEventListener('mouseenter',()=>{
        if(pv){ pv.play().catch(()=>{}); return; }
        if(tried) return; tried=true;
        const v=document.createElement('video');
        v.className='chip-preview'; v.muted=true; v.loop=true; v.playsInline=true; v.preload='metadata';
        v.src=`previews/m${String(id).padStart(2,'0')}.mp4`;
        v.addEventListener('error',()=>v.remove());
        v.addEventListener('loadeddata',()=>{ pv=v; if(c.matches(':hover')) v.play().catch(()=>{}); });
        c.appendChild(v);
      });
      c.addEventListener('mouseleave',()=>{ if(pv) pv.pause(); });
      return c;
    }
    // (search removed — curate with the ★ Favourites group instead)
    // Favourites group: pinned starred modes (above Recent).
    const favG=document.createElement('div'); favG.className='mgroup mgroup-fav'; favG.innerHTML='<h2>Favourites</h2>';
    { const fh=favG.querySelector('h2'); fh.style.color='var(--hue-amber)';
      fh.style.background=`color-mix(in srgb, var(--hue-amber) 16%, color-mix(in srgb, #fff 7%, var(--ui-glass)))`; }
    const favBody=document.createElement('div'); favBody.className='recent-chips'; favG.appendChild(favBody); left.appendChild(favG);
    function renderFavs(){
      favBody.innerHTML='';
      const valid=favs.filter(id=>MODE_NAME[id]!=null);
      if(!valid.length){ favG.style.display='none'; return; }
      favG.style.display='';
      valid.forEach(id=>{ const c=makeChip(id, MODE_NAME[id]); c.classList.toggle('sel',+id===st.mode); favBody.appendChild(c); });
    }
    // Recent group: the most recently EXPORTED modes, newest first. Filled from
    // localStorage 'matte.exports' (written by main.js on each export).
    const recentG=document.createElement('div'); recentG.className='mgroup mgroup-recent'; recentG.innerHTML='<h2>Recent</h2>';
    { const rh=recentG.querySelector('h2'); rh.style.color=RECENT_COLOR;
      rh.style.background=`color-mix(in srgb, ${RECENT_COLOR} 16%, color-mix(in srgb, #fff 7%, var(--ui-glass)))`; }
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
    renderRecent(); renderFavs();
    window.addEventListener('matte-export', renderRecent);
    MODES.forEach(([gname,items],gi)=>{
      const g=document.createElement('div'); g.className='mgroup'+(gname==='Archive'?' mgroup-archive':''); g.innerHTML=`<h2>${gname}</h2>`;
      const h4=g.querySelector('h2'); const gc=GROUP_COLORS[gi]||'var(--ui-text)';
      h4.style.color=gc;
      h4.style.borderBottomColor=`color-mix(in srgb, ${gc} 33%, transparent)`;
      h4.style.background=`color-mix(in srgb, ${gc} 16%, color-mix(in srgb, #fff 7%, var(--ui-glass)))`;
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
      <div class="uigroup">
        <h2>Output</h2>
        <div class="grp"><select id="ui-size" aria-label="output resolution preset"></select></div>
        <label class="barchk wide" title="lock output to the source image aspect ratio (keeps the chosen resolution)"><input type="checkbox" id="ui-matchin">Match source aspect</label>
        <div class="grp" id="ui-wh"><label for="ui-w">size</label><input type="number" id="ui-w" min="2" aria-label="output width in pixels" title="output width (px)"><span class="unit">×</span><input type="number" id="ui-h" min="2" aria-label="output height in pixels" title="output height (px)"></div>
        <label class="barchk wide" title="lock the width:height ratio while typing"><input type="checkbox" id="ui-lockar">Lock aspect ratio</label>
        <div class="grp" id="ui-padgrp" title="black padding (full output pixels) on each side; the effect fills the content rectangle that remains — for projecting onto part of a surface (e.g. just the floor) while exporting the full surface dimensions"><label>pad T·B</label><input type="number" id="ui-padtop" min="0" step="1" title="padding TOP (px)" aria-label="padding top in pixels"><input type="number" id="ui-padbot" min="0" step="1" title="padding BOTTOM (px)" aria-label="padding bottom in pixels"><span class="unit">px</span></div>
        <div class="grp" id="ui-padgrp2" title="left / right black padding (full output pixels)"><label>pad L·R</label><input type="number" id="ui-padleft" min="0" step="1" title="padding LEFT (px)" aria-label="padding left in pixels"><input type="number" id="ui-padright" min="0" step="1" title="padding RIGHT (px)" aria-label="padding right in pixels"><span class="unit">px</span></div>
        <div class="grp"><label for="ui-dur">dur</label><input type="number" id="ui-dur" min="1" max="60" step="1" aria-label="duration in seconds"><span class="unit">s</span></div>
        <div class="grp"><label for="ui-fps">fps</label><select id="ui-fps" aria-label="output frame rate"></select></div>
        <div class="sep"></div>
        <div class="grp" id="proj-grp"><label for="ui-proj">project</label><input type="text" id="ui-proj" placeholder="none" maxlength="24" aria-label="project name (filename prefix)" title="prefixed to export filenames, e.g. DML → DML_…"></div>
        <div class="grp"><span id="recwrap"><button class="btn rec" id="ui-rec">● Record</button><span id="recbar"></span></span></div>
        <div class="grp"><button class="btn" id="ui-folder" title="choose a folder to save recordings into">Folder: default</button></div>
        <div class="grp"><button class="btn sm" id="ui-bake" title="record a short looping clip of every mode (saved to your folder as mNN.mp4) for the hover-previews. Pick a folder first.">Bake previews…</button></div>
      </div>
      <div class="uigroup">
        <h2>Playback</h2>
        <div class="grp transport"><button class="btn ico" id="ui-play" title="play / pause">▶</button><button class="btn ico" id="ui-restart" title="restart from 0">⏮</button><button class="btn ico" id="ui-loop" title="loop playback">↻</button></div>
        <div class="grp" id="scrub-grp"><input type="range" id="ui-scrub" min="0" max="1" step="0.001" value="0" aria-label="scrub transition progress" title="scrub the transition (progress)"><span class="val" id="ui-scrub-val">0.00</span></div>
      </div>
      <div class="uigroup" id="ui-view">
        <h2>View</h2>
        <div class="ptsbar split">
          <button class="btn" id="ui-preview" title="show B/W matte or the colour result on A/B">Preview: Matte</button>
          <button class="btn" id="ui-inv" title="invert the matte (white↔black)">Invert matte</button>
        </div>
        <button class="btn" id="ui-colourise" title="colourise the matte preview with a gradient image (dark→light maps across it). Preview only — the recorded matte stays black-and-white.">Colourise…</button>
        <button class="btn usesrc-btn" id="ui-usesrc" title="use the A/B images for the transition (off = pure matte)">Use source images</button>
      </div>
      <div class="uigroup" id="ui-origin"><h2>Origin</h2><div id="origin-body"></div></div>
      <div class="uigroup" id="ui-vignette"><h2>Vignette</h2><div id="vign-body"></div></div>
      <div class="uigroup" id="ui-grade"><h2>Grade</h2><div id="grade-body"></div></div>`;
    document.body.appendChild(bar);
    // Origin / Vignette / Grade are GLOBAL (shared across every mode). Relocate
    // them out of the controls rail to the TOP of the mode rail, above the
    // gallery — built in `bar` above, then moved here so their body-query refs
    // stay valid. They remain foldable (wired below).
    const globalsHost=document.createElement('div'); globalsHost.id='ui-globals';
    ['#ui-origin','#ui-vignette','#ui-grade'].forEach(s=>{ const el=bar.querySelector(s); if(el) globalsHost.appendChild(el); });
    left.insertBefore(globalsHost, left.firstChild);
    const originGroup=document.querySelector('#ui-origin'), originBody=document.querySelector('#origin-body');
    const vignBody=document.querySelector('#vign-body');

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
    document.addEventListener('click',(e)=>{ if(popOpen && !pop.contains(e.target)) closePop(); });

    // SOURCES: relocate the live #side DOM (slot bar + library) inline into the
    // View group (no separate sidebar) — they flow below the View controls.
    // Moving (not rebuilding) the nodes keeps main.js's existing listeners intact.
    // Appended BEFORE the fold pass so they get wrapped into View's fold-body.
    const srcHost=document.createElement('div'); srcHost.id='src-host';
    ['slot-bar','library-section'].forEach(id=>{ const el=document.getElementById(id); if(el) srcHost.appendChild(el); });
    bar.querySelector('#ui-view').appendChild(srcHost);
    // 'use sources' toggle (engine on/off)
    { const u=bar.querySelector('#ui-usesrc');
      const syncUse=()=>{ const on=E.useSources; u.classList.toggle('on',on); u.textContent = on ? 'Using source images' : 'Use source images'; };
      u.onclick=()=>{ E.setUseSources(!E.useSources); syncUse(); }; syncUse(); }

    // ── fold / unfold groups (controls rail + mode column), persisted ──
    // Defaults (first visit / no saved state): mode column + Export/View start
    // collapsed; Output and Playback stay open. Key is versioned so the new
    // defaults apply once even for users with older saved fold state.
    const FOLD_KEY='matte.folded.v6';
    let folded;
    { const stored=localStorage.getItem(FOLD_KEY);
      if(stored!=null){ try{ folded=new Set(JSON.parse(stored)); }catch(e){ folded=null; } }
      if(!folded){ folded=new Set(['ctrl:View','ctrl:Origin','ctrl:Vignette','ctrl:Grade','mode:Recent']); MODES.forEach(([g])=>folded.add('mode:'+g)); } }
    const saveFold=()=>{ try{ localStorage.setItem(FOLD_KEY,JSON.stringify([...folded])); }catch(e){} };
    function makeFoldable(group,head,key,onToggle){
      const body=document.createElement('div'); body.className='fold-body';
      while(head.nextSibling) body.appendChild(head.nextSibling);
      group.appendChild(body); head.classList.add('fold-head');
      if(folded.has(key)) group.classList.add('folded');
      head.addEventListener('click',()=>{ const f=group.classList.toggle('folded'); if(f)folded.add(key); else folded.delete(key); if(onToggle)onToggle(f); saveFold(); });
    }
    [...bar.querySelectorAll('.uigroup'), ...globalsHost.querySelectorAll('.uigroup')].forEach(g=>{ const h=g.querySelector('h2'); if(h) makeFoldable(g,h,'ctrl:'+h.textContent.trim()); });
    // Mode column = strict accordion: opening any group (Favourites/Recent
    // included) folds every other, so only one is ever open.
    const modeGroups=[...left.querySelectorAll('.mgroup')];
    modeGroups.forEach(g=>{
      const h=g.querySelector('h2'); if(!h) return;
      makeFoldable(g,h,'mode:'+h.textContent.trim(), (isFolded)=>{
        if(isFolded) return;  // only collapse peers when THIS group just opened
        modeGroups.forEach(o=>{ if(o!==g && !o.classList.contains('folded')){
          o.classList.add('folded'); folded.add('mode:'+o.querySelector('h2').textContent.trim()); }});
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
    // BAKE PREVIEWS — record a short clip of every mode into the chosen folder.
    { const bk=bar.querySelector('#ui-bake'); const idle=bk.textContent;
      bk.onclick=async()=>{
        if(!E.bakePreviews){ return; }
        const hasFolder = E.folderName && E.folderName!=='browser default';
        if(!hasFolder){
          if(!E.hasFolderAPI){ alert('Pick a folder isn’t supported here — the 64 clips would download individually.'); }
          else { alert('Pick an output folder first (Folder button), so the clips save there instead of 64 downloads.'); return; }
        }
        if(!confirm('Bake hover-preview clips for every mode? This records ~64 short clips and takes a couple of minutes.')) return;
        bk.disabled=true;
        try{ await E.bakePreviews({ onProgress:(i,n)=>{ bk.textContent='Baking '+i+'/'+n+'…'; } });
          bk.textContent='Done ✓ — move mNN.mp4 → previews/'; }
        catch(e){ bk.textContent='Bake failed (see console)'; console.error(e); }
        setTimeout(()=>{ bk.textContent=idle; bk.disabled=false; }, 6000);
      };
    }
    // show/hide all rails (pure-effect view). H or Tab toggles; a small always-
    // visible handle (top-right) makes it reversible even when everything is hidden.
    const uiToggle=document.createElement('button'); uiToggle.id='ui-hide'; uiToggle.title='show / hide panels (H)'; uiToggle.textContent='⊙';
    document.body.appendChild(uiToggle);
    // 3-state cycle: 0 full UI · 1 selected mode's settings only · 2 nothing
    let uiState=0;
    const applyUI=()=>{
      document.body.classList.toggle('ui-right-only', uiState===1);
      document.body.classList.toggle('ui-hidden', uiState===2);
      uiToggle.classList.toggle('on', uiState!==0);
      uiToggle.title = uiState===0 ? 'hide the left panel + fit the canvas beside the right rails (H)'
                     : uiState===1 ? 'hide all panels (H)'
                     : 'show all panels (H)';
    };
    const cycleUI=()=>{ uiState=(uiState+1)%3; applyUI(); };
    uiToggle.onclick=cycleUI;
    window.addEventListener('keydown',e=>{ const t=e.target.tagName; if(t==='INPUT'||t==='SELECT'||t==='TEXTAREA') return; if(e.key==='Tab'||e.key==='h'||e.key==='H'){ e.preventDefault(); cycleUI(); }});

    // ── output size ──
    const SIZES=[['ELVERKET ALL · 8000×4373',[8000,4373]],['ELVERKET Panorama · 8000×3411',[8000,3411]],
      ['ELVERKET Floor · 8160×2719',[8160,2719]],['ELVERKET Long wall · 8160×1920',[8160,1920]],
      ['ELVERKET Short wall · 2719×1920',[2719,1920]],['8K · 7680×4320',[7680,4320]],['6K · 5760×3240',[5760,3240]],
      ['4K · 3840×2160',[3840,2160]],['1440p · 2560×1440',[2560,1440]],['1080p · 1920×1080',[1920,1080]],
      ['720p · 1280×720',[1280,720]],['Square · 1080×1080',[1080,1080]],['Vertical · 1080×1920',[1080,1920]],['custom…','custom']];
    const selSize=bar.querySelector('#ui-size');
    SIZES.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s[0];selSize.appendChild(o);});
    const whBox=bar.querySelector('#ui-wh'), wIn=bar.querySelector('#ui-w'), hIn=bar.querySelector('#ui-h');
    // surface the GPU max-texture clamp so big exports (e.g. a 12000px panorama)
    // aren't silently downscaled without notice.
    const MAXTEX=(window.__tool&&window.__tool.device)?window.__tool.device.limits.maxTextureDimension2D:16384;
    const sizeWarn=document.createElement('div'); sizeWarn.className='hint sec-note'; sizeWarn.style.cssText='display:none;color:var(--ui-rec)';
    whBox.insertAdjacentElement('afterend', sizeWarn);
    function syncSizeUI(){
      const idx=SIZES.findIndex(s=>Array.isArray(s[1])&&s[1][0]===st.outW&&s[1][1]===st.outH);
      selSize.value=idx>=0?idx:(SIZES.length-1);
      // don't clobber a field the user is mid-typing in (the 1.5s poll would
      // otherwise reset their input every tick — can't type a multi-digit value)
      const ae=document.activeElement;
      if(ae!==wIn) wIn.value=Math.round(st.outW);
      if(ae!==hIn) hIn.value=Math.round(st.outH);
      const longest=Math.max(st.outW,st.outH);
      if(longest>MAXTEX){ const sc=MAXTEX/longest;
        sizeWarn.textContent=`⚠ exceeds GPU limit (${MAXTEX}px) — renders at ${Math.round(st.outW*sc)}×${Math.round(st.outH*sc)}`;
        sizeWarn.style.display=''; } else sizeWarn.style.display='none';
    }
    const matchCb=bar.querySelector('#ui-matchin');
    if(matchCb){ matchCb.checked=E.matchInput; matchCb.onchange=()=>{ E.setMatchInput(matchCb.checked); syncSizeUI(); }; }
    selSize.onchange=()=>{const s=SIZES[+selSize.value]; if(s[1]==='custom'){wIn.focus();return;} E.setSize(s[1][0],s[1][1]); syncSizeUI();};
    const lockCb=bar.querySelector('#ui-lockar');
    if(lockCb){ lockCb.checked=!!st.lockAspect; lockCb.onchange=()=>{ st.lockAspect=lockCb.checked; if(E.save)E.save(); }; }
    wIn.onchange=()=>{ let w=Math.max(2,+wIn.value), h=Math.max(2,+hIn.value); if(st.lockAspect&&st.outH){ h=Math.max(2,Math.round(w*st.outH/st.outW)); } E.setSize(w,h); syncSizeUI(); };
    hIn.onchange=()=>{ let w=Math.max(2,+wIn.value), h=Math.max(2,+hIn.value); if(st.lockAspect&&st.outW){ w=Math.max(2,Math.round(h*st.outW/st.outH)); } E.setSize(w,h); syncSizeUI(); };
    // surface padding in output pixels — independent per side.
    const padEls={padTopPx:'#ui-padtop',padBottomPx:'#ui-padbot',padLeftPx:'#ui-padleft',padRightPx:'#ui-padright'};
    for(const [key,sel] of Object.entries(padEls)){
      const el=bar.querySelector(sel); if(!el) continue;
      el.value=st[key]||0;
      el.onchange=()=>{ st[key]=Math.max(0,Math.round(+el.value||0)); el.value=st[key]; if(E.save)E.save(); };
    }

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
    const inv=bar.querySelector('#ui-inv');
    const syncInv=()=>{ inv.classList.toggle('on', !!st.matteInvert); };
    inv.onclick=()=>{ st.matteInvert=!st.matteInvert; syncInv(); if(E.save)E.save(); };
    syncInv();
    const prev=bar.querySelector('#ui-preview');
    const syncPrev=()=>{ const on=E.matteOutput!==false; prev.textContent='Preview: '+(on?'Matte':'Colour'); prev.classList.toggle('on',!on); };
    prev.onclick=()=>{ E.setMatte(E.matteOutput===false); syncPrev(); };
    syncPrev();
    // colourise (gradient-map the matte preview) — load a gradient image, click again to clear
    { const cbtn=bar.querySelector('#ui-colourise');
      const fin=document.createElement('input'); fin.type='file'; fin.accept='image/*'; fin.style.display='none'; document.body.appendChild(fin);
      const sync=()=>{ const on=E.colourise; cbtn.classList.toggle('on',on); cbtn.textContent = on ? 'Colourise ✓ (clear)' : 'Colourise…'; };
      cbtn.onclick=()=>{ if(E.colourise){ E.clearColourise(); sync(); } else { fin.click(); } };
      fin.onchange=()=>{ const f=fin.files&&fin.files[0]; if(f){ E.loadColourise(f).then(sync); } fin.value=''; };
      sync(); }

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
    // editable numeric readout: click + type a value (no spinner arrows); commits
    // on Enter/blur, clamped to [mn,mx] and snapped to the step.
    function makeVal(mn,mx,stp,dec,onset){
      const v=document.createElement('input');
      v.type='text'; v.className='val'; v.inputMode='decimal'; v.setAttribute('aria-label','value');
      const fmt=x=>(+x).toFixed(dec);
      v.set=x=>{ v.value=fmt(x); };
      const commit=()=>{ let n=parseFloat(v.value); if(isNaN(n)){ return; }
        n=Math.min(mx,Math.max(mn,n)); if(stp){ n=+( Math.round(n/stp)*stp ).toFixed(6); }
        v.value=fmt(n); onset(n); };
      v.addEventListener('change',commit);
      v.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); v.blur(); } });
      v.addEventListener('focus',()=>{ try{ v.select(); }catch(e){} });
      return v;
    }
    function widget(key, ov){
      const spec=P[key]; if(!spec) return null;
      const row=document.createElement('div'); row.className='row';
      // Right-click any control -> reset that one parameter to its default. The
      // engine owns the default lookup (per-mode > ambient > base); each branch
      // wires a `reset` callback to push the value back into its own control UI.
      const onReset=(apply)=>{ row.title='Right-click to reset to default';
        row.addEventListener('contextmenu',(e)=>{ e.preventDefault();
          const d=E.resetParam?E.resetParam(key):undefined; if(d!==undefined) apply(d); }); };
      if(spec.t==='check'){ row.classList.add('check');
        row.innerHTML=`<label><input type="checkbox"> ${cap(ov||spec.label)}</label>`;
        const cb=row.querySelector('input'); cb.checked=!!st[key]; cb.onchange=()=>{st[key]=cb.checked;};
        onReset(d=>{ cb.checked=!!d; }); return row;
      }
      if(spec.t==='color'){
        row.innerHTML=`<span class="lab">${cap(ov||spec.label)}</span><input type="color" aria-label="${spec.label}">`;
        const ci=row.querySelector('input'); ci.value=st[key]||'#ffffff'; ci.oninput=()=>{st[key]=ci.value;};
        onReset(d=>{ ci.value=d||'#ffffff'; }); return row;
      }
      if(spec.t==='select'){
        row.innerHTML=`<span class="lab">${cap(ov||spec.label)}</span><select aria-label="${spec.label}"></select>`;
        const se=row.querySelector('select');
        Object.entries(spec.opts).forEach(([l,v])=>{const o=document.createElement('option');o.value=v;o.textContent=cap(l);se.appendChild(o);});
        se.value=st[key]; se.onchange=()=>{st[key]=isNaN(+se.value)?se.value:+se.value;};
        onReset(d=>{ se.value=d; }); return row;
      }
      const [label,mn,mx,stp]=spec; const dec=(stp+'').includes('.')?(stp+'').split('.')[1].length:0;
      row.innerHTML=`<span class="lab">${cap(ov||label)}</span><input type="range" min="${mn}" max="${mx}" step="${stp}" aria-label="${label}">`;
      const r=row.querySelector('input[type=range]');
      const v=makeVal(mn,mx,stp,dec,(n)=>{ st[key]=n; r.value=n; }); v.set(st[key]); row.appendChild(v);
      r.value=st[key];
      r.oninput=()=>{ st[key]=+r.value; v.set(r.value); };
      onReset(d=>{ r.value=d; v.set(d); }); return row;
    }
    function section(title,keys,dim,labels){
      const s=document.createElement('div'); s.className='psec'+(dim?' dim':''); s.innerHTML=`<h2>${cap(title)}</h2>`;
      keys.forEach(k=>{const w=widget(k, labels&&labels[k]); if(w)s.appendChild(w);}); return s;
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
                : (m===31) ? []
                : ((m>=33 && m<=47) || (m>=50 && m<=60 && m!==53)) ? ['points']
                : (m<=32 || m>=48) ? ['auto','points','paint'] : [];
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
        st2.textContent = n? (n+' point'+(n>1?'s':'')+' placed (max 16)') : 'Click the canvas to add points (max 16).';
        pb.appendChild(st2);
        originBody.appendChild(pb);
        ['pointSize','pointPop','pointStagger','pointRandom','pointFill'].forEach(k=>{ const w=widget(k); if(w) originBody.appendChild(w); });
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
    // Randomise a mode's LOOK params within their declared ranges (self-contained,
    // reads the P spec — no dependency on the legacy pane).
    function moveKeysFor(m){ return (!isTrans(m) && AMB_MOVE[m]) ? AMB_MOVE[m] : (REL.movement(m)?['turbulence','flow','undulate','animate']:[]); }
    function randomizeLook(m){
      const keys=new Set(MK[m]||[]);
      (DIRK[m]||[]).forEach(k=>keys.add(k));
      moveKeysFor(m).forEach(k=>keys.add(k));
      if(REL.reveal(m)) keys.add('spread');
      if(REL.advanced(m)){ keys.add('organic'); keys.add('edges'); }
      keys.forEach(k=>{ const spec=P[k]; if(!spec) return;
        if(Array.isArray(spec)){ const stp=spec[3]||0.001; const v=spec[1]+Math.random()*(spec[2]-spec[1]); st[k]=Math.round(v/stp)*stp; }
        else if(spec.t==='select'){ const vals=Object.values(spec.opts); st[k]=vals[Math.floor(Math.random()*vals.length)]; }
        else if(spec.t==='check'){ st[k]=Math.random()<0.5; }
      });
      st.seed=Math.floor(Math.random()*999);
      if(E.restartPlayback)E.restartPlayback(); if(E.save)E.save();
    }
    // global grade on the matte (levels + brightness/contrast).
    const gradeBody=document.querySelector('#grade-body');
    function buildGrade(){
      if(!gradeBody) return; gradeBody.innerHTML='';
      ['gradeBlack','gradeWhite','gradeGamma','gradeBright','gradeContrast'].forEach(k=>{ const w=widget(k); if(w) gradeBody.appendChild(w); });
      const gb=document.createElement('div'); gb.className='ptsbar split';
      const gr=document.createElement('button'); gr.className='btn sm'; gr.textContent='↺ reset grade';
      gr.onclick=()=>{ st.gradeBright=0; st.gradeContrast=0; st.gradeBlack=0; st.gradeWhite=1; st.gradeGamma=1; if(E.save)E.save(); buildGrade(); };
      gb.appendChild(gr); gradeBody.appendChild(gb);
    }

    function buildParams(m){
      paramsEl.innerHTML='';
      {
        const fb=document.createElement('div'); fb.className='ptsbar split params-tools';
        const rs=document.createElement('button'); rs.className='btn sm'; rs.textContent='↺ reset mode';
        rs.onclick=()=>{ E.resetMode(m); buildParams(m); };
        const rnd=document.createElement('button'); rnd.className='btn sm'; rnd.textContent='randomize';
        rnd.onclick=()=>{ randomizeLook(m); buildParams(m); };
        fb.appendChild(rs); fb.appendChild(rnd); paramsEl.appendChild(fb);
      }
      // ── presets: save / recall a whole look (mode + all tuned params) ──
      if(E.presetOptions){
        const ps=document.createElement('div'); ps.className='psec'; ps.innerHTML='<h2>Preset</h2>';
        const lr=document.createElement('div'); lr.className='row';
        const sel=document.createElement('select'); sel.setAttribute('aria-label','load preset');
        sel.innerHTML='<option value="">—</option>';
        E.presetOptions().forEach(o=>{ const op=document.createElement('option'); op.value=o.id; op.textContent=o.label; sel.appendChild(op); });
        sel.onchange=()=>{ if(!sel.value) return; E.applyPreset(sel.value); if(E.restartPlayback)E.restartPlayback(); if(E.save)E.save(); selectMode(E.state.mode); };
        lr.appendChild(sel); ps.appendChild(lr);
        const sr=document.createElement('div'); sr.className='ptsbar split';
        const sv=document.createElement('button'); sv.className='btn sm'; sv.textContent='save';
        sv.onclick=()=>{ const n=(prompt('Preset name:')||'').trim(); if(n&&E.savePreset(n)) buildParams(m); };
        const del=document.createElement('button'); del.className='btn sm'; del.textContent='delete';
        del.title='delete the selected user preset';
        del.onclick=()=>{ if(sel.value&&sel.value.startsWith('user:')&&E.deletePreset(sel.value)) buildParams(m); };
        sr.appendChild(sv); sr.appendChild(del); ps.appendChild(sr);
        paramsEl.appendChild(ps);
      }
      // Single scrolling panel (no tabs): Origin + Vignette live in the controls
      // rail, so all that's left here is the mode's own params + Advanced.
      const _amb = ((m>=33 && m<=47) || (m>=50 && m<=60 && m!==53) || m===48 || m===49) && m!==37;
      if(_amb){
        const rs=section('Mode role',[],false);
        const rbar=document.createElement('div'); rbar.className='ptsbar split';
        const mkR=(label,val)=>{ const b=document.createElement('button'); b.className='btn sm'; b.textContent=cap(label);
          b.classList.toggle('on',(E.state.ambRole||0)==val);
          b.onclick=()=>{ E.state.ambRole=val; E.save(); if(E.restartPlayback)E.restartPlayback(); buildParams(m); };
          return b; };
        rbar.appendChild(mkR('reveal',0)); rbar.appendChild(mkR('loop',1));
        rs.appendChild(rbar);
        paramsEl.appendChild(rs);
      }
      if(MK[m]) paramsEl.appendChild(section('this mode',MK[m],false,MK_LABELS[m]));
      // column swipe (63): per-column widths in PIXELS (one slider per column,
      // live with the count + direction; 0 in state = auto equal share).
      if(m===63){
        if(!Array.isArray(st.swipeColWidths)) st.swipeColWidths=Array(16).fill(0);
        const nCols=Math.max(1,Math.min(16,Math.round(st.swipeCols)));
        const axis=Math.round((st.swipeDir<2 ? st.outW : st.outH)||1920);
        const eq=Math.max(1,Math.round(axis/nCols));
        const cs=document.createElement('div'); cs.className='psec'; cs.innerHTML='<h2>Column widths (px)</h2>';
        for(let i=0;i<nCols;i++){
          const row=document.createElement('div'); row.className='row';
          row.innerHTML=`<span class="lab">col ${i+1}</span><input type="range" min="4" max="${axis}" step="1" aria-label="column ${i+1} px">`;
          const r=row.querySelector('input[type=range]'); const idx=i;
          const cur=(st.swipeColWidths[idx]>0)?st.swipeColWidths[idx]:eq;
          const v=makeVal(4,axis,1,0,(n)=>{ st.swipeColWidths[idx]=n; r.value=n; }); v.set(cur); row.appendChild(v);
          r.value=cur;
          r.oninput=()=>{ st.swipeColWidths[idx]=+r.value; v.set(r.value); };
          cs.appendChild(row);
        }
        const eb=document.createElement('div'); eb.className='ptsbar split';
        const er=document.createElement('button'); er.className='btn sm'; er.textContent='↺ equal';
        er.onclick=()=>{ for(let i=0;i<16;i++) st.swipeColWidths[i]=0; buildParams(m); };
        eb.appendChild(er); cs.appendChild(eb); paramsEl.appendChild(cs);
        // rebuild the px sliders live when the column count or direction changes
        const ci=paramsEl.querySelector('input[aria-label="columns"]');
        if(ci) ci.addEventListener('change',()=>buildParams(m));
        const di=paramsEl.querySelector('select[aria-label="direction"]');
        if(di) di.addEventListener('change',()=>buildParams(m));
      }
      // footage-driven modes share one T-slot clip as a spatial mask.
      const FOOT={ 39:['Footage occluder','load clip…'],
                   54:['Foliage','load foliage clip…'],
                   62:['Footage source','load footage…'] };
      if(FOOT[m] && E.loadFoliageVideo){
        const fs=document.createElement('div'); fs.className='psec'; fs.innerHTML=`<h2>${FOOT[m][0]}</h2>`;
        const has=E.hasFoliageVideo&&E.hasFoliageVideo();
        if(has && (m===39||m===54)){ const dw=widget('foliageDrift'); if(dw) fs.appendChild(dw); }  // sway/parallax
        const fb=document.createElement('div'); fb.className='ptsbar split';
        const ld=document.createElement('button'); ld.className='btn sm'; ld.textContent=has?'replace clip…':FOOT[m][1];
        ld.onclick=()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='video/*';
          inp.onchange=()=>{ if(inp.files&&inp.files[0]){ E.loadFoliageVideo(inp.files[0]); if(E.restartPlayback)E.restartPlayback(); setTimeout(()=>buildParams(m),100); } }; inp.click(); };
        fb.appendChild(ld);
        if(has){ const cl=document.createElement('button'); cl.className='btn sm'; cl.textContent='clear';
          cl.onclick=()=>{ E.clearFoliageVideo(); buildParams(m); }; fb.appendChild(cl); }
        fs.appendChild(fb); paramsEl.appendChild(fs);
      }
      if(m===29){
        const ab=document.createElement('div'); ab.className='ptsbar split';
        const an=document.createElement('button'); an.className='btn sm';
        an.textContent='⚡ Analyse A → regions';
        an.title='segment image A into colour regions and light them in sequence (set ignite by → analysed)';
        an.onclick=()=>{ const by=['random','warmth','brightness'][E.state.cellAnalyseBy||0];
          const n=E.analyseCells(by);
          if(n){ E.state.cellIgniteBy=4; if(E.restartPlayback)E.restartPlayback(); buildParams(m); }
          else { alert('Load an image into slot A first (View → Source Images), then Analyse.'); } };
        ab.appendChild(an); paramsEl.appendChild(ab);
        const h=document.createElement('div'); h.className='hint sec-note';
        h.textContent='Set ignite by → analysed (A) to light the detected regions. Re-run Analyse after changing A or the analyse order.';
        paramsEl.appendChild(h);
      }

      if(m===67){
        const h=document.createElement('div'); h.className='hint sec-note';
        h.textContent='Press ▶ play — this is a LIVE fluid sim: density is emitted at the centre and pours/rolls outward, building up over the clip. Scrubbing jumps are approximate; let it run (or record) to see the real result.';
        paramsEl.appendChild(h);
      }
      const revLabels = m===67 ? {spread:'persistence'} : null;
      paramsEl.appendChild(section('Reveal',['spread'],!REL.reveal(m),revLabels));
      // ambient modes repurpose the movement params and relabel them in context —
      // only the keys a mode actually reads are shown (others would be dead sliders).
      const moveLabels = m===50 ? {turbulence:'billow',flow:'drift speed',undulate:'sway'}
        : m===51 ? {turbulence:'curl',flow:'rise / reach',undulate:'sway'}
        : m===55 ? {turbulence:'swirl'}
        : m===58 ? {turbulence:'flow / curl'}
        : m===56 ? {turbulence:'dapple / foliage'}
        : m===60 ? {turbulence:'swirl',flow:'star glow',undulate:'dust lanes'}
        : m===66 ? {turbulence:'billow / fray',flow:'pour speed',undulate:'rise'}
        : m===67 ? {turbulence:'vortex strength',flow:'pour speed',undulate:'rise'}
        : m===54 ? {turbulence:'canopy density'} : null;
      // per-mode movement keys: full set for transitions; only the used ones for
      // ambient modes (the rest are dead for those generators). Fog bloom/sim (66/67)
      // read turbulence + flow + undulate (relabelled "rise").
      const moveKeys = (!isTrans(m) && AMB_MOVE[m]) ? AMB_MOVE[m]
        : (m===66 || m===67) ? ['turbulence','flow','undulate']
        : ['turbulence','flow','undulate','animate'];
      paramsEl.appendChild(section('Movement',moveKeys,!REL.movement(m),moveLabels));
      { const dk = DIRK[m] || (REL.dir(m) ? ['driftAngle','driftAmount','sunX','sunY','streakMove'] : []);
        const dirLabels = m===50 ? {driftAngle:'comes from',driftAmount:'fog ↔ plume'}
          : m===52 ? {driftAngle:'wind',driftAmount:'light',sunX:'light x',sunY:'light y'} : null;
        if (dk.length) paramsEl.appendChild(section('Direction / source', dk, false, dirLabels)); }
      const adv = (m===66) ? { keys:['originX','originY','maskScale','organic','edges','seed'],
            labels:{originX:'centre x',originY:'centre y',maskScale:'fog scale',organic:'density',edges:'edge feather'} }
        : (m===67) ? { keys:['originX','originY','maskScale','organic','edges','seed'],
            labels:{originX:'emitter x',originY:'emitter y',maskScale:'detail scale',organic:'density',edges:'emitter size'} }
        : { keys:['originX','originY','maskScale','curve','seed','maskShift','organic','edges'], labels:null };
      paramsEl.appendChild(section('Advanced',adv.keys,!REL.advanced(m),adv.labels));
    }
    function selectMode(id){
      left.querySelectorAll('.chip').forEach(c=>{ const on=+c.dataset.mode===id; c.classList.toggle('sel',on); c.setAttribute('aria-pressed',String(on)); });
      // tint the whole settings panel with the mode's group accent (MODE_COLOR is
      // the single source — correct even for duplicated chips in the Recent group)
      right.style.setProperty('--m', MODE_COLOR[id] || 'var(--ui-text)');
      headEl.textContent=(MODE_NAME[id]||('mode '+id)).replace(/(^|[\s-])\w/g,ch=>ch.toUpperCase()); buildParams(id); buildOrigin(id);
    }

    buildVignette(); buildGrade(); syncSizeUI(); selectMode(st.mode);
    setInterval(syncSizeUI, 1500);
  }
})();
