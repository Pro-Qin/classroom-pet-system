import { onMounted, onUnmounted, ref } from 'vue';

/**
 * 顶栏毛玻璃渐变：页面顶部时无模糊，向下滚动逐渐增强到满模糊（0 → 20px）。
 * 用法：const { headerEl } = useFrostHeader();  <header :ref="headerEl">
 */
export function useFrostHeader() {
  const headerEl = ref<HTMLElement | undefined>(undefined);
  let raf = 0;

  function update(): void {
    const el = headerEl.value;
    if (!el) return;
    const y = window.scrollY;
    const t = Math.min(1, Math.max(0, y / 150));
    const blur = Math.round(20 * t);
    el.style.backdropFilter = `blur(${blur}px)`;
    el.style.backgroundColor = `rgba(11, 16, 38, ${(0.72 * t).toFixed(3)})`;
    el.style.borderBottomColor = `rgba(255, 255, 255, ${(0.1 * t).toFixed(3)})`;
  }

  function onScroll(): void {
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      update();
    });
  }

  onMounted(() => {
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
  });
  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll);
    if (raf) cancelAnimationFrame(raf);
  });

  return { headerEl };
}