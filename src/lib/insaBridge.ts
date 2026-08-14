import {appConfig} from '../config';

export const INSA_BRIDGE_ORIGIN = appConfig.insa.origin;
export const INSA_BRIDGE_READY = 'insa-bridge-ready';
export const INSA_BRIDGE_REQUEST = 'insa-bridge-request';
export const INSA_BRIDGE_RESPONSE = 'insa-bridge-response';

const SUPPORTED_PATHS = Object.values(appConfig.insa.paths);
const REQUEST_TIMEOUT_MS = 30_000;

export interface InsaBridgeRequestMessage {
  type: typeof INSA_BRIDGE_REQUEST;
  requestId: string;
  path: string;
  method: 'GET' | 'POST';
  body?: string;
}

export interface InsaBridgeResponseMessage {
  type: typeof INSA_BRIDGE_RESPONSE;
  requestId: string;
  ok: boolean;
  status: number;
  body?: string;
  error?: string;
}

export function isSupportedInsaBridgePath(path: string): boolean {
  try {
    const url = new URL(path, INSA_BRIDGE_ORIGIN);
    return url.origin === INSA_BRIDGE_ORIGIN && SUPPORTED_PATHS.includes(url.pathname);
  } catch {
    return false;
  }
}

function serializeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return {...headers};
}

export class InsaBridgeClient {
  private readonly popup: Window;
  private readonly appOrigin: string;
  private readonly pending = new Map<string, {
    resolve: (body: string) => void;
    reject: (reason?: unknown) => void;
    timer: number;
  }>();
  private sequence = 0;
  private ready = false;
  private readonly handleMessageBound: (event: MessageEvent) => void;
  private readonly onReady?: () => void;

  constructor(popup: Window, appOrigin: string = window.location.origin, onReady?: () => void) {
    this.popup = popup;
    this.appOrigin = appOrigin;
    this.onReady = onReady;
    this.handleMessageBound = (event) => this.handleMessage(event);
    window.addEventListener('message', this.handleMessageBound);
  }

  get isReady(): boolean {
    return this.ready;
  }

  request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<string> {
    if (!isSupportedInsaBridgePath(path)) {
      return Promise.reject(new Error('지원하지 않는 인사시스템 요청입니다.'));
    }
    if (!this.ready) return Promise.reject(new Error('인사시스템 연결을 기다리는 중입니다.'));
    if (this.popup.closed) return Promise.reject(new Error('인사시스템 창이 닫혔습니다.'));
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

    const requestId = `insa-${Date.now()}-${this.sequence + 1}`;
    this.sequence += 1;
    const method = init.method === 'POST' ? 'POST' : 'GET';
    const message: InsaBridgeRequestMessage = {
      type: INSA_BRIDGE_REQUEST,
      requestId,
      path,
      method,
      body: typeof init.body === 'string' ? init.body : undefined,
    };

    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('인사시스템 응답 시간이 초과되었습니다.'));
      }, REQUEST_TIMEOUT_MS);
      const abort = (): void => {
        window.clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, {once: true});
      this.pending.set(requestId, {resolve, reject, timer});
      try {
        this.popup.postMessage({
          ...message,
          headers: serializeHeaders(init.headers),
        }, INSA_BRIDGE_ORIGIN);
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
      reject(new Error('인사시스템 연결이 종료되었습니다.'));
    });
    this.pending.clear();
    this.ready = false;
  }

  private handleMessage(event: MessageEvent): void {
    if (event.origin !== INSA_BRIDGE_ORIGIN || event.source !== this.popup) return;
    const data = event.data as {
      type?: string;
      version?: number;
      requestId?: string;
      ok?: boolean;
      status?: number;
      body?: string;
      error?: string;
    };
    if (data.type === INSA_BRIDGE_READY && data.version === 1) {
      this.ready = true;
      this.onReady?.();
      return;
    }
    if (data.type !== INSA_BRIDGE_RESPONSE || typeof data.requestId !== 'string') return;

    const request = this.pending.get(data.requestId);
    if (!request) return;
    this.pending.delete(data.requestId);
    window.clearTimeout(request.timer);
    if (data.ok) request.resolve(data.body ?? '');
    else request.reject(new Error(data.error || `HTTP ${data.status ?? 0}`));
  }
}

export function createInsaBookmarklet(appOrigin: string): string {
  const script = `(function(){var A=${JSON.stringify(appOrigin)},O=${JSON.stringify(INSA_BRIDGE_ORIGIN)},R=${JSON.stringify(INSA_BRIDGE_READY)},Q=${JSON.stringify(INSA_BRIDGE_REQUEST)},S=${JSON.stringify(INSA_BRIDGE_RESPONSE)},M='__insaBridgeInstalled__',P=window.opener;if(location.origin!==O){alert('인사시스템 페이지에서 실행해 주세요.');return}if(!P){alert('우리 앱에서 인사시스템을 연 뒤 실행해 주세요.');return}var send=function(m){P.postMessage(m,A)};if(!window[M]){window[M]=true;window.addEventListener('message',function(e){if(e.origin!==A||e.source!==P||!e.data||e.data.type!==Q)return;var d=e.data,u;try{u=new URL(d.path,location.origin)}catch(_){return}if(u.origin!==location.origin||${JSON.stringify(SUPPORTED_PATHS)}.indexOf(u.pathname)<0)return;var i={method:d.method==='POST'?'POST':'GET',credentials:'include',cache:'no-store'};if(i.method==='POST'){i.headers={'Content-Type':'application/x-www-form-urlencoded'};i.body=d.body||''}fetch(u.pathname+u.search,i).then(function(r){return r.arrayBuffer().then(function(b){var t=new TextDecoder('euc-kr').decode(b);send({type:S,requestId:d.requestId,ok:r.ok,status:r.status,body:t})})}).catch(function(err){send({type:S,requestId:d.requestId,ok:false,status:0,error:String(err)})})})}send({type:R,version:1})})()`;
  return `javascript:${script}`;
}
