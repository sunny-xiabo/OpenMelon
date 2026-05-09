import { lazy } from 'react';

/**
 * 带自动重试的 lazy import 包装器。
 * 当模块加载失败时（网络抖动、HMR 失效等），会自动重试最多 maxRetries 次。
 * 如果重试全部失败，则刷新页面。
 */
export default function lazyWithRetry(importFn, maxRetries = 3) {
  return lazy(() => retryImport(importFn, maxRetries));
}

function retryImport(importFn, retries, delay = 1000) {
  return new Promise((resolve, reject) => {
    importFn()
      .then(resolve)
      .catch((error) => {
        if (retries <= 0) {
          // 所有重试都失败了，尝试清除缓存后刷新
          console.error('模块加载失败，即将刷新页面:', error);
          // 避免无限刷新循环
          const lastReload = sessionStorage.getItem('_lazy_reload_ts');
          const now = Date.now();
          if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
            sessionStorage.setItem('_lazy_reload_ts', now.toString());
            window.location.reload();
          }
          reject(error);
          return;
        }
        console.warn(`模块加载失败，${delay}ms 后重试 (剩余 ${retries} 次):`, error?.message);
        setTimeout(() => {
          retryImport(importFn, retries - 1, delay * 1.5)
            .then(resolve)
            .catch(reject);
        }, delay);
      });
  });
}
