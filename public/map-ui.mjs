/** Fullscreen changes layout only: it never starts/stops GPS or changes a route. */
export function createMapUI({getMap}) {
  const $=id=>document.getElementById(id);
  const fullscreen=$('map-fullscreen'),options=$('map-options'),panel=$('map-options-panel');
  let expanded=false,wanted=false,lastNativeExit=0;
  function resize(){requestAnimationFrame(()=>requestAnimationFrame(()=>getMap()?.invalidateSize({pan:false})));}
  function closeOptions(){panel.hidden=true;options.setAttribute('aria-expanded','false');}
  function apply(value){
    expanded=value;document.body.classList.toggle('map-fullscreen',value);
    fullscreen.setAttribute('aria-pressed',String(value));fullscreen.querySelector('span').textContent=value?'Exit full screen':'Full screen';
    fullscreen.title=value?'Exit full screen':'Open map in full screen';resize();
    if(!value)delete document.body.dataset.fullscreenMode;
  }
  async function exit(){
    wanted=false;apply(false);
    if(document.fullscreenElement){try{await document.exitFullscreen();}catch{/* The in-page layout is already restored. */}}
  }
  fullscreen.onclick=()=>{
    closeOptions();
    if(expanded){exit();return;}
    wanted=true;
    document.body.dataset.fullscreenMode='pending';
    // Keep requestFullscreen in the tap's activation context; CSS fallback also works on iPhone.
    let request;
    try{request=document.documentElement.requestFullscreen?.({navigationUI:'hide'});}catch{}
    apply(true);
    Promise.resolve(request).then(()=>{
      if(!wanted&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});
      if(wanted)document.body.dataset.fullscreenMode=document.fullscreenElement?'native':'fallback';
    }).catch(()=>{if(wanted)document.body.dataset.fullscreenMode='fallback';});
  };
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement){apply(true);return;}
    lastNativeExit=Date.now();wanted=false;apply(false);
  });
  options.onclick=()=>{panel.hidden=!panel.hidden;options.setAttribute('aria-expanded',String(!panel.hidden));};
  $('close-map-options').onclick=()=>{closeOptions();options.focus();};
  document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!options.contains(e.target))closeOptions();});
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||$('info-dialog').open)return;
    if(!panel.hidden){e.preventDefault();e.stopImmediatePropagation();closeOptions();options.focus();return;}
    if(expanded||Date.now()-lastNativeExit<300){e.preventDefault();e.stopImmediatePropagation();exit();fullscreen.focus();}
  },true);
  return {closeOptions,resize};
}
