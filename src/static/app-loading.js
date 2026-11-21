(() => {
  const root=document.documentElement;
  root.classList.add("app-booting");
  let bootTimer, taskTimer, taskCount=0, indicator;
  const finishBoot=()=>{root.classList.remove("app-booting","app-navigating");root.classList.add("app-ready");clearTimeout(bootTimer);};
  bootTimer=setTimeout(finishBoot,8000);
  window.addEventListener("load",finishBoot,{once:true});
  window.addEventListener("pageshow",finishBoot);
  function taskStarted() {
    taskCount++;
    if(!taskTimer) taskTimer=setTimeout(()=>{taskTimer=null; if(taskCount) {root.classList.add("app-task-pending");if(indicator) indicator.hidden=false;}},180);
  }
  function taskFinished() {
    taskCount=Math.max(0,taskCount-1);
    if(!taskCount) {clearTimeout(taskTimer);taskTimer=null;root.classList.remove("app-task-pending");if(indicator) indicator.hidden=true;}
  }
  const originalFetch=window.fetch;
  window.fetch=async function(...args) {
    taskStarted();
    try {return await originalFetch.apply(this,args);}
    finally {taskFinished();}
  };
  document.addEventListener("DOMContentLoaded",()=>{
    indicator=document.createElement("div"); indicator.className="app-task-loading"; indicator.hidden=true;
    indicator.setAttribute("role","status"); indicator.setAttribute("aria-live","polite");
    const spinner=document.createElement("span"); spinner.className="app-wait-spinner"; spinner.setAttribute("aria-hidden","true");
    const label=document.createElement("span"); label.textContent="Đang xử lý, bà con chờ chút nha…";
    indicator.append(spinner,label); document.body.append(indicator);
    if(document.readyState === "complete") finishBoot();
    document.addEventListener("click",event=>{
      const link=event.target.closest?.("a[href]");
      if(event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !link || link.download || (link.target && link.target !== "_self") || link.hasAttribute("aria-haspopup")) return;
      const url=new URL(link.href,location.href);
      if(url.origin !== location.origin || url.href === location.href || (url.pathname===location.pathname && url.search===location.search && url.hash)) return;
      root.classList.add("app-navigating"); clearTimeout(bootTimer);bootTimer=setTimeout(finishBoot,8000);
    });
  });
})();
