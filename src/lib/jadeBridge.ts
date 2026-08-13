export const JADE_BRIDGE_ORIGIN = 'https://ehr.jadehr.co.kr';
export const JADE_APP_WINDOW_NAME = 'jade-in-out-app';
export const JADE_BRIDGE_READY = 'jade-bridge-ready';
export const JADE_BRIDGE_BODY = 'jade-bridge-body';
export const JADE_BRIDGE_ATTENDANCE = 'jade-bridge-attendance';
export const JADE_BRIDGE_REQUEST = 'jade-bridge-request';
export const JADE_BRIDGE_RESPONSE = 'jade-bridge-response';

const JADE_REQUEST_PATH = '/commonAction.do';
const REQUEST_TIMEOUT_MS = 30_000;

export interface JadeBridgeTransport {
  post: (path: string, body: string, signal?: AbortSignal) => Promise<string>;
}

export function isJadeAttendanceResponse(text: string): boolean {
  return ['YMD', 'EMP_ID', 'WORK_TYPE_NM'].every((key) => (
    new RegExp(`<ETC\\b[^>]*\\bKEY\\s*=\\s*["']${key}["']`, 'i').test(text)
  ));
}

export function createJadeBookmarklet(appOrigin: string): string {
  const script = [
    `(function(){var A=${JSON.stringify(appOrigin)},O=${JSON.stringify(JADE_BRIDGE_ORIGIN)},R=${JSON.stringify(JADE_BRIDGE_READY)},B=${JSON.stringify(JADE_BRIDGE_BODY)},D=${JSON.stringify(JADE_BRIDGE_ATTENDANCE)},Q=${JSON.stringify(JADE_BRIDGE_REQUEST)},S=${JSON.stringify(JADE_BRIDGE_RESPONSE)},T=${JSON.stringify(JADE_REQUEST_PATH)},N=${JSON.stringify(JADE_APP_WINDOW_NAME)},M='__jadeBridgeInstalled_v4__',P=window.opener||window.open('',N);console.info('[jade-bridge] bookmarklet-start',{origin:location.origin,opener:!!window.opener,appWindow:!!P,installKey:M});`,
    `if(location.origin!==O){console.warn('[jade-bridge] wrong-origin',location.origin);alert('Open this bookmarklet on the Jade system page.');return}if(!P){console.warn('[jade-bridge] no-app-window');alert('The Jade system tab must be opened from this app.');return}`,
    `var send=function(m){P.postMessage(m,'*')},isTarget=function(url){try{return !!url&&new URL(url,location.origin).pathname===T}catch(_){return false}},isAttendance=function(text){return typeof text==='string'&&text.indexOf('KEY="YMD"')>=0&&text.indexOf('KEY="EMP_ID"')>=0&&text.indexOf('KEY="WORK_TYPE_NM"')>=0},report=function(body){if(typeof body==='string'&&body)send({type:B,body:body})},reportAttendance=function(body,response){var matched=!!body&&isAttendance(response);console.info('[jade-bridge] response-seen',{matched:matched,bodyLength:body?body.length:0,responseLength:typeof response==='string'?response.length:0});if(matched)send({type:D,body:body,response:response})};`,
    `if(window[M]){send({type:R,version:1});return}window[M]=true;`,
    `var originalOpen=XMLHttpRequest.prototype.open,originalSend=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(method,url){this.__jadePath=String(url);return originalOpen.apply(this,arguments)};XMLHttpRequest.prototype.send=function(body){var currentBody=typeof body==='string'?body:'';if(isTarget(this.__jadePath)){console.info('[jade-bridge] xhr-request',this.__jadePath);report(currentBody);this.addEventListener('load',function(){try{reportAttendance(currentBody,this.responseText)}catch(_){}})}return originalSend.apply(this,arguments)};`,
    `var originalFetch=window.fetch;if(originalFetch){window.fetch=function(input,init){var url=typeof input==='string'?input:input&&input.url,body=init&&typeof init.body==='string'?init.body:'',tracked=isTarget(url);if(tracked){console.info('[jade-bridge] fetch-request',url);report(body)}return originalFetch.apply(this,arguments).then(function(response){if(!tracked)return response;try{return response.clone().text().then(function(text){reportAttendance(body,text);return response}).catch(function(){return response})}catch(_){return response}})}}`,
    `window.addEventListener('message',function(e){if(e.source!==P||!e.data||e.data.type!==Q)return;console.info('[jade-bridge] app-request',e.data.requestId);var d=e.data,u;try{u=new URL(d.path,location.origin)}catch(_){return}if(u.origin!==location.origin||u.pathname!==T)return;var requestFetch=originalFetch||window.fetch;requestFetch.call(window,u.pathname+u.search,{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'},body:d.body||''}).then(function(r){return r.text().then(function(t){send({type:S,requestId:d.requestId,ok:r.ok,status:r.status,body:t})})}).catch(function(err){send({type:S,requestId:d.requestId,ok:false,status:0,error:String(err)})})});`,
    `var hookFrame=function(target,label){try{if(!target||target[M])return;target[M]=true;var X=target.XMLHttpRequest;if(X&&X.prototype){var frameOpen=X.prototype.open,frameSend=X.prototype.send;X.prototype.open=function(method,url){this.__jadePath=String(url);return frameOpen.apply(this,arguments)};X.prototype.send=function(body){var currentBody=typeof body==='string'?body:'';if(isTarget(this.__jadePath)){console.info('[jade-bridge] xhr-request',label,this.__jadePath);report(currentBody);this.addEventListener('load',function(){try{reportAttendance(currentBody,this.responseText)}catch(_){}})}return frameSend.apply(this,arguments)}}var frameFetch=target.fetch;if(frameFetch){target.fetch=function(input,init){var url=typeof input==='string'?input:input&&input.url,body=init&&typeof init.body==='string'?init.body:'',tracked=isTarget(url);if(tracked){console.info('[jade-bridge] fetch-request',label,url);report(body)}return frameFetch.apply(this,arguments).then(function(response){if(!tracked)return response;try{return response.clone().text().then(function(text){reportAttendance(body,text);return response}).catch(function(){return response})}catch(_){return response}})}}console.info('[jade-bridge] hooks-installed',label)}catch(error){console.warn('[jade-bridge] hooks-failed',label,String(error))}};for(var i=0;i<window.frames.length;i++){try{hookFrame(window.frames[i],'frame-'+i)}catch(error){console.warn('[jade-bridge] frame-scan-failed',i,String(error))}}window.setInterval(function(){for(var i=0;i<window.frames.length;i++){try{hookFrame(window.frames[i],'frame-'+i)}catch(error){}}},1000);`,
    `send({type:R,version:1})})()`,
  ].join('');
  return `javascript:${script}`;
}

interface JadeBridgeResponse {
  type?: string;
  version?: number;
  body?: string;
  response?: string;
  requestId?: string;
  ok?: boolean;
  status?: number;
  error?: string;
}

export class JadeBridgeClient implements JadeBridgeTransport {
  private readonly tab: Window;
  private readonly appOrigin: string;
  private readonly onReady?: () => void;
  private readonly onBody?: (body: string) => void;
  private readonly onAttendance?: (body: string, response: string) => void;
  private readonly pending = new Map<string, {
    resolve: (body: string) => void;
    reject: (reason?: unknown) => void;
    timer: number;
  }>();
  private readonly handleMessageBound: (event: MessageEvent) => void;
  private sequence = 0;
  private ready = false;

  constructor(
    tab: Window,
    appOrigin: string = window.location.origin,
    onReady?: () => void,
    onBody?: (body: string) => void,
    onAttendance?: (body: string, response: string) => void,
  ) {
    this.tab = tab;
    this.appOrigin = appOrigin;
    this.onReady = onReady;
    this.onBody = onBody;
    this.onAttendance = onAttendance;
    this.handleMessageBound = (event) => this.handleMessage(event);
    window.addEventListener('message', this.handleMessageBound);
  }

  get isReady(): boolean {
    return this.ready;
  }

  post(path: string, body: string, signal?: AbortSignal): Promise<string> {
    if (path !== JADE_REQUEST_PATH) return Promise.reject(new Error('Unsupported Jade request'));
    if (!this.ready) return Promise.reject(new Error('Waiting for the Jade system connection'));
    if (this.tab.closed) return Promise.reject(new Error('The Jade system tab is closed'));
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

    const requestId = `jade-${Date.now()}-${this.sequence + 1}`;
    this.sequence += 1;
    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('The Jade system response timed out'));
      }, REQUEST_TIMEOUT_MS);
      const abort = (): void => {
        window.clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, {once: true});
      this.pending.set(requestId, {resolve, reject, timer});
      try {
        this.tab.postMessage({
          type: JADE_BRIDGE_REQUEST,
          requestId,
          path,
          method: 'POST',
          body,
        }, JADE_BRIDGE_ORIGIN);
      } catch (error) {
        window.clearTimeout(timer);
        this.pending.delete(requestId);
        signal?.removeEventListener('abort', abort);
        reject(error);
      }
    });
  }

  dispose(): void {
    window.removeEventListener('message', this.handleMessageBound);
    this.pending.forEach(({reject, timer}) => {
      window.clearTimeout(timer);
      reject(new Error('The Jade system connection ended'));
    });
    this.pending.clear();
    this.ready = false;
  }

  private handleMessage(event: MessageEvent): void {
    if (event.origin !== JADE_BRIDGE_ORIGIN || event.source !== this.tab) {
      console.warn('[jade-bridge] message-ignored', {
        origin: event.origin,
        sourceMatch: event.source === this.tab,
      });
      return;
    }
    const data = event.data as JadeBridgeResponse;
    console.info('[jade-bridge] app-received', {type: data.type, requestId: data.requestId});
    if (data.type === JADE_BRIDGE_READY && data.version === 1) {
      this.ready = true;
      this.onReady?.();
      return;
    }
    if (data.type === JADE_BRIDGE_BODY && typeof data.body === 'string') {
      this.onBody?.(data.body);
      return;
    }
    if (data.type === JADE_BRIDGE_ATTENDANCE && typeof data.body === 'string' && typeof data.response === 'string') {
      this.onAttendance?.(data.body, data.response);
      return;
    }
    if (data.type !== JADE_BRIDGE_RESPONSE || typeof data.requestId !== 'string') return;
    const request = this.pending.get(data.requestId);
    if (!request) return;
    this.pending.delete(data.requestId);
    window.clearTimeout(request.timer);
    if (data.ok) request.resolve(data.body ?? '');
    else request.reject(new Error(data.error || `HTTP ${data.status ?? 0}`));
  }
}
