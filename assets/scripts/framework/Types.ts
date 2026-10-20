/**
 * Types —— 页面上下文 PageCtx 等共享类型定义。
 */
import { Node } from 'cc';

export interface PageCtx {
  root: Node;
  go: (page: string, data?: any) => void;
  popup: (node: Node) => void;
  close: () => void;
  toast: (msg: string) => void;
  refresh?: () => void;
}
