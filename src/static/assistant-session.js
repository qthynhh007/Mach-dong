export class AssistantSession {
  constructor(historyLimit=8) {
    this.limit=Number.isFinite(historyLimit) ? Math.min(8,Math.max(0,Math.floor(historyLimit/2)*2)) : 8;
    this.history=[];this.request=null;this.closed=false;
  }
  begin() {
    if(this.closed || this.request) return null;
    this.request=new AbortController();return this.request;
  }
  isCurrent(controller) {return Boolean(controller) && !this.closed && this.request===controller && !controller.signal.aborted;}
  commit(controller,message,reply) {
    if(!this.isCurrent(controller)) return false;
    this.history.push({role:"user",text:message},{role:"model",text:reply});
    while(this.history.length>this.limit) this.history.splice(0,2);
    return true;
  }
  finish(controller) {if(this.request===controller) this.request=null;}
  cancel() {this.request?.abort();this.request=null;}
  reset() {this.cancel();this.history.length=0;}
  end() {this.reset();this.closed=true;}
}
