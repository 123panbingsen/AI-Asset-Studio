/**
 * EventBus —— 轻量全局事件总线，用于页面/系统间解耦通知。
 */
type Handler = (...args: any[]) => void;

class Bus {
  private map: { [k: string]: Handler[] } = {};

  on(evt: string, fn: Handler) {
    (this.map[evt] = this.map[evt] || []).push(fn);
  }

  off(evt: string, fn?: Handler) {
    if (!fn) { delete this.map[evt]; return; }
    const arr = this.map[evt];
    if (arr) this.map[evt] = arr.filter((f) => f !== fn);
  }

  emit(evt: string, ...args: any[]) {
    const arr = this.map[evt];
    if (arr) arr.slice().forEach((f) => f(...args));
  }
}

export const EventBus = new Bus();
