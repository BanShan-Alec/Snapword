import type { AppRuntimeEnv } from '../types/env';

export const APP_ENV_ARG_PREFIX = '--app-meta=';

/**
 * 将 Uint8Array 编码为 URL 安全且无 padding 的 Base64URL 字符串
 * 纯标准实现，在 Node.js 和浏览器/Preload 沙箱中通用
 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 将 Base64URL 字符串还原为 Uint8Array
 */
function fromBase64Url(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 将运行时环境变量序列化为 JSON 并转为 Base64URL 字符串
 * 采用结构化 JSON 编码，规避定长元组位置偏移，字段扩展天然前向兼容
 */
export function packRuntimeEnv(env: AppRuntimeEnv): string {
  const jsonStr = JSON.stringify(env);
  const bytes = new TextEncoder().encode(jsonStr);
  return toBase64Url(bytes);
}

/**
 * 从 Base64URL 字符串逆向反序列化还原 AppRuntimeEnv 对象
 */
export function unpackRuntimeEnv(encodedStr: string): AppRuntimeEnv {
  const bytes = fromBase64Url(encodedStr);
  const jsonStr = new TextDecoder().decode(bytes);
  return JSON.parse(jsonStr) as AppRuntimeEnv;
}
